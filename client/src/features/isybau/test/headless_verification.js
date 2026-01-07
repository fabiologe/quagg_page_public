
import { useIsybauStore } from '../store/index.js';
import { createPinia, setActivePinia } from 'pinia';
import { Area } from '../core/domain/Area.js';

// Setup Environment
console.log("--- Headless Verification: DataCloneError Check ---");

// 1. Init Store
setActivePinia(createPinia());
const store = useIsybauStore();

// 2. Populate Data (mimic PreprocessingModal input)
console.log("1. Populating Store...");
store.addNode(0, 0, 'Schacht');
store.addNode(10, 10, 'Bauwerk');

// Create Proxy-heavy Area objects (mimicking Vue reactivity if we were in Vue, 
// but here we just check if normal objects pass and if we can serialize them)
// In Node.js Pinia creates Proxies too.
const areaData = {
    id: 'A1',
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
    size: 0.5,
    runoffCoeff: 0.9
};
const area = Area.fromRaw(areaData);
store.areas = [area]; // In real app, this assignment might be where Proxies happen

// 3. Mimic runSimulation Payload Construction
console.log("2. constructing Payload...");

// This mirrors the logic in store/index.js runSimulation
const payload = {
    nodes: store.nodeArray.map(n => n.toJSON ? n.toJSON() : n),
    edges: store.edgeArray.map(e => e.toJSON ? e.toJSON() : e),
    areas: store.areaArray.map(a => a.toJSON ? a.toJSON() : a),
    options: {
        durationHours: 1,
        rainMethod: 'model',
        rainSeries: [],
        kostraData: null
    }
};

// 4. The Nuclear Option Check
console.log("3. Testing Deep Clone (Nuclear Option)...");
try {
    const cleanPayload = JSON.parse(JSON.stringify(payload));
    console.log("✅ JSON Deep Clone successful.");

    // 5. Test Structured Clone (Browser Worker mechanism)
    console.log("4. Testing structuredClone (Worker boundary)...");
    const cloned = structuredClone(cleanPayload);
    console.log("✅ structuredClone successful. Payload is Worker-safe.");

    // Check Content
    if (cloned.areas.length !== 1) throw new Error("Area missing in clone");
    if (cloned.areas[0].id !== 'A1') throw new Error("Area ID mismatch");
    console.log("✅ Data integrity verified.");

} catch (err) {
    console.error("❌ FAILED:", err.message);
    process.exit(1);
}

console.log("--- Headless Verification Passed ---");
