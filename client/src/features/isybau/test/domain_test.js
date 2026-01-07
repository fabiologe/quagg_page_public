import { Node } from '../core/domain/Node.js';
import { Edge } from '../core/domain/Edge.js';

console.log("--- Testing Domain Models ---");

// Test Node
try {
    const n1 = new Node({ id: "N1", x: 10, y: 20, z: 100, depth: 2.5 });
    console.log("Node created:", n1.toJSON());

    if (n1.coverZ !== 102.5) throw new Error("CoverZ calculation failed");
    if (!n1.isValid()) throw new Error("Node validity check failed");

    const n2 = Node.fromRaw({ id: "N2", x: 20, y: 30, z: 99, type: "Unknown" });
    console.log("Node fromRaw:", n2.toJSON());

} catch (e) {
    console.error("Node Test Failed:", e);
    process.exit(1);
}

// Test Edge
try {
    const e1 = new Edge({ id: "E1", fromNodeId: "N1", toNodeId: "N2", length: 50 });
    console.log("Edge created:", e1.toJSON());

    if (e1.profile.type !== 'Circular') throw new Error("Default profile incorrect");

    const e2 = Edge.fromRaw({
        id: "E2",
        from: "N2",
        to: "N1",
        length: 45,
        profile: { type: 1, height: 0.5, width: 0.33 }
    });
    console.log("Edge fromRaw:", e2.toJSON());

} catch (e) {
    console.error("Edge Test Failed:", e);
    process.exit(1);
}

console.log("✅ All Tests Passed");
