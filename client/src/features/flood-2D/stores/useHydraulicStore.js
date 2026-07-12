import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useHydraulicStore = defineStore('hydraulic', () => {
    // State
    /**
     * @type {import('vue').Ref<Object.<string, {id: string, name: string, type: 'Zufluss'|'Wasserstand'|string, data: Array<{t: number, v: number}>}>>}
     */
    const ganglinien = ref({});

    /**
     * Boundary-Verhalten (Rolle) je GeoObjekt-ID. Die LAGE (Kanten-Segment vs.
     * Innenquelle) steckt in der Geometrie: feature.properties.edge ∈ 'N'|'S'|'E'|'W'|null,
     * gesetzt beim Zeichnen (Auto-Snap) bzw. bei der Migration alter Projekte.
     * @type {import('vue').Ref<Object.<string, {
     *   type: 'INFLOW_CONSTANT'|'INFLOW_DYNAMIC'|'OUTFLOW_FREE'|'WATERLEVEL_FIX'|'SINK'|string,
     *   value: number|null,
     *   profileId: string|null,
     *   useNativeFree?: boolean,
     *   outflowSlope?: number|null,
     *   flowAngleDeg?: number|null,
     *   flowDir?: 'N'|'S'|'E'|'W'|null
     * }>>}
     *
     *  - `type`         : die Rolle (Zufluss konstant/dynamisch, Wasserstand, freier Auslauf).
     *  - `useNativeFree`: OUTFLOW_FREE als nativer Modell-Rand (true) vs. HFIX-Wehr (false).
     *  - `outflowSlope` : Reibungs-/Sohlgefälle Sf (m/m) für OUTFLOW_FREE; null ⇒ kritische
     *                     Tiefe (bare FREE). Setzt LISFLOOD BC_Val (boundary.cpp:98).
     *  - `flowAngleDeg` : optionale Fließrichtung für INFLOW als Welt-Azimut in Grad
     *                     (0=Ost, 90=Nord, gegen Uhrzeigersinn). Emittiert den Winkel-Token
     *                     in der .bci (gepatchter Solver rechnet Innenzelle mit Impuls).
     *                     null/fehlend ⇒ richtungslos.
     *  - `flowDir`      : LEGACY (N/S/E/W). Wird beim Emittieren zu flowAngleDeg gemappt
     *                     (N=90,E=0,S=270,W=180), falls flowAngleDeg fehlt.
     */
    const assignments = ref({}); // { geoObjectId: { type, value, profileId, ... } }

    /** @type {import('vue').Ref<Array<any>>} */
    const rainData = ref([]);

    /** @type {import('vue').Ref<Array<{time_sec: number, value_mm: number}>|null>} */
    const rainSeries = ref(null);

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
     * @param {Array<string>|string} target  geoObject-ID(s)
     * @param {{type: string, value?: number|null, profileId?: string|null, useNativeFree?: boolean, outflowSlope?: number|null}} config
     */
    function assignBoundaryCondition(target, config) {
        // NEW: Multi-select support (Polymorphic: Array or Single ID)
        const objectIds = Array.isArray(target) ? target : [target];

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

    /** Zuweisung eines gelöschten Geo-Objekts entfernen (verwaiste Einträge vermeiden). */
    function removeAssignment(id) {
        if (assignments.value[id]) delete assignments.value[id];
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

    function setRainSeries(data) {
        rainSeries.value = data;
        console.log("[useHydraulicStore] 🌧️ KOSTRA Euler-Regenreihe empfangen (rainSeries hinzugefügt):", data);
    }

    /** @type {import('vue').Ref<number>} */
    const globalRoughness = ref(0.035);

    function setRoughness(val) {
        globalRoughness.value = val;
    }

    // ── Globale Randbedingung ──
    // Default CLOSED: Ränder sind standardmäßig geschlossen; Zu- UND Abläufe werden
    // NUR dort wirksam, wo der Nutzer sie explizit setzt. Verhindert, dass ein
    // automatischer Rand-Auslauf gerichtete Zuläufe absaugt/überschreibt.
    /** @type {import('vue').Ref<'CLOSED'|'FREE'|'HFIX'>} */
    const globalBoundaryType = ref('CLOSED');
    /** @type {import('vue').Ref<number>} Wasserspiegel [m NHN] bei HFIX */
    const globalBoundaryHfix = ref(0.0);

    // ── Bodenvorfeuchte (skaliert Infiltrationsrate) ──────────────────────
    /** @type {import('vue').Ref<number>} 0 = trocken (volle Infiltration), 100 = gesättigt */
    const antecedentMoisture = ref(0);

    return {
        ganglinien,
        activeGanglinieId,
        assignments,
        rainData,
        kostraGrid,
        rainLocation,
        rainConfig,
        globalRoughness,
        setRoughness,
        createGanglinie,
        deleteGanglinie,
        updateGanglinieData,
        setActiveGanglinie,
        assignToObjects,
        assignBoundaryCondition,
        getAssignment,
        removeAssignment,
        getAssignmentsByGanglinie,
        setKostraGrid,
        setRainData,
        rainSeries,
        setRainSeries,
        globalBoundaryType,
        globalBoundaryHfix,
        antecedentMoisture,
    };
});
