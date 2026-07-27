/**
 * Höhenraster für die EZG-Karte: AWS/Mapzen Terrarium-PNG-Kacheln, über den
 * Backend-Proxy geholt (backend/app/api/external.py: /elevation-tile) — der
 * Original-S3-Endpoint liefert keinen CORS-Header, ein direkter fetch() aus
 * dem Browser würde also blockiert.
 */
import { lon2tileX, lat2tileY, tileX2lon, tileY2lat, chooseZoomForTileBudget } from '../utils/tileMath.js';

const TILE_SIZE = 256;
const PROXY_URL = '/FastAPI/external/elevation-tile';
// Deckelt das Kachel-Mosaik auf max. 4x4 Kacheln.
const MAX_TILES_PER_SIDE = 4;
// Terrarium (SRTM/ASTER/EU-DEM) hat ~30m native Auflösung — Zoom 12 entspricht
// bereits ca. 30-40m/Pixel in Mitteleuropa. Höhere Zoomstufen liefern keine
// echten Zusatzdetails, sondern nur hochskalierte Werte: das Höhenraster wird
// dadurch künstlich "blockig" (Staircase-Artefakte), Marching Squares erzeugt
// dann tausende überflüssige Mini-Segmente aus reinem Interpolationsrauschen
// statt echter Geländeform — spürbar langsames Rendering ohne Zusatznutzen.
const MAX_ZOOM = 12;

/** Terrarium-Kachel laden und zu einem Float32Array aus Metern dekodieren. */
async function fetchTileElevations(z, x, y) {
    const response = await fetch(`${PROXY_URL}?z=${z}&x=${x}&y=${y}`);
    if (!response.ok) {
        throw new Error(`Höhenkachel ${z}/${x}/${y} fehlgeschlagen (HTTP ${response.status})`);
    }
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = document.createElement('canvas');
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);

    const elevations = new Float32Array(TILE_SIZE * TILE_SIZE);
    for (let i = 0; i < TILE_SIZE * TILE_SIZE; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        // Terrarium-Kodierung: Höhe (m) = (R*256 + G + B/256) - 32768
        elevations[i] = r * 256 + g + b / 256 - 32768;
    }
    return elevations;
}

/**
 * Holt und stitcht das Höhenraster für eine WGS84-Bounding-Box.
 * @param {{minLon:number,minLat:number,maxLon:number,maxLat:number}} wgs84Bounds
 * @returns {Promise<{raster: Float32Array, width: number, height: number, pixelToWGS84: (col:number,row:number) => [number,number], tileParams: {z:number,xMin:number,yMin:number,tileSize:number}}>}
 */
export async function fetchElevationGrid(wgs84Bounds) {
    const z = chooseZoomForTileBudget(wgs84Bounds, MAX_ZOOM, MAX_TILES_PER_SIDE);
    const xMin = lon2tileX(wgs84Bounds.minLon, z);
    const xMax = lon2tileX(wgs84Bounds.maxLon, z);
    const yMin = lat2tileY(wgs84Bounds.maxLat, z);
    const yMax = lat2tileY(wgs84Bounds.minLat, z);

    const tilesX = xMax - xMin + 1;
    const tilesY = yMax - yMin + 1;
    const width = tilesX * TILE_SIZE;
    const height = tilesY * TILE_SIZE;
    const raster = new Float32Array(width * height);

    const fetches = [];
    for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
            const destTx = tx, destTy = ty;
            fetches.push(
                fetchTileElevations(z, xMin + tx, yMin + ty).then((tileData) => {
                    for (let row = 0; row < TILE_SIZE; row++) {
                        const destOffset = (destTy * TILE_SIZE + row) * width + destTx * TILE_SIZE;
                        raster.set(tileData.subarray(row * TILE_SIZE, (row + 1) * TILE_SIZE), destOffset);
                    }
                })
            );
        }
    }
    await Promise.all(fetches);

    // Fraktionaler Pixel-Index im gestitchten Raster -> Lon/Lat (inverse
    // Web-Mercator-Kachelformel, keine proj4-Abhängigkeit für dieses Bein).
    const pixelToWGS84 = (col, row) => {
        const tileFracX = xMin + col / TILE_SIZE;
        const tileFracY = yMin + row / TILE_SIZE;
        return [tileX2lon(tileFracX, z), tileY2lat(tileFracY, z)];
    };

    // Rohe Parameter zusätzlich zur pixelToWGS84-Closure: Funktionen sind
    // nicht per postMessage übertragbar (structured clone) — der
    // Kontur-Worker (ezgContourWorker.js) rekonstruiert dieselbe Formel
    // daraus auf seiner Seite.
    return { raster, width, height, pixelToWGS84, tileParams: { z, xMin, yMin, tileSize: TILE_SIZE } };
}
