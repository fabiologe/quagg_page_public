import { defineStore } from 'pinia';
import { parseIsyIfcXML } from '../utils/xmlParser.js';

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
        async processImport(rawXmlString) {
            this.isProcessing = true;
            this.importErrors = [];
            this.graph.nodes = new Map();
            this.graph.edges = [];

            try {
                // Short timeout to allow UI to show loading state
                await new Promise(resolve => setTimeout(resolve, 50));

                const parsed = parseIsyIfcXML(rawXmlString);

                // Update State
                this.graph.nodes = parsed.network.nodes; // Now a Map
                this.graph.edges = parsed.network.edges;
                this.metadata = parsed.metadata || {};

                // Inspections/Areas (Legacy support)
                this.inspections = parsed.inspections || [];
                // Areas might need adaptation if FixData doesn't handle them
                this.areas = parsed.hydraulics.areas || [];

                // Capture Validation Errors from FixData (attached to metadata by xmlParser)
                if (this.metadata.validation && this.metadata.validation.errors) {
                    this.importErrors = this.metadata.validation.errors;
                }

                console.log(`Store: Imported ${this.graph.nodes.size} nodes, ${this.graph.edges.length} edges.`);

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
