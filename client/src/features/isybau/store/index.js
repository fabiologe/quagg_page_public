import { defineStore } from 'pinia';
import { Node } from '../core/domain/Node.js';
import { Edge } from '../core/domain/Edge.js';
import { Area } from '../core/domain/Area.js';
import { validateNetwork } from '../utils/preSolveValidation.js';
import { detectCRS } from '../utils/KostraService.js';

let workerControllerInstance = null;

export const useIsybauStore = defineStore('isybau-module', {
    state: () => ({
        nodes: new Map(), // ID -> Node instance
        edges: new Map(), // ID -> Edge instance
        areas: [], // Catchment areas
        inspections: [], // Befahrungen / TV-Daten

        // Hochgeladenes DGM (siehe utils/xyzTerrainImporter.js) — sitzungsbezogen,
        // bewusst NICHT Teil des Projekt-Snapshots (siehe getters.projectSnapshot).
        terrain: null,

        // Metadata / Global Props (from XML)
        metadata: {},
        editor: {
            mode: 'view', // 'view', 'select', 'pan', 'addNode', 'addEdge', 'addArea'
            selectedId: null,
            selectedType: null, // 'node', 'edge', 'area'
            edgeStartNode: null,
            drawingPoints: [], // Temporary points for Area creation
            focusTargetId: null // kurzzeitiges Highlight-/Scroll-Ziel in den Viewern
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
        // Sichtbarkeit ALLER Modals lebt hier — Komponenten togglen nur Flags,
        // die Verdrahtung übernimmt components/modals/IsybauModals.vue.
        ui: {
            showKostraModal: false,
            showRainModal: false,
            showResultsModal: false,
            showDebugModal: false,
            showPreprocessingModal: false,
            showValidationModal: false,
            showHelpModal: false,
            showProjectManager: false,
            showElementModal: false,
            showEzgCrsModal: false, // EZG-Karte: Koordinatensystem-Bestätigung
            showNewProjectLocationModal: false, // "Neu starten": Standortwahl vor dem ersten Klick
            preprocessingFocusId: null, // Element, das das Preprocessing beim Öffnen vorselektiert
            preprocessingFocusType: null, // 'node' | 'edge' | 'area' — nötig, da Haltungs- und Schacht-IDs in ISYBAU-Daten kollidieren können
            elementModal: { mode: 'node', data: {} }, // Kontext fürs Erstellen-Modal
            importWarnings: [], // Sammelbericht übersprungener Elemente beim Import
            darkMode: typeof localStorage !== 'undefined' && localStorage.getItem('isybau-theme') === 'dark'
        },
        simulation: {
            status: 'idle', // idle, running, success, error
            results: null,
            error: null,
            invalidElementId: null, // Element, das eine Vorab-Validierung als Ursache identifiziert hat
            invalidElementType: null, // 'node' | 'edge'
            preSolveWarnings: [] // nicht-fatale Vorab-Funde (z.B. WARN08), blockieren den Lauf nicht
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

        // Serialisierter Projektstand für Speichern (ProjectManager)
        projectSnapshot: (state) => ({
            nodes:       Array.from(state.nodes.values()).map(n => n.toJSON ? n.toJSON() : n),
            edges:       Array.from(state.edges.values()).map(e => e.toJSON ? e.toJSON() : e),
            areas:       state.areas.map(a => a.toJSON ? a.toJSON() : a),
            inspections: state.inspections,
            metadata:    state.metadata,
            rain:        state.rain,
        }),

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

            // Sammelbericht: übersprungene Elemente werden dem User gemeldet
            // statt nur in der Konsole zu verschwinden.
            const importWarnings = [];

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
                            importWarnings.push(`Knoten ${raw.id} übersprungen: ${e.message}`);
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
                            importWarnings.push(`Haltung ${raw.id} übersprungen: ${e.message}`);
                        }
                    });
                } else if (Array.isArray(parsedData.network.edges)) {
                    parsedData.network.edges.forEach(raw => {
                        const edge = Edge.fromRaw(raw);
                        this.edges.set(edge.id, edge);
                    });
                }
            }

            // Hydrate Inspections (Befahrungen / TV-Daten)
            this.inspections = Array.isArray(parsedData.inspections) ? parsedData.inspections : [];

            // Hydrate Areas
            let rawAreas = (parsedData.hydraulics && parsedData.hydraulics.areas) || (parsedData.network && parsedData.network.areas) || [];

            // Fallback: Wenn keine Flächen-Polygone vorhanden sind, aber hydraulische
            // Einzugsgebiete (<Einzugsgebiet>), diese als Flächen ohne Geometrie übernehmen.
            // Nur als Fallback, sonst würde dieselbe Fläche doppelt in den Abfluss eingehen.
            const rawCatchments = (parsedData.hydraulics && parsedData.hydraulics.catchments) || [];
            if (rawAreas.length === 0 && rawCatchments.length > 0) {
                rawAreas = rawCatchments.map(c => ({
                    id: c.id || `EZG_${c.nodeId}`,
                    points: [],
                    size: c.area,
                    runoffCoeff: c.runoffCoeff,
                    nodeId: c.nodeId,
                    schmutzfracht: c.schmutzfracht || null
                }));
            }

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
                        } else if (this.nodes.has(targetEdgeId)) {
                            // Fallback: Referenz zeigt direkt auf einen Knoten (z.B. aus
                            // dem eigenen XML-Export von gezeichneten Flächen mit
                            // Knoten-Anschluss). Erst NACH der Haltungs-Suche prüfen,
                            // da Haltungs- und Knoten-IDs in ISYBAU-Daten kollidieren können.
                            area.nodeId = targetEdgeId;
                        } else {
                            console.warn(`Area ${area.id} references missing Edge '${raw.edgeId}' (Target: '${targetEdgeId}')`);
                            importWarnings.push(`Fläche ${area.id}: referenzierte Haltung '${raw.edgeId}' nicht gefunden — kein Anschlussknoten.`);
                        }
                    }

                    return area;
                } catch (e) {
                    console.warn(`Failed to hydrate area ${raw.id}:`, e);
                    importWarnings.push(`Fläche ${raw.id} übersprungen: ${e.message}`);
                    return null;
                }
            }).filter(a => a !== null);

            // Schmutzfracht-Daten aus <Einzugsgebiet>-Blöcken auf gleichnamige Flächen
            // mergen — unabhängig vom reinen Geometrie-Fallback oben, da ein "Gebiet"
            // laut ISYBAU-Schema unabhängig von einer "Fläche" existiert und eine
            // Fläche mit Polygon-Geometrie zusätzlich Gebietsdaten haben kann.
            for (const c of rawCatchments) {
                if (!c.schmutzfracht) continue;
                const match = this.areas.find(a => a.id === c.id);
                if (match) match.schmutzfracht = c.schmutzfracht;
            }

            console.log(`IsybauStore: Loaded ${this.nodes.size} nodes, ${this.edges.size} edges, ${this.areas.length} areas.`);

            this.ui.importWarnings = importWarnings;

            // EZG-Karte: Koordinatensystem schätzen (nur eine Vermutung, blockiert
            // den Import nicht). Bereits bestätigte CRS (z.B. beim Neuladen eines
            // gespeicherten Projekts) werden nicht überschrieben.
            if (!this.metadata.crs?.confirmed && this.nodes.size > 0) {
                const c = this.center;
                this.metadata.crs = {
                    epsg: detectCRS(c.x, c.y),
                    confirmed: false,
                    source: 'auto'
                };
            }
        },

        clear() {
            this.nodes.clear();
            this.edges.clear();
            this.areas = [];
            this.inspections = [];
            this.editor.selectedId = null;
            this.simulation.results = null;
            // terrain bewusst NICHT hier zurücksetzen: clear() läuft auch bei
            // jedem XML-Import (loadParsedData()) — DGM ist an den realen
            // Standort gebunden, nicht an den Netzentwurf, und soll genau den
            // Workflow "erst DGM hochladen, dann Netz importieren" überstehen.
            // Explizites Entfernen weiterhin über clearTerrain() möglich.
            return; // Explicit return
        },

        /** Ergebnis von terrainImportWorker.js übernehmen (siehe Sidebar.vue-Upload). */
        importTerrain(data) {
            this.terrain = data;
        },

        clearTerrain() {
            this.terrain = null;
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

        // --- UI-/Workflow-Actions (Verdrahtung siehe components/modals/IsybauModals.vue) ---

        /** EZG-Karte: vom Nutzer bestätigtes/überschriebenes Koordinatensystem übernehmen. */
        confirmCRS(epsg) {
            this.metadata.crs = { epsg, confirmed: true, source: 'confirmed' };
            this.ui.showEzgCrsModal = false;
        },

        /**
         * "Neu starten": Startort für ein leeres Projekt festlegen. Anders als
         * confirmCRS() (Bestätigung eines aus XML-Koordinaten GESCHÄTZTEN CRS)
         * legt dies CRS UND einen Referenzpunkt (bereits projizierte lokale
         * Meter) gleichzeitig fest — deshalb eine eigene Action statt
         * confirmCRS() zu erweitern.
         */
        setOriginAnchor({ epsg, x, y, label }) {
            this.metadata.crs = { epsg, confirmed: true, source: 'anchor' };
            this.metadata.originAnchor = { x, y, label };
        },

        /** Element in den Viewern kurz hervorheben/anfahren (z.B. aus Tabellenzeile). */
        flashFocus(id) {
            this.editor.focusTargetId = id;
            // Watcher triggern nur auf Wertwechsel — nach kurzer Zeit zurücksetzen,
            // damit derselbe Klick erneut funktioniert.
            setTimeout(() => { this.editor.focusTargetId = null; }, 500);
        },

        /** Dark/Light umschalten (Sidebar-Button unten links) — persistiert in localStorage. */
        toggleDarkMode() {
            this.ui.darkMode = !this.ui.darkMode;
            try {
                localStorage.setItem('isybau-theme', this.ui.darkMode ? 'dark' : 'light');
            } catch (e) { /* Storage evtl. deaktiviert (Privatmodus) — Theme bleibt sitzungsbezogen */ }
        },

        /** Erstellen-Modal mit Kontext öffnen (Editor-Klick: Knoten/Haltung/Fläche). */
        openElementModal(mode, data = {}) {
            this.ui.elementModal = { mode, data };
            this.ui.showElementModal = true;
        },

        /** Save-Handler des ElementPropertiesModal (nur Erstellen, kein Edit). */
        createElement({ mode, data }) {
            if (mode === 'area') {
                const points = data.points || [];
                if (points.length < 3) {
                    console.error('createElement: Fläche braucht mindestens 3 Punkte');
                    return;
                }
                this.addArea({ points, properties: data });
            } else if (mode === 'edge') {
                this.addEdge({
                    fromId: data.metaFromId || data.fromNodeId,
                    toId: data.metaToId || data.toNodeId,
                    properties: data
                });
            } else if (mode === 'node') {
                const props = { ...data };
                // Map UI field 'cover' to Domain field 'coverZ'
                if (props.cover !== undefined) {
                    props.coverZ = props.cover;
                    delete props.cover;
                }
                // UI-only Hinweis-Flag (DGM-Vorschlag) — kein Domain-Feld
                delete props.demSuggested;
                this.addNode(data.x, data.y, props);
            }
            this.ui.showElementModal = false;
        },

        /** Gespeichertes Projekt (IndexedDB-Snapshot) in den Store laden. */
        loadProjectSnapshot(data) {
            this.loadParsedData({
                metadata: data.metadata || {},
                network: { nodes: data.nodes, edges: data.edges },
                hydraulics: { areas: data.areas || [] },
                inspections: data.inspections || [],
            });
            if (data.rain) Object.assign(this.rain, data.rain);
        },

        /**
         * „In Tabelle bearbeiten" aus ElementInfo: Preprocessing öffnen + Element vorselektieren.
         * @param {string} id
         * @param {'node'|'edge'|'area'} type - explizit, denn Haltungs-ID und
         *   Zulaufknoten-ID sind in ISYBAU-Daten oft identisch (z.B. beide "06001").
         *   Ohne den Typ würde die Suche im Preprocessing immer zuerst den Knoten
         *   finden und fälschlich dorthin springen statt zur Haltung.
         */
        openPreprocessingFor(id, type) {
            this.ui.preprocessingFocusId = id;
            this.ui.preprocessingFocusType = type;
            this.ui.showPreprocessingModal = true;
        },

        /** „Übernehmen" im Preprocessing: Daten mergen + Auto-Validierung öffnen. */
        applyPreprocessing(data) {
            this.updateNetworkData(data);
            this.ui.showPreprocessingModal = false;
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

        /**
         * Mehrfach-Löschen (Rechteck-Auswahl im Editor): Knoten, Haltungen und
         * Flächen in EINEM Undo-Schritt; Haltungen an gelöschten Knoten kaskadieren.
         */
        removeMany(ids = []) {
            if (!ids.length) return;
            this.saveHistory();
            const idSet = new Set(ids);

            for (const id of idSet) {
                this.nodes.delete(id);
            }
            for (const [eId, edge] of this.edges) {
                if (idSet.has(eId) || idSet.has(edge.fromNodeId) || idSet.has(edge.toNodeId)) {
                    this.edges.delete(eId);
                }
            }
            this.areas = this.areas.filter(a => !idSet.has(a.id));

            if (this.editor.selectedId && idSet.has(this.editor.selectedId)) {
                this.clearSelection();
            }

            // Force Reactivity for Maps
            this.nodes = new Map(this.nodes);
            this.edges = new Map(this.edges);
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

        splitEdgeWithNode(edgeId, clickCoords = null) {
            this.saveHistory();

            const edge = this.edges.get(edgeId);
            if (!edge) {
                console.error("splitEdgeWithNode: Edge not found", edgeId);
                return null;
            }

            const startNode = this.nodes.get(edge.fromNodeId);
            const endNode = this.nodes.get(edge.toNodeId);

            if (!startNode || !endNode) {
                console.error("splitEdgeWithNode: Missing start or end node");
                return null;
            }

            // Calculate default t = 0.5 (middle)
            let t = 0.5;

            // If we have exact click coordinates, project the point onto the edge vector
            if (clickCoords && typeof clickCoords.x === 'number' && typeof clickCoords.y === 'number') {
                const vectorEdgeX = endNode.x - startNode.x;
                const vectorEdgeY = endNode.y - startNode.y;

                const vectorClickX = clickCoords.x - startNode.x;
                const vectorClickY = clickCoords.y - startNode.y;

                // Dot product and projection length squared
                const edgeLenSq = (vectorEdgeX * vectorEdgeX) + (vectorEdgeY * vectorEdgeY);
                if (edgeLenSq > 0) {
                    const dot = (vectorClickX * vectorEdgeX) + (vectorClickY * vectorEdgeY);
                    t = dot / edgeLenSq;
                }

                // Clamp t between 0.05 and 0.95 to prevent placing the node exactly on top of the ends
                t = Math.max(0.05, Math.min(0.95, t));
            }

            // Geometrie interpolieren
            const newX = startNode.x + t * (endNode.x - startNode.x);
            const newY = startNode.y + t * (endNode.y - startNode.y);

            // Höhen für KNOTEN (Schacht) interpolieren:
            // DH (Deckel) basiert auf z der Knoten
            const zStart = startNode.z || 0;
            const zEnd = endNode.z || 0;
            const dhNew = zStart + t * (zEnd - zStart);

            // SH (Sohle des Schachts) basiert auf z - depth der Knoten
            const nodeShStart = zStart - (startNode.depth || 0);
            const nodeShEnd = zEnd - (endNode.depth || 0);
            const nodeShNew = nodeShStart + t * (nodeShEnd - nodeShStart);

            const depthNew = dhNew - nodeShNew;

            // Höhen für HALTUNG (Leitung) interpolieren:
            // Z Einlauf/Auslauf basieren auf z1/z2 der existierenden Haltung
            // Fallback: Wenn Edge keine z1/z2 hat, nehme die Node-Sohlhöhen
            const edgeZ1 = edge.z1 !== undefined && edge.z1 !== null ? edge.z1 : nodeShStart;
            const edgeZ2 = edge.z2 !== undefined && edge.z2 !== null ? edge.z2 : nodeShEnd;
            const edgeZNew = edgeZ1 + t * (edgeZ2 - edgeZ1);

            // 1. Neuen Knoten anlegen
            const newNodeId = `N_${Date.now()}`;
            const newNode = new Node({
                id: newNodeId,
                x: newX,
                y: newY,
                z: dhNew,
                depth: depthNew,
                type: 'Schacht'
            });
            this.nodes.set(newNodeId, newNode);

            // Profil und andere Eigenschaften der alten Haltung klonen
            const clonedProps = JSON.parse(JSON.stringify(edge.toJSON ? edge.toJSON() : edge));
            delete clonedProps.id;
            delete clonedProps.fromNodeId;
            delete clonedProps.toNodeId;
            delete clonedProps.length;
            delete clonedProps.coords; // Delete shape polyline so renderer falls back to straight segments

            // Explizite Sohlhöhen der Ersatzhaltungen setzen, damit das alte Gefälle nicht 1:1 kopiert wird 
            // (und damit z.B. Invert Offsets überschrieben werden)
            delete clonedProps.inOffset;
            delete clonedProps.outOffset;

            // 2. Erste neue Haltung (von startNode zu newNode)
            const newEdgeId1 = `E_${Date.now()}_split_1`;
            const newEdgeDist1 = Math.sqrt((startNode.x - newX) ** 2 + (startNode.y - newY) ** 2);

            const newEdge1 = new Edge({
                ...clonedProps,
                id: newEdgeId1,
                fromNodeId: startNode.id,
                toNodeId: newNodeId,
                length: newEdgeDist1,
                z1: edgeZ1,
                z2: edgeZNew
            });
            this.edges.set(newEdgeId1, newEdge1);

            // 3. Zweite neue Haltung (von newNode zu altem endNode)
            const newEdgeId2 = `E_${Date.now()}_split_2`;
            const newEdgeDist2 = Math.sqrt((newX - endNode.x) ** 2 + (newY - endNode.y) ** 2);

            const newEdge2 = new Edge({
                ...clonedProps,
                id: newEdgeId2,
                fromNodeId: newNodeId,
                toNodeId: endNode.id,
                length: newEdgeDist2,
                z1: edgeZNew,
                z2: edgeZ2
            });
            this.edges.set(newEdgeId2, newEdge2);

            // 4. Alte Haltung löschen
            this.edges.delete(edgeId);

            // Force Reactivity for Maps
            this.nodes = new Map(this.nodes);
            this.edges = new Map(this.edges);

            console.log(`Store: Edge ${edgeId} deleted & split into ${newEdgeId1} and ${newEdgeId2}`);
            return newNodeId;
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
                // isManhole/canOverflow nie blind zuweisen — die Kopplung
                // (isManhole=false erzwingt canOverflow=false) liegt im Node-Modell.
                const { isManhole, canOverflow, ...rest } = props;
                Object.assign(node, rest);
                if ((isManhole !== undefined || canOverflow !== undefined) && node.applyOverflowState) {
                    node.applyOverflowState({
                        isManhole: isManhole !== undefined ? isManhole : node.isManhole,
                        canOverflow: canOverflow !== undefined ? canOverflow : node.canOverflow
                    });
                }
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

            // Löschungen aus dem Preprocessing übernehmen — ohne diesen Schritt
            // kämen im Modal gelöschte Zeilen nach „Übernehmen" wieder zurück,
            // weil unten nur per ID gemerged wird.
            if (Array.isArray(data.deletedNodeIds) && data.deletedNodeIds.length) {
                const idSet = new Set(data.deletedNodeIds);
                for (const id of idSet) this.nodes.delete(id);
                // Haltungen an gelöschten Knoten kaskadieren
                for (const [eId, edge] of this.edges) {
                    if (idSet.has(edge.fromNodeId) || idSet.has(edge.toNodeId)) {
                        this.edges.delete(eId);
                    }
                }
                this.nodes = new Map(this.nodes);
                this.edges = new Map(this.edges);
            }
            if (Array.isArray(data.deletedEdgeIds) && data.deletedEdgeIds.length) {
                const idSet = new Set(data.deletedEdgeIds);
                for (const id of idSet) this.edges.delete(id);
                this.edges = new Map(this.edges);
            }

            // Bulk update from PreprocessingModal
            if (data.nodes) {
                // Create new map for reactivity
                const pendingNodes = new Map(this.nodes);
                data.nodes.forEach(updatedNode => {
                    const node = pendingNodes.get(updatedNode.id);
                    if (node) {
                        // Merge props back
                        Object.assign(node, updatedNode);
                        // Überstau-Kopplung re-normalisieren (Bulk-Edit setzt teils nur canOverflow)
                        if (node.applyOverflowState) node.applyOverflowState();
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
                size: properties.size, // ha
                // Haltungs-Anschluss (Outlet auf Edge): ohne diese Felder ginge die
                // 50/50-Aufteilung auf Zulauf-/Ablaufknoten für gezeichnete Flächen verloren
                nodeId2: properties.nodeId2,
                splitRatio: properties.splitRatio,
                edgeId: properties.edgeId
            });

            this.areas.push(area);
            return area;
        },

        // Simulation Runner
        async runSimulation() {
            if (this.simulation.status === 'running') {
                console.warn('Simulation läuft bereits — zweiter Start ignoriert.');
                return;
            }
            this.simulation.status = 'running';
            this.simulation.error = null;
            this.simulation.invalidElementId = null;
            this.simulation.invalidElementType = null;
            this.simulation.preSolveWarnings = [];

            // Vorab-Validierung gegen bekannte SWMM-Solver-Abbrüche (siehe
            // utils/preSolveValidation.js) — spart einen sinnlosen Solver-Start,
            // wenn z.B. eine Pumpen-Anspringtiefe <= Abschalttiefe ist, und zeigt
            // eine deutsche Meldung statt des rohen SWMM-Fehlertexts. Warnungen
            // (z.B. Sohlgefälle >= Haltungslänge) sind nicht fatal — der Solver
            // rechnet trotzdem weiter — und blockieren den Lauf daher nicht.
            const findings = validateNetwork(this.nodeArray, this.edgeArray);
            const firstError = findings.find(f => f.severity === 'error');
            if (firstError) {
                const label = firstError.elementType === 'node' ? 'Knoten' : 'Haltung';
                this.simulation.status = 'error';
                this.simulation.error = `${label} ${firstError.id}: ${firstError.message}`;
                this.simulation.invalidElementId = firstError.id;
                this.simulation.invalidElementType = firstError.elementType;
                return;
            }
            this.simulation.preSolveWarnings = findings
                .filter(f => f.severity === 'warning')
                .map(f => ({
                    id: f.id,
                    elementType: f.elementType,
                    text: `${f.elementType === 'node' ? 'Knoten' : 'Haltung'} ${f.id}: ${f.message}`
                }));

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
