import { InputGenerator } from './InputGenerator.js';
import { Rasterizer } from './Rasterizer.js';

/**
 * dataprep.worker.js
 * Heavy-lifting WebWorker for Flood Simulation Data Preparation.
 * Now acts as a thin wrapper around the Orchestrator (InputGenerator).
 */

self.onmessage = async function (e) {
    const { type, payload } = e.data;

    if (type === 'PREPARE_SIMULATION') {
        try {
            // payload expects: { grid, modifications, config, ... }

            // 1. Prepare Base Raster
            // Depending on what is passed (XYZ string or Grid Object), ensure we have a Grid
            let header, gridData;

            if (payload.xyz) {
                const res = Rasterizer.createDemFromXYZ(payload.xyz);
                header = res.header;
                gridData = res.data;
            } else if (payload.grid) {
                // Assuming payload.grid is { header, data } or similar
                header = payload.grid.header || payload.grid;
                gridData = payload.grid.data || payload.grid.gridData;
            } else {
                throw new Error("Worker: No Grid/XYZ data provided in payload.");
            }

            // 2. THE BAKING STEP (Rasterizer Logik integration)
            // Explicitly call burnBuildings here as requested
            let validGridData = gridData;

            if (payload.modifications && payload.modifications.length > 0) {
                // "Bake" the buildings into a NEW array (immutable copy logic is in Rasterizer)
                // Note: burnBuildings returns a new Float32Array
                validGridData = Rasterizer.burnBuildings(gridData, header, payload.modifications);
                console.log(`[Worker] Baked ${payload.modifications.length} modifications.`);
            }

            // 3. Orchestration (InputGenerator)
            // We pass the ALREADY BAKED grid to the generator.
            // We strip 'buildings' from the scenario passed to InputGenerator so it doesn't double-apply
            // (although our InputGenerator uses 'scenario.buildings', so we just don't pass that key, 
            // or pass empty list if needed).

            const generator = new InputGenerator();

            const scenarioForGenerator = {
                ...payload,
                grid: { header, data: validGridData }, // Use the baked data
                buildings: null // Ensure generator doesn't try to burn again
            };

            const files = generator.processScenario(scenarioForGenerator);

            // Return gridInfo for UI (Camera, etc)
            const gridInfo = header;

            self.postMessage({
                type: 'PREPARATION_COMPLETE',
                payload: {
                    files,
                    gridInfo
                }
            });

        } catch (err) {
            console.error("Data Prep Error:", err);
            self.postMessage({ type: 'ERROR', error: err.message });
        }
    }
};
