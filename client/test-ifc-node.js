import * as fs from 'fs';
import * as path from 'path';
import { IfcAPI } from 'web-ifc';

async function run() {
    console.log("Initializing IfcAPI...");
    const ifcApi = new IfcAPI();
    
    // Set the path to node wasm explicitly
    ifcApi.SetWasmPath('./node_modules/web-ifc/', true);
    
    try {
        await ifcApi.Init();
        console.log("IfcAPI initialized successfully!");
        
        const ifcFile = './src/features/ifc-viewer/testdata/6178_A64-2BA_0_2026-03-18 (12).ifc';
        
        console.log(`Reading file: ${ifcFile}`);
        const data = fs.readFileSync(ifcFile);
        const dataArray = new Uint8Array(data);
        
        console.log("Opening IFC model...");
        const modelID = ifcApi.OpenModel(dataArray);
        
        console.log(`Model opened with ID: ${modelID}`);
        
        ifcApi.CloseModel(modelID);
        console.log("Success! Headless WASM works.");
    } catch (e) {
        console.error("Error during headless WebAssembly/IFC load:", e);
    }
}

run();
