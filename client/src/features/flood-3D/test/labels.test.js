// Die konsolidierten Formatierer aus utils/labels: fmtKurz muss exakt so
// formatieren wie die früheren lokalen Kopien in Grundriss/Raum (3D) —
// die Anzeige der Panels darf sich durch den Umzug nicht ändern.
import { describe, expect, it } from 'vitest'
import { fmt, fmtBytes, fmtDauer, fmtFest, fmtKurz,
  fmtZeitpunkt } from '../utils/labels'

describe('fmtKurz (Karten/Legenden, ehem. lokale Kopien)', () => {
  it('3 signifikante Stellen unter 1000', () => {
    expect(fmtKurz(0.12345)).toBe('0.123')
    expect(fmtKurz(12.345)).toBe('12.3')
    expect(fmtKurz(999.4)).toBe('999')
  })
  it('ab 1000 ganzzahlig, ohne Tausenderpunkte', () => {
    expect(fmtKurz(1234.5)).toBe('1235')
    expect(fmtKurz(-4321.9)).toBe('-4322')
  })
  it('null/NaN als Strich', () => {
    expect(fmtKurz(null)).toBe('–')
    expect(fmtKurz(undefined)).toBe('–')
    expect(fmtKurz(NaN)).toBe('–')
  })
})

describe('fmtFest (Import-Dialog, feste Nachkommastellen)', () => {
  it('zwei Nachkommastellen als Vorgabe', () => {
    expect(fmtFest(12.345)).toBe('12.35')
    expect(fmtFest(0)).toBe('0.00')
    expect(fmtFest(null)).toBe('–')
  })
})

describe('fmtBytes (ehem. fmtSize in RunListPanel + Inline-MB)', () => {
  it('unter 1 GB gerundete MB', () => {
    expect(fmtBytes(500e6)).toBe('500 MB')
    expect(fmtBytes(999.4e6)).toBe('999 MB')
    expect(fmtBytes(0)).toBe('0 MB')
    expect(fmtBytes(null)).toBe('0 MB')
  })
  it('ab 1 GB mit einer Nachkommastelle', () => {
    expect(fmtBytes(1e9)).toBe('1.0 GB')
    expect(fmtBytes(1.55e9)).toBe('1.6 GB')
  })
})

describe('fmtDauer (ETA des lokalen Laufs, ehem. useLocalRunStore)', () => {
  it('Sekunden, Minuten, Stunden', () => {
    expect(fmtDauer(45)).toBe('45 s')
    expect(fmtDauer(120)).toBe('2 min')
    expect(fmtDauer(5400)).toBe('1.5 h')
    expect(fmtDauer(null)).toBe('?')
  })
})

describe('fmtZeitpunkt (Geometrie-Stände, Epoch-SEKUNDEN)', () => {
  it('rechnet Sekunden — nicht Millisekunden — in ein Datum um', () => {
    // 1 770 000 000 s liegt 2026, 1 770 000 000 ms dagegen 1970
    expect(fmtZeitpunkt(1_770_000_000)).toContain('26')
    expect(fmtZeitpunkt(1_770_000_000)).toMatch(/\d{1,2}[.:]\d{2}/)
  })
  it('ohne Zeitstempel ein Strich statt „1.1.1970"', () => {
    expect(fmtZeitpunkt(null)).toBe('–')
    expect(fmtZeitpunkt(undefined)).toBe('–')
    expect(fmtZeitpunkt('kaputt')).toBe('–')
  })
})

describe('fmt bleibt unangetastet (Kontrolle)', () => {
  it('de-DE mit Exponent für sehr kleine/große Werte', () => {
    expect(fmt(0.0001)).toBe('1,00e-4')
    expect(fmt(1234.5)).toBe('1.234,5')
  })
})
