/**
 * Sichtbare Profilfelder folgen der gewählten ART, nicht dem Inhalt.
 *
 * Auslöser (Testrunde 2026-08-16): „Rechteck und Maul Erstellung geht
 * garnicht … keine Reaktion beim Auswählen, nichts eingebbar." Ursache war
 * die Regel, leere Felder auszublenden — beim Umschalten der Profilart
 * stehen Breite und Höhe auf null, also erschienen sie nie, und das
 * Speichern scheiterte am Modell.
 */
import { describe, expect, it } from 'vitest'

import {
  PFLICHTFELDER, ZAHLENFELDER, artGewechselt, felderFuer,
} from '../utils/feldTypen'

describe('Profilfelder je Art', () => {
  it('zeigt beim Rechteckprofil Breite und Höhe, auch wenn sie leer sind', () => {
    const profil = { kind: 'rectangular', diameter: null, width: null,
      height: null, wandstaerke: 0.15 }
    const felder = felderFuer('profile', 'culvert', profil)
    expect(felder).toEqual(['kind', 'width', 'height', 'wandstaerke'])
    // und der Durchmesser gehört nicht dazu
    expect(felder).not.toContain('diameter')
  })

  it('zeigt beim Kreisprofil den Durchmesser statt der Rechteckmaße', () => {
    const felder = felderFuer('profile', 'culvert',
      { kind: 'circular', diameter: 0.8, width: null, height: null,
        wandstaerke: 0.15 })
    expect(felder).toEqual(['kind', 'diameter', 'wandstaerke'])
  })

  it('gilt genauso für das Grabenprofil', () => {
    // Dieselbe Falle: kreis -> trapez lässt height auf null zurück
    expect(felderFuer('profile', 'graben', { kind: 'trapez', width: 1, height: null }))
      .toEqual(['kind', 'width', 'height', 'side_slope'])
    expect(felderFuer('profile', 'graben', { kind: 'kreis', width: 0.5 }))
      .toEqual(['kind', 'width'])
  })

  it('behält gesetzte Zusatzangaben aus Altfällen', () => {
    const felder = felderFuer('profile', 'culvert',
      { kind: 'circular', diameter: 0.8, wandstaerke: 0.15, sonderfeld: 7 })
    expect(felder).toContain('sonderfeld')
  })

  it('lässt Gruppen ohne Tabelle unverändert', () => {
    // Widerstand, Achse, Fenster: dort gilt weiter „alles, was gesetzt ist"
    const w = { model: 'kirschmer', d: null, f: [1, 2] }
    expect(felderFuer('resistance', 'screen', w)).toEqual(['model', 'f'])
    expect(felderFuer('resistance', 'screen', w, ['model'])).toEqual(['f'])
  })

  it('kennt alle Maße als Zahlenfelder', () => {
    // Ohne das bekäme ein noch leeres Maß ein Textfeld — und die Eingabe
    // landete als Zeichenkette in der Spezifikation.
    for (const k of ['diameter', 'width', 'height', 'wandstaerke', 'side_slope']) {
      expect(ZAHLENFELDER.has(k)).toBe(true)
    }
    expect(ZAHLENFELDER.has('kind')).toBe(false)
  })
})

describe('Artwechsel räumt auf', () => {
  it('leert die Maße der alten Art', () => {
    const neu = artGewechselt('profile', 'culvert',
      { kind: 'circular', diameter: 0.8, wandstaerke: 0.15 }, 'rectangular')
    expect(neu.kind).toBe('rectangular')
    // sonst hinge ein Durchmesser an einem Rechteck und behauptete etwas,
    // das für diese Art gar nicht gilt
    expect(neu.diameter).toBeNull()
    expect(neu.wandstaerke).toBe(0.15)      // gilt für beide Arten: bleibt
  })

  it('rührt Felder außerhalb der Tabelle nicht an', () => {
    const neu = artGewechselt('profile', 'culvert',
      { kind: 'circular', diameter: 0.8, wandstaerke: 0.15, notiz: 'DN800' },
      'arch')
    expect(neu.notiz).toBe('DN800')
  })

  it('ist für Gruppen ohne Tabelle ein einfaches Setzen', () => {
    const neu = artGewechselt('window', 'boundary',
      { kind: 'a', x: 1 }, 'b')
    expect(neu).toEqual({ kind: 'b', x: 1 })
  })
})

describe('Tabelle deckt die Modelle ab', () => {
  it('kennt jede Profilart aus der casespec', () => {
    // Fehlt eine Art, fällt sie stumm auf die alte Regel zurück — und der
    // Fehler von heute wäre für genau diese Art wieder da.
    expect(Object.keys(PFLICHTFELDER.culvert.profile).sort())
      .toEqual(['arch', 'circular', 'rectangular'])
    expect(Object.keys(PFLICHTFELDER.graben.profile).sort())
      .toEqual(['kreis', 'maul', 'rechteck', 'trapez'])
  })
})
