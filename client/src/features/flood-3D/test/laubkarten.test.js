// Laubkarten: die Rechenkerne. Geprüft wird das, was die Aussage trägt —
// die Überschreitungskurve (weil der τ_krit-Regler daraus lebt), die
// Tracer-Bilanz (Akzeptanzkriterium der Spezifikation) und die
// Klassengrenzen von Karte C.
import { describe, expect, it } from 'vitest'

import {
  KARTEN_EINHEIT, KARTEN_HILFE, KARTEN_NAME, KLASSE, bildunterschrift,
  erzeugeTauStufen, flaechenanteile, jeBenetzt, klassenFeld,
  neueRuheAggregation, neueSpuelAggregation, neueTrockenfall, reglerFuer,
  ruheAuswerten, ruheSchritt, spuelAuswerten, spuelSchritt,
  trockenfallAuswerten, trockenfallSchritt,
} from '../utils/laubkarten'
import { KENNWERTE, einordnen } from '../utils/kennwerte'
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
  it('merkt sich den letzten nassen Zeitpunkt in Sekunden', () => {
    const tf = neueTrockenfall(3)
    //                     früh trocken | spät trocken | nie nass
    trockenfallSchritt(tf, new Float32Array([0.5, 0.5, 0]), 0)
    trockenfallSchritt(tf, new Float32Array([0.0, 0.5, 0]), 10)
    trockenfallSchritt(tf, new Float32Array([0.0, 0.0, 0]), 20)
    const t = trockenfallAuswerten(tf, 0.01)
    // Sekunden seit Laufbeginn statt 0…1: die Normierung versteckte, dass
    // „1" beim Beispiellauf 240 s heisst
    expect(t[0]).toBeCloseTo(0, 6)
    expect(t[1]).toBeCloseTo(10, 6)
    expect(Number.isNaN(t[2])).toBe(true)
  })

  it('macht die Nass-Schwelle zum Regler', () => {
    // Eine Zelle traegt bis t = 5 s drei Zentimeter, danach nur noch einen
    // Millimeterfilm bis t = 9 s. Je nachdem, was man „nass" nennt, faellt
    // sie zu zwei verschiedenen Zeitpunkten trocken — genau das soll der
    // Regler zeigen, ohne dass etwas neu gerechnet wird.
    const tf = neueTrockenfall(1)
    trockenfallSchritt(tf, new Float32Array([0.03]), 0)
    trockenfallSchritt(tf, new Float32Array([0.03]), 5)
    trockenfallSchritt(tf, new Float32Array([0.0015]), 9)
    trockenfallSchritt(tf, new Float32Array([0.0]), 12)

    expect(trockenfallAuswerten(tf, 0.02)[0]).toBeCloseTo(5, 6)
    expect(trockenfallAuswerten(tf, 0.001)[0]).toBeCloseTo(9, 6)
  })

  it('haelt die Bezugsflaeche vom Regler fern', () => {
    // Sonst spraengen die Flaechenanteile in Karte C, sobald jemand an der
    // Nass-Schwelle fuer Karte A' dreht.
    const tf = neueTrockenfall(3)
    trockenfallSchritt(tf, new Float32Array([0.03, 0.002, 0]), 0)
    trockenfallSchritt(tf, new Float32Array([0.0, 0.0, 0]), 5)

    const g = jeBenetzt(tf)
    expect([...g]).toEqual([1, 1, 0])       // der Millimeterfilm zaehlt mit
    // und zwar unabhaengig davon, was der Regler gerade sagt
    expect(Number.isNaN(trockenfallAuswerten(tf, 0.02)[1])).toBe(true)
    expect([...jeBenetzt(tf)]).toEqual([1, 1, 0])
  })
})

describe('Regler je Karte', () => {
  it('nennt nur, was auf die gezeigte Karte wirkt', () => {
    // Ein Bedienelement, das nichts tut, ist schlimmer als keines — es
    // behauptet eine Wirkung.
    expect(reglerFuer('A')).toEqual(['ablagerung'])
    expect(reglerFuer('T')).toEqual(['nass'])
    expect(reglerFuer('B')).toEqual(['tau'])
    expect(reglerFuer('Bt')).toEqual(['tau'])
    expect(reglerFuer('C')).toEqual(['tau', 'ablagerung', 'spuel'])
    expect(reglerFuer('gibtsnicht')).toEqual([])
  })

  it('deckt jede Karte ab', () => {
    for (const k of Object.keys(KARTEN_NAME)) {
      expect(reglerFuer(k).length).toBeGreaterThan(0)
    }
  })
})

describe('Bildunterschrift', () => {
  const basis = {
    leerlauf: 'becken_r006', schwall: 'becken_r007',
    tauKrit: 2, tauHerkunft: 'Vorbelegung', aSchwelle: 2.5, iMin: 0,
    nassTiefe: 0.01, datum: '17.08.2026',
  }

  it('nennt Laufpaar, Karte und Datum', () => {
    const z = bildunterschrift({ ...basis, karte: 'C' })
    expect(z[0]).toMatch(/Karte C/)
    expect(z[0]).toMatch(/becken_r006/)
    expect(z[0]).toMatch(/becken_r007/)
    expect(z[0]).toMatch(/17\.08\.2026/)
  })

  it('nennt nur Schwellen, die auf DIESE Karte wirken', () => {
    // Ein τ_krit unter Karte A' waere eine falsche Faehrte
    const a = bildunterschrift({ ...basis, karte: 'T' }).join(' ')
    expect(a).toMatch(/nass ab 10 mm/)
    expect(a).not.toMatch(/τ_krit/)

    const b = bildunterschrift({ ...basis, karte: 'B' }).join(' ')
    expect(b).toMatch(/τ_krit/)
    expect(b).not.toMatch(/Ablagerung ab/)
  })

  it('haengt bei Karte C die Flaechenanteile an', () => {
    const z = bildunterschrift({ ...basis, karte: 'C',
      anteile: [{ text: 'kritisch', anteil: 0.031 }] }).join(' ')
    expect(z).toMatch(/kritisch 3,1 %/)
  })

  it('meldet eine Bilanz, die nicht aufgeht', () => {
    const gut = bildunterschrift({ ...basis, karte: 'A',
      bilanz: { gestrandet: 10, restwasser: 2, draussen: 1, stimmt: true } })
    expect(gut.join(' ')).not.toMatch(/NICHT AUF/)
    const schlecht = bildunterschrift({ ...basis, karte: 'A',
      bilanz: { gestrandet: 10, restwasser: 2, draussen: 1, stimmt: false } })
    expect(schlecht.join(' ')).toMatch(/BILANZ GEHT NICHT AUF/)
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

describe('Erklärung und Legende je Karte', () => {
  const KARTEN = Object.keys(KARTEN_NAME)

  it('führt jede Karte auf einen vorhandenen Kennwert', () => {
    // Ein umbenannter Schlüssel liesse das Fragezeichen leer, ohne Fehler
    for (const k of KARTEN) {
      expect(KARTEN_HILFE[k], k).toBeTruthy()
      expect(KENNWERTE[KARTEN_HILFE[k]], `${k} -> ${KARTEN_HILFE[k]}`)
        .toBeTruthy()
    }
  })

  it('kennt zu jeder Karte eine Einheit für die Farbskala', () => {
    for (const k of KARTEN) expect(KARTEN_EINHEIT[k], k).toBeDefined()
    expect(KARTEN_EINHEIT.T).toBe('s')
    expect(KARTEN_EINHEIT.B).toBe('N·s/m²')
    expect(KARTEN_EINHEIT.A).toBe('')        // ein Faktor hat keine Einheit
  })

  it('nennt zu JEDER Karte ihre Vereinfachungen', () => {
    // Die Frage, die dahintersteht: „wie ist das mit der Realität
    // einzuordnen?" Jede Karte hat eigene Grenzen — ein gemeinsamer Text
    // für alle fünf verschwiege gerade die Unterschiede.
    for (const k of KARTEN) {
      const e = KENNWERTE[KARTEN_HILFE[k]]
      expect(e.was.length, `${k}: was`).toBeGreaterThan(80)
      expect(e.achtung, `${k}: achtung fehlt`).toBeTruthy()
      expect(e.achtung.length, `${k}: achtung zu knapp`).toBeGreaterThan(120)
    }
  })

  it('benennt die entscheidenden Schwächen ausdrücklich', () => {
    // Nicht irgendein Text — diese vier Punkte sind die, an denen die
    // Karten mit der Wirklichkeit auseinandergehen.
    expect(KENNWERTE.laub_ablagerung.achtung).toMatch(/MASSELOS/)
    expect(KENNWERTE.laub_ablagerung.achtung).toMatch(/EINWEGKOPPLUNG/)
    // τ_krit stammt nicht aus Laubversuchen — die groesste fachliche Luecke
    expect(KENNWERTE.laub_spuelintegral.achtung).toMatch(/NICHT aus\s+Laubversuchen|nicht aus\s+Laubversuchen/i)
    // im Modell verdunstet nichts
    expect(KENNWERTE.laub_trockenfall.achtung).toMatch(/VERDUNSTUNG/)
  })

  it('hält die Stufen aufsteigend — sonst ordnet einordnen() falsch ein', () => {
    for (const k of KARTEN) {
      const stufen = KENNWERTE[KARTEN_HILFE[k]].stufen
      for (let i = 1; i < stufen.length; i++) {
        expect(stufen[i].bis, `${k} Stufe ${i}`)
          .toBeGreaterThan(stufen[i - 1].bis)
      }
    }
  })

  it('ordnet Werte in die richtige Stufe ein', () => {
    expect(einordnen('laub_ablagerung', 0.2).cls).toBe('ok')     // laubfrei
    expect(einordnen('laub_ablagerung', 5).cls).toBe('bad')      // Nest
    // „nie überschritten" ist ein eigener Befund, keine kleine Zahl
    expect(einordnen('laub_ueberschreitung', 0).cls).toBe('bad')
    expect(einordnen('laub_ueberschreitung', 120).cls).toBe('ok')
  })
})

describe('Karte R — Ruhezonen', () => {
  it('zählt den Zeitanteil unter der Schwelle', () => {
    // EINE Zelle: 3 s schnell (1 m/s), 7 s langsam (0,1 m/s)
    const agg = neueRuheAggregation(1)
    ruheSchritt(agg, new Float32Array([1.0]), new Uint8Array([1]), 3)
    ruheSchritt(agg, new Float32Array([0.1]), new Uint8Array([1]), 7)

    expect(ruheAuswerten(agg, 0.3)[0]).toBeCloseTo(70, 0)   // 7 von 10 s
    expect(ruheAuswerten(agg, 2.0)[0]).toBeCloseTo(100, 0)  // alles „ruhig"
    expect(ruheAuswerten(agg, 0.05)[0]).toBeCloseTo(0, 0)   // nichts
  })

  it('zählt nur benetzte Zeit — sonst wäre jede Trockenfläche die ruhigste', () => {
    // Zelle 0: 5 s nass und langsam. Zelle 1: 5 s TROCKEN (v = 0).
    const agg = neueRuheAggregation(2)
    ruheSchritt(agg, new Float32Array([0.1, 0]), new Uint8Array([1, 0]), 5)
    const r = ruheAuswerten(agg, 0.3)

    expect(r[0]).toBeCloseTo(100, 0)
    // die trockene Zelle bekommt KEINEN Wert, nicht etwa 100 %
    expect(Number.isNaN(r[1])).toBe(true)
  })

  it('reagiert auf den Regler ohne neu zu aggregieren', () => {
    const agg = neueRuheAggregation(1)
    for (const v of [0.05, 0.2, 0.5, 1.5]) {
      ruheSchritt(agg, new Float32Array([v]), new Uint8Array([1]), 1)
    }
    const streng = ruheAuswerten(agg, 0.1)[0]
    const mittel = ruheAuswerten(agg, 0.3)[0]
    const weit = ruheAuswerten(agg, 2.0)[0]
    expect(streng).toBeLessThan(mittel)
    expect(mittel).toBeLessThan(weit)
    expect(weit).toBeCloseTo(100, 0)
  })

  it('ist als eigene Karte mit eigener Erklärung geführt', () => {
    // Sie sagt etwas ANDERES als Karte A: abgesunkenes statt schwimmendes
    // Laub, eulersch statt auf Bahnen.
    expect(KARTEN_NAME.R).toMatch(/Ruhezonen/)
    expect(KARTEN_EINHEIT.R).toBe('% der Zeit')
    expect(reglerFuer('R')).toEqual(['ruhe'])
    const e = KENNWERTE[KARTEN_HILFE.R]
    // Der Punkt, an dem man sie sonst überinterpretiert
    expect(e.achtung).toMatch(/KEINE Wahrscheinlichkeit/)
    // und ihr eigentlicher Vorteil gegenüber Karte A
    expect(e.achtung).toMatch(/Advektions-CFL/)
  })
})
