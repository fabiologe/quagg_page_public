/**
 * useDangerMarkers.js — Marker für numerische Instabilitäts-/Gefahrenstellen.
 *
 * Die Wasserhaut kappt 10-m-Tiefen-Dorne (analyzeDepthSpikes) für die Anzeige,
 * damit die Szene ansehbar bleibt. Damit die INFO nicht verloren geht, markiert
 * dieses Overlay jede geflaggte Zelle mit einem pulsierenden roten Warn-Kegel —
 * der echte (Roh-)Wert ist weiterhin über die Probe abrufbar.
 *
 * Konvention wie Arrows/Streamlines: Gruppe um -90° um X, lokale Koordinaten
 * localX = -W/2 + col·cs ; localY = H/2 - row·cs ; lokales +Z = Welt-Höhe.
 */
import * as THREE from 'three';
import { flippedIndex } from '../../utils/gridIndex';
import { RENDER_ORDER } from '../editor/renderLayers';

const CAP = 4000;            // max. Marker (breite Instabilität nicht endlos rendern)
const COLOR = 0xff1744;      // Signalrot

export function useDangerMarkers(getScene) {
  let group = null;
  let mesh = null;
  let material = null;
  const t0 = performance.now();

  function ensure(cs) {
    const scene = getScene();
    if (!scene) return false;
    if (!group) {
      group = new THREE.Group();
      group.rotation.x = -Math.PI / 2;
      group.renderOrder = RENDER_ORDER.FLOW_ARROWS;
      scene.add(group);
    }
    if (!material) {
      material = new THREE.MeshBasicMaterial({
        color: COLOR, transparent: true, opacity: 0.85, depthTest: false,
      });
    }
    if (!mesh) {
      // Kegel zeigt per Default +Y → auf lokales +Z drehen (= Welt-Höhe nach Gruppen-Rot.)
      const h = Math.max(2, cs * 1.6);
      const geo = new THREE.ConeGeometry(Math.max(0.6, cs * 0.45), h, 6);
      geo.rotateX(Math.PI / 2);     // +Y → +Z (Spitze nach oben in Weltkoordinaten)
      mesh = new THREE.InstancedMesh(geo, material, CAP);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = RENDER_ORDER.FLOW_ARROWS;
      // gemeinsamer, ruhiger Puls (eine Material-Opacity statt Matrix-Updates)
      mesh.onBeforeRender = () => {
        const s = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin((performance.now() - t0) / 350));
        material.opacity = s;
      };
      group.add(mesh);
      mesh._coneH = h;
    }
    return true;
  }

  /**
   * @param {Array<{i:number,col:number,row:number,value:number}>} flagged
   * @param {object} terrain ncols/nrows/cellsize/minZ/gridData/bounds
   * @param {Float32Array|null} depthField  geklemmtes/aktuelles Tiefen-Frame (für Höhe)
   * @param {number} robustMax  Anzeige-Deckel (Marker sitzt auf der gekappten Oberfläche)
   */
  function rebuild(flagged, terrain, depthField, robustMax) {
    if (!terrain) { clear(); return; }
    const { ncols, nrows, cellsize, minZ, gridData } = terrain;
    const cs = cellsize || 1;
    if (!ensure(cs) || !mesh) return;
    if (!flagged || flagged.length === 0) { mesh.count = 0; return; }

    const width  = terrain.bounds?.width  ?? (ncols - 1) * cs;
    const height = terrain.bounds?.height ?? (nrows - 1) * cs;
    const dummy = new THREE.Object3D();
    let n = 0;
    for (const f of flagged) {
      if (n >= CAP) break;
      const c = f.col, r = f.row;
      const localX = -width / 2 + c * cs;
      const localY = height / 2 - r * cs;
      const idxT = flippedIndex(r, c, ncols, nrows);       // gridData bottom-up
      const surf = (gridData[idxT] - minZ) + Math.min(robustMax, depthField ? (depthField[r * ncols + c] || 0) : robustMax);
      dummy.position.set(localX, localY, surf + mesh._coneH * 0.5 + 0.2);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  function setVisible(v) { if (group) group.visible = v; }
  function clear() { if (mesh) mesh.count = 0; }
  function dispose() {
    if (mesh) { mesh.geometry.dispose(); mesh = null; }
    if (material) { material.dispose(); material = null; }
    if (group && group.parent) group.parent.remove(group);
    group = null;
  }

  return { rebuild, setVisible, clear, dispose };
}
