import { InputGenerator } from './InputGenerator.js';
import { Rasterizer } from './Rasterizer.js';

/**
 * dataprep.worker.js
 * FIXED: Implements the "Baking" pipeline strictly.
 * 1. Load Base Raster
 * 2. Bake Modifications (Rasterizer)
 * 3. Generate Inputs (InputGenerator)
 */

self.onmessage = async function (e) {
    // Zerlege e.data. Wir erwarten { type, payload } vom Flood2DSolverRunner
    const { type, payload } = e.data;

    if (type === 'PREPARE_SIMULATION') {
        try {
            // 1. EXTRAHIEREN: baseRaster, gridInfo, modifications, hydraulicData

            // Grid-Initialisierung (Base Raster)
            let baseRaster, gridInfo;

            if (payload.xyz) {
                const res = Rasterizer.createDemFromXYZ(payload.xyz);
                gridInfo = res.header;
                baseRaster = res.data;
            } else if (payload.grid) {
                gridInfo = payload.grid.header || payload.grid;
                baseRaster = payload.grid.data || payload.grid.gridData;
            } else {
                throw new Error("Worker: Missing Base Raster (grid or xyz)");
            }

            const modifications = payload.modifications || [];

            // Debugging
            console.log('Worker: Received task', modifications.length, 'mods');

            // 2. SCHRITT A: Das Backen (The Baking)
            console.time('Baking');

            // [FIX] Application of modifications
            // Wir nutzen Rasterizer.burnBuildings als "bakeTerrain" Funktion
            // baseRaster wird kopiert, nicht mutiert (Rasterizer implementation handles copy)
            const finalRaster = Rasterizer.burnBuildings(baseRaster, gridInfo, modifications);

            console.timeEnd('Baking');

            // 3. SCHRITT B: LISFLOOD Input Generierung
            // WICHTIG: Wir nutzen jetzt 'finalRaster', NICHT mehr 'baseRaster'!

            // Vorbereitung für InputGenerator
            // Wir müssen die "hydraulicData" aus dem Payload extrahieren
            // InputGenerator erwartet ein Scenario-Objekt
            const scenario = {
                // Config & Hydraulik
                rain: payload.rain,
                boundaries: payload.boundaries,
                config: payload.config,

                // DAS NEUE RASTER
                grid: {
                    header: gridInfo,
                    data: finalRaster // <--- DAS IST DER FIX
                },

                // Explizit nullen, damit Generator nicht nochmal versucht zu backen (falls er Logik hätte)
                buildings: null,
                xyz: null
            };

            const generator = new InputGenerator();

            // "generateInputFiles" Mapping -> processScenario
            const inputFiles = generator.processScenario(scenario);

            // 4. RESPONSE
            self.postMessage({
                type: 'PREPARATION_COMPLETE',
                payload: {
                    files: inputFiles,
                    gridInfo: gridInfo,

                    // Optional: Wir könnten das finalRaster zurücksenden für 3D Update
                    // Sende als Transferable wenn möglich, aber copy für InputGenerator war nötig.
                    // Für jetzt senden wir es nicht zurück, außer explizit angefordert, 
                    // um Overhead zu sparen (InputGenerator hat Files generiert).
                    // Prompt verlangte: "Sende das finalRaster zurück ... (für die 3D-Visualisierung)"
                    // Okay, wir senden es mit.
                    finalRaster: finalRaster
                }
            });

        } catch (err) {
            console.error("Worker Error:", err);
            self.postMessage({ type: 'ERROR', error: err.message });
        }
    }
};
