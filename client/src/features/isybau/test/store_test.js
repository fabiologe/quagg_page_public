import { setActivePinia, createPinia } from 'pinia';
import { useIsybauStore } from '../store/index.js';
import { Node } from '../core/domain/Node.js';

// Setup Mock Environment
const pinia = createPinia();
setActivePinia(pinia);

const store = useIsybauStore();
console.log("--- Testing Isybau Store ---");

// Test 1: Add Node
const n1 = store.addNode(10, 10, 'Schacht');
if (store.nodes.size !== 1) throw new Error("Add Node failed");
console.log("✅ simple addNode");

// Test 2: Add Edge
const n2 = store.addNode(20, 20);
const e1 = store.addEdge(n1.id, n2.id);
if (store.edges.size !== 1) throw new Error("Add Edge failed");
if (Math.abs(e1.length - 14.142) > 0.01) throw new Error("Length calc wrong");
console.log("✅ simple addEdge");

// Test 3: Load Parsed Data (Stub)
const rawData = {
    metadata: { version: "1.0" },
    network: {
        nodes: new Map([
            ["XML_1", { id: "XML_1", x: 100, y: 100, z: 10, type: "Schacht" }],
            ["XML_2", { id: "XML_2", x: 200, y: 200, z: 9, type: "Schacht" }]
        ]),
        edges: new Map([
            ["XML_E1", { id: "XML_E1", from: "XML_1", to: "XML_2", length: 150 }]
        ])
    }
};

store.loadParsedData(rawData);
if (store.nodes.size !== 2) throw new Error("Hydration failed (nodes count)");
if (store.edges.size !== 1) throw new Error("Hydration failed (edges count)");
if (store.metadata.version !== "1.0") throw new Error("Metadata hydration failed");

// Test 3.1: Verify Node Type is Instance
const checkNode = store.getNodeById("XML_1");
if (!(checkNode instanceof Node)) throw new Error("Store did not hydrate to Class Instance");

console.log("✅ loadParsedData hydration");

// Test 4: Remove Node (Cascade)
store.removeNode("XML_1");
if (store.nodes.has("XML_1")) throw new Error("Remove Node failed");
if (store.edges.size !== 0) throw new Error("Cascade delete of edge failed");

console.log("✅ removeNode cascade");
