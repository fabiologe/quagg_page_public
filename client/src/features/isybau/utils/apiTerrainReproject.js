/**
 * apiTerrainReproject.js — wandelt die WGS84-Terrarium-Kacheln der EZG-Karte
 * (services/ElevationService.js, siehe cachedElevationGrids in
 * composables/useEzgLayer.js) in ein reguläres Raster im LOKALEN Netz-CRS um.
 *
 * Grund: die Terrarium-Kacheln liegen in Lon/Lat-Kachel-Pixel-Raum vor (nicht
 * gleichabständig in Metern, verzerrt mit der geografischen Breite), während
 * useTerrainLayer.js ein reguläres Meter-Raster erwartet (dieselbe Konvention
 * wie das manuell hochgeladene DGM, siehe xyzTerrainImporter.js/
 * makeTerrainObject). Statt useTerrainLayer.js anzufassen, wird hier
 * rückwärts pro Ziel-Rasterzelle (lokal, Meter) die WGS84-Position bestimmt
 * (proj4) und daraus bilinear aus der passenden Kachel gesampelt — Ergebnis
 * ist ein zur manuellen DGM-Form identisches Terrain-Objekt, das
 * useTerrainLayer.js unverändert konsumieren kann.
 */
import proj4 from 'proj4';
import { lon2tileXFrac, lat2tileYFrac } from './tileMath.js';

export const NODATA = -9999;

// Deckelt die Ziel-Rasterauflösung. Terrarium hat ~30m native Auflösung —
// ein feineres lokales Raster würde nur Interpolations-Scheindetail zeigen,
// siehe MIN_CELLSIZE.
export const API_FALLBACK_MAX_CELLS = 40_000;
const MIN_CELLSIZE = 30;

/**
 * Bilineare Höhenabfrage über alle gecachten WGS84-Kacheln (erste Kachel, die
 * die Koordinate abdeckt, gewinnt — Überlappungen zwischen nacheinander
 * geladenen Teilbereichen sind unkritisch, siehe useEzgLayer.js).
 *
 * @param {Array<{raster:Float32Array,width:number,height:number,tileParams:{z:number,xMin:number,yMin:number,tileSize:number}}>} grids
 * @param {number} lon
 * @param {number} lat
 * @returns {number|null}
 */
export function sampleWgs84Grids(grids, lon, lat) {
    for (const grid of grids) {
        const { raster, width, height, tileParams } = grid;
        const { z, xMin, yMin, tileSize } = tileParams;
        const col = (lon2tileXFrac(lon, z) - xMin) * tileSize;
        const row = (lat2tileYFrac(lat, z) - yMin) * tileSize;
        if (col < 0 || row < 0 || col > width - 1 || row > height - 1) continue;

        const col0 = Math.floor(col), row0 = Math.floor(row);
        const col1 = Math.min(col0 + 1, width - 1);
        const row1 = Math.min(row0 + 1, height - 1);
        const tx = col - col0, ty = row - row0;

        // Terrarium-Raster ist top-down (row 0 = Norden), row/col-Adressierung
        // hier ist reines Pixel-Raum-Sampling — keine Bottom-up-Konvention
        // nötig, die kommt erst beim Schreiben ins Ziel-terrain.gridData unten.
        const z00 = raster[row0 * width + col0];
        const z10 = raster[row0 * width + col1];
        const z01 = raster[row1 * width + col0];
        const z11 = raster[row1 * width + col1];
        const top = z00 + (z10 - z00) * tx;
        const bottom = z01 + (z11 - z01) * tx;
        return top + (bottom - top) * ty;
    }
    return null;
}

/**
 * Baut ein lokales Meter-Raster (bottom-up, identische Konvention wie
 * xyzTerrainImporter.js/makeTerrainObject) aus den gecachten WGS84-Kacheln.
 *
 * @param {Array} grids                                   cachedElevationGrids aus useEzgLayer.js
 * @param {string} epsg                                    Netz-CRS (proj4-Code, z.B. 'EPSG:25832')
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} localBounds  Ziel-Ausdehnung, lokale Meter
 * @param {{maxCells?:number}} [opts]
 * @returns {object|null}  terrain-Objekt (wie store.terrain) oder null, wenn keine einzige Zelle abgedeckt ist
 */
export function buildLocalTerrainFromWgs84Grids(grids, epsg, localBounds, opts = {}) {
    if (!grids || grids.length === 0 || !epsg) return null;

    const width = localBounds.maxX - localBounds.minX;
    const height = localBounds.maxY - localBounds.minY;
    if (!(width > 0) || !(height > 0)) return null;

    const maxCells = opts.maxCells ?? API_FALLBACK_MAX_CELLS;
    let cellsize = Math.max(MIN_CELLSIZE, Math.sqrt((width * height) / maxCells));
    let ncols = Math.max(2, Math.round(width / cellsize) + 1);
    let nrows = Math.max(2, Math.round(height / cellsize) + 1);
    while (ncols * nrows > maxCells) {
        cellsize *= 1.2;
        ncols = Math.max(2, Math.round(width / cellsize) + 1);
        nrows = Math.max(2, Math.round(height / cellsize) + 1);
    }

    const xll = localBounds.minX;
    const yll = localBounds.minY;
    const gridData = new Float32Array(ncols * nrows).fill(NODATA);
    let anyValid = false;

    for (let row = 0; row < nrows; row++) {
        const y = yll + row * cellsize; // row 0 = Süden (bottom-up), wie makeTerrainObject
        for (let col = 0; col < ncols; col++) {
            const x = xll + col * cellsize;
            const [lon, lat] = proj4(epsg, 'EPSG:4326', [x, y]);
            const val = sampleWgs84Grids(grids, lon, lat);
            if (val !== null && isFinite(val)) {
                gridData[row * ncols + col] = val;
                anyValid = true;
            }
        }
    }
    if (!anyValid) return null;

    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < gridData.length; i++) {
        const v = gridData[i];
        if (v <= -9000) continue;
        if (v < minZ) minZ = v;
        if (v > maxZ) maxZ = v;
    }
    if (!isFinite(minZ)) { minZ = 0; maxZ = 0; }

    const w = (ncols - 1) * cellsize;
    const h = (nrows - 1) * cellsize;

    return {
        gridData, ncols, nrows, cellsize,
        xllcorner: xll - cellsize / 2,
        yllcorner: yll - cellsize / 2,
        xll, yll, minZ, maxZ,
        center: { x: xll + w / 2, y: yll + h / 2 },
        bounds: { width: w || 100, height: h || 100 },
        stats: { cols: ncols, rows: nrows, cellsize, minZ, maxZ },
        source: 'api', // unterscheidet vom manuellen Upload (store.terrain hat dieses Feld nicht)
    };
}
