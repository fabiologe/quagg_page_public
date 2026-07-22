import { reactive } from 'vue';
import * as THREE from 'three';
import { useGeoStore } from '../../stores/useGeoStore.js';
import { useBathymetryStore } from '../../stores/useBathymetryStore.js';
import { calculateImpact } from './useShovelTool.js';
import { saveTerrainPatch } from '../historyBridge.js';
import { flippedIndex } from '../../utils/gridIndex.js';

// ── Singleton settings (shared with BathymetryModal UI) ──────────────────────
export const bathyBrushSettings = reactive({
    radius:       10,   // brush radius [m]
    searchRadius: 30,   // IDW search radius [m]
    power:         2,   // IDW distance exponent
    minPoints:     2,   // minimum neighbours required to interpolate
    maxPoints:     0,   // K-nearest limit (0 = no limit, use all in radius)
    nugget:        0.1, // smoothing offset [m] added to distance → avoids bullseye artefacts
    zClamp:       true, // clamp IDW result to max of surrounding unmodified DGM cells
});

let cursorMesh   = null;
let isPainting   = false;
const currentStroke = new Map(); // idx → oldZ for the current drag

// ── IDW (exported so BathymetryModal can reuse it) ────────────────────────────
/**
 * Computes IDW at (realX, realY) using surveyPoints and current bathyBrushSettings.
 * Returns null when fewer than minPoints neighbours are found within searchRadius.
 *
 * @param {number} realX
 * @param {number} realY
 * @param {Array<{x:number,y:number,z:number}>} surveyPoints
 * @returns {number|null}
 */
export function computeIDW(realX, realY, surveyPoints) {
    const r2max   = bathyBrushSettings.searchRadius ** 2;
    const nugget2 = bathyBrushSettings.nugget ** 2;

    // Gather all candidates within search radius
    const candidates = [];
    for (const p of surveyPoints) {
        const d2 = (p.x - realX) ** 2 + (p.y - realY) ** 2;
        if (d2 > r2max) continue;
        if (d2 < 1e-10) return p.z;  // exact hit — return point Z directly
        candidates.push({ z: p.z, d2 });
    }

    if (candidates.length < bathyBrushSettings.minPoints) return null;

    // K-nearest: keep only the closest maxPoints candidates
    const k = bathyBrushSettings.maxPoints;
    if (k > 0 && candidates.length > k) {
        candidates.sort((a, b) => a.d2 - b.d2);
        candidates.length = k;
    }

    let wSum = 0, zSum = 0;
    for (const { z, d2 } of candidates) {
        const w = 1 / (d2 + nugget2) ** (bathyBrushSettings.power / 2);
        zSum += w * z;
        wSum += w;
    }
    return wSum > 0 ? zSum / wSum : null;
}

// ── Z-Clamp helper ────────────────────────────────────────────────────────────
// Returns the maximum Z of unmodified, valid DGM cells in a W-cell window around (row,col).
// Returns +Infinity when no such neighbour exists (= no clamp should be applied).
function maxUnmodifiedNeighbour(row, col, gridData, ncols, nrows, modifiedCells, W = 2) {
    let maxZ = -Infinity;
    for (let dr = -W; dr <= W; dr++) {
        for (let dc = -W; dc <= W; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr, nc = col + dc;
            if (nr < 0 || nr >= nrows || nc < 0 || nc >= ncols) continue;
            const ni = nr * ncols + nc;
            if (gridData[ni] > -9000 && !modifiedCells.has(ni)) {
                if (gridData[ni] > maxZ) maxZ = gridData[ni];
            }
        }
    }
    return maxZ;
}

// ── Paint one stroke at current cursor position ───────────────────────────────
function paint(ctx, bathyStore) {
    const { terrainMesh, parsedData, raycaster, camera, pointer } = ctx;
    if (!terrainMesh || !parsedData || !bathyStore.surveyPoints.length) return;

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(terrainMesh, false);
    if (!hits.length) return;

    const localPt = terrainMesh.worldToLocal(hits[0].point.clone());
    const { gridData, ncols, nrows, cellsize, minZ } = parsedData;
    const xll = parsedData.xllcorner ?? 0;
    const yll = parsedData.yllcorner ?? 0;

    const cells = calculateImpact(
        localPt,
        { brushShape: 'CIRCLE', radius: bathyBrushSettings.radius },
        { cellsize, nrows, ncols },
    );

    const positions = terrainMesh.geometry.attributes.position;
    let changed = false;

    for (const { col, row } of cells) {
        const idx = row * ncols + col;
        if (idx < 0 || idx >= gridData.length) continue;

        const realX = xll + col * cellsize + cellsize / 2;
        const realY = yll + row * cellsize + cellsize / 2;
        let newZ = computeIDW(realX, realY, bathyStore.surveyPoints);
        if (newZ === null) continue;

        // Z-Clamp: result can't exceed the natural surrounding terrain
        if (bathyBrushSettings.zClamp) {
            const maxN = maxUnmodifiedNeighbour(row, col, gridData, ncols, nrows, bathyStore.modifiedCells);
            if (maxN > -Infinity && newZ > maxN) newZ = maxN;
        }

        if (!currentStroke.has(idx)) currentStroke.set(idx, gridData[idx]);
        gridData[idx] = newZ;
        bathyStore.markCell(idx);

        // Top-down vertex index
        const vIdx = flippedIndex(row, col, ncols, nrows);
        positions.setZ(vIdx, newZ - minZ);
        changed = true;
    }

    if (changed) {
        positions.needsUpdate = true;
        terrainMesh.geometry.computeVertexNormals();
    }
}

// ── Composable ────────────────────────────────────────────────────────────────
export function useBathyBrushTool() {
    const geoStore   = useGeoStore();
    const bathyStore = useBathymetryStore();

    const activate = (scene) => {
        const geo = new THREE.RingGeometry(0, bathyBrushSettings.radius, 48);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x9b59b6, transparent: true, opacity: 0.4,
            side: THREE.DoubleSide, depthTest: false,
        });
        cursorMesh = new THREE.Mesh(geo, mat);
        cursorMesh.rotation.x = -Math.PI / 2;
        cursorMesh.renderOrder = 999;
        cursorMesh.visible = false;
        scene.add(cursorMesh);
    };

    const deactivate = (scene) => {
        isPainting = false;
        currentStroke.clear();
        if (cursorMesh) {
            scene.remove(cursorMesh);
            cursorMesh.geometry.dispose();
            cursorMesh.material.dispose();
            cursorMesh = null;
        }
    };

    const onMove = (ctx) => {
        const { pointer, raycaster, camera, terrainMesh } = ctx;
        if (!terrainMesh) return;

        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObject(terrainMesh, false);

        if (cursorMesh) {
            if (hits.length) {
                const p = hits[0].point;
                cursorMesh.position.set(p.x, p.y + 0.05, p.z);
                cursorMesh.geometry.dispose();
                cursorMesh.geometry = new THREE.RingGeometry(0, bathyBrushSettings.radius, 48);
                cursorMesh.visible = true;
            } else {
                cursorMesh.visible = false;
            }
        }

        if (isPainting) paint(ctx, bathyStore);
    };

    const onMouseDown = (ctx) => {
        isPainting = true;
        paint(ctx, bathyStore);
    };

    const onMouseUp = () => {
        isPainting = false;
        if (currentStroke.size > 0) {
            saveTerrainPatch([...currentStroke.entries()].map(([idx, oldZ]) => ({ idx, oldZ })));
            bathyStore.addModifiedCount(currentStroke.size);
        }
        currentStroke.clear();
    };

    return { activate, deactivate, onMove, onMouseDown, onMouseUp };
}
