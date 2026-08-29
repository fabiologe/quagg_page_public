/**
 * PdfExporter — Burn-in-Export: lädt die ORIGINAL-Bytes (Vektorinhalt und
 * Text bleiben vollständig erhalten), zeichnet alle Annotationen als Vektor
 * über DIESELBE Painter-Routine wie der Bildschirm (PdfLibAnnotDoc) und
 * liefert die neuen Bytes. Kommentare werden als Pin eingebrannt und
 * optional als Übersichtsseite angehängt.
 */

import { PDFDocument, StandardFonts, PageSizes } from 'pdf-lib';
import { erstellePdfLibAnnotDoc } from './PdfLibAnnotDoc';
import { zeichneAnnotationen } from './AnnotationPainter';
import { kalibrierungFuerSeite } from './MeasureMath';

/**
 * @param {ArrayBuffer|Uint8Array} originalBytes
 * @param {Array} items                     alle Annotationen des Dokuments
 * @param {object|null} kalibrierung        docMeta.kalibrierung
 * @param {{kommentarSeite?: boolean, bilder?: Map<string,{bytes:Uint8Array,mime:string}>}} opts
 *   bilder: Bytes der eingefügten Bilder je bildKey (lädt der Aufrufer aus der Repo)
 * @returns {Promise<Uint8Array>}
 */
export async function exportiereMitAnnotationen(originalBytes, items, kalibrierung, opts = {}) {
    let doc;
    try {
        doc = await PDFDocument.load(originalBytes);
    } catch (e) {
        if (/encrypted/i.test(String(e?.message))) {
            // Viele „geschützte" PDFs sind nur mit Leererlaubnis verschlüsselt —
            // zweiter Versuch, bevor wir aufgeben.
            doc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
        } else {
            throw e;
        }
    }

    const font = await doc.embedFont(StandardFonts.Helvetica);
    const seiten = doc.getPages();
    // Eingefügte Bilder EINMAL je Key einbetten (embedPng/embedJpg sind
    // async, der Painter nicht) — die Bytes bringt der Aufrufer mit.
    const bilder = await _betteBilderEin(doc, items, opts.bilder);

    // Annotationen je Seite gruppieren
    const proSeite = new Map();
    for (const a of items) {
        if (a.page >= seiten.length) continue;   // Sicherheitsnetz
        let liste = proSeite.get(a.page);
        if (!liste) { liste = []; proSeite.set(a.page, liste); }
        liste.push(a);
    }

    const alleNotizen = [];   // { seite, nummer, text, erledigt }

    for (const [seitenIndex, seitenItems] of proSeite) {
        const adapter = erstellePdfLibAnnotDoc(seiten[seitenIndex], font, { bilder });
        zeichneAnnotationen(adapter, seitenItems, {
            ohneTypen: new Set(['note']),
            messKontext: kalibrierungFuerSeite(kalibrierung, seitenIndex),
        });
        // Notiz-Pins: am Bildschirm HTML, im Export als Kreis + Nummer.
        const notizen = seitenItems
            .filter(a => a.type === 'note')
            .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
        notizen.forEach((n, i) => {
            const nummer = i + 1;
            adapter.kreis(n.x, n.y, 6, { fuellFarbe: n.farbe ?? '#d97706' });
            adapter.textMitHalo(n.x, n.y, String(nummer), {
                groessePt: 7, farbe: '#ffffff', haloFarbe: n.farbe ?? '#d97706',
            });
            alleNotizen.push({
                seite: seitenIndex + 1, nummer,
                text: n.text ?? '', erledigt: !!n.erledigt,
            });
        });
    }

    if (opts.kommentarSeite && alleNotizen.length) {
        _haengeKommentarSeiteAn(doc, font, alleNotizen);
    }

    return doc.save();
}

/** Schlichte Übersichtsseite: „Seite N, Kommentar M: Text", umgebrochen. */
function _haengeKommentarSeiteAn(doc, font, notizen) {
    const RAND = 56, GROESSE = 11, ZEILE = 16;
    let page = doc.addPage(PageSizes.A4);
    let y = page.getHeight() - RAND;

    const schreibe = (text, groesse = GROESSE, einzug = 0) => {
        if (y < RAND) { page = doc.addPage(PageSizes.A4); y = page.getHeight() - RAND; }
        page.drawText(text, { x: RAND + einzug, y, size: groesse, font });
        y -= ZEILE;
    };

    schreibe('Kommentare', 16);
    y -= 8;

    const maxBreite = page.getWidth() - 2 * RAND - 12;
    for (const n of notizen) {
        schreibe(`Seite ${n.seite} - Kommentar ${n.nummer}${n.erledigt ? ' (erledigt)' : ''}:`, GROESSE);
        const woerter = (n.text || '(ohne Text)').split(/\s+/);
        let zeile = '';
        for (const wort of woerter) {
            const test = zeile ? `${zeile} ${wort}` : wort;
            if (font.widthOfTextAtSize(test, GROESSE) > maxBreite && zeile) {
                schreibe(zeile, GROESSE, 12);
                zeile = wort;
            } else {
                zeile = test;
            }
        }
        if (zeile) schreibe(zeile, GROESSE, 12);
        y -= 6;
    }
}

/**
 * Bilder der `bild`-Annotationen einbetten — je Key genau einmal.
 * @param {Map<string, {bytes: Uint8Array, mime: string}>|null|undefined} quellen
 * @returns {Promise<Map<string, import('pdf-lib').PDFImage>>}
 */
async function _betteBilderEin(doc, items, quellen) {
    const bilder = new Map();
    if (!quellen) return bilder;
    for (const a of items) {
        if (a.type !== 'bild' || bilder.has(a.bildKey)) continue;
        const q = quellen.get(a.bildKey);
        if (!q?.bytes) { console.warn(`[pdfed] Bild ${a.bildKey} fehlt beim Export — bleibt leer.`); continue; }
        try {
            const img = q.mime === 'image/jpeg'
                ? await doc.embedJpg(q.bytes)
                : await doc.embedPng(q.bytes);
            bilder.set(a.bildKey, img);
        } catch (e) {
            console.warn(`[pdfed] Bild ${a.bildKey} ließ sich nicht einbetten:`, e);
        }
    }
    return bilder;
}

/** Uint8Array → Download über einen unsichtbaren Link. */
export function ladeHerunter(bytes, dateiname) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = dateiname;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Speichern über den System-Dialog (File System Access API, Chromium/Edge).
 * `startIn` ist das Herkunfts-Handle der Originaldatei — damit öffnet der
 * Dialog direkt in DEREN Ordner statt im Downloads-Standard. Ohne Picker-
 * Unterstützung (Firefox/Safari) fällt es auf den normalen Download zurück.
 *
 * @returns {'gespeichert'|'download'|'abgebrochen'}
 */
export async function speichereMitPicker(bytes, dateiname, { picker, startIn = null } = {}) {
    const zeige = picker
        ?? (typeof window !== 'undefined' && window.showSaveFilePicker
            ? (o) => window.showSaveFilePicker(o)
            : null);
    if (!zeige) {
        ladeHerunter(bytes, dateiname);
        return 'download';
    }
    const optionen = {
        suggestedName: dateiname,
        types: [{ description: 'PDF-Datei', accept: { 'application/pdf': ['.pdf'] } }],
    };
    let ziel = null;
    try {
        ziel = await zeige(startIn ? { ...optionen, startIn } : optionen);
    } catch (e) {
        if (e?.name === 'AbortError') return 'abgebrochen';
        if (!startIn) throw e;
        // Verwaistes Handle (Datei verschoben/gelöscht) → Standardordner.
        try { ziel = await zeige(optionen); }
        catch (e2) {
            if (e2?.name === 'AbortError') return 'abgebrochen';
            throw e2;
        }
    }
    const schreiber = await ziel.createWritable();
    await schreiber.write(bytes);
    await schreiber.close();
    return 'gespeichert';
}

/** Teilen über das System-Share-Sheet (Edge/Windows, iPad), wenn verfügbar. */
export async function teile(bytes, dateiname) {
    const datei = new File([bytes], dateiname, { type: 'application/pdf' });
    if (!navigator.canShare?.({ files: [datei] })) return false;
    try {
        await navigator.share({ files: [datei], title: dateiname });
        return true;
    } catch {
        return false;   // Nutzer hat abgebrochen
    }
}

let _druckIframe = null;
let _druckUrl = null;

/**
 * Drucken über einen versteckten iframe. Der Rahmen bleibt STEHEN, bis der
 * nächste Druck ihn ersetzt — NIE auf Timer abräumen: Chrome bricht die
 * offene Druckvorschau ab, sobald ihre Quelle verschwindet (genau so
 * „schloss sich der Druckdialog nach einer Weile von selbst").
 * @returns {Promise<void>} aufgelöst, sobald die Vorschau geladen hat
 */
export function drucke(bytes) {
    return new Promise((resolve, reject) => {
        if (_druckIframe) { try { _druckIframe.remove(); } catch { /* */ } _druckIframe = null; }
        if (_druckUrl) { try { URL.revokeObjectURL(_druckUrl); } catch { /* */ } _druckUrl = null; }

        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.setAttribute('data-pdfed-druck', '');
        const timeout = setTimeout(() => {
            reject(new Error('Die Druckvorschau hat nicht geladen — bitte speichern und aus dem PDF-Viewer drucken.'));
        }, 15000);
        iframe.onload = () => {
            clearTimeout(timeout);
            resolve();   // der Dialog darf schließen — print() blockiert je nach Browser
            setTimeout(() => {
                try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
                catch { /* Viewer blockiert print — die Vorschau bleibt trotzdem offen */ }
            }, 50);
        };
        iframe.src = url;
        document.body.appendChild(iframe);
        _druckIframe = iframe;
        _druckUrl = url;
    });
}
