/**
 * GlobalIdKarte — von der IFC-Kennung zum Bauteil im geladenen Modell (9.2).
 *
 * Das Journal hängt an der `GlobalId`, weil nur sie eine Modellrevision
 * überlebt: `localId` ist eine Zeilennummer der Datei und ändert sich, sobald
 * der Planer etwas einfügt. Die Bibliothek arbeitet aber ausschließlich mit
 * `localId`. Dazwischen fehlt eine Übersetzung — hier ist sie.
 *
 * WARUM NICHT DER VORHANDENE SUCHINDEX: `buildSearchIndex` in `IfcItemData.js`
 * läuft über eine feste `QUERY_TYPES`-Liste mit 30 Einträgen. Für die Suche ist
 * das vertretbar (wer nichts findet, tippt weiter), fürs Nachspielen nicht: ein
 * Bauteil, dessen Typ nicht auf der Liste steht, verlöre seine Festlegung
 * stillschweigend — und zwar genau die Typen, für die die Bauform-Schicht
 * überhaupt angetreten ist. Hier wird deshalb über die Kategorien gelaufen, die
 * das MODELL wirklich führt (`engine.getCategoryGroups()`).
 *
 * SPARSAM: Gesucht wird nur, was das Journal auch nennt, und der Lauf bricht ab,
 * sobald alles gefunden ist. Bei einer Handvoll Festlegungen in einem großen
 * Modell endet er meist nach wenigen Kategorien.
 */

import * as OBC from '@thatopen/components';
import { DATA_CONFIG, parseItemData } from './IfcItemData.js';

/** Wie viele Bauteile auf einmal abgefragt werden. */
const STAPEL = 500;

/**
 * Die gesuchten GlobalIds im geladenen Modell nachschlagen.
 *
 * @param {object} opts
 * @param {Array}  opts.categoryGroups  aus `engine.getCategoryGroups()`
 * @param {object} opts.fragmentsManager
 * @param {Iterable<string>} opts.gesuchte  GlobalIds aus dem Journal
 * @returns {Promise<{karte: Map<string, {modelId, localId}>, fehlend: string[]}>}
 *   `fehlend` ist nicht dasselbe wie ein Fehler: ein Bauteil kann in dieser
 *   Revision schlicht nicht mehr da sein. Das zu MELDEN ist der ganze Zweck —
 *   der Konflikt entsteht später aus genau dieser Liste.
 */
export async function baueGlobalIdKarte({ categoryGroups, fragmentsManager, gesuchte } = {}) {
    const offen = new Set(gesuchte ?? []);
    const karte = new Map();
    if (!offen.size || !fragmentsManager) {
        return { karte, fehlend: [...offen] };
    }

    for (const group of (categoryGroups ?? [])) {
        if (!offen.size) break;                       // alles gefunden

        let map;
        try { map = await group.groupData.get(); } catch { continue; }
        const eintraege = map instanceof Map ? [...map.entries()] : Object.entries(map ?? {});

        for (const [modelId, rohIds] of eintraege) {
            if (!offen.size) break;
            const localIds = Array.isArray(rohIds)
                ? rohIds
                : (rohIds instanceof Set ? [...rohIds] : null);
            if (!localIds?.length) continue;

            for (let i = 0; i < localIds.length && offen.size; i += STAPEL) {
                const stapel = localIds.slice(i, i + STAPEL);
                let daten;
                try {
                    daten = await fragmentsManager.getData({ [modelId]: stapel }, DATA_CONFIG);
                } catch { continue; }

                for (const roh of (Array.isArray(daten) ? daten : [daten])) {
                    const gid = _globalIdAus(roh);
                    if (!gid || !offen.has(gid)) continue;
                    const localId = _localIdAus(roh, stapel, daten);
                    if (localId === null) continue;
                    karte.set(gid, { modelId, localId });
                    offen.delete(gid);
                }
            }
        }
    }

    return { karte, fehlend: [...offen] };
}

/**
 * Die GlobalId aus einem Rohdatensatz ziehen.
 *
 * `parseItemData` ist die eine Stelle, die weiß, wie ein Datensatz der
 * Bibliothek aussieht — sie wird benutzt, statt das Format hier ein zweites Mal
 * zu deuten. Nur wenn sie nichts liefert, wird direkt nachgesehen.
 */
function _globalIdAus(roh) {
    if (!roh) return null;
    try {
        const gid = parseItemData(roh)?.globalId;
        if (gid) return gid;
    } catch { /* weiter unten direkt versuchen */ }
    const v = roh.GlobalId?.value ?? roh._guid?.value ?? roh.globalId;
    return typeof v === 'string' && v ? v : null;
}

/** Die localId aus einem Rohdatensatz — die Bibliothek benennt sie uneinheitlich. */
function _localIdAus(roh, stapel, daten) {
    for (const schluessel of ['_localId', 'localId', 'expressID', 'expressId']) {
        const v = roh?.[schluessel];
        if (typeof v === 'number') return v;
        if (typeof v?.value === 'number') return v.value;
    }
    // Rückfall: gleiche Reihenfolge wie die Anfrage. Nur gültig, wenn die
    // Bibliothek genauso viele Datensätze liefert, wie gefragt wurden — sonst
    // ordnete man Kennungen falsch zu, und das wäre schlimmer als kein Treffer.
    if (Array.isArray(daten) && daten.length === stapel.length) {
        const i = daten.indexOf(roh);
        if (i >= 0) return stapel[i];
    }
    return null;
}

/**
 * Bequemer Weg über die Engine — dieselbe Zutatenliste wie
 * `makeGeometryResolver`, damit Aufrufer nicht wissen müssen, was der
 * Auflöser braucht.
 */
export function karteMitEngine(engine, gesuchte) {
    return baueGlobalIdKarte({
        categoryGroups:   engine?.getCategoryGroups?.() ?? [],
        fragmentsManager: engine?.components?.get?.(OBC.FragmentsManager) ?? null,
        gesuchte,
    });
}
