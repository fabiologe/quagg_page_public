/**
 * Der Belag-Pinsel malt KENNUNGEN, keine Höhen.
 *
 * Daraus folgen drei Abweichungen vom Gelände-Pinsel, und jede davon ist
 * eine Entscheidung, kein Zufall:
 *
 *   * gesetzt statt addiert — eine Kennung ist eine Zuordnung,
 *   * harter Rand — eine Rauheit kennt kein Dazwischen,
 *   * Kennung 0 ist der Radiergummi.
 *
 * Getestet wird die reine Mechanik: Strich → Maske in Gitterindizes, so
 * wie sie zum Server geht. Der Raycast und die Einfärbung brauchen eine
 * Szene und bleiben der Handprobe vorbehalten.
 */
import { describe, expect, it, vi } from 'vitest'

import { erzeugeBelagPinsel, pinselZellen }
  from '../components/pre/editor/belagPinsel'

function pinsel(ids = null, nx = 8, ny = 6) {
  const store = {
    belag: { dims: [ny, nx], x0: 0, y0: 0, resolution: 1,
      ids: ids ?? new Int16Array(nx * ny) },
    belaege: [{ id: 1, name: 'Beton', ks: 0.002, farbe: '#888888' }],
    terrain: { dims: [ny, nx], x0: 0, y0: 0, resolution: 1,
      z: new Float32Array(nx * ny) },
    terrainSolid: false,
    belagMalen: vi.fn().mockResolvedValue([]),
    ladeBelagskarte: vi.fn().mockResolvedValue(null),
  }
  const leer = () => ({})
  const p = erzeugeBelagPinsel({
    store,
    groups: {},                       // kein Netz: Einfärbung faellt aus
    holeScene: () => ({ add: leer, remove: leer }),
    holeCamera: leer,
    holeRenderer: () => ({ domElement: { getBoundingClientRect: leer } }),
    holeControls: () => ({ enabled: true }),
    melden: vi.fn(),
  })
  return { p, store }
}

describe('Belag-Pinsel', () => {
  it('hat einen HARTEN Rand — eine Rauheit kennt kein Dazwischen', () => {
    // Der Geländepinsel verläuft nach außen aus (cos²-Gewicht). Bei einer
    // Kennung gäbe das eine Mischung, die es nicht gibt.
    const g = { x0: 0, y0: 0, res: 1, nx: 11, ny: 11 }
    const zellen = pinselZellen(5, 5, 2, 'kreis', g)

    // Mittelpunkt drin, genau auf dem Radius drin, knapp außerhalb raus
    expect(zellen).toContain(5 * 11 + 5)
    expect(zellen).toContain(5 * 11 + 7)      // Abstand exakt 2
    expect(zellen).not.toContain(5 * 11 + 8)  // Abstand 3
    // Ecke des umschriebenen Quadrats: beim Kreis draußen
    expect(zellen).not.toContain(7 * 11 + 7)  // Abstand 2·√2
  })

  it('trennt Kreis und Quadrat', () => {
    const g = { x0: 0, y0: 0, res: 1, nx: 11, ny: 11 }
    const kreis = pinselZellen(5, 5, 2, 'kreis', g)
    const quadrat = pinselZellen(5, 5, 2, 'quadrat', g)

    expect(quadrat.length).toBe(25)           // 5 x 5
    expect(kreis.length).toBeLessThan(quadrat.length)
    expect(quadrat).toContain(7 * 11 + 7)     // die Ecke gehört dazu
  })

  it('bleibt am Rasterrand stehen', () => {
    const g = { x0: 0, y0: 0, res: 1, nx: 4, ny: 4 }
    const zellen = pinselZellen(0, 0, 5, 'quadrat', g)
    expect(zellen.length).toBe(16)            // das ganze Raster, nicht mehr
    expect(Math.max(...zellen)).toBe(15)
  })

  it('rechnet Manning aus k_s wie Strickler', () => {
    // n = ks^(1/6)/26 — die Bruecke zur 2D-Welt. Gegenprobe an
    // Tabellenwerten: Beton 0,002 m -> rund 0,014
    const n = (ks) => ks ** (1 / 6) / 26
    expect(n(0.002)).toBeCloseTo(0.0136, 3)
    expect(n(0.03)).toBeCloseTo(0.0214, 3)
    expect(n(0.1)).toBeCloseTo(0.0264, 3)
  })

  it('bietet Radiergummi und Formen an', () => {
    const { p } = pinsel()
    expect(p.aktiv.value).toBe(0)          // Vorgabe: loeschen
    expect(p.form.value).toBe('kreis')
    p.form.value = 'quadrat'
    expect(p.form.value).toBe('quadrat')
  })

  it('meldet, wenn es kein Geländeraster gibt', async () => {
    const { p, store } = pinsel()
    store.belag = null
    store.ladeBelagskarte = vi.fn().mockResolvedValue(null)

    expect(await p.einschalten()).toBe(false)
    expect(store.ladeBelagskarte).toHaveBeenCalled()
  })

  it('schaltet ein, wenn ein Raster da ist', async () => {
    const { p } = pinsel()
    expect(await p.einschalten()).toBe(true)
  })
})
