import { SwmmBuilder } from '../core/services/SwmmBuilder.js';
import { Node } from '../core/domain/Node.js';
import { Edge } from '../core/domain/Edge.js';

// Mock Store Interface
class MockStore {
    constructor() {
        this.nodes = new Map();
        this.edges = new Map();
    }
    getAllNodes() { return Array.from(this.nodes.values()); }
    getAllEdges() { return Array.from(this.edges.values()); }
}

const store = new MockStore();

// Dataset
store.nodes.set("N1", new Node({ id: "N1", x: 0, y: 0, z: 100 }));
store.nodes.set("N2", new Node({ id: "N2", x: 100, y: 0, z: 98 })); // Will be Outfall?
store.nodes.set("N3", new Node({ id: "N3", x: 50, y: 50, z: 105 }));

store.edges.set("E1", new Edge({ id: "E1", fromNodeId: "N1", toNodeId: "N2", length: 100 }));
store.edges.set("E2", new Edge({ id: "E2", fromNodeId: "N3", toNodeId: "N1", length: 70 }));

console.log("--- Testing SwmmBuilder ---");

const builder = new SwmmBuilder(store);
builder.setOptions({ durationHours: 2 });

const result = builder.build();

console.log("Builder Generated Lines:", result.inpContent.split('\n').length);
console.log("Warnings:", result.warnings);

if (!result.inpContent.includes("[JUNCTIONS]")) throw new Error("Missing JUNCTIONS");
if (!result.inpContent.includes("[CONDUITS]")) throw new Error("Missing CONDUITS");
console.log("INP CONTENT START\n" + result.inpContent + "\nINP CONTENT END");
const outfallRegex = /N2\s+98\.000\s+FREE/;
if (!outfallRegex.test(result.inpContent)) throw new Error("Automatic Outfall logic failed (N2 should be outfall)");



console.log("✅ Builder verification passed");
