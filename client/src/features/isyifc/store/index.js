import { defineStore } from 'pinia';
import { normalizeGraph } from '../core/worker/FixData.js';

export const useIsyIfcStore = defineStore('isyifc-module', {
    state: () => ({
        // Graph State (IGraph Interface)
        graph: {
            nodes: new Map(), // Map<string, INode>
            edges: []         // IEdge[]
        },
        // Processing State
        isProcessing: false,
        importErrors: [],

        // Selection & Metadata
        selectedObjectId: null,
        metadata: {},

        // Legacy/Helper support
        areas: [],
        inspections: []
    }),

    getters: {
        // Maps for O(1) lookups in Viewer
        // Nodes is already a Map
        nodeMap: (state) => state.graph.nodes,
        edgeMap: (state) => new Map(state.graph.edges.map(e => [e.id, e])),

        // Helper for Map Center
        center: (state) => {
            if (state.graph.nodes.size === 0) return { x: 0, y: 0 };
            let sumX = 0, sumY = 0; // In Three Space (x, z)

            // Iterate Map values
            state.graph.nodes.forEach(n => {
                sumX += n.pos.x;
                sumY += n.pos.z; // Center is usually X/Z Plane in Three
            });
            return {
                x: sumX / state.graph.nodes.size,
                y: sumY / state.graph.nodes.size
            };
        }
    },

    actions: {
        /**
         * Main Import Action.
         * Parses XML, sanitizes via FixData (via xmlParser), and updates state.
         * @param {string} rawXmlString 
         */
        /**
         * Main Import Action.
         * Uses IsybauParser.worker (fast-xml-parser) and FixData.js
         * @param {string} rawXmlString 
         * @param {string} fileName
         */
        async processImport(rawXmlString, fileName = 'import.xml') {
            this.isProcessing = true;
            this.importErrors = [];
            this.graph.nodes = new Map();
            this.graph.edges = [];

            try {
                // 1. Parse using Worker
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

                const count = (rawData.nodes?.length || 0) + (rawData.edges?.length || 0);
                const time = rawData.stats?.time || 0;
                console.log(`[Store] Raw Parsed: ${count} objects in ${time.toFixed(2)}ms`);

                // 2. Normalize / Clean / Calculate Geometry (Main Thread for now)
                // FixData takes Flat Worker Data { nodes, edges }
                const result = normalizeGraph(rawData);

                // 3. Update State
                this.graph.nodes = result.nodes;
                this.graph.edges = result.edges;
                this.importErrors = result.errors;

                // Metadata/Stats
                this.metadata = {
                    stats: result.stats,
                    rawStats: rawData.stats
                };

                console.log(`[Store] Final: ${this.graph.nodes.size} nodes, ${this.graph.edges.length} edges.`);

            } catch (err) {
                console.error("Import Failed:", err);
                this.importErrors.push(err.message);
            } finally {
                this.isProcessing = false;
            }
        },

        clear() {
            this.graph.nodes = new Map();
            this.graph.edges = [];
            this.areas = [];
            this.inspections = [];
            this.importErrors = [];
            this.selectedObjectId = null;
        },

        // Selection
        setSelected(id) {
            this.selectedObjectId = id;
        },

        clearSelection() {
            this.selectedObjectId = null;
        }
    }
});
