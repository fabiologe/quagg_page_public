// Rest-A / R5: welches Feld welche Maske bekommt. Die Feldkunde entscheidet
// darüber, ob ein Feld bedienbar ist oder als JSON-Text dasteht — sie ist
// deshalb der Ort, an dem eine Regression am teuersten wäre.

import { describe, expect, it } from 'vitest'
import { referenzListe, widgetFor, enumFor } from '../utils/feldTypen'

describe('widgetFor', () => {
  it('gibt dem Bearbeitungsstapel eine eigene Liste', () => {
    expect(widgetFor('edits', [], 'wall')).toBe('edits')
    expect(widgetFor('edits', [{ id: 'a', type: 'heilen' }], 'wall'))
      .toBe('edits')
  })

  it('blendet nicht gesetzte Felder aus, statt eine leere Textarea zu zeigen', () => {
    // `window` wird vom eigenen Auswahlkasten bedient; auf null gab es
    // vorher zusätzlich ein leeres JSON-Feld daneben
    expect(widgetFor('window', null, 'inflow_constant')).toBe('leer')
    expect(widgetFor('irgendwas', undefined, 'wall')).toBe('leer')
  })

  it('macht aus dem Verfeinerungsziel eine Auswahl', () => {
    expect(widgetFor('target', '', 'surface')).toBe('referenz')
  })

  it('macht aus der Bezugskante der Außenkante eine Auswahl', () => {
    expect(widgetFor('innen', null, 'aussenkante')).toBe('referenz')
  })

  it('lässt echte Objekte weiter als JSON durch', () => {
    expect(widgetFor('unbekannt', { a: 1 }, 'wall')).toBe('json')
  })
})

describe('referenzListe', () => {
  const spec = {
    terrain: {
      operations: [
        { id: 'boe1', type: 'boeschung' },
        { id: 'kante1', type: 'bruchkante' },
        { id: 'ger1', type: 'channel_carve' },
      ],
    },
    structures: [{ id: 'w1', patch: 'wand_1' }],
  }

  it('bietet das Gelände als Verfeinerungsziel an', () => {
    // seit die Sohle verfeinerbar ist — vorher war „terrain" hier ein Fehler
    expect(referenzListe(spec, 'flaeche')).toEqual(['terrain', 'wand_1'])
  })

  it('lässt das Gelände weg, wenn der Fall keines hat', () => {
    expect(referenzListe({ structures: spec.structures }, 'flaeche'))
      .toEqual(['wand_1'])
  })

  it('bietet als Bezugskante nur Böschung und Bruchkante an', () => {
    expect(referenzListe(spec, 'kante')).toEqual(['boe1', 'kante1'])
  })
})

describe('enumFor', () => {
  it('kennt die Formen einer Aussparung', () => {
    expect(enumFor('shape', 'aussparung')).toEqual(['kreis', 'rechteck'])
  })

  it('unterscheidet sie von der Fensterform', () => {
    expect(enumFor('shape', 'window')).toContain('trapez')
  })

  it('unterscheidet Durchlass- und Grabenquerschnitt', () => {
    // beide Felder heißen `profile.kind` und meinen etwas anderes
    expect(enumFor('kind', 'profile', 'culvert')).toEqual(
      ['circular', 'rectangular', 'arch'])
    expect(enumFor('kind', 'profile', 'graben')).toEqual(
      ['trapez', 'rechteck', 'kreis', 'maul'])
  })

  it('gibt dem Schacht nur runde und rechteckige Grundrisse', () => {
    expect(enumFor('shape', '', 'schacht')).toEqual(['rund', 'rechteck'])
    // der Pfeiler behält seine eigene, längere Liste
    expect(enumFor('shape', '', 'pier')).toContain('tropfen')
  })

  it('bietet „automatisch" nur den Aushub-Typen an', () => {
    expect(enumFor('wirkung', '', 'kammer')).toEqual(
      ['auto', 'bauteil', 'aushub'])
    // eine Wand kann sich nicht selbst als Grube erkennen
    expect(enumFor('wirkung', '', 'wall')).toEqual(['bauteil', 'aushub'])
  })
})
