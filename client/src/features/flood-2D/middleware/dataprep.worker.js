import { InputGenerator } from './InputGenerator.js';

/**
 * dataprep.worker.js
 * Heavy-lifting WebWorker for Flood Simulation Data Preparation.
 * Now acts as a thin wrapper around the Orchestrator (InputGenerator).
 */

self.onmessage = async function (e) {
    const { type, payload } = e.data;

    if (type === 'PREPARE_SIMULATION') {
        try {
            // payload usually contains structured inputs now
            const generator = new InputGenerator();

            // Adapt legacy payload structure if necessary to match 'processScenario'
            // Expected payload: { xyz, buildings, roughness, rain, boundaries, config }
            // If payload has nested objects differently, map them here.
            // Assuming payload IS the scenario object.

            const files = generator.processScenario(payload);

            // We also need to return gridInfo for the UI to setup the camera/view
            // The generator stores the header internally
            const gridInfo = generator.terrainHeader;

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
