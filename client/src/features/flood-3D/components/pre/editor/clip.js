// Klemm-Ebenen der ANSICHT (aus Editor3D.vue geschnitten): das
// interaktive Freischneiden (Innenräume, Geländeeinbindung) und der
// Beschnitt des Geländekörpers beim Ziehen am Gebiet. Kein Eingriff ins
// Modell — nur der Renderer bekommt Ebenen gesetzt.
import * as THREE from 'three'

// Schieberegler-Spanne der Schnittachse (rein rechenbar)
export function clipBereich(extent, axis) {
  const [x0, y0, x1, y1] = extent
  return axis === 'x' ? [x0, x1] : [y0, y1]
}

// Die eine Klemm-Ebene des Freischneidens (rein rechenbar)
export function clipEbene(axis, pos, flip) {
  const x = axis === 'x'
  const sign = flip ? 1 : -1
  const normal = new THREE.Vector3(x ? sign : 0, x ? 0 : sign, 0)
  return new THREE.Plane(normal, -sign * pos)
}

// Freischneiden auf den Renderer anwenden (oder aufheben)
export function wendeClipAn(renderer, { aktiv, axis, pos, flip }) {
  if (!renderer) return
  if (!aktiv) {
    renderer.clippingPlanes = []
    renderer.localClippingEnabled = false
    return
  }
  renderer.localClippingEnabled = true
  renderer.clippingPlanes = [clipEbene(axis, pos, flip)]
}

// Die vier senkrechten Beschnitt-Ebenen eines Gebietszuschnitts —
// alles außerhalb von extent liegt auf der negativen Seite (rein rechenbar)
export function beschnittEbenen(extent) {
  const [x0, y0, x1, y1] = extent
  return [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -x0),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), x1),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -y0),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), y1),
  ]
}

// Beschnitt NUR am Geländekörper, nicht global: sonst würden Griffe und
// Bauwerke mit weggeschnitten. Ohne Gebiet wird der Beschnitt aufgehoben.
export function koerperBeschneiden({ renderer, teile, extent, clipAktiv }) {
  if (!teile.length) return
  let ebenen = null
  if (extent) {
    renderer.localClippingEnabled = true
    ebenen = beschnittEbenen(extent)
  }
  // Beim Aufheben auch das globale Clipping-Flag zurücknehmen — sonst
  // bleibt es bis zum nächsten „Freischneiden"-Toggle hängen (Audit F6).
  // Nur, wenn das Freischneiden es nicht selbst gerade braucht.
  if (!extent && !clipAktiv) renderer.localClippingEnabled = false
  // auch die Körperkanten mitschneiden — sonst stehen sie beim Ziehen
  // über den neuen Zuschnitt hinaus
  for (const teil of teile) {
    if (!teil.material) continue
    teil.material.clippingPlanes = ebenen
    teil.material.needsUpdate = true
  }
}
