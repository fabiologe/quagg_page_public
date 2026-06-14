/**
 * useFlowStreamlines.js — professionelle, statische Strömungslinien (CFD-Look).
 *
 * Das Geschwindigkeitsfeld {vx,vy} wird INTEGRIERT (RK2, bilineare Interpolation
 * über nasse Zellen) zu zusammenhängenden Stromlinien. Die Verteilung folgt
 * Jobard & Lefer (1997) „evenly-spaced streamlines": neue Linien werden senkrecht
 * im Abstand dSep gesät und enden, sobald sie einer bestehenden zu nahe kommen →
 * gleichmäßig, lückenlos, ohne Clutter.
 *
 * Rendering via Line2 (three/addons): PIXELKONSTANTE, anti-aliaste Breite → scharf
 * bei jedem Zoom/jeder Zellweite (das alte Ribbon war bei cs=1 sub-pixel-dünn).
 * Eingefärbt nach Geschwindigkeit (weiß→gold→rot). Bewusst STATISCH (keine Animation).
 *
 * Konvention wie useFlowArrows: zell-zentriert, top-down. +vx=Ost, +vy=Süd.
 * Grid→Welt: localX = -W/2 + c·cs ; localY = H/2 - r·cs ; (Gruppe um -90° um X).
 */
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { RENDER_ORDER } from '../editor/renderLayers';

const WET_MIN = 0.02;     // m — nur nasse Zellen
const NODATA  = -9000;    // Velocity-NoData-Schwelle
const WIDTH_PX = 2.2;     // Linienbreite in BILDSCHIRM-Pixeln (konstant, AA)

// Farbskala identisch zu useFlowArrows (Konsistenz langsam→schnell).
const C0 = new THREE.Color(0xffffff);
const C1 = new THREE.Color(0xffc400);
const C2 = new THREE.Color(0xff2a00);
function speedColor(t, out) {
  if (t < 0.5) out.copy(C0).lerp(C1, t / 0.5);
  else         out.copy(C1).lerp(C2, (t - 0.5) / 0.5);
  return out;
}

/** @param {() => THREE.Scene} getScene */
export function useFlowStreamlines(getScene) {
  let group = null;
  let mesh = null;
  let material = null;

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

  // bilineare Probe über NASSE Zellen; gibt {vx,vy,speed} oder null (außerhalb/trocken)
  function buildSampler(field, terrain, depthField) {
    const { ncols, nrows } = terrain;
    const { vx, vy } = field;
    return (c, r) => {
      if (c < 0 || r < 0 || c > ncols - 1 || r > nrows - 1) return null;
      const c0 = Math.floor(c), r0 = Math.floor(r);
      const c1 = Math.min(ncols - 1, c0 + 1), r1 = Math.min(nrows - 1, r0 + 1);
      const fc = c - c0, fr = r - r0;
      const idx = [
        [r0 * ncols + c0, (1 - fc) * (1 - fr)],
        [r0 * ncols + c1, fc * (1 - fr)],
        [r1 * ncols + c0, (1 - fc) * fr],
        [r1 * ncols + c1, fc * fr],
      ];
      let sx = 0, sy = 0, wsum = 0;
      for (const [i, w] of idx) {
        if (depthField && !(depthField[i] > WET_MIN)) continue;
        const vxv = vx[i], vyv = vy[i];
        if (!(vxv > NODATA) || !(vyv > NODATA)) continue;
        sx += vxv * w; sy += vyv * w; wsum += w;
      }
      if (wsum <= 1e-6) return null;
      sx /= wsum; sy /= wsum;
      return { vx: sx, vy: sy, speed: Math.hypot(sx, sy) };
    };
  }

  /**
   * @param {{vx:Float32Array,vy:Float32Array}} field zell-zentriertes Vektorfeld
   * @param {object} terrain ncols/nrows/cellsize/minZ/gridData/bounds
   * @param {Float32Array|null} depthField aktuelles Tiefen-Frame
   * @param {number} density 0..1 — höhere Dichte = engere Linien
   */
  function rebuild(field, terrain, depthField, density = 0.6) {
    if (!ensureGroup()) return;
    if (!terrain || !field || !field.vx || !field.vy) { clear(); return; }
    const { ncols, nrows, cellsize, minZ, gridData } = terrain;
    const cs = cellsize || 1;
    const width  = terrain.bounds?.width  ?? (ncols - 1) * cs;
    const height = terrain.bounds?.height ?? (nrows - 1) * cs;
    const sample = buildSampler(field, terrain, depthField);

    // Referenz-Geschwindigkeit (Farb-Normierung) = Max über nasse Zellen
    let sref = 0;
    for (let r = 0; r < nrows; r += 2) for (let c = 0; c < ncols; c += 2) {
      const i = r * ncols + c;
      if (depthField && !(depthField[i] > WET_MIN)) continue;
      const vxv = field.vx[i], vyv = field.vy[i];
      if (!(vxv > NODATA) || !(vyv > NODATA)) continue;
      const s = Math.hypot(vxv, vyv); if (s > sref) sref = s;
    }
    if (!(sref > 0)) sref = 1;

    // Dichte → Trennabstand (Zellen). hohe Dichte = enger.
    const dens = Math.min(1, Math.max(0, density));
    const dSep = Math.max(1.5, 7 - 5.5 * dens);   // Abstand zwischen Linien (Zellen)
    const dTest = dSep * 0.6;                       // Mindestabstand beim Verfolgen
    const hStep = 0.5;                              // Integrationsschritt (Zellen)
    const MAX_STEPS = 2000;                         // je Richtung
    const MIN_PTS = 8;                              // kürzere Linien verwerfen
    const MAX_LINES = 8000;
    const MAX_VERTS = 800000;

    // ── Spatial Hash (Jobard-Lefer): Stützpunkte akzeptierter Linien ───────────
    const hashCell = dSep;                          // Bucket-Kantenlänge (Zellen)
    const hCols = Math.max(1, Math.ceil(ncols / hashCell));
    const hRows = Math.max(1, Math.ceil(nrows / hashCell));
    const buckets = new Array(hCols * hRows);       // [] je Bucket: {c,r}
    const bkey = (c, r) => Math.min(hRows - 1, (r / hashCell) | 0) * hCols
                          + Math.min(hCols - 1, (c / hashCell) | 0);
    const addSample = (c, r) => {
      const k = bkey(c, r);
      (buckets[k] || (buckets[k] = [])).push(c, r);
    };
    // ist (c,r) näher als `dist` an irgendeinem bereits gespeicherten Stützpunkt?
    const tooClose = (c, r, dist) => {
      const d2 = dist * dist;
      const bc = Math.min(hCols - 1, (c / hashCell) | 0);
      const br = Math.min(hRows - 1, (r / hashCell) | 0);
      for (let rr = br - 1; rr <= br + 1; rr++) {
        if (rr < 0 || rr >= hRows) continue;
        for (let cc = bc - 1; cc <= bc + 1; cc++) {
          if (cc < 0 || cc >= hCols) continue;
          const arr = buckets[rr * hCols + cc];
          if (!arr) continue;
          for (let i = 0; i < arr.length; i += 2) {
            const dc = arr[i] - c, dr = arr[i + 1] - r;
            if (dc * dc + dr * dr < d2) return true;
          }
        }
      }
      return false;
    };

    // RK2-Integration ab (c,r) in Richtung dir(+1/-1); stoppt bei bestehender Linie.
    function integrate(c0, r0, dir) {
      const pts = [];
      let c = c0, r = r0;
      for (let s = 0; s < MAX_STEPS; s++) {
        const k1 = sample(c, r);
        if (!k1 || k1.speed < 1e-4) break;
        const inv1 = (hStep * dir) / k1.speed;
        const mc = c + k1.vx * inv1 * 0.5, mr = r + k1.vy * inv1 * 0.5;
        const k2 = sample(mc, mr);
        if (!k2 || k2.speed < 1e-4) { pts.push({ c, r, s: k1.speed }); break; }
        const inv2 = (hStep * dir) / k2.speed;
        const nc = c + k2.vx * inv2, nr = r + k2.vy * inv2;
        pts.push({ c, r, s: k1.speed });
        // zu nah an einer BEREITS akzeptierten Linie → hier enden (sauberer Abstand)
        if (s > 1 && tooClose(nc, nr, dTest)) break;
        // Stillstand (Wirbelkern) → abbrechen, sonst Endlosschleife
        if (Math.abs(nc - c) + Math.abs(nr - r) < 1e-4) break;
        c = nc; r = nr;
      }
      return pts;
    }

    // ── Geometrie-Sammler (Segment-Paare für LineSegments2) ────────────────────
    const positions = [];   // [x1,y1,z1, x2,y2,z2, …]
    const colors = [];      // [r1,g1,b1, r2,g2,b2, …]
    const col = new THREE.Color();
    let lineCount = 0;
    let vertCount = 0;

    const worldZ = (c, r) => {
      const ci = Math.min(ncols - 1, Math.max(0, Math.round(c)));
      const ri = Math.min(nrows - 1, Math.max(0, Math.round(r)));
      const idxT = (nrows - 1 - ri) * ncols + ci;       // gridData ist bottom-up
      const d = depthField ? depthField[ri * ncols + ci] : 0;
      return (gridData[idxT] - minZ) + (d > 0 ? d : 0) + 0.3;
    };
    const toWorld = (p) => ({
      x: -width / 2 + p.c * cs,
      y: height / 2 - p.r * cs,
      z: worldZ(p.c, p.r),
      t: Math.min(1, p.s / sref),
    });

    // Polylinie → Segmentpaare emittieren + Stützpunkte in den Hash
    function emitLine(line) {
      const w = line.map(toWorld);
      for (let i = 0; i < w.length - 1; i++) {
        const a = w[i], b = w[i + 1];
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        speedColor(a.t, col); colors.push(col.r, col.g, col.b);
        speedColor(b.t, col); colors.push(col.r, col.g, col.b);
        vertCount += 2;
      }
      for (const p of line) addSample(p.c, p.r);
      lineCount++;
    }

    // ── Seed-Queue (Jobard-Lefer) ──────────────────────────────────────────────
    // Startseed = schnellste nasse Zelle (markanter Einstieg).
    let seedC = -1, seedR = -1, seedS = -1;
    for (let r = 1; r < nrows - 1; r += 2) for (let c = 1; c < ncols - 1; c += 2) {
      const k = sample(c, r);
      if (k && k.speed > seedS) { seedS = k.speed; seedC = c; seedR = r; }
    }
    if (seedC < 0) { commit(); return; }

    const queue = [[seedC, seedR]];
    let qi = 0;
    // Scan-Cursor: findet nasse, noch UNABGEDECKTE Zellen → garantiert Abdeckung auch
    // für getrennte Wassergebiete (perpendikuläre Saat allein bleibt im zusammenhängenden
    // Stromgebiet). Schrittweite ~dSep, damit der Scan billig bleibt.
    const scanStride = Math.max(1, Math.round(dSep));
    let scanPos = 0;
    const findUncoveredSeed = () => {
      const total = ncols * nrows;
      for (; scanPos < total; scanPos += scanStride) {
        const c = scanPos % ncols, r = (scanPos / ncols) | 0;
        if (r < 1 || r >= nrows - 1 || c < 1 || c >= ncols - 1) continue;
        if (tooClose(c, r, dSep)) continue;
        const k = sample(c, r);
        if (k && k.speed > 1e-3) { scanPos += scanStride; return [c, r]; }
      }
      return null;
    };

    while (lineCount < MAX_LINES && vertCount < MAX_VERTS) {
      let seed;
      if (qi < queue.length) seed = queue[qi++];
      else { seed = findUncoveredSeed(); if (!seed) break; }   // Queue leer → nächste Region
      const [sc, sr] = seed;
      if (tooClose(sc, sr, dSep)) continue;          // Bereich schon abgedeckt
      const k = sample(sc, sr);
      if (!k || k.speed < 1e-3) continue;

      const back = integrate(sc, sr, -1); back.reverse();
      const fwd = integrate(sc, sr, +1);
      const line = back.concat(fwd.slice(1));
      if (line.length < MIN_PTS) continue;

      emitLine(line);

      // Neue Kandidaten-Seeds senkrecht zur Linie (±dSep), entlang ~jedem dSep.
      const stepEvery = Math.max(1, Math.round(dSep / hStep));
      for (let i = 0; i < line.length; i += stepEvery) {
        const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
        let tx = b.c - a.c, ty = b.r - a.r;
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const nx = -ty, ny = tx;                     // Normale
        queue.push([line[i].c + nx * dSep, line[i].r + ny * dSep]);
        queue.push([line[i].c - nx * dSep, line[i].r - ny * dSep]);
      }
    }

    commit();

    // Geometrie/Mesh (neu) aufbauen
    function commit() {
      if (mesh) { group.remove(mesh); mesh.geometry?.dispose(); mesh = null; }
      if (positions.length < 6) return;              // nichts zu zeichnen
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
  }

  function setVisible(v) { if (group) group.visible = v; }
  function clear() {
    if (mesh && group) { group.remove(mesh); mesh.geometry?.dispose(); mesh = null; }
  }
  function dispose() {
    clear();
    if (material) { material.dispose(); material = null; }
    if (group && group.parent) group.parent.remove(group);
    group = null;
  }

  return { rebuild, setVisible, clear, dispose };
}
