import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { cropGrid, maskGridByPolygon } from '../utils/GridCropper.js';

import { notifyPreMutate, registerTerrainAccessors, saveTerrainSnapshot } from '../composables/historyBridge.js';

// Synchroner Aufruf über Bridge — kein async, kein Null-Race beim ersten Aufruf.
function saveSnapshot(label) {
    notifyPreMutate(label);
}

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

    // Register terrain accessors with the bridge so Shovel/Crop undo works.
    // getFn returns the raw terrain object; setFn writes it back and bumps terrainVersion.
    registerTerrainAccessors(
        () => terrain.value,
        (snap) => {
            // Restore header fields onto terrain.value (works for both FULL and PATCH)
            if (snap.gridData) {
                terrain.value.gridData  = snap.gridData;
                terrain.value.ncols     = snap.ncols;
                terrain.value.nrows     = snap.nrows;
                terrain.value.cellsize  = snap.cellsize;
                terrain.value.xllcorner = snap.xllcorner;
                terrain.value.yllcorner = snap.yllcorner;
                terrain.value.xll       = snap.xll;
                terrain.value.yll       = snap.yll;
                terrain.value.minZ      = snap.minZ;
                terrain.value.maxZ      = snap.maxZ;
                if (snap.bounds)  terrain.value.bounds  = snap.bounds;
                if (snap.center)  terrain.value.center  = snap.center;
                if (snap.stats)   terrain.value.stats   = snap.stats;
                if (snap.header)  terrain.value.header  = snap.header;
            }
            // Always bump terrainVersion to trigger Three.js mesh rebuild
            terrainVersion.value++;
        }
    );

    function addNode(node) {
        saveSnapshot('Node hinzugefügt');
        nodes.value.push(node);
    }

    function removeNode(id) {
        saveSnapshot('Node gelöscht');
        nodes.value = nodes.value.filter(n => n.id !== id);
    }

    // ── Culvert-Links (1D/2D BMI-Kopplung) ─────────────────────────────────
    /**
     * Verknüpfte Durchlass-Paare für den BMI-WebWorker.
     * @type {import('vue').Ref<Array<{
     *   id: string, sourceId: string, targetId: string,
     *   z_in: number, z_out: number, diameter: number,
     *   length: number, manning_n: number, Cd: number
     * }>>}
     */
    const culvertLinks = ref([]);

    /**
     * Verbindet zwei Knoten als Durchlass (Einlauf → Auslauf).
     * @param {string} sourceId
     * @param {string} targetId
     * @param {object} params - { z_in, z_out, diameter, length, manning_n, Cd }
     */
    function addCulvertLink(sourceId, targetId, params = {}) {
        if (!sourceId || !targetId) return;
        if (sourceId === targetId) {
            console.warn('[GeoStore] addCulvertLink: sourceId === targetId — Ringbezug verhindert.');
            return;
        }
        const exists = culvertLinks.value.some(
            l => l.sourceId === sourceId && l.targetId === targetId
        );
        if (exists) {
            console.warn(`[GeoStore] addCulvertLink: Paar [${sourceId}→${targetId}] bereits vorhanden.`);
            return;
        }
        saveSnapshot('Culvert-Link hinzugefügt');
        culvertLinks.value.push({
            id:        `link_${sourceId}_${targetId}`,
            sourceId,
            targetId,
            z_in:      params.z_in      ?? 0.0,
            z_out:     params.z_out     ?? 0.0,
            diameter:  params.diameter  ?? 1.0,
            length:    params.length    ?? 10.0,
            manning_n: params.manning_n ?? 0.013,
            Cd:        params.Cd        ?? 0.6,
        });
    }

    /**
     * Entfernt einen Culvert-Link anhand seiner ID.
     * @param {string} linkId
     */
    function removeCulvertLink(linkId) {
        saveSnapshot('Culvert-Link gelöscht');
        culvertLinks.value = culvertLinks.value.filter(l => l.id !== linkId);
    }

    // ── Brücken (als Wehr-Erweiterung: Soffitte + Deck-Linie) ──────────────
    /**
     * @type {import('vue').Ref<Array<{
     *   id: string, lineId: string,
     *   axis: Array<{x:number,y:number}>,
     *   z_sohle: number, soffit: number, deck: number,
     *   width: number, Cd: number,
     *   cells: Array<{col:number,row:number,x:number,y:number,z:number,direction:string}>
     * }>>}
     */
    const bridges = ref([]);

    /**
     * Fügt eine gesamte Brücken-Achse (Batch) mit einem History-Snapshot hinzu.
     * @param {Array<object>} bridgeCells  — wie weirSegments, plus { soffit, deck, width, Cd, z_sohle, lineId }
     */
    function addBridgeBatch(bridgeCells) {
        if (!bridgeCells || bridgeCells.length === 0) return;
        saveSnapshot(`Brücke hinzugefügt (${bridgeCells.length} Zellen)`);
        const lineId = bridgeCells[0].lineId || `bridge_${Date.now()}`;
        bridges.value.push({
            id:      lineId,
            lineId,
            axis:    bridgeCells.map(c => ({ x: c.x, y: c.y })),
            z_sohle: bridgeCells[0].z_sohle ?? 0.0,
            soffit:  bridgeCells[0].soffit  ?? 2.0,
            deck:    bridgeCells[0].deck    ?? 3.0,
            width:   bridgeCells[0].width   ?? 5.0,
            Cd:      bridgeCells[0].Cd      ?? 0.80,
            Tz:      bridgeCells[0].Tz      ?? 1.5,
            cells:   bridgeCells,
        });
        console.log(`[GeoStore] Brücke hinzugefügt: ${lineId} (${bridgeCells.length} Zellen)`);
    }

    /**
     * Entfernt eine Brücke anhand ihrer ID.
     * @param {string} bridgeId
     */
    function removeBridge(bridgeId) {
        saveSnapshot('Brücke gelöscht');
        bridges.value = bridges.value.filter(b => b.id !== bridgeId);
    }

    // ── Wehre (LISFLOOD weir_flow.cpp, Poleni-Formel) ──────────────────────
    /**
     * Wehr-Objekte für die LISFLOOD `weirfile`-Eingabe.
     * @type {import('vue').Ref<Array<{
     *   id: string, x: number, y: number,
     *   direction: string, Cd: number, hc: number, m: number, w: number,
     *   label: string
     * }>>}
     */
    const weirs = ref([]);

    /**
     * Fügt ein neues Wehr hinzu.
     * @param {object} weir - { x, y, direction, Cd, hc, m, w, label }
     */
    function addWeir(weir) {
        saveSnapshot('Wehr hinzugefügt');
        const id = weir.id || `weir_${Date.now()}`;
        weirs.value.push({
            id,
            x:         weir.x,
            y:         weir.y,
            direction: weir.direction || 'N',
            Cd:        parseFloat(weir.Cd)  || 1.704,
            hc:        parseFloat(weir.hc)  || 0.0,
            m:         parseFloat(weir.m)   || 0.667,
            w:         parseFloat(weir.w)   || 5.0,
            label:     weir.label           || `Wehr ${weirs.value.length + 1}`
        });
        console.log(`[GeoStore] Wehr hinzugefügt: ${id} @ (${weir.x.toFixed(1)}, ${weir.y.toFixed(1)})`);
    }

    /**
     * Entfernt ein Wehr anhand seiner ID.
     * @param {string} weirId
     */
    function removeWeir(weirId) {
        saveSnapshot('Wehr gelöscht');
        weirs.value = weirs.value.filter(w => w.id !== weirId);
    }

    /**
     * Fügt eine ganze Linie von Wehren (Batch) mit EINEM einzigen History-Snapshot hinzu.
     * Verwende diese Methode im WeirTool statt einer forEach-Schleife von addWeir(),
     * damit Ctrl+Z die gesamte Linie auf einmal rückgängig macht.
     *
     * @param {Array<object>} weirSegments - Array von Wehr-Objekten { id, x, y, direction, Cd, hc, m, w, label, lineId }
     */
    function addWeirBatch(weirSegments) {
        if (!weirSegments || weirSegments.length === 0) return;
        saveSnapshot(`Wehr-Linie hinzugefügt (${weirSegments.length} Segmente)`);
        weirSegments.forEach(weir => {
            weirs.value.push({
                id:        weir.id        || `weir_${Date.now()}_${Math.random()}`,
                lineId:    weir.lineId   || null,
                x:         weir.x,
                y:         weir.y,
                direction: weir.direction || 'S',
                Cd:        parseFloat(weir.Cd)  || 1.704,
                hc:        parseFloat(weir.hc)  || 0.0,
                m:         parseFloat(weir.m)   || 0.667,
                w:         parseFloat(weir.w)   || 1.0,
                label:     weir.label    || `Wehr-Linie Seg.${weirs.value.length + 1}`,
            });
        });
        console.log(`[GeoStore] Wehr-Batch: ${weirSegments.length} Segmente hinzugefügt.`);
    }

    function addBoundary(feature) {
        saveSnapshot('Grenze hinzugefügt');
        boundaries.value.features.push(feature);
    }

    function addModification(type, geometry, properties = {}) {
        saveSnapshot(`${type} hinzugefügt`);
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

        // Vollständigen Terrain-Snapshot VOR dem Crop sichern
        saveTerrainSnapshot();

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

        // Vollständigen Terrain-Snapshot VOR dem Masken sichern
        saveTerrainSnapshot();

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
        removeCulvertLink,
        // Wehre (LISFLOOD weirfile)
        weirs,
        addWeir,
        addWeirBatch,
        removeWeir,
        // Brücken (Wehr-Erweiterung mit Soffitte/Deck)
        bridges,
        addBridgeBatch,
        removeBridge,
        notifyTerrainModified: () => { terrainVersion.value++; },
    };
});
