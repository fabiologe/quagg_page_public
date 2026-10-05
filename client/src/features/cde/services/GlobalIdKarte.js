/**
 * GlobalIdKarte — von der IFC-Kennung zum Bauteil im geladenen Modell (9.2).
 *
 * Das Journal hängt an der `GlobalId`, weil nur sie eine Modellrevision
 * überlebt: `localId` ist eine Zeilennummer der Datei und ändert sich, sobald
 * der Planer etwas einfügt. Die Bibliothek arbeitet aber ausschließlich mit
 * `localId`. Dazwischen fehlt eine Übersetzung — hier ist sie.
 *
 * SIE KOMMT AUS DEM GUID-INDEX, NICHT AUS DEN ATTRIBUTEN.
 *
 * Die erste Fassung lief über alle Kategorien des Modells, holte in Stapeln zu
 * 500 die Attributdaten und suchte darin `GlobalId`. Das konnte nicht
 * funktionieren: der IfcLoader importiert von Haus aus nur einen schmalen
 * Attributsatz (Projekt, Geschoss, Materialien, Merkmalssätze) — die GlobalId
 * gehört nicht dazu. Die Karte blieb deshalb IMMER leer, und jede Festlegung
 * endete in `keine_localId`: eingetragen, nie angewandt.
 *
 * `FragmentsModel.getLocalIdsByGuids` fragt genau danach und ist obendrein das
 * Gegenteil von teuer — ein Aufruf je Modell statt eines Durchlaufs durch das
 * ganze Modell. Der frühere Kopfkommentar begründete ausführlich, warum NICHT
 * der vorhandene Suchindex benutzt wird; die eigentliche Antwort war die ganze
 * Zeit, dass die Bibliothek einen eigenen Index dafür führt.
 *
 * EHRLICH: Gesucht wird nur, was das Journal nennt. Was kein Modell kennt, kommt
 * als `fehlend` zurück — das ist kein Fehler, sondern der Anlass für einen
 * Konflikt: ein Bauteil kann in dieser Revision schlicht nicht mehr da sein.
 */

import * as OBC from '@thatopen/components';

/**
 * Die gesuchten GlobalIds in den geladenen Modellen nachschlagen.
 *
 * @param {object} opts
 * @param {Array}  opts.modelle   `FragmentsModel`-Instanzen (`manager.list`)
 * @param {Iterable<string>} opts.gesuchte  GlobalIds aus dem Journal
 * @param {Map}    [opts.speicher]  Antworten je Modell (`modelId → Map<guid, localId|null>`), nur für
 *                                  Modelle, die `fest(modelId)` bejaht — siehe unten
 * @param {Function} [opts.fest]    ändert sich der GUID-Index dieses Modells nie, solange es geladen ist?
 * @param {Function} [opts.bekannt] `modelId → Map<guid, localId>` = ALLES, was dieses Modell kennt
 *                                  (der Eigenbau, den der Autor gerade gebaut hat), sonst null
 * @returns {Promise<{karte: Map<string, {modelId, localId}>, fehlend: string[]}>}
 */
export async function baueGlobalIdKarte({ modelle, gesuchte, speicher = null, fest = null, bekannt = null } = {}) {
    const offen = new Set(gesuchte ?? []);
    const karte = new Map();
    if (!offen.size) return { karte, fehlend: [] };

    const guids = [...offen];
    for (const modell of (modelle ?? [])) {
        if (!offen.size) break;                       // alles gefunden
        if (typeof modell?.getLocalIdsByGuids !== 'function') continue;

        // Was ein Modell vollständig kennt, beantwortet sich ohne den Worker:
        // der Eigenbau enthält nur, was der Autor gebaut hat.
        const voll = typeof bekannt === 'function' ? bekannt(modell.modelId) : null;
        if (voll instanceof Map) {
            for (const g of guids) {
                const localId = voll.get(g);
                if (typeof localId !== 'number' || !offen.has(g)) continue;
                karte.set(g, { modelId: modell.modelId, localId });
                offen.delete(g);
            }
            continue;
        }

        // Ein geliefertes Modell ändert seinen GUID-Index nicht, solange es
        // geladen ist — seine Antworten (auch das „kenne ich nicht") gelten
        // weiter. Gemessen (B4, 2026-10-05, Projekt 10001): nach jedem
        // Kommando fragten Gelände und Beziehungsindex dieselben Kennungen
        // erneut beim Worker, zusammen 2,1 s je Neuaufbau. Eigenbau und
        // Delta-Modelle entstehen bei jedem Aufbau neu — die fragt man immer.
        const merkt = speicher instanceof Map && typeof fest === 'function' && fest(modell.modelId);
        const gemerkt = merkt ? (speicher.get(modell.modelId) ?? new Map()) : null;
        const frag = gemerkt ? guids.filter(g => offen.has(g) && !gemerkt.has(g)) : guids;

        let localIds = [];
        if (frag.length) {
            try {
                localIds = await modell.getLocalIdsByGuids(frag);
            } catch (fehler) {
                console.warn('cde: GlobalIds nachschlagen', fehler?.message ?? fehler);
                continue;
            }
            if (!Array.isArray(localIds)) continue;
        }
        if (gemerkt) {
            for (let i = 0; i < frag.length; i++) gemerkt.set(frag[i], typeof localIds[i] === 'number' ? localIds[i] : null);
            speicher.set(modell.modelId, gemerkt);
            for (const g of guids) {
                const localId = gemerkt.get(g);
                if (typeof localId !== 'number' || !offen.has(g)) continue;
                karte.set(g, { modelId: modell.modelId, localId });
                offen.delete(g);
            }
            continue;
        }

        // Die Antwort ist stellungsgleich zur Anfrage: Index i gehört zu
        // guids[i], `null` heisst „dieses Modell kennt die Kennung nicht".
        // Beim ERSTEN Treffer wird zugeschlagen — bei mehreren geladenen
        // Modellen gewinnt die Ladereihenfolge. Dieselbe Kennung zweimal wäre
        // ohnehin ein Fehler in den Dateien.
        for (let i = 0; i < guids.length; i++) {
            const localId = localIds[i];
            if (typeof localId !== 'number' || !offen.has(guids[i])) continue;
            // DAS MODELL, IN DEM WIRKLICH GEFUNDEN WURDE — nie „normiert" auf
            // die Basis. Gemessen (2026-09-09): das CDE-Modell führt den
            // GUID-Index nur im DELTA des Editors, die Basis antwortet dort
            // nicht. Eine Karte, die einen Delta-Treffer als Basis
            // beschriftet, nennt ein Modell, in dem diese localId nicht gilt.
            karte.set(guids[i], { modelId: modell.modelId, localId });
            offen.delete(guids[i]);
        }
    }

    return { karte, fehlend: [...offen] };
}

/**
 * Bequemer Weg über die Engine — der Aufrufer muss nicht wissen, wo die
 * Modelle liegen.
 */
export function karteMitEngine(engine, gesuchte) {
    const manager = engine?.components?.get?.(OBC.FragmentsManager) ?? null;
    return baueGlobalIdKarte({
        modelle: manager?.list ? [...manager.list.values()] : [],
        gesuchte,
        // Antworten fester Modelle merkt sich die Engine (B4); sie sagt auch, welche fest sind.
        ...(engine?.guidSpeicher?.() ?? {}),
    });
}
