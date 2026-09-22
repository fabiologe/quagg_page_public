// Bildschirm-Maßstab des Editors: Griffe, Marker und Klickziele werden in
// PIXELN bemessen, nicht in Weltmetern.
//
// Bis 2026-09-22 waren alle Bediengrößen feste Meter (Griff 0,3 m, Klick-
// zylinder 0,35 m, Kamera 2 … 600 m), geeicht am 12-m-Becken mit rund 15 m
// Blickabstand. In einem 50 × 74-m-Gebiet war der Griff drei Pixel groß, in
// einem 2-m-Schacht deckte die Greifkugel das halbe Modell, und ein
// 500-m-Gebiet passte nie ganz ins Bild (Audit C5). Hier gibt es EINE
// Umrechnung Pixel → Meter aus Kameraabstand, Öffnungswinkel und
// Viewport-Höhe; jedes angemeldete Objekt wird je Frame darauf skaliert.
import * as THREE from 'three'

// Meter je Pixel in der Ebene senkrecht zur Blickrichtung im Abstand d
export function weltProPixel(abstand, fovGrad, viewportHoehePx) {
  const h = Math.max(viewportHoehePx || 0, 1)
  return 2 * Math.max(abstand, 1e-6) * Math.tan((fovGrad * Math.PI / 180) / 2) / h
}

// Weltgröße, die im Abstand d `pixel` groß erscheint — geklemmt, damit ein
// Griff weder unter 2 cm schrumpft noch ein Zehntel des Gebiets deckt
export function weltGroesse(pixel, abstand, fovGrad, viewportHoehePx,
  { min = 0, max = Infinity } = {}) {
  const w = pixel * weltProPixel(abstand, fovGrad, viewportHoehePx)
  return Math.min(max, Math.max(min, w))
}

// Kameragrenzen aus dem Gebiet: near/far, kleinster und größter Abstand.
// Die alten Festwerte (0,1 / 5000 / 2 / 600) ließen ein 500-m-Gebiet nie
// ganz ins Bild und einen 2-m-Schacht nicht heranzoomen.
export function kameraGrenzen(extent, zMin, zMax) {
  const [x0, y0, x1, y1] = extent
  const groesse = Math.max(x1 - x0, y1 - y0, (zMax ?? 0) - (zMin ?? 0), 1)
  return {
    near: Math.max(groesse / 2000, 0.01),
    far: groesse * 40,
    minDistance: Math.max(groesse / 200, 0.2),
    maxDistance: groesse * 6,
  }
}

export function gebietsGroesse(extent) {
  if (!extent) return Infinity
  return Math.max(extent[2] - extent[0], extent[3] - extent[1], 1)
}

// Das Register: Objekt -> gewünschte Pixelgröße. `basis` ist der Radius
// der Geometrie in Metern, aus dem der Skalierungsfaktor folgt; `modus`
// 'kugel' skaliert gleichmäßig, 'radial' nur den Radius eines Zylinders
// (lokale Achse y bleibt — die Länge eines Klickziels ist Weltmaß).
export function erzeugeMassstab({ holeCamera, holeRenderer, holeGebiet }) {
  const eintraege = new Map()
  const _w = new THREE.Vector3()

  function anmelden(obj, { px, basis, modus = 'kugel', min = 0.02, max }) {
    eintraege.set(obj, { px, basis: Math.max(basis, 1e-9), modus, min, max })
  }

  // beim Leeren einer Gruppe aufgerufen — sonst hielte das Register die
  // entsorgten Meshes fest und skalierte ins Leere
  function abmelden(gruppe) {
    if (!gruppe) return
    gruppe.traverse((o) => eintraege.delete(o))
  }

  function aktualisieren() {
    const cam = holeCamera()
    const el = holeRenderer()?.domElement
    if (!cam || !el || !eintraege.size) return
    const h = el.clientHeight || 1
    const maxWelt = 0.1 * gebietsGroesse(holeGebiet?.())
    for (const [obj, e] of eintraege) {
      obj.getWorldPosition(_w)
      const d = _w.distanceTo(cam.position)
      const ziel = weltGroesse(e.px, d, cam.fov, h,
        { min: e.min, max: Math.min(e.max ?? Infinity, maxWelt) })
      const s = ziel / e.basis
      if (e.modus === 'radial') obj.scale.set(s, 1, s)
      else obj.scale.setScalar(s)
    }
  }

  return { anmelden, abmelden, aktualisieren,
    anzahl: () => eintraege.size }
}
