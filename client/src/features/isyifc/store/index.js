import { defineStore } from 'pinia';
import { GeometryCalculator } from '../core/logic/GeometryCalculator.js';
import { normalizeGraph } from '../core/worker/FixData.js';

export const useIsyIfcStore = defineStore('isyifc-module', {
    state: () => ({
        // Graph State
        graph: {
            nodes: new Map(), // Map<string, INode>
            edges: []         // IEdge[]
        },
        origin: { x: 0, y: 0, z: 0 }, // Global Offset (MinX, MinY)

        // Processing State
        isProcessing: false,
        importErrors: [],

        // Selection & Metadata
        selectedObjectId: null,
        metadata: {},

        // Stats
        stats: {
            nodes: 0,
            edges: 0,
            time: 0
        }
    }),

    getters: {
        nodeMap: (state) => state.graph.nodes,
        edgeMap: (state) => new Map(state.graph.edges.map(e => [e.id, e])),

        hasData: (state) => state.graph.nodes.size > 0,

        entityCount(state) {
            return {
                manholes: Array.from(state.graph.nodes.values()).filter(n => n.type === 'Manhole').length,
                pipes: state.graph.edges.length
            };
        }
    },

    actions: {
        /**
         * Main Data Ingestion Point.
         * Expects output from IsybauParser (or FixData).
         * @param {Object} payload { rawNodes, rawEdges, stats } or { nodes, edges } from FixData
         */
        setGraphData(payload) {
            this.isProcessing = true;
            try {
                console.log("[Store] setGraphData triggered.");

                let nodes = payload.nodes; // Map
                let edges = payload.edges; // Array

                // 1. Calculate Origin (if not provided)
                const origin = GeometryCalculator.calculateOrigin(nodes);
                this.origin = origin;
                console.log(`[Store] Origin set to: ${origin.x}, ${origin.y}`);

                // 2. NORMALIZATION (Zero-Center for Viewer)
                // We iterate and update 'transform' for every node.
                for (const node of nodes.values()) {
                    // Compute Transform (Includes pos relative to origin)
                    const transform = GeometryCalculator.computeNodeTransform(node, origin);

                    // Update Node with Transform Data
                    node.transform = transform;
                }

                this.graph.nodes = nodes;
                this.graph.edges = edges;

                // Update Metadata
                this.stats = {
                    nodes: nodes.size,
                    edges: edges.length,
                    time: payload.stats?.time || 0
                };

            } catch (err) {
                console.error("[Store] Error setting graph data:", err);
                this.importErrors.push(err.message);
            } finally {
                this.isProcessing = false;
            }
        },

        // Wrapper for Worker Flow
        async processImport(rawXmlString, fileName = 'import.xml') {
            this.isProcessing = true;
            this.importErrors = [];

            // Clear old data
            this.graph.nodes = new Map();
            this.graph.edges = [];

            try {
                // 1. Worker Parse
                const worker = new Worker(new URL('../core/worker/IsybauParser.worker.js', import.meta.url), { type: 'module' });

                const rawData = await new Promise((resolve, reject) => {
                    worker.postMessage({ xmlContent: rawXmlString, fileName });
                    worker.onmessage = (e) => {
                        const { success, data, error } = e.data;
                        worker.terminate();
                        if (success) resolve(data);
                        else reject(new Error(error));
                    };
                    worker.onerror = (err) => {
                        worker.terminate();
                        reject(err);
                    };
                });

                // 2. Fix/Normalize Data (Types) & Calculate Origin logic is handled in setGraphData now
                // But FixData is useful for 'types' and 'light' cleanup
                const result = normalizeGraph(rawData);

                // 3. Set to Store (Calculates Transforms & Origin)
                this.setGraphData(result);

            } catch (err) {
                console.error("Import Failed:", err);
                this.importErrors.push(err.message);
                this.isProcessing = false;
            }
        },

        clear() {
            this.graph.nodes.clear();
            this.graph.edges = [];
            this.selectedObjectId = null;
            this.importErrors = [];
        },

        setSelected(id) {
            this.selectedObjectId = id;
        },

        clearSelection() {
            this.selectedObjectId = null;
        }
    }
});
