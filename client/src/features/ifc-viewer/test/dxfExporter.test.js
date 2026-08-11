// DXF-Export (Sprint T2): R12-Struktur, Rohkoordinaten, Layer, ACI-Farben.

import { describe, expect, it } from 'vitest'
import { DxfBuilder, vectorContentToDxf, nearestAci } from '../services/DxfExporter'

describe('DxfBuilder', () => {
  it('baut ein gültiges R12-Skelett mit Layer-Tabelle und Entities', () => {
    const dxf = new DxfBuilder()
    const layer = dxf.layer('WAND', 1)
    dxf.line(layer, 0, 0, 10, 5)
    const out = dxf.toString()
    expect(out).toContain('SECTION\n2\nTABLES')
    expect(out).toContain('LAYER\n2\nWAND')
    expect(out).toContain('SECTION\n2\nENTITIES')
    expect(out).toContain('LINE')
    expect(out).toContain('11\n10\n21\n5')
    expect(out.trim().endsWith('EOF')).toBe(true)
  })

  it('Polylinie: POLYLINE/VERTEX/SEQEND, geschlossen-Flag', () => {
    const dxf = new DxfBuilder()
    const layer = dxf.layer('TEST')
    dxf.polyline(layer, [[0, 0], [1, 0], [1, 1]], true)
    const out = dxf.toString()
    expect(out).toContain('POLYLINE')
    expect((out.match(/VERTEX/g) ?? [])).toHaveLength(3)
    expect(out).toContain('SEQEND')
    expect(out).toContain('70\n1') // closed
  })

  it('Layer-Namen werden DXF-sicher bereinigt und dedupliziert', () => {
    const dxf = new DxfBuilder()
    const a = dxf.layer('IFC WALL/STANDARD', 3)
    const b = dxf.layer('IFC WALL/STANDARD', 5)
    expect(a).toBe(b)
    expect(a).not.toMatch(/[ /]/)
  })

  it('Text mit Rotation und Zentrierung', () => {
    const dxf = new DxfBuilder()
    dxf.text(dxf.layer('T'), 5, 6, 0.25, 'DN 200', 45, true)
    const out = dxf.toString()
    expect(out).toContain('TEXT')
    expect(out).toContain('50\n45')   // Rotation
    expect(out).toContain('72\n1')    // zentriert
    expect(out).toContain('1\nDN 200')
  })
})

describe('nearestAci', () => {
  it('mappt Grundfarben auf die richtigen Indizes', () => {
    expect(nearestAci(255, 0, 0)).toBe(1)
    expect(nearestAci(0, 0, 0)).toBe(7)
    expect(nearestAci(250, 130, 5)).toBe(30) // orange
  })
})

describe('vectorContentToDxf', () => {
  const content = {
    outlines: [{
      category: 'IFCWALL',
      rings: [[[0, 0], [10, 0], [10, 5], [0, 5], [0, 0]]],
      bbox: { minU: 0, maxU: 10, minV: 0, maxV: 5 },
      label: 'W1',
    }],
    slopeSegments: [{ x1: 0, z1: 0, x2: 5, z2: 0, kind: 'oberkante' }],
    contourLevels: [{ level: 101.5, major: true, polylines: [[{ x: 0, z: 0 }, { x: 5, z: 0 }]] }],
    axisItems: [{ polyline: [{ x: 0, z: 0 }, { x: 30, z: 0 }], label: 'H1 DN200', fontMm: 2 }],
    sectionSegments: null,
    styleFor: () => ({ r: 255, g: 0, b: 0 }),
  }

  it('schreibt Rohkoordinaten: E = x+off, N = −(z+off)', () => {
    const out = vectorContentToDxf(content, { offset: { x: 555000, z: -5745000 }, scaleRatio: 500 })
    // Wandecke (10, 5) → E 555010, N 5744995
    expect(out).toContain('555010')
    expect(out).toContain('5744995')
    // Layer nach Fachthemen
    expect(out).toContain('2\nWALL')
    expect(out).toContain('BOESCHUNG_OK')
    expect(out).toContain('HOEHENLINIEN_HAUPT')
    expect(out).toContain('HALTUNGSACHSEN')
    expect(out).toContain('1\nH1 DN200')
  })

  it('Texthöhe = Papier-mm × Maßstab (2,2 mm bei 1:500 → 1,1 m)', () => {
    const out = vectorContentToDxf(content, { offset: { x: 0, z: 0 }, scaleRatio: 500 })
    expect(out).toContain('40\n1.1')
  })

  it('deaktivierte Kategorien werden ausgelassen', () => {
    const out = vectorContentToDxf(
      { ...content, styleFor: () => ({ enabled: false }) },
      { offset: { x: 0, z: 0 } },
    )
    expect(out).not.toContain('2\nWALL')
  })
})
