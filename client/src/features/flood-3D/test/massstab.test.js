// Bildschirm-Maßstab und Kamera (E4a): Pixel -> Meter über den
// Kameraabstand, Kameragrenzen aus dem Gebiet, Neu-Einpassen.
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { erzeugeMassstab, gebietsGroesse, kameraGrenzen, weltGroesse,
  weltProPixel } from '../components/pre/editor/massstab'
import { brauchtNeuEinpassen, gebietAusTerrain,
  lage } from '../components/pre/editor/kamera'

describe('weltProPixel', () => {
  it('d = 100 m, fov 50°, 1000 px hoch -> 0,0933 m je Pixel', () => {
    expect(weltProPixel(100, 50, 1000)).toBeCloseTo(0.0933, 4)
  })
  it('ist linear im Abstand', () => {
    expect(weltProPixel(200, 50, 1000) / weltProPixel(100, 50, 1000)).toBeCloseTo(2)
  })
  it('klemmt die Weltgröße', () => {
    expect(weltGroesse(7, 100, 50, 1000, { min: 1 })).toBe(1)
    expect(weltGroesse(7, 100, 50, 1000, { max: 0.1 })).toBe(0.1)
  })
})

describe('Rundlauf durch eine PerspectiveCamera', () => {
  it.each([2, 20, 200, 2000])('bei d = %s m erscheint der Griff 7 px groß', (d) => {
    const hoehe = 800
    const cam = new THREE.PerspectiveCamera(50, 1.5, 0.01, 1e5)
    cam.position.set(0, -d, 0)
    cam.up.set(0, 0, 1)
    cam.lookAt(0, 0, 0)
    cam.updateMatrixWorld()
    const r = weltGroesse(7, d, cam.fov, hoehe)
    const mitte = new THREE.Vector3(0, 0, 0).project(cam)
    const rand = new THREE.Vector3(0, 0, r).project(cam)
    const px = Math.abs(rand.y - mitte.y) / 2 * hoehe
    expect(px).toBeCloseTo(7, 0)
  })
})

describe('kameraGrenzen', () => {
  it.each([[12, 12], [120, 80], [5000, 3000]])(
    'Gebiet %s × %s m: near < minDistance < maxDistance < far, alles im Bild',
    (w, h) => {
      const g = kameraGrenzen([0, 0, w, h], 0, 10)
      expect(g.near).toBeLessThan(g.minDistance)
      expect(g.minDistance).toBeLessThan(g.maxDistance)
      expect(g.maxDistance).toBeLessThan(g.far)
      // der Einpass-Abstand (≈ 1,35 × Größe) liegt innerhalb der Grenzen
      expect(g.maxDistance).toBeGreaterThan(Math.max(w, h) * 1.5)
      expect(g.minDistance).toBeLessThan(Math.max(w, h) / 50)
    })
  it('das alte 600-m-Limit ließ 500 m nie ins Bild', () => {
    expect(kameraGrenzen([0, 0, 500, 500], 0, 20).maxDistance).toBeGreaterThan(600)
  })
})

describe('Register skaliert nach Abstand', () => {
  it('nah groß, fern klein — gleiche Pixelzahl', () => {
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    cam.position.set(0, 0, 0)
    const nah = new THREE.Mesh(new THREE.SphereGeometry(0.3))
    nah.position.set(0, 0, -10)
    const fern = new THREE.Mesh(new THREE.SphereGeometry(0.3))
    fern.position.set(0, 0, -100)
    const gruppe = new THREE.Group()
    gruppe.add(nah, fern)
    gruppe.updateMatrixWorld(true)
    const m = erzeugeMassstab({ holeCamera: () => cam,
      holeRenderer: () => ({ domElement: { clientHeight: 1000 } }),
      holeGebiet: () => [0, 0, 1000, 1000] })
    m.anmelden(nah, { px: 7, basis: 0.3 })
    m.anmelden(fern, { px: 7, basis: 0.3 })
    m.aktualisieren()
    expect(fern.scale.x / nah.scale.x).toBeCloseTo(10, 1)
    expect(nah.scale.x * 0.3).toBeCloseTo(weltGroesse(7, 10, 50, 1000), 6)
    m.abmelden(gruppe)
    expect(m.anzahl()).toBe(0)
  })
  it('radial skaliert nur den Radius eines Zylinders', () => {
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    const z = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 8))
    z.position.set(0, 0, -20)
    z.updateMatrixWorld(true)
    const m = erzeugeMassstab({ holeCamera: () => cam,
      holeRenderer: () => ({ domElement: { clientHeight: 1000 } }),
      holeGebiet: () => null })
    m.anmelden(z, { px: 6, basis: 0.35, modus: 'radial' })
    m.aktualisieren()
    expect(z.scale.y).toBe(1)
    expect(z.scale.x).toBeCloseTo(z.scale.z)
    expect(z.scale.x).not.toBeCloseTo(1)
  })
  it('deckelt auf ein Zehntel des Gebiets', () => {
    expect(gebietsGroesse([0, 0, 12, 13])).toBe(13)
    expect(gebietsGroesse(null)).toBe(Infinity)
  })
})

describe('Kamera einpassen', () => {
  const t = { x0: 10, y0: 20, resolution: 0.5, dims: [3, 5],
    z: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) }
  it('gebietAusTerrain: Knoten, nicht Zellen', () => {
    expect(gebietAusTerrain(t)).toEqual([10, 20, 12, 21])
  })
  it('ein Neufall passt sich ein, ein Griffzug am Gebiet nicht, ein Import schon', () => {
    expect(brauchtNeuEinpassen(null, [0, 0, 100, 100])).toBe(true)
    expect(brauchtNeuEinpassen([0, 0, 100, 100], [0, 0, 110, 100])).toBe(false)
    expect(brauchtNeuEinpassen([0, 0, 100, 100], [-1, -2, 101, 98])).toBe(false)
    expect(brauchtNeuEinpassen([0, 0, 100, 100], [0, 0, 12, 12])).toBe(true)
    expect(brauchtNeuEinpassen([0, 0, 100, 100], [500, 500, 600, 600])).toBe(true)
    expect(brauchtNeuEinpassen([0, 0, 100, 100], null)).toBe(false)
  })
  it('lage: aus dem Gelände, sonst aus dem Gebiet — nie aus einer festen 95', () => {
    const l = lage(t, null)
    expect(l.cx).toBe(11)
    expect(l.cy).toBe(20.5)
    expect(l.groesse).toBe(2)
    const d = lage(null, { extent: [0, 0, 50, 74], z_min: 222.55, z_max: 227.57 })
    expect(d.cx).toBe(25)
    expect(d.zMid).toBeCloseTo(225.06)
    expect(lage(null, null)).toBeNull()
  })
})
