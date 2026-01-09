import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useHydraulicStore = defineStore('hydraulic', () => {
    // State
    /**
     * @type {import('vue').Ref<Object.<string, {id: string, name: string, type: string, data: Array<{t: number, v: number}>}>>}
     */
    const profiles = ref({});

    /** @type {import('vue').Ref<Object.<string, string>>} */
    const assignments = ref({}); // { nodeId: profileId }

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
    const activeProfileId = ref(null);

    // Actions
    function createProfile(name, type) {
        const id = crypto.randomUUID();
        profiles.value[id] = {
            id,
            name,
            type: type || 'inflow',
            data: [{ t: 0, v: 0 }, { t: 3600, v: 0 }] // Default 1h flat
        };
        return id;
    }

    function deleteProfile(id) {
        if (profiles.value[id]) {
            delete profiles.value[id];
        }
        // Remove assignments
        for (const nodeId in assignments.value) {
            if (assignments.value[nodeId] === id) {
                delete assignments.value[nodeId];
            }
        }
        // Reset active if needed
        if (activeProfileId.value === id) {
            activeProfileId.value = null;
        }
    }

    function updateProfileData(id, points) {
        if (profiles.value[id]) {
            profiles.value[id].data = points;
        }
    }

    function setActiveProfile(id) {
        if (profiles.value[id] || id === null) {
            activeProfileId.value = id;
        }
    }

    function assignProfileToNode(nodeId, profileId) {
        if (profiles.value[profileId]) {
            assignments.value[nodeId] = profileId;
        }
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
        profiles,
        activeProfileId,
        assignments,
        rainData,
        kostraGrid,
        rainLocation,
        rainConfig,
        createProfile,
        deleteProfile, // New
        updateProfileData,
        setActiveProfile, // New
        assignProfileToNode,
        setKostraGrid,
        setRainData
    };
});
