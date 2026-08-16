// Tests der Netz-Ansicht (editor/netzAnsicht.js): der Hinweistext zur
// geladenen Vorschau — veraltet schlägt Schnellvorschau, sonst still —
// und die Frage, ob ein Netz überhaupt angezeigt werden darf.
import { describe, expect, it } from 'vitest'
import { netzHinweis, netzZeigen } from '../components/pre/editor/netzAnsicht'

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

describe('netzZeigen', () => {
  // Gemeldet 2026-08-16: nach einer Geometrieänderung erschien beim Klick
  // auf „Netzvorschau rechnen" zuerst das ALTE Netz. Die Netzansicht
  // blendet die echte Geometrie aus und setzt das Netz an ihre Stelle —
  // ein Netz von gestern darf diesen Platz nicht bekommen.
  it('zeigt ein veraltetes Netz nicht als Geometrie', () => {
    expect(netzZeigen({ stale: true })).toBe(false)
  })
  it('zeigt ein passendes Netz', () => {
    expect(netzZeigen({ stale: false })).toBe(true)
  })
  it('sagt beim veralteten Netz, was zu tun ist', () => {
    // Der Hinweis ersetzt jetzt das Bild — er muss den Weg nennen
    expect(netzHinweis({ stale: true })).toMatch(/neu rechnen/)
    expect(netzHinweis({ stale: true })).toMatch(/nicht angezeigt/)
  })
})
