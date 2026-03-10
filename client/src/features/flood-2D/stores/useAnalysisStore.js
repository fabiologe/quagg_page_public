/**
 * src/features/flood-2D/stores/useAnalysisStore.js
 * 
 * Manages state for analysis tools (like the Polygon Volume tool)
 * Built to decouple heavy analysis logic from the core simulation store.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getPolygonIndices, calculateVolumeWithConfidence } from '../utils/VolumeCalculator';

export const useAnalysisStore = defineStore('flood2D-analysis', () => {

    // --- STATE ---

    // Array of objects representing multiple drawn polygons
    // Each entry: { id: string, coords: [{x,y,z}], indices: {activeIndices, boundaryIndices}, color: string }
    const polygons = ref([]);

    // Grid properties used for the calculation
    const currentGridHeader = ref(null);

    // Explicitly injected active depth data from the viewer
    const activeDepthData = ref(null);

    // --- ACTIONS ---

    /**
     * Add a new polygon and perform the ONE-TIME geometric calculation for it.
     * @param {Array<{x, y, z}>} coords - World coordinates of the drawn polygon
     * @param {Object} gridHeader - The terrain grid header 
     * @param {string} id - Unique identifier for the polygon
     * @param {string} color - Hex color for the polygon (for UI mapping)
     */
    function addPolygon(coords, gridHeader, id, color) {
        if (!coords || coords.length < 3 || !gridHeader) return;

        currentGridHeader.value = gridHeader;

        console.time(`[AnalysisStore] Building Indices for ${id}`);
        const indices = getPolygonIndices(coords, gridHeader);
        console.timeEnd(`[AnalysisStore] Building Indices for ${id}`);

        polygons.value.push({
            id,
            coords,
            indices,
            color
        });
    }

    /**
     * Remove a specific polygon
     */
    function removePolygon(id) {
        polygons.value = polygons.value.filter(p => p.id !== id);
    }

    /**
     * Clear all analysis state
     */
    function clearAnalysis() {
        polygons.value = [];
        currentGridHeader.value = null;
        activeDepthData.value = null;
    }

    function setActiveDepthData(depthArray) {
        activeDepthData.value = depthArray;
    }

    // --- GETTERS ---

    /**
     * Computed property that calculates the volume LIVE for ALL polygons.
     */
    const polygonVolumes = computed(() => {
        if (!currentGridHeader.value || !activeDepthData.value || polygons.value.length === 0) {
            return [];
        }

        return polygons.value.map(poly => {
            const stats = calculateVolumeWithConfidence(
                poly.indices.activeIndices,
                poly.indices.boundaryIndices,
                activeDepthData.value,
                currentGridHeader.value.cellsize,
                0.05 // 5cm default tolerance 
            );

            return {
                id: poly.id,
                color: poly.color,
                volume: stats.volume,
                error: stats.error,
                formattedVolume: stats.formattedVolume,
                formattedError: stats.formattedError
            };
        });
    });


    return {
        // State
        polygons,
        currentGridHeader,
        activeDepthData,

        // Actions
        addPolygon,
        removePolygon,
        clearAnalysis,
        setActiveDepthData,

        // Getters
        polygonVolumes
    };
});
