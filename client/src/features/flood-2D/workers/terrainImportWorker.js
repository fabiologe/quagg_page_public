/**
 * terrainImportWorker.js
 *
 * Führt Parsing, Geometrie-Analyse und TIN/IDW-Rasterung großer XYZ-Punktwolken
 * off-main-thread aus, damit die UI bei riesigen Dateien nicht einfriert.
 *
 * Ablauf (Punkte bleiben zwischen den Phasen im Worker → kein Re-Parse):
 *   { type:'analyze', text }            → { type:'analyzed', analysis }
 *   { type:'build', cellsize, method }  → { type:'built', gridData(Transferable), header, stats }
 *   Fortschritt:                          { type:'progress', value }
 *   Fehler:                               { type:'error', message }
 */

import {
    parseXyzPoints,
    analyzeGeometry,
    buildHeader,
    buildRegularDem,
    makeTerrainObject,
} from '../middleware/importers/xyzTerrainImporter.js';

let points = null;      // Float64Array [x,y,z,…] — über Phasen erhalten
let lastAnalysis = null;

self.onmessage = ({ data }) => {
    try {
        if (data.type === 'analyze') {
            points = parseXyzPoints(data.text);
            lastAnalysis = analyzeGeometry(points);
            self.postMessage({ type: 'analyzed', analysis: lastAnalysis });
            return;
        }

        if (data.type === 'build') {
            if (!points || !lastAnalysis) throw new Error('Vor dem Build muss analyze laufen.');
            const cs = data.cellsize > 0 ? data.cellsize : lastAnalysis.suggestedCellsize;
            const header = buildHeader(lastAnalysis.extent, cs);
            const { data: grid } = buildRegularDem(points, header, {
                method: data.method ?? 'tin',
                onProgress: (value) => self.postMessage({ type: 'progress', value }),
            });
            const terrain = makeTerrainObject(grid, header);
            // gridData als Transferable zurück (kein Kopieren des großen Buffers).
            self.postMessage(
                { type: 'built', terrain },
                [terrain.gridData.buffer],
            );
            return;
        }

        throw new Error(`Unbekannter Worker-Befehl: ${data.type}`);
    } catch (err) {
        self.postMessage({ type: 'error', message: err?.message ?? String(err) });
    }
};
