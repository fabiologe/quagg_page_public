/**
 * useVirtualRasterRenderer.js
 *
 * Renders ALL visible zones from useRasterProcessingStore as colored point
 * clouds in the Three.js scene.  One THREE.Points mesh per zone, rebuilt
 * whenever zonesVersion changes.
 *
 * Color ramps are defined per zone type in ZoneColors (useRasterProcessingStore).
 *
 * Coordinate system matches buildTerrainMesh / useSurveyPointsRenderer:
 *   world.x =  realX − center.x
 *   world.z = −(realY − center.y)
 *   world.y =  z − terrain.minZ   (exact real elevation)
 */
import { watch, onUnmounted } from 'vue';
import * as THREE from 'three';
import { useRasterProcessingStore, ZoneColors } from '../../stores/useRasterProcessingStore.js';
import { useGeoStore } from '../../stores/useGeoStore.js';

/** Lerp between two [r,g,b] triples at t ∈ [0,1]. */
function lerpColor(lo, hi, t) {
    return [
        lo[0] + (hi[0] - lo[0]) * t,
        lo[1] + (hi[1] - lo[1]) * t,
        lo[2] + (hi[2] - lo[2]) * t,
    ];
}

/** Build a THREE.Points mesh for one zone. Returns null if zone has no data. */
function buildZoneMesh(zone, terrain) {
    if (!zone.indices?.length || !terrain?.center) return null;

    const { indices, zValues, type } = zone;
    const { center, minZ, ncols, cellsize } = terrain;
    const xll = terrain.xllcorner ?? terrain.xll ?? 0;
    const yll = terrain.yllcorner ?? terrain.yll ?? 0;

    const palette = ZoneColors[type] ?? ZoneColors.BATHYMETRY;

    // Z range for color normalization
    let vrMinZ = Infinity, vrMaxZ = -Infinity;
    for (let i = 0; i < zValues.length; i++) {
        if (zValues[i] < vrMinZ) vrMinZ = zValues[i];
        if (zValues[i] > vrMaxZ) vrMaxZ = zValues[i];
    }
    const vrRange = vrMaxZ - vrMinZ || 1;

    const positions = new Float32Array(indices.length * 3);
    const colors    = new Float32Array(indices.length * 3);

    for (let i = 0; i < indices.length; i++) {
        const idx   = indices[i];
        const r     = (idx / ncols) | 0;
        const c     = idx % ncols;
        const realX = xll + c * cellsize + cellsize / 2;
        const realY = yll + r * cellsize + cellsize / 2;
        const z     = zValues[i];

        positions[i * 3]     =  realX - center.x;
        positions[i * 3 + 1] =  z - minZ + 0.6;       // slightly above terrain
        positions[i * 3 + 2] = -(realY - center.y);

        const col = lerpColor(palette.lo, palette.hi, (z - vrMinZ) / vrRange);
        colors[i * 3]     = col[0];
        colors[i * 3 + 1] = col[1];
        colors[i * 3 + 2] = col[2];
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));

    const mat = new THREE.PointsMaterial({
        size:            Math.max(cellsize * 0.9, 1.0),
        vertexColors:    true,
        sizeAttenuation: true,
        transparent:     true,
        opacity:         0.82,
        depthTest:       true,
    });

    const mesh = new THREE.Points(geo, mat);
    mesh.name        = `zone-layer-${zone.id}`;
    mesh.renderOrder = 3;
    return mesh;
}

export function useVirtualRasterRenderer(scene) {
    const rasterStore = useRasterProcessingStore();
    const geoStore    = useGeoStore();

    /** Map<zoneId, THREE.Points> — one mesh per active zone. */
    const meshMap = new Map();

    function rebuild() {
        const terrain = geoStore.terrain;

        // Remove all existing zone meshes
        for (const mesh of meshMap.values()) {
            scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        meshMap.clear();

        if (!terrain?.center) return;

        // Rebuild one mesh per visible zone that has data
        for (const zone of rasterStore.zones) {
            if (!zone.visible || !zone.indices?.length) continue;
            const mesh = buildZoneMesh(zone, terrain);
            if (mesh) {
                scene.add(mesh);
                meshMap.set(zone.id, mesh);
            }
        }
    }

    watch(
        [() => rasterStore.zonesVersion, () => geoStore.terrain?.center],
        rebuild,
        { immediate: true },
    );

    onUnmounted(() => {
        for (const mesh of meshMap.values()) {
            scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        meshMap.clear();
    });
}
