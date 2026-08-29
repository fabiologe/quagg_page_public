/**
 * CanvasDoc-Adapter (Sprint P, AP-3).
 *
 * Geprüft wird gegen einen Fake-Kontext, der jeden Aufruf mitschreibt — der
 * Adapter selbst braucht kein DOM. Die vier Punkte, an denen ein solcher
 * Adapter erfahrungsgemäß still danebenliegt, haben je einen eigenen Test:
 * Farbform, Rotationsvorzeichen, Haarlinien und Pufferung.
 */

import { describe, expect, it } from 'vitest'
import { erstelleCanvasDoc } from '../services/CanvasDoc'

function fakeCtx() {
  const calls = []
  const rec = (name) => (...args) => calls.push([name, ...args])
  const ctx = {
    calls,
    beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
    closePath: rec('closePath'), stroke: rec('stroke'), fill: rec('fill'),
    arc: rec('arc'), rect: rec('rect'), fillText: rec('fillText'),
    setLineDash: rec('setLineDash'), drawImage: rec('drawImage'),
    save: rec('save'), restore: rec('restore'),
    translate: rec('translate'), rotate: rec('rotate'),
    // Zustandsfelder: bei jedem stroke/fill den Momentanwert mitschreiben
    strokeStyle: '', fillStyle: '', lineWidth: 0, font: '', globalAlpha: 1,
    textAlign: '', textBaseline: '', lineDashOffset: 0,
  }
  // stroke/fill sollen den Stil festhalten, mit dem sie liefen
  ctx.stroke = (...a) => calls.push(['stroke', { breite: ctx.lineWidth, farbe: ctx.strokeStyle }, ...a])
  ctx.fill = (...a) => calls.push(['fill', { farbe: ctx.fillStyle, alpha: ctx.globalAlpha }, ...a])
  ctx.fillText = (...a) => calls.push(['fillText', ...a, { farbe: ctx.fillStyle, align: ctx.textAlign, baseline: ctx.textBaseline }])
  ctx.nur = (n) => calls.filter(c => c[0] === n)
  ctx.zaehl = (n) => calls.filter(c => c[0] === n).length
  return ctx
}

describe('Maßstab mm → px', () => {
  it('skaliert Koordinaten mit pxProMm', () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasDoc(ctx, { pxProMm: 4 })
    doc.line(10, 20, 30, 40)
    doc.beende()
    expect(ctx.nur('moveTo')[0].slice(1)).toEqual([40, 80])
    expect(ctx.nur('lineTo')[0].slice(1)).toEqual([120, 160])
  })

  it('rechnet Schriftgrade von Punkt in Pixel zurück', () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasDoc(ctx, { pxProMm: 10 })
    doc.setFontSize(2.2 / 0.3528)              // so setzt der Plotter 2,2 mm
    doc.text('x', 0, 0)
    expect(ctx.font).toBe('22px Helvetica, Arial, sans-serif')
  })

  it('skaliert das Strichmuster mit', () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasDoc(ctx, { pxProMm: 4 })
    doc.setLineDashPattern([0.5, 0.5], 0)
    expect(ctx.nur('setLineDash').at(-1)[1]).toEqual([2, 2])
  })
})

describe('Farbformen', () => {
  it('versteht die Ein-Argument-Graustufe genauso wie RGB', () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasDoc(ctx, { pxProMm: 2 })
    doc.setDrawColor(0)                        // jsPDF: Schwarz
    doc.line(0, 0, 1, 1); doc.beende()
    expect(ctx.nur('stroke')[0][1].farbe).toBe('rgb(0,0,0)')

    doc.setDrawColor(141, 110, 99)
    doc.line(0, 0, 1, 1); doc.beende()
    expect(ctx.nur('stroke')[1][1].farbe).toBe('rgb(141,110,99)')
  })

  it('trennt Füllfarbe und Textfarbe', () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasDoc(ctx, { pxProMm: 2 })
    doc.setFillColor(255, 0, 0)
    doc.setTextColor(0, 0, 255)
    doc.circle(1, 1, 1, 'F')
    doc.text('A', 0, 0)
    expect(ctx.nur('fill')[0][1].farbe).toBe('rgb(255,0,0)')
    expect(ctx.nur('fillText')[0].at(-1).farbe).toBe('rgb(0,0,255)')
  })
})

describe('Flächen-Modi', () => {
  it("'FD' füllt zuerst und umrandet danach", () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasDoc(ctx, { pxProMm: 2 })
    doc.circle(5, 5, 1, 'FD')
    const namen = ctx.calls.map(c => c[0])
    expect(namen.indexOf('fill')).toBeLessThan(namen.indexOf('stroke'))
  })

  it("'F' zeichnet keinen Rand", () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasDoc(ctx, { pxProMm: 2 })
    doc.circle(5, 5, 1, 'F')
    expect(ctx.zaehl('stroke')).toBe(0)
  })

  it("'S' füllt nicht", () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasDoc(ctx, { pxProMm: 2 })
    doc.rect(0, 0, 5, 5, 'S')
    expect(ctx.zaehl('fill')).toBe(0)
    expect(ctx.zaehl('stroke')).toBe(1)
  })
})

describe('Textdrehung', () => {
  it('dreht gegen das Canvas-Vorzeichen — sonst steht jedes Label spiegelverkehrt', () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasDoc(ctx, { pxProMm: 1 })
    doc.text('DN300', 10, 20, { angle: -30 })   // so übergibt der Plotter
    expect(ctx.nur('rotate')[0][1]).toBeCloseTo(30 * Math.PI / 180, 9)
    expect(ctx.nur('translate')[0].slice(1)).toEqual([10, 20])
  })

  it('setzt Ausrichtung und Grundlinie durch', () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasDoc(ctx, { pxProMm: 1 })
    doc.text('A', 0, 0, { align: 'center', baseline: 'middle' })
    const t = ctx.nur('fillText')[0].at(-1)
    expect(t.align).toBe('center')
    expect(t.baseline).toBe('middle')
  })

  it('bricht nach der 0,55-Heuristik um, nicht nach measureText', () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasDoc(ctx, { pxProMm: 1 })
    doc.setFontSize(2 / 0.3528)                 // 2 mm Schrift → 1,1 mm je Zeichen
    doc.text('aaaa bbbb cccc', 0, 0, { maxWidth: 5.5 })   // 5 Zeichen je Zeile
    expect(ctx.nur('fillText').map(c => c[1])).toEqual(['aaaa', 'bbbb', 'cccc'])
  })
})

describe('Linienpuffer', () => {
  it('fasst gleichartige Linien zu einem Strich zusammen', () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasDoc(ctx, { pxProMm: 2 })
    for (let i = 0; i < 20; i++) doc.line(i, 0, i + 1, 0)
    doc.beende()
    expect(ctx.zaehl('stroke')).toBe(1)
    expect(ctx.zaehl('beginPath')).toBe(1)
  })

  it('führt zusammenhängende Kanten als einen Pfad', () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasDoc(ctx, { pxProMm: 1 })
    doc.line(0, 0, 10, 0)
    doc.line(10, 0, 10, 10)      // schließt an → kein neues moveTo
    doc.line(50, 50, 60, 60)     // Sprung → neues moveTo
    doc.beende()
    expect(ctx.zaehl('moveTo')).toBe(2)
    expect(ctx.zaehl('lineTo')).toBe(3)
  })

  it('unterbricht bei jedem Stilwechsel', () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasDoc(ctx, { pxProMm: 2 })
    for (let i = 0; i < 20; i++) {
      doc.setLineWidth(0.1 + i / 100)
      doc.line(i, 0, i + 1, 0)
    }
    doc.beende()
    expect(ctx.zaehl('stroke')).toBe(20)
  })

  it('unterbricht vor anderen Primitiven, damit die Reihenfolge stimmt', () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasDoc(ctx, { pxProMm: 2 })
    doc.line(0, 0, 1, 1)
    doc.circle(5, 5, 1, 'F')
    const namen = ctx.calls.map(c => c[0])
    expect(namen.indexOf('stroke')).toBeLessThan(namen.indexOf('fill'))
  })
})

describe('Haarlinien-Klemme', () => {
  it('hält sehr dünne Linien sichtbar', () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasDoc(ctx, { pxProMm: 4, minStrichPx: 1 })
    doc.setLineWidth(0.08)                     // Schraffur: 0,08 mm → 0,32 px
    doc.line(0, 0, 1, 1); doc.beende()
    expect(ctx.nur('stroke')[0][1].breite).toBe(1)
  })

  it('lässt kräftige Linien unangetastet', () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasDoc(ctx, { pxProMm: 4, minStrichPx: 1 })
    doc.setLineWidth(0.5)                      // 2 px
    doc.line(0, 0, 1, 1); doc.beende()
    expect(ctx.nur('stroke')[0][1].breite).toBe(2)
  })
})

describe('Deckkraft', () => {
  it('setzt die jsPDF-GState-Deckkraft auf den Canvas um', () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasDoc(ctx, { pxProMm: 2 })
    doc.saveGraphicsState()
    doc.setGState(doc.GState({ opacity: 0.12 }))
    doc.setFillColor(0)
    doc.rect(0, 0, 10, 10, 'F')
    expect(ctx.nur('fill')[0][1].alpha).toBeCloseTo(0.12, 6)
    doc.restoreGraphicsState()
    doc.rect(0, 0, 10, 10, 'F')
    expect(ctx.nur('fill')[1][1].alpha).toBe(1)
  })
})
