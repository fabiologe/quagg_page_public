/**
 * Die ganze Kette an einem erfundenen, aber ehrlichen Fall.
 *
 * Die Einzelteile (Überschreitungskurve, Tracer, Klassen) haben eigene
 * Tests. Hier wird geprüft, dass sie ZUSAMMEN die richtige Geschichte
 * erzählen — genau die Verdrahtung, die im Panel steckt:
 *
 *   Ein Becken läuft nach links leer. In der Mitte liegt eine Senke, auf
 *   die die Oberflächenströmung von beiden Seiten zuläuft. Der Spülschwall
 *   belastet die Sohle überall kräftig, nur die Senke liegt im Schatten.
 *   Erwartete Aussage: genau die Senke ist kritisch.
 */
import { describe, expect, it } from 'vitest'

import {
  KLASSE, erzeugeTauStufen, flaechenanteile, klassenFeld,
  neueSpuelAggregation, neueTrockenfall, spuelAuswerten, spuelSchritt,
  jeBenetzt, trockenfallAuswerten, trockenfallSchritt, zeitGewichte,
} from '../utils/laubkarten'
import {
  ablagerungskarte, abschliessen, advehiere, saeeTracer, tracerBilanz,
} from '../utils/laubtracer'

const NX = 24
const NY = 8
const GEO = { nx: NX, ny: NY, origin: [0, 0], spacing: [0.5, 0.5] }
const SENKE = 14                       // Spaltenindex der Senke
const H_NASS = 0.02

// Leerlauf: überall fallender Spiegel, in der Senke bleibt eine Pfütze.
// Die Oberflächenströmung läuft von beiden Seiten auf die Senke zu.
function leerlaufSchritt(t) {
  const tiefe = new Float32Array(NX * NY)
  const ux = new Float32Array(NX * NY)
  const uy = new Float32Array(NX * NY)
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const col = j * NX + i
      const senke = Math.abs(i - SENKE) <= 1
      tiefe[col] = senke ? 0.30 : Math.max(0, 0.30 - 0.03 * t)
      // 0,1 m/s auf die Senke zu — bei dx = 0,5 m und dt = 1 s ist das
      // ein Advektions-CFL von 0,2, also sauber abgetastet
      ux[col] = senke ? 0 : (i < SENKE ? 0.1 : -0.1)
    }
  }
  return { tiefe, ux, uy }
}

function leerlaufDurchrechnen() {
  const zeiten = Array.from({ length: 16 }, (_, i) => i)
  const tf = neueTrockenfall(NX * NY)
  let zustand = null
  let vorher = null
  for (const t of zeiten) {
    const f = leerlaufSchritt(t)
    trockenfallSchritt(tf, f.tiefe, t)
    if (vorher === null) {
      zustand = saeeTracer({ ...GEO, tiefe: f.tiefe, anzahl: 4000 })
    } else {
      advehiere(zustand, vorher, f, t - 1, t, GEO)
    }
    vorher = f
  }
  // Was jetzt noch treibt, liegt in einer Restpfütze — und gehört auf die
  // Karte, sonst bleibt ausgerechnet die Senke leer
  abschliessen(zustand)
  const trocken = trockenfallAuswerten(tf, H_NASS)
  // Bezugsflaeche aus der feinsten Stufe — unabhaengig davon, was der
  // Nass-Regler gerade sagt (siehe laubkarten.test.js)
  const gueltig = jeBenetzt(tf)
  const { karte } = ablagerungskarte(zustand, { ...GEO, gueltig })
  return { zustand, trocken, gueltig, ablagerung: karte }
}

// Spülschwall: 6 s lang 8 N/m² überall — außer im Schatten der Senke,
// dort nur 0,5 N/m². Randspalte bleibt trocken (der Schwall kommt nicht an).
function schwallDurchrechnen() {
  const zeiten = [0, 1, 2, 3, 4, 5, 6]
  const agg = neueSpuelAggregation(NX * NY, erzeugeTauStufen(40))
  const gewichte = zeitGewichte(zeiten)
  zeiten.forEach((t, k) => {
    const tau = new Float32Array(NX * NY)
    const nass = new Uint8Array(NX * NY)
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const col = j * NX + i
        if (i === NX - 1) continue                 // tote Ecke: nie benetzt
        nass[col] = 1
        tau[col] = Math.abs(i - SENKE) <= 1 ? 0.5 : 8.0
      }
    }
    spuelSchritt(agg, tau, nass, gewichte[k])
  })
  return agg
}

describe('Zeitgewichte', () => {
  it('summieren sich zur Ereignisdauer, Enden zählen halb', () => {
    const w = zeitGewichte([0, 1, 2, 3])
    expect([...w]).toEqual([0.5, 1, 1, 0.5])
    expect([...w].reduce((a, b) => a + b, 0)).toBe(3)   // = t_ende − t_start
  })

  it('kommt mit ungleichen Abständen klar', () => {
    const w = zeitGewichte([0, 1, 5])
    expect([...w]).toEqual([0.5, 2.5, 2])
    expect([...w].reduce((a, b) => a + b, 0)).toBe(5)
  })
})

describe('Laubkarten-Kette', () => {
  const leer = leerlaufDurchrechnen()
  const agg = schwallDurchrechnen()

  it('sammelt das Laub in der Senke', () => {
    const inSenke = []
    const draussen = []
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const v = leer.ablagerung[j * NX + i]
        if (Math.abs(i - SENKE) <= 1) inSenke.push(v)
        else if (i > 2 && i < NX - 2) draussen.push(v)
      }
    }
    const mittelSenke = inSenke.reduce((a, b) => a + b, 0) / inSenke.length
    const mittelSonst = draussen.reduce((a, b) => a + b, 0) / draussen.length
    // Der Konzentrationsfaktor ist eine RELATIVE Aussage: die Senke trägt
    // ein Mehrfaches ihrer Umgebung. Absolute Zahlen wären hier
    // Scheingenauigkeit — sie hingen an Driftweite und Trocknungsdauer
    // dieses erfundenen Feldes.
    expect(mittelSenke).toBeGreaterThan(2 * mittelSonst)
    expect(mittelSonst).toBeGreaterThan(0.5)   // ringsum bleibt Laub liegen
  })

  it('verliert dabei keinen Tracer', () => {
    // Ohne diese Bilanz wäre eine leere Karte nicht von einer verlorenen
    // Saat zu unterscheiden.
    const b = tracerBilanz(leer.zustand)
    expect(b.stimmt).toBe(true)
    expect(b.treibend).toBe(0)                 // nach dem Abschluss
    expect(b.gestrandet).toBeGreaterThan(0)    // auf trockengefallenem Boden
    expect(b.restwasser).toBeGreaterThan(0)    // in der stehenden Pfütze
    expect(b.abgelagert).toBe(b.gestrandet + b.restwasser)
  })

  it('misst die Spüldauer als Ereignisdauer, nicht als Schrittzahl', () => {
    expect(agg.dauer).toBeCloseTo(6, 6)
  })

  it('nennt genau die Senke kritisch', () => {
    const s = spuelAuswerten(agg, 2.0)
    // Schwelle 1,5: die Senke trägt gut das Doppelte der Umgebung, diese
    // rund die mittlere Belegung — dazwischen liegt die Grenze
    const klassen = klassenFeld(leer.ablagerung, s.iSpuel, s.benetzt,
      1.5, 0)
    const mitte = 3 * NX                       // Zeile j = 3
    // Das Laub liegt auf dem KONVERGENZSAUM der Senke, nicht in ihrer
    // Mitte: dort geht die Oberflächengeschwindigkeit gegen null, und ein
    // Tracer bleibt stehen, sobald er ankommt — er wandert nicht weiter
    // bis zum Tiefpunkt. Gemessen: Rand 3,2…3,8-fache Belegung,
    // Mitte 1,0…1,4. Genau dieses Bild kennt man aus der Praxis.
    expect(klassen[mitte + SENKE - 1]).toBe(KLASSE.KRITISCH)
    expect(klassen[mitte + SENKE + 1]).toBe(KLASSE.KRITISCH)
    expect(klassen[mitte + 5]).toBe(KLASSE.UNKRITISCH)

    // Und die Kennzahl für den Bericht bleibt ein kleiner Anteil
    const anteile = flaechenanteile(klassen, 0.25, leer.gueltig)
    const kritisch = anteile.find((a) => a.klasse === KLASSE.KRITISCH)
    expect(kritisch.anteil).toBeGreaterThan(0)
    expect(kritisch.anteil).toBeLessThan(0.25)
  })

  it('reagiert auf τ_krit — und die tote Fläche gerade NICHT', () => {
    // Das ist die Aussage hinter dem Regler: über 8 N/m² gilt auch der
    // gespülte Bereich als zu schwach belastet …
    const streng = spuelAuswerten(agg, 12.0)
    const kStreng = klassenFeld(leer.ablagerung, streng.iSpuel,
      streng.benetzt, 0.5, 0)
    const mitte = 3 * NX
    expect(kStreng[mitte + 5]).toBe(KLASSE.KRITISCH)

    // … die nie benetzte Randspalte bleibt aber „tote Fläche", egal wie
    // der Regler steht: dorthin kommt der Schwall gar nicht erst.
    for (const tau of [0.1, 2.0, 12.0]) {
      const s = spuelAuswerten(agg, tau)
      const k = klassenFeld(leer.ablagerung, s.iSpuel, s.benetzt, 0.0, 0)
      expect(k[mitte + NX - 1]).toBe(KLASSE.TOT)
    }
  })

  it('bezieht die Flächenanteile auf das Becken, nicht auf das Gebiet', () => {
    const s = spuelAuswerten(agg, 2.0)
    const klassen = klassenFeld(leer.ablagerung, s.iSpuel, s.benetzt, 2.0, 0)
    const mitGueltig = flaechenanteile(klassen, 0.25, leer.gueltig)
    const summe = mitGueltig.reduce((a, x) => a + x.anteil, 0)
    expect(summe).toBeCloseTo(1, 9)
  })
})
