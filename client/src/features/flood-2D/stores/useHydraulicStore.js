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

    // Actions
    function createProfile(name, type) {
        const id = crypto.randomUUID();
        profiles.value[id] = {
            id,
            name,
            type,
            data: []
        };
        return id;
    }

    function updateProfileData(id, points) {
        if (profiles.value[id]) {
            profiles.value[id].data = points;
        }
    }

    function assignProfileToNode(nodeId, profileId) {
        assignments.value[nodeId] = profileId;
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
        assignments,
        rainData,
        kostraGrid,
        rainLocation,
        rainConfig,
        createProfile,
        updateProfileData,
        assignProfileToNode,
        setKostraGrid,
        setRainData
    };
});
