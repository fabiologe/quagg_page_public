// Tests der Trefferermittlung (editor/pick.js): NDC-Umrechnung eines
// Zeigerereignisses, Vorrang von Bauwerken vor Verfeinerungsboxen und die
// Griff-Wahl bei überlappenden Grabbern (Zentrum am Strahl gewinnt).
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { besterGriff, bevorzugterTreffer,
  ndcAusEvent } from '../components/pre/editor/pick'

describe('ndcAusEvent', () => {
  const rect = { left: 100, top: 50, width: 800, height: 600 }

  it('Mitte des Canvas ist (0, 0)', () => {
    const v = ndcAusEvent(500, 350, rect)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(0)
  })
  it('links oben ist (-1, +1), rechts unten (+1, -1)', () => {
    expect(ndcAusEvent(100, 50, rect).toArray()).toEqual([-1, 1])
    expect(ndcAusEvent(900, 650, rect).toArray()).toEqual([1, -1])
  })
})

describe('bevorzugterTreffer', () => {
  const treffer = (kind) => ({ object: { userData: { kind } } })

  it('Bauwerke/Marker gewinnen vor (großen) Verfeinerungsboxen', () => {
    const hits = [treffer('refinement'), treffer('structure')]
    expect(bevorzugterTreffer(hits).object.userData.kind).toBe('structure')
  })
  it('nur Boxen: die vorderste zählt; leer: nichts', () => {
    const hits = [treffer('refinement'), treffer('refinement')]
    expect(bevorzugterTreffer(hits)).toBe(hits[0])
    expect(bevorzugterTreffer([])).toBeNull()
  })
})

describe('besterGriff', () => {
  const strahl = () => {
    const r = new THREE.Raycaster()
    r.set(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, -1))
    return r
  }
  const griff = (idx, x) => ({ object: {
    userData: { handleIdx: idx }, position: new THREE.Vector3(x, 0, 0) } })

  it('bei überlappenden Grabbern gewinnt das Zentrum am Strahl, nicht der vorderste', () => {
    const nah = griff(1, 0.2)
    const fern = griff(0, 2)
    expect(besterGriff([fern, nah], strahl())).toBe(nah.object)
  })
  it('echte Stützpunkte schlagen Zwischenpunkte', () => {
    const plus = { object: { userData: { insertAfter: 0 },
      position: new THREE.Vector3(0, 0, 0) } }
    const ecke = griff(2, 1.5)
    expect(besterGriff([plus, ecke], strahl())).toBe(ecke.object)
  })
  it('nur Zwischenpunkte: der vorderste; leer: nichts', () => {
    const plus = { object: { userData: { insertAfter: 1 },
      position: new THREE.Vector3(0, 0, 0) } }
    expect(besterGriff([plus], strahl())).toBe(plus.object)
    expect(besterGriff([], strahl())).toBeNull()
  })
})
