import { defineStore } from 'pinia';
import { Node } from '../core/domain/Node.js';
import { Edge } from '../core/domain/Edge.js';
import { Area } from '../core/domain/Area.js';

let workerControllerInstance = null;

export const useIsybauStore = defineStore('isybau-module', {
    state: () => ({
        nodes: new Map(), // ID -> Node instance
        edges: new Map(), // ID -> Edge instance
        areas: [], // Catchment areas
        inspections: [], // Befahrungen / TV-Daten

        // Metadata / Global Props (from XML)
        metadata: {},
        editor: {
            mode: 'view', // 'view', 'select', 'pan', 'addNode', 'addEdge', 'addArea'
            selectedId: null,
            selectedType: null, // 'node', 'edge', 'area'
            edgeStartNode: null,
            drawingPoints: [] // Temporary points for Area creation
        },
        // Phase 2: Rain / Simulation Configuration
        rain: {
            method: 'model', // 'model' or 'kostra'
            duration: 4, // Hours
            intensity: 0,
            modelRainId: null, // ID of selected model rain
            returnPeriod: 1 // Years (T)
        },
        // UI State for Modals
        ui: {
            showKostraModal: false,
            showRainModal: false,
            showResultsModal: false,
            showDebugModal: false,
            showPreprocessingModal: false,
            showValidationModal: false
        },
        simulation: {
            status: 'idle', // idle, running, success, error
            progress: 0,
            results: null,
            error: null
        },
        // History
        history: {
            undoStack: [],
            redoStack: [],
            maxSize: 20
        }
    }),

    getters: {
        // Viewer helper: Convert Maps to Arrays
        nodeArray: (state) => Array.from(state.nodes.values()),
        edgeArray: (state) => Array.from(state.edges.values()),
        areaArray: (state) => state.areas || [],

        getAllNodes: (state) => Array.from(state.nodes.values()),
        getAllEdges: (state) => Array.from(state.edges.values()),

        getNodeById: (state) => (id) => state.nodes.get(id),
        getEdgeById: (state) => (id) => state.edges.get(id),

        // Helper for Map Center (for KOSTRA ref)
        center: (state) => {
            if (state.nodes.size === 0) return { x: 0, y: 0 }; // Default
            let sumX = 0, sumY = 0;
            let count = 0;
            for (const node of state.nodes.values()) {
                if (Number.isFinite(node.x) && Number.isFinite(node.y)) {
                    sumX += node.x;
                    sumY += node.y;
                    count++;
                }
            }
            if (count === 0) return { x: 0, y: 0 };
            return { x: sumX / count, y: sumY / count };
        }
    },

    actions: {
        setRainModel(model) {
            this.rain.method = 'model';
            this.rain.modelRainId = model.id;
            this.rain.activeModelRain = model; // Store full object for worker
        },

        updateKostraData(data) {
            this.rain.method = 'kostra';
            this.rain.kostraData = data;
        },

        setRainIntensity(val) {
            this.rain.method = 'kostra'; // Implicitly switch to kostra if setting intensity directly? Or just set value.
            // Actually KostraModal sets it based on selection
            this.rain.intensity = val;
        },

        /**
         * Loads parsed data from XML Parser or hydration logic.
         * Data structure expected to match `xmlParser.js` output or serialized format.
         */
        loadParsedData(parsedData) {
            this.clear();

            if (parsedData.metadata) {
                this.metadata = parsedData.metadata;
            }

            // Hydrate Nodes
            if (parsedData.network && parsedData.network.nodes) {
                // If it's a Map from xmlParser
                if (parsedData.network.nodes instanceof Map) {
                    parsedData.network.nodes.forEach(raw => {
                        try {
                            const node = Node.fromRaw(raw);
                            this.nodes.set(node.id, node);
                        } catch (e) {
                            console.warn(`Failed to hydrate node ${raw.id}:`, e);
                        }
                    });
                } else if (Array.isArray(parsedData.network.nodes)) {
                    // Handle Array
                    parsedData.network.nodes.forEach(raw => {
                        const node = Node.fromRaw(raw);
                        this.nodes.set(node.id, node);
                    });
                }
            }

            // Hydrate Edges
            if (parsedData.network && parsedData.network.edges) {
                if (parsedData.network.edges instanceof Map) {
                    parsedData.network.edges.forEach(raw => {
                        try {
                            const edge = Edge.fromRaw(raw);
                            // Edge case: ensure profile object is clean
                            if (edge.profile && typeof edge.profile === 'string') {
                                // handle legacy string profile if needed
                            }
                            this.edges.set(edge.id, edge);
                        } catch (e) {
                            console.warn(`Failed to hydrate edge ${raw.id}:`, e);
                        }
                    });
                } else if (Array.isArray(parsedData.network.edges)) {
                    parsedData.network.edges.forEach(raw => {
                        const edge = Edge.fromRaw(raw);
                        this.edges.set(edge.id, edge);
                    });
                }
            }

            // Hydrate Areas
            const rawAreas = (parsedData.hydraulics && parsedData.hydraulics.areas) || (parsedData.network && parsedData.network.areas) || [];

            this.areas = rawAreas.map(raw => {
                try {
                    const area = Area.fromRaw(raw);

                    // Fix: Resolve Haltung (Edge) to Node linkage if missing
                    // User reported XML often maps Areas to Haltungen (Edges)
                    if ((!area.nodeId || area.nodeId === '') && raw.edgeId) {
                        const targetEdgeId = String(raw.edgeId || '').trim();

                        // 1. Direct Lookup
                        let edge = this.edges.get(targetEdgeId);

                        // 2. Fallback: Iterative search if ID mismatch (e.g. whitespace issues in keys)
                        if (!edge) {
                            for (const e of this.edges.values()) {
                                if (e.id === targetEdgeId || String(e.id).trim() === targetEdgeId) {
                                    edge = e;
                                    break;
                                }
                            }
                        }

                        if (edge) {
                            console.log(`Resolved Area ${area.id} Outlet: Edge '${raw.edgeId}' (found as '${edge.id}') -> Nodes '${edge.fromNodeId}' & '${edge.toNodeId}'`);

                            // Map Start Node -> Anschluss 1
                            area.nodeId = edge.fromNodeId;

                            // Map End Node -> Anschluss 2 (as requested)
                            area.nodeId2 = edge.toNodeId;

                            // Set default split ratio if missing (50/50 for Haltung assignment)
                            if (!area.splitRatio) area.splitRatio = 50;

                            // Persist edgeId in Area model for reference
                            area.edgeId = edge.id;
                        } else {
                            console.warn(`Area ${area.id} references missing Edge '${raw.edgeId}' (Target: '${targetEdgeId}')`);
                        }
                    }

                    return area;
                } catch (e) {
                    console.warn(`Failed to hydrate area ${raw.id}:`, e);
                    return null;
                }
            }).filter(a => a !== null);

            console.log(`Loaded ${this.areas.length} areas.`);

            console.log(`IsybauStore: Loaded ${this.nodes.size} nodes, ${this.edges.size} edges, ${this.areas.length} areas.`);
        },

        clear() {
            this.nodes.clear();
            this.edges.clear();
            this.areas = [];
            this.inspections = [];
            this.editor.selectedId = null;
            this.simulation.results = null;
            return; // Explicit return
        },

        // --- History Actions ---
        saveHistory() {
            const snapshot = {
                nodes: Array.from(this.nodes.values()).map(n => n.toJSON ? n.toJSON() : n),
                edges: Array.from(this.edges.values()).map(e => e.toJSON ? e.toJSON() : e),
                areas: this.areas.map(a => a.toJSON ? a.toJSON() : a)
            };
            this.history.undoStack.push(JSON.stringify(snapshot));

            if (this.history.undoStack.length > this.history.maxSize) {
                this.history.undoStack.shift();
            }
            this.history.redoStack = []; // Clear redo branch
        },

        undo() {
            if (this.history.undoStack.length === 0) return;

            // Save current to Redo
            const currentSnapshot = {
                nodes: Array.from(this.nodes.values()).map(n => n.toJSON ? n.toJSON() : n),
                edges: Array.from(this.edges.values()).map(e => e.toJSON ? e.toJSON() : e),
                areas: this.areas.map(a => a.toJSON ? a.toJSON() : a)
            };
            this.history.redoStack.push(JSON.stringify(currentSnapshot));

            const snapshotStr = this.history.undoStack.pop();
            this.restoreSnapshot(snapshotStr);
        },

        redo() {
            if (this.history.redoStack.length === 0) return;

            // Save current to Undo
            const currentSnapshot = {
                nodes: Array.from(this.nodes.values()).map(n => n.toJSON ? n.toJSON() : n),
                edges: Array.from(this.edges.values()).map(e => e.toJSON ? e.toJSON() : e),
                areas: this.areas.map(a => a.toJSON ? a.toJSON() : a)
            };
            this.history.undoStack.push(JSON.stringify(currentSnapshot));

            const snapshotStr = this.history.redoStack.pop();
            this.restoreSnapshot(snapshotStr);
        },

        restoreSnapshot(jsonStr) {
            try {
                const data = JSON.parse(jsonStr);

                // Hydrate Nodes
                this.nodes.clear();
                data.nodes.forEach(raw => this.nodes.set(raw.id, Node.fromRaw(raw)));

                // Hydrate Edges
                this.edges.clear();
                data.edges.forEach(raw => this.edges.set(raw.id, Edge.fromRaw(raw)));

                // Hydrate Areas
                this.areas = data.areas.map(raw => Area.fromRaw(raw));

            } catch (e) {
                console.error("Failed to restore history snapshot", e);
            }
        },

        // --- CRUD Actions ---

        addNode(x, y, properties = {}) {
            this.saveHistory();
            let props = properties;
            // Legacy support: if 3rd arg is string (type)
            if (typeof properties === 'string') {
                props = { type: properties };
            }

            const id = (props && props.id) || `N_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const node = new Node({
                id,
                x,
                y,
                z: 0,
                type: 'Schacht',
                ...props // Merge all props (z, type, coverZ, diameter, etc.)
            });
            this.nodes.set(id, node);
            return node;
        },

        removeNode(id) {
            this.saveHistory();
            if (this.nodes.has(id)) {
                this.nodes.delete(id);
                // Also remove connected edges
                for (const [eId, edge] of this.edges) {
                    if (edge.fromNodeId === id || edge.toNodeId === id) {
                        this.edges.delete(eId);
                    }
                }
            }
        },

        removeEdge(id) {
            this.saveHistory();
            if (this.edges.has(id)) {
                this.edges.delete(id);
            }
        },

        // --- Area Actions ---
        removeArea(id) {
            this.saveHistory();
            const index = this.areas.findIndex(a => a.id === id);
            if (index !== -1) {
                this.areas.splice(index, 1);
            }
        },

        // Generic Removal based on Selection
        removeSelection() {
            const { selectedId, selectedType } = this.editor;
            if (!selectedId) return;

            if (selectedType === 'node') this.removeNode(selectedId);
            else if (selectedType === 'edge') this.removeEdge(selectedId);
            else if (selectedType === 'area') this.removeArea(selectedId);
            else {
                // Fallback: Check all
                if (this.nodes.has(selectedId)) this.removeNode(selectedId);
                else if (this.edges.has(selectedId)) this.removeEdge(selectedId);
                else this.removeArea(selectedId);
            }

            this.clearSelection();
        },

        clearSelection() {
            this.editor.selectedId = null;
            this.editor.selectedType = null;
            this.editor.mode = 'view'; // Reset to view? Or keep mode selected? Keep.
        },

        addEdge(payload) {
            this.saveHistory();
            // Payload: { fromId, toId, properties }
            const { fromId, toId, properties = {} } = payload;

            console.log("Store: addEdge called", fromId, toId, properties);

            const id = properties.id || `E_${Date.now()}`;

            // Basic validation
            if (!this.nodes.has(fromId) || !this.nodes.has(toId)) {
                console.error("Store: addEdge failed - missing nodes", fromId, toId);
                return null;
            }

            const n1 = this.nodes.get(fromId);
            const n2 = this.nodes.get(toId);

            // Calculate default length 2D
            const dist = Math.sqrt((n1.x - n2.x) ** 2 + (n1.y - n2.y) ** 2);

            const edge = new Edge({
                id,
                fromNodeId: fromId,
                toNodeId: toId,
                length: dist,
                ...properties
            });
            this.edges.set(id, edge);

            // Force Reactivity for Maps (Pinia/Vue 3 sometimes needs this for getters to trigger)
            this.edges = new Map(this.edges);

            console.log("Store: Edge created", edge);
            return edge;
        },

        updateEdge(id, props) {
            this.saveHistory();
            const edge = this.edges.get(id);
            if (edge) {
                Object.assign(edge, props);
            }
        },

        updateNode(id, props) {
            this.saveHistory();
            const node = this.nodes.get(id);
            if (node) {
                Object.assign(node, props);
            }
        },

        updateArea(id, props) {
            this.saveHistory();
            // Areas are in an array
            const area = this.areas.find(a => a.id === id);
            if (area) {
                Object.assign(area, props);
            }
        },

        moveNode(id, x, y) {
            const node = this.nodes.get(id);
            if (node) {
                node.move(x, y);
            }
        },

        updateNetworkData(data) {
            this.saveHistory();

            // Bulk update from PreprocessingModal
            if (data.nodes) {
                // Create new map for reactivity
                const pendingNodes = new Map(this.nodes);
                data.nodes.forEach(updatedNode => {
                    const node = pendingNodes.get(updatedNode.id);
                    if (node) {
                        // Merge props back
                        Object.assign(node, updatedNode);
                    }
                });
                this.nodes = pendingNodes;
            }

            if (data.edges) {
                const pendingEdges = new Map(this.edges);
                data.edges.forEach(updatedEdge => {
                    const edge = pendingEdges.get(updatedEdge.id);
                    if (edge) {
                        // Ensure profile is correctly deep merged or replaced
                        if (updatedEdge.profile) {
                            edge.profile = { ...edge.profile, ...updatedEdge.profile };
                        }
                        Object.assign(edge, updatedEdge);
                    }
                });
                this.edges = pendingEdges;
            }

            if (data.areas) {
                // Areas array replacement
                this.areas = data.areas.map(raw => {
                    try {
                        // If it's already an Area, great, otherwise hydrate
                        // Ideally we merge into existing IDs if possible to preserve refs?
                        // But Modal sends ALL areas back.
                        return new Area(raw);
                    } catch (e) {
                        console.warn("Failed to update area", e);
                        return null;
                    }
                }).filter(a => a !== null);
            }
        },

        // --- Area Actions ---
        addDrawingPoint(point) {
            this.editor.drawingPoints.push(point);
        },

        resetDrawing() {
            this.editor.drawingPoints = [];
        },

        addArea(payload) {
            this.saveHistory();
            const { points, properties } = payload; // properties: { id, slope, ... }

            // Ensure ID
            const id = properties.id || `Area_${Date.now()}`;

            const area = new Area({
                id: id,
                points: points,
                // Map properties
                slope: properties.slope,
                runoffCoeff: properties.runoffCoeff, // Expecting correctly named prop
                nodeId: properties.nodeId,
                size: properties.size // ha
            });

            this.areas.push(area);
            return area;
        },

        // Simulation Runner
        async runSimulation() {
            this.simulation.status = 'running';
            this.simulation.progress = 0;
            this.simulation.error = null;

            try {
                // Serializing payload for Worker (Rescue Phase 3)
                // Convert Maps to Arrays and ensure POJOs (toJSON)
                const payload = {
                    nodes: this.nodeArray.map(n => n.toJSON ? n.toJSON() : n),
                    edges: this.edgeArray.map(e => e.toJSON ? e.toJSON() : e),
                    areas: this.areaArray.map(a => a.toJSON ? a.toJSON() : a),
                    options: {
                        durationHours: this.rain.duration,
                        rainMethod: this.rain.method,
                        rainSeries: this.rain.method === 'model' && this.rain.activeModelRain
                            ? JSON.parse(JSON.stringify(this.rain.activeModelRain.series))
                            : [],
                        // Pass Kostra if needed, or handle in Worker
                        kostraData: this.rain.kostraData ? JSON.parse(JSON.stringify(this.rain.kostraData)) : null
                    }
                };

                // We need WorkerController instance. 
                // Assuming it's initialized globally or we import it.
                // For now, let's assume we import a singleton or instatiate it here.
                // Ideally store should contain the controller instance or access a service.
                // Let's lazily load it.
                if (!workerControllerInstance) {
                    const { WorkerController } = await import('../core/worker/WorkerController.js');
                    workerControllerInstance = new WorkerController();
                }

                // Deep clone payload to strip all Vue Proxies and ensure worker safety
                const cleanPayload = JSON.parse(JSON.stringify(payload));
                const result = await workerControllerInstance.runSimulation(cleanPayload);
                this.simulation.results = result;
                this.simulation.status = 'success';
                this.ui.showResultsModal = true; // Auto open results?
            } catch (err) {
                console.error(err);
                this.simulation.error = err.message;
                this.simulation.status = 'error';
            }
        }
    }
});
