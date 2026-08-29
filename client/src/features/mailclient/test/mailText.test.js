// Reine Textlogik — läuft ohne DOM.
import { describe, expect, it } from 'vitest'
import {
  parseAdresse, parseAdressListe, absenderName, initialen, baueReplyBetreff,
  baueReplyEmpfaenger, parseDatum, formatDatum, formatDatumLang, formatGroesse,
  baueZitat, htmlZuText,
} from '../services/MailText'

describe('parseAdresse', () => {
  it('trennt Name und Adresse', () => {
    expect(parseAdresse('Max Muster <Max@Example.org>')).toEqual({ name: 'Max Muster', adresse: 'max@example.org' })
    expect(parseAdresse('"Muster, Max" <max@example.org>')).toEqual({ name: 'Muster, Max', adresse: 'max@example.org' })
  })
  it('kommt mit nackten Adressen und Leerstrings klar', () => {
    expect(parseAdresse('max@example.org')).toEqual({ name: '', adresse: 'max@example.org' })
    expect(parseAdresse('<max@example.org>')).toEqual({ name: '', adresse: 'max@example.org' })
    expect(parseAdresse('')).toEqual({ name: '', adresse: '' })
    expect(parseAdresse(null)).toEqual({ name: '', adresse: '' })
  })
})

describe('parseAdressListe', () => {
  it('splittet an Komma und Semikolon, aber nicht in Anführungszeichen', () => {
    const liste = parseAdressListe('"Muster, Max" <max@a.de>; b@a.de, Chef <chef@a.de>')
    expect(liste.map(a => a.adresse)).toEqual(['max@a.de', 'b@a.de', 'chef@a.de'])
    expect(liste[0].name).toBe('Muster, Max')
  })
  it('ignoriert Leereinträge', () => {
    expect(parseAdressListe(' , ;a@b.de,, ')).toHaveLength(1)
    expect(parseAdressListe(undefined)).toEqual([])
  })
})

describe('absenderName / initialen', () => {
  it('nimmt den Namen, sonst den Teil vor dem @', () => {
    expect(absenderName('Max Muster <max@a.de>')).toBe('Max Muster')
    expect(absenderName('max.muster@a.de')).toBe('max.muster')
  })
  it('bildet zwei Buchstaben', () => {
    expect(initialen('Max Muster <max@a.de>')).toBe('MM')
    expect(initialen('max.muster@a.de')).toBe('MM')
    expect(initialen('info@a.de')).toBe('IN')
  })
})

describe('baueReplyBetreff', () => {
  it('setzt genau ein Re: davor', () => {
    expect(baueReplyBetreff('Angebot')).toBe('Re: Angebot')
    expect(baueReplyBetreff('Re: Angebot')).toBe('Re: Angebot')
    expect(baueReplyBetreff('AW: RE: Fwd: Angebot')).toBe('Re: Angebot')
    expect(baueReplyBetreff('')).toBe('Re: ')
  })
})

describe('baueReplyEmpfaenger', () => {
  const mail = {
    sender: 'Kunde <kunde@a.de>',
    recipient: 'info@quagg.de, Kollege <kollege@quagg.de>',
    cc: 'chef@a.de, kunde@a.de',
    eigeneAdresse: 'info@quagg.de',
  }
  it('Antworten: nur der Absender', () => {
    expect(baueReplyEmpfaenger({ ...mail, alle: false })).toEqual({ to: ['kunde@a.de'], cc: [] })
  })
  it('Allen antworten: alle außer mir und dem Absender, ohne Dubletten', () => {
    expect(baueReplyEmpfaenger({ ...mail, alle: true })).toEqual({
      to: ['kunde@a.de'],
      cc: ['kollege@quagg.de', 'chef@a.de'],
    })
  })
})

describe('Datum', () => {
  it('naive ISO-Strings gelten als UTC', () => {
    const d = parseDatum('2026-08-27T10:00:00')
    expect(d.toISOString()).toBe('2026-08-27T10:00:00.000Z')
    expect(parseDatum('2026-08-27T10:00:00+02:00').toISOString()).toBe('2026-08-27T08:00:00.000Z')
    expect(parseDatum('quatsch')).toBeNull()
    expect(parseDatum(null)).toBeNull()
  })
  it('formatiert je nach Abstand', () => {
    const jetzt = new Date(2026, 7, 27, 15, 0)
    expect(formatDatum(new Date(2026, 7, 27, 9, 5), jetzt)).toBe('09:05')
    expect(formatDatum(new Date(2026, 2, 3, 9, 5), jetzt)).toBe('3. März')
    expect(formatDatum(new Date(2025, 11, 24, 9, 5), jetzt)).toBe('24.12.2025')
    expect(formatDatumLang(new Date(2026, 7, 27, 9, 5))).toBe('27.08.2026, 09:05')
    expect(formatDatum('')).toBe('')
  })
})

describe('formatGroesse', () => {
  it('deutsches Komma, passende Einheit', () => {
    expect(formatGroesse(512)).toBe('512 B')
    expect(formatGroesse(1536)).toBe('1,5 KB')
    expect(formatGroesse(2.5 * 1024 * 1024)).toBe('2,5 MB')
    expect(formatGroesse(undefined)).toBe('0 B')
  })
})

describe('baueZitat / htmlZuText', () => {
  it('zitiert jede Zeile mit >', () => {
    const z = baueZitat({ sender: 'a@b.de', received_at: new Date(2026, 7, 27, 9, 5), body_text: 'Hallo\r\nWelt\n' })
    expect(z).toBe('\n\nAm 27.08.2026, 09:05 schrieb a@b.de:\n> Hallo\n> Welt')
  })
  it('macht aus HTML lesbaren Text', () => {
    expect(htmlZuText('<style>x{}</style><p>Hallo&nbsp;<b>Welt</b></p><br><div>&amp; Co</div>')).toBe('Hallo Welt\n\n& Co')
  })
})
