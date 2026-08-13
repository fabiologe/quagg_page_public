// Tests der Netz-Ansicht (editor/netzAnsicht.js): der Hinweistext zur
// geladenen Vorschau — veraltet schlägt Schnellvorschau, sonst still.
import { describe, expect, it } from 'vitest'
import { netzHinweis } from '../components/pre/editor/netzAnsicht'

describe('netzHinweis', () => {
  it('veraltetes Netz wird klar benannt', () => {
    expect(netzHinweis({ stale: true })).toMatch(/älteren Stand/)
  })
  it('veraltet gewinnt vor Schnellvorschau', () => {
    expect(netzHinweis({ stale: true, ohneVerfeinerung: true }))
      .toMatch(/älteren Stand/)
  })
  it('Schnellvorschau nennt die untere Grenze', () => {
    expect(netzHinweis({ ohneVerfeinerung: true })).toMatch(/untere Grenze/)
  })
  it('aktuelles, volles Netz braucht keinen Hinweis', () => {
    expect(netzHinweis({})).toBe('')
  })
})
