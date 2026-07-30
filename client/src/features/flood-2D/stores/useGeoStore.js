import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { cropGrid, maskGridByPolygon } from '../utils/GridCropper.js';
import { migrateBridgeShape } from '../utils/BridgeMeshLattice.js';

import { notifyPreMutate, registerTerrainAccessors, saveTerrainSnapshot } from '../composables/historyBridge.js';

// Synchroner Aufruf über Bridge — kein async, kein Null-Race beim ersten Aufruf.
// scope 'geo': die History darf die Klone der übrigen Stores wiederverwenden.
function saveSnapshot(label) {
    notifyPreMutate(label, 'geo');
}

// Signalisiert der UI, dass GENAU EIN Objekt fertig platziert wurde → Werkzeug-Auto-Reset
// (verhindert versehentliches Setzen mehrerer Objekte). MapEditor3D lauscht und deaktiviert
// das aktive Objekt-Werkzeug, wenn der platzierte Typ zum Werkzeug passt.
// Mehrstufige Tools (Wehr/Brücke) committen früh und feuern hier NICHT — sie setzen das
// Werkzeug erst über ihren expliziten „Fertig"-Button zurück.
function notifyObjectPlaced(type) {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('flood2d-object-placed', { detail: { type } }));
    }
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

    /**
     * Revisionszähler je Datengruppe. Renderer hängen sich daran statt an deep-Watcher
     * über die Arrays: Vues Deep-Traversal kostete bei 2000 Gebäuden ~228 ms PRO
     * Änderung, allein fürs Nachziehen der Abhängigkeiten (gemessen mit leerem Callback,
     * Performance-Audit 2026-07-27).
     *
     * Zweiter, ebenso wichtiger Grund: ein FLACHER Watcher auf ein Array übersieht
     * push()/in-place-Änderungen, weil die Array-Identität gleich bleibt — genau daran
     * verpasste die SGC-Zellvorschau neu gezeichnete Kanäle. Ein Zähler ist unabhängig
     * davon, ob eine Mutation das Array ersetzt oder verändert.
     *
     * REGEL: Jede Aktion, die eine dieser Sammlungen ändert, MUSS touch(<gruppe>) rufen.
     * Wer am Store vorbei zuweist (Undo-Restore), ruft touch() ohne Argument.
     * Abgesichert von test_geostore_revisions.mjs.
     */
    const revisions = ref({ mod: 0, boundary: 0, weir: 0, bridge: 0, sgc: 0 });
    function touch(kind) {
        const r = revisions.value;
        if (kind) r[kind] = (r[kind] ?? 0) + 1;
        else for (const k of Object.keys(r)) r[k]++;   // alles neu (z. B. Undo-Restore)
        revisions.value = { ...r };                    // eine Referenzänderung genügt Watchern
    }

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

    // Punkt-Quellen/-Senken (NodeTool) und Culvert-Links (CulvertLinkManager) wurden
    // 2026-07 entfernt — das Kanalnetz (useNetworkStore, SWMM-1D) ersetzt beide.

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
        touch('bridge');
    }

    /**
     * Entfernt eine Brücke anhand ihrer ID.
     * @param {string} bridgeId
     */
    function removeBridge(bridgeId) {
        saveSnapshot('Brücke gelöscht');
        bridges.value = bridges.value.filter(b => b.id !== bridgeId);
        touch('bridge');
    }

    // ── 3D-Brückenkörper (kind: 'mesh3d', Footprint + Lattice) ─────────────
    /**
     * Fügt einen 3D-Brückenkörper hinzu (nur Plain-JSON — Persistenz via GEO_FIELDS).
     * @param {object} bridge — { id, kind:'mesh3d', footprint, lattice, directionMode, Cd, Tz, z_sohle, soffit, deck, width, cells }
     */
    function addBridge3D(bridge) {
        if (!bridge || bridge.kind !== 'mesh3d') return;
        saveSnapshot('3D-Brückenkörper hinzugefügt');
        bridges.value.push(bridge);
        console.log(`[GeoStore] 3D-Brückenkörper hinzugefügt: ${bridge.id} (${bridge.cells?.length ?? 0} Zellen)`);
        touch('bridge');
    }

    /**
     * Aktualisiert einen 3D-Brückenkörper (ein Undo-Schritt pro Aufruf —
     * das Tool committet nur bei mouseup/Loop-Cut, nie per Frame).
     * @param {string} id
     * @param {object} patch — z.B. { lattice, cells, soffit, deck, z_sohle }
     * @param {string} [label]
     */
    function updateBridge3D(id, patch, label = 'Brückenkörper bearbeitet') {
        const b = bridges.value.find(b => b.id === id);
        if (!b) return;
        saveSnapshot(label);
        Object.assign(b, patch);
        touch('bridge');
    }

    /**
     * Hebt geladene Alt-Brücken auf das Polygon-mesh3d-Modell (idempotent):
     * LINE-Brücken → Streifen-Polygon, mesh3d ohne poly → Rechteck-Polygon.
     * Beim Laden aufrufen (useProjectFile), damit Body/Solver/Viewer einheitlich rendern.
     */
    function migrateBridges() {
        let changed = 0;
        bridges.value = bridges.value.map(b => {
            const m = migrateBridgeShape(b);
            if (m !== b) changed++;
            return m;
        });
        if (changed) console.log(`[GeoStore] ${changed} Alt-Brücke(n) auf Polygon-mesh3d migriert.`);
        return changed;
        touch('bridge');
    }

    // ── Wehre (LISFLOOD weir_flow.cpp, Poleni-Formel) ──────────────────────
    /**
     * Wehr-Zellen für die LISFLOOD `weirfile`-Eingabe — abgeleitet aus den Wehr-Polylinien
     * (siehe unten, `_syncWeirCells`). Einzige Quelle für neue Wehre ist der Polylinien-Editor
     * (useWeir3DTool.js); dieses Array bleibt aber das gemeinsame Export-/Render-Format, auch
     * für in alten Projekten gespeicherte, klassische (nicht-Polylinien) Wehrzellen.
     * @type {import('vue').Ref<Array<{
     *   id: string, x: number, y: number,
     *   direction: string, Cd: number, hc: number, m: number, w: number,
     *   label: string
     * }>>}
     */
    const weirs = ref([]);

    // ── Wehr-Polylinien (editierbare Linie + abgeleitete Zellen) ───────────────
    /**
     * Editierbare Wehr-Polylinie. `points` ist die Quelle der Wahrheit; die
     * zugehörigen Zellen (lineId === line.id) liegen in `weirs` für den Export.
     * @type {import('vue').Ref<Array<{ id:string, points:Array<{x,y}>, hc:number, Cd:number, m:number, w:number, label?:string }>>}
     */
    const weirLines = ref([]);

    /** Wehr-Zellen einer lineId in `weirs` durch `cells` ersetzen (ohne Snapshot).
     *  `cells` tragen optional per-Zelle `hc` (z-Profil) und `orifice:{soffit}` (Öffnung). */
    function _syncWeirCells(lineId, cells, attrs) {
        weirs.value = weirs.value.filter(w => w.lineId !== lineId);
        for (const c of cells) {
            weirs.value.push({
                id: `weir_${lineId}_${c.col}_${c.row}_${c.direction}`,
                lineId,
                x: c.x, y: c.y,
                direction: c.direction || 'S',
                Cd: attrs.Cd ?? 1.704,
                hc: c.hc ?? attrs.hc ?? 0.0,
                m: attrs.m ?? 0.667, w: attrs.w ?? 1.0,
                orifice: c.orifice ?? null,
                label: attrs.label || 'Wehr-Polylinie',
            });
        }
        touch('weir');
    }

    /** Neue Wehr-Polylinie + abgeleitete Zellen hinzufügen. */
    function addWeirLine(line, cells) {
        saveSnapshot('Wehr-Polylinie hinzugefügt');
        weirLines.value.push(line);
        _syncWeirCells(line.id, cells, line);
        touch('weir');
    }

    /** Wehr-Polylinie patchen ({points?, hc?, …}) + Zellen neu setzen. */
    function updateWeirLine(id, patch, cells, label = 'Wehr-Polylinie bearbeitet') {
        const l = weirLines.value.find(l => l.id === id);
        if (!l) return;
        saveSnapshot(label);
        Object.assign(l, patch);
        _syncWeirCells(id, cells, l);
        touch('weir');
    }

    /** Wehr-Polylinie + ihre Zellen entfernen. */
    function removeWeirLine(id) {
        saveSnapshot('Wehr-Polylinie entfernt');
        weirLines.value = weirLines.value.filter(l => l.id !== id);
        weirs.value = weirs.value.filter(w => w.lineId !== id);
        touch('weir');
    }

    // ── SGC-Kanäle (Sub-Grid-Channel, Channel-Tool) ────────────────────────────
    /**
     * Mehrfach-Kanal-Liste des Channel-Toolbar-Werkzeugs — unabhängig von der
     * Bathymetrie-Einzelkanal-Mittellinie (bathyStore.channelPolyline), beide
     * werden erst beim Export zusammengeführt (SgcGenerator.mergeSgcChannels).
     * @type {import('vue').Ref<Array<{ id:string, polyline:Array<{x,y,terrainZ}>,
     *   shape:'rect'|'trapezoid', bedWidth:number, bedMode:'depth'|'absolute',
     *   bedDepth:number, bedZStart:number, bedZEnd:number, sideSlope:number,
     *   manningN:number }>>}
     */
    const sgcChannels = ref([]);

    /** Neuen SGC-Kanal hinzufügen. */
    function addSgcChannel(channel) {
        saveSnapshot('Kanal hinzugefügt');
        sgcChannels.value.push(channel);
        touch('sgc');
    }

    /** SGC-Kanal patchen ({bedWidth?, depth?, sideSlope?, ...}). */
    function updateSgcChannel(id, patch) {
        const c = sgcChannels.value.find(c => c.id === id);
        if (!c) return;
        saveSnapshot('Kanal bearbeitet');
        Object.assign(c, patch);
        touch('sgc');
    }

    /** SGC-Kanal entfernen. */
    function removeSgcChannel(id) {
        saveSnapshot('Kanal entfernt');
        sgcChannels.value = sgcChannels.value.filter(c => c.id !== id);
        touch('sgc');
    }

    function addBoundary(feature) {
        saveSnapshot('Grenze hinzugefügt');
        boundaries.value.features.push(feature);
        notifyObjectPlaced('BOUNDARY');
        touch('boundary');
    }

    /** Boundary-Feature entfernen (Match wie getFeatureById: f.id oder properties.id). */
    function removeBoundary(id) {
        const exists = boundaries.value.features.some(f => f.id === id || (f.properties && f.properties.id === id));
        if (!exists) return false;
        saveSnapshot('Grenze entfernt');
        boundaries.value.features = boundaries.value.features.filter(
            f => !(f.id === id || (f.properties && f.properties.id === id))
        );
        touch('boundary');
        return true;
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
        notifyObjectPlaced(payload.type);
        touch('mod');
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
        touch('mod');
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
        // In-Place-Änderung: Gruppe anhand der Herkunft bestimmen und melden — sonst
        // bekäme der Renderer die geänderte Eigenschaft (z. B. Gebäudehöhe) nie mit.
        const inMods = modifications.value.some(m => m === feature);

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
        touch(inMods ? 'mod' : 'boundary');
    }

    return {
        terrain,
        terrainVersion,
        buildings,
        boundaries,
        modifications,
        mapCenter,
        importTerrain,
        addBuilding,
        addBoundary,
        removeBoundary,
        addModification,
        clearModifications,
        cropTerrain,
        maskTerrainByPolygon,
        getFeatureById,
        updateFeatureProperty,
        // Wehre (LISFLOOD weirfile) — Zell-Array, gemeinsam mit Polylinien-Editor genutzt
        weirs,
        // Wehr-Polylinien (editierbar)
        weirLines,
        addWeirLine,
        updateWeirLine,
        removeWeirLine,
        // SGC-Kanäle (Channel-Tool, Mehrfach-Liste)
        sgcChannels,
        addSgcChannel,
        updateSgcChannel,
        removeSgcChannel,
        // Brücken (Wehr-Erweiterung mit Soffitte/Deck)
        bridges,
        addBridgeBatch,
        removeBridge,
        addBridge3D,
        updateBridge3D,
        migrateBridges,
        notifyTerrainModified: () => { terrainVersion.value++; },
        revisions,
        touch,
    };
});
