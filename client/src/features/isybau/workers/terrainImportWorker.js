/**
 * terrainImportWorker.js
 *
 * Führt Parsing, Geometrie-Analyse und Rasterung eines hochgeladenen DGM
 * (ESRI-ASCII-Grid ODER XYZ-Punktwolke) off-main-thread aus, damit die UI bei
 * großen Dateien nicht einfriert. Portiert von flood-2D/workers/terrainImportWorker.js,
 * erweitert um den direkten ESRI-ASCII-Grid-Pfad (kein TIN/IDW nötig, Datei ist
 * schon ein reguläres Raster).
 *
 * Ablauf (Zustand bleibt zwischen den Phasen im Worker → kein Re-Parse):
 *   { type:'analyze', text }            → { type:'analyzed', analysis }
 *   { type:'build', cellsize, method }  → { type:'built', terrain(gridData Transferable) }
 *   Fortschritt:                          { type:'progress', value }
 *   Fehler:                               { type:'error', message }
 */

import {
    parseEsriAsciiGrid,
    parseXyzPoints,
    analyzeGeometry,
    buildHeader,
    buildRegularDem,
    makeTerrainObject,
} from '../utils/xyzTerrainImporter.js';

let points = null;         // Float64Array [x,y,z,…] — über Phasen erhalten (XYZ-Pfad)
let esriGrid = null;       // { data, header } — über Phasen erhalten (ESRI-Grid-Pfad)
let lastAnalysis = null;

self.onmessage = ({ data }) => {
    try {
        if (data.type === 'analyze') {
            points = null;
            esriGrid = parseEsriAsciiGrid(data.text);
            if (esriGrid) {
                const { ncols, nrows, cellsize } = esriGrid.header;
                lastAnalysis = {
                    count: ncols * nrows,
                    isRegular: true,
                    detectedSpacing: cellsize,
                    suggestedCellsize: cellsize,
                    estCols: ncols,
                    estRows: nrows,
                    format: 'esri-ascii-grid',
                };
            } else {
                points = parseXyzPoints(data.text);
                lastAnalysis = { ...analyzeGeometry(points), format: 'xyz-points' };
            }
            self.postMessage({ type: 'analyzed', analysis: lastAnalysis });
            return;
        }

        if (data.type === 'build') {
            if (!lastAnalysis) throw new Error('Vor dem Build muss analyze laufen.');

            let terrain;
            if (esriGrid) {
                // Bereits ein reguläres Raster — keine Interpolation nötig, Zellweite steht fest.
                terrain = makeTerrainObject(esriGrid.data, esriGrid.header);
            } else {
                if (!points) throw new Error('Vor dem Build muss analyze laufen.');
                const cs = data.cellsize > 0 ? data.cellsize : lastAnalysis.suggestedCellsize;
                const header = buildHeader(lastAnalysis.extent, cs);
                const { data: grid } = buildRegularDem(points, header, {
                    method: data.method ?? 'tin',
                    onProgress: (value) => self.postMessage({ type: 'progress', value }),
                });
                terrain = makeTerrainObject(grid, header);
            }

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
