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
import { zahl, GELAENDE } from '../../../utils/typPalette.js';
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
  uniform float uRelief;   // Streckung der Neigung NUR für die Schattierung

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
    // Neigung für die Schattierung strecken: Kanalnetz-Gelände hat 1–5 % Gefälle,
    // das änderte die Helligkeit um < 1 % — unsichtbar („braune Fläche“, 2026-09-27).
    // Die Geometrie bleibt unverändert, nur das Licht „sieht“ steiler.
    vec3 nRelief = normalize(vec3(normal.x * uRelief, normal.y, normal.z * uRelief));

    float diffuse = max(dot(nRelief, uLightDir), 0.0);
    float shade = mix(uAmbient, 1.0, diffuse);

    gl_FragColor = vec4(col * shade, 1.0);
    // Farben kommen linear an (THREE.Color); ohne Rückwandlung nach sRGB erschien
    // #8b7355 als #422B17 — das ganze Gelände dunkelbraun.
    #include <colorspace_fragment>
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

/**
 * Höhenspanne für die Farbrampe: 5–95-%-Perzentil der Höhen im Netzgebiet (mit Rand),
 * statt Minimum/Maximum der ganzen Kachel — sonst lag das Netz bei einer großen
 * Kachel mit fernen Hügeln in einem einzigen braunen Farbband.
 * @param {{gridData, ncols, nrows, cellsize, xll, yll}} grid  bottom-up (row 0 = Süd)
 * @param {{minX, minY, spanX, spanY}} [bounds]  Netz
 * @returns {{min:number, max:number}}
 */
export function hoehenSpanne(grid, bounds) {
    const { gridData, ncols, nrows, cellsize, xll, yll } = grid;
    const werte = [], alle = [];
    const rand = bounds ? Math.max(50, 0.25 * Math.max(bounds.spanX || 0, bounds.spanY || 0)) : 0;
    const schritt = Math.max(1, Math.floor(Math.sqrt((ncols * nrows) / 40000))); // ≤ ~40 000 Stichproben
    for (let row = 0; row < nrows; row += schritt) {
        const y = yll + row * cellsize;
        for (let col = 0; col < ncols; col += schritt) {
            const v = gridData[row * ncols + col];
            if (!(v > -9000)) continue;
            alle.push(v);
            const x = xll + col * cellsize;
            if (bounds && x >= bounds.minX - rand && x <= bounds.minX + bounds.spanX + rand
                && y >= bounds.minY - rand && y <= bounds.minY + bounds.spanY + rand) werte.push(v);
        }
    }
    const basis = werte.length >= 20 ? werte : alle;
    if (!basis.length) return { min: 0, max: 1 };
    basis.sort((a, b) => a - b);
    const q = (p) => basis[Math.min(basis.length - 1, Math.max(0, Math.round(p * (basis.length - 1))))];
    const min = q(0.05), max = q(0.95);
    return max - min >= 1 ? { min, max } : { min: min - 0.5, max: min + 0.5 };
}

// Licht aus Nordwest, 40° über dem Horizont (üblich für Schummerungen). Welt: +x = Ost,
// Nord = −z (useSceneBuilder: z = −(y − centerY)).
const LICHT_HOEHE = 40 * Math.PI / 180;
const LICHT = new THREE.Vector3(
    -Math.cos(LICHT_HOEHE) / Math.SQRT2, // West
    Math.sin(LICHT_HOEHE),
    -Math.cos(LICHT_HOEHE) / Math.SQRT2, // Nord
);

export function useTerrainLayer() {
    let mesh = null;
    let kantenAn = false; // Dreieckskanten (Schalter „Drahtkörper“)
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

        const spanne = hoehenSpanne(grid, bounds);
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uMinZ: { value: spanne.min },
                uMaxZ: { value: spanne.max },
                uColorLow: { value: new THREE.Color(zahl(GELAENDE.tief)) },  // dunkelgrün (Aue/Talgrund)
                uColorMid: { value: new THREE.Color(zahl(GELAENDE.mitte)) },  // erdbraun (Hang)
                uColorHigh: { value: new THREE.Color(zahl(GELAENDE.hoch)) }, // heller Stein (Kuppe)
                uLightDir: { value: LICHT.clone() },
                // Grundhelligkeit 0,4 und Relief ×4: flaches Gelände bei ~79 %, 3 % Gefälle
                // zum Licht hin/weg ±~5,5 %. Früher 0,6 und ohne Streckung → < 1 % Unterschied.
                // (2026-08: 0,4 ohne Streckung galt als „zu starke Schatten“ an steilen
                // Böschungen — die Streckung sättigt dort, deshalb nicht härter als vorher.)
                uAmbient: { value: 0.4 },
                uRelief: { value: 4.0 },
            },
            vertexShader: terrainVertexShader,
            fragmentShader: terrainFragmentShader,
            side: THREE.DoubleSide,
            // Fläche minimal nach hinten, damit die Dreieckskanten sauber darüber liegen
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
        });
        mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);
        if (kantenAn) kantenAnlegen();

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

    /** Dreieckskanten als Kind des Gelände-Meshs (erbt Drehung, Lage, Überhöhung). */
    function kantenAnlegen() {
        if (!mesh || mesh.userData.kanten) return;
        const linien = new THREE.LineSegments(
            new THREE.WireframeGeometry(mesh.geometry),
            new THREE.LineBasicMaterial({ color: 0x2a241c, transparent: true, opacity: 0.35, depthWrite: false }),
        );
        linien.userData.gelaendeKanten = true;
        mesh.add(linien);
        mesh.userData.kanten = linien;
    }
    function kantenEntfernen() {
        const linien = mesh?.userData.kanten;
        if (!linien) return;
        mesh.remove(linien);
        linien.geometry.dispose();
        linien.material.dispose();
        mesh.userData.kanten = null;
    }
    /** Schalter „Drahtkörper“: zeigt die Dreiecke des Geländes (Neigung je Dreieck ablesbar). */
    function setKanten(an) {
        kantenAn = !!an;
        if (kantenAn) kantenAnlegen(); else kantenEntfernen();
    }

    function clear(scene) {
        if (mesh) {
            kantenEntfernen();
            scene?.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
            mesh = null;
        }
        gridCenter = null;
    }

    function dispose() {
        if (mesh) {
            kantenEntfernen();
            mesh.geometry.dispose();
            mesh.material.dispose();
            mesh = null;
        }
        gridCenter = null;
    }

    return { build, updateTransform, clear, dispose, setKanten, getMesh: () => mesh };
}
