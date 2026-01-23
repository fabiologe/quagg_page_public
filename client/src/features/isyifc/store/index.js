import { defineStore } from 'pinia';
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
         * Expects output from FixData (already normalized and transformed).
         */
        setGraphData(payload) {
            this.isProcessing = true;
            try {
                console.log("[Store] setGraphData triggered.");

                // FixData V4 already calculated Transformations & Origin
                const { nodes, edges, origin, stats } = payload;

                // Update State Directly
                this.origin = origin || { x: 0, y: 0, z: 0 };
                this.graph.nodes = nodes;
                this.graph.edges = edges;

                // Update Metadata
                this.stats = {
                    nodes: nodes.size,
                    edges: edges.length,
                    time: stats?.time || 0
                };

                console.log(`[Store] Updated with Origin: ${this.origin.x}, ${this.origin.y}`);

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

                // 2. Fix/Normalize Data (Calculates Transforms & Origin)
                const result = normalizeGraph(rawData);

                // 3. Set to Store
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
