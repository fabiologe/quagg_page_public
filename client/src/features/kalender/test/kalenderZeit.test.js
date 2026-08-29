// Reine Datumslogik — läuft in der Zeitzone des Testprozesses; Offset-Fälle rechnen mit dem echten Offset.
import { describe, expect, it } from 'vitest'
import {
  addTage, ausLokalInput, bereichFuer, formatSpanne, ganztagBeginn, ganztagEndeInklusiv, monatsraster,
  parseIso, tagSchluessel, termineJeTag, verschiebe, wochenStart, wochenTage, zuLokalInput,
} from '../services/KalenderZeit'

describe('Raster', () => {
  it('Monatsraster: 42 Tage, beginnt am Montag vor dem 1.', () => {
    const r = monatsraster(2026, 1)          // Februar 2026: der 1. ist ein Sonntag
    expect(r).toHaveLength(42)
    expect(tagSchluessel(r[0])).toBe('2026-01-26')
    expect(r[0].getDay()).toBe(1)
    expect(tagSchluessel(r[41])).toBe('2026-03-08')
  })

  it('Wochenstart ist Montag, auch am Sonntag', () => {
    expect(tagSchluessel(wochenStart(new Date(2026, 8, 6)))).toBe('2026-08-31')   // So 06.09. → Mo 31.08.
    expect(tagSchluessel(wochenStart(new Date(2026, 8, 7)))).toBe('2026-09-07')   // Mo bleibt Mo
    expect(wochenTage(new Date(2026, 8, 9)).map(tagSchluessel)).toEqual([
      '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'])
  })

  it('Bereiche und Verschieben', () => {
    const m = bereichFuer('monat', new Date(2026, 8, 15))
    expect(tagSchluessel(m.von)).toBe('2026-08-31')
    expect(tagSchluessel(m.bis)).toBe('2026-10-12')
    const w = bereichFuer('woche', new Date(2026, 8, 9))
    expect([tagSchluessel(w.von), tagSchluessel(w.bis)]).toEqual(['2026-09-07', '2026-09-14'])
    expect(tagSchluessel(verschiebe(new Date(2026, 0, 31), 'monat', 1))).toBe('2026-02-01')
    expect(tagSchluessel(verschiebe(new Date(2026, 8, 9), 'woche', -1))).toBe('2026-09-02')
    expect(tagSchluessel(addTage(new Date(2026, 2, 29), 1))).toBe('2026-03-30')   // DST-Grenze 29.03.
    expect(tagSchluessel(addTage(new Date(2026, 9, 25), 1))).toBe('2026-10-26')   // DST-Grenze 25.10.
  })
})

describe('termineJeTag', () => {
  const t = (id, beginn, ende, ganztag = false) => ({ id, beginn, ende, ganztag, titel: `T${id}` })

  it('verteilt mehrtägige Termine auf jeden berührten Tag, Ganztag-Ende exklusiv', () => {
    const von = new Date(2026, 8, 1)
    const bis = new Date(2026, 8, 8)
    const karte = termineJeTag([
      t(1, '2026-09-01T08:00:00+00:00', '2026-09-01T09:00:00+00:00'),
      t(2, '2026-09-02T00:00:00+00:00', '2026-09-04T00:00:00+00:00', true),   // 02.+03.
      t(3, '2026-08-30T10:00:00+00:00', '2026-09-30T10:00:00+00:00'),         // reicht über das Fenster
    ], von, bis)
    const ids = k => (karte.get(k) || []).map(x => x.id)
    expect(ids('2026-09-01')).toEqual([3, 1])       // laufender Mehrtagestermin (Beginn 30.08.) steht vorn
    expect(ids('2026-09-02')).toEqual([2, 3])
    expect(ids('2026-09-03')).toEqual([2, 3])
    expect(ids('2026-09-04')).toEqual([3])
    expect(karte.has('2026-08-31')).toBe(false)
    expect(karte.has('2026-09-08')).toBe(false)
  })

  it('Ganztag vor Zeittermin, dann nach Beginn sortiert', () => {
    const karte = termineJeTag([
      t(1, '2026-09-01T10:00:00+00:00', '2026-09-01T11:00:00+00:00'),
      t(2, '2026-09-01T00:00:00+00:00', '2026-09-02T00:00:00+00:00', true),
      t(3, '2026-09-01T07:00:00+00:00', '2026-09-01T08:00:00+00:00'),
    ], new Date(2026, 8, 1), new Date(2026, 8, 2))
    expect(karte.get('2026-09-01').map(x => x.id)).toEqual([2, 3, 1])
  })
})

describe('Formular-Konvertierung', () => {
  it('Roundtrip datetime-local ↔ ISO mit Offset', () => {
    const iso = ausLokalInput('2026-09-01T10:30')
    expect(iso).toMatch(/^2026-09-01T10:30:00[+-]\d{2}:\d{2}$/)
    expect(zuLokalInput(iso)).toBe('2026-09-01T10:30')
    const d = parseIso(iso)
    expect(d.getHours()).toBe(10)
    expect(d.getMinutes()).toBe(30)
    expect(ausLokalInput('')).toBeNull()
    expect(zuLokalInput(null)).toBe('')
  })

  it('Offset entspricht der Ortszeit des Zeitpunkts (Sommer/Winter getrennt)', () => {
    const sommer = new Date(2026, 6, 1, 12)
    const winter = new Date(2026, 0, 1, 12)
    const off = d => -d.getTimezoneOffset()
    const fmt = v => `${v >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(v) / 60)).padStart(2, '0')}:${String(Math.abs(v) % 60).padStart(2, '0')}`
    expect(ausLokalInput('2026-07-01T12:00')).toBe(`2026-07-01T12:00:00${fmt(off(sommer))}`)
    expect(ausLokalInput('2026-01-01T12:00')).toBe(`2026-01-01T12:00:00${fmt(off(winter))}`)
  })

  it('Ganztag: gespeichertes exklusives Ende → inklusiver letzter Tag (per UTC-Datum)', () => {
    expect(ganztagBeginn('2026-09-10T00:00:00+00:00')).toBe('2026-09-10')
    expect(ganztagEndeInklusiv('2026-09-12T00:00:00+00:00')).toBe('2026-09-11')
    expect(ganztagEndeInklusiv('2026-09-11T00:00:00+00:00')).toBe('2026-09-10')
  })
})

describe('formatSpanne', () => {
  it('Ganztag ein- und mehrtägig', () => {
    expect(formatSpanne({ ganztag: true, beginn: '2026-09-10T00:00:00+00:00', ende: '2026-09-11T00:00:00+00:00' })).toBe('10.09.2026 (ganztägig)')
    expect(formatSpanne({ ganztag: true, beginn: '2026-09-10T00:00:00+00:00', ende: '2026-09-12T00:00:00+00:00' })).toBe('10.09.2026 – 11.09.2026 (ganztägig)')
  })
  it('Zeittermin am selben Tag in Ortszeit', () => {
    const b = ausLokalInput('2026-09-01T10:00')
    const e = ausLokalInput('2026-09-01T11:30')
    expect(formatSpanne({ ganztag: false, beginn: b, ende: e })).toBe('Di, 01.09.2026 10:00–11:30')
  })
})
