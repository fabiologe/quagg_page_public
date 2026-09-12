/**
 * useDocStore — das geöffnete Dokument und der Dokumentindex.
 *
 * Das PDF-Original liegt als Blob in der IndexedDB (PdfRepo); pdf.js bekommt
 * je Ladevorgang eine frische Buffer-Kopie (siehe PdfEngine-Kopfkommentar).
 * `pdfDok` ist bewusst ein shallowRef — der pdf.js-Proxy darf nicht reaktiv
 * durchwandert werden.
 */

import { defineStore } from 'pinia';
import { ref, shallowRef, computed } from 'vue';
import { repo } from '../services/PdfRepo';
import { oeffnePdf } from '../services/PdfEngine';
import { haengeLeereSeiteAn } from '../services/BlankPdf';
import { verwirfDokument } from '../services/SeitenBitmapCache';
import { vergiss as vergissRenderZeiten } from '../services/RenderProfil';
import { verwirfDokument as verwirfBilder, loescheBilder } from '../services/BildAblage';
import { klon } from '../composables/useCommandStack';
import { useViewStore } from './useViewStore';

const SCHEMA_VERSION = 1;

export const useDocStore = defineStore('pdfed-doc', () => {
    const viewStore = useViewStore();

    // ── Index („Zuletzt geöffnet") ──────────────────────────────────────────
    const dokIndex = ref([]);           // [{ id, name, seitenAnzahl, groesse, modifiedAt }]

    // ── Tabs (Browser-Muster) ───────────────────────────────────────────────
    // Nur das AKTIVE Dokument ist voll geladen (pdf.js-Instanz + Canvases
    // wiegen auf dem Tablet zu viel für mehrere Pläne gleichzeitig); ein
    // Tab-Wechsel lädt aus der IndexedDB nach und stellt die gemerkte
    // Ansicht (Zoom + oberste Seite) wieder her. Tabs überleben den Reload.
    const tabs = ref([]);               // [{ dokId, name, ansicht: {zoom, seite}|null }]
    const gewuenschteAnsicht = ref(null);   // konsumiert der Scroller nach dem Laden

    // ── PDF-Layer (OCGs, „AutoCAD-Layer") des aktiven Dokuments ─────────────
    const pdfLayer = ref([]);           // [{ id, name, sichtbar }] — leer ohne Layer
    const layerRevision = ref(0);       // bump → alle Seiten rendern neu

    // ── Geöffnetes Dokument ─────────────────────────────────────────────────
    const dokId = ref(null);
    const name = ref('');
    const meta = ref(null);             // persistiertes Meta-Objekt (inkl. Kalibrierung)
    const pdfDok = shallowRef(null);    // PdfDokument (PdfEngine)
    const seiten = ref([]);             // [{ breitePt, hoehePt }] je Seite
    const ladeStatus = ref('leer');     // 'leer' | 'laedt' | 'offen' | 'fehler'
    const ladeFehler = ref('');

    const istOffen = computed(() => ladeStatus.value === 'offen');
    const seitenAnzahl = computed(() => seiten.value.length);

    async function ladeIndex() {
        const liste = await repo.get('doc-index');
        dokIndex.value = Array.isArray(liste)
            ? [...liste].sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0))
            : [];
    }

    // Alles, was aus reaktivem Zustand in die IndexedDB geht, läuft über
    // klon(): Vue-Proxies sind nicht strukturiert klonbar, PdfRepo.set liefert
    // dann still false — Liste, Kalibrierung und Tab-Ansicht gingen so bis
    // 2026-09-12 beim Neuladen verloren (test/persistenz.test.js).
    async function _schreibeIndex() {
        await repo.set('doc-index', klon(dokIndex.value));
    }

    function _indexEintragAktualisieren(eintrag) {
        const rest = dokIndex.value.filter(e => e.id !== eintrag.id);
        dokIndex.value = [eintrag, ...rest];
    }

    /**
     * Neue Datei übernehmen: Blob + Meta in die Repo, Index ergänzen, öffnen.
     * @param {File|Blob} datei
     * @returns {Promise<string|null>} Dokument-ID oder null bei Fehler
     */
    let persistenzAngefragt = false;

    /**
     * @param {File|Blob} datei
     * @param {FileSystemFileHandle|null} [fileHandle] Herkunfts-Handle (Datei-
     *   Picker, Doppelklick über launchQueue, Drag&Drop in Chromium). Wird
     *   mitgespeichert, damit „Speichern" später im Ordner der Originaldatei
     *   startet. Handles sind structured-cloneable → IndexedDB-tauglich.
     */
    async function importiereDatei(datei, fileHandle = null) {
        // Safari räumt Origin-Speicher nach Inaktivität ab — einmalig um
        // dauerhaften Speicher bitten (installierte PWA ist ohnehin sicher).
        if (!persistenzAngefragt) {
            persistenzAngefragt = true;
            navigator.storage?.persist?.().catch(() => {});
        }
        const id = crypto.randomUUID();
        const dokName = (datei.name || 'Dokument.pdf').replace(/\.pdf$/i, '');
        const gespeichert = await repo.setBlob(`doc:${id}:file`, datei, {
            name: dokName, groesse: datei.size, addedAt: Date.now(),
        });
        if (!gespeichert) {
            ladeStatus.value = 'fehler';
            ladeFehler.value = 'Die Datei konnte nicht lokal gespeichert werden (Speicherplatz?).';
            return null;
        }
        await repo.set(`doc:${id}:meta`, {
            id, name: dokName, schemaVersion: SCHEMA_VERSION,
            createdAt: Date.now(), modifiedAt: Date.now(),
            seitenAnzahl: 0,
            kalibrierung: { standard: null, jeSeite: {} },
        });
        _indexEintragAktualisieren({
            id, name: dokName, seitenAnzahl: 0, groesse: datei.size, modifiedAt: Date.now(),
        });
        await _schreibeIndex();
        if (fileHandle) {
            // Nicht kritisch — Firefox/ältere Browser klonen Handles nicht.
            try { await repo.set(`doc:${id}:handle`, fileHandle); } catch { /* egal */ }
        }
        const ok = await oeffneDokument(id);
        return ok ? id : null;
    }

    // ── Tab-Verwaltung ──────────────────────────────────────────────────────

    async function _persistiereTabs() {
        await repo.set('tabs', klon({
            liste: tabs.value.map(t => ({ dokId: t.dokId, name: t.name, ansicht: t.ansicht ?? null })),
            aktiv: dokId.value,
        }));
    }

    /** Zoom + oberste Seite des aktiven Dokuments in seinen Tab schreiben. */
    function _merkeAnsicht() {
        const tab = tabs.value.find(t => t.dokId === dokId.value);
        if (tab) {
            tab.ansicht = {
                zoom: viewStore.zoom,
                seite: viewStore.sichtbareSeiten.von ?? 0,
                drehung: viewStore.drehung,
            };
        }
    }

    /** Tab an eine andere Position der Leiste schieben (Drag-Reorder). */
    async function verschiebeTab(id, zielIndex) {
        const von = tabs.value.findIndex(t => t.dokId === id);
        if (von < 0) return;
        const [tab] = tabs.value.splice(von, 1);
        // Nach dem Entnehmen rückt alles hinter `von` eins auf.
        const ziel = Math.max(0, Math.min(tabs.value.length, zielIndex > von ? zielIndex - 1 : zielIndex));
        tabs.value.splice(ziel, 0, tab);
        await _persistiereTabs();
    }

    /** Tab aktivieren (merkt vorher die Ansicht des aktuellen Dokuments). */
    async function wechsleTab(id) {
        if (id === dokId.value) return true;
        _merkeAnsicht();
        return oeffneDokument(id);
    }

    /** Zur Startseite („Neuer Tab") — offene Tabs bleiben erhalten. */
    async function zeigeStartseite() {
        _merkeAnsicht();
        await _persistiereTabs();
        await schliesseDokument();
    }

    /** Tab schließen; war er aktiv, übernimmt der rechte (sonst linke) Nachbar. */
    async function schliesseTab(id) {
        const index = tabs.value.findIndex(t => t.dokId === id);
        if (index === -1) return;
        tabs.value = tabs.value.filter(t => t.dokId !== id);
        if (dokId.value === id) {
            const nachbar = tabs.value[Math.min(index, tabs.value.length - 1)];
            if (nachbar) await oeffneDokument(nachbar.dokId);
            else await schliesseDokument();
        }
        await _persistiereTabs();
    }

    /**
     * Persistierte Tabs laden (nach ladeIndex — Tabs zu inzwischen
     * gelöschten Dokumenten fallen weg).
     * @returns {Promise<string|null>} die zuletzt aktive dokId oder null
     */
    async function ladeTabs() {
        const gespeichert = await repo.get('tabs');
        if (!Array.isArray(gespeichert?.liste)) return null;
        const vorhandene = new Set(dokIndex.value.map(e => e.id));
        tabs.value = gespeichert.liste.filter(t => vorhandene.has(t.dokId));
        return tabs.value.some(t => t.dokId === gespeichert.aktiv) ? gespeichert.aktiv : null;
    }

    /**
     * Dokument aus der Repo öffnen; legt seinen Tab an (oder aktiviert ihn).
     * @returns {Promise<boolean>}
     */
    async function oeffneDokument(id) {
        // Erst der Status, dann das Entladen — sonst blitzt zwischen zwei
        // Tabs für einen Frame die Startseite auf.
        ladeStatus.value = 'laedt';
        ladeFehler.value = '';
        await _entlade();
        try {
            const eintrag = await repo.getBlob(`doc:${id}:file`);
            if (!eintrag?.blob) {
                throw new Error('Dokument nicht gefunden — wurde es gelöscht?');
            }
            const dok = await oeffnePdf(eintrag.blob);
            const dokMeta = (await repo.get(`doc:${id}:meta`)) ?? {
                id, name: eintrag.meta?.name ?? 'Dokument',
                schemaVersion: SCHEMA_VERSION,
                kalibrierung: { standard: null, jeSeite: {} },
            };

            // Die gemerkte Ansicht MUSS stehen, BEVOR dokId/seiten bekannt
            // werden: der Scroller reagiert sofort darauf und passt sonst auf
            // Fit-Width ein — der Wunsch käme zu spät, Zoom und Drehung wären
            // verloren (Race, gefunden beim Tab-Rückwechsel 2026-08-24).
            gewuenschteAnsicht.value = tabs.value.find(t => t.dokId === id)?.ansicht ?? null;

            dokId.value = id;
            name.value = dokMeta.name;
            meta.value = dokMeta;
            pdfDok.value = dok;
            ladeStatus.value = 'offen';

            // PDF-Layer (OCGs) laden — leer bei Text-/Scan-PDFs.
            // Optional gerufen: gemockte Dokumente (Tests) haben die Methode nicht.
            dok.holeLayer?.().then((layer) => {
                if (pdfDok.value === dok) pdfLayer.value = layer;
            }).catch(() => { /* Dokument ohne lesbare Layer */ });

            // Seitenmaße stapelweise — das Layout steht sofort mit der Annahme
            // „alle Seiten wie Seite 1" und präzisiert sich dann.
            dok.ladeSeitenMasse((zwischenstand) => {
                if (pdfDok.value === dok) seiten.value = zwischenstand;
            }).catch(() => { /* Abbruch beim Schließen ist ok */ });

            dokMeta.seitenAnzahl = dok.seitenAnzahl;
            dokMeta.modifiedAt = Date.now();
            await repo.set(`doc:${id}:meta`, { ...dokMeta });
            _indexEintragAktualisieren({
                id, name: dokMeta.name, seitenAnzahl: dok.seitenAnzahl,
                groesse: eintrag.blob.size, modifiedAt: dokMeta.modifiedAt,
            });
            await _schreibeIndex();

            // Tab anlegen bzw. aktivieren (die gemerkte Ansicht wurde oben
            // schon bereitgelegt — hier wäre sie zu spät).
            let tab = tabs.value.find(t => t.dokId === id);
            if (!tab) {
                tab = { dokId: id, name: dokMeta.name, ansicht: null };
                tabs.value = [...tabs.value, tab];
            } else {
                tab.name = dokMeta.name;
            }
            await _persistiereTabs();
            return true;
        } catch (e) {
            ladeStatus.value = 'fehler';
            ladeFehler.value = /encrypted|password/i.test(String(e?.message))
                ? 'Diese PDF ist passwortgeschützt und kann nicht geöffnet werden.'
                : (e?.message || 'Die Datei konnte nicht geöffnet werden.');
            return false;
        }
    }

    /** Frische Buffer-Kopie des Originals — für den Export (pdf-lib). */
    async function holeOriginalBytes() {
        if (!dokId.value) return null;
        const eintrag = await repo.getBlob(`doc:${dokId.value}:file`);
        return eintrag?.blob ? await eintrag.blob.arrayBuffer() : null;
    }

    /**
     * „+ Seite": leere Seite im Format der letzten anhängen. Ersetzt das
     * Original in der Repo und lädt das pdf.js-Dokument neu — Annotationen
     * bleiben unberührt (Seitenindizes ändern sich nicht). Bewusst NICHT im
     * Annotations-Undo: das ist Dokumentstruktur, kein Markup.
     */
    async function fuegeSeiteAn() {
        const id = dokId.value;
        if (!id) return false;
        const eintrag = await repo.getBlob(`doc:${id}:file`);
        if (!eintrag?.blob) return false;
        try {
            const bytes = await haengeLeereSeiteAn(await eintrag.blob.arrayBuffer());
            const blob = new Blob([bytes], { type: 'application/pdf' });
            await repo.setBlob(`doc:${id}:file`, blob, { ...eintrag.meta, groesse: blob.size });
            verwirfDokument(id);
            vergissRenderZeiten(id);

            const dok = await oeffnePdf(blob);
            const alt = pdfDok.value;
            pdfDok.value = dok;
            if (alt) alt.schliesse();
            await dok.ladeSeitenMasse((zwischenstand) => {
                if (pdfDok.value === dok) seiten.value = zwischenstand;
            });

            if (meta.value) {
                meta.value.seitenAnzahl = dok.seitenAnzahl;
                await speichereMeta();
            }
            _indexEintragAktualisieren({
                id, name: name.value, seitenAnzahl: dok.seitenAnzahl,
                groesse: blob.size, modifiedAt: Date.now(),
            });
            await _schreibeIndex();
            return true;
        } catch {
            return false;
        }
    }

    /** Aktives Dokument entladen, OHNE den Ladestatus anzufassen. */
    async function _entlade() {
        const dok = pdfDok.value;
        // Bild-Bitmaps und Object-URLs des Dokuments freigeben (Stufe 16)
        if (dokId.value) verwirfBilder(dokId.value);
        pdfDok.value = null;
        dokId.value = null;
        name.value = '';
        meta.value = null;
        seiten.value = [];
        pdfLayer.value = [];
        if (dok) await dok.schliesse();
    }

    /**
     * PDF-Layer ein-/ausblenden: mutiert die OCG-Config des Dokuments,
     * verwirft gecachte Bitmaps und Renderzeit-Messungen (mit weniger
     * Layern rendert die Seite anders UND schneller) und stößt über die
     * Revision den Neu-Render aller lebendigen Seiten an.
     */
    function setzeLayerSichtbar(id, sichtbar) {
        const dok = pdfDok.value;
        if (!dok || !dokId.value) return;
        dok.setzeLayerSichtbar(id, sichtbar);
        pdfLayer.value = pdfLayer.value.map(l =>
            l.id === id ? { ...l, sichtbar } : l);
        verwirfDokument(dokId.value);
        vergissRenderZeiten(dokId.value);
        layerRevision.value++;
    }

    async function schliesseDokument() {
        await _entlade();
        ladeStatus.value = 'leer';
        ladeFehler.value = '';
    }

    /** Dokument samt Blob, Meta, Annotationen und Tab entfernen. */
    /** Herkunfts-Handle des AKTIVEN Dokuments (oder null) — für „Speichern". */
    async function holeDateiHandle() {
        if (!dokId.value) return null;
        try { return (await repo.get(`doc:${dokId.value}:handle`)) ?? null; }
        catch { return null; }
    }

    async function loescheDokument(id) {
        if (dokId.value === id) await schliesseDokument();
        verwirfDokument(id);
        vergissRenderZeiten(id);
        tabs.value = tabs.value.filter(t => t.dokId !== id);
        await _persistiereTabs();
        await repo.deleteBlob(`doc:${id}:file`);
        await loescheBilder(id);   // alle Bild-Blobs des Präfixes doc:<id>:bild:
        await repo.delete(`doc:${id}:meta`);
        await repo.delete(`doc:${id}:annotations`);
        await repo.delete(`doc:${id}:handle`);
        dokIndex.value = dokIndex.value.filter(e => e.id !== id);
        await _schreibeIndex();
    }

    /** Meta-Änderungen (z. B. Kalibrierung) persistieren. */
    async function speichereMeta() {
        if (!dokId.value || !meta.value) return;
        meta.value.modifiedAt = Date.now();
        await repo.set(`doc:${dokId.value}:meta`, klon(meta.value));
    }

    return {
        dokIndex, dokId, name, meta, pdfDok, seiten, seitenAnzahl,
        ladeStatus, ladeFehler, istOffen,
        tabs, gewuenschteAnsicht, pdfLayer, layerRevision,
        ladeIndex, importiereDatei, oeffneDokument, schliesseDokument,
        loescheDokument, speichereMeta, holeOriginalBytes, fuegeSeiteAn, holeDateiHandle,
        wechsleTab, schliesseTab, verschiebeTab, zeigeStartseite, ladeTabs, setzeLayerSichtbar,
    };
});
