/**
 * Luftbild für die EZG-Karte: Kachel-Mosaik von Esris öffentlichem
 * World_Imagery-Dienst — dieselbe XYZ-Kachelquelle, die auch BaseMap.vue
 * (Leaflet, u.a. im flood-wave-Tool) über
 * L.tileLayer('.../World_Imagery/MapServer/tile/{z}/{y}/{x}') nutzt.
 *
 * Ersetzt den früheren Single-Request-Ansatz über MapServer/export: der
 * bricht empirisch bei ~1 Megapixel mit HTTP 500 ab und zwingt Auflösung und
 * Abdeckung in denselben festen Pixel-Rahmen. Mit Kacheln sind beide
 * unabhängig wählbar — Auflösung folgt aus dem Zoom, Abdeckung aus der
 * Kachelanzahl, keine feste Obergrenze mehr.
 *
 * Fetch + Stitching + PNG-Encode laufen in ezgAerialWorker.js (Web Worker,
 * OffscreenCanvas) statt auf dem Main-Thread: Profiling zeigte, dass allein
 * das abschließende canvas.toBlob() für ein großes Mosaik (13×13 Kacheln,
 * ~11 Megapixel) mehrere Sekunden dauert — mit Abstand der größte Anteil an
 * der Ladezeit, während dem die LoadingOverlay-Animation sichtbar hängen
 * blieb (Nutzer-Feedback). Nur die Tile-Mathematik (billig, rein
 * arithmetisch) bleibt hier auf dem Main-Thread.
 */
import { lon2tileX, lat2tileY, tileX2lon, tileY2lat, chooseZoomForTileBudget } from '../utils/tileMath.js';

const TILE_SIZE = 256;
const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';
// Großzügiger als bei den Höhenkacheln (Fotos sind klein, ~20-100 KB/Kachel).
// 16x16 statt 10x10 (nochmal hochgesetzt, seit useEzgLayer.js refresh() den
// initialen Ausschnitt auf ~3x Netzspannweite vergrößert hat) — sonst würde
// chooseZoomForTileBudget den größeren Ausschnitt sofort mit einem gröberen
// Zoom erkaufen, statt die zusätzliche Fläche in guter Auflösung zu zeigen.
// MAX_ZOOM = Esris tatsächliches Maximum (19) — das schützt vor Unschärfe im
// Nahbereich, OHNE das alte "Kanäle fallen aus dem Bild"-Problem zurückzuholen:
// MAX_TILES_PER_SIDE bleibt der eigentliche Deckel, chooseZoomForTileBudget()
// fällt bei größeren Ausschnitten weiterhin automatisch auf einen gröberen
// Zoom zurück, sobald 19 das Kachel-Budget sprengen würde.
const MAX_TILES_PER_SIDE = 16;
const MAX_ZOOM = 19;

let aerialWorker = null;
let aerialReqId = 0;
const pendingAerialRequests = new Map(); // reqId -> {resolve, reject}

function ensureAerialWorker() {
    if (aerialWorker) return aerialWorker;
    aerialWorker = new Worker(new URL('../workers/ezgAerialWorker.js', import.meta.url), { type: 'module' });
    aerialWorker.onmessage = (e) => {
        const msg = e.data;
        const pending = pendingAerialRequests.get(msg.reqId);
        if (!pending) return; // veraltete/unbekannte Antwort
        pendingAerialRequests.delete(msg.reqId);
        if (msg.type === 'result') pending.resolve(msg);
        else pending.reject(new Error(msg.message || 'Luftbild-Worker-Fehler'));
    };
    aerialWorker.onerror = (err) => {
        for (const pending of pendingAerialRequests.values()) pending.reject(err);
        pendingAerialRequests.clear();
    };
    return aerialWorker;
}

/**
 * Holt und stitcht das Luftbild-Mosaik für eine WGS84-Bounding-Box.
 * @param {{minLon:number,minLat:number,maxLon:number,maxLat:number}} wgs84Bounds
 * @returns {Promise<{imageUrl: string, actualWgs84Bounds: {minLon:number,minLat:number,maxLon:number,maxLat:number}}>}
 */
export async function fetchAerialImage(wgs84Bounds) {
    const z = chooseZoomForTileBudget(wgs84Bounds, MAX_ZOOM, MAX_TILES_PER_SIDE);
    const xMin = lon2tileX(wgs84Bounds.minLon, z);
    const xMax = lon2tileX(wgs84Bounds.maxLon, z);
    const yMin = lat2tileY(wgs84Bounds.maxLat, z);
    const yMax = lat2tileY(wgs84Bounds.minLat, z);

    const tilesX = xMax - xMin + 1;
    const tilesY = yMax - yMin + 1;

    const worker = ensureAerialWorker();
    const reqId = ++aerialReqId;
    const { buffer, mimeType } = await new Promise((resolve, reject) => {
        pendingAerialRequests.set(reqId, { resolve, reject });
        worker.postMessage({ type: 'fetch', reqId, tileUrl: TILE_URL, tileSize: TILE_SIZE, z, xMin, yMin, tilesX, tilesY });
    });

    const blob = new Blob([buffer], { type: mimeType });
    const imageUrl = URL.createObjectURL(blob);

    // Tatsächliche geografische Ausdehnung des Mosaiks — kachel-ausgerichtet,
    // daher meist etwas größer als die angefragte Box. useEzgLayer.js
    // rechnet diese (nicht die ursprünglich angefragte) Box zurück in lokale
    // Koordinaten, damit das <image> in IsybauViewer.vue korrekt sitzt.
    const actualWgs84Bounds = {
        minLon: tileX2lon(xMin, z),
        maxLon: tileX2lon(xMax + 1, z),
        maxLat: tileY2lat(yMin, z),
        minLat: tileY2lat(yMax + 1, z)
    };

    return { imageUrl, actualWgs84Bounds };
}
