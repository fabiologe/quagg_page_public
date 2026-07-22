import { ref, reactive, watch } from 'vue';
import * as THREE from 'three';
import { saveTerrainPatch } from '../historyBridge.js';
import { useBathymetryStore } from '../../stores/useBathymetryStore.js';
import { flipRow } from '../../utils/gridIndex.js';

// ── Pure helpers ──────────────────────────────────────────────────────────────

const getEffectiveRadius = (radius, cellsize) => {
    const safeCellSize = cellsize || 1.0;
    return Math.max(radius, safeCellSize * 1.2);
};

function pointInPolygon2D(px, py, pts) {
    let inside = false;
    const n = pts.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = pts[i].x, yi = pts[i].y;
        const xj = pts[j].x, yj = pts[j].y;
        if ((yi > py) !== (yj > py)) {
            const xCross = (xj - xi) * (py - yi) / (yj - yi) + xi;
            if (px < xCross) inside = !inside;
        }
    }
    return inside;
}

/**
 * Calculates cells covered by circle/square brush.
 * @param {THREE.Vector3} localPoint - Point in mesh local space.
 */
export const calculateImpact = (localPoint, brushSettings, gridMetadata) => {
    const { cellsize, nrows, ncols } = gridMetadata;
    const { brushShape, radius, width: rectW, height: rectH } = brushSettings;

    const gridWidth  = (ncols - 1) * cellsize;
    const gridHeight = (nrows - 1) * cellsize;

    let boundW, boundH, effectiveR = 0;
    if (brushShape === 'SQUARE') {
        boundW = rectW / 2;
        boundH = rectH / 2;
    } else {
        effectiveR = getEffectiveRadius(radius, cellsize);
        boundW = boundH = effectiveR;
    }

    const offsetX = gridWidth  / 2;
    const offsetY = gridHeight / 2;

    const centerCol = Math.floor((localPoint.x + offsetX + cellsize * 0.5) / cellsize);
    const centerRow = Math.floor((localPoint.y + offsetY + cellsize * 0.5) / cellsize);
    const cellsW = Math.ceil(boundW / cellsize);
    const cellsH = Math.ceil(boundH / cellsize);

    const cMin = Math.max(0, centerCol - cellsW);
    const cMax = Math.min(ncols - 1, centerCol + cellsW);
    const rMin = Math.max(0, centerRow - cellsH);
    const rMax = Math.min(nrows - 1, centerRow + cellsH);

    const rSq = effectiveR * effectiveR;
    const affected = [];

    for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
            const cellX = (c * cellsize) - offsetX + cellsize * 0.5;
            const cellY = (r * cellsize) - offsetY + cellsize * 0.5;
            const dx = Math.abs(cellX - localPoint.x);
            const dy = Math.abs(cellY - localPoint.y);
            const isInside = brushShape === 'SQUARE'
                ? (dx <= boundW && dy <= boundH)
                : (dx * dx + dy * dy) <= rSq;
            if (isInside) affected.push({ col: c, row: r, factor: 1.0 });
        }
    }
    return affected;
};

/**
 * Calculates cells inside a free-form polygon (world-space points).
 * Uses point-in-polygon ray-casting in local mesh space.
 */
export const calculatePolygonImpact = (polygonWorldPts, terrainMesh, gridMetadata) => {
    if (!polygonWorldPts || polygonWorldPts.length < 3 || !terrainMesh) return [];
    const { cellsize, nrows, ncols } = gridMetadata;

    // Convert world pts → local mesh space (terrainMesh has rotation.x = -PI/2)
    const localPts = polygonWorldPts.map(p => terrainMesh.worldToLocal(p.clone()));

    const offsetX = (ncols - 1) * cellsize / 2;
    const offsetY = (nrows - 1) * cellsize / 2;

    // Tight bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of localPts) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }

    const cMin = Math.max(0, Math.floor((minX + offsetX) / cellsize));
    const cMax = Math.min(ncols - 1, Math.ceil((maxX + offsetX) / cellsize));
    const rMin = Math.max(0, Math.floor((minY + offsetY) / cellsize));
    const rMax = Math.min(nrows - 1, Math.ceil((maxY + offsetY) / cellsize));

    const affected = [];
    for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
            const cellX = (c * cellsize) - offsetX + cellsize * 0.5;
            const cellY = (r * cellsize) - offsetY + cellsize * 0.5;
            if (pointInPolygon2D(cellX, cellY, localPts)) {
                affected.push({ col: c, row: r, factor: 1.0 });
            }
        }
    }
    return affected;
};

/**
 * Uniform raise/lower displacement.
 */
export const computeDisplacement = (originalData, affectedCells, mode, intensity, minZ, ncols) => {
    const changes = [];
    const isRaise = mode === 'RAISE';
    const absIntensity = Math.abs(intensity);

    for (const cell of affectedCells) {
        const idx = cell.row * ncols + cell.col;
        if (idx < 0 || idx >= originalData.length) continue;
        let oldZ = originalData[idx];
        if (oldZ < -9000) oldZ = minZ;
        const newZ = isRaise
            ? oldZ + absIntensity * cell.factor
            : oldZ - absIntensity * cell.factor;
        changes.push({ idx, oldZ, newZ });
    }
    return changes;
};

// ── Anchor sub-functions ──────────────────────────────────────────────────────

const _surveyToLocal = (surveyPts, parsedData) => {
    const { ncols, nrows, cellsize, xllcorner, yllcorner } = parsedData;
    const Xcenter = xllcorner + (ncols - 1) * cellsize / 2;
    const Ycenter = yllcorner + (nrows - 1) * cellsize / 2;
    return surveyPts.map(p => ({ lx: p.x - Xcenter, ly: p.y - Ycenter, z: p.z }));
};

const _cellCenter = (col, row, parsedData) => {
    const { cellsize, ncols, nrows } = parsedData;
    return {
        x: col * cellsize - (ncols - 1) * cellsize / 2 + cellsize * 0.5,
        y: row * cellsize - (nrows - 1) * cellsize / 2 + cellsize * 0.5,
    };
};

const _idwZ = (cx, cy, pts, power) => {
    const EPS = 1e-8;
    let wSum = 0, zSum = 0;
    for (const sp of pts) {
        const d2 = (sp.lx - cx) ** 2 + (sp.ly - cy) ** 2;
        if (d2 < EPS) return sp.z;
        const w = 1 / Math.pow(d2, power * 0.5);
        wSum += w; zSum += sp.z * w;
    }
    return wSum > 0 ? zSum / wSum : null;
};

const _anchorNN = (originalData, affectedCells, localSurvey, parsedData) => {
    const { ncols, minZ } = parsedData;
    const changes = [];
    for (const cell of affectedCells) {
        const { x: cx, y: cy } = _cellCenter(cell.col, cell.row, parsedData);
        let bestD = Infinity, nearZ = null;
        for (const sp of localSurvey) {
            const d = (sp.lx - cx) ** 2 + (sp.ly - cy) ** 2;
            if (d < bestD) { bestD = d; nearZ = sp.z; }
        }
        if (nearZ === null) continue;
        const idx = cell.row * ncols + cell.col;
        if (idx < 0 || idx >= originalData.length) continue;
        changes.push({ idx, oldZ: originalData[idx] < -9000 ? minZ : originalData[idx], newZ: nearZ });
    }
    return changes;
};

const _anchorIDW = (originalData, affectedCells, localSurvey, parsedData, power) => {
    const { ncols, minZ } = parsedData;
    const changes = [];
    for (const cell of affectedCells) {
        const { x: cx, y: cy } = _cellCenter(cell.col, cell.row, parsedData);
        const newZ = _idwZ(cx, cy, localSurvey, power);
        if (newZ === null) continue;
        const idx = cell.row * ncols + cell.col;
        if (idx < 0 || idx >= originalData.length) continue;
        changes.push({ idx, oldZ: originalData[idx] < -9000 ? minZ : originalData[idx], newZ });
    }
    return changes;
};

const _anchorGrad = (originalData, affectedCells, localSurvey, parsedData, power) => {
    const { ncols, nrows, cellsize, minZ } = parsedData;
    const offsetX = (ncols - 1) * cellsize / 2;
    const offsetY = (nrows - 1) * cellsize / 2;

    // Compute correction offset at each survey point's nearest raster cell
    const deltaPoints = localSurvey.map(sp => {
        const c = Math.max(0, Math.min(ncols - 1, Math.floor((sp.lx + offsetX) / cellsize)));
        const r = Math.max(0, Math.min(nrows - 1, Math.floor((sp.ly + offsetY) / cellsize)));
        const rasterZ = originalData[r * ncols + c];
        if (rasterZ < -9000) return null;
        return { ...sp, delta: sp.z - rasterZ };
    }).filter(Boolean);

    if (!deltaPoints.length) return _anchorNN(originalData, affectedCells, localSurvey, parsedData);

    const EPS = 1e-8;
    const changes = [];
    for (const cell of affectedCells) {
        const { x: cx, y: cy } = _cellCenter(cell.col, cell.row, parsedData);
        let wSum = 0, dSum = 0;
        for (const sp of deltaPoints) {
            const d2 = (sp.lx - cx) ** 2 + (sp.ly - cy) ** 2;
            const w = d2 < EPS ? 1e10 : 1 / Math.pow(d2, power * 0.5);
            wSum += w; dSum += sp.delta * w;
        }
        if (wSum === 0) continue;
        const idx = cell.row * ncols + cell.col;
        if (idx < 0 || idx >= originalData.length) continue;
        const oldZ = originalData[idx] < -9000 ? minZ : originalData[idx];
        changes.push({ idx, oldZ, newZ: oldZ + dSum / wSum });
    }
    return changes;
};

const _applyEdgeFade = (changes, affectedCells, originalData, fadeWidth, ncols, nrows) => {
    const affectedSet = new Set(affectedCells.map(c => c.row * ncols + c.col));
    return changes.map(change => {
        const row = Math.floor(change.idx / ncols);
        const col = change.idx % ncols;
        let minDist = fadeWidth + 1;
        for (let dr = -fadeWidth; dr <= fadeWidth; dr++) {
            for (let dc = -fadeWidth; dc <= fadeWidth; dc++) {
                const d = Math.sqrt(dr * dr + dc * dc);
                if (d >= minDist) continue;
                const nr = row + dr, nc = col + dc;
                const outside = nr < 0 || nr >= nrows || nc < 0 || nc >= ncols
                    || !affectedSet.has(nr * ncols + nc);
                if (outside) minDist = d;
            }
        }
        if (minDist > fadeWidth) return change;
        const t = minDist / fadeWidth;
        const alpha = t * t * (3 - 2 * t); // smoothstep
        const rawOld = originalData[change.idx];
        if (rawOld < -9000) return change;
        return { ...change, newZ: rawOld + (change.newZ - rawOld) * alpha };
    });
};

/**
 * Anchor mode: adjust affected cells using survey points.
 * options.method    'IDW' | 'NN' | 'GRAD'  (default 'NN')
 * options.edgeFade  boolean                 (default false)
 * options.fadeWidth cells                   (default 3)
 * options.power     IDW exponent            (default 2)
 */
export const computeAnchorDisplacement = (originalData, affectedCells, surveyPts, parsedData, options = {}) => {
    if (!surveyPts || !surveyPts.length || !affectedCells.length) return [];
    const { method = 'NN', edgeFade = false, fadeWidth = 3, power = 2 } = options;
    const localSurvey = _surveyToLocal(surveyPts, parsedData);

    let changes;
    if (method === 'IDW')       changes = _anchorIDW(originalData, affectedCells, localSurvey, parsedData, power);
    else if (method === 'GRAD') changes = _anchorGrad(originalData, affectedCells, localSurvey, parsedData, power);
    else                        changes = _anchorNN(originalData, affectedCells, localSurvey, parsedData);

    if (edgeFade && fadeWidth > 0 && changes.length) {
        changes = _applyEdgeFade(changes, affectedCells, originalData, fadeWidth, parsedData.ncols, parsedData.nrows);
    }
    return changes;
};

const getIntersect = (pointer, raycaster, camera, context) => {
    raycaster.setFromCamera(pointer, camera);
    const intersects = [];
    if (context.scene) {
        const terrain = context.scene.children.find(c => c.userData?.isTerrain);
        if (terrain) raycaster.intersectObject(terrain, false, intersects);
    }
    return intersects.length > 0 ? intersects[0].point : null;
};

// ── Singleton state ───────────────────────────────────────────────────────────

const settings = reactive({
    radius:     5.0,
    width:      10.0,
    height:     10.0,
    intensity:  0.2,
    mode:       'LOWER',        // 'RAISE' | 'LOWER' | 'ANCHOR'
    brushShape: 'CIRCLE',       // 'CIRCLE' | 'SQUARE' | 'POLYGON'
    anchorMethod:    'IDW',     // 'IDW' | 'NN' | 'GRAD'
    anchorEdgeFade:  true,
    anchorFadeWidth: 3,
    idwPower:        2.0,
});

const state            = ref('AIMING');   // 'AIMING' | 'REVIEW'
const pendingChanges   = ref(null);
const polygonPoints    = ref([]);         // THREE.Vector3[] world-space
const isDrawingPolygon = ref(false);

let cursorMesh    = null;
let previewMesh   = null;
let polygonLine   = null;
let closingDash   = null;
let vertexDots    = null;   // Points mesh: one dot per placed polygon vertex
let currentPointer = null;
let contextRef    = null;

// ── Composable ────────────────────────────────────────────────────────────────

export function useShovelTool() {
    const bathyStore = useBathymetryStore();

    // ── Cursor / visuals ──────────────────────────────────────────────────────

    const cursorColor = () => settings.mode === 'ANCHOR' ? 0xf97316 : 0x3498db;

    const createCursor = () => {
        const isSquare = settings.brushShape === 'SQUARE';
        const geometry = isSquare
            ? new THREE.PlaneGeometry(settings.width, settings.height)
            : new THREE.RingGeometry(0, settings.radius, 32);
        const material = new THREE.MeshBasicMaterial({
            color: cursorColor(),
            transparent: true,
            opacity: isSquare ? 0.6 : 0.4,
            side: THREE.DoubleSide,
            wireframe: isSquare,
            depthTest: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.renderOrder = 999;
        mesh.visible = false;
        return mesh;
    };

    const updateCursorGeometry = () => {
        if (!cursorMesh || isDrawingPolygon.value) return;
        cursorMesh.geometry.dispose();
        const isSquare = settings.brushShape === 'SQUARE';
        cursorMesh.geometry = isSquare
            ? new THREE.PlaneGeometry(settings.width, settings.height)
            : new THREE.RingGeometry(0, settings.radius, 32);
        cursorMesh.material.wireframe = isSquare;
        cursorMesh.material.opacity   = isSquare ? 0.6 : 0.4;
        cursorMesh.material.color.set(cursorColor());
    };

    const createPreviewMesh = (changes, context, overrideColor = null) => {
        if (!context.scene || !context.terrainMesh) return;
        if (previewMesh) {
            if (previewMesh.parent) previewMesh.parent.remove(previewMesh);
            else context.scene.remove(previewMesh);
            previewMesh.geometry.dispose();
            previewMesh.material.dispose();
        }

        const { parsedData } = context;
        const { ncols, nrows, cellsize, minZ } = parsedData;
        const offsetX = (ncols - 1) * cellsize / 2;
        const offsetY = (nrows - 1) * cellsize / 2;

        const vertices = [];
        for (const change of changes) {
            const r = Math.floor(change.idx / ncols);
            const c = change.idx % ncols;
            const localX = (c * cellsize) - offsetX + cellsize * 0.5;
            const localY = (r * cellsize) - offsetY + cellsize * 0.5;
            // In review mode: show new Z for raise, old Z for lower/anchor (show what's being touched)
            let visualZ = change.oldZ;
            if (!overrideColor && settings.mode === 'RAISE') visualZ = change.newZ;
            vertices.push(localX, localY, visualZ - minZ + 0.05);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

        let colorCode = overrideColor;
        if (!colorCode) {
            colorCode = settings.mode === 'RAISE'  ? 0x00ff00
                      : settings.mode === 'ANCHOR' ? 0xf97316
                      : 0xff0000;
        }

        const mat = new THREE.PointsMaterial({
            color: colorCode,
            size:  cellsize * 0.8,
            sizeAttenuation: true,
            depthTest: false,
        });
        previewMesh = new THREE.Points(geo, mat);
        previewMesh.renderOrder = 998;
        context.terrainMesh.add(previewMesh);
    };

    const updatePolygonVisuals = (scene) => {
        if (polygonLine) {
            scene.remove(polygonLine);
            polygonLine.geometry.dispose();
            polygonLine.material.dispose();
            polygonLine = null;
        }
        if (closingDash) {
            scene.remove(closingDash);
            closingDash.geometry.dispose();
            closingDash.material.dispose();
            closingDash = null;
        }

        const pts = polygonPoints.value;
        if (!pts.length) return;

        // Open polyline + cursor preview
        const linePts = [...pts];
        if (currentPointer && isDrawingPolygon.value) linePts.push(currentPointer);
        const geo = new THREE.BufferGeometry().setFromPoints(linePts);
        polygonLine = new THREE.Line(geo,
            new THREE.LineBasicMaterial({ color: 0xfbbf24, linewidth: 2, depthTest: false }));
        polygonLine.renderOrder = 997;
        scene.add(polygonLine);

        // Dashed closing preview: cursor → first point (once ≥ 2 pts placed)
        if (pts.length >= 2 && currentPointer) {
            const dashGeo = new THREE.BufferGeometry().setFromPoints([currentPointer, pts[0]]);
            const dashMat = new THREE.LineDashedMaterial({
                color: 0xf97316, dashSize: 1.5, gapSize: 1, linewidth: 1, depthTest: false,
            });
            closingDash = new THREE.Line(dashGeo, dashMat);
            closingDash.computeLineDistances();
            closingDash.renderOrder = 997;
            scene.add(closingDash);
        }
    };

    const clearPolygonVisuals = (scene) => {
        if (!scene) return;
        if (polygonLine) { scene.remove(polygonLine); polygonLine.geometry.dispose(); polygonLine.material.dispose(); polygonLine = null; }
        if (closingDash) { scene.remove(closingDash); closingDash.geometry.dispose(); closingDash.material.dispose(); closingDash = null; }
        if (vertexDots)  { scene.remove(vertexDots);  vertexDots.geometry.dispose();  vertexDots.material.dispose();  vertexDots  = null; }
    };

    // Small screen-space dots at each confirmed polygon vertex (world space, added to scene).
    const updateVertexDots = (scene) => {
        if (vertexDots) { scene.remove(vertexDots); vertexDots.geometry.dispose(); vertexDots.material.dispose(); vertexDots = null; }
        const pts = polygonPoints.value;
        if (!pts.length) return;
        const positions = [];
        for (const p of pts) positions.push(p.x, p.y + 0.25, p.z);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        vertexDots = new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0xfbbf24, size: 6, sizeAttenuation: false, depthTest: false,
        }));
        vertexDots.renderOrder = 999;
        scene.add(vertexDots);
    };

    watch(() => [settings.radius, settings.width, settings.height, settings.brushShape, settings.mode], () => {
        if (state.value === 'REVIEW') return;
        if (settings.brushShape !== 'POLYGON') {
            updateCursorGeometry();
            if (cursorMesh) cursorMesh.visible = true;
            if (contextRef?.scene) clearPolygonVisuals(contextRef.scene);
        } else {
            if (cursorMesh) cursorMesh.visible = false;
        }
    });

    // ── Actions ───────────────────────────────────────────────────────────────

    const closePolygon = () => {
        const pts = polygonPoints.value;
        if (pts.length < 3 || !contextRef) return;
        const { parsedData, terrainMesh, scene } = contextRef;
        if (!parsedData || !terrainMesh) return;

        const affected = calculatePolygonImpact(pts, terrainMesh, parsedData);
        if (!affected.length) return;

        let changes;
        if (settings.mode === 'ANCHOR') {
            changes = computeAnchorDisplacement(
                parsedData.gridData, affected, bathyStore.surveyPoints, parsedData,
                { method: settings.anchorMethod, edgeFade: settings.anchorEdgeFade, fadeWidth: settings.anchorFadeWidth, power: settings.idwPower });
        } else {
            changes = computeDisplacement(
                parsedData.gridData, affected, settings.mode,
                Math.abs(settings.intensity), parsedData.minZ, parsedData.ncols);
        }
        if (!changes.length) return;

        clearPolygonVisuals(scene);
        isDrawingPolygon.value = false;
        pendingChanges.value = changes;
        createPreviewMesh(changes, contextRef);
        state.value = 'REVIEW';
        if (cursorMesh) cursorMesh.visible = false;
    };

    const undoPolygonPoint = () => {
        if (!polygonPoints.value.length) return;
        polygonPoints.value.pop();
        if (contextRef?.scene) {
            updatePolygonVisuals(contextRef.scene);
            updateVertexDots(contextRef.scene);
        }
    };

    const commit = () => {
        if (state.value !== 'REVIEW' || !pendingChanges.value || !contextRef) return;
        const { terrainMesh, parsedData } = contextRef;
        const { gridData, minZ, nrows, ncols } = parsedData;
        const positions = terrainMesh.geometry.attributes.position;

        saveTerrainPatch(pendingChanges.value.map(c => ({ idx: c.idx, oldZ: c.oldZ })));

        let modified = false;
        for (const { idx, newZ } of pendingChanges.value) {
            gridData[idx] = newZ;
            const gridRow = Math.floor(idx / ncols);
            const col     = idx % ncols;
            const geomRow = flipRow(gridRow, nrows);
            const zLocal  = newZ - minZ;
            // Geometry now has (ncols+1)*(nrows+1) vertices with phantom border
            positions.setZ(geomRow * (ncols + 1) + col, zLocal);
            if (col === ncols - 1)  positions.setZ(geomRow * (ncols + 1) + ncols, zLocal);
            if (gridRow === 0)      positions.setZ(nrows * (ncols + 1) + col, zLocal);
            if (col === ncols - 1 && gridRow === 0) positions.setZ(nrows * (ncols + 1) + ncols, zLocal);
            modified = true;
        }

        if (modified) {
            positions.needsUpdate = true;
            terrainMesh.geometry.computeVertexNormals();
        }
        reset();
    };

    const cancel = () => reset();

    const reset = () => {
        if (previewMesh) {
            if (previewMesh.parent) previewMesh.parent.remove(previewMesh);
            else if (contextRef?.scene) contextRef.scene.remove(previewMesh);
            previewMesh.geometry.dispose();
            previewMesh.material.dispose();
            previewMesh = null;
        }
        if (contextRef?.scene) clearPolygonVisuals(contextRef.scene);
        polygonPoints.value    = [];
        isDrawingPolygon.value = false;
        pendingChanges.value   = null;
        state.value            = 'AIMING';
        if (settings.brushShape !== 'POLYGON' && cursorMesh) cursorMesh.visible = true;
    };

    // ── Keyboard shortcuts ────────────────────────────────────────────────────

    const handleGlobalKey = (e) => {
        if (e.key === 'Escape') {
            if (state.value === 'REVIEW') {
                cancel();
            } else if (isDrawingPolygon.value) {
                polygonPoints.value = [];
                isDrawingPolygon.value = false;
                if (contextRef?.scene) clearPolygonVisuals(contextRef.scene);
            }
        }
        if (e.key === 'Enter'     && isDrawingPolygon.value) closePolygon();
        if (e.key === 'Backspace' && isDrawingPolygon.value) undoPolygonPoint();
    };

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    const activate = (scene) => {
        if (!cursorMesh && settings.brushShape !== 'POLYGON') cursorMesh = createCursor();
        if (cursorMesh) scene.add(cursorMesh);
        updateCursorGeometry();
        window.addEventListener('keyup', handleGlobalKey);
    };

    const deactivate = (scene) => {
        reset();
        if (cursorMesh) scene.remove(cursorMesh);
        window.removeEventListener('keyup', handleGlobalKey);
    };

    // ── Mouse events ──────────────────────────────────────────────────────────

    const onMouseDown = ({ event, raycaster, camera, pointer, ...context }) => {
        if (event.button !== 0 || state.value === 'REVIEW') return;
        const point = getIntersect(pointer, raycaster, camera, context);
        if (!point) return;
        contextRef = context;

        if (settings.brushShape === 'POLYGON') {
            isDrawingPolygon.value = true;
            polygonPoints.value.push(point.clone());
            updatePolygonVisuals(context.scene);
            updateVertexDots(context.scene);
            return;
        }

        if (!context.parsedData) return;
        const localPoint = context.terrainMesh
            ? context.terrainMesh.worldToLocal(point.clone())
            : point;

        const affected = calculateImpact(localPoint, settings, context.parsedData);
        if (!affected.length) return;

        let changes;
        if (settings.mode === 'ANCHOR') {
            changes = computeAnchorDisplacement(
                context.parsedData.gridData, affected,
                bathyStore.surveyPoints, context.parsedData,
                { method: settings.anchorMethod, edgeFade: settings.anchorEdgeFade, fadeWidth: settings.anchorFadeWidth, power: settings.idwPower });
        } else {
            changes = computeDisplacement(
                context.parsedData.gridData, affected, settings.mode,
                Math.abs(settings.intensity), context.parsedData.minZ, context.parsedData.ncols);
        }
        if (!changes.length) return;

        pendingChanges.value = changes;
        createPreviewMesh(changes, context);
        state.value = 'REVIEW';
        if (cursorMesh) cursorMesh.visible = false;
    };

    const onMouseUp = () => {};

    const onMove = ({ raycaster, camera, pointer, ...context }) => {
        if (state.value === 'REVIEW') return;
        const point = getIntersect(pointer, raycaster, camera, context);

        if (point) {
            contextRef     = context;
            currentPointer = point;

            if (isDrawingPolygon.value && settings.brushShape === 'POLYGON') {
                updatePolygonVisuals(context.scene);
                // Highlight the single cell under the cursor so clicks feel precise
                if (context.terrainMesh && context.parsedData) {
                    const lp = context.terrainMesh.worldToLocal(point.clone());
                    const { cellsize, ncols, nrows, gridData } = context.parsedData;
                    const offsetX = (ncols - 1) * cellsize / 2;
                    const offsetY = (nrows - 1) * cellsize / 2;
                    const c = Math.floor((lp.x + offsetX) / cellsize);
                    const r = Math.floor((lp.y + offsetY) / cellsize);
                    if (c >= 0 && c < ncols && r >= 0 && r < nrows) {
                        const idx = r * ncols + c;
                        if (idx >= 0 && idx < gridData.length) {
                            const oldZ = gridData[idx];
                            createPreviewMesh([{ idx, oldZ, newZ: oldZ }], context, 0x00ffff);
                        }
                    }
                }
            }

            if (cursorMesh && settings.brushShape !== 'POLYGON') {
                if (context.scene && !context.scene.children.includes(cursorMesh)) {
                    context.scene.add(cursorMesh);
                }
                if (context.parsedData && settings.radius > 0) {
                    const er = getEffectiveRadius(settings.radius, context.parsedData.cellsize);
                    const s  = er / settings.radius;
                    cursorMesh.scale.set(s, s, 1);
                }
                cursorMesh.visible = true;
                cursorMesh.position.copy(point);
                cursorMesh.position.y += 0.2;

                // Live hover highlight (cyan)
                if (context.terrainMesh && context.parsedData) {
                    const localPoint = context.terrainMesh.worldToLocal(point.clone());
                    const affected   = calculateImpact(localPoint, settings, context.parsedData);
                    if (affected.length > 0) {
                        const changes = affected.map(cell => {
                            const idx = cell.row * context.parsedData.ncols + cell.col;
                            if (idx >= 0 && idx < context.parsedData.gridData.length) {
                                const oldZ = context.parsedData.gridData[idx];
                                return { idx, oldZ, newZ: oldZ };
                            }
                            return null;
                        }).filter(Boolean);
                        createPreviewMesh(changes, context, 0x00ffff);
                    }
                }
            }
        } else {
            if (cursorMesh) cursorMesh.visible = false;
            if (previewMesh && state.value !== 'REVIEW') {
                if (previewMesh.parent) previewMesh.parent.remove(previewMesh);
                else if (context.scene) context.scene.remove(previewMesh);
                previewMesh.geometry.dispose();
                previewMesh.material.dispose();
                previewMesh = null;
            }
        }
    };

    return reactive({
        settings,
        state,
        pendingChanges,
        polygonPoints,
        isDrawingPolygon,
        get surveyPointCount() { return bathyStore.surveyPoints.length; },
        activate,
        deactivate,
        onMove,
        onMouseDown,
        onMouseUp,
        commit,
        cancel,
        reset,
        closePolygon,
        undoPolygonPoint,
    });
}
