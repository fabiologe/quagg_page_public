/**
 * useRasterProcessingStore.js
 *
 * Central registry for all DEM modification zones.
 * Each zone represents one source of corrections (bathymetry, bridge, culvert, …).
 *
 * Design rules:
 *  - Zones never write to gridData themselves.
 *  - fuseZone(id) / fuseAll() do the actual write, in priority order.
 *  - Higher priority overwrites lower priority where zones overlap.
 *  - Every structural change bumps zonesVersion so renderers/watchers react.
 *
 * Zone shape:
 *  {
 *    id:        string          unique key
 *    type:      ZoneType        'BATHYMETRY' | 'BRIDGE' | 'WEIR'
 *    label:     string          display name
 *    priority:  number          merge order — higher wins on overlap
 *    indices:   Uint32Array|null  grid cell indices (null = not yet computed)
 *    zValues:   Float32Array|null  corresponding Z values
 *    status:    ZoneStatus      'pending' | 'computed' | 'fused'
 *    visible:   boolean         show preview layer in 3D viewer
 *    meta:      object          type-specific payload (bridgeId, clearance, …)
 *  }
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useGeoStore } from './useGeoStore.js';

// ── Type constants (importable by all consumers) ───────────────────────────

export const ZoneType = Object.freeze({
    BATHYMETRY: 'BATHYMETRY',
    BRIDGE:     'BRIDGE',
    WEIR:       'WEIR',
});

/** Default priority per zone type. Higher = applied last (wins on overlap). */
export const ZonePriority = Object.freeze({
    BATHYMETRY:  10,
    BRIDGE:     100,
    WEIR:        60,
});

/** Color ramp endpoints [r,g,b] ∈ [0,1] for 3D preview per type. */
export const ZoneColors = Object.freeze({
    BATHYMETRY: { lo: [0x1a/255, 0x2f/255, 0xe0/255], hi: [0x00, 1.00, 0x99/255] },
    BRIDGE:     { lo: [1.00, 0.40, 0.00],              hi: [1.00, 0.85, 0.00]     },
    WEIR:       { lo: [0.60, 0.20, 1.00],              hi: [0.85, 0.60, 1.00]     },
});

// ── Store ──────────────────────────────────────────────────────────────────

export const useRasterProcessingStore = defineStore('rasterProcessing', () => {

    /** @type {import('vue').Ref<Array<object>>} */
    const zones = ref([]);

    /**
     * Bumped on every structural change. Renderers and watchers should watch
     * this instead of deep-watching the zones array (TypedArrays are opaque).
     */
    const zonesVersion = ref(0);

    function _bump() { zonesVersion.value++; }

    // ── Zone CRUD ──────────────────────────────────────────────────────────

    /**
     * Add or fully replace a zone by id.
     * Call with status:'pending' before starting the worker, then
     * setZoneResult() when the worker finishes.
     */
    function addZone({
        id, type, label,
        priority  = ZonePriority[type] ?? 10,
        indices   = null,
        zValues   = null,
        status    = 'pending',
        visible   = true,
        meta      = {},
    }) {
        const idx = zones.value.findIndex(z => z.id === id);
        const zone = { id, type, label, priority, indices, zValues, status, visible, meta };
        if (idx >= 0) zones.value[idx] = zone;
        else          zones.value.push(zone);
        _bump();
    }

    /** Partial update — only the supplied keys are written. */
    function updateZone(id, patch) {
        const z = zones.value.find(z => z.id === id);
        if (!z) return;
        Object.assign(z, patch);
        _bump();
    }

    function removeZone(id) {
        zones.value = zones.value.filter(z => z.id !== id);
        _bump();
    }

    /** Store the IDW/worker result and mark zone as computed (ready to fuse). */
    function setZoneResult(id, indices, zValues) {
        updateZone(id, { indices, zValues, status: 'computed' });
    }

    function setZoneVisible(id, visible) {
        updateZone(id, { visible });
    }

    // ── Fusion ─────────────────────────────────────────────────────────────

    /**
     * Write a single zone's values into the live DEM and mark it 'fused'.
     * Returns the number of cells written (0 if zone not ready).
     */
    function fuseZone(id) {
        const zone = zones.value.find(z => z.id === id);
        if (!zone?.indices?.length || zone.status !== 'computed') return 0;

        const geoStore = useGeoStore();
        const terrain  = geoStore.terrain;
        if (!terrain?.gridData) return 0;

        const { gridData } = terrain;
        for (let i = 0; i < zone.indices.length; i++) {
            gridData[zone.indices[i]] = zone.zValues[i];
        }
        updateZone(id, { status: 'fused' });
        geoStore.notifyTerrainModified();
        return zone.indices.length;
    }

    /**
     * Write ALL computed zones into the DEM, low-priority first so that
     * higher-priority zones (bridges) overwrite lower-priority ones (bathymetry)
     * wherever they overlap.
     * Returns total cells written.
     */
    function fuseAll() {
        const geoStore = useGeoStore();
        const terrain  = geoStore.terrain;
        if (!terrain?.gridData) return 0;

        const { gridData } = terrain;
        const toFuse = [...zones.value]
            .filter(z => z.status === 'computed' && z.indices?.length)
            .sort((a, b) => a.priority - b.priority); // ascending → last write wins

        let total = 0;
        for (const zone of toFuse) {
            for (let i = 0; i < zone.indices.length; i++) {
                gridData[zone.indices[i]] = zone.zValues[i];
            }
            updateZone(zone.id, { status: 'fused' });
            total += zone.indices.length;
        }

        if (total > 0) geoStore.notifyTerrainModified();
        return total;
    }

    // ── Reset ──────────────────────────────────────────────────────────────

    function reset() {
        zones.value = [];
        _bump();
    }

    // ── Computed helpers ───────────────────────────────────────────────────

    const visibleZones   = computed(() => zones.value.filter(z => z.visible && z.indices?.length));
    const computedZones  = computed(() => zones.value.filter(z => z.status === 'computed'));
    const fusedZones     = computed(() => zones.value.filter(z => z.status === 'fused'));
    const hasPendingFuse = computed(() => computedZones.value.length > 0);

    const totalCells = computed(() =>
        zones.value.reduce((s, z) => s + (z.indices?.length ?? 0), 0)
    );

    return {
        // State
        zones, zonesVersion,
        // Zone management
        addZone, updateZone, removeZone, setZoneResult, setZoneVisible,
        // Fusion
        fuseZone, fuseAll,
        // Reset
        reset,
        // Derived
        visibleZones, computedZones, fusedZones, hasPendingFuse, totalCells,
    };
});
