import { WorkerController } from '../core/worker/WorkerController.js';
import { useIsybauStore } from '../store/index.js';
import { createPinia, setActivePinia } from 'pinia';

// Mock Worker Environment for Node.js
// Since we can't spawn real Web Workers easily in this Node script without 'web-worker' lib,
// we will verify serialization logic of the controller.

console.log("--- Testing WorkerController Serialization ---");

// Setup Store
setActivePinia(createPinia());
const store = useIsybauStore();
store.addNode(0, 0, 'Schacht');
store.addNode(10, 10, 'Schacht');
const nodes = store.getAllNodes;
store.addEdge(nodes[0].id, nodes[1].id);

// Subclass to hijack postMessage
class TestController extends WorkerController {
    init() {
        // Mock worker
        this.worker = {
            postMessage: (msg) => {
                if (msg.command === 'RUN') {
                    console.log("Worker received RUN command");
                    console.log(`Nodes count: ${msg.data.nodes.length}`);
                    console.log(`Edges count: ${msg.data.edges.length}`);

                    if (msg.data.nodes.length !== 2) throw new Error("Nodes serialization count mismatch");
                    if (msg.data.edges.length !== 1) throw new Error("Edges serialization count mismatch");
                    if (typeof msg.data.nodes[0].x !== 'number') throw new Error("Node serialization format wrong");

                    console.log("✅ Serialization Verified");
                }
            },
            onmessage: null,
            terminate: () => { }
        };
    }
}

const controller = new TestController();
controller.runSimulation(store, { duration: 6 });

console.log("Controller logic test finished");
