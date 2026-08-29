import { describe, expect, it } from 'vitest'
import { hatMindestens, normalisiert, rang, sichererRedirect, startpfad, ROLLEN } from '../rollen'

describe('rollen', () => {
  it('normalisiert neue Werte, Altwerte und Müll', () => {
    expect(normalisiert('admin')).toBe('ADMIN')
    expect(normalisiert(' Mitarbeiter ')).toBe('MITARBEITER')
    expect(normalisiert('INTERNAL')).toBe('MITARBEITER')
    expect(normalisiert('CLIENT')).toBe('EXTERN')
    expect(normalisiert('CHEF')).toBeNull()
    expect(normalisiert(null)).toBeNull()
    expect(normalisiert('constructor')).toBeNull()
  })

  it('Rang: höher schließt niedriger ein, unbekannt scheitert', () => {
    expect(rang('ADMIN')).toBeGreaterThan(rang('MITARBEITER'))
    expect(rang('MITARBEITER')).toBeGreaterThan(rang('WERKSTUDENT'))
    expect(rang('WERKSTUDENT')).toBeGreaterThan(rang('EXTERN'))
    expect(rang('x')).toBe(-1)
    expect(hatMindestens('ADMIN', 'EXTERN')).toBe(true)
    expect(hatMindestens('WERKSTUDENT', 'MITARBEITER')).toBe(false)
    expect(hatMindestens('INTERNAL', 'WERKSTUDENT')).toBe(true)
    expect(hatMindestens('x', 'EXTERN')).toBe(false)
    expect(hatMindestens('ADMIN', 'x')).toBe(false)
    expect(hatMindestens(null, 'EXTERN')).toBe(false)
  })

  it('Startpfad je Rolle', () => {
    expect(startpfad('EXTERN')).toBe('/client')
    expect(startpfad('CLIENT')).toBe('/client')
    expect(startpfad('WERKSTUDENT')).toBe('/intern')
    expect(startpfad('ADMIN')).toBe('/intern')
    expect(startpfad(null)).toBe('/home')
  })

  it('redirect nur relativ', () => {
    expect(sichererRedirect('/intern/projects/5')).toBe('/intern/projects/5')
    expect(sichererRedirect('//boese.de')).toBeNull()
    expect(sichererRedirect('https://boese.de')).toBeNull()
    expect(sichererRedirect('/\\boese.de')).toBeNull()
    expect(sichererRedirect(undefined)).toBeNull()
  })

  it('ROLLEN absteigend', () => {
    expect(ROLLEN).toEqual(['ADMIN', 'MITARBEITER', 'WERKSTUDENT', 'EXTERN'])
  })
})
