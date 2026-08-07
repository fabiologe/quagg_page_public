/**
 * Quantity Summary — Mengenermittlung pro Kategorie.
 *
 * Mengen-Kette je Element (Volume-Truth, Stufe „Planen"):
 *   1. Qto_*BaseQuantities aus dem Modell (NetVolume/GrossVolume, Net/GrossArea,
 *      Length …) — das sind die vom Autorenwerkzeug berechneten, belastbaren
 *      Werte für LP 5-6.
 *   2. Fallback BoundingBox (Width × Height × Depth) — grob, aber immer
 *      verfügbar; ausreichend für LP 2-3-Kennwerte.
 *
 * Die Herkunft wird pro Kategorie mitgezählt (`sources.qto` / `sources.bbox`),
 * damit die UI ehrlich ausweisen kann, worauf eine Zahl beruht.
 *
 * Wird vom Volumen-, Stück- und Kosten-Tab gemeinsam genutzt. Der Pauschal-Tab
 * nutzt diesen Service nicht — er ist reine User-Eingabe.
 */

import * as THREE from 'three';
import { FRAGMENTS_DATA_CONFIG } from './IfcDataConfig.js';
import { collectElementTriangles } from './geometry/MeshAcquire.js';
import { meshVolume } from './geometry/MeshOps.js';

// Sprint G: Budget für den Mesh-Volumen-Pfad — oberhalb wird auf BBox
// zurückgefallen, statt den Main-Thread minutenlang zu blockieren.
const MESH_VOLUME_TRI_BUDGET = 500000;

/** Unwrap OBC's `{value: x}` shape. */
function _scalar(v) {
    if (v == null) return null;
    if (typeof v === 'object' && 'value' in v) return v.value;
    return typeof v === 'object' ? null : v;
}

/**
 * Alle Qto_*-Quantity-Sets eines Items einsammeln → flaches {prop: number}.
 * Späteres Set gewinnt nicht — der erste gefundene Wert bleibt stehen
 * (BaseQuantities kommen praktisch immer zuerst und sind die Referenz).
 * Exportiert (T1/E2): der KG-Klassifikator liest damit Laufmeter je Element.
 */
export function collectQto(item) {
    const out = {};
    for (const rel of (item?.IsDefinedBy ?? [])) {
        const name = _scalar(rel?.Name);
        if (!name || !String(name).startsWith('Qto_')) continue;
        // OBC liefert Quantities je nach Schema unter HasProperties oder Quantities
        const props = rel?.HasProperties ?? rel?.Quantities ?? [];
        for (const p of props) {
            const propName = _scalar(p?.Name);
            if (!propName || propName in out) continue;
            const v = Number(_scalar(p?.NominalValue) ?? _scalar(p?.Value)
                ?? _scalar(p?.VolumeValue) ?? _scalar(p?.AreaValue) ?? _scalar(p?.LengthValue));
            if (Number.isFinite(v)) out[propName] = v;
        }
    }
    return out;
}

const VOLUME_KEYS = ['NetVolume', 'GrossVolume'];
const AREA_KEYS   = ['NetArea', 'GrossArea', 'NetSideArea', 'GrossSideArea', 'NetFloorArea', 'GrossFloorArea', 'Area'];
export const LENGTH_KEYS = ['Length', 'Height'];

export function pickQtoValue(qto, keys) {
    for (const k of keys) {
        const v = qto[k];
        if (Number.isFinite(v) && v > 0) return v;
    }
    return null;
}

/**
 * Aggregiert pro Kategorie.
 *
 * @param {object} args
 * @param {Array<{name, groupData}>} args.categoryGroups
 * @param {Map<string, FragmentsModel>} args.fragmentsList
 * @param {FragmentsManager} [args.fragmentsManager]  optional — ohne ihn gibt es
 *                                                    nur den BBox-Fallback
 * @param {Map<string, string>} [args.perElementKg]  optional aus KgClassifier:
 *                                                    "modelId|localId" → kgCode
 * @returns {Promise<{
 *   byCategory: Map<string, {
 *     count, volume_m3, area_m2, length_m, avgVolume_m3,
 *     sources: { qto: number, bbox: number },
 *     byKg: Map<string, { count, volume_m3 }>,
 *   }>,
 *   totals: { count, volume_m3, area_m2, length_m, qtoShare: number }
 * }>}
 */
export async function summarizeQuantities({
    categoryGroups, fragmentsList, fragmentsManager = null, perElementKg = null,
} = {}) {
    const byCategory = new Map();
    const totals = { count: 0, volume_m3: 0, area_m2: 0, length_m: 0, qtoShare: 0 };

    if (!categoryGroups?.length || !fragmentsList) {
        return { byCategory, totals };
    }

    const sizeVec = new THREE.Vector3();
    let qtoCount = 0;

    for (const group of categoryGroups) {
        const category = group.name;
        let map;
        try { map = await group.groupData.get(); } catch { continue; }
        if (!map) continue;
        const entries = map instanceof Map ? [...map.entries()] : Object.entries(map);

        let catCount = 0;
        let catVolume = 0, catArea = 0, catLength = 0;
        const sources = { qto: 0, mesh: 0, bbox: 0 };
        const byKg = new Map();

        for (const [modelId, rawIds] of entries) {
            const localIds = Array.isArray(rawIds) ? rawIds : (rawIds instanceof Set ? [...rawIds] : null);
            if (!localIds?.length) continue;
            const model = fragmentsList.get(modelId);
            if (!model) continue;

            let boxes = null;
            try { boxes = await model.getBoxes(localIds); } catch { /* */ }

            // Qto-Daten pro Modell-Batch holen (eine Anfrage je Kategorie×Modell)
            let qtoByLocalId = null;
            if (fragmentsManager) {
                try {
                    const raw = await fragmentsManager.getData({ [modelId]: localIds }, FRAGMENTS_DATA_CONFIG);
                    const items = Object.values(raw ?? {})[0] ?? [];
                    qtoByLocalId = new Map();
                    for (const item of items) {
                        const lid = _scalar(item._localId ?? item.localId ?? item.expressID);
                        if (lid == null) continue;
                        qtoByLocalId.set(lid, collectQto(item));
                    }
                } catch { /* Qto optional — Fallback BBox */ }
            }

            // Sprint G: MESH-Volumen für die Rest-Elemente ohne Qto — nur
            // geschlossene Körper zählen (Divergenzsatz), sonst weiter BBox.
            const restIds = localIds.filter(id =>
                pickQtoValue(qtoByLocalId?.get(id) ?? {}, VOLUME_KEYS) == null);
            const meshVolById = new Map();
            if (restIds.length) {
                try {
                    const got = await collectElementTriangles(model, restIds, { filter: 'none' });
                    if (got.triCount > 0 && got.triCount <= MESH_VOLUME_TRI_BUDGET) {
                        for (const range of got.perElement) {
                            const v = meshVolume(
                                got.positions.subarray(range.start * 9, range.end * 9),
                                range.end - range.start);
                            if (v.closed) meshVolById.set(range.localId, v.volume);
                        }
                    } else if (got.triCount > MESH_VOLUME_TRI_BUDGET) {
                        console.warn(`[QuantitySummary] ${category}: ${got.triCount} Dreiecke > Budget — Mesh-Volumen übersprungen (BBox-Fallback)`);
                    }
                } catch { /* Mesh optional — Fallback BBox */ }
            }

            for (let i = 0; i < localIds.length; i++) {
                const localId = localIds[i];
                catCount++;

                const qto = qtoByLocalId?.get(localId) ?? {};
                const qtoVol = pickQtoValue(qto, VOLUME_KEYS);
                const qtoArea = pickQtoValue(qto, AREA_KEYS);
                const qtoLen = pickQtoValue(qto, LENGTH_KEYS);

                let elVol;
                if (qtoVol != null) {
                    elVol = qtoVol;
                    sources.qto++;
                    qtoCount++;
                } else if (meshVolById.has(localId)) {
                    elVol = meshVolById.get(localId);
                    sources.mesh++;
                } else {
                    elVol = 0;
                    const box = boxes?.[i];
                    if (box && !box.isEmpty()) {
                        box.getSize(sizeVec);
                        elVol = sizeVec.x * sizeVec.y * sizeVec.z;
                    }
                    sources.bbox++;
                }
                catVolume += elVol;
                if (qtoArea != null) catArea += qtoArea;
                if (qtoLen != null) catLength += qtoLen;

                const kgCode = perElementKg?.get(`${modelId}|${localId}`);
                if (kgCode) {
                    if (!byKg.has(kgCode)) byKg.set(kgCode, { count: 0, volume_m3: 0 });
                    const bk = byKg.get(kgCode);
                    bk.count++;
                    bk.volume_m3 += elVol;
                }
            }
        }

        if (catCount === 0) continue;
        byCategory.set(category, {
            count: catCount,
            volume_m3: catVolume,
            area_m2: catArea,
            length_m: catLength,
            avgVolume_m3: catCount > 0 ? catVolume / catCount : 0,
            sources,
            byKg,
        });
        totals.count     += catCount;
        totals.volume_m3 += catVolume;
        totals.area_m2   += catArea;
        totals.length_m  += catLength;
    }

    totals.qtoShare = totals.count > 0 ? qtoCount / totals.count : 0;
    return { byCategory, totals };
}

/**
 * Kategorien, die in der deutschen LV-Praxis typischerweise pro Stück
 * abgerechnet werden — hilfreich für den Stück-Tab als Hervorhebung.
 */
export const PIECE_BILLED_CATEGORIES = new Set([
    'IFCDOOR', 'IFCDOORTYPE',
    'IFCWINDOW', 'IFCWINDOWTYPE',
    'IFCDISTRIBUTIONCHAMBERELEMENT', // Schächte
    'IFCPIPEFITTING', 'IFCPIPEFITTINGTYPE',
    'IFCFLOWFITTING', 'IFCFLOWFITTINGTYPE',
    'IFCFLOWTERMINAL', 'IFCFLOWTERMINALTYPE',
    'IFCDUCTFITTING', 'IFCDUCTFITTINGTYPE',
    'IFCAIRTERMINAL', 'IFCAIRTERMINALTYPE',
    'IFCVALVE', 'IFCVALVETYPE',
    'IFCPUMP', 'IFCPUMPTYPE',
    'IFCFURNITURE', 'IFCFURNITURETYPE',
    'IFCSANITARYTERMINAL',
    'IFCLIGHTFIXTURE',
    'IFCOUTLET',
]);

/**
 * Kategorien, die typischerweise nach Volumen abgerechnet werden.
 */
export const VOLUME_BILLED_CATEGORIES = new Set([
    'IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCWALLTYPE',
    'IFCSLAB', 'IFCSLABTYPE',
    'IFCCOLUMN', 'IFCCOLUMNTYPE',
    'IFCBEAM', 'IFCBEAMTYPE',
    'IFCFOOTING', 'IFCFOOTINGTYPE',
    'IFCROOF',
    'IFCSTAIR', 'IFCSTAIRFLIGHT',
    'IFCPILE',
]);
