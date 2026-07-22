/**
 * useTerrainLayer.js — Gelände-Mesh + Gebäudemaske des Result-Viewers.
 *
 * Diese Schicht **besitzt** die Gebäudemaske (`buildingMaskArray` + `maskTexture`) und das Terrain-Mesh.
 * Das Terrain-Shader-Material verwendet die Maske selbst (Discard auf Gebäudezellen); die
 * Boundary-Pfeile konsumieren sie über den Accessor `getMask()`. Das Wasser braucht die Maske
 * nicht (seine 2D-Haut klont die bereits gelochte Terrain-Geometrie).
 *
 * Koordinaten/Konventionen unverändert aus ResultMap3D übernommen:
 *  - gridData ist bottom-up (idx = gridRow*ncols+col); Geometrie-Zeilen sind top-down (geomRow).
 *  - Canvas-Maske ist top-down (maskIdx = geomRow*ncols+col); maskTexture.flipY = true.
 *  - Terrain als PlaneGeometry, Mesh um -PI/2 um X rotiert; Höhe z = elev - minZ.
 */
import * as THREE from 'three';
import { RENDER_ORDER } from '../editor/renderLayers';
import { flippedIndex } from '../../utils/gridIndex.js';

const terrainVertexShader = `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float aValid;
  varying float vZ;
  varying float vValid;
  varying vec2 vPlanePos;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vZ = position.z;
    vValid = aValid;
    vPlanePos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const terrainFragmentShader = `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  varying float vZ;
  varying float vValid;
  varying vec2 vPlanePos;
  varying vec2 vUv;
  uniform float uMinZ;
  uniform float uMaxZ;
  uniform vec3 uColorLow;
  uniform vec3 uColorMid;
  uniform vec3 uColorHigh;
  uniform vec2 uBounds;
  uniform float uCellSize;
  uniform sampler2D uBuildingMask;

  void main() {
    // Discard NODATA cells
    if (vValid < 0.5) discard;

    // Discard building cells
    float mask = texture2D(uBuildingMask, vUv).r;
    if (mask < 0.5) discard;

    #include <logdepthbuf_fragment>

    float range = uMaxZ - uMinZ;
    if (range < 0.1) range = 1.0;
    float h = vZ / range;
    vec3 col;
    if (h < 0.2) col = mix(uColorLow, uColorMid, h / 0.2);
    else col = mix(uColorMid, uColorHigh, (h - 0.2) / 0.8);

    // Contour lines
    float contourInterval = 1.0;
    float dist = abs(fract(vZ) - 0.5);
    float lineIntensity = 1.0 - smoothstep(0.45, 0.48, dist);
    col = mix(col, vec3(0.0), lineIntensity * 0.25);

    // Darken slightly for viewer aesthetic
    col *= 0.85;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * @param {object}   opts
 * @param {() => THREE.Scene} opts.getScene
 * @param {object}   opts.geoStore                     liefert buildings.features für die Maske
 */
export function useTerrainLayer({ getScene, geoStore }) {
  let terrainMesh = null;
  let maskTexture = null;
  let buildingMaskArray = null;

  /** Rasterisiert die Gebäude-Footprints in eine top-down Maske (255 = Gelände sichtbar, 0 = Gebäude). */
  function computeMask(terrain) {
    const { ncols, nrows, cellsize, xllcorner, yllcorner } = terrain;

    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(ncols, nrows)
      : document.createElement('canvas');
    if (canvas.style) { canvas.width = ncols; canvas.height = nrows; }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // 1. Maske weiß füllen (255 = sichtbar)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, ncols, nrows);

    // 2. Gebäude schwarz zeichnen (0 = ausgestanzt)
    const features = geoStore.buildings?.features || [];
    if (features.length > 0) {
      ctx.fillStyle = '#000000';
      features.forEach(feature => {
        if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
          const polys = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
          polys.forEach(rings => {
            const outer = rings[0]; // äußerer Ring
            ctx.beginPath();
            outer.forEach((coord, i) => {
              const px = (coord[0] - xllcorner) / cellsize;
              const py = (coord[1] - yllcorner) / cellsize;
              const cy = nrows - py; // Canvas-Y läuft top-down
              if (i === 0) ctx.moveTo(px, cy);
              else ctx.lineTo(px, cy);
            });
            ctx.closePath();
            ctx.fill();
          });
        }
      });
    }

    // 3. Pixeldaten exakt auf Gitterzellen abbilden
    const imgData = ctx.getImageData(0, 0, ncols, nrows);
    buildingMaskArray = new Uint8Array(ncols * nrows);
    for (let i = 0; i < ncols * nrows; i++) {
      buildingMaskArray[i] = imgData.data[i * 4]; // nur Rot-Kanal nötig
    }

    // 4. ThreeJS-Mask-Textur aktualisieren
    if (maskTexture) maskTexture.dispose();
    maskTexture = new THREE.DataTexture(buildingMaskArray, ncols, nrows, THREE.RedFormat, THREE.UnsignedByteType);
    maskTexture.flipY = true; // dreht Canvas-Y zurück auf bottom-up für die WebGL-PlaneGeometry
    maskTexture.needsUpdate = true;
  }

  /** Maske neu berechnen und an das aktive Terrain-Material pushen (Discard auf Gebäudezellen). */
  function regenerateMask(terrain) {
    if (!terrain) return;
    computeMask(terrain);
    if (terrainMesh?.material?.uniforms) {
      terrainMesh.material.uniforms.uBuildingMask = { value: maskTexture };
      terrainMesh.material.needsUpdate = true;
    }
  }

  /**
   * Baut das Terrain-Mesh (inkl. NoData-/Gebäude-Hard-Clipping) und fügt es der Szene hinzu.
   * Gibt die verwendeten `bounds` zurück, damit der Aufrufer Kamera-Fit/Feature-Render orchestrieren kann.
   */
  function build(terrain) {
    const scene = getScene();
    if (!scene) {
      console.warn('[TerrainLayer] build called but scene not ready');
      return null;
    }
    const { ncols, nrows, gridData, minZ, maxZ, cellsize } = terrain;
    console.log('[TerrainLayer] build:', ncols, 'x', nrows, 'minZ:', minZ, 'maxZ:', maxZ);

    // Maske beim Terrain-Build (neu) erzeugen
    regenerateMask(terrain);

    const bounds = terrain.bounds || {
      width: (ncols - 1) * (cellsize || 1),
      height: (nrows - 1) * (cellsize || 1)
    };

    const geometry = new THREE.PlaneGeometry(bounds.width, bounds.height, ncols - 1, nrows - 1);
    const count = geometry.attributes.position.count;

    const validArray = new Float32Array(count);
    const vertexIsValid = new Uint8Array(count); // für Index-Filtering

    for (let i = 0; i < count; i++) {
      const col = i % ncols;
      const geomRow = Math.floor(i / ncols);
      const idx = flippedIndex(geomRow, col, ncols, nrows);

      // Canvas-Y ist top-down wie geomRow → genau dieser Index trifft die Maske
      const maskIdx = geomRow * ncols + col;
      const isBuilding = buildingMaskArray && buildingMaskArray[maskIdx] < 128;

      // Z-Wert-Isolierung: Terrain darf NIEMALS Gebäudehöhen erben
      let zVal = 0;
      let valid = 0.0;
      let isValidPoint = false;

      if (idx >= 0 && idx < gridData.length) {
        const val = gridData[idx];
        // Entkoppelung: nur pure DGM-Werte. Meldet die Maske ein Gebäude (schwarz), wird der Wert
        // als NoData forciert, um kontaminierte +10m-Spikes in gridData zu ignorieren.
        if (val > -9000 && !isBuilding) {
          zVal = val - minZ; // reales DGM
          valid = 1.0;
          isValidPoint = true;
        } else {
          zVal = 0; // NoData oder Gebäude → klammern + fürs Index-Filtering markieren
        }
      }

      geometry.attributes.position.setZ(i, zVal);
      validArray[i] = valid;
      vertexIsValid[i] = isValidPoint ? 1 : 0;
    }

    geometry.setAttribute('aValid', new THREE.BufferAttribute(validArray, 1));

    // --- HARD-CLIPPING (Index-Buffer) --- NoData-Zellen (Gebäude/Ränder) physisch ausstanzen
    const oldIndex = geometry.getIndex();
    const newIndices = [];
    if (oldIndex) {
      for (let i = 0; i < oldIndex.count; i += 3) {
        const a = oldIndex.getX(i);
        const b = oldIndex.getX(i + 1);
        const c = oldIndex.getX(i + 2);
        // Dreieck ausstanzen, wenn auch nur ein Vertex ≤ -9000 ist
        if (vertexIsValid[a] === 1 && vertexIsValid[b] === 1 && vertexIsValid[c] === 1) {
          newIndices.push(a, b, c);
        }
      }
      geometry.setIndex(newIndices);
    }

    // Normals NACH dem Ausstanzen → korrekte Rand-Schatten
    geometry.computeVertexNormals();

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uBuildingMask: { value: maskTexture },
        uMinZ: { value: 0 },
        uMaxZ: { value: maxZ - minZ },
        uColorLow: { value: new THREE.Color(0x2d5f3f) },   // dunkelgrün
        uColorMid: { value: new THREE.Color(0x8b7355) },   // erde
        uColorHigh: { value: new THREE.Color(0xd4c5a9) },  // heller Stein
        uBounds: { value: new THREE.Vector2(bounds.width, bounds.height) },
        uCellSize: { value: cellsize || 1.0 }
      },
      vertexShader: terrainVertexShader,
      fragmentShader: terrainFragmentShader,
      side: THREE.DoubleSide
    });

    if (terrainMesh) {
      scene.remove(terrainMesh);
      terrainMesh.geometry.dispose();
      terrainMesh.material.dispose();
    }

    terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.rotation.x = -Math.PI / 2;
    terrainMesh.renderOrder = RENDER_ORDER.TERRAIN;
    scene.add(terrainMesh);

    console.log('[TerrainLayer] mesh added ✅ bounds:', bounds.width, 'x', bounds.height);
    return { bounds };
  }

  /** Mesh-Referenz lösen (nach GPU-Purge), damit der nächste build() frische Objekte erzeugt. */
  function reset() {
    terrainMesh = null;
    maskTexture = null;
    buildingMaskArray = null;
  }

  return {
    build,
    regenerateMask,
    reset,
    getMesh: () => terrainMesh,
    getMask: () => buildingMaskArray,
  };
}
