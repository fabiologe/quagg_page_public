import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useGeoStore = defineStore('geo', () => {
    // State
    /** @type {import('vue').Ref<any>} */
    const terrain = ref(null); // Mesh/Elevation Data

    /** @type {import('vue').Ref<Array<{id: string, x: number, y: number, z: number, type: string}>>} */
    const nodes = ref([]);

    /** @type {import('vue').Ref<{type: 'FeatureCollection', features: Array<any>}>} */
    const buildings = ref({ type: 'FeatureCollection', features: [] });

    /** @type {import('vue').Ref<{type: 'FeatureCollection', features: Array<any>}>} */
    const boundaries = ref({ type: 'FeatureCollection', features: [] });

    /** @type {import('vue').Ref<{lat: number, lng: number}>} */
    const mapCenter = ref({ lat: 0, lng: 0 });

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

    function addBuilding(feature) {
        buildings.value.features.push(feature);
    }

    function addBoundary(feature) {
        boundaries.value.features.push(feature);
    }

    function getFeatureById(id) {
        // Search in nodes
        const node = nodes.value.find(n => n.id === id);
        if (node) return node;

        // Search in buildings
        const building = buildings.value.features.find(f => f.id === id || (f.properties && f.properties.id === id));
        if (building) return building;

        // Search in boundaries
        const boundary = boundaries.value.features.find(f => f.id === id || (f.properties && f.properties.id === id));
        if (boundary) return boundary;

        return null;
    }

    return {
        terrain,
        nodes,
        buildings,
        boundaries,
        mapCenter,
        importTerrain,
        addNode,
        removeNode,
        addBuilding,
        addBoundary,
        getFeatureById
    };
});
