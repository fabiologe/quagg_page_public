/**
 * TerrainMesh — Dreiecks-Beschaffung für Gelände-Auswertungen (Sprint T1).
 *
 * Gemeinsame Datenquelle für Böschungsschraffur (SlopeHatch) und Höhenlinien
 * (ContourLines): sammelt die Dreiecke aller Elemente der gewünschten
 * Kategorien als flaches Float64Array in WELT-Koordinaten.
 *
 * Zwei Wege:
 *   1. Bulk: model.getItemsGeometry(localIds) → MeshData{positions, indices,
 *      transform} — schnell für DGMs mit vielen Dreiecken (keine
 *      THREE.Triangle-Allokation pro Dreieck).
 *   2. Fallback je Element: model.getItem(id).getGeometry().getTriangles()
 *      (das verifizierte Muster aus IfcShapeOutlines).
 *
 * Unterseiten-Filter: Gelände-SOLIDS haben Böden und senkrechte Mantelflächen;
 * abwärts gerichtete Dreiecke (normierte Normale ny < -0.05) werden verworfen,
 * sonst erzeugt die Unterseite gespiegelte Phantom-Böschungen.
 */

import { collectElementTriangles } from './geometry/MeshAcquire.js';

/**
 * HIER STAND EINE ZWEITE KATEGORIENLISTE (bis 2026-09-03).
 *
 * `TERRAIN_CATEGORIES_DEFAULT` war Zeichen für Zeichen dieselbe Liste wie
 * `GELAENDE_KATEGORIEN` in GelaendeQuelle.js — mit dem Unterschied, dass sie
 * weder Verdecktes noch die eigenen DGM-Teile kannte. Vier Verbraucher lasen
 * einmal die eine und einmal die andere; der Erdkörper des Planers war
 * dadurch im Längsschnitt und in der Böschungsschraffur längst Gelände,
 * während die Werkzeuge ihn für einen Körper hielten.
 *
 * Zwei Listen, die dasselbe sagen, sind beide grün und laufen trotzdem
 * auseinander — ein Verhaltenstest sieht das nie. Deshalb gibt es sie nicht
 * mehr: `GELAENDE_VORBELEGUNG` ist die eine Quelle, und wer die richtige
 * Antwort will (statt der Vorbelegung), fragt den Sampler der Engine.
 */
export { GELAENDE_VORBELEGUNG } from './GelaendeQuelle.js';
// Der Sampler wohnt seit 2026-09-07 in geometry/HeightSampler.js — leicht,
// damit der Kernel-Worker ihn ohne three/web-ifc bekommt. Hier weiter
// exportiert, damit die Aufrufer unberührt bleiben.
export { makeHeightSampler } from './geometry/HeightSampler.js';


/**
 * @param {Array<{name, groupData}>} categoryGroups  engine.getCategoryGroups()
 * @param {Map<string, FragmentsModel>} fragmentsList
 * @param {string[]} categories  gewünschte Kategorien (IFC-Klassennamen)
 * @returns {Promise<{ positions: Float64Array, triCount: number,
 *                     perModel: Array<{modelId, start, end}> }>}
 *          positions: 9 Werte je Dreieck (ax,ay,az,bx,by,bz,cx,cy,cz), WELT
 *
 * Seit Sprint G ein Wrapper um `geometry/MeshAcquire.collectElementTriangles`
 * mit `filter:'upward'` (das bisherige Gelände-Verhalten) — Kontrakt unverändert.
 */
export async function collectCategoryTriangles(categoryGroups, fragmentsList, categories) {
    const chunks = [];       // Float64Array-Stücke
    const perModel = [];
    let total = 0;           // Dreiecke gesamt

    if (!categoryGroups?.length || !fragmentsList || !categories?.length) {
        return { positions: new Float64Array(0), triCount: 0, perModel };
    }

    const wanted = new Set(categories);
    for (const group of categoryGroups) {
        if (!wanted.has(group.name)) continue;
        let map;
        try { map = await group.groupData.get(); } catch { continue; }
        if (!map) continue;
        const entries = map instanceof Map ? [...map.entries()] : Object.entries(map);

        for (const [modelId, rawIds] of entries) {
            const localIds = Array.isArray(rawIds) ? rawIds : (rawIds instanceof Set ? [...rawIds] : null);
            if (!localIds?.length) continue;
            const model = fragmentsList.get(modelId);
            if (!model) continue;

            const got = await collectElementTriangles(model, localIds, { filter: 'upward' });
            if (got.triCount) {
                const start = total;
                chunks.push(got.positions);
                total += got.triCount;
                perModel.push({ modelId, start, end: total });
            }
        }
    }

    const positions = new Float64Array(total * 9);
    let off = 0;
    for (const c of chunks) { positions.set(c, off); off += c.length; }
    return { positions, triCount: total, perModel };
}

// ── T2: Höhen-Sampler (x,z) → Geländehöhe y ─────────────────────────────────


