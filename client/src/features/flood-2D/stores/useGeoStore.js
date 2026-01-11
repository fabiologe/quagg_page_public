import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useGeoStore = defineStore('geo', () => {
    // State
    /** @type {import('vue').Ref<any>} */
    const terrain = ref(null); // Mesh/Elevation Data

    /** @type {import('vue').Ref<Array<{id: string, x: number, y: number, z: number, type: string}>>} */
    const nodes = ref([]);

    /** @type {import('vue').Ref<{type: 'FeatureCollection', features: Array<any>}>} */
    const boundaries = ref({ type: 'FeatureCollection', features: [] });

    // New "Single Source of Truth" for all baking operations
    /** @type {import('vue').Ref<Array<{id: string, type: string, geometry: any, properties: any, timestamp: number}>>} */
    const modifications = ref([]);

    /** @type {import('vue').Ref<{lat: number, lng: number}>} */
    const mapCenter = ref({ lat: 0, lng: 0 });

    // Getters / Computed
    // COMPATIBILITY LAYER: Simulates the old 'buildings' state
    const buildings = computed(() => {
        return {
            type: 'FeatureCollection',
            features: modifications.value.filter(m => m.type === 'BUILDING')
        };
    });

    const excavations = computed(() => {
        return modifications.value.filter(m => m.type === 'EXCAVATION');
    });

    // Actions
    function importTerrain(data) {
        terrain.value = data;
    }

    function addNode(node) {
        nodes.value.push(node);
    }

    function removeNode(id) {
        nodes.value = nodes.value.filter(n => n.id !== id);
    }

    function addBoundary(feature) {
        boundaries.value.features.push(feature);
    }

    function addModification(type, geometry, properties = {}) {
        const payload = {
            id: crypto.randomUUID(),
            type: type.toUpperCase(), // e.g. 'BUILDING'
            geometry,   // The GeoJSON Polygon
            properties, // { height: 10, ... }
            timestamp: Date.now()
        };

        modifications.value.push(payload);
        console.log(`[GeoStore] Added ${type}:`, payload);
    }

    // Legacy Action Wrapper
    function addBuilding(feature) {
        console.warn("Deprecated: addBuilding called. Redirecting to addModification.");
        // Extract geometry and properties from the feature if passed as a GeoJSON Feature
        const geometry = feature.geometry || feature;
        const properties = feature.properties || (feature.geometry ? {} : feature); // Fallback logic might need adjustment based on usage

        // In the previous code, addBuilding took a 'feature'. 
        // Based on the user's prompt "addBuilding(polygon, height)", let's try to support the feature object pattern 
        // effectively, assuming 'feature' conforms to the GeoJSON structure or the call site adapts.
        // However, the prompt specificied: addBuilding(polygon, height) in the example, BUT the original code had addBuilding(feature).
        // I will stick to the original signature `addBuilding(feature)` but map it to `addModification`.

        let geom = feature.geometry;
        let props = feature.properties || {};

        if (!geom) {
            // If it's just a geometry object passed directly (unlikely given original code type hint but possible)
            if (feature.type === 'Polygon' || feature.type === 'MultiPolygon') {
                geom = feature;
            }
        }

        addModification('BUILDING', geom, props);
    }

    function clearModifications() {
        modifications.value = [];
    }

    function getFeatureById(id) {
        // Search in nodes
        const node = nodes.value.find(n => n.id === id);
        if (node) return node;

        // Search in modifications (which covers buildings)
        const modification = modifications.value.find(m => m.id === id);
        if (modification) return modification;

        // Search in boundaries
        const boundary = boundaries.value.features.find(f => f.id === id || (f.properties && f.properties.id === id));
        if (boundary) return boundary;

        return null;
    }

    function updateFeatureProperty(id, prop, value) {
        const feature = getFeatureById(id);
        if (!feature) return;

        // Handle Modification/GeoJSON Feature (with properties)
        if (feature.type && feature.type !== 'Feature' && !feature.properties) {
            // It might be a direct node object
            // Handle Flat Object (Node)
            if (!feature.properties) feature.properties = {};
            feature.properties[prop] = value;
        } else {
            // Standard GeoJSON-like structure
            if (!feature.properties) feature.properties = {};
            feature.properties[prop] = value;
        }
    }

    return {
        terrain,
        nodes,
        buildings, // Now a computed ref
        excavations,
        boundaries,
        modifications, // New state
        mapCenter,
        importTerrain,
        addNode,
        removeNode,
        addBuilding, // Wrapper
        addBoundary,
        addModification, // New action
        clearModifications, // New action
        getFeatureById,
        updateFeatureProperty
    };
});
