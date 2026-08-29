// Export-Roundtrip: Mini-PDF bauen → Annotationen einbrennen → Ergebnis
// lädt fehlerfrei, Seitenzahl stimmt, Kommentar-Übersicht hängt an.

import { describe, expect, it } from 'vitest'
import { PDFDocument, degrees } from 'pdf-lib'
import { exportiereMitAnnotationen } from '../services/PdfExporter'

async function miniPdf({ seiten = 2, rotation = 0 } = {}) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < seiten; i++) {
    const page = doc.addPage([300, 400])
    if (rotation) page.setRotation(degrees(rotation))
  }
  return doc.save()
}

const strich = {
  id: 's1', type: 'ink', page: 0, z: 1, tool: 'stift', farbe: '#1d4ed8',
  breitePt: 2, deckkraft: 1, echterDruck: true,
  points: [[20, 20, 0.5], [80, 40, 0.7], [140, 30, 0.6]],
}
const marker = {
  id: 'm1', type: 'ink', page: 0, z: 2, tool: 'textmarker', farbe: '#facc15',
  breitePt: 12, deckkraft: 0.4, echterDruck: false,
  points: [[20, 60, 0.5], [200, 60, 0.5]],
}
const messung = {
  id: 'me1', type: 'measure', kind: 'distance', page: 1, z: 3,
  points: [[10, 10], [110, 10]],
}
const flaeche = {
  id: 'me2', type: 'measure', kind: 'area', page: 1, z: 4,
  points: [[50, 50], [150, 50], [150, 150], [50, 150]],
}
const notiz = {
  id: 'n1', type: 'note', page: 0, z: 5, x: 50, y: 90,
  farbe: '#d97706', text: 'Bitte Höhenkote prüfen — die Achse wirkt verschoben.',
  erledigt: false,
}
const signatur = {
  id: 'sig1', type: 'signature', page: 1, z: 6, x: 100, y: 300, w: 120, h: 40,
  strokes: [[[0, 0.5, 0.5], [0.4, 0.2, 0.6], [1, 0.8, 0.5]]],
  strichBreitePt: 2.5, farbe: '#1e3a8a', echterDruck: true,
}

const volumen = {
  id: 'vol1', type: 'measure', kind: 'volumen', page: 1, z: 7,
  points: [[20, 20], [120, 20], [120, 100], [20, 100]],
  tiefeM: 2, neigungN: 1, auflockerung: 1.25, modus: 'sohle', rechenwegAnzeigen: true,
}

const kalibrierung = { standard: { realProPt: 0.035, einheit: 'm' }, jeSeite: {} }

describe('exportiereMitAnnotationen', () => {
  it('brennt alle Typen ein und bleibt ladbar', async () => {
    const original = await miniPdf()
    const bytes = await exportiereMitAnnotationen(
      original, [strich, marker, messung, flaeche, notiz, signatur, volumen],
      kalibrierung, { kommentarSeite: false },
    )
    const ergebnis = await PDFDocument.load(bytes)
    expect(ergebnis.getPageCount()).toBe(2)
    // Inhalt ist gewachsen (eingebrannte Vektoren), aber kein Raster-Monster
    expect(bytes.length).toBeGreaterThan(original.length)
    expect(bytes.length).toBeLessThan(original.length + 100000)
  })

  it('hängt die Kommentar-Übersicht als zusätzliche Seite an', async () => {
    const original = await miniPdf()
    const bytes = await exportiereMitAnnotationen(
      original, [notiz], null, { kommentarSeite: true },
    )
    const ergebnis = await PDFDocument.load(bytes)
    expect(ergebnis.getPageCount()).toBe(3)
  })

  it('ohne Notizen entsteht KEINE Übersichtsseite', async () => {
    const original = await miniPdf()
    const bytes = await exportiereMitAnnotationen(
      original, [strich], null, { kommentarSeite: true },
    )
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2)
  })

  it('übersteht /Rotate-90-Seiten', async () => {
    const original = await miniPdf({ rotation: 90 })
    // Anzeige einer 300×400-Seite mit /Rotate 90 ist 400 breit / 300 hoch
    const querStrich = { ...strich, points: [[20, 20, 0.5], [380, 280, 0.5]] }
    const bytes = await exportiereMitAnnotationen(
      original, [querStrich, { ...messung, page: 0 }], kalibrierung, {},
    )
    const ergebnis = await PDFDocument.load(bytes)
    expect(ergebnis.getPage(0).getRotation().angle).toBe(90)
  })

  it('ignoriert Annotationen auf nicht (mehr) existierenden Seiten', async () => {
    const original = await miniPdf({ seiten: 1 })
    const bytes = await exportiereMitAnnotationen(
      original, [{ ...strich, page: 7 }], null, {},
    )
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  })
})
