// Node-Test für useSectionTool.js: Schacht-Snap UND das Klick-Modell (1. Klick =
// Start, Endpunkt folgt frei der Maus, erst Doppelklick oder confirmDrawing()/Enter
// schließt ab; Escape bricht ab). Simuliert echte Pointer-/Keyboard-Events gegen
// eine echte THREE-Szene (Kamera, Raycaster, Terrain-Mesh) — kein Mock der Snap-
// Mathematik, sondern der volle Pfad getIntersection()→findSnapNode()/finalizeSection().
//
//   node src/features/flood-2D/test/test_section_snap.mjs

import * as THREE from 'three';
import { useSectionTool } from '../composables/useSectionTool.js';

let failed = 0;
const check = (cond, msg) => {
    console.log((cond ? '  ✅ ' : '  ❌ ') + msg);
    if (!cond) failed++;
};

// ── Szene: flaches 100×100-Terrain in der XZ-Ebene (wie im Editor: rotateX -90°) ──
const geo = new THREE.PlaneGeometry(100, 100, 1, 1);
geo.rotateX(-Math.PI / 2);
const terrainMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
const scene = new THREE.Scene();
scene.add(terrainMesh);

// Kamera senkrecht von oben (y=50) auf den Ursprung — vereinfacht die Pixel↔Welt-Zuordnung:
// bei diesem Blickwinkel entspricht die Bildschirmmitte exakt (x=0, z=0).
const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 1000);
camera.position.set(0, 50, 0.0001); // minimal versetzt gegen Gimbal-Lock bei lookAt(0,0,0)
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();

// Fake-DOM: nur getBoundingClientRect wird von useSectionTool.js angefragt.
const RECT = { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 };
const fakeDomElement = { getBoundingClientRect: () => RECT };

// Ein Schacht bei Welt (5, 0, 0) — knapp neben dem Bildschirm-Zentrum.
const SNAP_NODES = [{ id: 'MH1', x: 5, y: 0.5, z: 0 }];

function screenPosOf(worldX, worldY, worldZ) {
    const v = new THREE.Vector3(worldX, worldY, worldZ).project(camera);
    return { clientX: (v.x * 0.5 + 0.5) * RECT.width, clientY: (-v.y * 0.5 + 0.5) * RECT.height };
}

function makeTool(getSnapNodes) {
    let drawing = false;
    const drawnSections = [];
    const tool = useSectionTool({
        scene, camera,
        renderer: { value: { domElement: fakeDomElement } },
        getTerrainMesh: () => terrainMesh,
        getSnapNodes,
        onSectionDrawn: (startPt, endPt) => {
            drawnSections.push({ start: startPt.clone(), end: endPt.clone() });
            return { id: 's1', color: '#ffffff' };
        },
        onDrawStart: () => { drawing = true; },
        onDrawEnd: () => { drawing = false; },
    });
    tool.enable();
    return { tool, drawnSections, isDrawing: () => drawing };
}

// useSectionTool.js hängt seine Listener per `window.addEventListener` an — im
// Node-Kontext (jsdom-frei) gibt es kein `window`. Ein natives `Event` lässt sich
// nicht mit clientX/clientY/target überschreiben (readonly getters), daher: ein
// minimales Fake-`window`, das die Listener selbst verwaltet und sie direkt mit
// einem Plain-Object aufruft (kein echtes DOM-Event nötig — useSectionTool.js
// liest nur .clientX/.clientY/.button/.target/.key).
const listeners = new Map(); // type → Set<fn>
globalThis.window = {
    addEventListener: (type, fn) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => { listeners.get(type)?.delete(fn); },
};

function fire(kind, clientX, clientY, opts = {}) {
    const ev = {
        clientX, clientY,
        button: opts.button ?? 0,
        target: opts.target ?? { tagName: 'CANVAS' },
        preventDefault: () => {},
    };
    for (const fn of (listeners.get(kind) || [])) fn(ev);
}
const click = (x, y, opts) => fire('pointerdown', x, y, opts);
const move = (x, y) => fire('pointermove', x, y);
const dblclick = (x, y) => fire('dblclick', x, y);
const key = (k) => { for (const fn of (listeners.get('keydown') || [])) fn({ key: k }); };

console.log('1) Start-Klick, Endpunkt per Maus positionieren, Doppelklick schließt ab');
{
    const { tool, drawnSections, isDrawing } = makeTool(undefined);
    const startPx = screenPosOf(0, 0, 0);
    click(startPx.clientX, startPx.clientY);
    check(isDrawing(), 'Draft aktiv nach dem ersten Klick');
    const endPx = screenPosOf(10, 0, 0);
    move(endPx.clientX, endPx.clientY);
    dblclick(endPx.clientX, endPx.clientY);
    check(drawnSections.length === 1, 'Schnitt nach Doppelklick gezeichnet');
    check(!isDrawing(), 'Draft nach Abschluss beendet');
    check(Math.abs(drawnSections[0].start.x - 0) < 0.5, `Start nahe Weltursprung (x=${drawnSections[0].start.x.toFixed(2)})`);
    check(Math.abs(drawnSections[0].end.x - 10) < 0.5, `Ende bei x≈10 (x=${drawnSections[0].end.x.toFixed(2)})`);
    tool.disable();
}

console.log('2) Weitere Einzelklicks nach dem Start sind No-ops (schließen NICHT ab)');
{
    const { tool, drawnSections, isDrawing } = makeTool(undefined);
    const startPx = screenPosOf(-20, 0, 0);
    click(startPx.clientX, startPx.clientY);
    const p2 = screenPosOf(0, 0, 0);
    click(p2.clientX, p2.clientY);   // früher: hätte sofort abgeschlossen
    const p3 = screenPosOf(15, 0, 0);
    click(p3.clientX, p3.clientY);   // ebenfalls No-op
    check(drawnSections.length === 0, 'kein Schnitt nach mehreren Einzelklicks gezeichnet');
    check(isDrawing(), 'Draft bleibt aktiv — Endpunkt folgt weiter der Maus');
    tool.disable();
}

console.log('3) Klick nah am Schacht (< 18 px) snappt den START exakt auf dessen Position');
{
    const { tool, drawnSections } = makeTool(() => SNAP_NODES);
    const nodePx = screenPosOf(5, 0.5, 0);
    const nearPx = { x: nodePx.clientX + 6, y: nodePx.clientY + 6 }; // ~8.5 px daneben
    click(nearPx.x, nearPx.y);
    const endPx = screenPosOf(-30, 0, 0);
    dblclick(endPx.clientX, endPx.clientY);
    check(drawnSections.length === 1, 'Schnitt gezeichnet');
    const s = drawnSections[0].start;
    check(Math.abs(s.x - 5) < 1e-3 && Math.abs(s.y - 0.5) < 1e-3 && Math.abs(s.z - 0) < 1e-3,
        `Startpunkt exakt auf Schacht gesnappt (${s.x.toFixed(3)}, ${s.y.toFixed(3)}, ${s.z.toFixed(3)})`);
    tool.disable();
}

console.log('4) Klick weit vom Schacht (> 18 px) trifft normal das Terrain');
{
    const { tool, drawnSections } = makeTool(() => SNAP_NODES);
    const nodePx = screenPosOf(5, 0.5, 0);
    const farFromNode = { x: nodePx.clientX + 60, y: nodePx.clientY };
    click(farFromNode.x, farFromNode.y);
    const endPx = screenPosOf(20, 0, 0);
    dblclick(endPx.clientX, endPx.clientY);
    check(drawnSections.length === 1, 'Schnitt gezeichnet');
    check(Math.abs(drawnSections[0].start.y - 0) < 1e-3,
        `Startpunkt auf Terrain (y≈0), NICHT auf Schacht-Höhe 0.5 (y=${drawnSections[0].start.y.toFixed(3)})`);
    tool.disable();
}

console.log('5) confirmDrawing() (Bestätigen-Button/Enter) übernimmt die letzte Mausposition');
{
    const { tool, drawnSections } = makeTool(() => SNAP_NODES);
    const startPx = screenPosOf(-30, 0, 0);
    click(startPx.clientX, startPx.clientY);
    const hoverNode = screenPosOf(5, 0.5, 0);
    move(hoverNode.clientX, hoverNode.clientY);   // Maus über dem Schacht, kein weiterer Klick
    tool.confirmDrawing();
    check(drawnSections.length === 1, 'Schnitt via confirmDrawing() abgeschlossen');
    const e = drawnSections[0].end;
    check(Math.abs(e.x - 5) < 1e-3 && Math.abs(e.y - 0.5) < 1e-3,
        `Endpunkt aus letzter Hover-Position gesnappt (${e.x.toFixed(3)}, ${e.y.toFixed(3)})`);
    tool.disable();
}

console.log('6) Enter-Taste ruft confirmDrawing() auf');
{
    const { tool, drawnSections } = makeTool(undefined);
    const startPx = screenPosOf(0, 0, 0);
    click(startPx.clientX, startPx.clientY);
    const endPx = screenPosOf(30, 0, 0);
    move(endPx.clientX, endPx.clientY);
    key('Enter');
    check(drawnSections.length === 1, 'Schnitt via Enter-Taste abgeschlossen');
    tool.disable();
}

console.log('7) Escape bricht den Draft ab, ohne einen Schnitt zu zeichnen');
{
    const { tool, drawnSections, isDrawing } = makeTool(undefined);
    const startPx = screenPosOf(0, 0, 0);
    click(startPx.clientX, startPx.clientY);
    check(isDrawing(), 'Draft aktiv');
    key('Escape');
    check(!isDrawing() && drawnSections.length === 0, 'Draft abgebrochen, kein Schnitt gezeichnet');
    tool.disable();
}

console.log('8) Degenerierter Abschluss (Start≈Ende) wird ignoriert statt Nulllinie zu zeichnen');
{
    // Doppelklick als ALLERERSTE Aktion (kein vorheriger separater Klick): der erste
    // Klick des Doppelklicks setzt den Start, der zweite ist ein No-op, das
    // 'dblclick'-Event selbst liegt an derselben Stelle → Start==Ende.
    const { tool, drawnSections, isDrawing } = makeTool(undefined);
    const px = screenPosOf(0, 0, 0);
    click(px.clientX, px.clientY);
    click(px.clientX, px.clientY);
    dblclick(px.clientX, px.clientY);
    check(drawnSections.length === 0, 'kein Nulllängen-Schnitt gezeichnet');
    check(isDrawing(), 'Draft bleibt offen — Nutzer kann normal weiterzeichnen');
    tool.disable();
}

console.log('');
if (failed) { console.log(`❌ SECTION-SNAP: ${failed} Checks fehlgeschlagen`); process.exit(1); }
console.log('✅ SECTION-SNAP BESTANDEN');
