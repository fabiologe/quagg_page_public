import { defineStore } from 'pinia';
import { XMLNodeParser } from '../features/flood-2D/middleware/importers/XMLNodeParser.js';
import { GeoJSONParser } from '../features/flood-2D/middleware/importers/GeoJSONParser.js';

export const useScenarioStore = defineStore('scenario', {
    state: () => ({
        // The core scenario data (GeoJSON)
        geoJson: {
            type: "FeatureCollection",
            features: [] // All buildings, sources, walls, boundaries
        },

        // Imported Nodes (Manholes, Inlets) from XML
        nodes: [],

        // 3D Terrain Data (Float32Array for performance)
        demData: null,
        demGrid: null, // Metadata: { ncols, nrows, cellsize, minZ, maxZ, bounds, center }
        demRaw: null,  // Original file content (optional, for re-parsing/download)

        // Simulation parameters
        simulationConfig: {
            duration_s: 3600,      // Total simulation time in seconds
            timestep_s: 1.0,       // Output interval
            globalRain_mm: 50,     // Uniform rain intensity
            rainStart_s: 0,
            rainDuration_s: 1800
        },

        // Editor UI State
        selectedFeatureId: null, // ID of currently selected feature
        editorMode: 'SETUP',     // 'SETUP' (2D), 'IMPORT_TERRAIN' (3D), 'SIMULATION'

        // Validation State
        validationErrors: [],    // Array of error objects
        isValidating: false
    }),

    getters: {
        getFeatureById: (state) => (id) => {
            return state.geoJson.features.find(f => f.id === id);
        },
        selectedFeature: (state) => {
            return state.geoJson.features.find(f => f.id === state.selectedFeatureId);
        },
        sources: (state) => state.geoJson.features.filter(f => f.properties.type === 'SOURCE'),
        buildings: (state) => state.geoJson.features.filter(f => f.properties.type === 'BUILDING'),
    },

    actions: {
        // --- IMPORT ACTIONS ---
        async importFile(file) {
            if (!file) return;

            const text = await file.text();
            const name = file.name.toLowerCase();

            if (name.endsWith('.xml')) {
                // Parse XML Nodes
                const newNodes = XMLNodeParser.parse(text);
                console.log(`Imported ${newNodes.length} nodes from XML.`);
                this.nodes = [...this.nodes, ...newNodes];
                return { type: 'XML', count: newNodes.length };

            } else if (name.endsWith('.json') || name.endsWith('.geojson')) {
                // Parse GeoJSON
                const collection = GeoJSONParser.parse(text);
                if (collection && collection.features) {
                    // Append to existing features
                    // Map to ensure IDs? GeoJSONParser handles IDs.
                    this.geoJson.features = [...this.geoJson.features, ...collection.features];
                    console.log(`Imported ${collection.features.length} features.`);
                    return { type: 'GEOJSON', count: collection.features.length };
                }

            } else if (name.endsWith('.xyz') || name.endsWith('.txt') || name.endsWith('.asc')) {
                // XYZ/ASC Terrain
                // Existing logic integration
                // We save the raw content so MapEditor3D or other components can process it
                // Or we dispatch to a future XYZParser. 
                // For now, we store raw so UI can handle parsing or we trigger it if we move logic here.
                this.demRaw = text;
                // Note: Actual parsing to gridData currently happens in MapEditor3D.vue 
                // Ideally we'd move that logic to a middleware/importer/XYZParser.js
                return { type: 'TERRAIN', raw: true };
            }
        },

        // --- TERRAIN ACTIONS ---
        setTerrain(parsedData) {
            // We store the typed array and metadata
            this.demData = parsedData.gridData;
            this.demGrid = {
                ncols: parsedData.ncols,
                nrows: parsedData.nrows,
                cellsize: parsedData.cellsize,
                minZ: parsedData.minZ,
                maxZ: parsedData.maxZ,
                bounds: parsedData.bounds,
                center: parsedData.center
            };
            // If raw content is needed, add it to 'demRaw'
        },

        // --- FEATURE ACTIONS ---
        addFeature(feature) {
            if (!feature.id) feature.id = crypto.randomUUID();
            this.geoJson.features.push(feature);
        },

        updateFeatureGeometry(id, newGeometry) {
            const feature = this.getFeatureById(id);
            if (feature) {
                feature.geometry = newGeometry;
                // Trigger validation here if needed
            }
        },

        updateFeatureProperties(id, props) {
            const feature = this.getFeatureById(id);
            if (feature) {
                feature.properties = { ...feature.properties, ...props };
            }
        },

        deleteFeature(id) {
            const idx = this.geoJson.features.findIndex(f => f.id === id);
            if (idx !== -1) {
                this.geoJson.features.splice(idx, 1);
                if (this.selectedFeatureId === id) {
                    this.selectedFeatureId = null;
                }
            }
        },

        setSelection(id) {
            this.selectedFeatureId = id;
        },

        // --- SIMULATION PREPARATION (Stub for now) ---
        async prepareSimulationInput() {
            // Transform State to Simulation Input Format
            const sources = this.sources; // Use getter
            const buildings = this.buildings; // Use getter (includes obstacles?)

            // Note: Obstacles might need a separate getter or be merged into buildings.
            // For now, we assume Obstacles are handled or user draws them as buildings.

            return {
                xyz: this.demRaw, // Original DGM string needed by Rasterizer? 
                // Or if we moved to native, do we just pass grid?
                // Plan says: "xyz: xyzDataStr". If demRaw is null, we might have issue.
                // Assuming demRaw is populated during import.

                buildings: {
                    type: 'FeatureCollection',
                    features: buildings.map(b => JSON.parse(JSON.stringify(b)))
                },

                roughness: null, // Future

                rain: {
                    intensity: this.simulationConfig.globalRain_mm,
                    duration: this.simulationConfig.rainDuration_s
                },

                boundaries: sources.map(s => ({
                    active: true,
                    name: s.properties.name || 'Source',
                    value: s.properties.value, /* Removed is_sink check as per new logic if needed, keeping simple for now */
                    type: s.properties.type === 'SINK' ? 'OUT' : 'IN', /* Infer from type if possible, or use property */
                    geometryType: s.geometry.type,
                    geometry: s.geometry,
                    duration: s.properties.duration_s || 3600
                })),

                config: {
                    sim_time: this.simulationConfig.duration_s,
                    initial_tstep: this.simulationConfig.timestep_s,
                    saveint: this.simulationConfig.timestep_s
                }
            };
        }
    }
});
