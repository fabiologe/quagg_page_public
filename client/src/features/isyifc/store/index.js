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

        // IFC Export Metadaten (ISYBAU M100-M108)
        ifcMetadata: {
            datenstatus: '1',         // M100: 1=Bestandsdaten, 2=Erfassung, 3-7=Planung, 8=Sonstiger
            kollektivart: '1',        // M101: 1=Stamm, 2=Zustand, 3=Hydraulik
            stammdatentyp: '1',       // M102: 1=Bautechnischer Bestand, 2=Hydraulisches Ersatzsystem
            zustaendigkeit: '2',      // M103: 1=Bund milit., 2=Bund zivil, 4=Land, 5=Fremdstreitkräfte
            regelwerk: '7',           // M104: 6=ISYBAU 2017, 7=BFR Abwasser 2024
            abwasserbeseitigungspflicht: '1', // M105: 1=Betreiber, 2=Kommune
            ordnungseinheitentyp: '3', // M106: 1=Liegenschaft, 2=Wirtschaftseinheit, 3=Entwässerungsnetz
            praesentationsdatentyp: 'Lageplan Bestand', // M108
            ersteller: 'quagg-engineering.org' // Quelle
        },

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
        },

        updateIfcMetadata(key, value) {
            if (key in this.ifcMetadata) {
                this.ifcMetadata[key] = value;
            }
        }
    }
});
