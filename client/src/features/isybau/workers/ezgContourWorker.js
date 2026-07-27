/**
 * ezgContourWorker.js — Höhenlinien-Berechnung (Marching Squares + proj4-
 * Umrechnung + Verkettung + Douglas-Peucker) im Web Worker.
 *
 * Lief vorher komplett synchron auf dem Main-Thread (useEzgLayer.js
 * recomputeContoursFromCache()) — bei größeren Höhenrastern (die "viel mehr
 * initial laden"-Änderung vergrößert den angefragten Ausschnitt zusätzlich)
 * blockierte das den Main-Thread lange genug, dass sogar die
 * LoadingOverlay-Animation sichtbar hängen blieb (Nutzer-Feedback). Hier
 * läuft NUR noch diese Berechnung; Fetch/Decode des Höhenrasters bleibt auf
 * dem Main-Thread (ElevationService.js — reiner async fetch, blockiert
 * ohnehin nicht).
 *
 * Protokoll:
 *   → { type:'compute', reqId, raster:Float32Array, width, height,
 *       interval, epsg, tileParams:{z,xMin,yMin,tileSize} }
 *   ← { type:'result', reqId, positions:Float32Array } [transfer]
 *     (flaches x,y,0, x,y,0-Array, ein Punktpaar pro Liniensegment — exakt
 *     das Format, das LineSegmentsGeometry.setPositions() in
 *     useContourGpuLayer.js erwartet. Elevation-Zuordnung wird NICHT mehr
 *     mitgeliefert: die Gruppierung nach Höhenlinie dient hier nur noch dem
 *     korrekten Verketten INNERHALB eines Levels (stitchSegmentsToPolylines
 *     darf Segmente verschiedener Level nicht mischen) — der Renderer selbst
 *     färbt alle Level gleich (violett+giftgrün Halo), es gibt aktuell
 *     keinen Konsumenten für Elevation-Metadaten.
 *
 * WICHTIG (Performance): Das Ergebnis geht bewusst als FLACHES, per Transfer
 * (zero-copy) übertragenes Float32Array zurück, nicht als verschachtelte
 * {elevation, lines:[{x,y},...]}-Objekte (frühere Version). Profiling
 * (Playwright, Long-Task-API) zeigte: die verschachtelte Variante kostete auf
 * dem EMPFANGENDEN (Main-)Thread mehrere Sekunden strukturiertes Klonen
 * (tausende einzelne {x,y}-Objekte) — GENAU die Art von Hänger, die der
 * ganze Worker-Umbau eigentlich vermeiden sollte. Ein Float32Array via
 * Transferable ist dagegen ein reiner Zeiger-Übergang, praktisch kostenlos.
 *
 * pixelToLocal wird HIER aus den rohen Kachel-Parametern rekonstruiert
 * (dieselbe Formel wie ElevationService.js' pixelToWGS84 + proj4), weil
 * Funktionen nicht per postMessage übertragbar sind (structured clone).
 */
import { marchingSquares, segmentsToLocalCoords, groupSegmentsByElevation, stitchSegmentsToPolylines, simplifyPolyline } from '../utils/contourGenerator.js';
import { tileX2lon, tileY2lat } from '../utils/tileMath.js';
import proj4 from 'proj4';
// Reiner Side-Effect-Import: registriert dieselben proj4.defs() (GK2-5/UTM32/33)
// wie geoBounds.js auf dem Main-Thread — jeder Worker hat einen eigenen
// globalThis, die Registrierung dort ist unabhängig und muss separat passieren.
import '../utils/KostraService.js';

// Dieselbe Toleranz wie vorher in useEzgLayer.js (CONTOUR_SIMPLIFY_EPSILON).
const CONTOUR_SIMPLIFY_EPSILON = 1.5;

self.onmessage = (e) => {
    const msg = e.data;
    if (msg.type !== 'compute') return;
    const { reqId, raster, width, height, interval, epsg, tileParams } = msg;

    if (!(interval > 0)) {
        self.postMessage({ type: 'result', reqId, positions: new Float32Array(0) }, []);
        return;
    }

    const { z, xMin, yMin, tileSize } = tileParams;
    const pixelToLocal = (col, row) => {
        const tileFracX = xMin + col / tileSize;
        const tileFracY = yMin + row / tileSize;
        const lon = tileX2lon(tileFracX, z);
        const lat = tileY2lat(tileFracY, z);
        return proj4('EPSG:4326', epsg, [lon, lat]);
    };

    const segments = marchingSquares(raster, width, height, interval);
    const localSegments = segmentsToLocalCoords(segments, pixelToLocal);
    const byLevel = groupSegmentsByElevation(localSegments);

    const positions = [];
    for (const group of byLevel) {
        const lines = stitchSegmentsToPolylines(group.segments).map((pts) =>
            simplifyPolyline(pts, CONTOUR_SIMPLIFY_EPSILON)
        );
        for (const line of lines) {
            for (let i = 0; i < line.length - 1; i++) {
                const a = line[i], b = line[i + 1];
                positions.push(a.x, a.y, 0, b.x, b.y, 0);
            }
        }
    }

    const positionsArray = new Float32Array(positions);
    self.postMessage({ type: 'result', reqId, positions: positionsArray }, [positionsArray.buffer]);
};
