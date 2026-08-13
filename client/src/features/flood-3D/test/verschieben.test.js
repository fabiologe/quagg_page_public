// Tests des Randbedingungs-Umzugs (editor/verschieben.js): Fensterbreite
// je Fensterform, nächstgelegene Gebietsseite unterm Cursor, Fensterlage
// entlang der Kante und der Vorschaurahmen auf der Zielseite.
import { describe, expect, it } from 'vitest'
import { bcBreite, bcFensterLage, bcRahmenPunkte,
  naechsteSeite } from '../components/pre/editor/verschieben'

const EXTENT = [0, 0, 24, 18]
const SEITE = { face: 'x_min', lo: 0, hi: 18, t: 9 }

describe('bcBreite', () => {
  it('ohne Fenster: die ganze Seite', () => {
    expect(bcBreite({}, SEITE)).toBe(18)
    expect(bcBreite(null, SEITE)).toBe(18)
  })
  it('span, diameter und Trapezbreiten, je an der Seite gedeckelt', () => {
    expect(bcBreite({ window: { span: [4, 10] } }, SEITE)).toBe(6)
    expect(bcBreite({ window: { diameter: 2.5 } }, SEITE)).toBe(2.5)
    expect(bcBreite({ window: { top_width: 3, bottom_width: 1.5 } }, SEITE))
      .toBe(3)
    expect(bcBreite({ window: { span: [-10, 30] } }, SEITE)).toBe(18)
  })
  it('follow-Fenster ohne Maße: volle Seite', () => {
    expect(bcBreite({ window: { follow: 'sohle' } }, SEITE)).toBe(18)
  })
})

describe('naechsteSeite', () => {
  it('wählt die Seite mit dem kleinsten Abstand', () => {
    expect(naechsteSeite(EXTENT, { x: 1, y: 9 }).face).toBe('x_min')
    expect(naechsteSeite(EXTENT, { x: 23, y: 9 }).face).toBe('x_max')
    expect(naechsteSeite(EXTENT, { x: 12, y: 1 }).face).toBe('y_min')
    expect(naechsteSeite(EXTENT, { x: 12, y: 17 }).face).toBe('y_max')
  })
  it('klemmt die Lage t an die Kantenenden', () => {
    const s = naechsteSeite(EXTENT, { x: -3, y: 40 })
    expect(s.face).toBe('x_min')
    expect(s.t).toBe(18)
    expect([s.lo, s.hi]).toEqual([0, 18])
  })
})

describe('bcFensterLage', () => {
  it('legt das Fenster mittig unter den Cursor', () => {
    expect(bcFensterLage({ lo: 0, hi: 18, t: 9 }, 4)).toBe(7)
  })
  it('klemmt an den Kantenenden', () => {
    expect(bcFensterLage({ lo: 0, hi: 18, t: 0.5 }, 4)).toBe(0)
    expect(bcFensterLage({ lo: 0, hi: 18, t: 17.5 }, 4)).toBe(14)
  })
  it('volle Breite beginnt am Anfang der Seite', () => {
    expect(bcFensterLage({ lo: 0, hi: 18, t: 9 }, 18)).toBe(0)
  })
})

describe('bcRahmenPunkte', () => {
  const domain = { extent: EXTENT, z_min: 92, z_max: 100 }

  it('x_min: Rahmen in der Ebene x = x0, Fenster entlang y', () => {
    const pts = bcRahmenPunkte(domain, 'x_min', 4, 6)
    expect(pts).toHaveLength(4)
    expect(pts.every((p) => p.x === 0)).toBe(true)
    expect(pts.map((p) => p.y)).toEqual([4, 10, 10, 4])
    expect(pts.map((p) => p.z)).toEqual([92, 92, 100, 100])
  })
  it('y_max: Rahmen in der Ebene y = y1, Fenster entlang x', () => {
    const pts = bcRahmenPunkte(domain, 'y_max', 2, 5)
    expect(pts.every((p) => p.y === 18)).toBe(true)
    expect(pts.map((p) => p.x)).toEqual([2, 7, 7, 2])
  })
})
