// Blattlage, Maßstab, Ausschnitt (Sprint P, AP-5) — reine Arithmetik.

import { describe, expect, it } from 'vitest'
import {
  BLATT_FORMATE, MASSSTAB_LEITER, zeichenflaeche, haelften, frustumFuerBlatt,
  zentriereAufBounds, passendenMassstab, massstabSchritt, begrenzeMitte,
  bildschirmZuMm, zoomFuerBlatt,
} from '../services/PlanViewport'
import { makePaperTransform } from '../services/IfcVectorPlotter'

describe('zeichenflaeche', () => {
  it('zieht Ränder und Schriftfeld ab', () => {
    // A3 quer = 420 × 297 → 400 × 237
    expect(zeichenflaeche('A3', 'landscape')).toMatchObject({ dw: 400, dh: 237 })
    expect(zeichenflaeche('A3', 'portrait')).toMatchObject({ dw: 277, dh: 360 })
  })

  it('fällt bei unbekanntem Format auf A3 zurück', () => {
    expect(zeichenflaeche('A9', 'portrait')).toEqual(zeichenflaeche('A3', 'portrait'))
  })

  it('deckt alle Formate ab', () => {
    for (const f of Object.keys(BLATT_FORMATE)) {
      const { dw, dh } = zeichenflaeche(f, 'landscape')
      expect(dw).toBeGreaterThan(0)
      expect(dh).toBeGreaterThan(0)
    }
  })
})

describe('frustumFuerBlatt', () => {
  const { dw, dh } = zeichenflaeche('A3', 'landscape')   // 400 × 237

  it('deckt bei 1:100 genau 40 m Blattbreite ab', () => {
    const f = frustumFuerBlatt({ mitte: { x: 0, z: 0 }, massstab: 100, dw, dh })
    expect(f.right - f.left).toBeCloseTo(40, 9)          // 400 mm × 100 / 1000
    expect(f.top - f.bottom).toBeCloseTo(23.7, 9)
  })

  it('liefert genau die Form, die auch die Kamera speichert', () => {
    const f = frustumFuerBlatt({ mitte: { x: 5, z: -7 }, hoeheY: 12, massstab: 200, dw, dh })
    expect(Object.keys(f).sort()).toEqual([
      'bottom', 'drawHeightMm', 'drawWidthMm', 'left', 'position', 'right',
      'scaleRatio', 'target', 'top', 'up', 'viewDir',
    ])
    expect(f.up).toEqual([0, 0, -1])
    expect(f.viewDir).toBe('top')
    expect(f.scaleRatio).toBe(200)
    expect(f.target).toEqual([5, 12, -7])
  })

  it('legt die gewählte Mitte auf die Blattmitte — geprüft über die echte Transform', () => {
    const mitte = { x: 123, z: -45 }
    const f = frustumFuerBlatt({ mitte, massstab: 500, dw, dh })
    const p = makePaperTransform(f, 10, dw, dh)
    expect(p.toX(mitte.x)).toBeCloseTo(10 + dw / 2, 9)
    expect(p.toY(mitte.z)).toBeCloseTo(10 + dh / 2, 9)
  })

  it('nimmt eine fehlende Mitte klaglos', () => {
    const f = frustumFuerBlatt({ massstab: 100, dw, dh })
    expect(f.target).toEqual([0, 0, 0])
  })
})

describe('passendenMassstab', () => {
  const { dw, dh } = zeichenflaeche('A3', 'landscape')   // 400 × 237 mm

  it('wählt die kleinste Sprosse, auf der alles Platz hat', () => {
    // 380 × 230 m passen erst bei 1:1000 (400 m × 237 m)
    const bounds = { minX: 0, maxX: 380, minZ: 0, maxZ: 230 }
    expect(passendenMassstab({ bounds, dw, dh })).toBe(1000)
  })

  it('nimmt für ein kleines Bauwerk den feinsten Maßstab', () => {
    const bounds = { minX: 0, maxX: 12, minZ: 0, maxZ: 8 }
    expect(passendenMassstab({ bounds, dw, dh })).toBe(MASSSTAB_LEITER[0])
  })

  it('liefert auch für Übergroßes den gröbsten Maßstab statt null', () => {
    const bounds = { minX: 0, maxX: 90000, minZ: 0, maxZ: 90000 }
    expect(passendenMassstab({ bounds, dw, dh })).toBe(2000)
  })

  it('verkraftet fehlende und entartete Ausdehnungen', () => {
    expect(passendenMassstab({ bounds: null, dw, dh })).toBe(100)
    expect(passendenMassstab({ bounds: { minX: 5, maxX: 5, minZ: 5, maxZ: 5 }, dw, dh })).toBe(50)
  })
})

describe('massstabSchritt', () => {
  it('geht die Leiter hoch und runter', () => {
    expect(massstabSchritt(100, 1)).toBe(200)
    expect(massstabSchritt(100, -1)).toBe(50)
  })

  it('läuft an den Enden nicht über', () => {
    expect(massstabSchritt(50, -1)).toBe(50)
    expect(massstabSchritt(2000, 1)).toBe(2000)
  })
})

describe('begrenzeMitte', () => {
  const bounds = { minX: 0, maxX: 100, minZ: 0, maxZ: 50 }
  const halb = { halbW: 20, halbH: 12 }

  it('lässt Rand um das Modell zu', () => {
    expect(begrenzeMitte({ x: -15, z: 60 }, bounds, halb)).toEqual({ x: -15, z: 60 })
  })

  it('hält das Modell im Bild', () => {
    expect(begrenzeMitte({ x: -500, z: 900 }, bounds, halb)).toEqual({ x: -20, z: 62 })
  })

  it('ohne Ausdehnung wird nicht geklemmt', () => {
    expect(begrenzeMitte({ x: 999, z: -999 }, null, halb)).toEqual({ x: 999, z: -999 })
  })
})

describe('Bildschirm-Umrechnung', () => {
  it('rechnet Pixel abzüglich Versatz in Papier-mm', () => {
    expect(bildschirmZuMm(240, 100, { pxProMm: 4, versatz: { x: 40, y: 20 } }))
      .toEqual({ x: 50, y: 20 })
  })

  it('passt das ganze Blatt in den Bereich', () => {
    // A3 quer = 420 × 297 mm in ein 840 × 600 px Fenster
    const z = zoomFuerBlatt({ w: 840, h: 600 }, 'A3', 'landscape')
    expect(z).toBeCloseTo(2 * 0.94, 6)          // Breite ist die Klemme
    expect(420 * z).toBeLessThanOrEqual(840)
    expect(297 * z).toBeLessThanOrEqual(600)
  })

  it('liefert ohne Bereich einen brauchbaren Wert', () => {
    expect(zoomFuerBlatt({ w: 0, h: 0 }, 'A3', 'landscape')).toBe(1)
  })
})

describe('zentriereAufBounds', () => {
  it('nimmt vorhandene Mittelwerte', () => {
    expect(zentriereAufBounds({ centerX: 7, centerZ: -3 })).toEqual({ x: 7, z: -3 })
  })

  it('rechnet sie sonst aus', () => {
    expect(zentriereAufBounds({ minX: 0, maxX: 10, minZ: -4, maxZ: 4 })).toEqual({ x: 5, z: 0 })
  })

  it('ohne Ausdehnung: Ursprung', () => {
    expect(zentriereAufBounds(null)).toEqual({ x: 0, z: 0 })
  })
})

describe('haelften', () => {
  it('rechnet Papier-mm über den Maßstab in Weltmeter', () => {
    expect(haelften(100, 400, 200)).toEqual({ halbW: 20, halbH: 10 })
  })
})
