/**
 * useVirtualRasterRenderer.js
 *
 * Renders the virtual raster (IDW corridor result) as a colored point-cloud
 * overlay in the Three.js scene.  Call once from MapEditor3D's onMounted after
 * initThreeJS().
 *
 * Coordinate system matches buildTerrainMesh / useSurveyPointsRenderer:
 *   world.x =  realX − center.x
 *   world.z = −(realY − center.y)
 *   world.y =  z − terrain.minZ   (exact real elevation)
 *
 * Color mapping (bathymetric, Z within virtual-raster range):
 *   low Z  → deep blue  (#1a2fe0)
 *   mid    → cyan       (#00d4ff)
 *   high Z → green-cyan (#00ff99)
 */
import { watch, onUnmounted } from 'vue';
import * as THREE from 'three';
import { useBathymetryStore } from '../../stores/useBathymetryStore.js';
import { useGeoStore } from '../../stores/useGeoStore.js';

/** Simple bathymetric color ramp: t ∈ [0,1] → RGB */
function bathyColor(t) {
    // 0 → #1a2fe0 (deep blue)   0.5 → #00d4ff (cyan)   1 → #00ff99 (green-cyan)
    if (t < 0.5) {
        const s = t * 2;
        return {
            r: (0x1a + (0x00 - 0x1a) * s) / 255,
            g: (0x2f + (0xd4 - 0x2f) * s) / 255,
            b: (0xe0 + (0xff - 0xe0) * s) / 255,
        };
    }
    const s = (t - 0.5) * 2;
    return {
        r: (0x00 + (0x00 - 0x00) * s) / 255,
        g: (0xd4 + (0xff - 0xd4) * s) / 255,
        b: (0xff + (0x99 - 0xff) * s) / 255,
    };
}

export function useVirtualRasterRenderer(scene) {
    const bathyStore = useBathymetryStore();
    const geoStore   = useGeoStore();

    let pointsMesh = null;

    function rebuild() {
        // Teardown
        if (pointsMesh) {
            scene.remove(pointsMesh);
            pointsMesh.geometry.dispose();
            pointsMesh.material.dispose();
            pointsMesh = null;
        }

        const vr      = bathyStore.virtualRaster;
        const terrain = geoStore.terrain;

        if (!vr || !bathyStore.virtualRasterVisible || !terrain?.center) return;

        const { indices, zValues } = vr;
        if (!indices.length) return;

        const { center, minZ, ncols, cellsize } = terrain;
        const xll = terrain.xllcorner ?? terrain.xll ?? 0;
        const yll = terrain.yllcorner ?? terrain.yll ?? 0;

        // Determine Z range for color mapping
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
            positions[i * 3 + 1] =  z - minZ + 0.6; // slightly above terrain surface
            positions[i * 3 + 2] = -(realY - center.y);

            const col = bathyColor((z - vrMinZ) / vrRange);
            colors[i * 3]     = col.r;
            colors[i * 3 + 1] = col.g;
            colors[i * 3 + 2] = col.b;
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

        pointsMesh = new THREE.Points(geo, mat);
        pointsMesh.name = 'virtual-raster-layer';
        pointsMesh.renderOrder = 3;
        scene.add(pointsMesh);
    }

    watch(
        [
            () => bathyStore.virtualRasterVersion,
            () => bathyStore.virtualRasterVisible,
            () => geoStore.terrain?.center,
        ],
        rebuild,
        { immediate: true },
    );

    onUnmounted(() => {
        if (pointsMesh) {
            scene.remove(pointsMesh);
            pointsMesh.geometry.dispose();
            pointsMesh.material.dispose();
        }
    });
}
