/**
 * useBoundaryArrows.js — Randbedingungs-Pfeile (BCI) als InstancedMesh-Overlay.
 *
 * Parst den BCI-Inhalt (P-Punkte + N/S/E/W-Kanten), filtert ungültige Zellen (NoData/Gebäude)
 * und zeichnet Zu-/Auslauf-Pfeile. Die Gebäudemaske wird als Accessor hereingereicht (sie gehört
 * der Terrain-Schicht). 1:1-Übernahme der bisherigen Logik aus ResultMap3D.buildBoundaries.
 */
import * as THREE from 'three';
import { RENDER_ORDER } from '../editor/renderLayers';

/**
 * @param {() => THREE.Scene} getScene
 * @param {() => (Uint8Array|null)} getBuildingMask  top-down Gebäudemaske (≥128 = Gelände sichtbar)
 */
export function useBoundaryArrows(getScene, getBuildingMask) {
  let mesh = null;

  function build(bciContent, t) {
    const scene = getScene();
    if (!scene || !t || !bciContent) return;

    // Vorherige Pfeile aufräumen
    if (mesh) {
      scene.remove(mesh);
      mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      mesh = null;
    }

    // BCI-Zeilen parsen
    const lines = bciContent.split('\n');
    const points = [];
    for (const line of lines) {
      const p = line.trim().split(/\s+/);
      if (p.length < 4) continue;
      const type = p[0];
      if (type === 'P') {
        const x = parseFloat(p[1]);
        const y = parseFloat(p[2]);
        const bType = p[3];
        if (!isNaN(x) && !isNaN(y)) points.push({ x, y, type: bType });
      } else if (['N', 'S', 'E', 'W'].includes(type)) {
        const start = parseFloat(p[1]);
        const end = parseFloat(p[2]);
        const bType = p[3];
        if (isNaN(start) || isNaN(end)) continue;
        const { cellsize, xllcorner, yllcorner, ncols, nrows } = t;
        const numCells = Math.max(1, Math.round(Math.abs(end - start) / cellsize));
        const step = (end - start) / numCells;
        for (let i = 0; i < numCells; i++) {
          const val = start + i * step + step / 2;
          let x, y;
          if (type === 'N') { x = val; y = yllcorner + nrows * cellsize - cellsize / 2; }
          else if (type === 'S') { x = val; y = yllcorner + cellsize / 2; }
          else if (type === 'E') { x = xllcorner + ncols * cellsize - cellsize / 2; y = val; }
          else if (type === 'W') { x = xllcorner + cellsize / 2; y = val; }
          points.push({ x, y, type: bType });
        }
      }
    }

    if (points.length === 0) {
      console.warn('[BoundaryArrows] No boundary points parsed from BCI content');
      return;
    }

    const { ncols, nrows, cellsize, gridData, xllcorner, yllcorner, minZ } = t;
    const buildingMask = getBuildingMask?.();

    // Gültigkeits-Filter: nur an gültigen, nicht gebäude-maskierten Zellen (wie buildTerrain).
    {
      const before = points.length;
      const filtered = points.filter(pt => {
        const col  = Math.floor((pt.x - xllcorner) / cellsize);
        const rowBU = Math.floor((pt.y - yllcorner) / cellsize); // bottom-up
        if (col < 0 || col >= ncols || rowBU < 0 || rowBU >= nrows) return false;
        if (!(gridData[rowBU * ncols + col] > -9000)) return false;
        const geomRow = (nrows - 1) - rowBU;
        const maskIdx = geomRow * ncols + col;
        if (buildingMask && buildingMask[maskIdx] < 128) return false; // Gebäude
        return true;
      });
      points.length = 0;
      points.push(...filtered);
      if (points.length !== before) {
        console.log(`[BoundaryArrows] ${before - points.length} ungültige (NoData/Gebäude) herausgefiltert, ${points.length} verbleiben.`);
      }
      if (points.length === 0) return;
    }

    // Pfeil-Geometrie: Kegel (Spitze) + Zylinder (Schaft), zu einer Geometrie verschmolzen
    const arrowHeight = cellsize * 3;
    const shaftHeight = arrowHeight * 0.65;
    const coneHeight = arrowHeight * 0.35;
    const shaftRadius = cellsize * 0.12;
    const coneRadius = cellsize * 0.35;

    const coneGeom = new THREE.ConeGeometry(coneRadius, coneHeight, 8);
    coneGeom.translate(0, shaftHeight + coneHeight / 2, 0);
    const shaftGeom = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftHeight, 6);
    shaftGeom.translate(0, shaftHeight / 2, 0);
    coneGeom.rotateX(Math.PI / 2);
    shaftGeom.rotateX(Math.PI / 2);

    const mergedGeom = new THREE.BufferGeometry();
    const conePos = coneGeom.attributes.position;
    const shaftPos = shaftGeom.attributes.position;
    const positions = new Float32Array((conePos.count + shaftPos.count) * 3);
    for (let i = 0; i < conePos.count; i++) {
      positions[i * 3] = conePos.getX(i);
      positions[i * 3 + 1] = conePos.getY(i);
      positions[i * 3 + 2] = conePos.getZ(i);
    }
    for (let i = 0; i < shaftPos.count; i++) {
      const off = (conePos.count + i) * 3;
      positions[off] = shaftPos.getX(i);
      positions[off + 1] = shaftPos.getY(i);
      positions[off + 2] = shaftPos.getZ(i);
    }
    mergedGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const coneIdx = coneGeom.index;
    const shaftIdx = shaftGeom.index;
    const indices = new Uint32Array(coneIdx.count + shaftIdx.count);
    for (let i = 0; i < coneIdx.count; i++) indices[i] = coneIdx.getX(i);
    for (let i = 0; i < shaftIdx.count; i++) indices[coneIdx.count + i] = shaftIdx.getX(i) + conePos.count;
    mergedGeom.setIndex(new THREE.BufferAttribute(indices, 1));
    mergedGeom.computeVertexNormals();

    const material = new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, shininess: 60 });

    mesh = new THREE.InstancedMesh(mergedGeom, material, points.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const cInflow = new THREE.Color(0x2196f3);  // QVAR
    const cOutflow = new THREE.Color(0xff5722);  // HFIX/FREE
    const cStage = new THREE.Color(0x9c27b0);    // HVAR
    const cUnknown = new THREE.Color(0x888888);

    const cx = xllcorner + (ncols * cellsize) / 2;
    const cy = yllcorner + (nrows * cellsize) / 2;

    points.forEach((pt, i) => {
      const localX = pt.x - cx;
      const localY = pt.y - cy;
      const col = Math.round((pt.x - xllcorner) / cellsize);
      const row = Math.round((pt.y - yllcorner) / cellsize); // bottom-up
      let terrainZ = 0;
      if (col >= 0 && col < ncols && row >= 0 && row < nrows) {
        const val = gridData[row * ncols + col];
        if (val > -9000) terrainZ = val - minZ;
      }
      const isOutflow = (pt.type === 'HFIX' || pt.type === 'FREE');
      if (isOutflow) {
        dummy.position.set(localX, localY, terrainZ + arrowHeight);
        dummy.rotation.set(Math.PI, 0, 0);
      } else {
        dummy.position.set(localX, localY, terrainZ + cellsize * 0.2);
        dummy.rotation.set(0, 0, 0);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (pt.type === 'QVAR') color.copy(cInflow);
      else if (isOutflow) color.copy(cOutflow);
      else if (pt.type === 'HVAR') color.copy(cStage);
      else color.copy(cUnknown);
      mesh.setColorAt(i, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.rotation.x = -Math.PI / 2; // gleiche Transform wie Terrain
    mesh.renderOrder = RENDER_ORDER.BOUNDARY_ARROWS;
    scene.add(mesh);

    coneGeom.dispose();
    shaftGeom.dispose();
    console.log(`[BoundaryArrows] 🔵 Rendered ${points.length} boundary arrows.`);
  }

  function setVisible(v) { if (mesh) mesh.visible = v; }

  return { build, setVisible };
}
