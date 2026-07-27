/**
 * useTerrainLayer.js — DGM-Mesh im isybau-3D-Viewer.
 *
 * Getrimmter Port von flood-2D/composables/viewer/useTerrainLayer.js: die
 * Gebäudemasken-Logik (dort für die Flutsimulation nötig) entfällt komplett —
 * isybau hat keine Gebäude-Ebene im 3D-Viewer.
 *
 * Positionierung bewusst von der Geometrie getrennt: Vertex-Z trägt die ROHE
 * Höhe (nicht `elevation-minZ`), Zentrierung/Höhen-Offset/zScale laufen über
 * `mesh.position`/`mesh.scale.z`. Dadurch braucht ein reiner bounds/zScale-
 * Wechsel (Pan, Slider) keine Neu-Triangulierung — nur updateTransform().
 * Nur ein neues terrain-Objekt (neuer Upload) löst build() neu aus.
 *
 * Koordinaten-Konvention identisch zu useSceneBuilder.js (Knoten/Kanten nutzen
 * `x - bounds.centerX`, `-(y - bounds.centerY)`, Höhe `(z - bounds.minZ) * zScale`):
 * dieselbe Transformation wird hier über mesh.position/mesh.scale.z erreicht,
 * damit das DGM exakt unter dem Netz ausgerichtet liegt.
 *
 * Material: eigener Hillshade-Shader statt schlichtem MeshStandardMaterial —
 * eine flache, feste Kunstlicht-Richtung (unabhängig von der normalen Szenen-
 * beleuchtung in useThreeCore.js) macht Böschungen/Gefälle sichtbar, kombiniert
 * mit einer Höhen-Farbrampe (grün→erdbraun→hell, wie das flood-2D-Original).
 * Die Flächennormale wird PRO FRAGMENT aus Screen-Space-Ableitungen der
 * Weltposition (`dFdx`/`dFdy`) berechnet statt aus interpolierten Vertex-
 * Normalen — das bleibt automatisch korrekt unter der nicht-uniformen
 * zScale-Skalierung (mesh.scale.z), ohne eine eigene Normal-Matrix pflegen zu
 * müssen (three.js' eingebautes `normalMatrix` wäre View-Space, hier wird
 * bewusst eine ortsfeste WELT-Richtung gebraucht).
 */
import * as THREE from 'three';
import { flippedIndex } from '../../../utils/gridIndex.js';

const terrainVertexShader = `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying float vZ;
  varying vec3 vWorldPos;
  void main() {
    vZ = position.z;
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const terrainFragmentShader = `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  varying float vZ;
  varying vec3 vWorldPos;
  uniform float uMinZ;
  uniform float uMaxZ;
  uniform vec3 uColorLow;
  uniform vec3 uColorMid;
  uniform vec3 uColorHigh;
  uniform vec3 uLightDir;  // normalisiert, Weltkoordinaten
  uniform float uAmbient;  // Mindest-Helligkeit im Schatten (0..1)

  void main() {
    #include <logdepthbuf_fragment>

    float range = max(uMaxZ - uMinZ, 0.1);
    float h = clamp((vZ - uMinZ) / range, 0.0, 1.0);
    vec3 col;
    if (h < 0.35) col = mix(uColorLow, uColorMid, h / 0.35);
    else col = mix(uColorMid, uColorHigh, (h - 0.35) / 0.65);

    // Flächennormale aus Screen-Space-Ableitungen der Weltposition — robust
    // gegen die nicht-uniforme zScale-Skalierung des Meshs.
    vec3 fdx = dFdx(vWorldPos);
    vec3 fdy = dFdy(vWorldPos);
    vec3 normal = normalize(cross(fdx, fdy));
    if (normal.y < 0.0) normal = -normal; // Gelände zeigt "nach oben"

    float diffuse = max(dot(normal, uLightDir), 0.0);
    float shade = mix(uAmbient, 1.0, diffuse);

    gl_FragColor = vec4(col * shade, 1.0);
  }
`;

// Deckelt die Render-Auflösung unabhängig vom Importer-eigenen Zellbudget
// (xyzTerrainImporter.js MAX_CELLS schützt den Parse-Schritt; dieser Deckel
// schützt den Render-Schritt vor legitim großen, aber für reinen Sichtkontext
// unnötig feinen DGMs, z.B. 0,5m-LIDAR-Kacheln).
const TERRAIN_MAX_CELLS = 250_000;

/** Reduziert ein Raster per Nearest-Stride-Sampling auf max. `maxCells` Zellen. */
function decimateGrid(terrain, maxCells) {
    const { ncols: srcCols, nrows: srcRows, gridData: srcData, cellsize: srcCellsize, xll, yll } = terrain;
    if (srcCols * srcRows <= maxCells) {
        return { gridData: srcData, ncols: srcCols, nrows: srcRows, cellsize: srcCellsize, xll, yll };
    }
    let stride = 1;
    while (Math.ceil(srcCols / stride) * Math.ceil(srcRows / stride) > maxCells) stride++;
    const ncols = Math.ceil(srcCols / stride);
    const nrows = Math.ceil(srcRows / stride);
    const gridData = new Float32Array(ncols * nrows);
    for (let row = 0; row < nrows; row++) {
        const srcRow = Math.min(row * stride, srcRows - 1);
        for (let col = 0; col < ncols; col++) {
            const srcCol = Math.min(col * stride, srcCols - 1);
            gridData[row * ncols + col] = srcData[srcRow * srcCols + srcCol];
        }
    }
    return { gridData, ncols, nrows, cellsize: srcCellsize * stride, xll, yll };
}

export function useTerrainLayer() {
    let mesh = null;
    let gridCenter = null; // { x, y } — Weltkoordinaten-Zentrum des aktuell gebauten Meshs

    function build(scene, terrain, bounds, zScale) {
        clear(scene);
        if (!scene || !terrain || !terrain.gridData || !(terrain.ncols > 0) || !(terrain.nrows > 0)) return;

        const grid = decimateGrid(terrain, TERRAIN_MAX_CELLS);
        const { ncols, nrows, gridData, cellsize, xll, yll } = grid;
        const width = (ncols - 1) * cellsize;
        const height = (nrows - 1) * cellsize;

        const geometry = new THREE.PlaneGeometry(width, height, Math.max(1, ncols - 1), Math.max(1, nrows - 1));
        const count = geometry.attributes.position.count;
        const vertexIsValid = new Uint8Array(count);
        // Fallback-Höhe für ungültige (NODATA-)Vertices: terrain.minZ statt 0 —
        // verhindert eine ausufernde Bounding-Sphere bei DGMs weit über/unter
        // Meereshöhe (die betroffenen Dreiecke werden ohnehin unten ausgestanzt).
        const fallbackZ = Number.isFinite(terrain.minZ) ? terrain.minZ : 0;

        for (let i = 0; i < count; i++) {
            const col = i % ncols;
            const geomRow = Math.floor(i / ncols);
            const idx = flippedIndex(geomRow, col, ncols, nrows);
            let zVal = fallbackZ;
            let isValidPoint = false;
            if (idx >= 0 && idx < gridData.length) {
                const val = gridData[idx];
                if (val > -9000) {
                    zVal = val; // ROH — Offset/Skalierung passiert in updateTransform()
                    isValidPoint = true;
                }
            }
            geometry.attributes.position.setZ(i, zVal);
            vertexIsValid[i] = isValidPoint ? 1 : 0;
        }

        // Hard-Clipping (Index-Buffer): NODATA-Dreiecke physisch ausstanzen,
        // damit keine Zacken/Spikes am Rand gültiger Daten entstehen.
        const oldIndex = geometry.getIndex();
        if (oldIndex) {
            const newIndices = [];
            for (let i = 0; i < oldIndex.count; i += 3) {
                const a = oldIndex.getX(i), b = oldIndex.getX(i + 1), c = oldIndex.getX(i + 2);
                if (vertexIsValid[a] === 1 && vertexIsValid[b] === 1 && vertexIsValid[c] === 1) {
                    newIndices.push(a, b, c);
                }
            }
            geometry.setIndex(newIndices);
        }

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uMinZ: { value: Number.isFinite(terrain.minZ) ? terrain.minZ : 0 },
                uMaxZ: { value: Number.isFinite(terrain.maxZ) ? terrain.maxZ : 1 },
                uColorLow: { value: new THREE.Color(0x2d5f3f) },  // dunkelgrün (Aue/Talgrund)
                uColorMid: { value: new THREE.Color(0x8b7355) },  // erdbraun (Hang)
                uColorHigh: { value: new THREE.Color(0xe8ddc8) }, // heller Stein (Kuppe)
                uLightDir: { value: new THREE.Vector3(-0.4, 0.75, 0.35).normalize() },
                uAmbient: { value: 0.4 },
            },
            vertexShader: terrainVertexShader,
            fragmentShader: terrainFragmentShader,
            side: THREE.DoubleSide,
        });
        mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);

        gridCenter = { x: xll + width / 2, y: yll + height / 2 };
        updateTransform(bounds, zScale);
    }

    /** Billige Neupositionierung (Pan/zScale) ohne Geometrie-Neubau. */
    function updateTransform(bounds, zScale) {
        if (!mesh || !gridCenter) return;
        const zs = Number.isFinite(zScale) ? zScale : 1;
        mesh.position.set(
            gridCenter.x - bounds.centerX,
            -bounds.minZ * zs,
            -(gridCenter.y - bounds.centerY),
        );
        mesh.scale.z = zs;
    }

    function clear(scene) {
        if (mesh) {
            scene?.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
            mesh = null;
        }
        gridCenter = null;
    }

    function dispose() {
        if (mesh) {
            mesh.geometry.dispose();
            mesh.material.dispose();
            mesh = null;
        }
        gridCenter = null;
    }

    return { build, updateTransform, clear, dispose, getMesh: () => mesh };
}
