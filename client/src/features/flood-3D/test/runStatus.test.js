// Die Statusmengen sind Verträge mit dem Backend (Pipeline-Phasen,
// core/archiv.py ARCHIVIERBAR). Die Tests frieren die HEUTIGEN Mengen
// ein — wer eine Phase ergänzt, muss hier bewusst vorbeikommen.
import { describe, expect, it } from 'vitest'
import { AKTIV, MIT_ERGEBNIS, TERMINAL, TERMINAL_ARCHIV }
  from '../utils/runStatus'

describe('runStatus-Mengen', () => {
  it('AKTIV = die fünf Zwischenzustände der Pipeline', () => {
    expect(AKTIV).toEqual(['building', 'meshing', 'solving', 'extracting',
      'converting_fields'])
  })

  it('TERMINAL enthält lokal (Companion-Reservierung pollt sonst endlos)', () => {
    expect(TERMINAL).toEqual(['completed', 'failed', 'unbekannt', 'lokal'])
  })

  it('TERMINAL_ARCHIV = Kopie von core/archiv.py ARCHIVIERBAR', () => {
    expect(TERMINAL_ARCHIV).toEqual(['completed', 'teilergebnis',
      'abgebrochen', 'failed'])
  })

  it('MIT_ERGEBNIS = fertig oder Teilergebnis', () => {
    expect(MIT_ERGEBNIS).toEqual(['completed', 'teilergebnis'])
  })

  it('kein Status ist zugleich aktiv und terminal', () => {
    expect(AKTIV.filter((s) => TERMINAL.includes(s))).toEqual([])
    expect(AKTIV.filter((s) => TERMINAL_ARCHIV.includes(s))).toEqual([])
  })
})
