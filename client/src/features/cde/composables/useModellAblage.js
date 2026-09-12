/**
 * Modelle laden und lokal ablegen (Sprint I, Stufe 5).
 *
 * Herausgelöst aus `IfcViewer.vue`, wo Dateiladen, IndexedDB-Ablage und die
 * Liste „zuletzt geöffnet" zwischen Schnitt, Messen und Tastatur lagen. Der
 * sauberste Schnitt der Vue-Seite: keine dieser Funktionen wird von einem
 * anderen Belang gelesen.
 *
 * Hausstil wie `composables/useScreenProjection.js` und
 * `flood-2D/composables/useSectionTool.js`: ein Optionsobjekt mit
 * destrukturierten Abhängigkeiten, Rückgabe ein flaches Objekt aus Refs UND
 * Handlern, Inhalt deutsch. **Composable = Verhalten, Store = Zustand.**
 *
 * Zwei Dinge bleiben bewusst HIER und wandern nicht in den Store:
 *
 *   `recentModels` ist ein Abbild von `repo.listBlobs('model:')` — abgeleitet,
 *   nicht gehalten. Im Store läge eine zweite Wahrheit neben der Ablage.
 *
 *   `_modelIdentity` schlüsselt auf `model.modelId`, und die vergibt die
 *   Engine je Sitzung neu. Persistiert wäre die Karte nach dem Neuladen voller
 *   toter Einträge.
 */

import { ref } from 'vue';
import { fehlerLesbar, repo } from '../services/RepoFacade.js';
import { computeModelIdentity, kopfAblehnung } from '../services/ModelIdentity.js';

/** Wie viele Modelle die lokale Ablage höchstens behält. */
const MAX_RECENT_MODELS = 5;

/**
 * Was beim letzten Mal offen WAR — die Sitzung des Viewers (2026-09-03).
 *
 * Bewusst getrennt von `recentModels`: das ist die Ablage, sortiert nach
 * letzter Benutzung. Wer zwei Modelle nebeneinander offen hatte, will beide
 * zurück, nicht das zuletzt angefasste. Gespeichert werden nur KENNUNGEN
 * (sha256 + Name) — die Bytes liegen ohnehin in der Ablage.
 */
export const REPO_KEY_OFFEN = 'zuletzt-offene-modelle';

/**
 * Die LESART je Datei (2026-09-07): „diese Datei wird in Metern gelesen".
 *
 * Die Umrechnung war bis hierher eine Lade-OPTION — nur `ladeInMeterNeu`
 * setzte sie, jeder andere Ladeweg (Ablage, Register, Deep-Link,
 * Wiederherstellen) lud wieder Millimeter, und das Banner kam zurück. Die
 * Entscheidung stand nirgends. Jetzt steht sie hier, je Prüfsumme des
 * ORIGINALS — die überlebt Ablage, Register und Wiederherstellen.
 *
 * Dazu die ABGELEITETEN Bytes, damit ein Start nicht jedes Mal drei Sekunden
 * umrechnet und anderthalb importiert:
 *   meter:<sha>      die umgerechneten IFC-Bytes
 *   frag:<sha>[:m]   die Fragmentdatei des Importers (aus Original / aus Metern)
 * Andere Präfixe als `model:` — sonst stünden sie in „Zuletzt geöffnet".
 * Sie hängen am Original: wird das gelöscht oder verdrängt, gehen sie mit.
 */
export const REPO_KEY_LESART = 'einheiten-lesart';

export function useModellAblage({ engine, ifc, cde, onModelLoaded }) {
    /** Läuft gerade ein Ladevorgang? Sperrt die Knöpfe und zeigt den Schleier. */
    const loading = ref(false);
    /** [{ key, meta, size }] aus der lokalen Ablage, neueste zuerst. */
    const recentModels = ref([]);
    /** Meldung der Projekt-Ablage (z. B. abgelehnter Upload). null = nichts zu sagen. */
    const ablageHinweis = ref(null);
    /** engine-modelId → { key, projectGlobalId, sha256, name } */
    const _modelIdentity = new Map();

    /**
     * Gemeinsamer Lade-Pfad für Datei-Dialog, „Zuletzt geöffnet" und Deep-Link:
     * Identität (GlobalId/SHA-256) berechnen, Modell laden, Oberfläche
     * auffrischen, Blob in die lokale Ablage legen.
     */
    async function _ladeBytes(buf, name, { persist = true, inMeter = false } = {}) {
        const bytes = new Uint8Array(buf);
        // ERST DER KOPF (2026-09-11): eine PDF mit der Endung .ifc lief bis in
        // den Importer und scheiterte dort mit einer Bibliotheksmeldung.
        // Dieselbe Regel wie beim Upload (backend/app/ifc/kopf.py) — sie lehnt
        // nur ab, was sicher keine IFC-Datei ist. `_mitSperre` zeigt den Grund.
        const abgelehnt = kopfAblehnung(bytes, name);
        if (abgelehnt) throw new Error(abgelehnt);
        // Die IDENTITÄT kommt aus den ORIGINALBYTES — immer. Eine
        // Einheiten-Umrechnung ist unsere Lesart, keine neue Lieferung: die
        // Prüfsumme muss die des Planers bleiben, sonst zerfiele das
        // Dokumentregister in zwei Einträge und das Journal verlöre seinen
        // Modellbezug.
        const identity = await computeModelIdentity(bytes, name);
        // DIE LESART GILT WEITER: einmal in Metern gelesen, immer in Metern —
        // auf jedem Ladeweg, ohne Banner, ohne Klick. Und was schon
        // abgeleitet in der Ablage liegt (Meter-Bytes, Fragmentdatei), wird
        // benutzt statt neu gerechnet.
        const sha = identity.sha256 ?? null;
        const inMetern = inMeter || !!(sha && await lesartVon(sha));
        const meterBytes = (inMetern && sha) ? await _abgelegteMeterBytes(sha) : null;
        const frag = sha ? await _abgelegteFragmente(sha, inMetern) : null;
        const model = await engine.value.loadIfc(bytes, name, { inMeter: inMetern, meterBytes, frag });
        if (model?.modelId) _modelIdentity.set(model.modelId, { ...identity, name });
        if (sha && model?.modelId) _abgeleitetesAblegen(sha, model.modelId, name, { inMetern, meterBytes, frag });
        await onModelLoaded();
        if (persist) _ablegen(bytes, name, identity);

        // Bei aktivem Projekt ins Dokumentregister aufnehmen. Mit Server-Backend
        // liest das nur nach — die Datei ist durch `_ablegen` schon hochgeladen
        // und steht im Manifest.
        if (cde.auftrag?.id && identity.sha256) {
            cde.registerModel({
                sha256: identity.sha256,
                name,
                size: bytes.byteLength,
                projectGlobalId: identity.projectGlobalId,
            }).catch((fehler) => {
                // Frueher: `.catch(() => {})` mit dem Vermerk „Register
                // optional". Es IST nicht optional — wer eine IFC ins Projekt
                // laedt, will sie im Projekt haben. Ein verschluckter 401 sah
                // aus wie „es passiert gar nichts".
                ablageHinweis.value = `Nicht ins Projektregister aufgenommen: ${fehlerLesbar(fehler).text}`;
            });
        } else if (!cde.auftrag?.id) {
            // Kein Fehler, aber auch kein Erfolg: das Modell ist nur lokal.
            // Ohne diesen Satz sucht der Nutzer den Fehler bei sich.
            ablageHinweis.value = 'Nur im Browser gespeichert — kein Projekt geöffnet.';
        }
    }

    /**
     * Ein Ladevorgang mit Sperre und Fehlermeldung.
     *
     * DIE ABGEWIESENE LADUNG MUSS SICH MELDEN (2026-09-09). Hier stand
     * `return false` ohne ein Wort — wer eine zweite Datei öffnete, während
     * eine andere lud, bekam NICHTS: kein Modell, keine Meldung, kein
     * Fehler in der Konsole. Beim Start ist das der Regelfall, weil dann
     * die zuletzt offenen Modelle wiederhergestellt werden; die Sekunden
     * davor sieht die Oberfläche fertig aus. Beim Testen ist es mir dreimal
     * passiert, bis ich `loading` gemessen hatte — als Nutzer hätte ich
     * „das zweite Modell lädt einfach nicht" gemeldet.
     *
     * Kein Warteschlangen-Einbau: eine nachgeholte Ladung käme in
     * unbestimmter Reihenfolge, und die REIHENFOLGE entscheidet über den
     * Ladeversatz des ersten Modells (`baseCoordinates`) — also über den
     * Rahmen, in dem jeder Journal-Anker liegt. Lieber ehrlich abweisen und
     * den Menschen noch einmal klicken lassen.
     */
    async function _mitSperre(was, arbeit) {
        if (loading.value) {
            ablageHinweis.value = `${was}: Es wird gerade ein Modell geladen — bitte kurz warten und noch einmal versuchen.`;
            return false;
        }
        loading.value = true;
        try {
            await arbeit();
            return true;
        } catch (fehler) {
            console.error(`[CDE] ${was}:`, fehler);
            ablageHinweis.value = `${was} fehlgeschlagen: ${fehler?.message ?? fehler}`;
            return false;
        } finally {
            loading.value = false;
        }
    }

    async function onFileUpload(e) {
        const datei = e.target.files?.[0];
        if (!datei) return;
        await _mitSperre('IFC laden', async () => _ladeBytes(await datei.arrayBuffer(), datei.name));
        e.target.value = '';
    }

    async function onFileUploadAdd(e) {
        const datei = e.target.files?.[0];
        if (!datei) return;
        await _mitSperre('IFC hinzufügen', async () => _ladeBytes(await datei.arrayBuffer(), datei.name));
        e.target.value = '';
    }

    // ── Lokale Ablage (IndexedDB bzw. Projektordner via RepoFacade) ──────────

    async function _ablegen(bytes, name, identity) {
        if (!identity?.sha256) return;      // ohne Hash keine stabile Adresse
        try {
            const ok = await repo.setBlob(`model:${identity.sha256}`, new Blob([bytes]), {
                name,
                size: bytes.byteLength,
                savedAt: Date.now(),
                projectGlobalId: identity.projectGlobalId,
                key: identity.key,
            });
            if (!ok) {
                // `false` heisst zweierlei: ein Backend ohne Blob-Faehigkeit
                // (dann ist Schweigen richtig) oder ein gescheiterter
                // Serverzugriff (dann ist es falsch). Der Grund unterscheidet
                // die beiden Faelle — nur mit ihm wird gemeldet.
                const grund = repo.letzterFehler;
                if (grund) {
                    ablageHinweis.value = `Nicht in den Projektordner geladen: ${grund.text}`;
                    repo.fehlerQuittieren();
                }
                return;
            }
            // Ablage deckeln: nur die letzten N behalten — samt Abgeleitetem.
            const alle = (await repo.listBlobs('model:'))
                .sort((a, b) => (b.meta?.savedAt ?? 0) - (a.meta?.savedAt ?? 0));
            for (const row of alle.slice(MAX_RECENT_MODELS)) {
                await repo.deleteBlob(row.key);
                await _abgeleitetesLoeschen(row.key.replace(/^model:/, ''));
            }
            await aktualisiereZuletzt();
        } catch (e) {
            // Der Server lehnt einen zweiten Upload gleichen NAMENS mit 422 ab.
            // Das ist kein technischer Fehler, sondern eine Aussage an den
            // Nutzer — sonst steht das Modell im Viewer, aber nicht im Projekt.
            if (e?.name === 'CdeUploadAbgelehnt') {
                ablageHinweis.value = `Nicht ins Projekt übernommen: ${e.message}`;
                return;
            }
            console.warn('[CDE] Lokale Modell-Ablage fehlgeschlagen:', e?.message ?? e);
        }
    }

    async function aktualisiereZuletzt() {
        recentModels.value = (await repo.listBlobs('model:'))
            .sort((a, b) => (b.meta?.savedAt ?? 0) - (a.meta?.savedAt ?? 0));
    }

    async function openRecent(row) {
        await _mitSperre('Modell aus der Ablage laden', async () => {
            const abgelegt = await repo.getBlob(row.key);
            if (!abgelegt?.blob) throw new Error('Blob nicht gefunden');
            await _ladeBytes(await abgelegt.blob.arrayBuffer(),
                abgelegt.meta?.name ?? 'model', { persist: false });
            // savedAt auffrischen, damit die Liste nach letzter Nutzung sortiert
            // bleibt — bewusst ohne await, das Modell steht schon.
            repo.setBlob(row.key, abgelegt.blob, { ...abgelegt.meta, savedAt: Date.now() })
                .then(aktualisiereZuletzt);
        });
    }

    async function deleteRecent(row) {
        await repo.deleteBlob(row.key);
        await _abgeleitetesLoeschen(String(row.key).replace(/^model:/, ''));
        await aktualisiereZuletzt();
    }

    // ── Lesart und Abgeleitetes ─────────────────────────────────────────────

    let _lesarten = null;      // sha → {wann, faktor} — einmal gelesen, dann gehalten
    async function _lesartenLaden() {
        if (_lesarten) return _lesarten;
        try {
            const roh = await repo.get(REPO_KEY_LESART);
            _lesarten = (roh && typeof roh === 'object') ? { ...roh } : {};
        } catch { _lesarten = {}; }
        return _lesarten;
    }

    /** Gilt für diese Prüfsumme die Lesart „in Metern"? → {wann, faktor} | null */
    async function lesartVon(sha256) {
        if (!sha256) return null;
        return (await _lesartenLaden())[sha256] ?? null;
    }

    /** Die Lesart festhalten — nach einer gelungenen Umrechnung. */
    async function lesartMerken(sha256, bericht = null) {
        if (!sha256) return;
        const alle = await _lesartenLaden();
        alle[sha256] = { wann: Date.now(), faktor: bericht?.faktor ?? null };
        try { await repo.set(REPO_KEY_LESART, { ...alle }); }
        catch (fehler) { console.warn('[CDE] Lesart merken:', fehler?.message ?? fehler); }
    }

    /**
     * Die Lesart zurücknehmen: Entscheidung löschen, Abgeleitetes löschen,
     * das Original neu laden — dann steht das Banner wieder, wie am Anfang.
     */
    async function lesartZuruecknehmen(sha256) {
        if (!sha256) return { ok: false, grund: 'keine Prüfsumme' };
        const alle = await _lesartenLaden();
        delete alle[sha256];
        try { await repo.set(REPO_KEY_LESART, { ...alle }); }
        catch (fehler) { console.warn('[CDE] Lesart zurücknehmen:', fehler?.message ?? fehler); }
        await _abgeleitetesLoeschen(sha256, { nurMeter: true });
        const modelId = [..._modelIdentity].find(([, k]) => k?.sha256 === sha256)?.[0] ?? null;
        if (!modelId) return { ok: true, neuGeladen: false };
        const abgelegt = await repo.getBlob(`model:${sha256}`);
        if (!abgelegt?.blob) return { ok: false, grund: 'Die Bytes liegen nicht mehr in der Ablage' };
        const puffer = await abgelegt.blob.arrayBuffer();
        const gelungen = await _mitSperre('Lesart zurücknehmen', async () => {
            await engine.value?.unloadModel(modelId);
            vergiss(modelId);
            await _ladeBytes(puffer, abgelegt.meta?.name ?? 'model', { persist: false });
        });
        return { ok: !!gelungen, neuGeladen: true };
    }

    async function _abgelegteMeterBytes(sha256) {
        try {
            const b = await repo.getBlob(`meter:${sha256}`);
            return b?.blob ? new Uint8Array(await b.blob.arrayBuffer()) : null;
        } catch { return null; }
    }

    async function _abgelegteFragmente(sha256, inMetern) {
        try {
            const b = await repo.getBlob(`frag:${sha256}${inMetern ? ':m' : ''}`);
            return b?.blob ? { puffer: await b.blob.arrayBuffer(), offset: b.meta?.offset ?? null, koordinaten: b.meta?.koordinaten ?? null } : null;
        } catch { return null; }
    }

    /**
     * Was dieser Ladevorgang NEU erzeugt hat, ablegen — Meter-Bytes und
     * Fragmentdatei. Ohne `await` an der Ladekette: das Ablegen darf das
     * Anzeigen nicht aufhalten, und ein Fehler dabei ist nur ein langsamerer
     * nächster Start. Kam etwas schon aus der Ablage, wird es nicht erneut
     * geschrieben (`ausAblage`).
     */
    function _abgeleitetesAblegen(sha256, modelId, name, { inMetern, meterBytes, frag }) {
        (async () => {
            if (inMetern && !meterBytes) {
                const mb = engine.value?.einheitsBytes?.(modelId);
                const bericht = engine.value?.einheitsUmrechnung?.(modelId);
                if (mb) await repo.setBlob(`meter:${sha256}`, new Blob([mb]),
                    { name, savedAt: Date.now(), faktor: bericht?.faktor ?? null, abgeleitetVon: sha256 });
            }
            const f = engine.value?.fragmentPuffer?.(modelId);
            if (f?.puffer && !f.ausAblage) {
                await repo.setBlob(`frag:${sha256}${inMetern ? ':m' : ''}`, new Blob([f.puffer]),
                    { name, savedAt: Date.now(), inMeter: !!inMetern, offset: f.offset ?? null,
                      koordinaten: f.koordinaten ?? null, abgeleitetVon: sha256 });
            } else if (frag && f?.ausAblage === false) {
                // Die abgelegte Fragmentdatei passte nicht (Rahmen) und wurde
                // neu importiert — die neue ersetzt die alte im selben Zug oben.
            }
        })().catch(fehler => console.warn('[CDE] Abgeleitetes ablegen:', fehler?.message ?? fehler));
    }

    /** Abgeleitetes zu einer Prüfsumme löschen — mit dem Original, oder nur die Meter-Seite. */
    async function _abgeleitetesLoeschen(sha256, { nurMeter = false } = {}) {
        const keys = nurMeter
            ? [`meter:${sha256}`, `frag:${sha256}:m`]
            : [`meter:${sha256}`, `frag:${sha256}:m`, `frag:${sha256}`];
        for (const k of keys) { try { await repo.deleteBlob(k); } catch { /* weg ist weg */ } }
    }

    /**
     * Ein bereits geladenes Modell NEU laden — in Metern.
     *
     * Der Weg des „In Meter umrechnen"-Knopfes. NICHT nachträglich skaliert:
     * das ginge gar nicht, die Geometrie steckt dann schon in Fragmenten und
     * die kennen keinen Faktor mehr. Stattdessen aus DENSELBEN Bytes noch
     * einmal geladen, diesmal mit Umrechnung davor.
     *
     * Die Datei in der Ablage und im Register bleibt unverändert die des
     * Planers — deshalb `persist: false`.
     */
    async function ladeInMeterNeu(modelId) {
        const kennung = _modelIdentity.get(modelId);
        if (!kennung?.sha256) return { ok: false, grund: 'Modell nicht in der Ablage' };
        const abgelegt = await repo.getBlob(`model:${kennung.sha256}`);
        if (!abgelegt?.blob) return { ok: false, grund: 'Die Bytes liegen nicht mehr in der Ablage' };
        const puffer = await abgelegt.blob.arrayBuffer();
        const gelungen = await _mitSperre('In Meter umrechnen', async () => {
            await engine.value?.unloadModel(modelId);
            vergiss(modelId);
            await _ladeBytes(puffer, kennung.name ?? abgelegt.meta?.name ?? 'model',
                             { persist: false, inMeter: true });
        });
        // DIE ENTSCHEIDUNG MERKEN (2026-09-07): ab jetzt liest jeder Ladeweg
        // diese Datei in Metern — Banner und Klick kommen nicht wieder.
        if (gelungen) {
            const neueId = [..._modelIdentity].find(([, k]) => k?.sha256 === kennung.sha256)?.[0] ?? null;
            await lesartMerken(kennung.sha256, neueId ? engine.value?.einheitsUmrechnung?.(neueId) : null);
        }
        return { ok: !!gelungen };
    }

    /** Modell aus dem Dokumentregister öffnen (CdeView ruft per Template-Ref). */
    async function openBySha(sha256) {
        await openRecent({ key: `model:${sha256}` });
    }

    /**
     * Modell aus dem Projektordner laden (Deep-Link aus dem Cockpit).
     * Der Pfad ist relativ zu 1_Projekte; die Datei kommt über /projects/file.
     */
    async function openFromProjectPath(pfad) {
        // Beim Deep-Link ist die Engine oft noch im Aufbau — kurz warten statt
        // scheitern. 60 × 250 ms decken auch einen kalten WASM-Start ab.
        for (let i = 0; i < 60 && !engine.value; i += 1) {
            await new Promise((r) => setTimeout(r, 250));
        }
        if (!engine.value) throw new Error('viewer-engine nicht bereit');
        const { default: api } = await import('@/services/api');
        const antwort = await api.get('/projects/file',
            { params: { path: pfad }, responseType: 'arraybuffer' });
        const name = String(pfad).split('/').pop() || 'modell.ifc';
        await _ladeBytes(antwort.data, name);
    }

    /** sha256 des zuerst geladenen Modells — für Wasserzeichen und Register. */
    function geladeneModellSha() {
        const erstes = engine.value?.getModelList()?.[0];
        return erstes ? (_modelIdentity.get(erstes.modelId)?.sha256 ?? null) : null;
    }

    /** Stabile Identität eines Modells (GlobalId > sha > Name). */
    function identitaet(modelId) {
        return _modelIdentity.get(modelId) ?? null;
    }

    function vergiss(modelId) {
        _modelIdentity.delete(modelId);
    }

    /**
     * Merken, was gerade offen ist. Läuft nach JEDER Änderung der Modellmenge
     * (Laden wie Entladen), damit der nächste Start denselben Stand findet.
     * Ohne sha256 kein Eintrag: ohne Kennung liesse sich nichts zurückholen.
     */
    async function merkeOffene() {
        const offene = (engine.value?.getModelList() ?? [])
            .map((m) => ({ sha256: _modelIdentity.get(m.modelId)?.sha256 ?? null, name: m.name }))
            .filter((m) => m.sha256);
        try {
            await repo.set(REPO_KEY_OFFEN, offene);
        } catch (fehler) {
            // Nicht der Rede wert: beim nächsten Start beginnt man eben leer.
            console.warn('[CDE] zuletzt offene Modelle merken:', fehler?.message ?? fehler);
        }
    }

    /**
     * Die zuletzt offenen Modelle zurückholen.
     *
     * IN DERSELBEN REIHENFOLGE wie damals — das erste Modell bestimmt den
     * Welt-Rahmen (COORDINATE_TO_ORIGIN), und eine andere Reihenfolge hiesse
     * ein anderer Ladeversatz für das ganze Journal.
     *
     * Tut NICHTS, wenn schon etwas offen ist: ein Deep-Link oder ein Klick im
     * Register hat immer Vorrang vor dem, was gestern galt. Fehlt ein Blob
     * (die Ablage hält nur die letzten fünf), wird er gemeldet statt still
     * übersprungen — sonst fehlte ein Modell ohne jeden Hinweis.
     */
    async function stelleOffeneWiederHer() {
        if (engine.value?.getModelList()?.length) return { geladen: 0, grund: 'schon_offen' };
        let gemerkt = [];
        try {
            gemerkt = (await repo.get(REPO_KEY_OFFEN)) ?? [];
        } catch (fehler) {
            console.warn('[CDE] zuletzt offene Modelle lesen:', fehler?.message ?? fehler);
            return { geladen: 0, grund: 'nicht_lesbar' };
        }
        if (!Array.isArray(gemerkt) || !gemerkt.length) return { geladen: 0, grund: 'nichts_gemerkt' };

        // Beim Start ist die Engine oft noch im Aufbau — dieselbe Geduld wie
        // beim Deep-Link, statt zu scheitern.
        for (let i = 0; i < 60 && !engine.value; i += 1) {
            await new Promise((r) => setTimeout(r, 250));
        }
        if (!engine.value) return { geladen: 0, grund: 'engine_nicht_bereit' };

        let geladen = 0;
        const fehlend = [];
        for (const eintrag of gemerkt) {
            const key = `model:${eintrag?.sha256}`;
            try {
                const abgelegt = await repo.getBlob(key);
                if (!abgelegt?.blob) { fehlend.push(eintrag?.name || eintrag?.sha256); continue; }
                await openRecent({ key });
                geladen += 1;
            } catch (fehler) {
                fehlend.push(eintrag?.name || eintrag?.sha256);
                console.warn('[CDE] wiederherstellen:', fehler?.message ?? fehler);
            }
        }
        if (fehlend.length) {
            ablageHinweis.value = `Nicht mehr in der Ablage: ${fehlend.join(', ')} — über das Dokumentregister erneut öffnen.`;
        }
        return { geladen, fehlend };
    }

    return {
        loading, recentModels, ablageHinweis,
        onFileUpload, onFileUploadAdd,
        /**
         * Bytes laden OHNE Ablage und Upload (`persist: false`) — für Prüfläufe
         * mit Test-Modellen, die nicht in die Akte gehören (Teil XVII). Der
         * Weg ist derselbe wie beim Wiederherstellen aus der Ablage.
         */
        ladeBytes: (buf, name, opts = {}) => _mitSperre('IFC laden', () => _ladeBytes(buf, name, opts)),
        openRecent, deleteRecent, openBySha, openFromProjectPath,
        aktualisiereZuletzt, geladeneModellSha, identitaet, vergiss, ladeInMeterNeu,
        merkeOffene, stelleOffeneWiederHer,
        lesartVon, lesartMerken, lesartZuruecknehmen,
    };
}

/** Bytes menschenlesbar. Frei, damit die Schale sie im Template nutzen kann. */
export function fmtBytes(n) {
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function fmtDate(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
