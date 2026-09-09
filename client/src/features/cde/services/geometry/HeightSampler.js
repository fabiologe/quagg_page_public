/**
 * Der Höhen-Sampler — LEICHT, ohne three, ohne web-ifc, ohne Wörterbuch
 * (2026-09-07).
 *
 * Er wohnte in TerrainMesh.js, und das war fürs Rechnen egal — bis der
 * Kernel-Worker ihn über SurfaceOps importierte: TerrainMesh zieht
 * MeshAcquire, MeshAcquire zieht three, web-ifc und das 4.3-Wörterbuch, und
 * der Worker-Chunk wuchs von 26 kB auf 4,7 MB. Ein Worker, der nur Raster
 * rechnet, lud damit die halbe Anwendung — auf dem Tablet bei jedem Start.
 *
 * Deshalb steht er jetzt hier, für sich; TerrainMesh exportiert ihn weiter,
 * damit die Aufrufer unberührt bleiben. Der Import-Wächter prüft den
 * Worker-Graphen seither TRANSITIV (keineFremdimporte.test.js).
 */

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
