/**
 * SgcGenerator — erzeugt die LISFLOOD Sub-Grid-Channel-Raster (SGC) aus einer
 * gezeichneten Kanal-Mittellinie. SGC erlaubt Gerinne SCHMALER als eine
 * Rasterzelle: Der Solver rechnet pro Zelle ein eingebettetes Gerinne mit
 * eigener Breite/Sohle (sgc.cpp; erzwingt den acceleration-Solver).
 *
 * Raster-Semantik (alle in header-Form, bottom-up):
 *   SGCwidth  Gerinnebreite in m  (0 = kein Gerinne in dieser Zelle)
 *   SGCbed    Sohlhöhe in m NHN   (-9999 außerhalb)
 *   SGCbank   Böschungsoberkante  (= DEM-Höhe; -9999 außerhalb)
 */

/**
 * @param {object} channel
 *   { polyline: [{x, y, terrainZ}],          Welt-Koordinaten + Gelände-Z am Vertex
 *     width: number,                          Gerinnebreite [m]
 *     bedMode: 'depth'|'absolute',
 *     bedDepth: number,                       [m] unter Gelände (bedMode 'depth')
 *     bedZStart: number, bedZEnd: number }    m NHN (bedMode 'absolute')
 * @param {Float32Array} demData  DEM in header-Form (bottom-up), ggf. Export-Auflösung
 * @param {object} header         { ncols, nrows, cellsize, xll/xllcorner, yll/yllcorner }
 * @returns {{ width: Float32Array, bed: Float32Array, bank: Float32Array, cellCount: number }}
 */
export function generateSgcRasters(channel, demData, header) {
    const { ncols, nrows, cellsize } = header;
    const xll = header.xll !== undefined ? header.xll : header.xllcorner;
    const yll = header.yll !== undefined ? header.yll : header.yllcorner;

    const size = ncols * nrows;
    const width = new Float32Array(size);          // 0 = kein Gerinne
    const bed   = new Float32Array(size).fill(-9999);
    const bank  = new Float32Array(size).fill(-9999);

    const pts = channel.polyline || [];
    if (pts.length < 2) return { width, bed, bank, cellCount: 0 };

    // Sohlhöhe an den Vertices bestimmen, dann über Bogenlänge interpolieren
    const segLens = [];
    let totalLen = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        const L = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
        segLens.push(L);
        totalLen += L;
    }
    const vertexBedZ = pts.map((p, i) => {
        if (channel.bedMode === 'absolute') {
            const s = segLens.slice(0, i).reduce((a, b) => a + b, 0);
            const t = totalLen > 0 ? s / totalLen : 0;
            return (channel.bedZStart ?? 0) + t * ((channel.bedZEnd ?? channel.bedZStart ?? 0) - (channel.bedZStart ?? 0));
        }
        return (p.terrainZ ?? 0) - (channel.bedDepth ?? 1.5);
    });

    // Stempel-Korridor: Zellen, deren Zentrum näher als max(width, cellsize)/2
    // an einem Segment liegt (mindestens eine Zelle breit, sonst Lücken bei
    // Gerinnen schmaler als das Raster — genau der SGC-Anwendungsfall).
    const halfCorridor = Math.max(channel.width ?? cellsize, cellsize) / 2;
    const stamped = new Set();
    let cellCount = 0;

    for (let i = 0; i < pts.length - 1; i++) {
        const ax = pts[i].x,     ay = pts[i].y;
        const bx = pts[i + 1].x, by = pts[i + 1].y;
        const zA = vertexBedZ[i], zB = vertexBedZ[i + 1];
        const segLen2 = (bx - ax) ** 2 + (by - ay) ** 2;

        // BBox des Segments + Korridor → Zellbereich
        const minC = Math.max(0, Math.floor((Math.min(ax, bx) - halfCorridor - xll) / cellsize));
        const maxC = Math.min(ncols - 1, Math.ceil((Math.max(ax, bx) + halfCorridor - xll) / cellsize));
        const minR = Math.max(0, Math.floor((Math.min(ay, by) - halfCorridor - yll) / cellsize));
        const maxR = Math.min(nrows - 1, Math.ceil((Math.max(ay, by) + halfCorridor - yll) / cellsize));

        for (let r = minR; r <= maxR; r++) {
            const cy = yll + r * cellsize;
            for (let c = minC; c <= maxC; c++) {
                const idx = r * ncols + c;
                if (stamped.has(idx)) continue;
                const cx = xll + c * cellsize;

                // Punkt-Segment-Distanz + Projektionsparameter t
                let t = segLen2 > 0 ? ((cx - ax) * (bx - ax) + (cy - ay) * (by - ay)) / segLen2 : 0;
                t = Math.min(1, Math.max(0, t));
                const dx = cx - (ax + t * (bx - ax));
                const dy = cy - (ay + t * (by - ay));
                if (dx * dx + dy * dy > halfCorridor * halfCorridor) continue;

                if (demData[idx] <= -9990) continue; // NoData-DEM überspringen

                stamped.add(idx);
                cellCount++;
                width[idx] = channel.width ?? cellsize;
                bed[idx]   = zA + t * (zB - zA);
                bank[idx]  = demData[idx]; // DEM ist die Böschungsoberkante
            }
        }
    }

    return { width, bed, bank, cellCount };
}

export const SgcGenerator = { generateSgcRasters };
