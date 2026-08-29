// Stufe 16: Bild durch Painter und beide Adapter — Rangordnung (unter der
// Tinte), Canvas-drawImage/Platzhalter, und die pdf-lib-Abbildung für alle
// vier /Rotate-Fälle samt CropBox (Eckenprobe gegen _zuPdf).

import { describe, expect, it, vi } from 'vitest'
import { PDFDocument, degrees } from 'pdf-lib'
import { zeichneAnnotationen } from '../services/AnnotationPainter'
import { erstelleCanvasAnnotDoc } from '../services/CanvasAnnotDoc'
import { erstellePdfLibAnnotDoc } from '../services/PdfLibAnnotDoc'

const bild = { id: 'b1', type: 'bild', page: 0, z: 5, x: 50, y: 60, w: 100, h: 40, bildKey: 'k1' }
const strich = {
  id: 's1', type: 'ink', page: 0, z: 1, tool: 'stift', farbe: '#000', breitePt: 2,
  echterDruck: false, points: [[10, 10, 0.5], [30, 20, 0.5], [60, 15, 0.5]],
}

describe('Painter: bild', () => {
  it('ruft doc.bild mit Box + Key; ausgenommen greift', () => {
    const aufrufe = []
    const doc = { bild: (...a) => aufrufe.push(a), fuellePfad: () => {} }
    zeichneAnnotationen(doc, [bild])
    expect(aufrufe).toEqual([[50, 60, 100, 40, 'k1', { deckkraft: 1 }]])
    aufrufe.length = 0
    zeichneAnnotationen(doc, [bild], { ausgenommen: new Set(['b1']) })
    expect(aufrufe).toHaveLength(0)
  })

  it('liegt UNTER der Tinte — auch mit höherem z', () => {
    const reihenfolge = []
    const doc = {
      bild: () => reihenfolge.push('bild'),
      fuellePfad: () => reihenfolge.push('ink'),
    }
    zeichneAnnotationen(doc, [strich, bild])
    expect(reihenfolge[0]).toBe('bild')
    expect(reihenfolge).toContain('ink')
  })
})

describe('CanvasAnnotDoc.bild', () => {
  function fakeCtx() {
    const calls = []
    return {
      calls,
      globalAlpha: 1, globalCompositeOperation: 'source-over',
      drawImage: (...a) => calls.push(['drawImage', ...a]),
      strokeRect: (...a) => calls.push(['strokeRect', ...a]),
      setLineDash: () => {}, save: () => {}, restore: () => {},
    }
  }

  it('zeichnet das Bitmap skaliert in die Box', () => {
    const ctx = fakeCtx()
    const bitmap = { width: 300, height: 200 }
    const doc = erstelleCanvasAnnotDoc(ctx, { skala: 2, holeBild: () => bitmap })
    doc.bild(10, 20, 100, 40, 'k1', { deckkraft: 1 })
    expect(ctx.calls).toEqual([['drawImage', bitmap, 20, 40, 200, 80]])
  })

  it('ohne Bitmap: gestrichelter Platzhalterrahmen, kein drawImage', () => {
    const ctx = fakeCtx()
    const doc = erstelleCanvasAnnotDoc(ctx, { skala: 1, holeBild: () => null })
    doc.bild(10, 20, 100, 40, 'k1')
    expect(ctx.calls.map(c => c[0])).toEqual(['strokeRect'])
    expect(ctx.calls[0].slice(1)).toEqual([10, 20, 100, 40])
  })
})

describe('PdfLibAnnotDoc.bild — Anker, Maße, Drehung für alle /Rotate-Fälle', () => {
  async function seiteMit(rot) {
    const doc = await PDFDocument.create()
    const page = doc.addPage([300, 400])
    page.setCropBox(10, 20, 280, 360)     // Versatz muss in den Anker
    if (rot) page.setRotation(degrees(rot))
    const font = await doc.embedFont('Helvetica')
    return { page, font }
  }

  for (const rot of [0, 90, 180, 270]) {
    it(`rot=${rot}: Anker = zuPdf(x, y+h), Breite/Höhe unverändert, rotate=${rot}`, async () => {
      const { page, font } = await seiteMit(rot)
      page.drawImage = vi.fn()
      const img = { name: 'fake' }
      const doc = erstellePdfLibAnnotDoc(page, font, { bilder: new Map([['k1', img]]) })
      const [x, y, w, h] = [50, 60, 100, 40]
      doc.bild(x, y, w, h, 'k1', { deckkraft: 0.9 })

      expect(page.drawImage).toHaveBeenCalledTimes(1)
      const [gegeben, o] = page.drawImage.mock.calls[0]
      expect(gegeben).toBe(img)
      expect(o.width).toBe(w)
      expect(o.height).toBe(h)
      expect(o.rotate.angle).toBe(rot)
      expect(o.opacity).toBe(0.9)
      const [ax, ay] = doc._zuPdf(x, y + h)
      expect(o.x).toBeCloseTo(ax)
      expect(o.y).toBeCloseTo(ay)

      // Eckenprobe: das von pdf-lib aufgespannte Rechteck (Anker + u·w + v·h)
      // muss dieselben vier Punkte treffen wie zuPdf der vier Anzeigeecken.
      const rad = (rot * Math.PI) / 180
      const u = [Math.cos(rad), Math.sin(rad)], v = [-Math.sin(rad), Math.cos(rad)]
      const vonPdfLib = [
        [o.x, o.y],
        [o.x + u[0] * w, o.y + u[1] * w],
        [o.x + v[0] * h, o.y + v[1] * h],
        [o.x + u[0] * w + v[0] * h, o.y + u[1] * w + v[1] * h],
      ]
      const erwartet = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => doc._zuPdf(px, py))
      const runde = (p) => p.map(n => Math.round(n * 1000) / 1000).join(',')
      expect(vonPdfLib.map(runde).sort()).toEqual(erwartet.map(runde).sort())
    })
  }

  it('fehlender Key → kein drawImage, kein Wurf', async () => {
    const { page, font } = await seiteMit(0)
    page.drawImage = vi.fn()
    const doc = erstellePdfLibAnnotDoc(page, font, { bilder: new Map() })
    expect(() => doc.bild(0, 0, 10, 10, 'nix')).not.toThrow()
    expect(page.drawImage).not.toHaveBeenCalled()
    // und ganz ohne bilder-Option (alte Aufrufer) ebenso
    const alt = erstellePdfLibAnnotDoc(page, font)
    expect(() => alt.bild(0, 0, 10, 10, 'nix')).not.toThrow()
  })
})
