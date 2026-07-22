/**
 * useFlowArrows.js — gerichtete Fließpfeile (Velocity-Vektorfeld) als InstancedMesh-Overlay.
 *
 * Self-contained: kein Bezug zu Wasser/Terrain-Maske. Nutzt nur Szene + das aktuelle
 * Vektorfeld {vx,vy} (zell-zentriert, top-down) + Tiefen-Frame (Nass-Gating) + Terrain-Maße.
 * Konvention: +vx = Ost (+localX), +vy = Süd (-localY) → Winkel = atan2(-vy, vx).
 */
import * as THREE from 'three';
import { RENDER_ORDER } from '../editor/renderLayers';
import { flippedIndex } from '../../utils/gridIndex';
import { sampleAmbientForPiers, deflectVelocity } from '../../utils/pierFlowDeflection';
import { sampleAmbientForJets, applyJetFlow } from '../../utils/weirJetFlow';

// Hoher Kontrast auf blauem Wasser (warm, hell): langsam = weiß → gold → rot-orange = schnell.
const C0 = new THREE.Color(0xffffff); // langsam: weiß
const C1 = new THREE.Color(0xffc400); // mittel: gold
const C2 = new THREE.Color(0xff2a00); // schnell: rot-orange

const ARROW_CAP    = 60000; // max. Instanzen (mehr Pfeile möglich)
const ARROW_MIN    = 2000;  // Zielanzahl bei minimaler Dichte
const WET_MIN      = 0.02;  // m — nur nasse Zellen

function speedColor(s, sref, out) {
  const t = sref > 0 ? Math.min(1, Math.max(0, s / sref)) : 0;
  if (t < 0.5) out.copy(C0).lerp(C1, t / 0.5);
  else         out.copy(C1).lerp(C2, (t - 0.5) / 0.5);
  return out;
}

function buildArrowGeometry() {
  // Flacher Pfeil in der XY-Ebene, zeigt +X, Länge 1 (x: -0.5..0.5), breite Spitze.
  const shape = new THREE.Shape();
  const hw = 0.12, hh = 0.34, hx = 0.42;
  shape.moveTo(-0.5, -hw);
  shape.lineTo(0.5 - hx, -hw);
  shape.lineTo(0.5 - hx, -hh);
  shape.lineTo(0.5, 0);
  shape.lineTo(0.5 - hx, hh);
  shape.lineTo(0.5 - hx, hw);
  shape.lineTo(-0.5, hw);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

/**
 * @param {() => THREE.Scene} getScene
 * @param {() => (Uint8Array|null)} [getMask]  Hindernis-Maske (top-down, <128 = Gebäude/Pfeiler);
 *        solche Zellen bekommen keinen Pfeil (Pfeiler sind nur im SGC blockiert, nicht im 2D-Feld).
 * @param {() => Array} [getPierGeoms]  Pfeiler-Geometrie (pierFlowDeflection.buildPierGeometry) —
 *        deflectiert die Pfeile im Ring um jeden Pfeiler analytisch statt sie geradeaus zu zeigen.
 * @param {() => Array} [getJetGeoms]  Durchlass-Geometrie (weirJetFlow.buildJetGeometry) —
 *        überlagert Kontraktion/Freistrahl an Wehr-Durchlässen.
 */
export function useFlowArrows(getScene, getMask, getPierGeoms, getJetGeoms) {
  let group = null;
  let mesh = null;

  function ensure() {
    const scene = getScene();
    if (!scene) return;
    if (!group) {
      group = new THREE.Group();
      group.rotation.x = -Math.PI / 2; // gleiche Transform wie Terrain-Mesh
      group.renderOrder = RENDER_ORDER.FLOW_ARROWS;
      scene.add(group);
    }
    if (!mesh) {
      // depthTest:false → Pfeile bleiben auch über (ggf. deckendem) Wasser sichtbar
      const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthTest: false });
      mesh = new THREE.InstancedMesh(buildArrowGeometry(), mat, ARROW_CAP);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = RENDER_ORDER.FLOW_ARROWS;
      group.add(mesh);
    }
  }

  /**
   * @param {{vx:Float32Array, vy:Float32Array}} field  zell-zentriertes Vektorfeld (top-down)
   * @param {object} terrain   ncols/nrows/cellsize/minZ/gridData/bounds
   * @param {Float32Array|null} depthField  aktuelles Tiefen-Frame (Nass-Gating + Höhe)
   * @param {number} density   0..1 — Pfeil-Dichte (mehr Pfeile bei höherem Wert). Farbskala bleibt
   *                           automatisch (sref intern aus dem Feld bestimmt).
   */
  function rebuild(field, terrain, depthField, density = 0.5) {
    ensure();
    if (!terrain || !field || !field.vx || !field.vy || !mesh) { if (mesh) mesh.count = 0; return; }
    const { ncols, nrows, cellsize, minZ, gridData } = terrain;
    const cs = cellsize || 1;
    const width  = terrain.bounds?.width  ?? (ncols - 1) * cs;
    const height = terrain.bounds?.height ?? (nrows - 1) * cs;
    const mask = (typeof getMask === 'function') ? getMask() : null; // top-down, <128 = Hindernis
    const pierGeoms = (typeof getPierGeoms === 'function') ? getPierGeoms() : null;
    const ambient = (pierGeoms && pierGeoms.length)
      ? sampleAmbientForPiers(pierGeoms, field.vx, field.vy, ncols, nrows, mask)
      : null;
    const jetGeoms = (typeof getJetGeoms === 'function') ? getJetGeoms() : null;
    const ambientJets = (jetGeoms && jetGeoms.length)
      ? sampleAmbientForJets(jetGeoms, field.vx, field.vy, ncols, nrows, mask)
      : null;

    // Dichte → Zielanzahl → Sampling-Schrittweite
    const dens = Math.min(1, Math.max(0, density));
    const target = Math.round(ARROW_MIN + (ARROW_CAP - ARROW_MIN) * dens);
    const step = Math.max(1, Math.round(Math.sqrt((ncols * nrows) / target)));
    const arrowLen = cs * step * 0.5;

    // Auto-Farbskala: max. Geschwindigkeit über die gesampelten, nassen Zellen
    let sref = 0;
    for (let gr = 0; gr < nrows; gr += step) {
      for (let c = 0; c < ncols; c += step) {
        const idxR = gr * ncols + c;
        const d = depthField ? depthField[idxR] : 1;
        if (!(d > WET_MIN)) continue;
        if (mask && mask[idxR] < 128) continue; // Gebäude/Pfeiler → kein Pfeil
        const vx = field.vx[idxR], vy = field.vy[idxR];
        if (!(vx > -9000) || !(vy > -9000)) continue;
        const sp = Math.hypot(vx, vy);
        if (sp > sref) sref = sp;
      }
    }
    if (!(sref > 0)) sref = 1.0;
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    let n = 0;
    // gr = top-down Zeile (0 = Nord); gridData ist bottom-up → Höhe über gespiegelten Index.
    for (let gr = 0; gr < nrows && n < ARROW_CAP; gr += step) {
      for (let c = 0; c < ncols && n < ARROW_CAP; c += step) {
        const idxR = gr * ncols + c;
        const d = depthField ? depthField[idxR] : 1;
        if (!(d > WET_MIN)) continue;
        if (mask && mask[idxR] < 128) continue; // Gebäude/Pfeiler → kein Pfeil
        let vx = field.vx[idxR], vy = field.vy[idxR];
        if (!(vx > -9000) || !(vy > -9000)) continue;
        if (pierGeoms && pierGeoms.length) {
          const d = deflectVelocity(c, gr, vx, vy, pierGeoms, ambient);
          vx = d.vx; vy = d.vy;
        }
        if (jetGeoms && jetGeoms.length) {
          const j = applyJetFlow(c, gr, vx, vy, jetGeoms, ambientJets);
          vx = j.vx; vy = j.vy;
        }
        const sp = Math.hypot(vx, vy);
        if (sp < 1e-4) continue;
        const idxT = flippedIndex(gr, c, ncols, nrows);
        const localX = -width / 2 + c * cs;
        const localY = height / 2 - gr * cs;
        const zTop = (gridData[idxT] - minZ) + (d > 0 ? d : 0) + 0.5;
        dummy.position.set(localX, localY, zTop);
        dummy.rotation.set(0, 0, Math.atan2(-vy, vx));
        const sScale = arrowLen * (0.5 + 0.5 * Math.min(1, sp / sref));
        dummy.scale.set(sScale, sScale, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        mesh.setColorAt(n, speedColor(sp, sref, col));
        n++;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function setVisible(v) { if (group) group.visible = v; }
  function clear() { if (mesh) mesh.count = 0; }

  return { rebuild, setVisible, clear };
}
