/**
 * useSgcRasterPreview.js
 *
 * Zeigt live das ECHTE SGC-Gerinneraster im Editor — also genau die Zellen, die der
 * Export (SgcGenerator) stempeln würde, inkl. der Pfeiler-Sperren (collectPierCells,
 * SGC-Breite 0). So sieht man sofort, was LISFLOOD als Sub-Grid-Channel bekommt, und
 * wie sich die eingestellte BREITE auf die gestempelte Korridor-Abdeckung auswirkt —
 * nicht nur die Mittellinie.
 *
 * Selbstständiger, reaktiver Renderer (Muster: useVirtualRasterRenderer):
 *   - hört auf channelPolyline, channelParams (Breite!), Brücken und Terrain
 *   - baut bei jeder Änderung ein InstancedMesh kleiner Quads neu auf
 *   - offene Gerinnezellen = cyan, vom Pfeiler gesperrte Zellen = rot
 *
 * Koordinaten wie buildTerrainMesh/useVirtualRasterRenderer:
 *   world.x =  (xll + c·cs + cs/2) − center.x
 *   world.z = −((yll + r·cs + cs/2) − center.y)
 *   world.y =  z − terrain.minZ
 */
import { watch, onUnmounted } from 'vue';
import * as THREE from 'three';
import { useGeoStore } from '../../stores/useGeoStore.js';
import { useBathymetryStore } from '../../stores/useBathymetryStore.js';
import { generateSgcRasters } from '../../middleware/SgcGenerator.js';
import { collectPierCells } from '../../utils/BridgeMeshLattice.js';

const COLOR_OPEN = 0x00bcd4;    // offene Gerinnezelle
const COLOR_BLOCKED = 0xff3b30; // Pfeiler-Sperre (SGC-Breite 0)

export function useSgcRasterPreview(scene) {
    const geoStore = useGeoStore();
    const bathyStore = useBathymetryStore();
    let mesh = null;

    function clear() {
        if (mesh && scene) {
            scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        mesh = null;
    }

    function rebuild() {
        clear();
        const terrain = geoStore.terrain;
        const poly = bathyStore.channelPolyline;
        // Nur das gezeichnete Bathymetrie-Gerinne (echtes Sub-Grid-Gerinne) vorschauen.
        // Brücken erzeugen KEIN SGC (sie laufen ohne Sub-Grid auf der Floodplain) → hier
        // bewusst nicht dargestellt.
        if (!scene || !terrain?.center || !terrain.gridData || !poly || poly.length < 2) return;

        const { ncols, nrows, cellsize, minZ, center, gridData } = terrain;
        const xll = terrain.xllcorner ?? terrain.xll ?? 0;
        const yll = terrain.yllcorner ?? terrain.yll ?? 0;
        const header = { ncols, nrows, cellsize, xllcorner: xll, yllcorner: yll };

        let grids;
        try {
            grids = generateSgcRasters({ polyline: poly, ...bathyStore.channelParams }, gridData, header);
        } catch {
            return;
        }
        const widthGrid = grids.width; // 0 = keine Gerinnezelle
        // Pfeiler-Zellen (Single Source mit dem Export) → diese Gerinnezellen sperrt der
        // Solver (SGC-Breite 0). Rot markieren, damit die Sperrung sichtbar ist.
        const piers = collectPierCells(geoStore.bridges || [], header);

        const open = [], blocked = [];
        for (let r = 0; r < nrows; r++) {
            for (let c = 0; c < ncols; c++) {
                const idx = r * ncols + c;
                if (!(widthGrid[idx] > 0)) continue;
                (piers.has(c + ',' + r) ? blocked : open).push(idx);
            }
        }
        const total = open.length + blocked.length;
        if (total === 0) return;

        const geo = new THREE.PlaneGeometry(cellsize * 0.9, cellsize * 0.9);
        geo.rotateX(-Math.PI / 2); // flach in die XZ-Ebene
        const mat = new THREE.MeshBasicMaterial({
            transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthTest: false,
        });
        mesh = new THREE.InstancedMesh(geo, mat, total);
        mesh.frustumCulled = false;
        mesh.renderOrder = 996; // knapp unter der Mittellinie (997) und Pfeilen (998)

        const dummy = new THREE.Object3D();
        const cOpen = new THREE.Color(COLOR_OPEN), cBlk = new THREE.Color(COLOR_BLOCKED);
        let n = 0;
        const place = (idx, color) => {
            const r = (idx / ncols) | 0, c = idx % ncols;
            const z = gridData[idx] > -9000 ? gridData[idx] : minZ;
            const rx = xll + c * cellsize + cellsize / 2;
            const ry = yll + r * cellsize + cellsize / 2;
            dummy.position.set(rx - center.x, (z - minZ) + 0.3, -(ry - center.y));
            dummy.updateMatrix();
            mesh.setMatrixAt(n, dummy.matrix);
            mesh.setColorAt(n, color);
            n++;
        };
        for (const idx of open) place(idx, cOpen);
        for (const idx of blocked) place(idx, cBlk);
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        scene.add(mesh);
    }

    // deep:false — alle Trigger sind Primitive oder werden als neue Referenz gesetzt
    // (channelPolyline wird bei jeder Bearbeitung als neues Array ersetzt; gridData
    // wechselt bei Terrain-Reload). KEIN deep-Watch über gridData (Performance!).
    watch(
        () => [
            bathyStore.channelPolyline,
            bathyStore.channelParams.width,
            bathyStore.channelParams.bedDepth,
            bathyStore.channelParams.bedMode,
            geoStore.bridges?.length,
            geoStore.terrain?.gridData,
        ],
        rebuild,
        { immediate: true },
    );
    onUnmounted(clear);

    return { rebuild, clear };
}
