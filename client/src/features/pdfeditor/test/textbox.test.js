// Textfeld (Stufe 8c): Maße, Painter-Ausgabe über den Canvas-Adapter,
// Export-Roundtrip über pdf-lib.

import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { textboxMasse, TEXTBOX_POLSTER_PT } from '../services/TextboxMasse'
import { zeichneAnnotationen } from '../services/AnnotationPainter'
import { exportiereMitAnnotationen } from '../services/PdfExporter'

const messeFix = (text, g) => text.length * g * 0.5   // deterministische Messung

function textbox(extra = {}) {
  return {
    id: 't1', type: 'textbox', page: 0, z: 1,
    x: 50, y: 60, text: 'Zeile eins\nlang lang lang',
    schriftGroessePt: 12, textFarbe: '#111827', hintergrundFarbe: '#fef9c3',
    ...extra,
  }
}

describe('textboxMasse', () => {
  it('Box umschließt die längste Zeile plus Polster', () => {
    const m = textboxMasse(textbox(), messeFix)
    expect(m.zeilen).toEqual(['Zeile eins', 'lang lang lang'])
    expect(m.breite).toBeCloseTo(14 * 12 * 0.5 + 2 * TEXTBOX_POLSTER_PT)
    expect(m.hoehe).toBeCloseTo(2 * 12 * 1.3 + 2 * TEXTBOX_POLSTER_PT)
  })

  it('leerer Text ergibt eine Mindestbox', () => {
    const m = textboxMasse(textbox({ text: '' }), messeFix)
    expect(m.breite).toBeGreaterThan(0)
    expect(m.zeilen).toEqual([''])
  })
})

describe('Painter über einen Fake-Adapter', () => {
  function fakeDoc() {
    const aufrufe = []
    return {
      aufrufe,
      fuellePfad: (...a) => aufrufe.push(['fuellePfad', ...a]),
      linienzug: (...a) => aufrufe.push(['linienzug', ...a]),
      fuelleRechteck: (...a) => aufrufe.push(['fuelleRechteck', ...a]),
      kreis: (...a) => aufrufe.push(['kreis', ...a]),
      textMitHalo: (...a) => aufrufe.push(['textMitHalo', ...a]),
      text: (...a) => aufrufe.push(['text', ...a]),
      messeTextBreite: messeFix,
    }
  }

  it('zeichnet Hintergrund-Rechteck und beide Zeilen', () => {
    const doc = fakeDoc()
    zeichneAnnotationen(doc, [textbox()])
    const rechtecke = doc.aufrufe.filter(a => a[0] === 'fuelleRechteck')
    const texte = doc.aufrufe.filter(a => a[0] === 'text')
    expect(rechtecke).toHaveLength(1)
    expect(rechtecke[0][5].farbe).toBe('#fef9c3')
    expect(texte).toHaveLength(2)
    expect(texte[0][3]).toBe('Zeile eins')
    expect(texte[1][3]).toBe('lang lang lang')
    // Zeile 2 sitzt eine Zeilenhöhe (1,3 em) tiefer
    expect(texte[1][2] - texte[0][2]).toBeCloseTo(12 * 1.3)
  })

  it('transparenter Hintergrund zeichnet KEIN Rechteck', () => {
    const doc = fakeDoc()
    zeichneAnnotationen(doc, [textbox({ hintergrundFarbe: 'transparent' })])
    expect(doc.aufrufe.filter(a => a[0] === 'fuelleRechteck')).toHaveLength(0)
    expect(doc.aufrufe.filter(a => a[0] === 'text')).toHaveLength(2)
  })

  it('Bleistift-Strich bekommt Saum + Kern (zwei Füllungen)', () => {
    const doc = fakeDoc()
    zeichneAnnotationen(doc, [{
      id: 's1', type: 'ink', page: 0, z: 1, tool: 'stift', stiftArt: 'bleistift',
      farbe: '#111827', breitePt: 2, echterDruck: true,
      points: [[0, 0, 0.5], [30, 10, 0.6], [60, 5, 0.5]],
    }])
    const fuellungen = doc.aufrufe.filter(a => a[0] === 'fuellePfad')
    expect(fuellungen).toHaveLength(2)
    expect(fuellungen[0][2].deckkraft).toBeCloseTo(0.12)   // Saum zuerst (unten)
    expect(fuellungen[1][2].deckkraft).toBeCloseTo(0.82)
  })
})

describe('Export-Roundtrip mit Textfeld', () => {
  it('brennt das Textfeld ein (inkl. Umlauten) und bleibt ladbar', async () => {
    const quelle = await PDFDocument.create()
    quelle.addPage([300, 400])
    const original = await quelle.save()
    const bytes = await exportiereMitAnnotationen(
      original,
      [textbox({ text: 'Prüfvermerk äöüß\n2. Zeile — mit Strich' })],
      null, {},
    )
    const ergebnis = await PDFDocument.load(bytes)
    expect(ergebnis.getPageCount()).toBe(1)
    expect(bytes.length).toBeGreaterThan(original.length)
  })
})
