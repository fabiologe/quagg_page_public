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
 * @returns {Promise<{karte: Map<string, {modelId, localId}>, fehlend: string[]}>}
 */
export async function baueGlobalIdKarte({ modelle, gesuchte } = {}) {
    const offen = new Set(gesuchte ?? []);
    const karte = new Map();
    if (!offen.size) return { karte, fehlend: [] };

    const guids = [...offen];
    for (const modell of (modelle ?? [])) {
        if (!offen.size) break;                       // alles gefunden
        if (typeof modell?.getLocalIdsByGuids !== 'function') continue;

        let localIds;
        try {
            localIds = await modell.getLocalIdsByGuids(guids);
        } catch (fehler) {
            console.warn('cde: GlobalIds nachschlagen', fehler?.message ?? fehler);
            continue;
        }
        if (!Array.isArray(localIds)) continue;

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
    });
}
