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
    createLattice, insertLoopCut, insertLoopCutV, loopCutBlocked, latticeToCells, worldToUV, uvToWorld,
    footprintArea, footprintTerrainStats, sampleGridZ, sampleSheet, frameCorners,
    addPier, removePierAt, uInPier, updatePier, pierIndexAt, movePierCorner, subdividePier,
    hasVertexHeights, insertPolyVertex, projectToNearestEdge,
    polyStationHits, insertPolyStation, makeHeightSampler,
} from '../../utils/BridgeMeshLattice.js';
import {
    buildBridge3DGeometry, buildLatticeWireframe,
    latticeNodeWorldPositions, buildCutPreview, buildCutPreviewV, buildPierGeometry, buildPierWireframe,
    pierHandlePositions, pierCenterInfo, buildPierCenterPlane,
} from '../../utils/Bridge3DGeometry.js';
import { useControlPointEditor } from './useControlPointEditor.js';

const MIN_THICKNESS = 0.1; // Deck muss über Soffitte bleiben [m]
const PIER_HALF_U_MIN = 0.01; // min. halbe Pfeilerbreite in u

// ── Singleton-State (gelesen von BridgeTool.vue, MapEditor3D, useLayerRenderer) ─
export const bridge3DState = reactive({
    mode: 'MESH3D',        // nur noch Polygon-3D-Körper (LINE-Modus entfernt)
    phase: 'IDLE',         // IDLE | DRAW_FOOTPRINT | EXTRUDE_FORM | EDIT | LOOPCUT
    draftPoints: [],       // [{x, y, terrainZ}] Echtkoordinaten während des Zeichnens
    editingId: null,
    selection: [],         // Handle-Keys 'b:i:j' / 't:i:j'
    hoverKey: null,
    dragging: false,       // MapEditor3D: controls.enabled = false während Drag
    hoverCutU: null,       // LOOPCUT(u)/PIER: aktuelle Schnittposition [0..1]
    hoverCutV: null,       // LOOPCUT(v): Quer-Schnittposition [0..1]
    cutAxis: 'u',          // LOOPCUT: 'u' (längs) | 'v' (quer)
    subdivideMode: 'free', // SUBDIVIDE: 'free' (Einzelpunkt) | 'u' (Längs-Bogen) | 'v' (Quer)
    cutInvalid: false,     // LOOPCUT: Hover-Position feiner als Zellweite → nicht setzbar (rote Vorschau)
    pierWidth: 1.5,        // PIER: Pfeilerbreite [m] entlang der Spannachse
    selectedPier: null,    // EDIT: Index des angeklickten Pfeilers (für B/L/H-Panel)
    formDefaults: { z_sohle: 0, soffit: 2, deck: 3 },
    // Lot-Info der Auswahl fürs Panel: { count, dz (Höhe über Raster), z, terrZ }
    selectionInfo: null,
});

// ── Modul-Level three.js Objekte ────────────────────────────────────────────
let scene_ref = null;
let draftLine = null, draftDots = null, previewLine = null, closingLine = null, footprintGhost = null, framePreview = null;
let subdivideMarkers = [];  // SUBDIVIDE: Vorschau-Kugel(n) (1 frei, 2 Station)
let stationLine = null;     // SUBDIVIDE(Station): Verbindungslinie der 2 Rand-Punkte
let pendingStation = null;  // SUBDIVIDE(Station): { axis, station } für den Klick
let editGroup = null;      // Body-Preview + Wireframe + Handles + Cut-Preview
let bodyPreview = null, cageLines = null, handleGroup = null, cutLine = null, pierMesh = null, pierLineSeg = null;

// Generischer Greifpunkt-Editor für die Pfeiler-Box (Singleton — ein Editor zur Zeit)
const cpe = useControlPointEditor();
const PIER_HANDLE_COLOR = 0xf39c12;
let pierDrag = null; // { snap:{...pier}, soffitC:number } während eines Ecken-Drags
let guideGroup = null;     // Lot-Führungslinien + Abstands-Labels der Auswahl
let pierGuideGroup = null; // Maß-Labels während eines Pfeiler-Ecken/Kopf-Drags
let pierCenterPlane = null; // gelbe Mittel-Ebene des selektierten Pfeilers (dauerhaft)

// Drag-Zustand (kein Vue-Tracking nötig)
let dragLattice = null;    // Arbeitskopie während des Drags (Alt-Lattice-Pfad)
let dragVz = null;         // Arbeitskopie {vsoffit,vdeck} während des Ecken-Höhen-Drags
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

/** Grobe Zellzahl-Schätzung (Polygon-BBox / Zellfläche) — nur als Drag-Performance-Gate. */
function estimateCellCount(bridge, grid) {
    const poly = bridge.poly;
    if (!poly?.length || !grid?.cellsize) return 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of poly) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    return ((maxX - minX) * (maxY - minY)) / (grid.cellsize * grid.cellsize);
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
// Footprint sieht/funktioniert wie das Gebäude-Polygon (useDrawTool): Magenta-Linie,
// rote Punkte, rotes Rubber-Band, grünes Einrasten am Startpunkt ("Einclipping").
const FOOTPRINT_SNAP_DIST = 4.0; // m — identisch zur Snap-Schwelle in useDrawTool
const FP_LINE = 0xff00ff, FP_DOT = 0xff0000, FP_BAND = 0xff0000, FP_SNAP = 0x00ff00;
const FP_FRAME = 0x1abc9c; // cyan: das tatsächliche Rechteck (deriveFrame), das der Körper wird

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
const PIER_COLOR = 0x8b5a2b; // braun: Soffitte sitzt auf dem Gelände → Pfeiler

function clearEditVisuals() {
    if (!scene_ref) return;
    disposePierGuides(); // Sprite-Texturen freigeben, bevor editGroup entfernt wird
    if (editGroup) removeMesh(scene_ref, editGroup);
    // Defensiv: verwaiste Edit-Gruppen entfernen (z.B. nach Vite-HMR bleibt sonst
    // ein "Zombie"-Körper in der Szene stehen, der sich nie mehr mitbewegt).
    let stale;
    while ((stale = scene_ref.getObjectByName('Bridge3D_Edit'))) removeMesh(scene_ref, stale);
    cpe.dispose();
    for (const m of subdivideMarkers) removeMesh(scene_ref, m);
    subdivideMarkers = [];
    removeMesh(scene_ref, stationLine); stationLine = null;
    pendingStation = null;
    editGroup = bodyPreview = cageLines = handleGroup = cutLine = guideGroup = pierGuideGroup = pierMesh = pierLineSeg = pierCenterPlane = null;
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
        // Der zellbasierte Body rastert das Polygon. Günstig für realistische Brücken; bei
        // pathologisch großen Footprints während des aktiven Drags überspringen (Käfig/Handles
        // zeigen die Höhenänderung weiter), Body folgt bei mouseup über rebuildEditVisuals.
        if (!(bridge3DState.dragging && estimateCellCount(b, grid) > 8000)) {
            const geom = buildBridge3DGeometry(b, grid);
            if (geom) {
                bodyPreview.geometry.dispose();
                bodyPreview.geometry = geom;
            }
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

    // Pfeiler als solide Boxen (rechter Winkel, Decke bleibt oben).
    const pierGeom = buildPierGeometry(b, grid);
    if (pierGeom) {
        // Gleicher Look wie der Brückenkörper: leicht transparente Füllung + Kantenlinien.
        // depthTest:false → Pfeiler bleibt im Edit-Modus durch den transparenten
        // Brückenkörper sichtbar (Röntgen). polygonOffset → kein Z-Fighting an der Soffit-Fläche.
        pierMesh = new THREE.Mesh(pierGeom, new THREE.MeshBasicMaterial({
            color: PIER_COLOR, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
            depthTest: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
        }));
        pierMesh.renderOrder = 997; // unter Käfig (998) und Handles (999)
        editGroup.add(pierMesh);

        const pierWire = buildPierWireframe(b, grid);
        if (pierWire) {
            const wgeo = new THREE.BufferGeometry();
            wgeo.setAttribute('position', new THREE.BufferAttribute(pierWire, 3));
            pierLineSeg = new THREE.LineSegments(wgeo, new THREE.LineBasicMaterial({
                color: PIER_COLOR, depthTest: false,
            }));
            pierLineSeg.renderOrder = 998;
            editGroup.add(pierLineSeg);
        }
    }

    // Ziehbare Ecken-Greifpunkte des selektierten Pfeilers (über das generische Modul)
    // + dauerhafte gelbe Mittel-Ebene als Bemaßungs-Bezug.
    const selIdx = bridge3DState.selectedPier;
    if (selIdx != null && b.lattice.piers?.[selIdx]) {
        const pts = pierHandlePositions(b, grid, selIdx).map(h => ({ ...h, color: PIER_HANDLE_COLOR }));
        cpe.setHandles(editGroup, pts);
        const planeGeom = buildPierCenterPlane(b, grid, selIdx);
        if (planeGeom) {
            pierCenterPlane = new THREE.Mesh(planeGeom, new THREE.MeshBasicMaterial({
                color: 0xf1c40f, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthTest: false,
            }));
            pierCenterPlane.renderOrder = 996;
            editGroup.add(pierCenterPlane);
        }
    } else {
        cpe.dispose();
    }

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
        const base = HANDLE_COLORS[key[0]];
        h.material.color.setHex(isSel ? HANDLE_SELECTED : base);
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

function disposePierGuides() {
    if (pierGuideGroup && editGroup) {
        editGroup.remove(pierGuideGroup);
        pierGuideGroup.traverse(c => {
            c.geometry?.dispose();
            c.material?.map?.dispose();
            c.material?.dispose();
        });
    }
    pierGuideGroup = null;
}

/**
 * Maß-Labels während eines Pfeiler-Drags (Bemaßung in Bewegungsrichtung, analog
 * zur Brücke): Ecken-Drag → die beiden anliegenden Kantenlängen [m]; Kopf-Drag →
 * Höhe über Gelände [m].
 */
function showPierDragGuide(bridge, lattice, terrain, pierIdx, key) {
    disposePierGuides();
    const p = lattice.piers?.[pierIdx];
    if (!editGroup || !terrain?.center || !p?.poly) return;
    const pts = pierHandlePositions({ ...bridge, lattice }, terrain, pierIdx);
    const corners = pts.filter(h => h.key.startsWith('pier:c'));
    if (!corners.length) return;
    pierGuideGroup = new THREE.Group();

    const addSeg = (a, b, text) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z], 3));
        const line = new THREE.Line(geo, new THREE.LineDashedMaterial({
            color: 0xf1c40f, dashSize: 0.6, gapSize: 0.4, depthTest: false,
        }));
        line.computeLineDistances();
        line.renderOrder = 1001;
        pierGuideGroup.add(line);
        const label = makeTextSprite(text);
        label.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        pierGuideGroup.add(label);
    };

    const m = /^pier:c(\d+)$/.exec(key);
    if (m) {
        // Bemaßung von der Mittellinie (u = uc) aus: Lot vom Eckpunkt auf die
        // Mittelachse bei der v-Lage der Ecke, Label = seitlicher Abstand [m].
        const info = pierCenterInfo({ ...bridge, lattice }, terrain, pierIdx);
        const k = Number(m[1]) % corners.length;
        const cur = corners[k].pos;
        if (info) {
            const cV = p.poly[k].v;
            const fw = uvToWorld(lattice, info.uc, cV);
            const foot = toLocalExact(fw.x, fw.y, 0, terrain);
            foot.y = cur.y; // horizontale Maßlinie auf Handle-Höhe
            addSeg(cur, foot, `${cur.distanceTo(foot).toFixed(1)} m`);
        }
    } else if (key === 'pier:top') {
        const top = pts.find(h => h.key === 'pier:top');
        if (top) {
            const cu = p.poly.reduce((s, c) => s + c.u, 0) / p.poly.length;
            const cv = p.poly.reduce((s, c) => s + c.v, 0) / p.poly.length;
            const w = uvToWorld(lattice, cu, cv);
            const terrZ = sampleGridZ(headerFromTerrain(terrain), terrain.gridData, w.x, w.y) ?? terrain.minZ;
            const base = new THREE.Vector3(top.pos.x, terrZ - terrain.minZ, top.pos.z);
            addSeg(top.pos, base, `${(top.pos.y + terrain.minZ - terrZ).toFixed(2)} m`);
        }
    }
    editGroup.add(pierGuideGroup);
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

    const vz = hasVertexHeights(bridge);
    for (const key of bridge3DState.selection) {
        const parts = key.split(':');
        let wx, wy, z;
        if (vz && parts.length === 2) {
            // Per-Ecke-Key 'b:k' / 't:k'
            const k = Number(parts[1]);
            const p = bridge.poly[k];
            if (!p) continue;
            wx = p.x; wy = p.y;
            z = parts[0] === 'b' ? bridge.vsoffit[k] : bridge.vdeck[k];
        } else {
            const [sheetKey, i, j] = parseKey(key);
            const sheet = sheetKey === 'b' ? lattice.bottomZ : lattice.topZ;
            if (!sheet[i] || sheet[i][j] === undefined) continue;
            const w = nodeWorldXY(lattice, i, j);
            wx = w.x; wy = w.y; z = sheet[i][j];
        }
        const terrZ = sampleGridZ(hdr, terrain.gridData, wx, wy);
        if (terrZ == null) continue;
        const dz = z - terrZ;

        const top = toLocalExact(wx, wy, z, terrain);
        const bot = toLocalExact(wx, wy, terrZ, terrain);

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

function showCutPreview(bridge, grid, pos1d, axis = 'u', invalid = false) {
    if (!scene_ref || !editGroup) return;
    if (cutLine) { editGroup.remove(cutLine); cutLine.geometry?.dispose(); cutLine.material?.dispose(); cutLine = null; }
    const pos = axis === 'v' ? buildCutPreviewV(bridge, grid, pos1d) : buildCutPreview(bridge, grid, pos1d);
    if (!pos) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // rot = zu nah (feiner als Zellweite → nicht setzbar), sonst gelb
    const color = invalid ? 0xe74c3c : 0xf1c40f;
    cutLine = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, depthTest: false }));
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

    // Aggregate/Zellen aus dem Per-Ecke-Höhenmodell (vsoffit/vdeck je Polygon-Ecke).
    const derivePatchVz = (bridge, vz) => {
        const terrain = geoStore.terrain;
        const b = { ...bridge, vsoffit: vz.vsoffit, vdeck: vz.vdeck };
        const cells = latticeToCells(b, headerFromTerrain(terrain), terrain.gridData);
        const zs = cells.map(c => c.z).filter(z => z != null);
        return {
            vsoffit: vz.vsoffit, vdeck: vz.vdeck, cells,
            soffit:  Math.min(...vz.vsoffit),
            deck:    Math.max(...vz.vdeck),
            z_sohle: zs.length ? Math.min(...zs) : bridge.z_sohle,
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
        draftLine = buildPolyline(pts, terrain, FP_LINE);
        draftDots = buildDots(pts, terrain, FP_DOT);
        if (draftLine) scene_ref.add(draftLine);
        scene_ref.add(draftDots);
        updateFramePreview();
    };

    // WYSIWYG: zeigt live die geschlossene Körper-Grundfläche (der Body folgt jetzt
    // dem Polygon, nicht mehr einem Bounding-Rechteck) — der Schließkanten-Hinweis.
    const updateFramePreview = () => {
        removeMesh(scene_ref, framePreview); framePreview = null;
        const terrain = geoStore.terrain;
        const pts = bridge3DState.draftPoints;
        if (!scene_ref || !terrain?.center || pts.length < 3) return;
        framePreview = buildPolyline([...pts, pts[0]], terrain, FP_FRAME);
        if (framePreview) scene_ref.add(framePreview);
    };

    const clearDraftVisuals = () => {
        removeMesh(scene_ref, draftLine);   draftLine = null;
        removeMesh(scene_ref, draftDots);   draftDots = null;
        removeMesh(scene_ref, previewLine); previewLine = null;
        removeMesh(scene_ref, closingLine); closingLine = null;
        removeMesh(scene_ref, footprintGhost); footprintGhost = null;
        removeMesh(scene_ref, framePreview); framePreview = null;
    };

    // Einrasten am Startpunkt ("Einclipping" wie beim Gebäude): ab 3 Punkten schließt
    // ein Klick in Startnähe das Footprint. Schwelle ist FOOTPRINT-RELATIV (12 % der
    // bisherigen Diagonale, gedeckelt 0,5–4 m) — feste 4 m würden kleine Brücken
    // (3–5 m breit) vorzeitig zu einem Dreieck schließen.
    const footprintSnap = (cursor) => {
        const pts = bridge3DState.draftPoints;
        if (!cursor || pts.length < 3) return false;
        const s = pts[0];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of pts) {
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        }
        const diag = Math.hypot(maxX - minX, maxY - minY);
        const thresh = Math.min(FOOTPRINT_SNAP_DIST, Math.max(0.5, diag * 0.12));
        return Math.hypot(cursor.x - s.x, cursor.y - s.y) < thresh;
    };

    // Ghost-Cursor (rote Kugel, grün+größer beim Einrasten) — analog useDrawTool.
    const updateFootprintGhost = (cursor, snapped = false) => {
        const terrain = geoStore.terrain;
        if (!scene_ref || !terrain?.center) return;
        if (!cursor) { if (footprintGhost) footprintGhost.visible = false; return; }
        if (!footprintGhost) {
            footprintGhost = new THREE.Mesh(
                new THREE.SphereGeometry(0.6, 16, 16),
                new THREE.MeshBasicMaterial({ color: FP_DOT, depthTest: false, transparent: true, opacity: 0.85 }),
            );
            footprintGhost.renderOrder = 1000;
            scene_ref.add(footprintGhost);
        }
        footprintGhost.position.copy(realToWorld(cursor, terrain));
        footprintGhost.material.color.set(snapped ? FP_SNAP : FP_DOT);
        footprintGhost.scale.setScalar(snapped ? 1.6 : 1.0);
        footprintGhost.visible = true;
    };

    // Deckhöhe an einem (x,y) der Brücke (Per-Ecke-Modell → MVC-Sampler; sonst flach).
    const deckAt = (bridge, x, y) => {
        const vd = bridge.vdeck;
        return (vd && vd.length === bridge.poly.length)
            ? makeHeightSampler(bridge.poly, vd).at(x, y)
            : (bridge.deck ?? 3);
    };

    // Vorschau-Kugel-Pool (1 = frei, 2 = Station). pts: [{x,y,z}].
    const setSubdivideMarkers = (pts) => {
        const terrain = geoStore.terrain;
        if (!scene_ref || !terrain?.center) return;
        while (subdivideMarkers.length < pts.length) {
            const m = new THREE.Mesh(
                new THREE.SphereGeometry(0.5, 16, 16),
                new THREE.MeshBasicMaterial({ color: 0xb0b0b0, depthTest: false, transparent: true, opacity: 0.95 }),
            );
            m.renderOrder = 1001;
            scene_ref.add(m);
            subdivideMarkers.push(m);
        }
        for (let i = 0; i < subdivideMarkers.length; i++) {
            const m = subdivideMarkers[i];
            if (i < pts.length) { m.position.copy(toLocalExact(pts[i].x, pts[i].y, pts[i].z, terrain)); m.visible = true; }
            else m.visible = false;
        }
    };

    const setStationLine = (pts) => {
        removeMesh(scene_ref, stationLine); stationLine = null;
        const terrain = geoStore.terrain;
        if (!scene_ref || !terrain?.center || !pts || pts.length < 2) return;
        const geo = new THREE.BufferGeometry().setFromPoints(pts.map(p => toLocalExact(p.x, p.y, p.z, terrain)));
        stationLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xb0b0b0, depthTest: false, transparent: true, opacity: 0.95 }));
        stationLine.renderOrder = 1000;
        scene_ref.add(stationLine);
    };

    /** Frei: nächste Kante → 1 Vorschau-Kugel (Single Source: projectToNearestEdge). */
    const updateSubdivideFree = (real) => {
        const bridge = getBridge();
        if (!bridge?.poly || !real) { setSubdivideMarkers([]); setStationLine(null); return; }
        const proj = projectToNearestEdge(bridge.poly, real.x, real.y);
        if (!proj) { setSubdivideMarkers([]); setStationLine(null); return; }
        setSubdivideMarkers([{ x: proj.px, y: proj.py, z: deckAt(bridge, proj.px, proj.py) }]);
        setStationLine(null);
    };

    /** Längs/Quer: u/v-Station → 2 Rand-Punkte + Verbindungslinie (Bogen-Vorschau). */
    const updateStationGhost = (real) => {
        pendingStation = null;
        const bridge = getBridge();
        const axis = bridge3DState.subdivideMode; // 'u' | 'v'
        if (!bridge?.poly || !bridge.lattice || !real) { setSubdivideMarkers([]); setStationLine(null); return; }
        const { u, v } = worldToUV(bridge.lattice, real.x, real.y);
        const station = Math.max(0.03, Math.min(0.97, axis === 'v' ? v : u));
        const hits = polyStationHits(bridge.poly, bridge.lattice, axis, station);
        if (!hits) { setSubdivideMarkers([]); setStationLine(null); return; }
        const pts = hits.map(p => ({ x: p.x, y: p.y, z: deckAt(bridge, p.x, p.y) }));
        setSubdivideMarkers(pts);
        setStationLine(pts);
        pendingStation = { axis, station };
    };

    const clearSubdivideGhost = () => {
        for (const m of subdivideMarkers) removeMesh(scene_ref, m);
        subdivideMarkers = [];
        removeMesh(scene_ref, stationLine); stationLine = null;
        pendingStation = null;
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
        removeMesh(scene_ref, footprintGhost); footprintGhost = null;
        bridge3DState.phase = 'EXTRUDE_FORM';
    };

    /** Extrudieren: Lattice + Zellen bauen, in den Store committen → EDIT. */
    const applyExtrude = ({ soffit, deck, Cd = 0.80, Tz = 1.5, directionMode = 'AUTO', pierNose = '' }) => {
        if (bridge3DState.phase !== 'EXTRUDE_FORM') return;
        if (!(deck >= soffit + MIN_THICKNESS)) {
            console.warn('[Bridge3D] Deck muss über der Soffitte liegen.');
            return;
        }
        const drawn = bridge3DState.draftPoints.map(p => ({ x: p.x, y: p.y }));
        const lattice = createLattice(drawn, { soffit, deck });
        if (!lattice) return;

        const bridge = {
            id: `bridge3d_${Date.now()}`,
            kind: 'mesh3d',
            // Footprint = Frame-Rechteck (u/v-Parametrierung für Pfeiler/Fließrichtung).
            footprint: frameCorners(lattice),
            // poly = das ROH gezeichnete Polygon (Body + Solver-Zellen folgen ihm).
            poly: drawn,
            // Per-Ecke-Höhen: jede Polygon-Ecke hat editierbare Soffitte/Deck (flach initial).
            vsoffit: drawn.map(() => soffit),
            vdeck: drawn.map(() => deck),
            lattice,
            directionMode, Cd, Tz,
            // Pfeiler-Nasenform (informativ): Quelle des Cd-Vorschlags, frei überschreibbar.
            pierNose,
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
        bridge3DState.selectedPier = null;
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
        bridge3DState.selectedPier = null;
        bridge3DState.selectionInfo = null;
        bridge3DState.hoverKey = null;
        bridge3DState.hoverCutU = null;
        bridge3DState.dragging = false;
        bridge3DState.phase = 'IDLE';
        dragLattice = null;
        dragVz = null;
        pierDrag = null;
        clearEditVisuals();
    };

    const startLoopCut = () => {
        if (bridge3DState.phase !== 'EDIT') return;
        bridge3DState.hoverCutU = null;
        bridge3DState.hoverCutV = null;
        bridge3DState.cutAxis = 'u';
        bridge3DState.phase = 'LOOPCUT';
    };

    /** Quer-Loop-Cut (neuer Stützpunkt quer zur Spannachse) — für Querbögen. */
    const startCrossCut = () => {
        if (bridge3DState.phase !== 'EDIT') return;
        bridge3DState.hoverCutU = null;
        bridge3DState.hoverCutV = null;
        bridge3DState.cutAxis = 'v';
        bridge3DState.phase = 'LOOPCUT';
    };

    const applyLoopCut = () => {
        const bridge = getBridge();
        const axis = bridge3DState.cutAxis;
        const pos = axis === 'v' ? bridge3DState.hoverCutV : bridge3DState.hoverCutU;
        if (!bridge || pos == null) return;
        // Mindestabstand = DEM-Zellweite: feiner als das Rechengitter ist nicht abbildbar.
        const cs = geoStore.terrain?.cellsize || 0;
        const cut = axis === 'v' ? insertLoopCutV(bridge.lattice, pos, cs) : insertLoopCut(bridge.lattice, pos, cs);
        if (!cut) { bridge3DState.cutInvalid = true; return; } // zu nah / feiner als Zellweite
        // Auswahl verwerfen: Stations-/Reihen-Indizes verschieben sich durch den Cut
        bridge3DState.selection = [];
        bridge3DState.selectedPier = null;
        geoStore.updateBridge3D(bridge.id, derivePatch(bridge, cut), axis === 'v' ? 'Quer-Stützpunkt' : 'Loop Cut');
        bridge3DState.hoverCutU = null;
        bridge3DState.hoverCutV = null;
        bridge3DState.cutInvalid = false;
        bridge3DState.phase = 'EDIT';
        setLayerBridgeVisible(bridge.id, false); // Re-Render des Watchers blendet ggf. wieder ein
        rebuildEditVisuals(bridge, cut, geoStore.terrain);
    };


    const startPier = () => {
        if (bridge3DState.phase !== 'EDIT') return;
        bridge3DState.hoverCutU = null;
        bridge3DState.phase = 'PIER';
    };

    /**
     * Stützpunkt-Modus starten/umschalten. mode='free' → Einzelpunkt auf der nächsten Kante;
     * 'u' → Längs-Station (Bogen entlang Spannweite); 'v' → Quer-Station. Aus EDIT oder
     * während SUBDIVIDE (Modus wechseln) aufrufbar.
     */
    const startSubdivide = (mode = 'free') => {
        if (bridge3DState.phase !== 'EDIT' && bridge3DState.phase !== 'SUBDIVIDE') return;
        bridge3DState.subdivideMode = mode;
        clearSubdivideGhost();
        bridge3DState.phase = 'SUBDIVIDE';
    };

    const applySubdivide = (ctx) => {
        const bridge = getBridge();
        const pt = raycastTerrainReal(ctx);
        clearSubdivideGhost();
        if (!bridge || !pt) { bridge3DState.phase = 'EDIT'; return; }
        const next = insertPolyVertex(bridge, pt.x, pt.y);
        bridge3DState.phase = 'EDIT';
        if (!next) return;
        bridge3DState.selection = [];
        geoStore.updateBridge3D(bridge.id, next, 'Stützpunkt eingefügt');
        setLayerBridgeVisible(bridge.id, false);
        rebuildEditVisuals(getBridge(), bridge.lattice, geoStore.terrain);
    };

    /**
     * Längs/Quer-Station setzen: an der gehoverten u/v-Station beide Rand-Schnittpunkte als
     * neue Ecken einfügen und gemeinsam selektieren (Soffitte+Deck beider Enden) → gemeinsames
     * Hochziehen = symmetrischer Bogen über die volle Breite. Auch für irreguläre Polygone.
     */
    const applyStation = () => {
        const bridge = getBridge();
        const ps = pendingStation;
        clearSubdivideGhost();
        if (!bridge || !ps) { bridge3DState.phase = 'EDIT'; return; }
        const res = insertPolyStation(bridge, ps.axis, ps.station);
        bridge3DState.phase = 'EDIT';
        if (!res || res.newIndices.length === 0) return;
        geoStore.updateBridge3D(bridge.id, { poly: res.poly, vsoffit: res.vsoffit, vdeck: res.vdeck }, 'Bogen-Station eingefügt');
        // Beide neuen Ecken (Soffitte + Deck) selektieren → gemeinsam ziehbar.
        bridge3DState.selection = res.newIndices.flatMap(i => [`b:${i}`, `t:${i}`]);
        setLayerBridgeVisible(bridge.id, false);
        rebuildEditVisuals(getBridge(), bridge.lattice, geoStore.terrain);
    };

    /**
     * Setzt/entfernt an der aktuellen Hover-Position einen Pfeiler. Ein Pfeiler ist
     * ein Spann-Band {u0,u1} (lattice.piers) — eine LOKALE, volle Querschnitts-
     * sperrung über die ganze Deckbreite. Die Soffit-/Deck-Sheets bleiben
     * unverändert (Decke oben, rechter Winkel nach unten); kein Geländeeingriff.
     * Hydraulik: Export entfernt die überdeckten Orifice-Zellen und setzt die
     * SGC-Breite darunter auf 0. Klick in einen bestehenden Pfeiler entfernt ihn.
     */
    const applyPier = (pierWidth = bridge3DState.pierWidth) => {
        const bridge = getBridge();
        if (!bridge || bridge3DState.hoverCutU == null) return;
        const lat = bridge.lattice;
        const uc = bridge3DState.hoverCutU;

        let next;
        if (uInPier(lat, uc)) {
            next = removePierAt(lat, uc);                 // Toggle: bestehenden Pfeiler löschen
        } else {
            const spanLen = lat.spanLen || 1;
            const halfU = Math.max(PIER_HALF_U_MIN, (pierWidth / 2) / spanLen);
            next = addPier(lat, uc, halfU);
        }
        bridge3DState.hoverCutU = null;
        bridge3DState.phase = 'EDIT';
        bridge3DState.selection = [];
        geoStore.updateBridge3D(bridge.id, derivePatch(bridge, next),
            uInPier(lat, uc) ? 'Pfeiler entfernt' : 'Pfeiler gesetzt');
        setLayerBridgeVisible(bridge.id, false);
        rebuildEditVisuals(bridge, next, geoStore.terrain);
    };

    const commitPier = (bridge, next, label) => {
        geoStore.updateBridge3D(bridge.id, derivePatch(bridge, next), label);
        setLayerBridgeVisible(bridge.id, false);
        rebuildEditVisuals(bridge, next, geoStore.terrain);
    };
    const getSelPier = () => {
        const bridge = getBridge();
        const idx = bridge3DState.selectedPier;
        if (!bridge || idx == null) return null;
        const p = bridge.lattice.piers?.[idx];
        return p ? { bridge, idx, p } : null;
    };
    /** Pfeilerkopf-Höhe [m NHN]; null = bündig bis zur Soffitte. */
    const setPierTop = (zTop) => {
        const s = getSelPier();
        if (!s) return;
        const val = (zTop == null || !Number.isFinite(zTop)) ? null : zTop;
        commitPier(s.bridge, updatePier(s.bridge.lattice, s.idx, { zTop: val }), 'Pfeilerhöhe');
    };
    /** Pfeiler-Polygon verfeinern (Mittelpunkte einfügen) → mehr Ecken für Rundungen. */
    const subdivideSelectedPier = () => {
        const s = getSelPier();
        if (!s) return;
        commitPier(s.bridge, subdividePier(s.bridge.lattice, s.idx), 'Pfeiler-Ecken eingefügt');
    };

    // ── Ziehen der Pfeiler-Ecken / Kopfhöhe (Welt-Delta vom Greifpunkt-Modul) ───
    const applyPierDrag = (bridge, dd) => {
        const idx = bridge3DState.selectedPier;
        if (idx == null || !pierDrag) return;
        const lat = bridge.lattice;
        const snap = pierDrag.snap;
        let next;
        if (dd.key === 'pier:top') {
            next = updatePier(lat, idx, { zTop: (snap.zTop ?? pierDrag.soffitC) + dd.delta.y });
        } else {
            const m = /^pier:c(\d+)$/.exec(dd.key);
            if (!m) return;
            const cornerIdx = Number(m[1]);
            const c0 = snap.poly?.[cornerIdx];
            if (!c0) return;
            const sd = lat.spanDir, cd = { x: -sd.y, y: sd.x };
            // Welt-Delta → Real-Delta (world.x = realX−cx, world.z = −(realY−cy)) → u/v
            const realDx = dd.delta.x, realDy = -dd.delta.z;
            const du = (realDx * sd.x + realDy * sd.y) / (lat.spanLen || 1);
            const dv = (realDx * cd.x + realDy * cd.y) / (lat.crossLen || 1);
            next = movePierCorner(lat, idx, cornerIdx, c0.u + du, c0.v + dv);
        }
        pierDrag.next = next;
        refreshPierVisuals(bridge, next);
        showPierDragGuide(bridge, next, geoStore.terrain, idx, dd.key);
    };

    /** Pfeiler-Mesh, -Linien und Box-Handles live aus einem Arbeits-Lattice nachführen
     *  (ohne den ganzen Edit-Aufbau neu zu bauen — der laufende cpe-Drag bleibt intakt). */
    const refreshPierVisuals = (bridge, lat) => {
        const grid = geoStore.terrain;
        const b = { ...bridge, lattice: lat };
        if (pierMesh) {
            const g = buildPierGeometry(b, grid);
            if (g) { pierMesh.geometry.dispose(); pierMesh.geometry = g; }
        }
        if (pierLineSeg) {
            const pw = buildPierWireframe(b, grid);
            if (pw) {
                pierLineSeg.geometry.dispose();
                const ng = new THREE.BufferGeometry();
                ng.setAttribute('position', new THREE.BufferAttribute(pw, 3));
                pierLineSeg.geometry = ng;
            }
        }
        const idx = bridge3DState.selectedPier;
        if (idx != null) {
            cpe.syncPositions(pierHandlePositions(b, grid, idx).map(h => ({ key: h.key, pos: h.pos })));
            if (pierCenterPlane) {
                const pg = buildPierCenterPlane(b, grid, idx);
                if (pg) { pierCenterPlane.geometry.dispose(); pierCenterPlane.geometry = pg; }
            }
        }
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
        if (hasVertexHeights(bridge)) {
            // Per-Ecke: gewählte Ecken auf dz über dem Rasterlot setzen.
            const vsoffit = bridge.vsoffit.slice(), vdeck = bridge.vdeck.slice();
            for (const key of bridge3DState.selection) {
                const parts = key.split(':');
                if (parts.length !== 2) continue;
                const k = Number(parts[1]);
                const p = bridge.poly[k];
                const terrZ = sampleGridZ(hdr, terrain.gridData, p.x, p.y);
                if (terrZ == null) continue;
                if (parts[0] === 'b') {
                    const z = Math.max(terrZ, terrZ + dz);
                    vsoffit[k] = z;
                    if (vdeck[k] < z + MIN_THICKNESS) vdeck[k] = z + MIN_THICKNESS;
                } else {
                    vdeck[k] = Math.max(terrZ + dz, vsoffit[k] + MIN_THICKNESS, terrZ + MIN_THICKNESS);
                }
            }
            geoStore.updateBridge3D(bridge.id, derivePatchVz(bridge, { vsoffit, vdeck }), 'Punkthöhe über Raster gesetzt');
            setLayerBridgeVisible(bridge.id, false);
            rebuildEditVisuals(bridge, bridge.lattice, terrain);
            return;
        }
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
            case 'PIER':
            case 'SUBDIVIDE':
                bridge3DState.hoverCutU = null;
                bridge3DState.hoverCutV = null;
                clearSubdivideGhost();
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
        // 'S' = Stützpunkt (Kante unterteilen), 'P' = Pfeiler
        keyHandler = (e) => {
            const tag = e.target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
            if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey) startSubdivide();
            if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey) startPier();
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

    /** Pointer auf eine Pfeiler-Box → Pfeiler-Index (oder -1). */
    const raycastPier = (ctx) => {
        const bridge = getBridge();
        if (!pierMesh || !bridge) return -1;
        ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
        const hits = ctx.raycaster.intersectObject(pierMesh, false);
        if (!hits.length) return -1;
        const real = worldToReal(hits[0].point, geoStore.terrain);
        const { u, v } = worldToUV(bridge.lattice, real.x, real.y);
        return pierIndexAt(bridge.lattice, u, v);
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
            if (pt) {
                // Einclipping: Klick in Startnähe schließt das Polygon (wie beim Gebäude).
                if (footprintSnap(pt)) { commitFootprint(); return; }
                bridge3DState.draftPoints.push(pt); rebuildDraft();
            }
            return;
        }

        if (bridge3DState.phase === 'EDIT') {
            const bridge = getBridge();
            if (!bridge) return;

            // 1) Pfeiler-Ecke / Kopfhöhe ziehen (Greifpunkt des selektierten Pfeilers)
            if (bridge3DState.selectedPier != null) {
                const k = cpe.beginDrag(ctx);
                if (k) {
                    const p = bridge.lattice.piers[bridge3DState.selectedPier];
                    const cu = p.poly.reduce((s, c) => s + c.u, 0) / p.poly.length;
                    const cv = p.poly.reduce((s, c) => s + c.v, 0) / p.poly.length;
                    pierDrag = { snap: JSON.parse(JSON.stringify(p)), soffitC: sampleSheet(bridge.lattice, bridge.lattice.bottomZ, cu, cv), next: null };
                    bridge3DState.dragging = true;
                    return;
                }
            }

            // 2) Knoten-Handle oder (leer) Pfeiler selektieren/deselektieren
            const handle = raycastHandles(ctx);
            if (!handle) {
                const pi = raycastPier(ctx);
                const newSel = pi >= 0 ? pi : null;
                if (newSel !== bridge3DState.selectedPier) {
                    bridge3DState.selectedPier = newSel;
                    rebuildEditVisuals(bridge, bridge.lattice, geoStore.terrain);
                }
                return;
            }
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
            dragStartY = hit.y;
            dragStartZ = new Map();
            if (hasVertexHeights(bridge)) {
                // Per-Ecke-Höhen: Arbeitskopie der vsoffit/vdeck-Arrays.
                dragVz = { vsoffit: bridge.vsoffit.slice(), vdeck: bridge.vdeck.slice() };
                dragLattice = null;
                for (const k of bridge3DState.selection) {
                    if (k[0] !== dragSheetKey) continue;
                    const idx = Number(k.split(':')[1]);
                    dragStartZ.set(k, (dragSheetKey === 'b' ? dragVz.vsoffit : dragVz.vdeck)[idx]);
                }
            } else {
                dragVz = null;
                dragLattice = JSON.parse(JSON.stringify(bridge.lattice));
                for (const k of bridge3DState.selection) {
                    if (k[0] !== dragSheetKey) continue;
                    const [, i, j] = k.split(':').map((s, n) => n === 0 ? s : Number(s));
                    const sheet = dragSheetKey === 'b' ? dragLattice.bottomZ : dragLattice.topZ;
                    dragStartZ.set(k, sheet[i][j]);
                }
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
            let cursor = raycastTerrainReal(ctx);
            if (!cursor) { updateFootprintGhost(null); return; }
            // Einrasten am Startpunkt → Rubber-Band + Ghost werden grün (wie Gebäude).
            const snapped = footprintSnap(cursor);
            if (snapped) cursor = { ...pts[0] };
            updateFootprintGhost(cursor, snapped);
            if (pts.length) {
                previewLine = buildPolyline([pts[pts.length - 1], cursor], terrain, snapped ? FP_SNAP : FP_BAND, true);
                if (previewLine) scene_ref.add(previewLine);
            }
            return;
        }

        if (bridge3DState.phase === 'SUBDIVIDE') {
            const real = raycastTerrainReal(ctx);
            if (bridge3DState.subdivideMode === 'free') updateSubdivideFree(real);
            else updateStationGhost(real);
            return;
        }

        if (bridge3DState.phase === 'EDIT') {
            const bridge = getBridge();
            if (!bridge) return;

            // Pfeiler-Box ziehen (generisches Greifpunkt-Modul)
            if (cpe.state.dragging && pierDrag) {
                const dd = cpe.dragDelta(ctx);
                if (dd) applyPierDrag(bridge, dd);
                return;
            }

            // Per-Ecke-Höhen ziehen (vsoffit/vdeck je Polygon-Ecke)
            if (bridge3DState.dragging && dragVz) {
                const hit = new THREE.Vector3();
                ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
                if (!ctx.raycaster.ray.intersectPlane(dragPlane, hit)) return;
                const deltaZ = hit.y - dragStartY;
                const hdr = headerFromTerrain(terrain);
                for (const [k, z0] of dragStartZ) {
                    const idx = Number(k.split(':')[1]);
                    const p = bridge.poly[idx];
                    const terrZ = sampleGridZ(hdr, terrain.gridData, p.x, p.y);
                    if (dragSheetKey === 'b') {
                        let z = Math.min(z0 + deltaZ, dragVz.vdeck[idx] - MIN_THICKNESS);
                        if (terrZ != null && z < terrZ) {
                            z = terrZ;
                            if (dragVz.vdeck[idx] < z + MIN_THICKNESS) dragVz.vdeck[idx] = z + MIN_THICKNESS;
                        }
                        dragVz.vsoffit[idx] = z;
                    } else {
                        let z = Math.max(z0 + deltaZ, dragVz.vsoffit[idx] + MIN_THICKNESS);
                        if (terrZ != null && z < terrZ + MIN_THICKNESS) z = terrZ + MIN_THICKNESS;
                        dragVz.vdeck[idx] = z;
                    }
                }
                const bVz = { ...bridge, vsoffit: dragVz.vsoffit, vdeck: dragVz.vdeck };
                updateEditVisualsFromLattice(bVz, bridge.lattice, terrain);
                updateGuides(bVz, bridge.lattice, terrain);
                return;
            }

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

            // Hover-Highlight (Knoten- + Pfeiler-Box-Greifpunkte)
            const handle = raycastHandles(ctx);
            const key = handle?.userData.handleKey ?? null;
            if (key !== bridge3DState.hoverKey) {
                bridge3DState.hoverKey = key;
                updateHandleAppearance();
            }
            if (bridge3DState.selectedPier != null) cpe.applyHover(cpe.raycast(ctx));
            return;
        }

        if (bridge3DState.phase === 'LOOPCUT' || bridge3DState.phase === 'PIER') {
            const bridge = getBridge();
            if (!bridge || !bodyPreview) return;
            const crossCut = bridge3DState.phase === 'LOOPCUT' && bridge3DState.cutAxis === 'v';
            ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
            const hits = ctx.raycaster.intersectObject(bodyPreview, false);
            if (!hits.length) {
                bridge3DState.hoverCutU = null; bridge3DState.hoverCutV = null;
                bridge3DState.cutInvalid = false;
                showCutPreview(bridge, terrain, null, crossCut ? 'v' : 'u');
                return;
            }
            const real = worldToReal(hits[0].point, terrain);
            const { u, v } = worldToUV(bridge.lattice, real.x, real.y);
            const cs = terrain?.cellsize || 0;
            if (crossCut) {
                bridge3DState.hoverCutV = v;
                bridge3DState.cutInvalid = loopCutBlocked(bridge.lattice, v, 'v', cs);
                showCutPreview(bridge, terrain, v, 'v', bridge3DState.cutInvalid);
            } else {
                bridge3DState.hoverCutU = u;
                bridge3DState.cutInvalid = loopCutBlocked(bridge.lattice, u, 'u', cs);
                showCutPreview(bridge, terrain, u, 'u', bridge3DState.cutInvalid);
            }
        }
    };

    const onMouseUp = () => {
        // Pfeiler-Box-Drag abschließen (generisches Modul)
        if (cpe.state.dragging) {
            cpe.endDrag();
            bridge3DState.dragging = false;
            const bridge = getBridge();
            if (bridge && pierDrag?.next) {
                geoStore.updateBridge3D(bridge.id, derivePatch(bridge, pierDrag.next), 'Pfeiler-Box bearbeitet');
                setLayerBridgeVisible(bridge.id, false);
                rebuildEditVisuals(bridge, pierDrag.next, geoStore.terrain);
            }
            pierDrag = null;
            return;
        }
        if (!bridge3DState.dragging) return;
        bridge3DState.dragging = false;
        const bridge = getBridge();
        if (bridge && dragVz) {
            geoStore.updateBridge3D(bridge.id, derivePatchVz(bridge, dragVz), 'Eckhöhe geändert');
            setLayerBridgeVisible(bridge.id, false);
            rebuildEditVisuals(bridge, bridge.lattice, geoStore.terrain);
        } else if (bridge && dragLattice) {
            geoStore.updateBridge3D(bridge.id, derivePatch(bridge, dragLattice), 'Brückenkörper geformt');
            setLayerBridgeVisible(bridge.id, false);
            rebuildEditVisuals(bridge, dragLattice, geoStore.terrain);
        }
        dragLattice = null;
        dragVz = null;
    };

    const onClick = (ctx) => {
        if (bridge3DState.phase === 'LOOPCUT') { applyLoopCut(); return; }
        if (bridge3DState.phase === 'PIER') { applyPier(); return; }
        if (bridge3DState.phase === 'SUBDIVIDE') {
            if (bridge3DState.subdivideMode === 'free') applySubdivide(ctx);
            else applyStation();
            return;
        }

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
        startEdit, finishEdit, startLoopCut, startCrossCut, startSubdivide, startPier, applyPier,
        deleteCurrent, cancel, undoLastPoint,
        setHeightAboveTerrain,
        setPierTop, subdivideSelectedPier,
    };
}

let _instance = null;
export function getBridge3DToolInstance() {
    if (!_instance) _instance = useBridge3DTool();
    return _instance;
}
