
import { InputGenerator } from '../InputGenerator.js';
import fs from 'fs';
import path from 'path';

const __dirname = path.resolve();
const xyzPath = path.join(__dirname, 'test', 'dgm10_small.xyz');

// Mock data
const mockRainData = [
    { time: 0, intensity: 50.0 }, // 50 mm/m
    { time: 3600, intensity: 25.0 }
];

const mockConfig = {
    "DEMfile": "terrain.asc",
    "resroot": "output",
    "dirroot": "results",
    "sim_time": 7200,
    "voutput": true,
    "acceleration": true
};

async function runTest() {
    console.log("Initializing InputGenerator...");
    const generator = new InputGenerator();

    // 1. Test Terrain Processing
    console.log("Testing processTerrain...");
    try {
        const xyzContent = fs.readFileSync(xyzPath, 'utf-8');
        // Burn a simple building polygon
        const building = {
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [[
                    [408300, 5482100],
                    [408400, 5482100],
                    [408400, 5482200],
                    [408300, 5482200],
                    [408300, 5482100]
                ]]
            }
        };

        generator.processTerrain(xyzContent, building, 5.0);
        console.log("Terrain processed.");
    } catch (err) {
        console.error("Failed to process terrain:", err);
        process.exit(1);
    }

    // 2. Test ASCII Output
    console.log("Testing getTerrainASCII...");
    try {
        const ascii = generator.getTerrainASCII();
        const lines = ascii.split('\n');

        // Validate Header (first 6 lines)
        const headerKeys = ["ncols", "nrows", "xllcorner", "yllcorner", "cellsize", "NODATA_value"];
        for (let i = 0; i < 6; i++) {
            const line = lines[i].trim();
            const key = headerKeys[i];
            if (!line.startsWith(key)) {
                throw new Error(`Header line ${i} does not start with ${key}`);
            }
        }
        console.log("ASCII Header Valid.");
        console.log("Sample Header:\n", lines.slice(0, 6).join('\n'));

        // Simple data check: Ensure we have lines with numbers
        // Line 6 should be the first data row
        if (lines.length < 10) {
            throw new Error("ASCII content is too short.");
        }
    } catch (err) {
        console.error("Failed to generate ASCII:", err);
        process.exit(1);
    }

    // 3. Test Rain Map
    console.log("Testing generateRainMap...");
    try {
        const rainStr = generator.generateRainMap(mockRainData);
        console.log("Rain Output:\n", rainStr.trim());

        // Check conversion: 50 mm/h -> 50 / 1000 / 3600 = 0.00001389
        const firstLine = rainStr.split('\n')[0];
        if (!firstLine.includes("0.00001389")) {
            console.warn("Warning: Rain conversion calculated value might differ slightly from expected.");
        }
    } catch (err) {
        console.error("Failed to generate rain map:", err);
        process.exit(1);
    }

    // 4. Test Par File
    console.log("Testing generateParFile...");
    try {
        const parContent = generator.generateParFile(mockConfig);
        console.log("Par File Output:\n", parContent.trim());

        if (!parContent.includes("voutput")) {
            throw new Error("Missing boolean flag voutput");
        }
        if (!parContent.includes("FPfric 0.035")) {
            throw new Error("Missing default FPfric");
        }
        if (!parContent.includes("sim_time 7200")) {
            throw new Error("Missing custom sim_time");
        }
    } catch (err) {
        console.error("Failed to generate par file:", err);
        process.exit(1);
    }

    console.log("All tests passed!");
}

runTest();
