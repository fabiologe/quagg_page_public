// Stempel (VORABZUG u. a.): der Painter zeichnet Rahmen + Text (+ Datum)
// gedreht um den Mittelpunkt — über den Adapter-Vertrag, damit Bildschirm
// und Export automatisch deckungsgleich sind.

import { describe, expect, it } from 'vitest'
import { zeichneAnnotationen, stempelMasse } from '../services/AnnotationPainter'

function fakeDoc() {
  const aufrufe = []
  return {
    aufrufe,
    fuellePfad: (...a) => aufrufe.push(['fuellePfad', ...a]),
    linienzug: (...a) => aufrufe.push(['linienzug', ...a]),
    fuelleRechteck: (...a) => aufrufe.push(['fuelleRechteck', ...a]),
    kreis: (...a) => aufrufe.push(['kreis', ...a]),
    text: (...a) => aufrufe.push(['text', ...a]),
    textMitHalo: (...a) => aufrufe.push(['textMitHalo', ...a]),
    messeTextBreite: (text, g) => text.length * g * 0.6,
  }
}

const basis = {
  id: 's1', type: 'stempel', page: 0, x: 200, y: 300,
  text: 'VORABZUG', farbe: '#b91c1c', groessePt: 18,
  winkelGrad: 12, mitDatum: true, datum: '22.08.2026',
}

describe('stempelMasse', () => {
  it('Box umschließt den Text mit Polster; die Datumszeile macht sie höher', () => {
    const messe = (t, g) => t.length * g * 0.6
    const mit = stempelMasse(basis, messe)
    const ohne = stempelMasse({ ...basis, mitDatum: false }, messe)
    expect(mit.breite).toBeCloseTo(8 * 18 * 0.6 + 18 * 1.2)
    expect(mit.hoehe).toBeGreaterThan(ohne.hoehe)
    expect(ohne.datumsZeile).toBe(0)
  })
})

describe('Painter: stempel', () => {
  it('zeichnet den geschlossenen Rahmen (5 Punkte) und beide Textzeilen gedreht', () => {
    const doc = fakeDoc()
    zeichneAnnotationen(doc, [basis])
    const rahmen = doc.aufrufe.filter(a => a[0] === 'linienzug')
    const texte = doc.aufrufe.filter(a => a[0] === 'textMitHalo')
    expect(rahmen).toHaveLength(1)
    expect(rahmen[0][1]).toHaveLength(5)                       // 4 Ecken + Schluss
    expect(rahmen[0][1][0]).toEqual(rahmen[0][1][4])           // geschlossen
    expect(texte).toHaveLength(2)                              // Text + Datum
    expect(texte[0][3]).toBe('VORABZUG')
    expect(texte[1][3]).toBe('22.08.2026')
    for (const t of texte) expect(t[4].winkel).toBe(12)
    // Rahmenmitte = Stempelmitte (Drehung um den Mittelpunkt):
    const ecken = rahmen[0][1].slice(0, 4)
    const mx = ecken.reduce((s, p) => s + p[0], 0) / 4
    const my = ecken.reduce((s, p) => s + p[1], 0) / 4
    expect(mx).toBeCloseTo(200)
    expect(my).toBeCloseTo(300)
  })

  it('ohne Datum entfällt die zweite Zeile und der Text sitzt mittig', () => {
    const doc = fakeDoc()
    zeichneAnnotationen(doc, [{ ...basis, mitDatum: false }])
    const texte = doc.aufrufe.filter(a => a[0] === 'textMitHalo')
    expect(texte).toHaveLength(1)
    expect(texte[0][1]).toBeCloseTo(200)
    expect(texte[0][2]).toBeCloseTo(300)
  })
})
