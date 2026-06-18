/**
 * useWaterSurface.js — Wasser als reine 2D-Haut über dem Gelände.
 *
 * Architektur (bewusst simpel, GPU trennt Geometrie strikt von Transparenz):
 *  - GENAU EIN persistentes Wasser-Mesh. Seine Geometrie ist ein Klon der Terrain-Geometrie
 *    (identische 157×241-Unterteilung + dieselben ausgestanzten Löcher an Gebäuden/NoData) →
 *    Wasser liegt nie über Gebäude-Footprints, Bauwerke bleiben „harte Blocker".
 *  - Pro Frame wird NUR das Z-Attribut der bestehenden Plane aktualisiert
 *    (z[i] = terrainZ[i] + waterDepth[i]); kein Mesh-Neubau, keine Wände/Box/Volumen.
 *  - Eisenhartes Z-Sorting auf Material-Ebene statt komplexer Geometrie:
 *      Terrain   renderOrder 0, opak,        depthWrite true
 *      Gebäude   renderOrder 5, opak,        depthWrite true   (harte Blocker)
 *      Wasser    renderOrder 20 (zuletzt),   transparent true, depthWrite FALSE, depthTest true
 *    → Wasser wird zuletzt gezeichnet, prüft den Tiefenpuffer (Gebäude/herausragende Bauwerke
 *      blockieren es), schreibt selbst aber nicht hinein (kein z-fighting der Wasserhaut).
 *
 * Die Färbung (Tiefe/Velocity/Hazard) bleibt im Fragment-Shader; Tiefe kommt als Vertex-Attribut
 * `aDepth` (für Discard + Farbe), Velocity weiterhin als Textur.
 */
import { watch } from 'vue';
import * as THREE from 'three';
import { RENDER_ORDER } from '../editor/renderLayers';
import { analyzeDepthSpikes } from '../../utils/depthSpikes';

// Räumliche Glättung der Tiefe vor dem Z-Displacement (ersetzt das frühere 9-Tap-Box-Blur im
// Vertex-Shader). Ohne sie wird die Wasserhaut in turbulenten Bereichen zackig. 0 = roh, 1 = voll
// geglättet (gleiche Charakteristik wie zuvor: 85 % geglättet).
const SMOOTH_MIX = 0.85;

const WET = 0.005; // m — Schwelle „nass" (deckt sich mit dem Fragment-discard)

/**
 * 9-Tap-Box-Blur über das Tiefenfeld, aber NASS-GATED: trockene Zellen bleiben exakt trocken und
 * nasse Zellen mitteln NUR über nasse Nachbarn. So blutet kein Wasser über eine Wehrkante (oder eine
 * beliebige Nass/Trocken-Front) — der Stauspiegel bleibt scharf, keine Phantom-Tiefe hinter der Wand.
 * @param {Float32Array} raw   top-down, idx = row*ncols+col (deckt sich mit der Vertex-Reihenfolge)
 */
function smoothDepth(raw, ncols, nrows) {
  const out = new Float32Array(raw.length);
  for (let r = 0; r < nrows; r++) {
    const rm = r > 0 ? r - 1 : 0;
    const rp = r < nrows - 1 ? r + 1 : nrows - 1;
    for (let c = 0; c < ncols; c++) {
      const i = r * ncols + c;
      const d0 = raw[i];
      if (!(d0 > WET)) { out[i] = d0; continue; } // trocken bleibt trocken

      const cm = c > 0 ? c - 1 : 0;
      const cp = c < ncols - 1 ? c + 1 : ncols - 1;
      let sum = 0, cnt = 0;
      const acc = (v) => { if (v > WET) { sum += v; cnt++; } };
      acc(raw[rm * ncols + cm]); acc(raw[rm * ncols + c]); acc(raw[rm * ncols + cp]);
      acc(raw[r  * ncols + cm]); acc(d0);                  acc(raw[r  * ncols + cp]);
      acc(raw[rp * ncols + cm]); acc(raw[rp * ncols + c]); acc(raw[rp * ncols + cp]);

      const dAvg = cnt > 0 ? sum / cnt : d0; // nur über nasse Nachbarn mitteln
      out[i] = d0 + (dAvg - d0) * SMOOTH_MIX;
    }
  }
  return out;
}

const waterVertexShader = `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float aDepth;
  attribute float aTurb;          // Turbulenz 0..1 (Steilheit Wasserspiegel / Geschwindigkeit)
  varying float vDepth;
  varying float vTurb;
  varying vec2 vUv;
  uniform float uTime;
  void main() {
    vUv = uv;
    vDepth = aDepth;               // Z-Displacement passiert auf der CPU (position.z ist bereits gesetzt)
    vTurb = aTurb;
    vec3 p = position;
    // Sanfte, animierte Wellen NUR in turbulenten/fließenden Zonen (cm-Bereich) — der
    // gestaute Spiegel bleibt im Mittel erhalten, die harte Treppe wird aber bewegt/aufgebrochen.
    float amp = 0.05 * vTurb;
    p.z += amp * (sin(uv.x * 130.0 + uTime * 3.1) + sin(uv.y * 97.0 - uTime * 2.3)) * 0.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const waterFragmentShader = `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  varying float vDepth;
  varying float vTurb;
  varying vec2 vUv;
  uniform vec3 uColorShallow;
  uniform vec3 uColorMid;
  uniform vec3 uColorDeep;
  uniform float uMaxDepth;      // Skala für Tiefe/Hazard-Farbe
  uniform float uVelocityMin;   // unteres Ende der Geschwindigkeits-Farbskala
  uniform float uVelocityMax;   // oberes Ende der Geschwindigkeits-Farbskala
  uniform float uLayerMode;     // 0=depth, 1=velocity, 2=max/hazard
  uniform float uOpacity;       // globale Wasser-Deckkraft 0..1
  uniform float uTime;          // Animationszeit (s) für Gischt
  uniform float uFoam;          // Schaum-Intensität 0..1 (Regler)
  uniform sampler2D uVelocityMap;

  // Wert-Rauschen für animierte Gischt (kein Texture-Bedarf)
  float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
      if (vDepth < 0.005) discard; // trockene Zellen aussparen

      #include <logdepthbuf_fragment>

      vec3 col;
      if (uLayerMode < 0.5) {
          // Mode 0: Wassertiefe — cyan → blau → dunkelblau
          float t = clamp(vDepth / max(uMaxDepth, 0.01), 0.0, 1.0);
          if (t < 0.5) col = mix(uColorShallow, uColorMid, t * 2.0);
          else          col = mix(uColorMid, uColorDeep, (t - 0.5) * 2.0);
      } else if (uLayerMode < 1.5) {
          // Mode 1: Geschwindigkeitsbetrag — lineare Heatmap blau → cyan → gelb → rot
          float vmag = texture2D(uVelocityMap, vUv).r;
          float t = clamp((vmag - uVelocityMin) / max(uVelocityMax - uVelocityMin, 1e-4), 0.0, 1.0);
          vec3 c0 = vec3(0.04, 0.20, 0.70); // langsam: blau
          vec3 c1 = vec3(0.00, 0.75, 1.00); // cyan
          vec3 c2 = vec3(1.00, 0.90, 0.00); // gelb
          vec3 c3 = vec3(0.85, 0.05, 0.05); // schnell: rot
          if (t < 0.3333)      col = mix(c0, c1, t / 0.3333);
          else if (t < 0.6666) col = mix(c1, c2, (t - 0.3333) / 0.3333);
          else                 col = mix(c2, c3, (t - 0.6666) / 0.3334);
      } else {
          // Mode 2: Max-Tiefe / Hazard — weiß → violett → dunkelviolett
          float t = clamp(vDepth / max(uMaxDepth, 0.01), 0.0, 1.0);
          vec3 mLow  = vec3(0.95, 0.85, 1.0);
          vec3 mMid  = vec3(0.6,  0.2,  0.9);
          vec3 mHigh = vec3(0.25, 0.0,  0.5);
          if (t < 0.5) col = mix(mLow,  mMid,  t * 2.0);
          else          col = mix(mMid,  mHigh, (t - 0.5) * 2.0);
      }

      // ── Gischt/Schaum in turbulenten Zonen (Wehr-Anprall, Überfall, Wechselsprung) ──
      // vTurb markiert, WO das Wasser anklatscht/überfällt; zwei gegenläufige, mit uTime
      // scrollende Rauschlagen geben flackernde weiße Gischt → bricht die zackige Kante auf.
      float foam = 0.0;
      float turb = clamp(vTurb, 0.0, 1.0);
      if (turb > 0.02 && uFoam > 0.001) {
          float n = vnoise(vUv * 230.0 + vec2(uTime * 0.7, uTime * 0.45))
                  * vnoise(vUv * 150.0 - vec2(uTime * 0.33, uTime * 0.6));
          foam = smoothstep(0.20, 0.65, turb) * smoothstep(0.32, 0.85, n) * clamp(uFoam, 0.0, 1.0);
          col = mix(col, vec3(1.0), foam); // weiße Gischt
      }

      // Deckkraft: globaler Slider, weiche Kante bei dünnem Film; Schaum deckt stärker
      // (aufgewühlte Oberfläche), daher alpha Richtung 1 ziehen.
      float aEdge = clamp(vDepth / 0.12, 0.0, 1.0);
      float alpha = mix(0.10, 1.0, clamp(uOpacity, 0.0, 1.0)) * mix(aEdge, 1.0, foam);
      gl_FragColor = vec4(col, alpha);
  }
`;

/**
 * Bestimmt die Wehr-Kanten (Vertex-Paare) und teilt den Index in:
 *  - baseIndex: alle Dreiecke OHNE Wehr-Kante (dauerhaft sichtbar; Wasser an Wehren getrennt)
 *  - weirTris:  entfernte Dreiecke je `{ a,b,c, keys:[barrierKey] }` (Brücken-Kandidaten beim Überströmen)
 *  - faceMeta:  Map `barrierKey → { va, vb, crestLocal }` (crestLocal = hc - minZ) für den Überström-Test
 * Nur WEHRE (Brücken sind Durchfluss-Öffnungen und bleiben durchgehend).
 */
function buildWeirCut(geometry, weirs, terrain) {
  const index = geometry.getIndex();
  const fallback = { baseIndex: index ? Array.from(index.array) : null, weirTris: [], faceMeta: new Map() };
  if (!index || !weirs || weirs.length === 0 || !terrain) return fallback;
  const { ncols, nrows, cellsize, xllcorner, yllcorner } = terrain;
  const minZ = terrain.minZ ?? 0;

  const faceMeta = new Map();
  const vIdx = (col, geomRow) => geomRow * ncols + col;
  const key = (a, b) => (a < b ? a * (ncols * nrows) + b : b * (ncols * nrows) + a);

  for (const w of weirs) {
    // Öffnungen/Durchlässe (Orifice, Export-Tag '<dir>B') sind DURCHFLUSS — wie Brücken
    // bleiben sie ungeschnitten, damit das Wasser sichtbar hindurchläuft statt an der
    // Wand abzureißen. Nur echte (sperrende) Wehrflächen werden getrennt.
    if (w.orifice || /B$/.test(w.direction || '')) continue;
    const col = Math.floor((w.x - xllcorner) / cellsize);
    const gridRow = Math.floor((w.y - yllcorner) / cellsize); // bottom-up
    const geomRow = (nrows - 1) - gridRow;                     // top-down (Vertex-Zeile)
    if (col < 0 || col >= ncols || geomRow < 0 || geomRow >= nrows) continue;
    const dir = (w.direction || 'S')[0]; // N/S/E/W, 'F'-Suffix ignorieren
    let nc = col, nr = geomRow;
    if (dir === 'N') nr = geomRow - 1;
    else if (dir === 'S') nr = geomRow + 1;
    else if (dir === 'E') nc = col + 1;
    else if (dir === 'W') nc = col - 1;
    if (nc < 0 || nc >= ncols || nr < 0 || nr >= nrows) continue;
    const va = vIdx(col, geomRow), vb = vIdx(nc, nr);
    const k = key(va, vb);
    if (!faceMeta.has(k)) {
      const crestLocal = (typeof w.hc === 'number' ? w.hc : minZ) - minZ;
      faceMeta.set(k, { va, vb, crestLocal });
    }
  }
  if (faceMeta.size === 0) return fallback;

  const src = index.array;
  const baseIndex = [];
  const weirTris = [];
  for (let t = 0; t < src.length; t += 3) {
    const a = src[t], b = src[t + 1], c = src[t + 2];
    const hit = [];
    const ka = key(a, b), kb = key(b, c), kc = key(c, a);
    if (faceMeta.has(ka)) hit.push(ka);
    if (faceMeta.has(kb)) hit.push(kb);
    if (faceMeta.has(kc)) hit.push(kc);
    if (hit.length === 0) baseIndex.push(a, b, c);
    else weirTris.push({ a, b, c, keys: hit });
  }
  return { baseIndex, weirTris, faceMeta };
}

/**
 * @param {object} opts
 * @param {() => THREE.Scene} opts.getScene
 * @param {() => THREE.Mesh}  opts.getTerrainMesh  liefert das Terrain-Mesh (Geometrie wird einmalig geklont)
 * @param {() => Array}       [opts.getWeirFaces]  liefert die Wehre ({x,y,direction}) für den Mesh-Schnitt
 * @param {object} opts.props  reaktive ResultMap3D-Props (depthData/velocityData/velocityMax/…)
 * @param {(stats:{robustMax:number, flagged:Array, ncols:number, nrows:number})=>void} [opts.onStats]
 *        Callback je Frame: robuster Farb-Deckel + erkannte Instabilitäts-/Gefahrenzellen.
 */
export function useWaterSurface({ getScene, getTerrainMesh, getWeirFaces, props, onStats }) {
  let waterMesh = null;
  let sourceGeo = null;       // Terrain-Geometrie, aus der geklont wurde (Rebuild-Erkennung)
  let baseZ = null;           // Float32Array: Terrainhöhe je Vertex (z-Basis fürs Displacement)
  let depthAttr = null;       // BufferAttribute aDepth (pro Frame aktualisiert)
  let turbAttr = null;        // BufferAttribute aTurb (Turbulenz 0..1 für Gischt/Wellen)
  let turbScratch = null;     // wiederverwendeter Scratch fürs Aufweiten/Glätten der Turbulenz
  let velFallbackTex = null;  // 1x1 Dummy, falls kein Velocity-Frame anliegt
  const clock = new THREE.Clock(); // treibt uTime (Gischt-Animation) im Render-Loop
  // Überström-Lamelle (separates Mesh in Signalfarbe, überbrückt pro Frame überströmte Wehr-Kanten)
  let overtopMesh = null;
  let weirTris = null;        // entfernte Wehr-Dreiecke (Brücken-Kandidaten)
  let faceMeta = null;        // Map barrierKey → { va, vb, crestLocal }

  function getVelFallbackTex() {
    if (!velFallbackTex) {
      velFallbackTex = new THREE.DataTexture(new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType);
      velFallbackTex.needsUpdate = true;
    }
    return velFallbackTex;
  }

  /** Velocity-Textur (Betrag) für die Heatmap erzeugen. */
  function buildVelocityTexture() {
    if (!props.velocityData || !props.terrain) return getVelFallbackTex();
    const { ncols, nrows } = props.terrain;
    const raw = props.velocityData instanceof Float32Array ? props.velocityData : new Float32Array(props.velocityData);
    if (raw.length !== ncols * nrows) return getVelFallbackTex();
    const tex = new THREE.DataTexture(raw, ncols, nrows, THREE.RedFormat, THREE.FloatType);
    tex.flipY = true; // gleiche Konvention wie zuvor
    tex.needsUpdate = true;
    return tex;
  }

  function applyOpacity() {
    const op = props.waterOpacity ?? 0.85;
    if (waterMesh?.material?.uniforms) waterMesh.material.uniforms.uOpacity.value = op;
    if (overtopMesh?.material?.uniforms) overtopMesh.material.uniforms.uOpacity.value = op;
  }

  /**
   * Stellt das persistente Wasser-Mesh sicher (einmaliger Klon der Terrain-Geometrie).
   * Erkennt einen Terrain-Rebuild (neue Geometrie-Identität) und klont dann neu.
   * @returns {boolean} true, wenn ein gültiges Mesh bereitsteht
   */
  function ensureMesh() {
    const scene = getScene();
    const terrainMesh = getTerrainMesh();
    if (!scene || !terrainMesh) return false;
    if (waterMesh && sourceGeo === terrainMesh.geometry) return true;

    // Stale Meshes (Terrain wurde neu gebaut) entfernen
    if (waterMesh) {
      scene.remove(waterMesh);
      waterMesh.geometry.dispose();
      waterMesh.material.dispose();
      waterMesh = null;
    }
    if (overtopMesh) {
      scene.remove(overtopMesh);
      overtopMesh.geometry.dispose();
      // Material wird mit dem Wasser-Mesh geteilt → NICHT separat disposen (sonst doppelt).
      overtopMesh = null;
    }

    const geometry = terrainMesh.geometry.clone(); // identische Unterteilung + ausgestanzte Löcher
    // Wehr-Schnitt vorbereiten: Hauptindex getrennt (baseIndex), Brücken-Dreiecke + Krone separat halten.
    const cut = buildWeirCut(geometry, getWeirFaces?.() || [], props.terrain);
    weirTris = cut.weirTris;
    faceMeta = cut.faceMeta;
    if (cut.baseIndex) geometry.setIndex(cut.baseIndex); // an Wehren getrennt (statisch)
    const pos = geometry.attributes.position;
    const N = pos.count;

    // Terrain-Z je Vertex sichern (Basis fürs Displacement)
    baseZ = new Float32Array(N);
    for (let i = 0; i < N; i++) baseZ[i] = pos.getZ(i);

    // Tiefen-Attribut (anfangs trocken)
    const aDepth = new Float32Array(N);
    geometry.setAttribute('aDepth', new THREE.BufferAttribute(aDepth, 1));
    depthAttr = geometry.attributes.aDepth;

    // Turbulenz-Attribut (anfangs ruhig) — pro Frame aus dem Wasserspiegel-Gradienten gefüllt
    const aTurb = new Float32Array(N);
    geometry.setAttribute('aTurb', new THREE.BufferAttribute(aTurb, 1));
    turbAttr = geometry.attributes.aTurb;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uVelocityMap:  { value: buildVelocityTexture() },
        uVelocityMin:  { value: props.velocityMin || 0.0 },
        uVelocityMax:  { value: props.velocityMax || 1.0 },
        uMaxDepth:     { value: props.maxWaterDepth || 1.0 },
        uLayerMode:    { value: props.layerMode ?? 0 },
        uOpacity:      { value: props.waterOpacity ?? 0.85 },
        uTime:         { value: 0.0 },
        uFoam:         { value: props.foamIntensity ?? 1.0 },
        uColorShallow: { value: new THREE.Color(0x00e5ff) },
        uColorMid:     { value: new THREE.Color(0x0078d7) },
        uColorDeep:    { value: new THREE.Color(0x00008b) },
      },
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,    // prüft, ob ein Bauwerk im Weg ist → herausragende Teile blockieren das Wasser
      depthWrite: false,  // schreibt NICHT in den Tiefenpuffer → kein z-fighting der Wasserhaut
    });

    waterMesh = new THREE.Mesh(geometry, material);
    waterMesh.rotation.x = -Math.PI / 2;       // gleiche Transform wie das Terrain
    waterMesh.renderOrder = RENDER_ORDER.WATER; // wird nach allen festen Bauwerken gezeichnet
    // uTime je gerendertem Bild fortschreiben → animierte Gischt/Wellen laufen auch bei
    // pausiertem Frame-Slider weiter (Animation ≠ Simulationszeit).
    waterMesh.onBeforeRender = () => { material.uniforms.uTime.value = clock.getElapsedTime(); };
    scene.add(waterMesh);
    sourceGeo = terrainMesh.geometry;

    // Überström-Brücke: separates Mesh, das pro Frame die an Wehren entfernten Dreiecke
    // wieder einsetzt, SOBALD dort Wasser durchläuft (Überfall/eingestaut). Es nutzt
    // DASSELBE Wasser-Material (Tiefe/Geschwindigkeits-Färbung, Deckkraft) → die
    // Überström-Fläche fügt sich nahtlos in den umgebenden Wasserkörper ein und folgt
    // der Strömungsfarbe, statt als harte Signal-Bande abzureißen. Braucht daher auch
    // das uv-Attribut (Velocity-Textur).
    if (weirTris && weirTris.length > 0) {
      const cap = weirTris.length * 3; // max. Vertices (alle Brücken-Dreiecke gleichzeitig)
      const og = new THREE.BufferGeometry();
      og.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
      og.setAttribute('aDepth', new THREE.BufferAttribute(new Float32Array(cap), 1));
      og.setAttribute('aTurb', new THREE.BufferAttribute(new Float32Array(cap), 1));
      og.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cap * 2), 2));
      overtopMesh = new THREE.Mesh(og, material); // geteiltes Wasser-Material → nahtlose Färbung
      overtopMesh.rotation.x = -Math.PI / 2;
      overtopMesh.renderOrder = RENDER_ORDER.WATER + 1; // knapp über dem Wasser
      overtopMesh.frustumCulled = false;
      og.setDrawRange(0, 0);
      scene.add(overtopMesh);
    }
    return true;
  }

  /** Füllt die Wehr-Brücke: setzt die geschnittenen Dreiecke wieder ein, sobald dort Wasser
   *  durchläuft — Überfall (eine Seite über Krone) ODER eingestaut (beide Seiten nass). So
   *  schließt sich die Lücke direkt am Wehr; nur ein echter Trocken-Stau bleibt getrennt. */
  function fillOvertop(depth) {
    if (!overtopMesh || !weirTris || weirTris.length === 0 || !faceMeta) return;
    const EPS = 0.02;
    // Aktive Wehr-Kanten ermitteln:
    //  • Überfall:   Oberwasser ≥ Krone  → Wasser stürzt über die Wand
    //  • Eingestaut: BEIDE Seiten nass   → Wasser ist durchgehend, Wand ist überflutet
    // Nur „trocken im Unterwasser + unter Krone" bleibt getrennt (Wand hält das Wasser).
    const over = new Set();
    for (const [k, m] of faceMeta) {
      const da = depth[m.va], db = depth[m.vb];
      const sa = baseZ[m.va] + (da > 0 ? da : 0);
      const sb = baseZ[m.vb] + (db > 0 ? db : 0);
      const overfall = Math.max(sa, sb) >= m.crestLocal - EPS;
      const submerged = da > WET && db > WET;
      if (overfall || submerged) over.add(k);
    }

    const srcPos = waterMesh.geometry.attributes.position.array;
    const srcDep = depthAttr.array;
    const srcUv  = waterMesh.geometry.attributes.uv?.array;
    const srcTurb = turbAttr?.array;
    const opos = overtopMesh.geometry.attributes.position.array;
    const odep = overtopMesh.geometry.attributes.aDepth.array;
    const ouv  = overtopMesh.geometry.attributes.uv.array;
    const oturb = overtopMesh.geometry.attributes.aTurb.array;
    let v = 0;
    for (const tri of weirTris) {
      // Sobald MINDESTENS eine Kante des Dreiecks überströmt ist, wird es eingesetzt;
      // trockene Ecken haben aDepth≈0 und werden im Fragment ausgespart → die Fläche
      // läuft weich Richtung Unterwasser aus, statt hart zu poppen.
      let any = false;
      for (const k of tri.keys) { if (over.has(k)) { any = true; break; } }
      if (!any) continue;
      for (const vi of [tri.a, tri.b, tri.c]) {
        opos[v * 3]     = srcPos[vi * 3];
        opos[v * 3 + 1] = srcPos[vi * 3 + 1];
        opos[v * 3 + 2] = srcPos[vi * 3 + 2];
        odep[v]         = srcDep[vi];
        // Überfall ist per se aufgewühlt → Turbulenz mind. 0.6, damit dort Gischt schäumt.
        oturb[v]        = Math.max(0.6, srcTurb ? srcTurb[vi] : 0.6);
        if (srcUv) { ouv[v * 2] = srcUv[vi * 2]; ouv[v * 2 + 1] = srcUv[vi * 2 + 1]; }
        v++;
      }
    }
    overtopMesh.geometry.attributes.position.needsUpdate = true;
    overtopMesh.geometry.attributes.aDepth.needsUpdate = true;
    overtopMesh.geometry.attributes.aTurb.needsUpdate = true;
    overtopMesh.geometry.attributes.uv.needsUpdate = true;
    overtopMesh.geometry.setDrawRange(0, v);
    overtopMesh.visible = v > 0;
  }

  /** Neues Tiefen-Frame: nur Z-Attribut + aDepth der bestehenden Plane aktualisieren. */
  function update(depthData) {
    if (!ensureMesh()) return;
    const pos = waterMesh.geometry.attributes.position;
    const N = pos.count;
    let raw = depthData instanceof Float32Array ? depthData : new Float32Array(depthData);
    if (raw.length !== N) {
      console.warn(`[WaterSurface] depth frame length ${raw.length} ≠ vertex count ${N} — skipped.`);
      return;
    }

    // Solver-Ausreißer abfangen: NaN/Inf/negative Tiefen würden Vertices
    // unkontrolliert verschieben → als trocken (0) behandeln.
    // Kopie nur, wenn tatsächlich etwas Ungültiges gefunden wird.
    let sanitized = false;
    for (let i = 0; i < N; i++) {
      const d = raw[i];
      if (!Number.isFinite(d) || d < 0) {
        if (!sanitized) { raw = raw.slice(); sanitized = true; }
        raw[i] = 0;
      }
    }

    // Numerische Tiefen-Dorne (Solver-Instabilität: 10-m-Nadel in flacher Umgebung)
    // für die ANZEIGE kappen + robusten Farb-Deckel bestimmen. Rohwerte (raw) bleiben
    // erhalten — Probe/Tooltip zeigen weiter den echten Wert; die Stellen werden via
    // onStats als Gefahrenmarker gemeldet, damit die Info nicht verloren geht.
    const { ncols, nrows } = props.terrain;
    // Nur auf echten Tiefen-/Höhen-Layern kappen+markieren; sonst nur robuster Deckel.
    const spikes = analyzeDepthSpikes(raw, ncols, nrows, { flag: props.detectSpikes !== false });
    if (onStats) onStats({ robustMax: spikes.robustMax, flagged: spikes.flagged, ncols, nrows });
    const clamped = spikes.display;

    // Tiefe räumlich glätten → keine zackige Oberfläche in turbulenten Bereichen
    const depth = (ncols && nrows && ncols * nrows === N) ? smoothDepth(clamped, ncols, nrows) : clamped;

    const arr = pos.array;     // [x,y,z, x,y,z, …]
    const dArr = depthAttr.array;
    const haveDims = ncols && nrows && ncols * nrows === N;
    for (let i = 0; i < N; i++) {
      const d = depth[i];
      dArr[i] = d;
      if (d > WET) {
        arr[i * 3 + 2] = baseZ[i] + d; // nasse Zelle: Wasseroberfläche = Terrain + Tiefe
      } else if (haveDims) {
        // Trockene Zelle: auf den HÖCHSTEN nassen Nachbar-Wasserspiegel anheben (kein „Vorhang");
        // der trockene Teil wird im Fragment via vDepth-discard ohnehin ausgespart.
        const col = i % ncols;
        const row = (i - col) / ncols;
        let s = -Infinity;
        if (col > 0          && depth[i - 1]     > WET) s = Math.max(s, baseZ[i - 1]     + depth[i - 1]);
        if (col < ncols - 1  && depth[i + 1]     > WET) s = Math.max(s, baseZ[i + 1]     + depth[i + 1]);
        if (row > 0          && depth[i - ncols] > WET) s = Math.max(s, baseZ[i - ncols] + depth[i - ncols]);
        if (row < nrows - 1  && depth[i + ncols] > WET) s = Math.max(s, baseZ[i + ncols] + depth[i + ncols]);
        arr[i * 3 + 2] = (s > -Infinity) ? s : baseZ[i];
      } else {
        arr[i * 3 + 2] = baseZ[i];
      }
    }
    pos.needsUpdate = true;
    depthAttr.needsUpdate = true;

    // ── Turbulenz je Vertex (treibt Gischt + Wellen im Shader) ──────────────────
    // Maß: Steilheit des Wasserspiegels gegen NASSE Nachbarn (Stau an der Wand,
    // Wechselsprung) — genau dort, wo das Wasser „anklatscht". Ruhige Teiche/Ufer haben
    // ~gleiches Niveau → kein Gradient → kein Schaum. Schnelles Wasser (falls Velocity-
    // Frame anliegt) schäumt zusätzlich. Trockene Zellen bleiben 0.
    const tArr = turbAttr.array;
    const vel = (props.velocityData instanceof Float32Array && props.velocityData.length === N)
      ? props.velocityData : null;
    const TURB_DZ = 0.25; // m Spiegel-Sprung zum Nachbarn → volle Gradient-Turbulenz
    const TURB_V = 1.5;   // m/s → volle Velocity-Turbulenz
    if (!turbScratch || turbScratch.length !== N) turbScratch = new Float32Array(N);
    const rawTurb = turbScratch;
    for (let i = 0; i < N; i++) {
      const d = depth[i];
      if (!(d > WET)) { rawTurb[i] = 0; continue; }
      let turb = 0;
      if (haveDims) {
        const wsp = baseZ[i] + d;
        const col = i % ncols, row = (i - col) / ncols;
        let g = 0;
        if (col > 0         && depth[i - 1]     > WET) g = Math.max(g, Math.abs(wsp - (baseZ[i - 1]     + depth[i - 1])));
        if (col < ncols - 1 && depth[i + 1]     > WET) g = Math.max(g, Math.abs(wsp - (baseZ[i + 1]     + depth[i + 1])));
        if (row > 0         && depth[i - ncols] > WET) g = Math.max(g, Math.abs(wsp - (baseZ[i - ncols] + depth[i - ncols])));
        if (row < nrows - 1 && depth[i + ncols] > WET) g = Math.max(g, Math.abs(wsp - (baseZ[i + ncols] + depth[i + ncols])));
        turb = Math.min(1, g / TURB_DZ);
      }
      if (vel) {
        const vt = Math.min(1, vel[i] / TURB_V);
        turb = Math.max(turb, vt * vt); // schnelles Wasser schäumt
      }
      rawTurb[i] = turb;
    }
    // Turbulenz räumlich aufweiten + glätten (nass-gated, 8-connected): Dilatation hält die
    // Spitze direkt an der Wehrkante, die Mittelung verbreitert das Schaumband auf ~3 Zellen
    // und nimmt der harten 1-Zellen-Linie das Zackige.
    if (haveDims) {
      for (let r = 0; r < nrows; r++) {
        for (let c = 0; c < ncols; c++) {
          const i = r * ncols + c;
          if (!(depth[i] > WET)) { tArr[i] = 0; continue; }
          let s = rawTurb[i], mx = rawTurb[i], cnt = 1;
          for (let dr = -1; dr <= 1; dr++) {
            const rr = r + dr; if (rr < 0 || rr >= nrows) continue;
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const cc = c + dc; if (cc < 0 || cc >= ncols) continue;
              const j = rr * ncols + cc;
              if (!(depth[j] > WET)) continue;
              s += rawTurb[j]; if (rawTurb[j] > mx) mx = rawTurb[j]; cnt++;
            }
          }
          tArr[i] = 0.5 * mx + 0.5 * (s / cnt); // Dilatation (Spitze) + Glättung (weiche Kante)
        }
      }
    } else {
      tArr.set(rawTurb);
    }
    turbAttr.needsUpdate = true;

    // Färbungs-/Skalen-Uniforms mitführen
    const u = waterMesh.material.uniforms;
    if (u.uVelocityMap.value && u.uVelocityMap.value !== velFallbackTex) u.uVelocityMap.value.dispose();
    u.uVelocityMap.value = buildVelocityTexture();
    u.uVelocityMin.value = props.velocityMin || 0.0;
    u.uVelocityMax.value = props.velocityMax || 1.0;
    // Bei erkannten Dornen die Farbskala auf den robusten Deckel legen (sonst staucht
    // ein 10-m-Ausreißer alles auf Blau). Ohne Funde: bisheriges Verhalten beibehalten.
    u.uMaxDepth.value = spikes.flagged.length ? spikes.robustMax : (props.maxWaterDepth || 1.0);
    applyOpacity();

    waterMesh.visible = true;
    fillOvertop(depth); // Überström-Lamelle (Signalfarbe) aktualisieren
  }

  function hide() {
    if (waterMesh) waterMesh.visible = false;
    if (overtopMesh) overtopMesh.visible = false;
  }

  /** Mesh-Referenzen lösen (nach GPU-Purge) → nächster update() klont frisch. */
  function reset() {
    waterMesh = null;
    overtopMesh = null;
    weirTris = null;
    faceMeta = null;
    sourceGeo = null;
    baseZ = null;
    depthAttr = null;
    turbAttr = null;
  }

  /** Erzwingt beim nächsten update() einen Neuaufbau (Re-Clone + Wehr-Schnitt) — z. B. wenn Wehre
   *  erst nach dem ersten Wasser-Frame hydratisiert werden. */
  function invalidate() {
    sourceGeo = null;
    if (props.depthData && props.terrain) update(props.depthData);
  }

  // --- Watcher ---
  watch(() => props.depthData, (data) => {
    if (data && props.terrain) update(data);
    else hide();
  });

  watch(() => props.maxWaterDepth, (newMax) => {
    if (waterMesh?.material?.uniforms) waterMesh.material.uniforms.uMaxDepth.value = newMax;
  });

  watch(() => props.layerMode, (mode) => {
    if (waterMesh?.material?.uniforms?.uLayerMode) waterMesh.material.uniforms.uLayerMode.value = mode ?? 0;
  });

  watch([() => props.velocityData, () => props.velocityMin, () => props.velocityMax], () => {
    const u = waterMesh?.material?.uniforms;
    if (!u) return;
    if (u.uVelocityMap.value && u.uVelocityMap.value !== velFallbackTex) u.uVelocityMap.value.dispose();
    u.uVelocityMap.value = buildVelocityTexture();
    u.uVelocityMin.value = props.velocityMin || 0.0;
    u.uVelocityMax.value = props.velocityMax || 1.0;
  });

  watch(() => props.waterOpacity, () => applyOpacity());

  return { update, applyOpacity, hide, reset, invalidate };
}
