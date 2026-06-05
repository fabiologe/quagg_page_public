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

// Räumliche Glättung der Tiefe vor dem Z-Displacement (ersetzt das frühere 9-Tap-Box-Blur im
// Vertex-Shader). Ohne sie wird die Wasserhaut in turbulenten Bereichen zackig. 0 = roh, 1 = voll
// geglättet (gleiche Charakteristik wie zuvor: 85 % geglättet).
const SMOOTH_MIX = 0.85;

/**
 * 9-Tap-Box-Blur über das Tiefenfeld (Rand per Clamp-to-Edge, wie die alte DataTexture).
 * @param {Float32Array} raw   top-down, idx = row*ncols+col (deckt sich mit der Vertex-Reihenfolge)
 */
function smoothDepth(raw, ncols, nrows) {
  const out = new Float32Array(raw.length);
  for (let r = 0; r < nrows; r++) {
    const rm = r > 0 ? r - 1 : 0;
    const rp = r < nrows - 1 ? r + 1 : nrows - 1;
    for (let c = 0; c < ncols; c++) {
      const cm = c > 0 ? c - 1 : 0;
      const cp = c < ncols - 1 ? c + 1 : ncols - 1;
      const i = r * ncols + c;
      const sum =
        raw[rm * ncols + cm] + raw[rm * ncols + c] + raw[rm * ncols + cp] +
        raw[r  * ncols + cm] + raw[i]               + raw[r  * ncols + cp] +
        raw[rp * ncols + cm] + raw[rp * ncols + c] + raw[rp * ncols + cp];
      const dAvg = sum / 9.0;
      out[i] = raw[i] + (dAvg - raw[i]) * SMOOTH_MIX; // mix(d0, dAvg, SMOOTH_MIX)
    }
  }
  return out;
}

const waterVertexShader = `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float aDepth;
  varying float vDepth;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vDepth = aDepth;               // Z-Displacement passiert auf der CPU (position.z ist bereits gesetzt)
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const waterFragmentShader = `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  varying float vDepth;
  varying vec2 vUv;
  uniform vec3 uColorShallow;
  uniform vec3 uColorMid;
  uniform vec3 uColorDeep;
  uniform float uMaxDepth;      // Skala für Tiefe/Hazard-Farbe
  uniform float uVelocityMin;   // unteres Ende der Geschwindigkeits-Farbskala
  uniform float uVelocityMax;   // oberes Ende der Geschwindigkeits-Farbskala
  uniform float uLayerMode;     // 0=depth, 1=velocity, 2=max/hazard
  uniform float uOpacity;       // globale Wasser-Deckkraft 0..1
  uniform sampler2D uVelocityMap;

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

      // Deckkraft: globaler Slider, weiche Kante bei sehr dünnem Wasserfilm.
      float aEdge = clamp(vDepth / 0.12, 0.0, 1.0);
      float alpha = mix(0.10, 1.0, clamp(uOpacity, 0.0, 1.0)) * aEdge;
      gl_FragColor = vec4(col, alpha);
  }
`;

/**
 * @param {object} opts
 * @param {() => THREE.Scene} opts.getScene
 * @param {() => THREE.Mesh}  opts.getTerrainMesh  liefert das Terrain-Mesh (Geometrie wird einmalig geklont)
 * @param {object} opts.props  reaktive ResultMap3D-Props (depthData/velocityData/velocityMax/…)
 */
export function useWaterSurface({ getScene, getTerrainMesh, props }) {
  let waterMesh = null;
  let sourceGeo = null;       // Terrain-Geometrie, aus der geklont wurde (Rebuild-Erkennung)
  let baseZ = null;           // Float32Array: Terrainhöhe je Vertex (z-Basis fürs Displacement)
  let depthAttr = null;       // BufferAttribute aDepth (pro Frame aktualisiert)
  let velFallbackTex = null;  // 1x1 Dummy, falls kein Velocity-Frame anliegt

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
    if (waterMesh?.material?.uniforms) {
      waterMesh.material.uniforms.uOpacity.value = props.waterOpacity ?? 0.85;
    }
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

    // Stale Mesh (Terrain wurde neu gebaut) entfernen
    if (waterMesh) {
      scene.remove(waterMesh);
      waterMesh.geometry.dispose();
      waterMesh.material.dispose();
      waterMesh = null;
    }

    const geometry = terrainMesh.geometry.clone(); // identische Unterteilung + ausgestanzte Löcher
    const pos = geometry.attributes.position;
    const N = pos.count;

    // Terrain-Z je Vertex sichern (Basis fürs Displacement)
    baseZ = new Float32Array(N);
    for (let i = 0; i < N; i++) baseZ[i] = pos.getZ(i);

    // Tiefen-Attribut (anfangs trocken)
    const aDepth = new Float32Array(N);
    geometry.setAttribute('aDepth', new THREE.BufferAttribute(aDepth, 1));
    depthAttr = geometry.attributes.aDepth;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uVelocityMap:  { value: buildVelocityTexture() },
        uVelocityMin:  { value: props.velocityMin || 0.0 },
        uVelocityMax:  { value: props.velocityMax || 1.0 },
        uMaxDepth:     { value: props.maxWaterDepth || 1.0 },
        uLayerMode:    { value: props.layerMode ?? 0 },
        uOpacity:      { value: props.waterOpacity ?? 0.85 },
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
    scene.add(waterMesh);
    sourceGeo = terrainMesh.geometry;
    return true;
  }

  /** Neues Tiefen-Frame: nur Z-Attribut + aDepth der bestehenden Plane aktualisieren. */
  function update(depthData) {
    if (!ensureMesh()) return;
    const pos = waterMesh.geometry.attributes.position;
    const N = pos.count;
    const raw = depthData instanceof Float32Array ? depthData : new Float32Array(depthData);
    if (raw.length !== N) {
      console.warn(`[WaterSurface] depth frame length ${raw.length} ≠ vertex count ${N} — skipped.`);
      return;
    }

    // Tiefe räumlich glätten → keine zackige Oberfläche in turbulenten Bereichen
    const { ncols, nrows } = props.terrain;
    const depth = (ncols && nrows && ncols * nrows === N) ? smoothDepth(raw, ncols, nrows) : raw;

    const arr = pos.array;     // [x,y,z, x,y,z, …]
    const dArr = depthAttr.array;
    for (let i = 0; i < N; i++) {
      const d = depth[i];
      dArr[i] = d;
      arr[i * 3 + 2] = baseZ[i] + (d > 0 ? d : 0); // Wasseroberfläche = Terrain + Tiefe
    }
    pos.needsUpdate = true;
    depthAttr.needsUpdate = true;

    // Färbungs-/Skalen-Uniforms mitführen
    const u = waterMesh.material.uniforms;
    if (u.uVelocityMap.value && u.uVelocityMap.value !== velFallbackTex) u.uVelocityMap.value.dispose();
    u.uVelocityMap.value = buildVelocityTexture();
    u.uVelocityMin.value = props.velocityMin || 0.0;
    u.uVelocityMax.value = props.velocityMax || 1.0;
    u.uMaxDepth.value = props.maxWaterDepth || 1.0;
    applyOpacity();

    waterMesh.visible = true;
  }

  function hide() {
    if (waterMesh) waterMesh.visible = false;
  }

  /** Mesh-Referenzen lösen (nach GPU-Purge) → nächster update() klont frisch. */
  function reset() {
    waterMesh = null;
    sourceGeo = null;
    baseZ = null;
    depthAttr = null;
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

  return { update, applyOpacity, hide, reset };
}
