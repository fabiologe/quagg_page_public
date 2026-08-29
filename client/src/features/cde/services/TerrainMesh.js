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

/** Kategorien, die als "Gelände" gelten (Default für Modal-Option). */
export const TERRAIN_CATEGORIES_DEFAULT = [
    'IFCGEOGRAPHICELEMENT',
    'IFCEARTHWORKSCUT',
    'IFCEARTHWORKSFILL',
    'IFCEARTHWORKSELEMENT',
    // Sprint G: Erdkörper kommen oft als IfcCivilElement-VOLUMENKÖRPER —
    // der GeometryResolver leitet daraus die obere Hülle ab (heightfield).
    'IFCCIVILELEMENT',
];


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

/**
 * Grid-beschleunigter Gelände-Sampler für Längsschnitt/Querprofile:
 * `sample(x, z)` → interpolierte Höhe des höchsten getroffenen Dreiecks,
 * oder null außerhalb des Geländes.
 *
 * Uniform-Grid über die XZ-BBoxen der Dreiecke — 500 Abfragen auf einem
 * 100k-DGM bleiben damit unter ~10 ms statt O(n·m)-Vollscan.
 *
 * @param {Float64Array} positions  9 Werte je Dreieck (Welt)
 * @param {number} triCount
 * @returns {{ sample: (x:number, z:number) => number|null,
 *             bounds: {minX,maxX,minZ,maxZ} | null }}
 */
export function makeHeightSampler(positions, triCount) {
    if (!positions?.length || !triCount) {
        return { sample: () => null, bounds: null };
    }

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < triCount * 3; i++) {
        const x = positions[i * 3], z = positions[i * 3 + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }

    // Zellgröße: Ziel ~1–4 Dreiecke pro Zelle
    const span = Math.max(maxX - minX, maxZ - minZ, 1e-6);
    const cellsTarget = Math.max(8, Math.ceil(Math.sqrt(triCount)));
    const cell = span / cellsTarget;
    const nx = Math.max(1, Math.ceil((maxX - minX) / cell));
    const nz = Math.max(1, Math.ceil((maxZ - minZ) / cell));
    const grid = new Map(); // cellIdx → triIdx[]

    const cellOf = (x, z) => {
        const cx = Math.min(nx - 1, Math.max(0, Math.floor((x - minX) / cell)));
        const cz = Math.min(nz - 1, Math.max(0, Math.floor((z - minZ) / cell)));
        return cx * nz + cz;
    };

    for (let t = 0; t < triCount; t++) {
        const o = t * 9;
        const xs = [positions[o], positions[o + 3], positions[o + 6]];
        const zs = [positions[o + 2], positions[o + 5], positions[o + 8]];
        const cx0 = Math.min(nx - 1, Math.max(0, Math.floor((Math.min(...xs) - minX) / cell)));
        const cx1 = Math.min(nx - 1, Math.max(0, Math.floor((Math.max(...xs) - minX) / cell)));
        const cz0 = Math.min(nz - 1, Math.max(0, Math.floor((Math.min(...zs) - minZ) / cell)));
        const cz1 = Math.min(nz - 1, Math.max(0, Math.floor((Math.max(...zs) - minZ) / cell)));
        for (let cx = cx0; cx <= cx1; cx++) {
            for (let cz = cz0; cz <= cz1; cz++) {
                const k = cx * nz + cz;
                const arr = grid.get(k);
                if (arr) arr.push(t);
                else grid.set(k, [t]);
            }
        }
    }

    function sample(x, z) {
        const candidates = grid.get(cellOf(x, z));
        if (!candidates) return null;
        let best = null;
        for (const t of candidates) {
            const o = t * 9;
            const ax = positions[o],     az = positions[o + 2];
            const bx = positions[o + 3], bz = positions[o + 5];
            const cx = positions[o + 6], cz = positions[o + 8];
            // Baryzentrische Koordinaten in XZ
            const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
            if (Math.abs(d) < 1e-12) continue;
            const w0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
            const w1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
            const w2 = 1 - w0 - w1;
            if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) continue;
            const y = w0 * positions[o + 1] + w1 * positions[o + 4] + w2 * positions[o + 7];
            if (best === null || y > best) best = y; // höchstes Dreieck gewinnt (Oberfläche)
        }
        return best;
    }

    return { sample, bounds: { minX, maxX, minZ, maxZ } };
}

