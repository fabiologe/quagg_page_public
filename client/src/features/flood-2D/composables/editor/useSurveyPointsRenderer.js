import { watch, onUnmounted } from 'vue';
import * as THREE from 'three';
import { useBathymetryStore } from '../../stores/useBathymetryStore.js';
import { useGeoStore } from '../../stores/useGeoStore.js';

function makeXTexture() {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(5, 5);   ctx.lineTo(27, 27);
    ctx.moveTo(27, 5);  ctx.lineTo(5, 27);
    ctx.stroke();
    return new THREE.CanvasTexture(canvas);
}

/**
 * Renders terrestrial survey points as Z-colored X markers in the Three.js scene.
 * Call once from onMounted after initThreeJS().
 *
 * Coordinate mapping (matches MapEditor3D buildTerrainMesh):
 *   world.x = realX - center.x
 *   world.z = -(realY - center.y)
 *   world.y = surveyZ - terrain.minZ   ← exakte Realhöhe (identisch zu Terrain-Vertices)
 */
export function useSurveyPointsRenderer(scene) {
    const bathyStore = useBathymetryStore();
    const geoStore   = useGeoStore();

    let pointsMesh = null;

    function rebuild() {
        if (pointsMesh) {
            scene.remove(pointsMesh);
            pointsMesh.geometry.dispose();
            pointsMesh.material.map?.dispose();
            pointsMesh.material.dispose();
            pointsMesh = null;
        }

        const pts     = bathyStore.surveyPoints;
        const terrain = geoStore.terrain;
        if (!pts.length || !terrain?.center) return;

        const { center, minZ, gridData, ncols, nrows, cellsize } = terrain;
        const xll = terrain.xllcorner ?? terrain.xll ?? 0;
        const yll = terrain.yllcorner ?? terrain.yll ?? 0;

        const COL_ABOVE   = new THREE.Color(0xf1c40f); // gelb  – Punkt über DGM
        const COL_BELOW   = new THREE.Color(0x9b59b6); // lila  – Punkt unter DGM
        const COL_NEUTRAL = new THREE.Color(0x888888); // grau  – Δ < 0.05 m
        const COL_NODATA  = new THREE.Color(0xffffff); // weiß  – keine DGM-Zelle

        const positions = new Float32Array(pts.length * 3);
        const colors    = new Float32Array(pts.length * 3);

        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            positions[i * 3]     =  p.x - center.x;
            positions[i * 3 + 1] =  p.z - minZ;
            positions[i * 3 + 2] = -(p.y - center.y);

            // DGM-Zelle am Punkt-Standort nachschlagen
            const col     = Math.round((p.x - xll) / cellsize);
            const geomRow = Math.round((p.y - yll) / cellsize);
            const gridRow = (nrows - 1) - geomRow;

            let color = COL_NODATA;
            if (col >= 0 && col < ncols && gridRow >= 0 && gridRow < nrows) {
                const demZ = gridData[gridRow * ncols + col];
                if (demZ > -9000) {
                    const delta = p.z - demZ;
                    if (Math.abs(delta) < 0.05) color = COL_NEUTRAL;
                    else if (delta > 0)          color = COL_ABOVE;
                    else                         color = COL_BELOW;
                }
            }

            colors[i * 3]     = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));

        const mat = new THREE.PointsMaterial({
            size:            1.5,
            vertexColors:    true,
            sizeAttenuation: true,
            map:             makeXTexture(),
            alphaTest:       0.1,
            depthTest:       true,
            transparent:     true,
        });

        pointsMesh = new THREE.Points(geo, mat);
        pointsMesh.userData.isSurveyPoints = true;
        scene.add(pointsMesh);
    }

    watch(
        [() => bathyStore.surveyPointsVersion, () => geoStore.terrain?.center, () => geoStore.terrainVersion],
        rebuild,
        { immediate: true },
    );

    onUnmounted(() => {
        if (pointsMesh) {
            scene.remove(pointsMesh);
            pointsMesh.geometry.dispose();
            pointsMesh.material.map?.dispose();
            pointsMesh.material.dispose();
        }
    });
}
