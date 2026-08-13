// Tests der Stanz-Logik (editor/stanz.js): Ausrichtung der Vorschau,
// Flächenlage (senkrecht/waagerecht, Richtungs-Fallback) und die daraus
// gebauten Bearbeitungen — Bohrung, Öffnung, Abschneiden — sowie das
// Versetzen einer gesetzten Bearbeitung an eine neue Trefferstelle.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { baueStanzEdit, flaechenLage, stanzQuat,
  versetzteBearbeitung } from '../components/pre/editor/stanz'

const MASS = { d: 0.8, w: 1.2, h: 0.9 }

describe('stanzQuat', () => {
  it('dreht die z-Achse der Vorschau auf die Flächennormale', () => {
    const n = new THREE.Vector3(1, 0, 0)
    const q = stanzQuat(n)
    const z = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
    expect(z.distanceTo(n)).toBeLessThan(1e-6)
  })
})

describe('flaechenLage', () => {
  it('deckelnah (|n_z| > 0,7) gilt als senkrecht', () => {
    const l = flaechenLage(new THREE.Vector3(3.456, 7.891, 95.2),
      new THREE.Vector3(0.1, 0, 0.99).normalize())
    expect(l.senkrecht).toBe(true)
    expect(l.point).toEqual([3.46, 7.89])
    expect(l.z).toBeCloseTo(95.2)
  })
  it('Wandtreffer: Richtung ist die normierte XY-Normale', () => {
    const l = flaechenLage(new THREE.Vector3(1, 2, 94),
      new THREE.Vector3(3, 4, 0))
    expect(l.senkrecht).toBe(false)
    expect(l.direction).toEqual([0.6, 0.8])
  })
  it('lotrechte Normale fällt auf die Richtung (0, 1) zurück', () => {
    const l = flaechenLage(new THREE.Vector3(1, 2, 94),
      new THREE.Vector3(0, 0, 1))
    expect(l.direction).toEqual([0, 1])
  })
})

describe('baueStanzEdit', () => {
  const punkt = new THREE.Vector3(5.123, 6.789, 95.456)

  it('Bohrung: Kreis mit Durchmesser, Lage aus der Fläche', () => {
    const e = baueStanzEdit({ art: 'bohrung', punkt,
      normale: new THREE.Vector3(0, 1, 0), mass: MASS, nr: 3 })
    expect(e).toEqual({ id: 'bohrung_3', type: 'aussparung', shape: 'kreis',
      point: [5.12, 6.79], direction: [0, 1], z: 95.46, vertikal: false,
      diameter: 0.8 })
  })

  it('Öffnung: Rechteck mit Breite × Höhe', () => {
    const e = baueStanzEdit({ art: 'oeffnung', punkt,
      normale: new THREE.Vector3(1, 0, 0), mass: MASS, nr: 1 })
    expect(e.shape).toBe('rechteck')
    expect(e.width).toBeCloseTo(1.2)
    expect(e.height).toBeCloseTo(0.9)
    expect(e.diameter).toBeUndefined()
  })

  it('Abschneiden: waagerechte Ebene auf Trefferhöhe, unten bleibt', () => {
    const e = baueStanzEdit({ art: 'schnitt', punkt,
      normale: new THREE.Vector3(0, 0, 1), mass: MASS, nr: 2 })
    expect(e).toEqual({ id: 'schnitt_2', type: 'schnitt', achse: 'z',
      position: 95.46, behalten: 'unter' })
  })
})

describe('versetzteBearbeitung', () => {
  it('übernimmt die neue Lage, behält Maße und wirft station weg', () => {
    const alt = { id: 'bohrung_1', type: 'aussparung', shape: 'kreis',
      diameter: 0.5, station: 2.5, point: [1, 1], direction: [1, 0],
      z: 94, vertikal: false }
    const neu = versetzteBearbeitung(alt, new THREE.Vector3(8, 9, 96.5),
      new THREE.Vector3(0, 0, -1))
    expect(neu.point).toEqual([8, 9])
    expect(neu.z).toBeCloseTo(96.5)
    expect(neu.vertikal).toBe(true)
    expect(neu.diameter).toBeCloseTo(0.5)
    expect('station' in neu).toBe(false)
    // das Original bleibt unangetastet (Schreiben erst beim Loslassen)
    expect(alt.station).toBe(2.5)
  })
})
