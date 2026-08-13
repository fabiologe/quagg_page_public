// Tests der Klemm-Ebenen (editor/clip.js): Regler-Spanne, Freischneide-
// Ebene mit Richtung, Renderer-Anwendung und der Gebietsbeschnitt des
// Geländekörpers samt Aufheben (globales Clipping-Flag, Audit F6).
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { beschnittEbenen, clipBereich, clipEbene, koerperBeschneiden,
  wendeClipAn } from '../components/pre/editor/clip'

const EXTENT = [10, 20, 50, 80]

describe('clipBereich', () => {
  it('liefert die Spanne der gewählten Achse', () => {
    expect(clipBereich(EXTENT, 'x')).toEqual([10, 50])
    expect(clipBereich(EXTENT, 'y')).toEqual([20, 80])
  })
})

describe('clipEbene', () => {
  it('schneidet ohne Flip alles oberhalb der Position weg (x)', () => {
    const e = clipEbene('x', 30, false)
    // sichtbar bleibt, was positiven Abstand hat: x < 30
    expect(e.distanceToPoint(new THREE.Vector3(25, 0, 0))).toBeGreaterThan(0)
    expect(e.distanceToPoint(new THREE.Vector3(35, 0, 0))).toBeLessThan(0)
  })
  it('Flip dreht die Richtung um', () => {
    const e = clipEbene('x', 30, true)
    expect(e.distanceToPoint(new THREE.Vector3(35, 0, 0))).toBeGreaterThan(0)
  })
  it('y-Achse nutzt die y-Normale', () => {
    const e = clipEbene('y', 50, false)
    expect(e.normal.toArray()).toEqual([0, -1, 0])
    expect(e.distanceToPoint(new THREE.Vector3(0, 40, 0))).toBeGreaterThan(0)
  })
})

describe('wendeClipAn', () => {
  it('setzt und räumt die Renderer-Ebenen', () => {
    const renderer = { clippingPlanes: [], localClippingEnabled: false }
    wendeClipAn(renderer, { aktiv: true, axis: 'x', pos: 30, flip: false })
    expect(renderer.localClippingEnabled).toBe(true)
    expect(renderer.clippingPlanes).toHaveLength(1)
    wendeClipAn(renderer, { aktiv: false })
    expect(renderer.localClippingEnabled).toBe(false)
    expect(renderer.clippingPlanes).toHaveLength(0)
  })
})

describe('beschnittEbenen', () => {
  it('Punkte im Gebiet liegen auf der positiven Seite ALLER vier Ebenen', () => {
    const ebenen = beschnittEbenen(EXTENT)
    const drin = new THREE.Vector3(30, 50, 5)
    const draussen = new THREE.Vector3(5, 50, 5)
    expect(ebenen).toHaveLength(4)
    expect(ebenen.every((e) => e.distanceToPoint(drin) > 0)).toBe(true)
    expect(ebenen.some((e) => e.distanceToPoint(draussen) < 0)).toBe(true)
  })
})

describe('koerperBeschneiden', () => {
  const teil = () => ({ material: { clippingPlanes: null, needsUpdate: false } })

  it('setzt vier Ebenen auf jedes Material und schaltet Clipping ein', () => {
    const renderer = { localClippingEnabled: false }
    const teile = [teil(), teil(), {}]           // eines ohne Material (Kanten)
    koerperBeschneiden({ renderer, teile, extent: EXTENT, clipAktiv: false })
    expect(renderer.localClippingEnabled).toBe(true)
    expect(teile[0].material.clippingPlanes).toHaveLength(4)
    expect(teile[1].material.needsUpdate).toBe(true)
  })

  it('hebt den Beschnitt auf — das globale Flag nur, wenn Freischneiden es nicht braucht', () => {
    const renderer = { localClippingEnabled: true }
    const teile = [teil()]
    koerperBeschneiden({ renderer, teile, extent: null, clipAktiv: true })
    expect(renderer.localClippingEnabled).toBe(true)   // Freischneiden aktiv
    expect(teile[0].material.clippingPlanes).toBeNull()
    koerperBeschneiden({ renderer, teile, extent: null, clipAktiv: false })
    expect(renderer.localClippingEnabled).toBe(false)
  })

  it('tut ohne Teile gar nichts (Renderer bleibt unberührt)', () => {
    const renderer = { localClippingEnabled: true }
    koerperBeschneiden({ renderer, teile: [], extent: null, clipAktiv: false })
    expect(renderer.localClippingEnabled).toBe(true)
  })
})
