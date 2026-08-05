// Rest-A / R4: die Vorlagen sind in einem Bezugsraum notiert (Gelände 95 m,
// Grundrisse um 20 m). Beim Einfügen müssen sie in den vorliegenden Fall
// umgerechnet werden — Grundriss UND die skalaren Längenmaße, sonst behält
// ein geschrumpftes Becken seinen alten Radius.

import { describe, expect, it } from 'vitest'
import {
  TEMPLATES, vorlageAnpassen, noetigeVerfeinerung,
} from '../utils/preTemplates'

const kopie = (o) => JSON.parse(JSON.stringify(o))
const flach = (z) => () => z

function fall(extent, baseCell = 1.0, refinements = []) {
  return {
    domain: { extent, z_min: 90, z_max: 110 },
    mesh: { base_cell: baseCell, refinements },
  }
}

describe('vorlageAnpassen — Grundriss', () => {
  it('setzt die Vorlage in die Mitte des Modellgebiets', () => {
    const obj = kopie(TEMPLATES.structure.Wand)
    vorlageAnpassen(obj, fall([100, 200, 140, 240]), flach(120))
    const xs = obj.alignment.points.map((p) => p[0])
    expect(Math.min(...xs)).toBeGreaterThan(100)
    expect(Math.max(...xs)).toBeLessThan(140)
  })

  it('rechnet Höhen relativ zum Gelände um', () => {
    const obj = kopie(TEMPLATES.structure.Wand)
    // Wandkrone liegt 2,0 m über dem Bezugsgelände (95,0)
    vorlageAnpassen(obj, fall([0, 0, 40, 40]), flach(220))
    expect(obj.alignment.points[0][2]).toBeCloseTo(222.0, 2)
  })
})

describe('vorlageAnpassen — skalare Längenmaße', () => {
  it('schrumpft Radien mit dem Grundriss', () => {
    // Vorlage spannt 10 m auf, Gebiet gibt nur 4 m Platz -> s = 0,4
    const obj = kopie(TEMPLATES.terrain_op['Anheben/Absenken'])
    const vorher = obj.radius
    vorlageAnpassen(obj, fall([0, 0, 8, 8]), flach(95))
    expect(obj.radius).toBeLessThan(vorher)
    expect(obj.radius).toBeCloseTo(vorher * 0.4, 2)
  })

  it('schrumpft den Rohrdurchmesser in der Untergruppe mit', () => {
    const obj = kopie(TEMPLATES.structure.Durchlass)
    const vorher = obj.profile.diameter
    vorlageAnpassen(obj, fall([0, 0, 8, 8]), flach(95))
    expect(obj.profile.diameter).toBeLessThan(vorher)
  })

  it('lässt senkrechte Maße unangetastet', () => {
    const obj = kopie(TEMPLATES.structure.Wand)
    vorlageAnpassen(obj, fall([0, 0, 8, 8]), flach(95))
    expect(obj.height).toBe(2.0)      // eine 2-m-Wand bleibt 2 m hoch
  })

  it('vergrößert nie — eine Vorlage behält ihre Maße im weiten Gebiet', () => {
    const obj = kopie(TEMPLATES.structure.Becken)
    vorlageAnpassen(obj, fall([0, 0, 400, 400]), flach(95))
    expect(obj.wall_thickness).toBe(0.3)
  })
})

describe('noetigeVerfeinerung', () => {
  it('ergänzt die Verfeinerung für die zu dünne Standardwand', () => {
    // genau der Widerspruch des Neufalls: Wand 0,40 m, Basiszelle 1,00 m
    const wand = { ...kopie(TEMPLATES.structure.Wand), patch: 'wand_1' }
    const spec = fall([0, 0, 40, 40], 1.0)
    const fein = noetigeVerfeinerung(wand, spec)
    expect(fein).not.toBeNull()
    expect(fein.refinement.target).toBe('wand_1')
    // 4 * 1,0 / 2^n <= 0,4  ->  n = 4
    expect(fein.refinement.level).toBe(4)
    expect(fein.text).toContain('Basiszelle')
  })

  it('schweigt, wenn das Netz das Bauteil schon auflöst', () => {
    const wand = { ...kopie(TEMPLATES.structure.Wand), patch: 'wand_1' }
    expect(noetigeVerfeinerung(wand, fall([0, 0, 40, 40], 0.05))).toBeNull()
  })

  it('rechnet eine vorhandene Verfeinerung an derselben Fläche an', () => {
    const wand = { ...kopie(TEMPLATES.structure.Wand), patch: 'wand_1' }
    const spec = fall([0, 0, 40, 40], 1.0,
      [{ id: 'f1', type: 'surface', target: 'wand_1', level: 4 }])
    expect(noetigeVerfeinerung(wand, spec)).toBeNull()
  })

  it('vergibt eine freie Kennung', () => {
    const wand = { ...kopie(TEMPLATES.structure.Wand), patch: 'wand_1' }
    const spec = fall([0, 0, 40, 40], 1.0,
      [{ id: 'fein_wand_1', type: 'box', extent: [0, 0, 0, 1, 1, 1], level: 1 }])
    expect(noetigeVerfeinerung(wand, spec).refinement.id).toBe('fein_wand_1_2')
  })

  it('gilt nur für Bauteile mit dünnster Abmessung', () => {
    const box = kopie(TEMPLATES.refinement.Verfeinerungsbox)
    expect(noetigeVerfeinerung(box, fall([0, 0, 40, 40], 1.0))).toBeNull()
  })

  it('verfeinert beim Aushub das Gelände, nicht den Patch', () => {
    // Ein Hohlraum hat keine eigene Fläche — seine Wandungen gehören nach
    // dem Ausschneiden zur Geländefläche
    const kammer = {
      ...kopie(TEMPLATES.structure.Kammer), patch: 'kammer_1',
      wirkung: 'aushub',
    }
    const fein = noetigeVerfeinerung(kammer, fall([0, 0, 40, 40], 1.0))
    expect(fein.refinement.target).toBe('terrain')
    expect(fein.refinement.id).toBe('fein_terrain')
  })

  it('verfeinert das frisch abgesetzte Bauwerk am Patch selbst', () => {
    // `auto` heißt beim Einfügen Bauteil: die Vorlage steht AUF dem Gelände
    const kammer = { ...kopie(TEMPLATES.structure.Kammer), patch: 'kammer_1' }
    expect(kammer.wirkung).toBe('auto')
    expect(noetigeVerfeinerung(kammer, fall([0, 0, 40, 40], 1.0))
      .refinement.target).toBe('kammer_1')
  })

  it('misst den Graben an seiner Sohlbreite', () => {
    const graben = {
      ...kopie(TEMPLATES.structure['Graben/Stauraumkanal']),
      patch: 'graben_1',
    }
    // Sohlbreite 1,5 m gegen 1,0 m Basiszelle -> 4 * 1,0 / 2^2 = 1,0 < 1,5
    expect(noetigeVerfeinerung(graben, fall([0, 0, 60, 60], 1.0))
      .refinement.level).toBe(2)
  })
})

describe('Aushub-Vorlagen', () => {
  it('entscheiden die Wirkung aus der Lage', () => {
    for (const name of ['Schacht (rund)', 'Kammer', 'Graben/Stauraumkanal']) {
      expect(TEMPLATES.structure[name].wirkung).toBe('auto')
    }
  })

  it('stehen AUF dem Gelände, nicht darin', () => {
    // Der Regelfall beim Einfügen: das Bauwerk wird abgesetzt und ist damit
    // ein Bauteil. Zum Aushub wird es erst durch Hineinschieben.
    const REF = 95.0
    for (const name of ['Schacht (rund)', 'Kammer']) {
      const t = TEMPLATES.structure[name]
      expect(t.invert_level).toBeGreaterThanOrEqual(REF)
      expect(t.top_level).toBeGreaterThan(REF)
    }
    const g = TEMPLATES.structure['Graben/Stauraumkanal']
    const oben = Math.max(...g.axis.map((p) => p[2])) + g.profile.height
    expect(oben).toBeGreaterThan(REF)
  })

  it('landen im Gebiet und am Gelände', () => {
    const obj = kopie(TEMPLATES.structure.Kammer)
    vorlageAnpassen(obj, fall([100, 200, 140, 240]), flach(120))
    const xs = obj.footprint.map((p) => p[0])
    expect(Math.min(...xs)).toBeGreaterThan(100)
    expect(Math.max(...xs)).toBeLessThan(140)
    // Sohle liegt auf dem Bezugsgelände -> auf dem echten Gelände
    expect(obj.invert_level).toBeCloseTo(120.0, 2)
    expect(obj.top_level).toBeCloseTo(122.5, 2)
  })
})
