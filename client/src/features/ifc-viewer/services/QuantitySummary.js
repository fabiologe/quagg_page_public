/**
 * Quantity Summary
 *
 * Pro-Kategorie-Aggregation aus den Engine-Accessors:
 *   - count      → Anzahl Elemente
 *   - volume_m3  → Summe der BoundingBox-Volumen (grob, schnell — keine Mesh-Calcs)
 *   - kgCode     → optional: pro Element die KG-Zuordnung aus dem KG-Klassifikator
 *
 * Wird vom Volumen-Tab und vom Stück-Tab in der Planung gemeinsam genutzt.
 * Der Pauschal-Tab nutzt diesen Service nicht — er ist reine User-Eingabe.
 *
 * Achtung: Volumen-Wert ist die BBox-Box (Width × Height × Depth), nicht das
 * exakte Mesh-Volumen. Für LP 2-3 / Kostenkennwerte reicht das; für LP 5-6
 * Ausschreibung kommt später der Mesh-Volume-Worker (Sprint Volume-Truth).
 */

import * as THREE from 'three';

/**
 * Aggregiert pro Kategorie.
 *
 * @param {object} args
 * @param {Array<{name, groupData}>} args.categoryGroups
 * @param {Map<string, FragmentsModel>} args.fragmentsList
 * @param {Map<string, string>} [args.perElementKg]  optional aus KgClassifier:
 *                                                    "modelId|localId" → kgCode
 * @returns {Promise<{
 *   byCategory: Map<string, {
 *     count: number,
 *     volume_m3: number,
 *     avgVolume_m3: number,
 *     byKg: Map<string, { count: number, volume_m3: number }>,
 *   }>,
 *   totals: { count, volume_m3 }
 * }>}
 */
export async function summarizeQuantities({
    categoryGroups, fragmentsList, perElementKg = null,
} = {}) {
    const byCategory = new Map();
    const totals = { count: 0, volume_m3: 0 };

    if (!categoryGroups?.length || !fragmentsList) {
        return { byCategory, totals };
    }

    const sizeVec = new THREE.Vector3();

    for (const group of categoryGroups) {
        const category = group.name;
        let map;
        try { map = await group.groupData.get(); } catch { continue; }
        if (!map) continue;
        const entries = map instanceof Map ? [...map.entries()] : Object.entries(map);

        let catCount = 0;
        let catVolume = 0;
        const byKg = new Map();

        for (const [modelId, rawIds] of entries) {
            const localIds = Array.isArray(rawIds) ? rawIds : (rawIds instanceof Set ? [...rawIds] : null);
            if (!localIds?.length) continue;
            const model = fragmentsList.get(modelId);
            if (!model) continue;

            let boxes = null;
            try { boxes = await model.getBoxes(localIds); } catch { /* */ }

            for (let i = 0; i < localIds.length; i++) {
                const localId = localIds[i];
                catCount++;

                let elVol = 0;
                const box = boxes?.[i];
                if (box && !box.isEmpty()) {
                    box.getSize(sizeVec);
                    elVol = sizeVec.x * sizeVec.y * sizeVec.z;
                }
                catVolume += elVol;

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
            avgVolume_m3: catCount > 0 ? catVolume / catCount : 0,
            byKg,
        });
        totals.count     += catCount;
        totals.volume_m3 += catVolume;
    }

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
