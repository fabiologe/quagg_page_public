/**
 * Die Netz-Kennwerte zeigen, was der SERVER schätzt (Fahrplan B3, 2026-09-23).
 *
 * Auslöser 2026-08-12: Rentrisch_BetaTest06 rechnete mit 0,025-m-Zellen, im
 * Panel standen 0,2 m, 85.331 Zellen und 7 h (gerechnet: 943.370 Zellen,
 * 47 h). Danach rechnete dieses Modul die Schätzung selbst nach — mit 8
 * statt 16 Kernen, anderer Courant-Zahl, alter Wassertiefen-Formel und ohne
 * die Standard-Verfeinerung des Geländes. Jetzt kommt alles aus
 * runner.laufschaetzung / meshgen.zellen_schaetzung; die Formeln sind im
 * Backend getestet (tests/test_netz_schaetzung.py, test_stage5_runner.py).
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { hinweis, kennwerte } from '../utils/simHints'

// vom Backend geschrieben (tests/test_netz_schaetzung.py)
const FIXTURE = JSON.parse(readFileSync(
  new URL('./fixtures/netz_schaetzung.json', import.meta.url), 'utf8'))
const { spec, schaetzung } = FIXTURE

describe('Netz-Kennwerte aus der Serverschätzung', () => {
  it('zeigt Zellen, feinste Zelle, Zeit und Wassertiefe des Servers', () => {
    const k = kennwerte(spec, null, false, schaetzung)
    expect(k.zellen).toBe(schaetzung.gesamt)
    expect(k.zellenQuelle).toBe('server')
    expect(k.feinsteZelle).toBe(schaetzung.lauf.feinste_zelle)
    expect(k.maxStufe).toBe(schaetzung.lauf.max_stufe)
    expect(k.stunden).toBe(schaetzung.lauf.stunden)
    expect(k.kerne).toBe(16)
    expect(k.dt).toBe(schaetzung.lauf.dt)
    expect(k.ausgaben).toBe(schaetzung.lauf.ausgaben)
    expect(k.wassertiefe).toBe(schaetzung.wassertiefe.m)
  })

  it('der Server kennt die Standard-Verfeinerung des Geländes', () => {
    // Fall ohne eigene Flächenverfeinerung für terrain: snappy nimmt Stufe 1
    expect(schaetzung.flaechenschalen).toBeGreaterThan(0)
  })

  it('benutzt den gemessenen Wert nur, solange das Vorschaunetz passt', () => {
    const messung = { cells: 85331 }
    const frisch = kennwerte(spec, messung, false, schaetzung)
    const veraltet = kennwerte(spec, messung, true, schaetzung)
    expect(frisch.zellen).toBe(85331)
    expect(frisch.gemessen).toBe(true)
    // Stunden auf die gemessene Zellzahl umgelegt
    expect(frisch.stunden).toBeCloseTo(
      schaetzung.lauf.stunden * 85331 / schaetzung.gesamt, 9)
    expect(veraltet.gemessen).toBe(false)
    expect(veraltet.zellen).toBe(schaetzung.gesamt)
  })

  it('ohne Serverantwort: nichts erfunden, „–" statt „0"', () => {
    const k = kennwerte(spec, null, false, null)
    expect(k.zellen).toBeNull()
    expect(k.stunden).toBeNull()
    expect(k.wassertiefe).toBeNull()
    const h = hinweis('mesh.base_cell', spec, null, false, null)
    expect(h.text).not.toMatch(/\b0 Zellen/)
    expect(h.text).toMatch(/– Zellen/)
  })

  it('warnt im Hinweistext, wenn feiner gerechnet wird als eingestellt', () => {
    const h = hinweis('mesh.base_cell', spec, null, false, schaetzung)
    expect(h.text).toMatch(/Stufe/)
    expect(h.text).toMatch(new RegExp(schaetzung.lauf.feinstes_aus[0]))
    expect(h.text).toMatch(/16 Kernen/)
  })
})
