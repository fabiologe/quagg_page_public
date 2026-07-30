/**
 * useBridgeRasterPreview.js
 *
 * Live-Vorschau dessen, was der SOLVER aus einer mesh3d-Brücke macht: die gerasterten
 * Brückenzellen bei Editor-Zellweite, eingefärbt nach der EFFEKTIVEN Öffnungsbreite pro
 * Zelle (cellOpenWidth — zieht den Pfeiler-Anteil quer zur Strömung sub-grid ab). So
 * sieht der Nutzer sofort, dass ein Pfeiler kontinuierlich seinen echten Anteil verbaut
 * (nicht 0/100 % einer ganzen Zelle) und wo die Öffnung wirklich liegt.
 *
 * Muster 1:1 von useSgcRasterPreview: reaktiver InstancedMesh-Quad-Overlay, gleiche
 * Welt-Koordinaten-Transform, gleiche renderOrder-Logik. Nur aktiv, solange das
 * BRÜCKEN-Werkzeug gewählt ist (kontextuell, kein Dauer-Clutter).
 *
 * Farbskala (width/cs):
 *   ≈ 1.0  → grün  (voll offen)
 *   dazwischen → grün→orange (teilverbaut, reduziertes w)
 *   < ~5 %  → rot  (voll gesperrt: Pfeiler/Rand)
 */
import { watch, onUnmounted } from 'vue';
import * as THREE from 'three';
import { useGeoStore } from '../../stores/useGeoStore.js';
import { useSimulationStore } from '../../stores/useSimulationStore.js';
import { latticeToCells } from '../../utils/BridgeMeshLattice.js';
import { requestRender } from './renderTrigger.js';

const COLOR_OPEN = new THREE.Color(0xffcc80);    // voll offen — hellorange
const COLOR_PART = new THREE.Color(0xfb8c00);    // teilverbaut — kräftigeres Orange
const COLOR_BLOCKED = new THREE.Color(0xe53935); // voll gesperrt (Pfeiler) — rot

export function useBridgeRasterPreview(scene) {
    const geoStore = useGeoStore();
    const simStore = useSimulationStore();
    let mesh = null;
    let visible = true; // vom Host steuerbar (z.B. nur in der WIREFRAME-Rasteransicht zeigen)

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
        requestRender();
        visible = !!v;
        if (mesh) mesh.visible = visible;
    }

    function rebuild() {
        clear();
        requestRender();   // schon das Leeren verändert das Bild
        const terrain = geoStore.terrain;
        // Nur im Brücken-Werkzeug zeigen (kontextuelle Vorschau).
        if (simStore.activeTool !== 'BRIDGE') return;
        if (!scene || !terrain?.center || !terrain.gridData) return;

        const { ncols, nrows, cellsize, minZ, center, gridData } = terrain;
        const xll = terrain.xllcorner ?? terrain.xll ?? 0;
        const yll = terrain.yllcorner ?? terrain.yll ?? 0;
        const header = { ncols, nrows, cellsize, xllcorner: xll, yllcorner: yll };
        const W_MIN = Math.max(0.1, 0.05 * cellsize);

        // Alle mesh3d-Brücken rastern (mit echter Öffnungsbreite pro Zelle).
        const cells = [];
        for (const bridge of (geoStore.bridges || [])) {
            if (bridge.kind !== 'mesh3d' || !bridge.lattice) continue;
            let bc;
            try { bc = latticeToCells(bridge, header, null, { openWidth: true }); }
            catch { continue; }
            for (const c of bc) cells.push(c);
        }
        if (cells.length === 0) return;

        const geo = new THREE.PlaneGeometry(cellsize * 0.9, cellsize * 0.9);
        geo.rotateX(-Math.PI / 2); // flach in die XZ-Ebene
        const mat = new THREE.MeshBasicMaterial({
            transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthTest: false,
        });
        mesh = new THREE.InstancedMesh(geo, mat, cells.length);
        mesh.frustumCulled = false;
        mesh.renderOrder = 995; // knapp unter der SGC-Vorschau (996)
        mesh.visible = visible;

        // Höhe einer Nachbarzelle (gleiche row/col-Konvention wie latticeToCells/gridData,
        // kein flipRow — siehe useSgcRasterPreview.js für dieselbe Herleitung).
        const heightAt = (col, row) => {
            if (col < 0 || col >= ncols || row < 0 || row >= nrows) return null;
            const v = gridData[row * ncols + col];
            return v > -9000 ? v : null;
        };

        const dummy = new THREE.Object3D();
        const UP = new THREE.Vector3(0, 1, 0);
        const col = new THREE.Color();
        let n = 0;
        for (const c of cells) {
            const ratio = Math.max(0, Math.min(1, (c.width ?? cellsize) / cellsize));
            if ((c.width ?? cellsize) < W_MIN) {
                col.copy(COLOR_BLOCKED);
            } else {
                // teilverbaut → orange, voll offen → grün
                col.copy(COLOR_PART).lerp(COLOR_OPEN, ratio);
            }
            const idx = c.row * ncols + c.col;
            const z = gridData[idx] > -9000 ? gridData[idx] : minZ;
            const rx = xll + c.col * cellsize + cellsize / 2;
            const ry = yll + c.row * cellsize + cellsize / 2;

            // Neigung wie die echte Terrain-Mesh (siehe useSgcRasterPreview.js): lokaler
            // Gradient aus den Nachbarzellen statt flach liegender Quad.
            const hE = heightAt(c.col + 1, c.row), hW = heightAt(c.col - 1, c.row);
            const hN = heightAt(c.col, c.row + 1), hS = heightAt(c.col, c.row - 1);
            let dzdx = 0;
            if (hE != null && hW != null) dzdx = (hE - hW) / (2 * cellsize);
            else if (hE != null) dzdx = (hE - z) / cellsize;
            else if (hW != null) dzdx = (z - hW) / cellsize;
            let dzdyReal = 0;
            if (hN != null && hS != null) dzdyReal = (hN - hS) / (2 * cellsize);
            else if (hN != null) dzdyReal = (hN - z) / cellsize;
            else if (hS != null) dzdyReal = (z - hS) / cellsize;
            const normal = new THREE.Vector3(-dzdx, 1, dzdyReal).normalize();

            dummy.position.set(rx - center.x, (z - minZ) + 0.35, -(ry - center.y));
            dummy.quaternion.setFromUnitVectors(UP, normal);
            dummy.updateMatrix();
            mesh.setMatrixAt(n, dummy.matrix);
            mesh.setColorAt(n, col);
            n++;
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        scene.add(mesh);
    }

    // Struktur-Signatur: Geometrie + Pfeiler je Brücke (Pfeiler-Breite/-Position ändern
    // die Öffnung → muss neu zeichnen). Bridges sind wenige Objekte → günstig.
    watch(
        () => [
            simStore.activeTool,
            geoStore.terrain?.gridData,
            JSON.stringify((geoStore.bridges || []).map(b => [
                b.id, b.kind, b.poly?.length,
                (b.lattice?.piers || []).map(p => p.poly),
                b.vsoffit, b.vdeck, b.directionMode,
            ])),
        ],
        rebuild,
        { immediate: true },
    );
    onUnmounted(clear);

    return { rebuild, clear, setVisible };
}
