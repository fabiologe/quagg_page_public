/**
 * Leerlauf im Formular: der Lauf endet, wenn nichts mehr abläuft.
 *
 * Geprüft wird nicht das Aussehen, sondern das, was beim Bedienen schief
 * gehen kann: eine Prozentangabe, die als Anteil ankommt; eine Vorbelegung,
 * die vom Backend abweicht; und eine Schätzung, die die großzügige
 * Obergrenze für die Rechenzeit hält.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  ABBRUCH_VORGABE, GRENZEN, alsProzent, ausProzent, begrenzen, hinweis,
  kennwerte,
} from '../utils/simHints'

const WURZEL = new URL('..', import.meta.url).pathname
const CASESPEC = join(WURZEL, '../../../../backend/app/api/flood3D',
  'core/casespec.py')

const fall = (abbruch = null, extra = {}) => ({
  domain: { extent: [0, 0, 20, 10], z_min: 100, z_max: 103 },
  mesh: { base_cell: 0.25, refinements: [] },
  solver: { end_time: 600, max_co: 0.5, max_alpha_co: 0.5,
            write_interval_fields: 1, write_interval_series: 1,
            initial_level: 101, abbruch, ...extra },
  boundaries: [],
})

describe('Leerlauf-Vorbelegung', () => {
  it('trägt dieselben Werte ein wie das Backend-Modell', () => {
    // Sonst rechnet ein im Formular angelegter Fall mit einem anderen
    // Kriterium als derselbe Fall aus der YAML — und niemand sähe es.
    const py = readFileSync(CASESPEC, 'utf8')
    const abschnitt = py.slice(py.indexOf('class Abbruch('),
      py.indexOf('class Abbruch(') + 2000)
    const feld = (name) => {
      const m = abschnitt.match(
        new RegExp(`${name}:[^=]*=\\s*Field\\(\\s*([\\d.]+)`))
      return m ? Number(m[1]) : null
    }
    expect(feld('fenster_s')).toBe(ABBRUCH_VORGABE.fenster_s)
    expect(feld('schwelle')).toBe(ABBRUCH_VORGABE.schwelle)
    expect(feld('mindest_abfall')).toBe(ABBRUCH_VORGABE.mindest_abfall)
    expect(ABBRUCH_VORGABE.art).toBe('stagnation')
    // ohne erwartete Dauer: die Schätzung nimmt dann die Obergrenze
    expect(ABBRUCH_VORGABE.erwartete_dauer_s).toBeNull()
  })

  it('liegt innerhalb der Eingabegrenzen', () => {
    for (const feld of ['fenster_s', 'schwelle', 'mindest_abfall']) {
      const pfad = `solver.abbruch.${feld}`
      expect(GRENZEN[pfad]).toBeDefined()
      expect(begrenzen(pfad, ABBRUCH_VORGABE[feld]))
        .toBe(ABBRUCH_VORGABE[feld])
    }
  })
})

describe('Prozent bedienen, Anteil speichern', () => {
  it('rechnet in beide Richtungen ohne Drift', () => {
    // Der teure Fehler wäre 1 % -> 1,0: die Stagnationsschwelle wäre
    // hundertfach zu groß und jeder Leerlauf sofort „fertig".
    expect(ausProzent('1')).toBeCloseTo(0.01, 12)
    expect(ausProzent('5')).toBeCloseTo(0.05, 12)
    expect(alsProzent(0.01)).toBe(1)
    expect(alsProzent(0.05)).toBe(5)
    expect(alsProzent(ausProzent('2,5'.replace(',', '.')))).toBe(2.5)
    expect(alsProzent(undefined)).toBe(0)
  })

  it('kappt Eingaben auf den Wertebereich des Modells', () => {
    expect(begrenzen('solver.abbruch.schwelle', ausProzent('500'))).toBe(1)
    expect(begrenzen('solver.abbruch.mindest_abfall', ausProzent('-10')))
      .toBe(0)
  })
})

describe('Schätzung beim Leerlauf', () => {
  it('rechnet mit der erwarteten Dauer, nicht mit der Obergrenze', () => {
    // Der stille Fallstrick: eine großzügige Obergrenze ist beim Leerlauf
    // die Regel — als Dauer gelesen, meldet das Panel Tage statt Minuten
    // und die Datenmenge um Größenordnungen zu hoch.
    const kurz = kennwerte(fall(null, { end_time: 60 }))
    const lang = kennwerte(fall({ ...ABBRUCH_VORGABE, erwartete_dauer_s: 60 },
      { end_time: 36000 }))
    const ohne = kennwerte(fall({ ...ABBRUCH_VORGABE }, { end_time: 36000 }))

    expect(lang.dauer).toBe(60)
    expect(lang.stunden).toBeCloseTo(kurz.stunden, 6)
    expect(lang.ausgaben).toBe(kurz.ausgaben)
    expect(ohne.stunden).toBeGreaterThan(100 * kurz.stunden)
  })
})

describe('Hinweise am Leerlauf-Formular', () => {
  it('macht aus der Dauer eine Obergrenze und verlangt die Erwartung', () => {
    const h = hinweis('solver.end_time', fall({ ...ABBRUCH_VORGABE }))
    expect(h.text).toMatch(/Obergrenze/)
    expect(h.text).toMatch(/HÖCHSTENS/)
    expect(h.level).toBe('warn')          // erwartete Dauer fehlt

    const mit = hinweis('solver.end_time',
      fall({ ...ABBRUCH_VORGABE, erwartete_dauer_s: 120 }))
    expect(mit.level).toBe('')
    expect(mit.text).toMatch(/120/)

    // ohne Leerlauf unverändert: keine Rede von einer Obergrenze
    expect(hinweis('solver.end_time', fall()).text).not.toMatch(/Obergrenze/)
  })

  it('warnt beim Fenster nach derselben Regel wie die Backend-Prüfung', () => {
    // _pruefe_leerlauf: fenster_s < 2 * write_interval_series. Messen beide
    // Seiten verschieden, warnt eine und die andere nicht — und der Nutzer
    // hält die Warnung im Ergebnis für einen Fehler des Panels.
    const eng = hinweis('solver.abbruch.fenster_s',
      fall({ ...ABBRUCH_VORGABE, fenster_s: 1 }, { write_interval_series: 1 }))
    expect(eng.level).toBe('warn')
    expect(eng.text).toMatch(/Messwert|Punkt/)

    const weit = hinweis('solver.abbruch.fenster_s',
      fall({ ...ABBRUCH_VORGABE, fenster_s: 30 }, { write_interval_series: 1 }))
    expect(weit.level).toBe('')
    expect(weit.text).toMatch(/30 Messwerte/)
  })

  it('nennt die Anlaufsperre beim Namen, wenn sie abgeschaltet wird', () => {
    const h = hinweis('solver.abbruch.mindest_abfall',
      fall({ ...ABBRUCH_VORGABE, mindest_abfall: 0 }))
    expect(h.level).toBe('bad')
    expect(h.text).toMatch(/t ≈ 0/)
  })

  it('sagt bei der erwarteten Dauer, was von ihr abhängt — und was nicht', () => {
    const ohne = hinweis('solver.abbruch.erwartete_dauer_s',
      fall({ ...ABBRUCH_VORGABE }))
    expect(ohne.level).toBe('warn')
    expect(ohne.text).toMatch(/Ausgabegitter|gröber/)

    const zuGross = hinweis('solver.abbruch.erwartete_dauer_s',
      fall({ ...ABBRUCH_VORGABE, erwartete_dauer_s: 9000 },
        { end_time: 600 }))
    expect(zuGross.level).toBe('warn')
    expect(zuGross.text).toMatch(/abgeschnitten/)

    const gut = hinweis('solver.abbruch.erwartete_dauer_s',
      fall({ ...ABBRUCH_VORGABE, erwartete_dauer_s: 120 }))
    expect(gut.level).toBe('')
    // Die Abgrenzung ist der Punkt: der Wert steuert die SCHÄTZUNG, nicht
    // den Abbruch — sonst dreht man daran, um den Lauf zu beenden.
    expect(gut.text).toMatch(/keinen Einfluss/)
  })

  it('warnt, wenn bis zum Leerlauf kein Feld geschrieben würde', () => {
    const h = hinweis('solver.write_interval_fields',
      fall({ ...ABBRUCH_VORGABE, erwartete_dauer_s: 60 },
        { end_time: 36000, write_interval_fields: 100 }))
    expect(h.level).toBe('bad')
    expect(h.text).toMatch(/kein einziger Ausgabezeitpunkt/)
  })
})
