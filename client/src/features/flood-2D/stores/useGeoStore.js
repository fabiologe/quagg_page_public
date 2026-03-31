import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { cropGrid, maskGridByPolygon } from '../utils/GridCropper.js';

export const useGeoStore = defineStore('geo', () => {
    // State
    /** @type {import('vue').Ref<any>} */
    const terrain = ref(null); // Mesh/Elevation Data

    /**
     * Incremented every time the terrain geometry is invalidated (crop, replace).
     * Three.js components watch this to know when to dispose and rebuild the mesh.
     * @type {import('vue').Ref<number>}
     */
    const terrainVersion = ref(0);

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

    // ── Culvert-Links (1D/2D BMI-Kopplung) ─────────────────────────────────
    /**
     * Verknüpfte Durchlass-Paare für den BMI-WebWorker.
     * { id: 'link_S004_S005', sourceId, targetId, maxQ }
     * @type {import('vue').Ref<Array<{id:string, sourceId:string, targetId:string, maxQ:number}>>}
     */
    const culvertLinks = ref([]);

    /**
     * Verbindet zwei Knoten als Durchlass (Einlauf → Auslauf).
     * @param {string} sourceId  - ID des Einlauf-Knotens
     * @param {string} targetId  - ID des Auslauf-Knotens
     * @param {number} maxQ      - Maximale Durchflussrate [m³/s]
     */
    function addCulvertLink(sourceId, targetId, maxQ = 1.0) {
        if (!sourceId || !targetId) return;
        // Ring-Bezug verhindern
        if (sourceId === targetId) {
            console.warn('[GeoStore] addCulvertLink: sourceId === targetId — Ringbezug verhindert.');
            return;
        }
        // Duplikat-Check
        const exists = culvertLinks.value.some(
            l => l.sourceId === sourceId && l.targetId === targetId
        );
        if (exists) {
            console.warn(`[GeoStore] addCulvertLink: Paar [${sourceId}→${targetId}] bereits vorhanden.`);
            return;
        }
        culvertLinks.value.push({
            id: `link_${sourceId}_${targetId}`,
            sourceId,
            targetId,
            maxQ: parseFloat(maxQ) || 1.0
        });
    }

    /**
     * Entfernt einen Culvert-Link anhand seiner ID.
     * @param {string} linkId
     */
    function removeCulvertLink(linkId) {
        culvertLinks.value = culvertLinks.value.filter(l => l.id !== linkId);
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

    /**
     * Hard-crops the terrain DEM to the given axis-aligned bounding box.
     * Replaces gridData and header in-place so the old (large) Float32Array
     * can be garbage-collected, freeing RAM.
     *
     * After this call `terrainVersion` is incremented – any Three.js component
     * that watches this value must dispose its current PlaneGeometry and
     * rebuild the mesh from the new (smaller) grid.
     *
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} boundingBox
     *   Crop rectangle in world coordinates (same CRS as the DEM header).
     */
    function cropTerrain(boundingBox) {
        if (!terrain.value || !terrain.value.gridData) {
            console.warn('[GeoStore] cropTerrain: no terrain loaded – skipping.');
            return;
        }

        // BUGFIX: parseXYZ() stores fields flat on the terrain object (no .header sub-object).
        // Fall back to using terrain.value itself as the header so both storage layouts work.
        const oldHeader = terrain.value.header ?? terrain.value;

        try {
            const { newGridData, newHeader } = cropGrid(
                terrain.value.gridData,
                oldHeader,
                boundingBox
            );

            // Overwrite the large array with the new, smaller one.
            // The old Float32Array now has no references and becomes GC-eligible.
            terrain.value.gridData = newGridData;

            // Write back to both the .header sub-object AND the flat root aliases
            // so any consumer (editor composables, InputGenerator, etc.) finds the data.
            terrain.value.header = newHeader;
            terrain.value.ncols = newHeader.ncols;
            terrain.value.nrows = newHeader.nrows;
            terrain.value.xllcorner = newHeader.xllcorner;
            terrain.value.yllcorner = newHeader.yllcorner;
            terrain.value.xll = newHeader.xll;
            terrain.value.yll = newHeader.yll;
            terrain.value.cellsize = newHeader.cellsize;

            // Recompute derived display fields so Phase 4 (buildTerrainMesh) works.
            const newWidth = (newHeader.ncols - 1) * newHeader.cellsize;
            const newHeight = (newHeader.nrows - 1) * newHeader.cellsize;
            terrain.value.bounds = { width: newWidth || 100, height: newHeight || 100 };
            terrain.value.center = {
                x: newHeader.xllcorner + newWidth / 2,
                y: newHeader.yllcorner + newHeight / 2,
            };

            // Recompute minZ / maxZ from the cropped data
            let minZ = Infinity, maxZ = -Infinity;
            for (let i = 0; i < newGridData.length; i++) {
                const v = newGridData[i];
                if (v > -9000) {
                    if (v < minZ) minZ = v;
                    if (v > maxZ) maxZ = v;
                }
            }
            terrain.value.minZ = minZ === Infinity ? 0 : minZ;
            terrain.value.maxZ = maxZ === -Infinity ? 1 : maxZ;
            terrain.value.stats = {
                cols: newHeader.ncols,
                rows: newHeader.nrows,
                cellsize: newHeader.cellsize,
                minZ: terrain.value.minZ,
                maxZ: terrain.value.maxZ,
            };

            // Signal all Three.js viewers to dispose the old mesh and rebuild.
            terrainVersion.value++;

            console.log(
                `[GeoStore] cropTerrain complete. ` +
                `New size: ${newHeader.ncols}×${newHeader.nrows}, ` +
                `terrainVersion: ${terrainVersion.value}`
            );
        } catch (err) {
            console.error('[GeoStore] cropTerrain failed:', err.message);
        }
    }

    /**
     * Masks the terrain DEM by an irregular polygon.
     * Cells whose centre lies OUTSIDE the polygon are set to NODATA (-9999).
     * Grid dimensions remain unchanged; terrainVersion is incremented.
     *
     * @param {Array<{x: number, y: number}>} polygon - World-coord vertices
     */
    function maskTerrainByPolygon(polygon) {
        if (!terrain.value || !terrain.value.gridData) {
            console.warn('[GeoStore] maskTerrainByPolygon: no terrain loaded.');
            return;
        }

        const header = terrain.value.header ?? terrain.value;

        try {
            const maskedData = maskGridByPolygon(
                terrain.value.gridData,
                header,
                polygon
            );

            terrain.value.gridData = maskedData;

            // Recompute minZ / maxZ (some cells became NODATA)
            let minZ = Infinity, maxZ = -Infinity;
            for (let i = 0; i < maskedData.length; i++) {
                const v = maskedData[i];
                if (v > -9000) {
                    if (v < minZ) minZ = v;
                    if (v > maxZ) maxZ = v;
                }
            }
            terrain.value.minZ = minZ === Infinity ? 0 : minZ;
            terrain.value.maxZ = maxZ === -Infinity ? 1 : maxZ;
            if (terrain.value.stats) {
                terrain.value.stats.minZ = terrain.value.minZ;
                terrain.value.stats.maxZ = terrain.value.maxZ;
            }

            terrainVersion.value++;
            console.log(`[GeoStore] maskTerrainByPolygon complete. terrainVersion: ${terrainVersion.value}`);
        } catch (err) {
            console.error('[GeoStore] maskTerrainByPolygon failed:', err.message);
        }
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
        terrainVersion,
        nodes,
        buildings,
        excavations,
        boundaries,
        modifications,
        mapCenter,
        importTerrain,
        addNode,
        removeNode,
        addBuilding,
        addBoundary,
        addModification,
        clearModifications,
        cropTerrain,
        maskTerrainByPolygon,
        getFeatureById,
        updateFeatureProperty,
        // 1D/2D Rohrkopplung
        culvertLinks,
        addCulvertLink,
        removeCulvertLink
    };
});
