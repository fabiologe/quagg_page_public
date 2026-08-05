// Löschen räumt auf. Die Grenze ist der Kern dieser Tests:
// automatisch entfernt wird, was ohne den Verweis keinen Inhalt mehr hat
// und keinen eigenen Ort trägt — alles andere wird nur gemeldet.

import { describe, expect, it } from 'vitest'
import { aufraeumplan, huellbox, verwaisteNachbarn } from '../utils/aufraeumen'

function fall() {
  return {
    domain: { extent: [0, 0, 40, 40], z_min: 90, z_max: 100 },
    terrain: { base: { source: 'flat:95', resolution: 0.5 }, operations: [] },
    structures: [
      { id: 'wand_1', type: 'wall', patch: 'wand_1', thickness: 0.4,
        alignment: { kind: 'polyline', points: [[10, 10, 97], [16, 10, 97]] } },
      { id: 'wehr_1', type: 'weir', patch: 'wehr_1', crest_width: 0.5,
        crest_polyline: [[20, 10, 96], [26, 10, 96]] },
      // wie aus einem Bauwerksrezept: Kammer mit Pegel und Box darin
      { id: 'kammer_1', type: 'kammer', patch: 'kammer_1',
        footprint: [[20, 20], [26, 20], [26, 26], [20, 26]],
        invert_level: 93, top_level: 95, wall_thickness: 0.3,
        wirkung: 'auto' },
    ],
    mesh: {
      base_cell: 0.5,
      refinements: [
        { id: 'fein_wand_1', type: 'surface', target: 'wand_1', level: 3 },
        { id: 'box_1', type: 'box', extent: [9, 9, 94, 17, 12, 98], level: 2 },
        { id: 'fein_kammer_1', type: 'box',
          extent: [21, 21, 93, 25, 25, 95], level: 2 },
      ],
      boundary_layers: { patches: ['wand_1'], n_layers: 3 },
    },
    boundaries: [],
    evaluation: {
      sections: [
        { id: 'qs_1', polyline: [[12, 5], [12, 15]] },
        { id: 'qs_2', polyline: [[30, 5], [30, 15]] },
      ],
      gauges: [
        { id: 'pegel_1', point: [13, 11] },
        { id: 'pegel_kammer', point: [23, 23] },  // in der Kammer
        { id: 'pegel_fern', point: [35, 35] },    // weit weg
      ],
      force_patches: ['wand_1'],
      targets: [
        { id: 'last', kind: 'max_force', at: 'wand_1', component: 'magnitude' },
        { id: 'einstau', kind: 'max_level', at: 'pegel_1', limit_max: 96.5 },
        { id: 'aufteilung', kind: 'discharge_ratio', of: 'qs_1', to: 'qs_2',
          limit_max: 0.35 },
        { id: 'schub', kind: 'max_bed_shear', region: 'box_1', limit_max: 25 },
        { id: 'cd', kind: 'overfall_cd', weir: 'wehr_1', section: 'qs_2',
          gauge: 'pegel_fern' },
      ],
    },
  }
}

const ids = (liste) => liste.map((o) => o.id)

describe('automatisch entfernt: ortlose Verweise', () => {
  it('nimmt beim Bauwerk Verfeinerung, Kraftpatch, Grenzschicht und Kriterium mit', () => {
    const p = aufraeumplan(fall(), 'structure', 'wand_1')
    expect(p.ok).toBe(true)
    const s = p.spec
    expect(ids(s.structures)).toEqual(['wehr_1', 'kammer_1'])
    expect(ids(s.mesh.refinements)).toEqual(['box_1', 'fein_kammer_1'])
    expect(s.evaluation.force_patches).toEqual([])
    expect(s.mesh.boundary_layers.patches).toEqual([])
    expect(ids(s.evaluation.targets)).not.toContain('last')
    // vier Meldungen, jede benennt was und warum
    expect(p.meldungen.length).toBe(4)
    expect(p.meldungen.join(' ')).toContain('Kraftauswertung')
  })

  it('nennt beim Kriterium seinen Grenzwert', () => {
    const p = aufraeumplan(fall(), 'gauge', 'pegel_1')
    expect(p.meldungen[0]).toContain('einstau')
    expect(p.meldungen[0]).toContain('96.5')
    expect(p.meldungen[0]).toContain('Pegelpunkt')
  })

  it('räumt beim Querschnitt beide Kriterien ab, die ihn brauchen', () => {
    const p = aufraeumplan(fall(), 'section', 'qs_2')
    expect(ids(p.spec.evaluation.targets).sort())
      .toEqual(['einstau', 'last', 'schub'])
  })

  it('räumt beim Wehr das Überfallbeiwert-Kriterium ab', () => {
    // `weir` wurde bis zu dieser Runde von niemandem geprüft
    const p = aufraeumplan(fall(), 'structure', 'wehr_1')
    expect(ids(p.spec.evaluation.targets)).not.toContain('cd')
  })

  it('räumt beim Löschen einer Box das Sohlschubkriterium ab', () => {
    const p = aufraeumplan(fall(), 'refinement', 'box_1')
    expect(ids(p.spec.evaluation.targets)).not.toContain('schub')
  })
})

describe('nur gemeldet: Objekte mit eigenem Ort', () => {
  it('meldet Rezeptreste im Grundriss, löscht sie aber nicht', () => {
    // Der reale Fall: ein Bauwerksrezept hat Kammer, Pegel und
    // Verfeinerungsbox zusammen eingesetzt. Beim Löschen der Kammer
    // werden Pegel und Box GENANNT — entfernt werden sie nicht, denn
    // beide haben einen eigenen Ort und können weiter gebraucht werden.
    // Gefunden wird das geometrisch, nicht über eine Herkunftsangabe:
    // „liegt im Grundriss" ist überprüfbar, „gehörte zum Rezept" wäre
    // eine Behauptung über die Vergangenheit.
    const p = aufraeumplan(fall(), 'structure', 'kammer_1')
    expect(ids(p.spec.evaluation.gauges)).toContain('pegel_kammer')
    expect(ids(p.spec.mesh.refinements)).toContain('fein_kammer_1')
    const gemeldet = p.verwaist.map((v) => v.id)
    expect(gemeldet).toContain('pegel_kammer')
    expect(gemeldet).toContain('fein_kammer_1')
    expect(gemeldet).not.toContain('pegel_fern')
    expect(gemeldet).not.toContain('pegel_1')
  })

  it('meldet nichts, wenn nichts im Grundriss liegt', () => {
    const p = aufraeumplan(fall(), 'section', 'qs_2')
    expect(p.verwaist.map((v) => v.id)).not.toContain('pegel_1')
  })

  it('lässt eine Randbedingung mit follow unangetastet', () => {
    const f = fall()
    f.terrain.operations.push({
      id: 't01', type: 'channel_carve', polyline: [[2, 9], [22, 9]],
      invert_start: 94.8, invert_end: 94.6, bottom_width: 2,
      depth: 1.5, side_slope: 1.5,
    })
    f.boundaries.push({ id: 'zulauf', patch: 'inlet', type: 'inflow_constant',
      q: 0.5, window: { follow: 't01' } })
    const p = aufraeumplan(f, 'terrain_op', 't01')
    // Die Randbedingung ist die Hydraulik des Falls — sie wegen eines
    // gelöschten Gerinnes zu entfernen wäre Buchhaltung statt Modell
    expect(ids(p.spec.boundaries)).toEqual(['zulauf'])
    expect(p.spec.boundaries[0].window.follow).toBe('t01')
  })
})

describe('Kaskade', () => {
  it('kommt bei jeder realen Art in einer Runde aus', () => {
    // Der Verweisgraph ist flach: Kriterien und Flächenverfeinerungen sind
    // selbst nie Ziel eines Verweises. Schlägt dieser Test an, hat jemand
    // das aufgegeben — dann braucht die Meldung eine zweite Runde.
    for (const [kind, id] of [['structure', 'wand_1'], ['gauge', 'pegel_1'],
      ['section', 'qs_1'], ['refinement', 'box_1']]) {
      expect(aufraeumplan(fall(), kind, id).runden).toBe(1)
    }
  })

  it('ist idempotent', () => {
    const p1 = aufraeumplan(fall(), 'structure', 'wand_1')
    const p2 = aufraeumplan(p1.spec, 'structure', 'wehr_1')
    const p3 = aufraeumplan(p2.spec, 'structure', 'wehr_1')
    expect(p3.ok).toBe(false)
    expect(p3.meldungen).toEqual([])
  })

  it('meldet nichts beim unreferenzierten Objekt', () => {
    const p = aufraeumplan(fall(), 'gauge', 'pegel_fern')
    // pegel_fern speist nur `cd`, das damit fällt — aber sonst nichts
    expect(p.meldungen.length).toBe(1)
    expect(p.verwaist).toEqual([])
  })

  it('gibt bei unbekannter Kennung sauber auf', () => {
    const p = aufraeumplan(fall(), 'structure', 'gibtsnicht')
    expect(p.ok).toBe(false)
    expect(p.meldungen).toEqual([])
  })
})

describe('huellbox', () => {
  it('liest Punktlisten, Achsen und Mittelpunkte', () => {
    expect(huellbox({ footprint: [[0, 0], [4, 0], [4, 3], [0, 3]] }))
      .toEqual([0, 0, 4, 3])
    // Ein runder Schacht ist ein Punkt plus Radius — ohne die halbe Breite
    // wäre seine Hüllbox ein Punkt und es läge nie etwas darin
    expect(huellbox({ center: [10, 20], width: 2 })).toEqual([9, 19, 11, 21])
    expect(huellbox({ alignment: { points: [[1, 2, 9], [5, 8, 9]] } }))
      .toEqual([1, 2, 5, 8])
  })

  it('versteht extent in beiden Längen', () => {
    expect(huellbox({ extent: [1, 2, 5, 6] })).toEqual([1, 2, 5, 6])
    expect(huellbox({ extent: [1, 2, 90, 5, 6, 99] })).toEqual([1, 2, 5, 6])
  })

  it('gibt null ohne Ortsangabe', () => {
    expect(huellbox({ id: 'x', level: 2 })).toBeNull()
    expect(verwaisteNachbarn(fall(), null)).toEqual([])
  })
})
