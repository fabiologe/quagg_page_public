/**
 * useFlowStreamlines.js — animierte Strömungslinien (CFD-Look) als Overlay.
 *
 * Im Gegensatz zu useFlowArrows (lokaler Vektor je Zelle) wird hier das
 * Geschwindigkeitsfeld {vx,vy} INTEGRIERT: gleichmäßig verteilte Startpunkte
 * werden vor- und rückwärts durch das Feld verfolgt (RK2, bilineare
 * Interpolation) → zusammenhängende Stromlinien. Wirbel/Rezirkulation zeigen
 * sich als gekrümmte/geschlossene Linien.
 *
 * Rendering: jede Linie als dünnes Band (Ribbon) in der Wasseroberfläche,
 * eingefärbt nach Geschwindigkeit (weiß→gold→rot). Ein im Shader laufender
 * Helligkeits-Puls wandert flussabwärts (entlang der Bogenlänge) → Richtung
 * und Bewegung werden sichtbar, ohne Geometrie pro Frame neu zu bauen.
 *
 * Konvention wie useFlowArrows: zell-zentriert, top-down. +vx=Ost, +vy=Süd.
 * Grid→Welt: localX = -W/2 + c·cs ; localY = H/2 - r·cs ; (Gruppe um -90° um X).
 */
import * as THREE from 'three';
import { RENDER_ORDER } from '../editor/renderLayers';

const WET_MIN = 0.02;     // m — nur nasse Zellen
const NODATA  = -9000;    // Velocity-NoData-Schwelle
// Konstantes, ruhiges Puls-Tempo (Welt-m/s entlang der Linie). Bewusst NICHT an die
// Strömungsgeschwindigkeit gekoppelt — sonst flackert es. Größer = schneller.
const PULSE_SPEED = 0.3;

// Farbskala identisch zu useFlowArrows (Konsistenz langsam→schnell).
const C0 = new THREE.Color(0xffffff);
const C1 = new THREE.Color(0xffc400);
const C2 = new THREE.Color(0xff2a00);
function speedColor(t, out) {
  if (t < 0.5) out.copy(C0).lerp(C1, t / 0.5);
  else         out.copy(C1).lerp(C2, (t - 0.5) / 0.5);
  return out;
}

const VERT = /* glsl */`
  attribute vec3 aColor;
  attribute float aDist;
  varying vec3 vColor;
  varying float vDist;
  void main() {
    vColor = aColor;
    vDist = aDist;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */`
  precision mediump float;
  uniform float uTime;       // s
  uniform float uWavelength; // Welt-m je Puls-Periode
  uniform float uSpeed;      // m/s Puls-Wandergeschwindigkeit (downstream)
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vDist;
  void main() {
    // Phase entlang der Bogenlänge; -uTime → Puls wandert flussABwärts (+aDist)
    float ph = fract((vDist - uTime * uSpeed) / uWavelength);
    // schmaler, heller "Kometen"-Kopf + sanfter Schweif
    float head = smoothstep(0.0, 0.10, ph) * (1.0 - smoothstep(0.10, 0.40, ph));
    float base = 0.45;
    vec3 col = vColor * (base + 0.95 * head);
    float a = uOpacity * (0.55 + 0.45 * head);
    gl_FragColor = vec4(col, a);
  }
`;

/** @param {() => THREE.Scene} getScene */
export function useFlowStreamlines(getScene) {
  let group = null;
  let mesh = null;
  let material = null;
  let geometry = null;
  const t0 = performance.now();
  const indexArr = [];   // Dreiecks-Indices (je rebuild gefüllt und geleert)

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
      material = new THREE.ShaderMaterial({
        uniforms: {
          uTime:       { value: 0 },
          uWavelength: { value: 12.0 },
          uSpeed:      { value: PULSE_SPEED },
          uOpacity:    { value: 0.95 },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthTest: false,           // über (deckendem) Wasser sichtbar — wie Arrows
        side: THREE.DoubleSide,
      });
    }
    return true;
  }

  // ── Stromlinien-Integration ────────────────────────────────────────────────
  // Arbeitet in GRID-Koordinaten (c=Spalte, r=Zeile top-down). Schrittweite in
  // Zellen → uniforme Welt-Schritte (Gitter ist gleichmäßig).
  function buildField(field, terrain, depthField) {
    const { ncols, nrows } = terrain;
    const { vx, vy } = field;
    // bilineare Probe; gibt {vx,vy,wet,speed} oder null (außerhalb/trocken)
    const sample = (c, r) => {
      if (c < 0 || r < 0 || c > ncols - 1 || r > nrows - 1) return null;
      const c0 = Math.floor(c), r0 = Math.floor(r);
      const c1 = Math.min(ncols - 1, c0 + 1), r1 = Math.min(nrows - 1, r0 + 1);
      const fc = c - c0, fr = r - r0;
      const i00 = r0 * ncols + c0, i10 = r0 * ncols + c1;
      const i01 = r1 * ncols + c0, i11 = r1 * ncols + c1;
      // Nass-Gating: jede beteiligte Zelle muss nass sein
      if (depthField) {
        if (!(depthField[i00] > WET_MIN) || !(depthField[i10] > WET_MIN) ||
            !(depthField[i01] > WET_MIN) || !(depthField[i11] > WET_MIN)) return null;
      }
      const vax = vx[i00], vay = vy[i00];
      if (!(vax > NODATA) || !(vay > NODATA)) return null;
      const lerp2 = (a, b, c2, d, fx, fy) =>
        (a * (1 - fx) + b * fx) * (1 - fy) + (c2 * (1 - fx) + d * fx) * fy;
      const sx = lerp2(vx[i00], vx[i10], vx[i01], vx[i11], fc, fr);
      const sy = lerp2(vy[i00], vy[i10], vy[i01], vy[i11], fc, fr);
      return { vx: sx, vy: sy, speed: Math.hypot(sx, sy) };
    };
    return sample;
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
    const sample = buildField(field, terrain, depthField);

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
    const dSep = Math.max(1.5, 7 - 5.5 * dens);   // Zellen zwischen Linien
    const dTest = dSep * 0.5;                       // Mindestabstand beim Verfolgen
    const hStep = 0.5;                              // Integrationsschritt (Zellen)
    const MAX_STEPS = 1400;                         // je Richtung
    const MIN_PTS = 6;                              // kürzere Linien verwerfen
    const MAX_LINES = 6000;
    const MAX_VERTS = 600000;

    // Belegungsgitter (Auflösung dTest) zur Vermeidung von Linien-Clutter
    const occCols = Math.max(1, Math.ceil(ncols / dTest));
    const occRows = Math.max(1, Math.ceil(nrows / dTest));
    const occ = new Uint8Array(occCols * occRows);
    const occIdx = (c, r) => (Math.min(occRows - 1, (r / dTest) | 0) * occCols
                              + Math.min(occCols - 1, (c / dTest) | 0));

    // RK2-Integration ab (c,r) in Richtung dir(+1 vorwärts / -1 rückwärts)
    function integrate(c0, r0, dir) {
      const pts = [];
      let c = c0, r = r0;
      for (let s = 0; s < MAX_STEPS; s++) {
        const k1 = sample(c, r);
        if (!k1 || k1.speed < 1e-4) break;
        // Schritt-Normale (Gitter): dc=vx, dr=vy (+vy=Süd=+row)
        const inv1 = (hStep * dir) / k1.speed;
        const mc = c + k1.vx * inv1 * 0.5, mr = r + k1.vy * inv1 * 0.5;
        const k2 = sample(mc, mr);
        if (!k2 || k2.speed < 1e-4) { pts.push({ c, r, s: k1.speed }); break; }
        const inv2 = (hStep * dir) / k2.speed;
        const nc = c + k2.vx * inv2, nr = r + k2.vy * inv2;
        pts.push({ c, r, s: k1.speed });
        // Selbst-/Fremdkollision (außer ganz am Anfang)
        if (s > 3 && occ[occIdx(nc, nr)] === 2) break;
        c = nc; r = nr;
      }
      return pts;
    }

    const positions = [];
    const colors = [];
    const dists = [];
    const col = new THREE.Color();
    let lineCount = 0;

    // Welt-Position + Höhe (Wasseroberfläche) einer Grid-Koordinate
    const worldZ = (c, r) => {
      const ci = Math.min(ncols - 1, Math.max(0, Math.round(c)));
      const ri = Math.min(nrows - 1, Math.max(0, Math.round(r)));
      const idxT = (nrows - 1 - ri) * ncols + ci;       // gridData ist bottom-up
      const d = depthField ? depthField[ri * ncols + ci] : 0;
      return (gridData[idxT] - minZ) + (d > 0 ? d : 0) + 0.3;
    };

    // Saat: gejittertes grobes Raster im Abstand ~dSep
    const seedStride = Math.max(1, Math.round(dSep));
    outer:
    for (let r = 1; r < nrows - 1; r += seedStride) {
      for (let c = 1; c < ncols - 1; c += seedStride) {
        if (lineCount >= MAX_LINES || positions.length / 3 >= MAX_VERTS) break outer;
        const jc = c + (Math.random() - 0.5) * seedStride;
        const jr = r + (Math.random() - 0.5) * seedStride;
        const k = sample(jc, jr);
        if (!k || k.speed < 1e-3) continue;
        if (occ[occIdx(jc, jr)]) continue;             // Bereich schon abgedeckt

        const back = integrate(jc, jr, -1);
        const fwd  = integrate(jc, jr, +1);
        back.reverse();
        const line = back.concat(fwd.slice(1));
        if (line.length < MIN_PTS) continue;

        // Abdeckung prüfen: zu viel schon belegt → verwerfen
        let occupied = 0;
        for (const p of line) if (occ[occIdx(p.c, p.r)]) occupied++;
        if (occupied > line.length * 0.4) continue;
        for (const p of line) occ[occIdx(p.c, p.r)] = 2;   // markieren

        // Ribbon bauen (Centerline → zwei Ränder, in XY-Ebene versetzt)
        const halfW = cs * 0.16;
        let arc = 0;
        let pxPrev = null, pyPrev = null;
        const verts = []; // {x,y,z,arc,t}
        for (let i = 0; i < line.length; i++) {
          const p = line[i];
          const x = -width / 2 + p.c * cs;
          const y = height / 2 - p.r * cs;
          const z = worldZ(p.c, p.r);
          if (pxPrev !== null) arc += Math.hypot(x - pxPrev, y - pyPrev);
          pxPrev = x; pyPrev = y;
          verts.push({ x, y, z, arc, t: Math.min(1, p.s / sref) });
        }
        // Ränder + Dreiecke
        for (let i = 0; i < verts.length; i++) {
          const a = verts[i];
          // Tangente aus Nachbarn
          const prev = verts[Math.max(0, i - 1)], next = verts[Math.min(verts.length - 1, i + 1)];
          let tx = next.x - prev.x, ty = next.y - prev.y;
          const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
          const px = -ty * halfW, py = tx * halfW;     // Normale in XY
          speedColor(a.t, col);
          // linker + rechter Randpunkt
          a._L = positions.length / 3;
          positions.push(a.x + px, a.y + py, a.z); colors.push(col.r, col.g, col.b); dists.push(a.arc);
          a._R = positions.length / 3;
          positions.push(a.x - px, a.y - py, a.z); colors.push(col.r, col.g, col.b); dists.push(a.arc);
        }
        lineCount++;
        // Zwei Dreiecke je Segment (Ribbon): L0,R0,L1 / R0,R1,L1
        for (let i = 0; i < verts.length - 1; i++) {
          const L0 = verts[i]._L, R0 = verts[i]._R, L1 = verts[i + 1]._L, R1 = verts[i + 1]._R;
          indexArr.push(L0, R0, L1,  R0, R1, L1);
        }
      }
    }

    // Geometrie (neu) aufbauen
    if (geometry) geometry.dispose();
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aDist', new THREE.Float32BufferAttribute(dists, 1));
    geometry.setIndex(indexArr.slice());
    indexArr.length = 0;

    // Puls-Wellenlänge an Zellgröße koppeln (gut sichtbar, dichteunabhängig)
    material.uniforms.uWavelength.value = Math.max(6, cs * 4);
    // Puls-Tempo bewusst KONSTANT und ruhig (NICHT an die Geschwindigkeit gekoppelt) —
    // die Geschwindigkeit steckt schon in der Farbe; eine flotte Animation flackert nur.
    material.uniforms.uSpeed.value = PULSE_SPEED;

    if (mesh) { group.remove(mesh); mesh = null; }
    mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = RENDER_ORDER.FLOW_ARROWS;
    mesh.onBeforeRender = () => { material.uniforms.uTime.value = (performance.now() - t0) / 1000; };
    group.add(mesh);
  }

  function setVisible(v) { if (group) group.visible = v; }
  function clear() {
    if (mesh && group) { group.remove(mesh); mesh = null; }
    if (geometry) { geometry.dispose(); geometry = null; }
  }
  function dispose() {
    clear();
    if (material) { material.dispose(); material = null; }
    if (group && group.parent) group.parent.remove(group);
    group = null;
  }

  return { rebuild, setVisible, clear, dispose };
}
