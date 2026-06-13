import { BoundaryTools } from './BoundaryTools.js';
import { idwFillNoData } from './RasterIDW.js';

/**
 * Rasterizer.js
 * FIXED: Explicit baking logic with BBox optimization and Raycasting.
 */

/**
 * Parses XYZ text data and creates a Grid object.
 * (Kept for compatibility with InputGenerator/Worker usage)
 * @param {string} xyzString - Raw XYZ text data
 * @returns {object} { header, data: Float32Array }
 */
export function createDemFromXYZ(xyzString) {
    if (!xyzString) throw new Error("No XYZ data provided");

    // 1. Parse lines to points
    const lines = xyzString.trim().split('\n');
    const points = [];
    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
            points.push({
                x: parseFloat(parts[0]),
                y: parseFloat(parts[1]),
                z: parseFloat(parts[2])
            });
        }
    }

    // 2. Determine Grid Geometry
    const header = BoundaryTools.getGridHeader(points);
    const { ncols, nrows, cellsize, xll, yll } = header;

    // 3. Populate Grid
    const data = new Float32Array(ncols * nrows).fill(-9999);

    for (const p of points) {
        const col = Math.round((p.x - xll) / cellsize);
        // Ensure standard Bottom-Up raster storage (row 0 is south)
        const row = Math.round((p.y - yll) / cellsize);

        if (col >= 0 && col < ncols && row >= 0 && row < nrows) {
            const idx = row * ncols + col;
            data[idx] = p.z;
        }
    }

    // 4. Fill Gap Artifacts
    // For regular grids (all cells hit by at least one point), simple neighbor averaging suffices.
    // For scattered/irregular XYZ clouds, IDW fills remaining NoData cells properly.
    const noDataCount = data.filter(v => v <= -9000).length;

    if (noDataCount === 0) {
        // Perfect grid — nothing to fill
    } else if (noDataCount < data.length * 0.9) {
        // Some gaps: IDW interpolation from all source points
        const filled = idwFillNoData(data, header, points, {
            searchRadius: cellsize * 8,
            power:        2.0,
            maxPoints:    16,
            zClamp:       true,
        });
        // Fallback: simple neighbor averaging for any remaining NoData after IDW
        BoundaryTools.interpolateGaps(filled, ncols, nrows, -9999);
        return { header, data: filled };
    } else {
        // Too many gaps for IDW to be meaningful — simple fallback
        BoundaryTools.interpolateGaps(data, ncols, nrows, -9999);
    }

    return { header, data };
}

/**
 * Resampelt ein Raster auf eine neue Zellweite (Export-Auflösung für den
 * High-End-Solver). Quelle bleibt unverändert.
 *
 * Header-Konventionen in dieser Codebase (wichtig!):
 *   - `xll`/`yll`           = Zentrum der Zelle (0,0)  → von getGridIndex etc. bevorzugt
 *   - `xllcorner`/`yllcorner` = echte Raster-Ecke      → von gridToASC geschrieben
 *   Editor-Header (parseXYZ) führen nur `xllcorner` mit ZENTREN-Semantik (kein xll),
 *   daher wird der Zentren-Ursprung hier über dieselbe Fallback-Regel aufgelöst
 *   wie bei allen Konsumenten: `xll ?? xllcorner`. Die ECKE bleibt beim Resampling
 *   fix; der Output-Header trägt BEIDE Felder explizit und konsistent.
 *
 * NoData (-9999) blutet nie in Mittelwerte ein: Gewichte werden über gültige
 * Nachbarn renormalisiert; sind alle 4 ungültig → -9999.
 *
 * @param {Float32Array} data    Quell-Raster, bottom-up (row 0 = Süden)
 * @param {object} header        { ncols, nrows, cellsize, xll/xllcorner, yll/yllcorner }
 * @param {number} targetCellsize
 * @param {'bilinear'|'nearest'} method
 * @returns {{ data: Float32Array, header: object }}
 */
export function resampleGrid(data, header, targetCellsize, method = 'bilinear') {
    const { ncols, nrows, cellsize } = header;
    if (!(targetCellsize > 0)) throw new Error(`resampleGrid: ungültige Ziel-Zellweite ${targetCellsize}`);

    // Zentren-Ursprung der Quelle (Konvention wie getGridIndex/maskBuildings)
    const srcCx = header.xll !== undefined ? header.xll : header.xllcorner;
    const srcCy = header.yll !== undefined ? header.yll : header.yllcorner;
    // Echte Ecke — bleibt beim Resampling fix
    const cornerX = srcCx - cellsize / 2;
    const cornerY = srcCy - cellsize / 2;

    const tCols = Math.max(1, Math.round(ncols * cellsize / targetCellsize));
    const tRows = Math.max(1, Math.round(nrows * cellsize / targetCellsize));
    if (tCols * tRows > 1e8) {
        throw new Error(`resampleGrid: Zielraster ${tCols}×${tRows} = ${(tCols * tRows / 1e6).toFixed(0)} Mio Zellen überschreitet das Limit (100 Mio).`);
    }

    const out = new Float32Array(tCols * tRows);
    const ND = -9990;

    for (let r = 0; r < tRows; r++) {
        // Welt-Y des Ziel-Zellzentrums → fraktionaler Quell-Zeilenindex (bottom-up)
        const wy = cornerY + (r + 0.5) * targetCellsize;
        const fy = (wy - srcCy) / cellsize;
        for (let c = 0; c < tCols; c++) {
            const wx = cornerX + (c + 0.5) * targetCellsize;
            const fx = (wx - srcCx) / cellsize;

            let value;
            if (method === 'nearest') {
                const sc = Math.min(ncols - 1, Math.max(0, Math.round(fx)));
                const sr = Math.min(nrows - 1, Math.max(0, Math.round(fy)));
                value = data[sr * ncols + sc];
            } else {
                // Bilinear mit NoData-sicherer Gewichts-Renormalisierung
                const c0 = Math.min(ncols - 1, Math.max(0, Math.floor(fx)));
                const r0 = Math.min(nrows - 1, Math.max(0, Math.floor(fy)));
                const c1 = Math.min(ncols - 1, c0 + 1);
                const r1 = Math.min(nrows - 1, r0 + 1);
                const tx = Math.min(1, Math.max(0, fx - c0));
                const ty = Math.min(1, Math.max(0, fy - r0));

                const z00 = data[r0 * ncols + c0], w00 = (1 - tx) * (1 - ty);
                const z10 = data[r0 * ncols + c1], w10 = tx * (1 - ty);
                const z01 = data[r1 * ncols + c0], w01 = (1 - tx) * ty;
                const z11 = data[r1 * ncols + c1], w11 = tx * ty;

                let wSum = 0, zSum = 0;
                if (z00 > ND) { wSum += w00; zSum += z00 * w00; }
                if (z10 > ND) { wSum += w10; zSum += z10 * w10; }
                if (z01 > ND) { wSum += w01; zSum += z01 * w01; }
                if (z11 > ND) { wSum += w11; zSum += z11 * w11; }
                value = wSum > 1e-9 ? zSum / wSum : -9999;
            }
            out[r * tCols + c] = value;
        }
    }

    return {
        data: out,
        header: {
            ncols: tCols,
            nrows: tRows,
            cellsize: targetCellsize,
            xllcorner: cornerX,
            yllcorner: cornerY,
            xll: cornerX + targetCellsize / 2,
            yll: cornerY + targetCellsize / 2,
            NODATA_value: -9999
        }
    };
}

/**
 * Helper to convert Grid to ASC string.
 * (Kept for InputGenerator usage)
 */
export function gridToASC(data, header) {
    let content = '';
    content += `ncols         ${header.ncols}\n`;
    content += `nrows         ${header.nrows}\n`;
    const x = header.xllcorner !== undefined ? header.xllcorner : header.xll;
    const y = header.yllcorner !== undefined ? header.yllcorner : header.yll;
    content += `xllcorner     ${x.toFixed(4)}\n`;
    content += `yllcorner     ${y.toFixed(4)}\n`;
    content += `cellsize      ${header.cellsize.toFixed(4)}\n`;
    content += `NODATA_value  -9999\n`;

    // gridData is stored bottom-up (row 0 = south). ASC format requires north first.
    // Write rows in reverse: row nrows-1 (north) first, row 0 (south) last.
    for (let i = header.nrows - 1; i >= 0; i--) {
        const start = i * header.ncols;
        const end = start + header.ncols;
        const rowData = data.subarray(start, end);
        content += rowData.join(' ') + '\n';
    }
    return content;
}

/**
 * Main Baking Function (Strict Implementation)
 * @param {Float32Array} baseRaster - Source Raster
 * @param {object} gridInfo - Header info { ncols, nrows, cellsize, xll, yll }
 * @param {Array} modifications - Array of modification objects
 * @returns {Float32Array} New baked raster
 */
export function bakeTerrain(baseRaster, gridInfo, modifications) {
    // Safety First: Copy the raster
    const newRaster = new Float32Array(baseRaster);

    if (!modifications || modifications.length === 0) {
        return newRaster;
    }

    const { ncols, nrows, cellsize } = gridInfo;
    const xll = gridInfo.xll !== undefined ? gridInfo.xll : gridInfo.xllcorner;
    const yll = gridInfo.yll !== undefined ? gridInfo.yll : gridInfo.yllcorner;

    // Helper: Grid to World (Cell Center)
    // xll is assumed to be corner. Center = corner + col * size + size/2
    // BUT legacy code mostly used xll + col * size. adhering to "Standard" center logic often safer.
    // If col = round((x-xll)/cs), implies x ~ xll + col*cs.
    const getCellX = (c) => xll + c * cellsize;
    const getCellY = (r) => yll + r * cellsize;

    for (const mod of modifications) {
        // [AUDIT FIX]: applyBuilding() (+10m spike) has been deprecated and disabled.
        // Buildings should strictly use maskBuildingsAsNoData() to become NoData grids for the solver.
        if (mod.type === 'BUILDING') {
            console.warn(`[Rasterizer] Legacy applyBuilding requested for ${mod.properties?.name || 'Building'}. Ignored to prevent +10m UI contamination.`);
        }
    }

    return newRaster;
}

// Named Export Alias for compatibility if any old code calls it differently, 
// OR user requested strict "export function bakeTerrain" which is above.
// Also exporting burnBuildings as alias if needed by InputGenerator before refill? 
// No, Worker now calls bakeTerrain (or burnBuildings). I will export both names pointing to logic.
export const burnBuildings    = bakeTerrain;  // Legacy-Alias
export const burnModifications = bakeTerrain;  // Alias für non-BUILDING Mods

/**
 * NoData-Masking für Gebäude.
 *
 * Setzt alle Rasterzellen, die von einem Gebäude-Polygon überdeckt werden,
 * auf -9999 (LISFLOOD NoData = Zero-Flux-Boundary → Glaswand für den Solver).
 *
 * Vorteile gegenüber +Height-Strategie:
 *   - Keine 90°-Wände im DGM → keine numerischen Schockwellen (Sloshing)
 *   - Kein Wasseransammeln auf Gebäudedach
 *   - LISFLOOD behandelt NoData nativ als harte impermeble Grenze
 *
 * @param {Float32Array} baseRaster  - Quell-Raster (wird NICHT verändert)
 * @param {object}       header      - Grid-Header { ncols, nrows, cellsize, xll/xllcorner, yll/yllcorner }
 * @param {Array}        buildings   - Array von Modifikations-Objekten mit type='BUILDING'
 * @returns {Float32Array}           - Neues Raster mit maskierten Gebäudezellen
 */
export function maskBuildingsAsNoData(baseRaster, header, buildings) {
    const newRaster = new Float32Array(baseRaster); // Non-destructive copy

    if (!buildings || buildings.length === 0) return newRaster;

    const { ncols, nrows, cellsize } = header;
    const xll = header.xll !== undefined ? header.xll : header.xllcorner;
    const yll = header.yll !== undefined ? header.yll : header.yllcorner;

    // Zell-Mittelpunkt in Weltkoordinaten (identisch zu applyBuilding)
    const getCellX = (c) => xll + c * cellsize;
    const getCellY = (r) => yll + r * cellsize;

    let totalMasked = 0;

    for (const mod of buildings) {
        const geom  = mod.geometry;
        const props = mod.properties || {};

        if (!geom || geom.type !== 'Polygon' || !geom.coordinates?.length) continue;
        const polygon = geom.coordinates[0];

        // ─ 1. Bounding-Box-Check (Performance: reduziert PiP-Tests drastisch) ─
        let minC = ncols, maxC = -1, minR = nrows, maxR = -1;
        for (const p of polygon) {
            const c = Math.round((p[0] - xll) / cellsize);
            const r = Math.round((p[1] - yll) / cellsize);
            if (c < minC) minC = c;
            if (c > maxC) maxC = c;
            if (r < minR) minR = r;
            if (r > maxR) maxR = r;
        }
        // Auf gültigen Grid-Bereich klemmen
        minC = Math.max(0, minC - 1);
        maxC = Math.min(ncols - 1, maxC + 1);
        minR = Math.max(0, minR - 1);
        maxR = Math.min(nrows - 1, maxR + 1);

        if (maxC < 0 || maxR < 0 || minC >= ncols || minR >= nrows) continue; // Gebäude außerhalb Grid

        // ─ 2. BBox-Scan + Point-in-Polygon ──────────────────────────────
        let cellsMasked = 0;
        for (let r = minR; r <= maxR; r++) {
            const cy = getCellY(r);
            for (let c = minC; c <= maxC; c++) {
                if (isPointInPolygon(getCellX(c), cy, polygon)) {
                    // ─ 3. NoData injizieren (überschreibt auch bestehende Höhen) ─
                    newRaster[r * ncols + c] = -9999;
                    cellsMasked++;
                }
            }
        }
        totalMasked += cellsMasked;
        console.log(`[Rasterizer] maskBuildingsAsNoData: "${props.name ?? 'Gebäude'}" → ${cellsMasked} Zellen auf -9999 gesetzt (BBox [c:${minC}-${maxC}, r:${minR}-${maxR}])`);
    }

    console.log(`[Rasterizer] NoData-Masking abgeschlossen: ${totalMasked} Zellen gesamt maskiert.`);
    return newRaster;
}

/**
 * [DEPRECATED] Sub-function to apply a single building modification
 * Fixed: Function logic commented out to guarantee +10m Ghost Mutations cannot occur!
 */
function applyBuilding(raster, gridInfo, mod, getCellX, getCellY) {
    /*
    const { ncols, nrows, cellsize } = gridInfo;
    const xll = gridInfo.xll !== undefined ? gridInfo.xll : gridInfo.xllcorner;
    // ...
    // Legacy +10.0 injection logic ...
    */
    console.error("[Rasterizer] applyBuilding is deprecated!");
}

/**
 * Ray-Casting Algorithm (Strict Copy from prompt)
 */
function isPointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];
        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Compatibility Object Default Export (If legacy code expects `Rasterizer.method`)
export const Rasterizer = {
    createDemFromXYZ,
    gridToASC,
    resampleGrid,
    bakeTerrain,
    burnBuildings: bakeTerrain,
    maskBuildingsAsNoData,   // Phase 9: NoData-Strategie für Gebäude
    burnModifications: bakeTerrain,
    /**
     * Generates a Roughness Map (friction.asc).
     * @param {object} header 
     * @param {object} roughnessPolygons - GeoJSON
     * @param {number} defaultRoughness 
     * @returns {object|null} { header, data: Float32Array } or null
     */
    generateRoughnessMap(header, roughnessPolygons, defaultRoughness = 0.035) {
        if (!roughnessPolygons || !roughnessPolygons.features || roughnessPolygons.features.length === 0) {
            return null;
        }

        const { ncols, nrows, cellsize, xll, yll } = header;
        const frictionGrid = new Float32Array(ncols * nrows).fill(defaultRoughness);

        for (const feature of roughnessPolygons.features) {
            const val = feature.properties.manning || feature.properties.roughness;
            if (val && feature.geometry.type === 'Polygon') {
                const cells = BoundaryTools.getCellsInPolygon(feature.geometry.coordinates[0], cellsize, xll, yll);

                for (const cell of cells) {
                    const row = cell.y;
                    const col = cell.x;
                    if (row >= 0 && row < nrows && col >= 0 && col < ncols) {
                        const idx = row * ncols + col;
                        frictionGrid[idx] = parseFloat(val);
                    }
                }
            }
        }

        return { header, data: frictionGrid };
    },

    /**
     * Efficiently writes a Grid to MEMFS/FS without creating huge strings.
     * @param {object} fs - Emscripten FS object
     * @param {string} path - absolute path in MEMFS (e.g. '/terrain.asc')
     * @param {Float32Array} data 
     * @param {object} header 
     */
    writeGridToFS(fs, path, data, header) {
        if (!fs) throw new Error("FS object required for streaming write");

        const encoder = new TextEncoder();
        const stream = fs.open(path, 'w+');

        try {
            const writeLine = (str) => {
                const updatedStr = str + '\n';
                const buffer = encoder.encode(updatedStr);
                fs.write(stream, buffer, 0, buffer.length, undefined);
            };

            // Header
            writeLine(`ncols         ${header.ncols}`);
            writeLine(`nrows         ${header.nrows}`);
            const x = header.xllcorner !== undefined ? header.xllcorner : header.xll;
            const y = header.yllcorner !== undefined ? header.yllcorner : header.yll;
            writeLine(`xllcorner     ${x.toFixed(4)}`);
            writeLine(`yllcorner     ${y.toFixed(4)}`);
            writeLine(`cellsize      ${header.cellsize.toFixed(4)}`);
            writeLine(`NODATA_value  -9999`);

            // Body
            // gridData is stored bottom-up (row 0 = south). ASC format requires north first.
            // Write rows in reverse: row nrows-1 (north) first, row 0 (south) last.
            for (let i = header.nrows - 1; i >= 0; i--) {
                const start = i * header.ncols;
                const end = start + header.ncols;
                const rowData = data.subarray(start, end);
                writeLine(rowData.join(' '));
            }
        } finally {
            fs.close(stream);
        }
    }
};

// Also export standalone for consistency
export const writeGridToFS = Rasterizer.writeGridToFS;
