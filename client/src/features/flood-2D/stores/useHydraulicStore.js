import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useHydraulicStore = defineStore('hydraulic', () => {
    // State
    /**
     * @type {import('vue').Ref<Object.<string, {id: string, name: string, type: 'Zufluss'|'Wasserstand'|string, data: Array<{t: number, v: number}>}>>}
     */
    const ganglinien = ref({});

    /** @type {import('vue').Ref<Object.<string, {type: 'INFLOW_DYNAMIC'|'OUTFLOW_FREE'|'WATERLEVEL_FIX'|'SINK'|string, value: number|null, profileId: string|null}>>} */
    const assignments = ref({}); // { geoObjectId: { type, value, profileId } }

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
        // Remove assignments referring to this profile
        for (const geoId in assignments.value) {
            const assignment = assignments.value[geoId];
            if (assignment && assignment.profileId === id) {
                // We keep the assignment object but remove the dead reference? 
                // Or delete the whole assignment if it's purely profile-based?
                // For safety, let's just clear the profileId, effectively breaking the link.
                // Or better: If type is INFLOW_DYNAMIC, the assignment becomes invalid.
                // We delete the entry to force the user to re-configure.
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
     * Updated: Assign complex boundary condition
     * @param {Array<string>} objectIds 
     * @param {{type: string, value: number|null, profileId: string|null}} config 
     */
    function assignBoundaryCondition(objectIds, config) {
        objectIds.forEach(id => {
            // Clone config to avoid reference sharing issues
            assignments.value[id] = { ...config };
        });
    }

    // Compat wrapper for old calls (if any exist during migration)
    // Deprecated: Remove after UI update
    function assignToObjects(geoIdsArray, ganglinieId) {
        assignBoundaryCondition(geoIdsArray, {
            type: 'INFLOW_DYNAMIC',
            value: null,
            profileId: ganglinieId
        });
    }

    function getAssignment(id) {
        return assignments.value[id] || null;
    }

    function getAssignmentsByGanglinie(id) {
        let count = 0;
        for (const key in assignments.value) {
            const a = assignments.value[key];
            if (a && a.profileId === id) count++;
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
        assignBoundaryCondition, // EXPORTED
        getAssignment,           // EXPORTED
        getAssignmentsByGanglinie,
        setKostraGrid,
        setRainData
    };
});
