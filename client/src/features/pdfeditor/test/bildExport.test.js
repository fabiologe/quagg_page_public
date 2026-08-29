// Stufe 16: Export-Roundtrip mit eingefügtem Bild — das PNG landet als
// Image-XObject in der PDF, einmal je Key, auch auf gedrehten Seiten;
// fehlende Bytes lassen eine Lücke statt den Export zu werfen.

import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName, PDFRawStream, degrees } from 'pdf-lib'
import { exportiereMitAnnotationen } from '../services/PdfExporter'

// 1×1-RGBA-PNG (pdf-lib legt dafür Bild + SMask an → zwei Image-XObjects)
const PNG_1x1 = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
), c => c.charCodeAt(0))

async function miniPdf({ seiten = 2, rotation = 0 } = {}) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < seiten; i++) {
    const page = doc.addPage([300, 400])
    if (rotation) page.setRotation(degrees(rotation))
  }
  return doc.save()
}

function zaehleBildXObjects(doc) {
  return doc.context.enumerateIndirectObjects().filter(([, o]) =>
    o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')).length
}

const bild = (id, page = 0) => ({
  id, type: 'bild', page, z: 3, x: 40, y: 50, w: 120, h: 80,
  bildKey: 'k-png', mime: 'image/png', natBreite: 1, natHoehe: 1,
})
const bilder = new Map([['k-png', { bytes: PNG_1x1, mime: 'image/png' }]])

describe('Export mit Bildern', () => {
  it('bettet das PNG ein — das Ergebnis lädt und enthält Image-XObjects', async () => {
    const original = await miniPdf()
    const bytes = await exportiereMitAnnotationen(original, [bild('b1')], null, { bilder })
    const ergebnis = await PDFDocument.load(bytes)
    expect(ergebnis.getPageCount()).toBe(2)
    expect(zaehleBildXObjects(ergebnis)).toBeGreaterThanOrEqual(1)
    expect(bytes.length).toBeLessThan(original.length + 20000)
  })

  it('zwei Annotationen mit demselben Key → das Bild wird nicht doppelt eingebettet', async () => {
    const original = await miniPdf()
    const einmal = await PDFDocument.load(
      await exportiereMitAnnotationen(original, [bild('b1')], null, { bilder }))
    const zweimal = await PDFDocument.load(
      await exportiereMitAnnotationen(original, [bild('b1'), bild('b2', 1)], null, { bilder }))
    expect(zaehleBildXObjects(zweimal)).toBe(zaehleBildXObjects(einmal))
  })

  it('/Rotate-90-Seiten bleiben ladbar und gedreht', async () => {
    const original = await miniPdf({ rotation: 90 })
    const bytes = await exportiereMitAnnotationen(original, [bild('b1')], null, { bilder })
    const ergebnis = await PDFDocument.load(bytes)
    expect(ergebnis.getPage(0).getRotation().angle).toBe(90)
    expect(zaehleBildXObjects(ergebnis)).toBeGreaterThanOrEqual(1)
  })

  it('ohne Bild-Bytes (oder unbekannter Key) wirft der Export nicht', async () => {
    const original = await miniPdf()
    const ohne = await exportiereMitAnnotationen(original, [bild('b1')], null, {})
    expect((await PDFDocument.load(ohne)).getPageCount()).toBe(2)
    const fremd = await exportiereMitAnnotationen(original, [bild('b1')], null, { bilder: new Map() })
    expect(zaehleBildXObjects(await PDFDocument.load(fremd))).toBe(0)
  })
})
