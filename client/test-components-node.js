import * as fs from 'fs';
import * as OBC from '@thatopen/components';

async function run() {
    console.log("Initializing Components...");
    const components = new OBC.Components();
    
    const worlds = components.get(OBC.Worlds);
    const world = worlds.create();
    components.init();

    const fragments = components.get(OBC.FragmentsManager);
    console.log("Fragments initialized");

    const ifcLoader = components.get(OBC.IfcLoader);
    
    // Setup without wasm fetch override
    await ifcLoader.setup({
        wasm: {
            path: "./node_modules/web-ifc/",
            absolute: true
        },
        autoSetWasm: false
    });
    console.log("IfcLoader setup done");

    const ifcFile = './src/features/ifc-viewer/testdata/6178_A64-2BA_0_2026-03-18 (12).ifc';
    console.log(`Reading file: ${ifcFile}`);
    const data = fs.readFileSync(ifcFile);
    const dataArray = new Uint8Array(data);

    console.log("Calling load...");
    try {
        const model = await ifcLoader.load(dataArray);
        console.log("Model loaded!", model.uuid);
    } catch (e) {
        console.error("Error during load:", e);
    }

    components.dispose();
}

run();
