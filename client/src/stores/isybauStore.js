import { defineStore } from 'pinia';
import { toRaw } from 'vue';
import { parseIsybauXML } from '../features/isybau/utils/xmlParser';

import { deepSanitize } from '../utils/sanitizer';

export const useIsybauStore = defineStore('isybau', {
    state: () => ({
        metadata: null,
        network: {
            nodes: new Map(), // Map<ID, Node>
            edges: new Map(), // Map<ID, Edge>
        },
        inspections: [], // Array<Inspection>
        hydraulics: {
            catchments: [], // Array<Catchment>
            areas: [], // Array<Area> (Polygons)
            simulationParams: {},
            results: new Map(), // Added results state
            nodeResults: new Map(),
            timeSeries: [], // Array<{time, edges, nodes}>
            massBalance: null, // Global Mass Balance
        },
        loading: false,
        error: null,
    }),

    getters: {
        nodeCount: (state) => state.network.nodes.size,
        edgeCount: (state) => state.network.edges.size,
        hasData: (state) => !!state.metadata,
    },

    actions: {
        async loadFile(file) {
            this.loading = true;
            this.error = null;

            try {
                const text = await file.text();
                const data = parseIsybauXML(text);

                this.metadata = { ...data.metadata, fileName: file.name };
                this.network = data.network;
                this.inspections = data.inspections;
                this.hydraulics = {
                    ...data.hydraulics,
                    areas: data.hydraulics.areas || [], // Ensure areas is always an array
                    results: new Map(),
                    timeSeries: []
                };

                this.validateData();
            } catch (err) {
                console.error("Failed to parse ISYBAU XML:", err);
                this.error = err.message;
            } finally {
                this.loading = false;
            }
        },

        async calculateHydraulics(params = {}) {
            if (!this.network.nodes.size) return;

            this.loading = true;
            this.error = null;
            try {
                // Prepare Data for Worker
                // Wrap in deepSanitize to remove Vue Proxies and avoid DataCloneError
                const nodesArray = deepSanitize(Array.from(this.network.nodes.entries()));
                const edgesArray = deepSanitize(Array.from(this.network.edges.entries()));
                const areasList = deepSanitize(this.hydraulics.areas || []);
                const safeParams = deepSanitize(params);

                // Create Worker
                const worker = new Worker(new URL('../features/isybau/utils/swmmWasmWorker.js', import.meta.url), {
                    type: 'module'
                });

                const result = await new Promise((resolve, reject) => {
                    worker.onmessage = (e) => {
                        const { command, results, message } = e.data;
                        if (command === 'INIT_SUCCESS') {
                            worker.postMessage({
                                command: 'RUN',
                                data: {
                                    nodes: nodesArray,
                                    edges: edgesArray,
                                    areas: areasList,
                                    options: {
                                        ...safeParams, // Pass all params (rainSeries, rainType, etc)
                                        duration: safeParams.duration || 6
                                    }
                                }
                            });
                        } else if (command === 'COMPLETE') {
                            resolve(results);
                            worker.terminate();
                        } else if (command === 'ERROR') {
                            reject(new Error(message));
                            worker.terminate();
                        }
                    };
                    worker.onerror = (err) => {
                        reject(new Error("Worker connection failed."));
                        worker.terminate();
                    };
                });

                // Update State
                // Note: The Wasm solver currently returns 'report' and 'massBalance'.
                // It does NOT yet return per-element results (edges, nodes) for visualization.
                // We clear the detailed results to avoid misleading 2D view.
                this.hydraulics.results = new Map(Object.entries(result.edges || {})); // Edges
                this.hydraulics.nodeResults = new Map(Object.entries(result.nodes || {})); // Nodes
                this.hydraulics.subcatchmentResults = new Map(Object.entries(result.subcatchments || {})); // Subcatchments
                this.hydraulics.timeSeries = result.timeSeries || [];
                this.hydraulics.massBalance = result.massBalance;
                this.hydraulics.systemStats = result.systemStats; // Detailed Stats
                this.hydraulics.report = result.report; // Store report text
                this.hydraulics.inputInp = result.input; // Store input text
                this.hydraulics.warnings = result.warnings || []; // Store Warnings

                console.log("SWMM Simulation Successful.", result.massBalance);

            } catch (err) {
                console.error("Simulation failed:", err);
                this.error = "Simulation failed: " + err.message;
            } finally {
                this.loading = false;
            }
        },

        validateData() {
            const errors = [];

            // Metadata Validation
            if (!this.metadata) {
                errors.push("No metadata found.");
            } else {
                if (!this.metadata.version) errors.push("Missing ISYBAU version.");
            }

            // Geometry Validation (Placeholder)
            // TODO: Check if Edge start/end coordinates match Node coordinates

            // Referential Integrity (Placeholder)
            // TODO: Check if Inspections link to existing Edges

            if (errors.length > 0) {
                console.warn("Validation Errors:", errors);
                // We could store these errors in state to show in UI
            }
        },

        reset() {
            this.metadata = null;
            this.network = { nodes: new Map(), edges: new Map() };
            this.inspections = [];
            this.hydraulics = { catchments: [], simulationParams: {} };
            this.error = null;
        },

        updateNetworkData({ nodes, edges, areas }) {
            // Update Nodes
            if (nodes) {
                nodes.forEach(n => {
                    if (this.network.nodes.has(n.id)) {
                        const existing = this.network.nodes.get(n.id);
                        this.network.nodes.set(n.id, { ...existing, ...n });
                    }
                });
            }

            // Update Edges
            if (edges) {
                edges.forEach(e => {
                    if (this.network.edges.has(e.id)) {
                        const existing = this.network.edges.get(e.id);
                        this.network.edges.set(e.id, { ...existing, ...e });
                    }
                });
            }

            // Update Areas
            if (areas) {
                // Update the visual areas
                this.hydraulics.areas = areas;

                // Regenerate catchments for simulation
                // Map areas with nodeId to catchments
                const newCatchments = [];

                areas.forEach(a => {
                    const areaHa = a.size; // Already in ha
                    const coeff = a.runoffCoeff || 0.5;

                    if (a.nodeId && a.nodeId.trim() !== '') {
                        if (a.nodeId2 && a.nodeId2.trim() !== '') {
                            // Split Area
                            const ratio = (a.splitRatio !== undefined ? a.splitRatio : 50) / 100;

                            // Catchment 1
                            newCatchments.push({
                                id: `${a.id}_1`,
                                nodeId: a.nodeId,
                                area: areaHa * ratio,
                                runoffCoeff: coeff
                            });

                            // Catchment 2
                            newCatchments.push({
                                id: `${a.id}_2`,
                                nodeId: a.nodeId2,
                                area: areaHa * (1 - ratio),
                                runoffCoeff: coeff
                            });
                        } else {
                            // Single Connection
                            newCatchments.push({
                                id: a.id,
                                nodeId: a.nodeId,
                                area: areaHa,
                                runoffCoeff: coeff
                            });
                        }
                    }
                });

                // If we had original catchments that are NOT in areas, we might lose them here.
                // But if the user is editing "Areas", they expect these to be the source of truth.
                this.hydraulics.catchments = newCatchments;
            }
        }
    }
});
