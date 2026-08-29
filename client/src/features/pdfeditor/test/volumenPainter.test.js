// Stufe 17: Volumen durch den Painter — Sohle, gestrichelte Gegenkontur,
// Böschungskanten, Label und Rechenweg-Block über den Adapter-Vertrag
// (Bildschirm = Export). Plus: alle Texte sind WinAnsi-sicher (pdf-lib).

import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { zeichneAnnotationen } from '../services/AnnotationPainter'
import { volumenAusPolygon, rechenwegZeilen, formatVolumen } from '../services/VolumenMath'

function fakeDoc() {
  const aufrufe = []
  const merk = (name) => (...a) => aufrufe.push([name, ...a])
  return {
    aufrufe,
    fuellePfad: merk('fuellePfad'), linienzug: merk('linienzug'),
    fuelleRechteck: merk('fuelleRechteck'), kreis: merk('kreis'),
    text: merk('text'), textMitHalo: merk('textMitHalo'),
    messeTextBreite: (t, g) => t.length * g * 0.5,
  }
}

const volumen = {
  id: 'v1', type: 'measure', kind: 'volumen', page: 0, z: 1,
  points: [[0, 0], [80, 0], [80, 60], [0, 60]],
  tiefeM: 2, neigungN: 1, auflockerung: 1.25, modus: 'sohle',
}
const kal = { realProPt: 0.1, einheit: 'm' }

describe('Painter: volumen', () => {
  it('zeichnet Sohle, gestrichelte Oberkante + 4 Böschungskanten, Label und 6 Rechenweg-Zeilen', () => {
    const doc = fakeDoc()
    zeichneAnnotationen(doc, [volumen], { messKontext: kal })
    const art = (n) => doc.aufrufe.filter(a => a[0] === n)
    expect(art('fuellePfad')).toHaveLength(1)
    expect(art('kreis')).toHaveLength(4)
    const zuege = art('linienzug')
    const gestrichelt = zuege.filter(z => z[2]?.dashPt?.[0] === 3)
    expect(gestrichelt).toHaveLength(1)                       // die Oberkante
    expect(zuege.filter(z => z[2]?.dashPt?.[0] === 1)).toHaveLength(4)   // Böschungskanten
    // Die Oberkante liegt 20 pt außen (b = 2 m / 0,1 m/pt)
    const ober = gestrichelt[0][1]
    expect(ober[0][0]).toBeCloseTo(-20)
    expect(ober[0][1]).toBeCloseTo(-20)
    expect(art('textMitHalo')[0][3]).toBe('162,67 m³')
    expect(art('fuelleRechteck')).toHaveLength(1)
    const zeilen = art('text').map(t => t[3])
    expect(zeilen).toHaveLength(6)
    expect(zeilen[4]).toContain('162,67 m³')
    expect(zeilen[5]).toContain('203,33 m³')
  })

  it('rechenwegAnzeigen:false → nur Label, kein Block', () => {
    const doc = fakeDoc()
    zeichneAnnotationen(doc, [{ ...volumen, rechenwegAnzeigen: false }], { messKontext: kal })
    expect(doc.aufrufe.filter(a => a[0] === 'text')).toHaveLength(0)
    expect(doc.aufrufe.filter(a => a[0] === 'fuelleRechteck')).toHaveLength(0)
  })

  it('unkalibriert: Label „unkalibriert", keine Gegenkontur, kein Block', () => {
    const doc = fakeDoc()
    zeichneAnnotationen(doc, [volumen], {})
    expect(doc.aufrufe.find(a => a[0] === 'textMitHalo')[3]).toBe('unkalibriert')
    expect(doc.aufrufe.filter(a => a[0] === 'linienzug')).toHaveLength(1)   // nur die Sohle
    expect(doc.aufrufe.filter(a => a[0] === 'text')).toHaveLength(0)
  })

  it('Oberkante zu tief: Label „Tiefe zu groß", keine Gegenkontur', () => {
    const doc = fakeDoc()
    zeichneAnnotationen(doc, [{ ...volumen, modus: 'oberkante', tiefeM: 4 }], { messKontext: kal })
    expect(doc.aufrufe.find(a => a[0] === 'textMitHalo')[3]).toBe('Tiefe zu groß')
    expect(doc.aufrufe.filter(a => a[0] === 'linienzug')).toHaveLength(1)
  })

  it('alle Rechenweg-Texte und Labels sind mit pdf-lib-Helvetica (WinAnsi) kodierbar', async () => {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const varianten = [
      { tiefeM: 2, neigungN: 1, modus: 'sohle' },
      { tiefeM: 2, neigungN: 0, modus: 'sohle' },
      { tiefeM: 2, neigungN: 1.5, modus: 'oberkante' },
    ]
    for (const v of varianten) {
      const e = volumenAusPolygon({ points: volumen.points, realProPt: 0.1, ...v })
      for (const zeile of rechenwegZeilen(e, { auflockerung: 1.25 })) {
        expect(() => font.widthOfTextAtSize(zeile, 6)).not.toThrow()
      }
      expect(() => font.widthOfTextAtSize(formatVolumen(e.V), 8)).not.toThrow()
    }
    expect(() => font.widthOfTextAtSize('Tiefe zu groß', 8)).not.toThrow()
  })
})
