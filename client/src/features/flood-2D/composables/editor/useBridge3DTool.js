/**
 * useBridge3DTool.js
 *
 * 3D-Brückenkörper-Editor (Tool-Modus 'MESH3D' innerhalb von 'BRIDGE').
 *
 * Workflow (Blender-light):
 *   DRAW_FOOTPRINT → Footprint-Polygon aufs Terrain klicken (Enter schließt)
 *   EXTRUDE_FORM   → Soffitte/Deck/Cd/Tz im Panel, "Extrudieren" baut den Körper
 *   EDIT           → Vertex-Handles in Z ziehen (Voute/Bogen), Shift = Mehrfachauswahl
 *   LOOPCUT        → Station einfügen ('R' oder Panel-Button), Klick setzt den Schnitt
 *
 * Geometrie/Hydraulik: utils/BridgeMeshLattice.js (pure) + utils/Bridge3DGeometry.js
 * (three.js). Commits laufen ausschließlich über geoStore.addBridge3D/updateBridge3D
 * — ein Undo-Schritt pro Drag/Cut, Re-Sampling der Solver-Zellen nur bei Commit.
 */
import { reactive } from 'vue';
import * as THREE from 'three';
import { useGeoStore } from '../../stores/useGeoStore.js';
import { useToolStateMachine } from './useToolStateMachine.js';
import {
    createLattice, insertLoopCut, latticeToCells, worldToUV, uvToWorld,
    footprintArea, footprintTerrainStats, sampleGridZ,
} from '../../utils/BridgeMeshLattice.js';
import {
    buildBridge3DGeometry, buildLatticeWireframe,
    latticeNodeWorldPositions, buildCutPreview,
} from '../../utils/Bridge3DGeometry.js';

const MIN_THICKNESS = 0.1; // Deck muss über Soffitte bleiben [m]

// ── Singleton-State (gelesen von BridgeTool.vue, MapEditor3D, useLayerRenderer) ─
export const bridge3DState = reactive({
    mode: 'LINE',          // 'LINE' | 'MESH3D' — Umschalter im BridgeTool-Panel
    phase: 'IDLE',         // IDLE | DRAW_FOOTPRINT | EXTRUDE_FORM | EDIT | LOOPCUT
    draftPoints: [],       // [{x, y, terrainZ}] Echtkoordinaten während des Zeichnens
    editingId: null,
    selection: [],         // Handle-Keys 'b:i:j' / 't:i:j'
    hoverKey: null,
    dragging: false,       // MapEditor3D: controls.enabled = false während Drag
    hoverCutU: null,       // LOOPCUT: aktuelle Schnittposition [0..1]
    formDefaults: { z_sohle: 0, soffit: 2, deck: 3 },
    // Lot-Info der Auswahl fürs Panel: { count, dz (Höhe über Raster), z, terrZ }
    selectionInfo: null,
});

// ── Modul-Level three.js Objekte ────────────────────────────────────────────
let scene_ref = null;
let draftLine = null, draftDots = null, previewLine = null, closingLine = null;
let editGroup = null;      // Body-Preview + Wireframe + Handles + Cut-Preview
let bodyPreview = null, cageLines = null, handleGroup = null, cutLine = null;
let guideGroup = null;     // Lot-Führungslinien + Abstands-Labels der Auswahl

// Drag-Zustand (kein Vue-Tracking nötig)
let dragLattice = null;    // Arbeitskopie während des Drags
let dragSheetKey = null;   // 'b' | 't' — nur Nodes dieses Sheets bewegen
let dragStartY = 0;
let dragStartZ = new Map();// key → Ausgangshöhe
const dragPlane = new THREE.Plane();
let downNDC = null;        // Pointer bei mousedown — unterscheidet Klick von Kamera-Drag

// ── Koordinaten (identisch zu useChannelPolygonTool) ────────────────────────
function worldToReal(worldPt, terrain) {
    return {
        x:        worldPt.x + terrain.center.x,
        y:       -worldPt.z + terrain.center.y,
        terrainZ: worldPt.y + terrain.minZ,
    };
}
function realToWorld(pt, terrain) {
    return new THREE.Vector3(
        pt.x - terrain.center.x,
        (pt.terrainZ ?? terrain.minZ) - terrain.minZ + 0.5,
        -(pt.y - terrain.center.y),
    );
}

/** Handle-Key 'b:0:2' → ['b', 0, 2]. */
function parseKey(key) {
    const p = key.split(':');
    return [p[0], Number(p[1]), Number(p[2])];
}

/** GIS → Terrain-lokal, exakt (ohne den +0.5-Lift von realToWorld). */
function toLocalExact(x, y, z, terrain) {
    return new THREE.Vector3(
        x - terrain.center.x,
        z - terrain.minZ,
        -(y - terrain.center.y),
    );
}

/** Weltkoordinate eines Lattice-Knotens (i = Querreihe, j = Station). */
function nodeWorldXY(lattice, i, j) {
    return uvToWorld(lattice, lattice.u[j], i / (lattice.nCross - 1));
}

/** Editor-Raster-Header in Zellzentren-Konvention (xll = Zentrum von Spalte 0). */
function headerFromTerrain(terrain) {
    return {
        ncols: terrain.ncols, nrows: terrain.nrows, cellsize: terrain.cellsize,
        xll: terrain.center.x - (terrain.ncols - 1) * terrain.cellsize / 2,
        yll: terrain.center.y - (terrain.nrows - 1) * terrain.cellsize / 2,
    };
}

// ── Draft-Visuals (Footprint-Zeichnen) ──────────────────────────────────────
function buildPolyline(points, terrain, color, dashed = false) {
    if (points.length < 2) return null;
    const pos = [];
    for (const p of points) { const w = realToWorld(p, terrain); pos.push(w.x, w.y, w.z); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = dashed
        ? new THREE.LineDashedMaterial({ color, dashSize: 1.5, gapSize: 1, depthTest: false })
        : new THREE.LineBasicMaterial({ color, linewidth: 2, depthTest: false });
    const line = new THREE.Line(geo, mat);
    if (dashed) line.computeLineDistances();
    line.renderOrder = 997;
    return line;
}

function buildDots(points, terrain, color) {
    const group = new THREE.Group();
    for (const p of points) {
        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.35, 8, 8),
            new THREE.MeshBasicMaterial({ color, depthTest: false }),
        );
        dot.position.copy(realToWorld(p, terrain));
        dot.renderOrder = 999;
        group.add(dot);
    }
    return group;
}

function removeMesh(scene, obj) {
    if (!obj || !scene) return;
    scene.remove(obj);
    obj.traverse?.(c => { c.geometry?.dispose(); c.material?.dispose(); });
    obj.geometry?.dispose();
    obj.material?.dispose();
}

// ── Edit-Visuals (Body-Preview, Käfig, Handles) ─────────────────────────────
const HANDLE_COLORS = { b: 0x1abc9c, t: 0xbdc3c7 };
const HANDLE_SELECTED = 0xf1c40f;

function clearEditVisuals() {
    if (!scene_ref) return;
    if (editGroup) removeMesh(scene_ref, editGroup);
    // Defensiv: verwaiste Edit-Gruppen entfernen (z.B. nach Vite-HMR bleibt sonst
    // ein "Zombie"-Körper in der Szene stehen, der sich nie mehr mitbewegt).
    let stale;
    while ((stale = scene_ref.getObjectByName('Bridge3D_Edit'))) removeMesh(scene_ref, stale);
    editGroup = bodyPreview = cageLines = handleGroup = cutLine = guideGroup = null;
}

/**
 * In-Place-Update von Body, Käfig und Handles aus einem (Arbeits-)Lattice —
 * statt Destroy/Recreate pro pointermove. Garantiert, dass Körper und Linien
 * im selben Frame aus demselben Lattice stammen (Fix für Türkis-Desync).
 * Topologie (nSpan/nCross) muss der von rebuildEditVisuals entsprechen.
 */
function updateEditVisualsFromLattice(bridge, lattice, grid) {
    if (!editGroup || !grid?.center) return;
    const b = { ...bridge, lattice };

    if (bodyPreview) {
        const geom = buildBridge3DGeometry(b, grid);
        if (geom) {
            bodyPreview.geometry.dispose();
            bodyPreview.geometry = geom;
        }
    }
    if (cageLines) {
        const pos = buildLatticeWireframe(b, grid);
        if (pos) {
            cageLines.geometry.dispose();
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            cageLines.geometry = g;
        }
    }
    if (handleGroup) {
        // latticeNodeWorldPositions liefert dieselbe Reihenfolge wie beim Aufbau
        const nodes = latticeNodeWorldPositions(b, grid);
        nodes.forEach((node, idx) => handleGroup.children[idx]?.position.copy(node.pos));
    }
}

/** Body + Käfig + Handles aus (bridge, lattice) neu aufbauen. */
function rebuildEditVisuals(bridge, lattice, grid) {
    if (!scene_ref || !grid?.center) return;
    clearEditVisuals();
    const b = { ...bridge, lattice };

    editGroup = new THREE.Group();
    editGroup.name = 'Bridge3D_Edit';
    editGroup.renderOrder = 998;

    const geom = buildBridge3DGeometry(b, grid);
    if (geom) {
        bodyPreview = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
            color: 0x1abc9c, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
        }));
        editGroup.add(bodyPreview);
    }

    const wirePos = buildLatticeWireframe(b, grid);
    if (wirePos) {
        const wgeo = new THREE.BufferGeometry();
        wgeo.setAttribute('position', new THREE.BufferAttribute(wirePos, 3));
        cageLines = new THREE.LineSegments(wgeo, new THREE.LineBasicMaterial({
            color: 0xffffff, depthTest: false,
        }));
        cageLines.renderOrder = 998;
        editGroup.add(cageLines);
    }

    handleGroup = new THREE.Group();
    for (const node of latticeNodeWorldPositions(b, grid)) {
        const h = new THREE.Mesh(
            new THREE.SphereGeometry(0.35, 12, 12),
            new THREE.MeshBasicMaterial({ color: HANDLE_COLORS[node.sheet], depthTest: false }),
        );
        h.position.copy(node.pos);
        h.renderOrder = 999;
        h.userData.handleKey = node.key;
        handleGroup.add(h);
    }
    editGroup.add(handleGroup);
    scene_ref.add(editGroup);
    updateHandleAppearance();
    updateGuides(bridge, lattice, grid);
}

function updateHandleAppearance() {
    if (!handleGroup) return;
    const selected = new Set(bridge3DState.selection);
    for (const h of handleGroup.children) {
        const key = h.userData.handleKey;
        const isSel = selected.has(key);
        const isHover = bridge3DState.hoverKey === key;
        h.material.color.setHex(isSel ? HANDLE_SELECTED : HANDLE_COLORS[key[0]]);
        h.scale.setScalar(isHover ? 1.5 : 1.0);
    }
}

/** Text-Sprite (Canvas) für das Abstands-Label am Rasterlot. */
function makeTextSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 34px sans-serif';
    const w = ctx.measureText(text).width + 28;
    ctx.fillStyle = 'rgba(15, 25, 35, 0.8)';
    ctx.fillRect((256 - w) / 2, 6, w, 52);
    ctx.fillStyle = '#f1c40f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 33);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true,
    }));
    sprite.scale.set(6, 1.5, 1);
    sprite.renderOrder = 1000;
    return sprite;
}

function disposeGuides() {
    if (guideGroup && editGroup) {
        editGroup.remove(guideGroup);
        guideGroup.traverse(c => {
            c.geometry?.dispose();
            c.material?.map?.dispose();
            c.material?.dispose();
        });
    }
    guideGroup = null;
}

/**
 * Lot-Führungslinien für die aktuelle Auswahl: gestrichelte Vertikale vom
 * Handle zum Rasterlot-Fußpunkt + Label mit der Höhe über dem Raster.
 * Aktualisiert bridge3DState.selectionInfo fürs Panel.
 */
function updateGuides(bridge, lattice, terrain) {
    disposeGuides();
    bridge3DState.selectionInfo = null;
    if (!editGroup || !terrain?.center || !terrain.gridData || !bridge3DState.selection.length) return;

    const hdr = headerFromTerrain(terrain);
    guideGroup = new THREE.Group();
    let single = null;

    for (const key of bridge3DState.selection) {
        const [sheetKey, i, j] = parseKey(key);
        const sheet = sheetKey === 'b' ? lattice.bottomZ : lattice.topZ;
        if (!sheet[i] || sheet[i][j] === undefined) continue;
        const w = nodeWorldXY(lattice, i, j);
        const terrZ = sampleGridZ(hdr, terrain.gridData, w.x, w.y);
        if (terrZ == null) continue;
        const z = sheet[i][j];
        const dz = z - terrZ;

        const top = toLocalExact(w.x, w.y, z, terrain);
        const bot = toLocalExact(w.x, w.y, terrZ, terrain);

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(
            [top.x, top.y, top.z, bot.x, bot.y, bot.z], 3));
        const line = new THREE.Line(geo, new THREE.LineDashedMaterial({
            color: 0xf1c40f, dashSize: 0.6, gapSize: 0.4, depthTest: false,
        }));
        line.computeLineDistances();
        line.renderOrder = 999;
        guideGroup.add(line);

        const foot = new THREE.Mesh(
            new THREE.SphereGeometry(0.25, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xf1c40f, depthTest: false }),
        );
        foot.position.copy(bot);
        foot.renderOrder = 999;
        guideGroup.add(foot);

        const label = makeTextSprite(`${dz >= 0 ? '+' : ''}${dz.toFixed(2)} m`);
        label.position.set(top.x, (top.y + bot.y) / 2, top.z);
        guideGroup.add(label);

        single = { dz, z, terrZ };
    }

    editGroup.add(guideGroup);
    bridge3DState.selectionInfo = (bridge3DState.selection.length === 1 && single)
        ? { count: 1, ...single }
        : { count: bridge3DState.selection.length, dz: single?.dz ?? null };
}

function showCutPreview(bridge, grid, u) {
    if (!scene_ref || !editGroup) return;
    if (cutLine) { editGroup.remove(cutLine); cutLine.geometry?.dispose(); cutLine.material?.dispose(); cutLine = null; }
    const pos = buildCutPreview(bridge, grid, u);
    if (!pos) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    cutLine = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xf1c40f, depthTest: false }));
    cutLine.renderOrder = 999;
    editGroup.add(cutLine);
}

/** Layer-gerendertes Duplikat ein-/ausblenden (während Edit zeigt das Tool den Preview). */
function setLayerBridgeVisible(id, visible) {
    const layer = scene_ref?.getObjectByName('Layer_Bridges');
    layer?.children.forEach(c => { if (c.userData?.id === id) c.visible = visible; });
}

// ── Composable ──────────────────────────────────────────────────────────────
export function useBridge3DTool() {
    const geoStore = useGeoStore();
    const sm = useToolStateMachine();
    let keyHandler = null;

    const getBridge = () => geoStore.bridges.find(b => b.id === bridge3DState.editingId);

    // ── Aggregate + Solver-Zellen aus dem Lattice ableiten ──────────────────
    const derivePatch = (bridge, lattice) => {
        const terrain = geoStore.terrain;
        const cells = latticeToCells({ ...bridge, lattice }, headerFromTerrain(terrain), terrain.gridData);
        const flatB = lattice.bottomZ.flat(), flatT = lattice.topZ.flat();
        const zs = cells.map(c => c.z).filter(z => z != null);
        return {
            lattice, cells,
            soffit: Math.min(...flatB),
            deck:   Math.max(...flatT),
            z_sohle: zs.length ? Math.min(...zs) : bridge.z_sohle,
            width:  lattice.crossLen,
        };
    };

    // ── Phasen-Übergänge ─────────────────────────────────────────────────────
    const startDrawing = () => {
        cancelEdit();
        bridge3DState.draftPoints = [];
        bridge3DState.phase = 'DRAW_FOOTPRINT';
        rebuildDraft();
    };

    const rebuildDraft = () => {
        const terrain = geoStore.terrain;
        if (!scene_ref || !terrain?.center) return;
        removeMesh(scene_ref, draftLine); draftLine = null;
        removeMesh(scene_ref, draftDots); draftDots = null;
        const pts = bridge3DState.draftPoints;
        if (!pts.length) return;
        draftLine = buildPolyline(pts, terrain, 0x1abc9c);
        draftDots = buildDots(pts, terrain, 0x1abc9c);
        if (draftLine) scene_ref.add(draftLine);
        scene_ref.add(draftDots);
    };

    const clearDraftVisuals = () => {
        removeMesh(scene_ref, draftLine);   draftLine = null;
        removeMesh(scene_ref, draftDots);   draftDots = null;
        removeMesh(scene_ref, previewLine); previewLine = null;
        removeMesh(scene_ref, closingLine); closingLine = null;
    };

    /** Footprint schließen → Formular-Defaults aus Terrain, Phase EXTRUDE_FORM. */
    const commitFootprint = () => {
        if (bridge3DState.phase !== 'DRAW_FOOTPRINT') return;
        const pts = bridge3DState.draftPoints.map(p => ({ x: p.x, y: p.y }));
        if (pts.length < 3 || Math.abs(footprintArea(pts)) < 1e-6) {
            console.warn('[Bridge3D] Footprint braucht ≥3 nicht-kollineare Punkte.');
            return;
        }
        const terrain = geoStore.terrain;
        const stats = footprintTerrainStats(pts, headerFromTerrain(terrain), terrain.gridData);
        const base = stats?.meanZ ?? 0;
        bridge3DState.formDefaults = {
            z_sohle: base,
            soffit:  Math.round((base + 2.0) * 100) / 100,
            deck:    Math.round((base + 3.0) * 100) / 100,
        };
        removeMesh(scene_ref, previewLine); previewLine = null;
        removeMesh(scene_ref, closingLine); closingLine = null;
        bridge3DState.phase = 'EXTRUDE_FORM';
    };

    /** Extrudieren: Lattice + Zellen bauen, in den Store committen → EDIT. */
    const applyExtrude = ({ soffit, deck, Cd = 0.80, Tz = 1.5, directionMode = 'AUTO' }) => {
        if (bridge3DState.phase !== 'EXTRUDE_FORM') return;
        if (!(deck >= soffit + MIN_THICKNESS)) {
            console.warn('[Bridge3D] Deck muss über der Soffitte liegen.');
            return;
        }
        const footprint = bridge3DState.draftPoints.map(p => ({ x: p.x, y: p.y }));
        const lattice = createLattice(footprint, { soffit, deck });
        if (!lattice) return;

        const bridge = {
            id: `bridge3d_${Date.now()}`,
            kind: 'mesh3d',
            footprint, lattice,
            directionMode, Cd, Tz,
        };
        Object.assign(bridge, derivePatch(bridge, lattice));
        geoStore.addBridge3D(bridge);

        bridge3DState.draftPoints = [];
        clearDraftVisuals();
        startEdit(bridge.id);
    };

    const startEdit = (id) => {
        const bridge = geoStore.bridges.find(b => b.id === id && b.kind === 'mesh3d');
        if (!bridge) return;
        bridge3DState.editingId = id;
        bridge3DState.selection = [];
        bridge3DState.phase = 'EDIT';
        setLayerBridgeVisible(id, false);
        rebuildEditVisuals(bridge, bridge.lattice, geoStore.terrain);
    };

    const finishEdit = () => {
        if (bridge3DState.editingId) setLayerBridgeVisible(bridge3DState.editingId, true);
        cancelEdit();
    };

    const cancelEdit = () => {
        if (bridge3DState.editingId) setLayerBridgeVisible(bridge3DState.editingId, true);
        bridge3DState.editingId = null;
        bridge3DState.selection = [];
        bridge3DState.selectionInfo = null;
        bridge3DState.hoverKey = null;
        bridge3DState.hoverCutU = null;
        bridge3DState.dragging = false;
        bridge3DState.phase = 'IDLE';
        dragLattice = null;
        clearEditVisuals();
    };

    const startLoopCut = () => {
        if (bridge3DState.phase !== 'EDIT') return;
        bridge3DState.hoverCutU = null;
        bridge3DState.phase = 'LOOPCUT';
    };

    const applyLoopCut = () => {
        const bridge = getBridge();
        if (!bridge || bridge3DState.hoverCutU == null) return;
        const cut = insertLoopCut(bridge.lattice, bridge3DState.hoverCutU);
        if (!cut) return; // zu nah an bestehender Station
        // Auswahl verwerfen: Stations-Indizes (j) verschieben sich durch den Cut
        bridge3DState.selection = [];
        geoStore.updateBridge3D(bridge.id, derivePatch(bridge, cut), 'Loop Cut');
        bridge3DState.hoverCutU = null;
        bridge3DState.phase = 'EDIT';
        setLayerBridgeVisible(bridge.id, false); // Re-Render des Watchers blendet ggf. wieder ein
        rebuildEditVisuals(bridge, cut, geoStore.terrain);
    };

    /**
     * Setzt alle selektierten Punkte auf eine exakte Höhe über dem Rasterlot
     * (z.B. 4.20 m über Gelände). Negative Werte clippen aufs Terrain.
     */
    const setHeightAboveTerrain = (dz) => {
        const bridge = getBridge();
        const terrain = geoStore.terrain;
        if (!bridge || !terrain?.gridData || !bridge3DState.selection.length || !Number.isFinite(dz)) return;

        const hdr = headerFromTerrain(terrain);
        const lat = JSON.parse(JSON.stringify(bridge.lattice));
        for (const key of bridge3DState.selection) {
            const [sheetKey, i, j] = parseKey(key);
            const w = nodeWorldXY(lat, i, j);
            const terrZ = sampleGridZ(hdr, terrain.gridData, w.x, w.y);
            if (terrZ == null) continue;
            if (sheetKey === 'b') {
                const z = Math.max(terrZ, terrZ + dz); // Clipping: nicht unters Raster
                lat.bottomZ[i][j] = z;
                if (lat.topZ[i][j] < z + MIN_THICKNESS) lat.topZ[i][j] = z + MIN_THICKNESS;
            } else {
                lat.topZ[i][j] = Math.max(terrZ + dz, lat.bottomZ[i][j] + MIN_THICKNESS, terrZ + MIN_THICKNESS);
            }
        }
        geoStore.updateBridge3D(bridge.id, derivePatch(bridge, lat), 'Punkthöhe über Raster gesetzt');
        setLayerBridgeVisible(bridge.id, false);
        rebuildEditVisuals(bridge, bridge.lattice, terrain);
    };

    const deleteCurrent = () => {
        const id = bridge3DState.editingId;
        cancelEdit();
        if (id) geoStore.removeBridge(id);
    };

    /** Esc-Semantik je Phase. */
    const cancel = () => {
        switch (bridge3DState.phase) {
            case 'DRAW_FOOTPRINT':
            case 'EXTRUDE_FORM':
                bridge3DState.draftPoints = [];
                clearDraftVisuals();
                bridge3DState.phase = 'IDLE';
                break;
            case 'LOOPCUT':
                bridge3DState.hoverCutU = null;
                if (cutLine && editGroup) {
                    editGroup.remove(cutLine);
                    cutLine.geometry?.dispose();
                    cutLine.material?.dispose();
                    cutLine = null;
                }
                bridge3DState.phase = 'EDIT';
                break;
            case 'EDIT':
                finishEdit();
                break;
            default:
                break;
        }
    };

    const undoLastPoint = () => {
        if (bridge3DState.phase !== 'DRAW_FOOTPRINT') return;
        bridge3DState.draftPoints.pop();
        rebuildDraft();
    };

    // ── Tool-Lebenszyklus ────────────────────────────────────────────────────
    const activate = (scene) => {
        scene_ref = scene;
        if (bridge3DState.phase === 'IDLE') startDrawing();
        sm.attachShortcuts({
            onCancel:  () => cancel(),
            onUndo:    () => undoLastPoint(),
            onConfirm: () => {
                if (bridge3DState.phase === 'DRAW_FOOTPRINT') commitFootprint();
                else if (bridge3DState.phase === 'EDIT') finishEdit();
            },
        });
        // 'R' = Loop Cut (Blender-Anlehnung; Ctrl+R wäre Browser-Reload)
        keyHandler = (e) => {
            const tag = e.target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
            if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) startLoopCut();
        };
        window.addEventListener('keydown', keyHandler);
    };

    const deactivate = () => {
        sm.detachShortcuts();
        if (keyHandler) { window.removeEventListener('keydown', keyHandler); keyHandler = null; }
        bridge3DState.draftPoints = [];
        clearDraftVisuals();
        finishEdit();
        scene_ref = null;
    };

    // ── Pointer-Events (via bridgeProxy aus dem InteractionManager) ──────────
    const raycastHandles = (ctx) => {
        if (!handleGroup) return null;
        ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
        const hits = ctx.raycaster.intersectObjects(handleGroup.children, false);
        return hits.length ? hits[0].object : null;
    };

    const raycastTerrainReal = (ctx) => {
        const terrain = geoStore.terrain;
        if (!ctx.terrainMesh || !terrain?.center) return null;
        ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
        const hits = ctx.raycaster.intersectObject(ctx.terrainMesh, false);
        return hits.length ? worldToReal(hits[0].point, terrain) : null;
    };

    /** Trifft der Pointer einen bestehenden mesh3d-Körper? → dessen ID. */
    const pickMesh3DBody = (ctx) => {
        const layer = (ctx.scene ?? scene_ref)?.getObjectByName('Layer_Bridges');
        if (!layer) return null;
        ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
        const hits = ctx.raycaster.intersectObjects(layer.children, false);
        const hit = hits.find(h => h.object.userData?.type === 'bridge');
        if (!hit) return null;
        const bridge = geoStore.bridges.find(b => b.id === hit.object.userData.id);
        return bridge?.kind === 'mesh3d' ? bridge.id : null;
    };

    const onMouseDown = (ctx) => {
        downNDC = ctx.pointer ? ctx.pointer.clone() : null;
        if (bridge3DState.phase === 'DRAW_FOOTPRINT') {
            // Vor dem ersten Punkt: Klick auf bestehenden Körper öffnet das Editing
            if (bridge3DState.draftPoints.length === 0) {
                const id = pickMesh3DBody(ctx);
                if (id) { clearDraftVisuals(); startEdit(id); return; }
            }
            const pt = raycastTerrainReal(ctx);
            if (pt) { bridge3DState.draftPoints.push(pt); rebuildDraft(); }
            return;
        }

        if (bridge3DState.phase === 'EDIT') {
            const bridge = getBridge();
            if (!bridge) return;
            const handle = raycastHandles(ctx);
            if (!handle) return;
            const key = handle.userData.handleKey;

            if (ctx.event?.shiftKey) {
                const i = bridge3DState.selection.indexOf(key);
                if (i >= 0) bridge3DState.selection.splice(i, 1);
                else bridge3DState.selection.push(key);
                updateHandleAppearance();
                updateGuides(bridge, bridge.lattice, geoStore.terrain);
                return;
            }
            if (!bridge3DState.selection.includes(key)) bridge3DState.selection = [key];
            updateHandleAppearance();
            updateGuides(bridge, bridge.lattice, geoStore.terrain);

            // Drag starten: vertikale Ebene durchs Handle, zur Kamera ausgerichtet
            const normal = new THREE.Vector3();
            ctx.camera.getWorldDirection(normal);
            normal.y = 0;
            if (normal.lengthSq() < 1e-6) normal.set(0, 0, 1); // Draufsicht: Z-Drag ohnehin entlang Sicht
            normal.normalize();
            dragPlane.setFromNormalAndCoplanarPoint(normal, handle.position);

            const hit = new THREE.Vector3();
            ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
            if (!ctx.raycaster.ray.intersectPlane(dragPlane, hit)) return;

            dragSheetKey = key[0];
            dragLattice = JSON.parse(JSON.stringify(bridge.lattice));
            dragStartY = hit.y;
            dragStartZ = new Map();
            for (const k of bridge3DState.selection) {
                if (k[0] !== dragSheetKey) continue;
                const [, i, j] = k.split(':').map((s, n) => n === 0 ? s : Number(s));
                const sheet = dragSheetKey === 'b' ? dragLattice.bottomZ : dragLattice.topZ;
                dragStartZ.set(k, sheet[i][j]);
            }
            bridge3DState.dragging = true;
        }
    };

    const onMove = (ctx) => {
        const terrain = geoStore.terrain;

        if (bridge3DState.phase === 'DRAW_FOOTPRINT') {
            removeMesh(scene_ref, previewLine); previewLine = null;
            removeMesh(scene_ref, closingLine); closingLine = null;
            const pts = bridge3DState.draftPoints;
            const cursor = raycastTerrainReal(ctx);
            if (!cursor || !pts.length) return;
            previewLine = buildPolyline([pts[pts.length - 1], cursor], terrain, 0x1abc9c, true);
            if (previewLine) scene_ref.add(previewLine);
            if (pts.length >= 2) {
                closingLine = buildPolyline([cursor, pts[0]], terrain, 0xf1c40f, true);
                if (closingLine) scene_ref.add(closingLine);
            }
            return;
        }

        if (bridge3DState.phase === 'EDIT') {
            const bridge = getBridge();
            if (!bridge) return;

            if (bridge3DState.dragging && dragLattice) {
                const hit = new THREE.Vector3();
                ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
                if (!ctx.raycaster.ray.intersectPlane(dragPlane, hit)) return;
                const deltaZ = hit.y - dragStartY;
                const hdr = headerFromTerrain(terrain);

                for (const [k, z0] of dragStartZ) {
                    const [, i, j] = parseKey(k);
                    // Terrain-Clipping: Knoten darf nicht unters Raster (Lotpunkt) rutschen
                    const w = nodeWorldXY(dragLattice, i, j);
                    const terrZ = sampleGridZ(hdr, terrain.gridData, w.x, w.y);
                    if (dragSheetKey === 'b') {
                        let z = Math.min(z0 + deltaZ, dragLattice.topZ[i][j] - MIN_THICKNESS);
                        if (terrZ != null && z < terrZ) {
                            z = terrZ;
                            // Terrain hat Vorrang: Deck notfalls mit anheben
                            if (dragLattice.topZ[i][j] < z + MIN_THICKNESS) dragLattice.topZ[i][j] = z + MIN_THICKNESS;
                        }
                        dragLattice.bottomZ[i][j] = z;
                    } else {
                        let z = Math.max(z0 + deltaZ, dragLattice.bottomZ[i][j] + MIN_THICKNESS);
                        if (terrZ != null && z < terrZ + MIN_THICKNESS) z = terrZ + MIN_THICKNESS;
                        dragLattice.topZ[i][j] = z;
                    }
                }
                updateEditVisualsFromLattice(bridge, dragLattice, terrain);
                updateGuides(bridge, dragLattice, terrain);
                return;
            }

            // Hover-Highlight
            const handle = raycastHandles(ctx);
            const key = handle?.userData.handleKey ?? null;
            if (key !== bridge3DState.hoverKey) {
                bridge3DState.hoverKey = key;
                updateHandleAppearance();
            }
            return;
        }

        if (bridge3DState.phase === 'LOOPCUT') {
            const bridge = getBridge();
            if (!bridge || !bodyPreview) return;
            ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
            const hits = ctx.raycaster.intersectObject(bodyPreview, false);
            if (!hits.length) { bridge3DState.hoverCutU = null; showCutPreview(bridge, terrain, null); return; }
            const real = worldToReal(hits[0].point, terrain);
            const { u } = worldToUV(bridge.lattice, real.x, real.y);
            bridge3DState.hoverCutU = u;
            showCutPreview(bridge, terrain, u);
        }
    };

    const onMouseUp = () => {
        if (!bridge3DState.dragging) return;
        bridge3DState.dragging = false;
        const bridge = getBridge();
        if (bridge && dragLattice) {
            geoStore.updateBridge3D(bridge.id, derivePatch(bridge, dragLattice), 'Brückenkörper geformt');
            setLayerBridgeVisible(bridge.id, false);
            rebuildEditVisuals(bridge, bridge.lattice, geoStore.terrain);
        }
        dragLattice = null;
    };

    const onClick = (ctx) => {
        if (bridge3DState.phase === 'LOOPCUT') { applyLoopCut(); return; }

        // EDIT: Klick ins Leere (kein Handle) deselektiert — aber nur bei echtem
        // Klick, nicht nach Kamera-Drag (Browser feuert click auch nach Bewegung)
        if (bridge3DState.phase === 'EDIT') {
            const moved = downNDC && ctx.pointer && downNDC.distanceTo(ctx.pointer) > 0.005;
            if (moved || bridge3DState.dragging || raycastHandles(ctx)) return;
            if (bridge3DState.selection.length) {
                bridge3DState.selection = [];
                updateHandleAppearance();
                const bridge = getBridge();
                if (bridge) updateGuides(bridge, bridge.lattice, geoStore.terrain);
            }
            return;
        }

        // IDLE: Klick auf bestehenden mesh3d-Körper öffnet das Editing
        if (bridge3DState.phase === 'IDLE') {
            const id = pickMesh3DBody(ctx);
            if (id) startEdit(id);
        }
    };

    return {
        activate, deactivate,
        onMouseDown, onMove, onMouseUp, onClick,
        // Panel-Aktionen
        startDrawing, commitFootprint, applyExtrude,
        startEdit, finishEdit, startLoopCut, deleteCurrent, cancel, undoLastPoint,
        setHeightAboveTerrain,
    };
}

let _instance = null;
export function getBridge3DToolInstance() {
    if (!_instance) _instance = useBridge3DTool();
    return _instance;
}
