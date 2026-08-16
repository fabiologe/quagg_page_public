// Laubkarten: die Rechenkerne. Geprüft wird das, was die Aussage trägt —
// die Überschreitungskurve (weil der τ_krit-Regler daraus lebt), die
// Tracer-Bilanz (Akzeptanzkriterium der Spezifikation) und die
// Klassengrenzen von Karte C.
import { describe, expect, it } from 'vitest'

import {
  KLASSE, erzeugeTauStufen, flaechenanteile, klassenFeld,
  neueSpuelAggregation, neueTrockenfall, spuelAuswerten, spuelSchritt,
  trockenfallAuswerten, trockenfallSchritt,
} from '../utils/laubkarten'
import {
  abtastGuete, ablagerungskarte, advehiere, saeeTracer, tracerBilanz,
} from '../utils/laubtracer'

const GITTER = { nx: 4, ny: 4, origin: [0, 0, 0], spacing: [1, 1, 0.1] }

describe('Karte B — Überschreitungskurve', () => {
  it('rechnet Dauer und Spülintegral gegen die Handrechnung', () => {
    // EINE Zelle, drei Zeitschritte à 2 s mit τ = 10, 4, 1 Pa
    const stufen = erzeugeTauStufen(10, 24)
    const agg = neueSpuelAggregation(1, stufen)
    for (const tau of [10, 4, 1]) {
      spuelSchritt(agg, new Float32Array([tau]), new Uint8Array([1]), 2)
    }
    const b = spuelAuswerten(agg, 3)

    expect(b.tauMax[0]).toBeCloseTo(10, 6)
    expect(b.dauer).toBe(6)
    // über 3 Pa lagen die Schritte mit 10 und 4 Pa -> 4 s
    expect(b.tExceed[0]).toBeCloseTo(4, 1)
    // ∫(τ−3)+ dt = (10−3)·2 + (4−3)·2 = 16 Pa·s
    expect(b.iSpuel[0]).toBeGreaterThan(14)
    expect(b.iSpuel[0]).toBeLessThan(18)
  })

  it('ein Regler-Zug ändert das Ergebnis, ohne neu zu aggregieren', () => {
    const stufen = erzeugeTauStufen(10, 24)
    const agg = neueSpuelAggregation(1, stufen)
    for (const tau of [10, 4, 1]) {
      spuelSchritt(agg, new Float32Array([tau]), new Uint8Array([1]), 2)
    }
    const niedrig = spuelAuswerten(agg, 0.5)
    const hoch = spuelAuswerten(agg, 8)
    expect(niedrig.tExceed[0]).toBeGreaterThan(hoch.tExceed[0])
    expect(niedrig.iSpuel[0]).toBeGreaterThan(hoch.iSpuel[0])
    expect(spuelAuswerten(agg, 20).iSpuel[0]).toBe(0)   // über dem Maximum
  })

  it('maskiert trockene Zellen — sonst rutschen die Ränder nach unten', () => {
    const agg = neueSpuelAggregation(2, erzeugeTauStufen(10, 24))
    // Zelle 0 nass mit 10 Pa, Zelle 1 trocken (Wert waere Unsinn)
    spuelSchritt(agg, new Float32Array([10, 9]), new Uint8Array([1, 0]), 2)
    const b = spuelAuswerten(agg, 1)
    expect(b.benetzt[0]).toBe(1)
    expect(b.benetzt[1]).toBe(0)
    expect(b.tauMax[1]).toBe(0)
    expect(b.iSpuel[1]).toBe(0)
  })
})

describe('Trockenfallzeit', () => {
  it('merkt sich den letzten nassen Zeitpunkt und normiert ihn', () => {
    const tf = neueTrockenfall(3)
    //                     früh trocken | spät trocken | nie nass
    trockenfallSchritt(tf, new Float32Array([0.5, 0.5, 0]), 0, 0.01)
    trockenfallSchritt(tf, new Float32Array([0.0, 0.5, 0]), 10, 0.01)
    trockenfallSchritt(tf, new Float32Array([0.0, 0.0, 0]), 20, 0.01)
    const t = trockenfallAuswerten(tf)
    expect(t[0]).toBeCloseTo(0, 6)
    expect(t[1]).toBeCloseTo(0.5, 6)
    expect(Number.isNaN(t[2])).toBe(true)
  })
})

describe('Karte C — Verschnitt', () => {
  const A = new Float32Array([0.5, 3.0, 3.0, 3.0])
  const iSpuel = new Float32Array([0, 5, 0, 0])
  const benetzt = new Uint8Array([1, 1, 1, 0])

  it('ordnet die vier Fälle richtig zu', () => {
    const k = klassenFeld(A, iSpuel, benetzt, 2.0, 0)
    expect(Array.from(k)).toEqual([
      KLASSE.UNKRITISCH,   // wenig Laub
      KLASSE.BEOBACHTEN,   // viel Laub, aber gespült
      KLASSE.KRITISCH,     // viel Laub, zu schwach gespült
      KLASSE.TOT,          // viel Laub, nie erreicht
    ])
  })

  it('trennt „nie erreicht" von „zu schwach" — andere Konsequenz', () => {
    const k = klassenFeld(A, iSpuel, benetzt, 2.0, 0)
    expect(k[2]).not.toBe(k[3])
  })

  it('liefert Flächenanteile als Berichtszahl', () => {
    const k = klassenFeld(A, iSpuel, benetzt, 2.0, 0)
    const anteile = flaechenanteile(k, 0.25)
    expect(anteile).toHaveLength(4)
    expect(anteile[KLASSE.KRITISCH].zellen).toBe(1)
    expect(anteile[KLASSE.KRITISCH].flaeche).toBeCloseTo(0.25, 6)
    expect(anteile.reduce((s, a) => s + a.anteil, 0)).toBeCloseTo(1, 6)
  })
})

describe('Karte A — Oberflächentracer', () => {
  const nass = () => new Float32Array(16).fill(0.5)

  it('sät nur auf nasser Fläche aus und bilanziert vollständig', () => {
    const tiefe = new Float32Array(16)
    tiefe[5] = 0.5                                  // eine einzige nasse Zelle
    const z = saeeTracer({ tiefe, ...GITTER, anzahl: 50 })
    expect(z.n).toBeGreaterThan(0)
    for (let m = 0; m < z.n; m++) {
      expect(z.x[m]).toBeGreaterThanOrEqual(1)      // Zelle 5 = (i=1, j=1)
      expect(z.x[m]).toBeLessThanOrEqual(2)
    }
    expect(tracerBilanz(z).stimmt).toBe(true)
  })

  it('treibt mit der Oberflächenströmung und strandet im Trockenen', () => {
    const feldNass = { ux: new Float32Array(16).fill(1), // 1 m/s nach +x
                       uy: new Float32Array(16), tiefe: nass() }
    const trocken = new Float32Array(16)              // alles trockengefallen
    const feldTrocken = { ...feldNass, tiefe: trocken }

    const z = saeeTracer({ tiefe: nass(), ...GITTER, anzahl: 40 })
    const x0 = z.x[0]
    advehiere(z, feldNass, feldNass, 0, 1, GITTER)
    expect(z.x[0]).toBeCloseTo(x0 + 1, 1)             // 1 m/s über 1 s
    expect(tracerBilanz(z).stimmt).toBe(true)

    advehiere(z, feldTrocken, feldTrocken, 1, 2, GITTER)
    const bilanz = tracerBilanz(z)
    expect(bilanz.treibend).toBe(0)                   // alle liegen jetzt
    expect(bilanz.stimmt).toBe(true)
  })

  it('normiert die Karte auf die Gleichverteilung', () => {
    // alle Tracer stranden in EINER Zelle -> Konzentrationsfaktor = Zellzahl
    const z = saeeTracer({ tiefe: nass(), ...GITTER, anzahl: 100 })
    for (let m = 0; m < z.n; m++) { z.x[m] = 0.5; z.y[m] = 0.5; z.lebt[m] = 0 }
    z.gestrandet = z.n
    const { karte } = ablagerungskarte(z, GITTER)
    expect(karte[0]).toBeCloseTo(16, 6)
    let summe = 0
    for (const v of karte) summe += v
    expect(summe).toBeCloseTo(16, 6)                  // Mittel bleibt 1
  })

  it('misst die Abtastgüte der Daten (das CFL, nicht die Rechnung)', () => {
    const ux = new Float32Array(16).fill(0.5)
    const uy = new Float32Array(16)
    // 0,5 m/s bei dx = 1 m und Δt = 1 s -> CFL 0,5
    expect(abtastGuete(ux, uy, 1, [1, 1]).cfl).toBeCloseTo(0.5, 6)
    // dasselbe Feld, aber grob gespeichert -> CFL 2, also unbrauchbar
    expect(abtastGuete(ux, uy, 4, [1, 1]).cfl).toBeCloseTo(2, 6)
  })
})
