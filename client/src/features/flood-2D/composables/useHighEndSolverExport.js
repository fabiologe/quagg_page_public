/**
 * useHighEndSolverExport.js
 *
 * Zwei Aufgaben:
 *
 *  A) generateSolverPayload()
 *     Transformiert den Zustand aller drei Stores in ein validiertes
 *     HighEndSolverInput-Objekt, bereit für eine REST-API-Anfrage.
 *
 *  B) purgeSimulationResults()
 *     Memory Guard: Bereinigt Frame-Arrays, IndexedDB und triggeriert
 *     den WebGL-Dispose-Event im Viewer.
 */

import { toRaw }             from 'vue';
import { useGeoStore }       from '../stores/useGeoStore.js';
import { useHydraulicStore } from '../stores/useHydraulicStore.js';
import { useSurfaceStore }   from '../stores/useSurfaceStore.js';
import { useSimulationStore } from '../stores/useSimulationStore.js';

const DB_NAME   = 'flood-result-bridge';
const STORE_NAME = 'result-data';

// ─── Validation Helpers ───────────────────────────────────────────────────────

class ValidationError extends Error {
    constructor(field, reason) {
        super(`[SolverExport] Validation failed: ${field} — ${reason}`);
        this.field = field;
    }
}

function assertDefined(value, field) {
    if (value === null || value === undefined) {
        throw new ValidationError(field, 'is null or undefined');
    }
    return value;
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useHighEndSolverExport() {
    const geoStore  = useGeoStore();
    const hydStore  = useHydraulicStore();
    const surfStore = useSurfaceStore();
    const simStore  = useSimulationStore();

    // ── A) Payload Generator ──────────────────────────────────────────────────

    /**
     * Erzeugt ein vollständiges, validiertes HighEndSolverInput-JSON-Objekt.
     * Wirft eine ValidationError-Exception wenn kritische Felder fehlen.
     *
     * @returns {HighEndSolverInput}
     */
    function generateSolverPayload() {
        const terrain = assertDefined(toRaw(geoStore.terrain), 'geoStore.terrain');
        const header  = terrain.header ?? terrain;

        assertDefined(header.ncols,    'terrain.ncols');
        assertDefined(header.nrows,    'terrain.nrows');
        assertDefined(header.cellsize, 'terrain.cellsize');

        // ── 1. Terrain Metadata (kein gridData — zu groß für REST) ───────────
        const crs = terrain.crs ?? header.crs ?? null;
        if (!crs) {
            console.warn('[SolverExport] Kein CRS in Terrain-Metadaten gefunden. Export ohne CRS-Angabe.');
        }

        const terrainMeta = {
            ncols:     header.ncols,
            nrows:     header.nrows,
            cellsize:  header.cellsize,
            xllcorner: header.xllcorner ?? header.xll ?? 0,
            yllcorner: header.yllcorner ?? header.yll ?? 0,
            minZ:      terrain.minZ,
            maxZ:      terrain.maxZ,
            ...(crs && { crs }),
        };

        // ── 2. Geo Entities ───────────────────────────────────────────────────
        const nodes = toRaw(geoStore.nodes).map(n => ({
            id:   n.id,
            type: n.type || 'GENERIC',
            x:    n.x,
            y:    n.y,
            z:    n.z ?? 0,
            displayName: n.displayName || n.id,
        }));

        const weirs = toRaw(geoStore.weirs).map(w => ({
            id:        w.id,
            x:         w.x,
            y:         w.y,
            direction: w.direction,
            hc:        w.hc,
            Cd:        w.Cd,
            m:         w.m,
            w:         w.w,
            label:     w.label,
            lineId:    w.lineId || null,
        }));

        // v8 bridge format: direction tag gets 'B' suffix (SB/EB/NB/WB = EWeir_Bridge)
        // 1 entry per cell; hc = soffit; m = Tz (transition zone, ~1.5)
        const bridgeDir = (d) => (d || 'S').toUpperCase().replace(/B$/, '') + 'B';
        const bridges = toRaw(geoStore.bridges ?? []).map(b => ({
            id:      b.id,
            lineId:  b.lineId,
            z_sohle: b.z_sohle,
            soffit:  b.soffit,
            deck:    b.deck,
            width:   b.width,
            Cd:      b.Cd,
            Tz:      b.Tz ?? 1.5,
            cells:   b.cells.map(c => ({
                col:       c.col,
                row:       c.row,
                x:         c.x,
                y:         c.y,
                // v8 uses NB/SB/EB/WB direction tags for EWeir_Bridge type
                direction: bridgeDir(c.direction),
                // v8 weir file fields
                hc:        c.soffit  ?? b.soffit,
                m:         b.Tz ?? 1.5,
                w:         b.width   ?? 5.0,
            })),
        }));

        // Culvert serialization — full hydraulic params + row/col for culvert_middleware.py
        const xll      = header.xllcorner ?? header.xll ?? 0;
        const yll      = header.yllcorner ?? header.yll ?? 0;
        const cellsize = header.cellsize ?? 1;
        const nrows    = header.nrows ?? 0;
        const rawNodes = toRaw(geoStore.nodes);
        const nodeMap  = new Map(rawNodes.map(n => [n.id, n]));

        const culverts = toRaw(geoStore.culvertLinks).map(l => {
            const inNode  = nodeMap.get(l.sourceId);
            const outNode = nodeMap.get(l.targetId);
            // Grid row/col (0-based, top-down for culvert_middleware.py interface)
            const toRowCol = (node) => {
                if (!node) return { row: null, col: null };
                const col = Math.floor((node.x - xll) / cellsize);
                const row = (nrows - 1) - Math.floor((node.y - yll) / cellsize);
                return { row, col };
            };
            return {
                id:        l.id,
                sourceId:  l.sourceId,
                targetId:  l.targetId,
                inlet:     toRowCol(inNode),
                outlet:    toRowCol(outNode),
                z_in:      l.z_in      ?? 0.0,
                z_out:     l.z_out     ?? 0.0,
                diameter:  l.diameter  ?? 1.0,
                length:    l.length    ?? 10.0,
                manning_n: l.manning_n ?? 0.013,
                Cd:        l.Cd        ?? 0.6,
            };
        });

        const modifications = toRaw(geoStore.modifications).map(m => ({
            id:         m.id,
            type:       m.type,
            geometry:   m.geometry,
            properties: m.properties,
        }));

        const boundaries = toRaw(geoStore.boundaries?.features ?? []).map(f => ({
            id:         f.id,
            geometry:   f.geometry,
            properties: f.properties,
        }));

        // ── 3. Boundary Conditions ────────────────────────────────────────────
        const assignments = toRaw(hydStore.assignments);
        const ganglinien  = toRaw(hydStore.ganglinien);

        // Serialize hydrograph profiles that are actually referenced
        const referencedProfileIds = new Set(
            Object.values(assignments)
                .filter(a => a?.profileId)
                .map(a => a.profileId)
        );

        const profiles = {};
        for (const pid of referencedProfileIds) {
            if (ganglinien[pid]) {
                profiles[pid] = {
                    id:   pid,
                    name: ganglinien[pid].name,
                    type: ganglinien[pid].type,
                    data: ganglinien[pid].data,
                };
            }
        }

        // ── 4. Surface / Roughness ────────────────────────────────────────────
        const surfaceMaterials = toRaw(surfStore.materials).map(m => ({
            id:      m.id,
            name:    m.name,
            manning: m.manning,
            color:   m.color,
        }));

        // ── 5. Simulation Config ──────────────────────────────────────────────
        const simConfig = {
            simDuration:      simStore.simDuration  || 3600,
            timeStep:         simStore.timeStep     || 1.0,
            saveInterval:     simStore.saveInterval || 60,
            massInterval:     simStore.massInterval || 60,
            useAcceleration:  simStore.useAcceleration ?? false,
            useBmiSolver:     simStore.useBmiSolver    ?? false,
            globalRoughness:  hydStore.globalRoughness,
        };

        // Rain
        const rain = hydStore.rainSeries
            ? {
                config: toRaw(hydStore.rainConfig),
                series: toRaw(hydStore.rainSeries),
              }
            : null;

        // ── 6. Assemble & return ──────────────────────────────────────────────
        /** @type {HighEndSolverInput} */
        const payload = {
            _version:   '1.0.0',
            _generated: new Date().toISOString(),
            terrain:    terrainMeta,
            geo: {
                nodes,
                weirs,
                bridges,
                culverts,
                modifications,
                boundaries,
            },
            hydraulics: {
                assignments,
                profiles,
                rain,
            },
            surface: {
                materials: surfaceMaterials,
                // surfaceGrid intentionally omitted — send as separate binary upload
            },
            simulation: simConfig,
        };

        console.info('[SolverExport] Payload generated:', {
            nodes:       nodes.length,
            weirs:       weirs.length,
            bridges:     bridges.length,
            culverts:    culverts.length,
            assignments: Object.keys(assignments).length,
            profiles:    Object.keys(profiles).length,
        });

        return payload;
    }

    // ── B) Memory Guard & Result Purge ────────────────────────────────────────

    /**
     * Löscht ALLE Simulationsergebnisse aus:
     *  1. SimStore Frame-Arrays (RAM)
     *  2. IndexedDB (Persistenz-Layer)
     *  3. Viewer WebGL-Geometrien (GPU-Speicher via Custom Event)
     *
     * @returns {Promise<void>}
     */
    async function purgeSimulationResults() {
        console.warn('[MemoryGuard] Starting full simulation result purge...');

        // ── 1. SimStore Frame-Arrays leeren ──────────────────────────────────
        if (simStore.resultFrames instanceof Map) {
            simStore.resultFrames.clear();
        } else if (simStore.resultFrames) {
            simStore.resultFrames = new Map();
        }

        if ('maxWaterDepth'  in simStore) simStore.maxWaterDepth  = 0;
        if ('totalFrameCount' in simStore) simStore.totalFrameCount = 0;
        if ('progress'       in simStore) simStore.setProgress?.(0);
        if ('status'         in simStore) simStore.setStatus?.('IDLE');

        console.info('[MemoryGuard] ✅ SimStore frames cleared.');

        // ── 2. IndexedDB löschen ──────────────────────────────────────────────
        try {
            await _deleteIndexedDB();
            console.info('[MemoryGuard] ✅ IndexedDB cleared.');
        } catch (err) {
            console.error('[MemoryGuard] IndexedDB purge failed:', err);
        }

        // ── 3. WebGL Dispose im Viewer triggern ───────────────────────────────
        // Der ResultMap3D-Viewer lauscht auf dieses Event und ruft
        // renderer.dispose(), geometry.dispose(), material.dispose() auf.
        window.dispatchEvent(new CustomEvent('flood-viewer-dispose', {
            detail: { reason: 'purge' }
        }));
        console.info('[MemoryGuard] ✅ WebGL dispose event dispatched.');

        console.warn('[MemoryGuard] Purge complete. GPU + RAM + IndexedDB freed.');
    }

    return {
        generateSolverPayload,
        purgeSimulationResults,
    };
}

// ─── Private: IndexedDB Deletion ─────────────────────────────────────────────

function _deleteIndexedDB() {
    return new Promise((resolve, reject) => {
        // Strategie: Öffnen, alle Keys löschen (sanfter als deleteDatabase,
        // da deleteDatabase auf aktive Connections blockiert)
        const openReq = indexedDB.open(DB_NAME, 1);

        openReq.onsuccess = () => {
            const db = openReq.result;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.close();
                return resolve();
            }

            const tx    = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.clear();
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror    = () => { db.close(); reject(tx.error); };
        };

        openReq.onerror = () => reject(openReq.error);
    });
}
