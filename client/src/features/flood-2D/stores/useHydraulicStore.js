import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useHydraulicStore = defineStore('hydraulic', () => {
    // State
    /**
     * @type {import('vue').Ref<Object.<string, {id: string, name: string, type: 'Zufluss'|'Wasserstand'|string, data: Array<{t: number, v: number}>}>>}
     */
    const ganglinien = ref({});

    /** @type {import('vue').Ref<Object.<string, string>>} */
    const assignments = ref({}); // { geoObjectId: ganglinieId }

    /** @type {import('vue').Ref<Array<any>>} */
    const rainData = ref([]);

    /** @type {import('vue').Ref<Object|null>} */
    const kostraGrid = ref(null);

    /** @type {import('vue').Ref<{lat: number, lon: number}|null>} */
    const rainLocation = ref(null);

    /** @type {import('vue').Ref<{duration: number, returnPeriod: number, modelType: string}>} */
    const rainConfig = ref({
        duration: 0,
        returnPeriod: 0,
        modelType: ''
    });

    /** @type {import('vue').Ref<string|null>} */
    const activeGanglinieId = ref(null);

    // Actions
    function createGanglinie(name, type) {
        const id = crypto.randomUUID();
        ganglinien.value[id] = {
            id,
            name,
            type: type || 'Zufluss',
            data: [{ t: 0, v: 0 }, { t: 3600, v: 0 }] // Default 1h flat
        };
        return id;
    }

    function deleteGanglinie(id) {
        if (ganglinien.value[id]) {
            delete ganglinien.value[id];
        }
        // Remove assignments
        for (const geoId in assignments.value) {
            if (assignments.value[geoId] === id) {
                delete assignments.value[geoId];
            }
        }
        // Reset active if needed
        if (activeGanglinieId.value === id) {
            activeGanglinieId.value = null;
        }
    }

    function updateGanglinieData(id, points) {
        if (ganglinien.value[id]) {
            ganglinien.value[id].data = points;
        }
    }

    function setActiveGanglinie(id) {
        if (ganglinien.value[id] || id === null) {
            activeGanglinieId.value = id;
        }
    }

    /**
     * Assigns a Ganglinie to multiple GeoObjects (Nodes/Boundaries)
     * @param {Array<string>} geoIdsArray 
     * @param {string} ganglinieId 
     */
    function assignToObjects(geoIdsArray, ganglinieId) {
        if (ganglinien.value[ganglinieId]) {
            geoIdsArray.forEach(geoId => {
                assignments.value[geoId] = ganglinieId;
            });
        }
    }

    function getAssignmentsByGanglinie(id) {
        let count = 0;
        for (const key in assignments.value) {
            if (assignments.value[key] === id) count++;
        }
        return count;
    }

    function setKostraGrid(raw, location) {
        kostraGrid.value = raw;
        rainLocation.value = location;
    }

    function setRainData(data, config) {
        rainData.value = data;
        if (config) {
            rainConfig.value = { ...rainConfig.value, ...config };
        }
    }

    return {
        ganglinien,
        activeGanglinieId,
        assignments,
        rainData,
        kostraGrid,
        rainLocation,
        rainConfig,
        createGanglinie,
        deleteGanglinie,
        updateGanglinieData,
        setActiveGanglinie,
        assignToObjects,
        getAssignmentsByGanglinie,
        setKostraGrid,
        setRainData
    };
});
