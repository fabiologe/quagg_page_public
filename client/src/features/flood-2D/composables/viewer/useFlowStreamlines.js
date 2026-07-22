/**
 * useFlowStreamlines.js — professionelle, statische Strömungslinien (CFD-Look).
 *
 * Die GENERIERUNG (RK2-Integration + Jobard-Lefer-Verteilung) läuft in einem Web
 * Worker (workers/streamlineWorker.js) — vorher blockierte sie beim Playback jeden
 * Frame den Main-Thread (50–200 ms Ruckler auf großen Rastern). Hier bleibt nur:
 *   • Request-Verwaltung: latest-wins (läuft ein Build, wird nur der NEUESTE
 *     ausstehende Frame nachgereicht — Zwischenframes werden verworfen)
 *   • Terrain/Maske werden dem Worker einmal gecacht übergeben (nicht je Frame)
 *   • Rendering via Line2 (three/addons): PIXELKONSTANTE, anti-aliaste Breite,
 *     eingefärbt nach Geschwindigkeit (weiß→gold→rot), GPU-seitig.
 *
 * Filter im Worker: keine Linien in ~stehendem Wasser (MIN_SPEED) und keine
 * Segmente mit >3 m Vertikal-Sprung (Tiefen-Dorne/Brennkanten).
 *
 * Konvention wie useFlowArrows: zell-zentriert, top-down. +vx=Ost, +vy=Süd.
 *
 * pierGeoms (pierFlowDeflection.buildPierGeometry) und jetGeoms (weirJetFlow.
 * buildJetGeometry) werden wie Terrain/Maske nur bei Änderung an den Worker
 * übertragen; er deflectiert die Linien analytisch im Ring um jeden Pfeiler bzw.
 * überlagert Kontraktion/Freistrahl an Wehr-Durchlässen, statt sie geradeaus laufen
 * zu lassen.
 */
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { RENDER_ORDER } from '../editor/renderLayers';

const WIDTH_PX = 2.2;     // Linienbreite in BILDSCHIRM-Pixeln (konstant, AA)

/**
 * @param {() => THREE.Scene} getScene
 * @param {() => (Uint8Array|null)} [getMask]  Gebäudemaske (top-down, <128 = Gebäude);
 *        eingebrannte Gebäudezellen tragen v≈0 und würden Linien sonst „gegen 0" ziehen.
 * @param {() => Array} [getPierGeoms]  Pfeiler-Geometrie für die analytische Umströmungs-
 *        Deflection im Worker (pierFlowDeflection.buildPierGeometry).
 * @param {() => Array} [getJetGeoms]  Durchlass-Geometrie für die Kontraktions-/Freistrahl-
 *        Überlagerung im Worker (weirJetFlow.buildJetGeometry).
 */
export function useFlowStreamlines(getScene, getMask, getPierGeoms, getJetGeoms) {
  let group = null;
  let mesh = null;
  let material = null;

  let worker = null;
  let busy = false;          // Build im Worker unterwegs?
  let pending = null;        // neuester ausstehender Request (latest-wins)
  let reqId = 0;             // laufende Nummer — nur die Antwort auf den letzten Request zählt
  let sentGridData = null;   // zuletzt an den Worker übertragenes Terrain (Referenz-Vergleich)
  let sentMask = null;
  let sentPierGeoms = null;
  let sentJetGeoms = null;

  function ensureGroup() {
    const scene = getScene();
    if (!scene) return false;
    if (!group) {
      group = new THREE.Group();
      group.rotation.x = -Math.PI / 2;       // gleiche Transform wie Terrain/Arrows
      group.renderOrder = RENDER_ORDER.FLOW_ARROWS;
      scene.add(group);
    }
    if (!material) {
      material = new LineMaterial({
        vertexColors: true,
        worldUnits: false,        // Breite in Pixeln (nicht Welt-Metern) → immer scharf
        linewidth: WIDTH_PX,
        transparent: true,
        opacity: 0.95,
        depthTest: false,         // über (deckendem) Wasser sichtbar — wie Arrows
        dashed: false,
        alphaToCoverage: false,
      });
    }
    return true;
  }

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker(new URL('../../workers/streamlineWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type !== 'lines') return;
      busy = false;
      if (msg.reqId === reqId) commit(msg.positions, msg.colors); // stale Antworten verwerfen
      pump(); // nächster ausstehender Frame (falls währenddessen einer ankam)
    };
    worker.onerror = (err) => {
      console.warn('[FlowStreamlines] Worker-Fehler:', err.message || err);
      busy = false;
    };
    return worker;
  }

  // ausstehenden Request abschicken, sobald der Worker frei ist
  function pump() {
    if (busy || !pending) return;
    const { field, terrain, depthField, density } = pending;
    pending = null;

    const w = ensureWorker();
    // Terrain + Maske nur bei Änderung übertragen (Referenz-Vergleich) — spart das
    // Klonen der 10-MB-gridData bei jedem Frame.
    const mask = (typeof getMask === 'function') ? getMask() : null;
    const pierGeoms = (typeof getPierGeoms === 'function') ? getPierGeoms() : null;
    const jetGeoms = (typeof getJetGeoms === 'function') ? getJetGeoms() : null;
    if (terrain.gridData !== sentGridData || mask !== sentMask || pierGeoms !== sentPierGeoms || jetGeoms !== sentJetGeoms) {
      const { ncols, nrows, cellsize, minZ } = terrain;
      w.postMessage({
        type: 'terrain',
        ncols, nrows,
        cellsize: cellsize || 1,
        minZ: minZ ?? 0,
        width:  terrain.bounds?.width  ?? (ncols - 1) * (cellsize || 1),
        height: terrain.bounds?.height ?? (nrows - 1) * (cellsize || 1),
        gridData: terrain.gridData,
        mask,
        pierGeoms,
        jetGeoms,
      });
      sentGridData = terrain.gridData;
      sentMask = mask;
      sentPierGeoms = pierGeoms;
      sentJetGeoms = jetGeoms;
    }
    busy = true;
    reqId++;
    w.postMessage({ type: 'build', reqId, vx: field.vx, vy: field.vy, depth: depthField, density });
  }

  /**
   * @param {{vx:Float32Array,vy:Float32Array}} field zell-zentriertes Vektorfeld
   * @param {object} terrain ncols/nrows/cellsize/minZ/gridData/bounds
   * @param {Float32Array|null} depthField aktuelles Tiefen-Frame
   * @param {number} density 0..1 — höhere Dichte = engere Linien
   */
  function rebuild(field, terrain, depthField, density = 0.6) {
    if (!ensureGroup()) return;
    if (!terrain || !terrain.gridData || !field || !field.vx || !field.vy) { clear(); return; }
    pending = { field, terrain, depthField, density }; // latest-wins: überschreibt Zwischenframes
    pump();
  }

  // Geometrie/Mesh aus den Worker-Puffern (neu) aufbauen
  function commit(positions, colors) {
    if (!group) return;
    if (mesh) { group.remove(mesh); mesh.geometry?.dispose(); mesh = null; }
    if (!positions || positions.length < 6) return;  // nichts zu zeichnen
    const geom = new LineSegmentsGeometry();
    geom.setPositions(positions);
    geom.setColors(colors);
    mesh = new LineSegments2(geom, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = RENDER_ORDER.FLOW_ARROWS;
    // Pixelbreite braucht die aktuelle Renderer-Auflösung (auch nach Resize).
    mesh.onBeforeRender = (renderer) => {
      const dom = renderer.domElement;
      material.resolution.set(dom.width, dom.height);
    };
    group.add(mesh);
  }

  function setVisible(v) { if (group) group.visible = v; }
  function clear() {
    pending = null;
    reqId++; // laufende Worker-Antwort damit entwerten
    if (mesh && group) { group.remove(mesh); mesh.geometry?.dispose(); mesh = null; }
  }
  function dispose() {
    clear();
    if (worker) { worker.terminate(); worker = null; busy = false; sentGridData = null; sentMask = null; sentPierGeoms = null; sentJetGeoms = null; }
    if (material) { material.dispose(); material = null; }
    if (group && group.parent) group.parent.remove(group);
    group = null;
  }

  return { rebuild, setVisible, clear, dispose };
}
