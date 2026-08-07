// Punktsymbole (Sprint T1): Zeichenaufrufe gegen ein Mock-doc prüfen.

import { describe, expect, it } from 'vitest'
import { drawPlanSymbol, PLAN_SYMBOL_NAMES } from '../services/PlanSymbols'

function mockDoc() {
  const calls = []
  const rec = (name) => (...args) => { calls.push([name, ...args]) }
  return {
    calls,
    setDrawColor: rec('setDrawColor'),
    setFillColor: rec('setFillColor'),
    setLineWidth: rec('setLineWidth'),
    setLineDashPattern: rec('setLineDashPattern'),
    line: rec('line'),
    circle: rec('circle'),
    triangle: rec('triangle'),
    rect: rec('rect'),
  }
}

describe('drawPlanSymbol', () => {
  it('Schacht = Kreis + Diagonalkreuz an der richtigen Stelle', () => {
    const doc = mockDoc()
    expect(drawPlanSymbol(doc, 'schacht', 50, 60, 4, { r: 90, g: 60, b: 40 })).toBe(true)
    const circle = doc.calls.find(c => c[0] === 'circle')
    expect(circle.slice(1, 4)).toEqual([50, 60, 2]) // r = size/2
    const lines = doc.calls.filter(c => c[0] === 'line')
    expect(lines).toHaveLength(2) // Diagonalkreuz
    // Farbwahl kommt an
    expect(doc.calls.find(c => c[0] === 'setDrawColor').slice(1)).toEqual([90, 60, 40])
  })

  it('Pumpe = Kreis + gefülltes Dreieck', () => {
    const doc = mockDoc()
    drawPlanSymbol(doc, 'pumpe', 0, 0, 3, { r: 0, g: 0, b: 0 })
    expect(doc.calls.some(c => c[0] === 'circle')).toBe(true)
    const tri = doc.calls.find(c => c[0] === 'triangle')
    expect(tri[tri.length - 1]).toBe('F') // gefüllt
  })

  it('unbekanntes Symbol → false (Caller behält die Kontur)', () => {
    const doc = mockDoc()
    expect(drawPlanSymbol(doc, 'gibtEsNicht', 0, 0, 3, {})).toBe(false)
    expect(doc.calls.filter(c => !c[0].startsWith('set'))).toHaveLength(0)
  })

  it('alle deklarierten Symbole zeichnen ohne Fehler', () => {
    for (const name of PLAN_SYMBOL_NAMES) {
      const doc = mockDoc()
      expect(drawPlanSymbol(doc, name, 10, 10, 3, { r: 1, g: 2, b: 3 })).toBe(true)
      expect(doc.calls.length).toBeGreaterThan(1)
    }
  })

  it('Mindestgröße wird erzwungen (r ≥ 0.6 mm)', () => {
    const doc = mockDoc()
    drawPlanSymbol(doc, 'schacht', 0, 0, 0.1, {})
    const circle = doc.calls.find(c => c[0] === 'circle')
    expect(circle[3]).toBeGreaterThanOrEqual(0.6)
  })
})
