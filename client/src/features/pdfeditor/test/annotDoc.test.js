// Annotations-Adapter: CanvasAnnotDoc (Bildschirm) und PdfLibAnnotDoc
// (Export) — dieselbe Eingabe, deckungsgleiche Geometrie.

import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib'
import { erstelleCanvasAnnotDoc } from '../services/CanvasAnnotDoc'
import { erstellePdfLibAnnotDoc } from '../services/PdfLibAnnotDoc'

function fakeCtx() {
  const calls = []
  const rec = (name) => (...args) => calls.push([name, ...args])
  return {
    calls,
    beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
    closePath: rec('closePath'), stroke: rec('stroke'), fill: rec('fill'),
    arc: rec('arc'), fillRect: rec('fillRect'), fillText: rec('fillText'),
    setLineDash: rec('setLineDash'), save: rec('save'), restore: rec('restore'),
    translate: rec('translate'), rotate: rec('rotate'),
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    lineJoin: 'round', lineCap: 'round', font: '',
    textAlign: 'center', textBaseline: 'middle',
  }
}

describe('CanvasAnnotDoc', () => {
  it('skaliert je Koordinate (nicht ctx.scale) und schließt den Pfad', () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasAnnotDoc(ctx, { skala: 2 })
    doc.fuellePfad([[10, 20], [30, 20], [30, 40]], { farbe: '#ff0000' })
    expect(ctx.calls).toContainEqual(['moveTo', 20, 40])
    expect(ctx.calls).toContainEqual(['lineTo', 60, 80])
    expect(ctx.calls.map(c => c[0])).toContain('closePath')
    expect(ctx.calls.map(c => c[0])).toContain('fill')
  })

  it('Haarlinien-Klemme greift beim Linienzug', () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasAnnotDoc(ctx, { skala: 0.1, minStrichPx: 0.75 })
    doc.linienzug([[0, 0], [100, 0]], { breitePt: 1 })   // 0.1 px < Klemme
    expect(ctx.lineWidth).toBe(0.75)
  })

  it('Multiply wird gesetzt und wieder zurückgestellt', () => {
    const ctx = fakeCtx()
    const zustaende = []
    const doc = erstelleCanvasAnnotDoc(ctx, { skala: 1 })
    const origFill = ctx.fill
    ctx.fill = (...a) => { zustaende.push(ctx.globalCompositeOperation); origFill(...a) }
    doc.fuellePfad([[0, 0], [10, 0], [10, 10]], { farbe: '#facc15', blend: 'multiply', deckkraft: 0.4 })
    expect(zustaende).toEqual(['multiply'])
    expect(ctx.globalCompositeOperation).toBe('source-over')
    expect(ctx.globalAlpha).toBe(1)
  })

  it('Textrotation kippt das Vorzeichen (Canvas dreht mit dem Uhrzeiger)', () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasAnnotDoc(ctx, { skala: 1 })
    doc.textMitHalo(50, 50, '3,5 m', { winkel: 30 })
    const rot = ctx.calls.find(c => c[0] === 'rotate')
    expect(rot[1]).toBeCloseTo(-(30 * Math.PI) / 180)
  })
})

describe('PdfLibAnnotDoc — Anzeige→PDF-Abbildung', () => {
  async function seiteMit({ breite = 300, hoehe = 400, rotation = 0 } = {}) {
    const doc = await PDFDocument.create()
    const page = doc.addPage([breite, hoehe])
    if (rotation) page.setRotation(degrees(rotation))
    const font = await doc.embedFont(StandardFonts.Helvetica)
    return erstellePdfLibAnnotDoc(page, font)
  }

  it('0°: Ursprung oben links → PDF unten links, y gespiegelt', async () => {
    const a = await seiteMit()
    expect(a._zuPdf(0, 0)).toEqual([0, 400])         // oben links
    expect(a._zuPdf(300, 400)).toEqual([300, 0])     // unten rechts
    expect(a._zuPdf(10, 30)).toEqual([10, 370])
  })

  it('90°: Anzeige ist 400 breit / 300 hoch, Achsen getauscht', async () => {
    const a = await seiteMit({ rotation: 90 })
    // Anzeige-Ursprung (0,0) muss auf PDF (0,0)… prüfen über Rücktransport:
    expect(a._zuPdf(0, 0)).toEqual([0, 0])
    expect(a._zuPdf(400, 0)).toEqual([0, 400])       // Anzeige-x läuft entlang PDF-y
    expect(a._zuPdf(0, 300)).toEqual([300, 0])
  })

  it('180°: beide Achsen gespiegelt', async () => {
    const a = await seiteMit({ rotation: 180 })
    expect(a._zuPdf(0, 0)).toEqual([300, 0])
    expect(a._zuPdf(300, 400)).toEqual([0, 400])
  })

  it('270°: Achsen getauscht und gespiegelt', async () => {
    const a = await seiteMit({ rotation: 270 })
    expect(a._zuPdf(0, 0)).toEqual([300, 400])
    expect(a._zuPdf(400, 300)).toEqual([0, 0])
  })

  it('CropBox-Versatz wandert in die Abbildung ein', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([300, 400])
    page.setCropBox(20, 30, 200, 300)
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const a = erstellePdfLibAnnotDoc(page, font)
    // Anzeige (0,0) = CropBox oben links = PDF (20, 330)
    expect(a._zuPdf(0, 0)).toEqual([20, 330])
    expect(a._zuPdf(200, 300)).toEqual([220, 30])
  })
})
