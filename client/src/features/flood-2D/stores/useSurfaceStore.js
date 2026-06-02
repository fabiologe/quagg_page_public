import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

/**
 * useSurfaceStore.js
 * Manages surface material data for the Texture Pipeline.
 * The surfaceGrid stores integer material IDs per cell, matching terrain grid dimensions.
 * Used to generate a per-cell Manning roughness file (terrain.n) for LISFLOOD.
 */
export const useSurfaceStore = defineStore('surface', () => {

    // --- MATERIAL LIBRARY ---
    // infiltration: Horton end-infiltration rate [m/s]; 0 = impervious
    const materials = ref([
        { id: 1, name: 'Asphalt', manning: 0.015, color: '#95a5a6', infiltration: 1e-7   },  // 0.36 mm/h
        { id: 2, name: 'Wald',    manning: 0.100, color: '#228B22', infiltration: 3e-6   },  // 10.8 mm/h
        { id: 3, name: 'Wiese',   manning: 0.035, color: '#7CFC00', infiltration: 1e-6   },  // 3.6  mm/h
        { id: 4, name: 'Wasser',  manning: 0.025, color: '#4169E1', infiltration: 0      },  // no infiltration
        { id: 5, name: 'Kies',    manning: 0.025, color: '#D2B48C', infiltration: 5e-6   },  // 18   mm/h
    ]);

    /** @type {import('vue').Ref<number>} */
    const activeMaterialId = ref(1);

    /** @type {import('vue').Ref<number>} Brush radius in grid cells */
    const brushRadius = ref(3);

    // --- SURFACE GRID ---
    /** @type {import('vue').Ref<Int8Array|null>} Flat grid: surfaceGrid[row * ncols + col] = materialId */
    const surfaceGrid = ref(null);

    /** @type {import('vue').Ref<number>} */
    const gridNCols = ref(0);

    /** @type {import('vue').Ref<number>} */
    const gridNRows = ref(0);

    /** @type {import('vue').Ref<number>} Version counter for bulk updates */
    const gridVersion = ref(0);

    // --- COVERAGE STATS ---
    /** @type {import('vue').Ref<Record<number, { count: number, percent: number }>>} */
    const coverageStats = ref({});

    // --- COMPUTED ---
    const isInitialized = computed(() => surfaceGrid.value !== null);

    const activeMaterial = computed(() => {
        return materials.value.find(m => m.id === activeMaterialId.value) || materials.value[0];
    });

    // --- ACTIONS ---

    /**
     * Initialize the surface grid to match terrain dimensions.
     * Fills all cells with the given default material ID.
     * @param {number} nrows
     * @param {number} ncols
     * @param {number} [defaultId=1] - Default material ID to fill
     */
    function initGrid(nrows, ncols, defaultId = 1) {
        const size = nrows * ncols;
        const grid = new Int8Array(size);
        grid.fill(defaultId);
        surfaceGrid.value = grid;
        gridNCols.value = ncols;
        gridNRows.value = nrows;
        console.log(`[SurfaceStore] Grid initialized: ${ncols}x${nrows} (${size} cells), default material=${defaultId}`);
        calculateCoverage();
    }

    /**
     * Calculates the percentage of each material on the grid.
     * Should be called after painting operations (e.g., onMouseUp).
     */
    function calculateCoverage() {
        if (!surfaceGrid.value) return;
        const size = surfaceGrid.value.length;
        if (size === 0) return;

        const counts = {};
        for (let i = 0; i < size; i++) {
            // Disregard NODATA if necessary, but surfaceGrid is fully covered by materials.
            const matId = surfaceGrid.value[i];
            counts[matId] = (counts[matId] || 0) + 1;
        }

        const stats = {};
        for (const matId in counts) {
            stats[matId] = {
                count: counts[matId],
                percent: (counts[matId] / size) * 100
            };
        }
        coverageStats.value = stats;
        gridVersion.value++; // Trigger reactivity for bulk changes
    }

    /**
     * Add a new custom material.
     */
    function addMaterial(name, color, manning, infiltration = 0) {
        const newId = Math.max(...materials.value.map(m => m.id)) + 1;
        materials.value.push({ id: newId, name, color, manning, infiltration });
        return newId;
    }

    /**
     * Delete a material.
     * Replaces the deleted material in the grid with the default material (id=1).
     */
    function deleteMaterial(id) {
        // Prevent deleting the default material (id=1)
        if (id === 1) return;

        const idx = materials.value.findIndex(m => m.id === id);
        if (idx !== -1) {
            materials.value.splice(idx, 1);
            if (activeMaterialId.value === id) {
                activeMaterialId.value = 1;
            }

            // Replace in grid
            if (surfaceGrid.value) {
                let changed = false;
                for (let i = 0; i < surfaceGrid.value.length; i++) {
                    if (surfaceGrid.value[i] === id) {
                        surfaceGrid.value[i] = 1;
                        changed = true;
                    }
                }
                if (changed) calculateCoverage();
            }
        }
    }

    /**
     * Set the material for a single cell.
     * @param {number} col - Column index (0 = west)
     * @param {number} row - Row index (0 = north, top-down for grid storage)
     * @param {number} materialId
     */
    function setCellMaterial(col, row, materialId) {
        if (!surfaceGrid.value) return;
        if (col < 0 || col >= gridNCols.value || row < 0 || row >= gridNRows.value) return;
        const idx = row * gridNCols.value + col;
        surfaceGrid.value[idx] = materialId;
    }

    /**
     * Paint a circular brush area with the given material.
     * @param {number} centerCol
     * @param {number} centerRow
     * @param {number} radius - Radius in cells
     * @param {number} materialId
     * @returns {number} Number of cells painted
     */
    function paintBrush(centerCol, centerRow, radius, materialId) {
        if (!surfaceGrid.value) return 0;
        let count = 0;
        const r = Math.ceil(radius);
        for (let dr = -r; dr <= r; dr++) {
            for (let dc = -r; dc <= r; dc++) {
                // Circle check
                if (dc * dc + dr * dr > radius * radius) continue;
                const col = centerCol + dc;
                const row = centerRow + dr;
                if (col < 0 || col >= gridNCols.value || row < 0 || row >= gridNRows.value) continue;
                const idx = row * gridNCols.value + col;
                surfaceGrid.value[idx] = materialId;
                count++;
            }
        }
        return count;
    }

    /**
     * Lookup a material by ID.
     * @param {number} id
     * @returns {object|undefined}
     */
    function getMaterialById(id) {
        return materials.value.find(m => m.id === id);
    }

    /**
     * Generate a Manning roughness grid (Float32Array) from the surfaceGrid.
     * Maps each cell's material ID to its Manning value.
     * @param {object} header - Terrain header { ncols, nrows, cellsize, xll/xllcorner, yll/yllcorner }
     * @returns {{ header: object, data: Float32Array }|null}
     */
    function generateManningGrid(header) {
        if (!surfaceGrid.value) return null;

        const ncols = header.ncols;
        const nrows = header.nrows;
        const size = ncols * nrows;

        // Build fast lookup: materialId → manning value
        const manningLookup = {};
        for (const m of materials.value) {
            manningLookup[m.id] = m.manning;
        }
        const defaultManning = 0.035; // Fallback

        const data = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            const matId = surfaceGrid.value[i] || 1;
            data[i] = manningLookup[matId] !== undefined ? manningLookup[matId] : defaultManning;
        }

        // Build header matching terrain
        const outHeader = {
            ncols,
            nrows,
            cellsize: header.cellsize,
            xll: header.xll !== undefined ? header.xll : header.xllcorner,
            yll: header.yll !== undefined ? header.yll : header.yllcorner,
            NODATA_value: -9999
        };

        return { header: outHeader, data };
    }

    /**
     * Compute area-weighted average infiltration rate [m/s] from the surface grid.
     * Used as scalar `infiltration` value in LISFLOOD v5.9 .par file.
     * Returns 0 if no grid or all materials have 0 infiltration.
     */
    function computeWeightedInfiltration() {
        if (!surfaceGrid.value) return 0;
        const lookup = {};
        for (const m of materials.value) lookup[m.id] = m.infiltration ?? 0;
        const total = surfaceGrid.value.length;
        if (!total) return 0;
        let sum = 0;
        for (let i = 0; i < total; i++) {
            sum += lookup[surfaceGrid.value[i] || 1] ?? 0;
        }
        return sum / total;
    }

    /**
     * Generate per-cell infiltration grid [m/s] analogous to generateManningGrid().
     * @param {object} header - terrain header { ncols, nrows, cellsize, xll/xllcorner, yll/yllcorner }
     * @returns {{ header: object, data: Float32Array }|null}
     */
    function generateInfiltrationGrid(header) {
        if (!surfaceGrid.value) return null;
        const ncols = header.ncols;
        const nrows = header.nrows;
        const lookup = {};
        for (const m of materials.value) lookup[m.id] = m.infiltration ?? 0;
        const data = new Float32Array(ncols * nrows);
        for (let i = 0; i < data.length; i++) {
            data[i] = lookup[surfaceGrid.value[i] || 1] ?? 0;
        }
        return {
            header: {
                ncols, nrows,
                cellsize: header.cellsize,
                xll: header.xll !== undefined ? header.xll : header.xllcorner,
                yll: header.yll !== undefined ? header.yll : header.yllcorner,
                NODATA_value: -9999,
            },
            data,
        };
    }

    /**
     * Reset the store (e.g. when loading a new project).
     */
    function reset() {
        surfaceGrid.value = null;
        gridNCols.value = 0;
        gridNRows.value = 0;
        activeMaterialId.value = 1;
        coverageStats.value = {};
    }

    return {
        // State
        materials,
        activeMaterialId,
        brushRadius,
        surfaceGrid,
        gridVersion,
        gridNCols,
        gridNRows,
        coverageStats,

        // Computed
        isInitialized,
        activeMaterial,

        // Actions
        initGrid,
        calculateCoverage,
        addMaterial,
        deleteMaterial,
        setCellMaterial,
        paintBrush,
        getMaterialById,
        generateManningGrid,
        computeWeightedInfiltration,
        generateInfiltrationGrid,
        reset,
    };
});
