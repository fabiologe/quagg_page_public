// Kamera des Editors (aus Editor3D.vue geschnitten): Einpassen aufs
// Gelände oder Gebiet, Grenzen aus dem Gebiet, und die Frage, wann neu
// eingepasst werden muss.
//
// Bis 2026-09-22 passte sich die Kamera genau EINMAL je Mount ein: ein
// Neufall (flat:95, Gebiet 0 … 100) und dann ein Import auf 224 m ließen
// die Szene leer — das Gelände lag 130 m über der Kamera, und die
// Draufsicht fiel auf ein hartes `|| 95` zurück (Audit C1).
import { kameraGrenzen } from './massstab'

// Gebiet des Geländerasters als [x0, y0, x1, y1]
export function gebietAusTerrain(t) {
  if (!t) return null
  const [ny, nx] = t.dims
  return [t.x0, t.y0, t.x0 + (nx - 1) * t.resolution, t.y0 + (ny - 1) * t.resolution]
}

// Neu einpassen, wenn sich das Gebiet um mehr als 20 % seiner Größe
// verschoben oder verändert hat — nicht bei jedem Griffzug am Gebiet,
// wohl aber nach Import, Stand laden oder einem ganz anderen Fall
export function brauchtNeuEinpassen(alt, neu) {
  if (!neu) return false
  if (!alt) return true
  const groesse = Math.max(alt[2] - alt[0], alt[3] - alt[1], 1)
  const dw = Math.abs((neu[2] - neu[0]) - (alt[2] - alt[0]))
  const dh = Math.abs((neu[3] - neu[1]) - (alt[3] - alt[1]))
  const dc = Math.hypot((neu[0] + neu[2] - alt[0] - alt[2]) / 2,
    (neu[1] + neu[3] - alt[1] - alt[3]) / 2)
  return dw / groesse > 0.2 || dh / groesse > 0.2 || dc / groesse > 0.2
}

// Mitte, Größe und mittlere Höhe: aus dem Gelände, sonst aus dem Gebiet
export function lage(terrain, domain) {
  if (terrain) {
    const [x0, y0, x1, y1] = gebietAusTerrain(terrain)
    let zMid = 0
    const n = Math.ceil(terrain.z.length / 7)
    for (let i = 0; i < terrain.z.length; i += 7) zMid += terrain.z[i]
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2,
      groesse: Math.max(x1 - x0, y1 - y0, 1), zMid: zMid / n }
  }
  if (domain) {
    const [x0, y0, x1, y1] = domain.extent
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2,
      groesse: Math.max(x1 - x0, y1 - y0, 1),
      zMid: (domain.z_min + domain.z_max) / 2 }
  }
  return null
}

export function erzeugeKamera({ store, holeCamera, holeControls }) {
  function gebiet() {
    return gebietAusTerrain(store.terrain) ?? store.spec?.domain?.extent ?? null
  }

  // Alles ins Bild: schräg von Süden, oder in der Draufsicht von oben
  function einpassen(draufsicht = false) {
    const camera = holeCamera()
    const controls = holeControls()
    const l = lage(store.terrain, store.spec?.domain)
    if (!camera || !controls || !l) return false
    controls.target.set(l.cx, l.cy, l.zMid)
    if (draufsicht) {
      camera.position.set(l.cx, l.cy, l.zMid + l.groesse * 1.2)
    } else {
      camera.position.set(l.cx, l.cy - l.groesse * 1.1, l.zMid + l.groesse * 0.75)
      camera.up.set(0, 0, 1)
    }
    controls.update()
    return true
  }

  function grenzenAnwenden() {
    const d = store.spec?.domain
    const camera = holeCamera()
    const controls = holeControls()
    if (!d || !camera) return
    const g = kameraGrenzen(d.extent, d.z_min, d.z_max)
    camera.near = g.near
    camera.far = g.far
    camera.updateProjectionMatrix()
    if (controls) {
      controls.minDistance = g.minDistance
      controls.maxDistance = g.maxDistance
    }
  }

  return { gebiet, einpassen, grenzenAnwenden }
}
