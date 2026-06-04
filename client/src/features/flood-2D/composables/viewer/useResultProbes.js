/**
 * useResultProbes.js — Probe-Ring-Marker (Zellabfrage) im Result-Viewer.
 * Self-contained: verwaltet eigene Marker-Map, nur Szene-Zugriff nötig.
 */
import * as THREE from 'three';
import { RENDER_ORDER } from '../editor/renderLayers';

/** @param {() => THREE.Scene} getScene */
export function useResultProbes(getScene) {
  const markers = new Map();

  /** Setzt einen Ring-Marker. localPt = Plane-lokaler Treffer, normalizedZ = (terrainZ - minZ). */
  function place(localPt, normalizedZ, cellsize, id) {
    const scene = getScene();
    if (!scene) return;
    const ringGeo = new THREE.RingGeometry(cellsize * 0.3, cellsize * 0.5, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff4444, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false,
    });
    const marker = new THREE.Mesh(ringGeo, ringMat);
    marker.rotation.x = -Math.PI / 2; // innerhalb des bereits rotierten Welt-Raums
    marker.renderOrder = RENDER_ORDER.PROBE;
    scene.add(marker);
    // Weltkoordinaten direkt: local (x,y,z) → world (x, z, -y)
    marker.position.set(localPt.x, normalizedZ + 0.3, -localPt.y);
    marker.visible = true;
    markers.set(id, marker);
  }

  /** Entfernt einen Marker (per id) oder alle (id weglassen). */
  function clear(id) {
    const scene = getScene();
    const dispose = (m) => {
      if (scene) scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    };
    if (id) {
      const m = markers.get(id);
      if (m) { dispose(m); markers.delete(id); }
    } else {
      for (const m of markers.values()) dispose(m);
      markers.clear();
    }
  }

  return { place, clear };
}
