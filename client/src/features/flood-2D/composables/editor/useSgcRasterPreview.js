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
 *   - hört auf channelPolyline/channelParams (Bathymetrie-Einzelkanal), geoStore.
 *     sgcChannels (Channel-Tool-Mehrfachkanäle, zusammengeführt via mergeSgcChannels),
 *     Brücken und Terrain
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
import { generateMultiSgcRasters, mergeSgcChannels } from '../../middleware/SgcGenerator.js';
import { collectPierCells } from '../../utils/BridgeMeshLattice.js';
import { requestRender } from './renderTrigger.js';

const COLOR_OPEN = 0x00bcd4;    // offene Gerinnezelle
const COLOR_BLOCKED = 0xff3b30; // Pfeiler-Sperre (SGC-Breite 0)

/**
 * @param {THREE.Scene} scene
 * @param {{channelCount:number, cellCount:number}} [statsOut]  reaktives Objekt (vom
 *   Aufrufer erzeugt, z. B. `reactive({channelCount:0, cellCount:0})`) — wird bei jedem
 *   rebuild() mit den aktuellen Zahlen befüllt, für SgcPreviewPanel.vue (Legende/Anzeige).
 */
export function useSgcRasterPreview(scene, statsOut = null) {
    const geoStore = useGeoStore();
    const bathyStore = useBathymetryStore();
    let mesh = null;
    let visible = true; // vom Host steuerbar (SgcPreviewPanel.vue-Toggle, s. setVisible)

    function clear() {
        if (mesh && scene) {
            scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        mesh = null;
    }

    /** Sichtbarkeit von außen umschalten (überlebt den nächsten rebuild()). */
    function setVisible(v) {
        visible = !!v;
        if (mesh) mesh.visible = visible;
        requestRender();
    }

    function rebuild() {
        clear();
        requestRender();   // schon das Leeren verändert das Bild (auch bei frühem Ausstieg)
        const terrain = geoStore.terrain;
        // Bathymetrie-Einzelkanal (Legacy) + Channel-Tool-Mehrfachkanäle zusammen —
        // gleiche Merge-Quelle wie der Export (Flood2DSolverRunner.vue). Brücken
        // erzeugen KEIN SGC (sie laufen ohne Sub-Grid auf der Floodplain) → hier
        // bewusst nicht dargestellt.
        const legacy = bathyStore.channelPolyline.length >= 2
            ? { polyline: bathyStore.channelPolyline, ...bathyStore.channelParams }
            : null;
        const channels = mergeSgcChannels(legacy, geoStore.sgcChannels);
        if (statsOut) { statsOut.channelCount = channels.length; statsOut.cellCount = 0; }
        if (!scene || !terrain?.center || !terrain.gridData || channels.length === 0) return;

        const { ncols, nrows, cellsize, minZ, center, gridData } = terrain;
        const xll = terrain.xllcorner ?? terrain.xll ?? 0;
        const yll = terrain.yllcorner ?? terrain.yll ?? 0;
        const header = { ncols, nrows, cellsize, xllcorner: xll, yllcorner: yll };

        let grids;
        try {
            grids = generateMultiSgcRasters(channels, gridData, header);
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
        if (statsOut) statsOut.cellCount = total;
        if (total === 0) return;

        const geo = new THREE.PlaneGeometry(cellsize * 0.9, cellsize * 0.9);
        geo.rotateX(-Math.PI / 2); // flach in die XZ-Ebene
        const mat = new THREE.MeshBasicMaterial({
            transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthTest: false,
        });
        mesh = new THREE.InstancedMesh(geo, mat, total);
        mesh.frustumCulled = false;
        mesh.renderOrder = 996; // knapp unter der Mittellinie (997) und Pfeilen (998)
        mesh.visible = visible;

        // Höhe einer Nachbarzelle (gleiche row/col-Konvention wie gridData/generateSgcRasters,
        // KEIN flipRow — die bestehende Positionsformel unten nutzt r/c ebenfalls direkt).
        const heightAt = (col, row) => {
            if (col < 0 || col >= ncols || row < 0 || row >= nrows) return null;
            const v = gridData[row * ncols + col];
            return v > -9000 ? v : null;
        };

        const dummy = new THREE.Object3D();
        const UP = new THREE.Vector3(0, 1, 0);
        const cOpen = new THREE.Color(COLOR_OPEN), cBlk = new THREE.Color(COLOR_BLOCKED);
        let n = 0;
        const place = (idx, color) => {
            const r = (idx / ncols) | 0, c = idx % ncols;
            const z = gridData[idx] > -9000 ? gridData[idx] : minZ;
            const rx = xll + c * cellsize + cellsize / 2;
            const ry = yll + r * cellsize + cellsize / 2;

            // Neigung wie die echte Terrain-Mesh: lokaler Gradient aus den Nachbarzellen
            // (Zentraldifferenz, an Rändern/NODATA einseitig) → Quad kippen statt flach
            // liegen zu lassen. Eine einzelne Ebene pro Zelle (kein bilinear gebogenes
            // Doppel-Dreieck wie die echte Mesh-Zelle), für normale Geländeneigungen aber
            // visuell praktisch deckungsgleich mit dem Wireframe-Kästchen darunter.
            const hE = heightAt(c + 1, r), hW = heightAt(c - 1, r);
            const hN = heightAt(c, r + 1), hS = heightAt(c, r - 1); // +row = +realY (Norden)
            let dzdx = 0;
            if (hE != null && hW != null) dzdx = (hE - hW) / (2 * cellsize);
            else if (hE != null) dzdx = (hE - z) / cellsize;
            else if (hW != null) dzdx = (z - hW) / cellsize;
            let dzdyReal = 0;
            if (hN != null && hS != null) dzdyReal = (hN - hS) / (2 * cellsize);
            else if (hN != null) dzdyReal = (hN - z) / cellsize;
            else if (hS != null) dzdyReal = (z - hS) / cellsize;
            // world.x folgt realX direkt, world.z = -(realY-center.y) → Vorzeichen der Y-Komponente
            // dreht sich beim Übergang von real- auf Weltkoordinaten (Höhenfeld-Normalen-Standardformel
            // normal ∝ (-∂h/∂worldX, 1, -∂h/∂worldZ), mit ∂h/∂worldZ = -dzdyReal).
            const normal = new THREE.Vector3(-dzdx, 1, dzdyReal).normalize();

            dummy.position.set(rx - center.x, (z - minZ) + 0.3, -(ry - center.y));
            dummy.quaternion.setFromUnitVectors(UP, normal);
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
    // ARRAY VON GETTERN statt eines Getters auf ein Array-Literal: Letzteres liefert
    // jedes Mal eine neue Referenz, Vue hält das immer für geändert — das komplette
    // SGC-Raster (generateMultiSgcRasters über das ganze Gitter) würde dann bei jeder
    // beliebigen Store-Änderung neu gerechnet.
    // Revisionszähler statt der sgcChannels-Referenz: addSgcChannel PUSHT nur, die
    // Array-Identität bleibt gleich — ein neu gezeichneter Kanal tauchte hier vorher
    // erst auf, wenn zufällig etwas anderes den Watcher auslöste.
    watch(
        [
            () => bathyStore.channelPolyline,
            () => bathyStore.channelParams.width,
            () => bathyStore.channelParams.bedDepth,
            () => bathyStore.channelParams.bedMode,
            () => geoStore.revisions.sgc,
            () => geoStore.revisions.bridge,
            () => geoStore.terrain?.gridData,
        ],
        rebuild,
        { immediate: true },
    );
    onUnmounted(clear);

    return { rebuild, clear, setVisible };
}
