/**
 * useOffsetRefPickTool.js
 *
 * Tool-ID: 'OFFSET_REF_PICK'
 * Lets the user click any survey point in the 3D viewer to use it as the
 * reference point for the offset calculation in Step 2 of the pipeline.
 *
 * Exported singleton state (readable from BathymetryModal):
 *   refPickState.hoveredOrigIdx   – survey-point index currently under cursor (-1 = none)
 *   refPickState.selectedOrigIdx  – confirmed pick (-1 = none)
 *   refPickState.hoverInfo        – { label, x, y, surveyZ, demZ, delta } | null
 */
import { reactive } from 'vue';
import * as THREE from 'three';
import { useGeoStore } from '../../stores/useGeoStore.js';
import { useBathymetryStore } from '../../stores/useBathymetryStore.js';

export const refPickState = reactive({
    hoveredOrigIdx:  -1,
    selectedOrigIdx: -1,
    hoverInfo:       null,
});

let snapRing  = null;
let scene_ref = null;

// ── helpers ───────────────────────────────────────────────────────────────────
function worldToReal(worldPt, terrain) {
    return {
        x:  worldPt.x + terrain.center.x,
        y: -worldPt.z + terrain.center.y,
    };
}

function findNearest(realX, realY, pts) {
    let bestD2 = Infinity, bestIdx = -1;
    for (let i = 0; i < pts.length; i++) {
        const d2 = (pts[i].x - realX) ** 2 + (pts[i].y - realY) ** 2;
        if (d2 < bestD2) { bestD2 = d2; bestIdx = i; }
    }
    return bestIdx;
}

function lookupDemZ(pt, terrain) {
    if (!terrain?.gridData) return null;
    const { gridData, ncols, nrows, cellsize } = terrain;
    const xll = terrain.xllcorner ?? 0;
    const yll = terrain.yllcorner ?? 0;
    const col     = Math.floor((pt.x - xll) / cellsize);
    const geomRow = Math.floor((pt.y - yll) / cellsize);
    const gridRow = (nrows - 1) - geomRow;
    if (col < 0 || col >= ncols || gridRow < 0 || gridRow >= nrows) return null;
    const z = gridData[gridRow * ncols + col];
    return z > -9000 ? z : null;
}

function removeSnap(scene) {
    if (!snapRing || !scene) return;
    scene.remove(snapRing);
    snapRing.geometry.dispose();
    snapRing.material.dispose();
    snapRing = null;
}

// ── composable ────────────────────────────────────────────────────────────────
export function useOffsetRefPickTool() {
    const geoStore   = useGeoStore();
    const bathyStore = useBathymetryStore();

    const activate = (scene) => {
        scene_ref = scene;
        refPickState.hoveredOrigIdx = -1;
        refPickState.hoverInfo      = null;
    };

    const deactivate = (scene) => {
        removeSnap(scene);
        refPickState.hoveredOrigIdx = -1;
        refPickState.hoverInfo      = null;
        scene_ref = null;
    };

    const onMove = (ctx) => {
        const { raycaster, camera, pointer, terrainMesh, scene } = ctx;
        const terrain = geoStore.terrain;
        if (!terrainMesh || !terrain?.center || !bathyStore.surveyPoints.length) {
            removeSnap(scene);
            refPickState.hoveredOrigIdx = -1;
            refPickState.hoverInfo      = null;
            return;
        }

        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObject(terrainMesh, false);

        removeSnap(scene);
        if (!hits.length) {
            refPickState.hoveredOrigIdx = -1;
            refPickState.hoverInfo      = null;
            return;
        }

        const real = worldToReal(hits[0].point, terrain);
        const idx  = findNearest(real.x, real.y, bathyStore.surveyPoints);
        if (idx < 0) return;

        const pt = bathyStore.surveyPoints[idx];

        // Draw pulsing snap ring at the point's world position
        const wy = pt.z - terrain.minZ + 0.5;
        const wx = pt.x - terrain.center.x;
        const wz = -(pt.y - terrain.center.y);

        const geo = new THREE.RingGeometry(0.7, 1.4, 24);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffaa00, transparent: true, opacity: 0.9,
            side: THREE.DoubleSide, depthTest: false,
        });
        snapRing = new THREE.Mesh(geo, mat);
        snapRing.position.set(wx, wy, wz);
        snapRing.rotation.x = -Math.PI / 2;
        snapRing.renderOrder = 999;
        scene.add(snapRing);

        // Compute hover info (delta vs. DEM)
        const demZ = lookupDemZ(pt, terrain);
        refPickState.hoveredOrigIdx = idx;
        refPickState.hoverInfo = {
            label:   pt.label ?? `P${idx + 1}`,
            x: pt.x, y: pt.y,
            surveyZ: pt.z,
            demZ,
            delta:   demZ != null ? pt.z - demZ : null,
        };
    };

    const onMouseDown = (ctx) => {
        if (refPickState.hoveredOrigIdx < 0) return;
        refPickState.selectedOrigIdx = refPickState.hoveredOrigIdx;
        // Deactivate after picking
        const simStore = ctx.simStore;
        if (simStore) simStore.setActiveTool(null);
    };

    const onMouseUp = () => {};

    return { activate, deactivate, onMove, onMouseDown, onMouseUp };
}

let _instance = null;
export function getRefPickToolInstance() {
    if (!_instance) _instance = useOffsetRefPickTool();
    return _instance;
}
