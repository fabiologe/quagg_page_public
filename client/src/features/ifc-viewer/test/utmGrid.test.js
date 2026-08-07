// UTM-Gitterkreuze (Sprint T1/E4): Spacing-Automatik, Offset-Anwendung,
// Positionen auf runden Rohkoordinaten.

import { describe, expect, it } from 'vitest'
import { computeUtmCrosses, formatUtmLabel } from '../services/UtmGrid'

describe('computeUtmCrosses', () => {
  // Plotausschnitt 120×80 m Welt, Modell-Offset 555000/-5745000
  const bounds = { wXmin: 100, wXmax: 220, wZmin: -50, wZmax: 30 }
  const offset = { x: 555000, z: -5745000 }

  it('setzt Kreuze auf runden Vielfachen der Rohkoordinaten', () => {
    const { spacing, crosses } = computeUtmCrosses(bounds, offset)
    // 120 m Spanne → 25er-Gitter (4 Kreuze) ist der kleinste Kandidat ≤ 5 Kreuze
    expect(spacing).toBe(25)
    for (const c of crosses) {
      expect(c.east % spacing).toBe(0)
      expect(c.north % spacing).toBe(0)
      // Rückrechnung Welt → Roh stimmt
      expect(c.east).toBe(c.worldX + offset.x)
      expect(c.north).toBe(-(c.worldZ + offset.z))
    }
    expect(crosses.length).toBeGreaterThan(0)
  })

  it('Anschrift nur am linken/unteren Gitterrand (L-förmig)', () => {
    const { crosses } = computeUtmCrosses(bounds, offset)
    const eMin = Math.min(...crosses.map(c => c.east))
    const nMin = Math.min(...crosses.map(c => c.north))
    for (const c of crosses) {
      expect(c.labelled).toBe(c.east === eMin || c.north === nMin)
    }
  })

  it('flipNorth dreht die Hochwert-Achse', () => {
    const a = computeUtmCrosses(bounds, offset, { flipNorth: true })
    for (const c of a.crosses) {
      expect(c.north).toBe(c.worldZ + offset.z)
    }
  })

  it('festes Spacing übersteuert die Automatik', () => {
    const { spacing } = computeUtmCrosses(bounds, offset, { spacing: 100 })
    expect(spacing).toBe(100)
  })

  it('formatUtmLabel gruppiert deutsch', () => {
    expect(formatUtmLabel('E', 555250)).toBe('E 555.250')
  })
})
