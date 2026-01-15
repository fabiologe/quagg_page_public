
import { SwmmInputGenerator } from '../utils/SwmmInputGenerator.js';
import createSwmmModule from '../utils/swmm_solver.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runTest() {
    console.log("Loading input data...");
    const rawData = fs.readFileSync(path.join(__dirname, 'simulation_input (18).json'), 'utf8');
    const inputData = JSON.parse(rawData);

    // Reconstruct Maps
    const nodesMap = new Map((inputData.nodes || []).map(n => [n[0], n[1]]));
    const edgesMap = new Map((inputData.edges || []).map(e => [e[0], e[1]]));

    // Areas might be array or map in the json? 
    // In SwmmInputGenerator we expect an array.
    // In PreprocessingModal it was: props.hydraulics.areas
    // Let's check the JSON structure again if needed, assuming 'hydraulics.areas' or 'areas' key.
    // Based on previous view, 'nodes' was an array of arrays.
    // 'areas' key wasn't explicitly seen at top level but "grep areas" found it.
    // Let's assume inputData.areas if it exists, or check inputData.hydraulics.areas

    // Areas assumption
    let areasList = [];
    if (inputData.hydraulics && inputData.hydraulics.areas) {
        areasList = inputData.hydraulics.areas;
    } else if (inputData.areas) {
        areasList = inputData.areas;
    }
    console.log(`Found ${areasList.length} areas.`);

    // Mock Rain Series
    const rainOptions = {
        rainSeries: [
            { time: "00:00", height_mm: 0.0 },
            { time: "00:05", height_mm: 20.0 }, // High splash
            { time: "00:10", height_mm: 40.0 },
            { time: "00:15", height_mm: 20.0 },
            { time: "00:20", height_mm: 0.0 }
        ],
        duration: 1
    };

    console.log("Generating INP string...");
    const inpString = SwmmInputGenerator.generateInp(nodesMap, edgesMap, areasList, rainOptions);

    // Write INP to disk for debugging
    fs.writeFileSync(path.join(__dirname, 'debug_input.inp'), inpString);
    console.log("Written debug_input.inp");

    console.log("Initializing Wasm Module...");
    const Module = await createSwmmModule({
        print: (text) => console.log("[SWMM_OUT]", text),
        printErr: (text) => console.error("[SWMM_ERR]", text)
    });

    console.log("Writing input file to MEMFS...");
    Module.FS.writeFile('/input.inp', inpString);

    console.log("Running SWMM...");
    const runFn = Module.cwrap('swmm_run', 'number', ['string', 'string', 'string']);
    const res = runFn('/input.inp', '/report.rpt', '/out.out');

    console.log(`SWMM finished with result code: ${res}`);

    console.log("Reading Report...");
    if (Module.FS.analyzePath('/report.rpt').exists) {
        const report = Module.FS.readFile('/report.rpt', { encoding: 'utf8' });
        fs.writeFileSync(path.join(__dirname, 'debug_report.rpt'), report);
        console.log("Written debug_report.rpt");

        // Log mass balance for quick check
        const mbMatch = report.match(/Continuity Error \(%\) \.\.\.\.\.\s+([-\d\.]+)/);
        if (mbMatch) console.log("Continuity Error:", mbMatch[1], "%");
        else console.log("Could not find Continuity Error in report.");

    } else {
        console.error("Report file was not created!");
    }
}

runTest().catch(console.error);
