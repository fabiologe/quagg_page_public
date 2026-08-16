/**
 * Der Import-Dialog gehört der Kandidatentabelle.
 *
 * Auslöser (Testrunde 2026-08-16): „ImportModal nicht vollständig
 * scrollbar, immer nur eine Zeile lesbar" — und getrennt davon
 * „KandidatVorschau: wenn man von oben draufsieht, verschwindet der
 * Körper".
 *
 * Beides hing an derselben 3D-Vorschau: sie belegte fest 220 px in einem
 * Dialog mit 88 vh Höhe, sodass auf einem Laptop für die Tabelle eine
 * Zeile blieb, und sie zeichnete mit einseitigem Material (offene
 * CAD-Flächen sind von hinten unsichtbar). Sie ist entfernt.
 *
 * Diese Prüfungen lesen die Datei, weil genau das Zurückrutschen die
 * Gefahr ist: eine three.js-Szene ist schnell wieder eingebaut, und dann
 * sind Platzproblem und Aufräumpflicht zurück.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WURZEL = new URL('..', import.meta.url).pathname
const DATEI = join(WURZEL, 'components/pre/ImportModal.vue')
const quelle = readFileSync(DATEI, 'utf8')

// Kommentarzeilen ausblenden: die Begründung DARF die Wörter nennen
const code = quelle
  .split('\n')
  .filter((z) => !/^\s*(\/\/|\*|<!--|-->)/.test(z))
  .join('\n')

describe('Import-Dialog', () => {
  it('führt keine eigene 3D-Szene mehr mit', () => {
    expect(code).not.toMatch(/from 'three'/)
    expect(code).not.toMatch(/OrbitControls/)
    expect(code).not.toMatch(/STLLoader/)
    // und damit auch keinen WebGL-Kontext, der aufzuräumen wäre
    expect(code).not.toMatch(/WebGLRenderer/)
  })

  it('lässt die Kandidatentabelle den Platz nehmen', () => {
    // `min-height: 0` ist die Bedingung dafür, dass ein Flex-Kind unter
    // seine Inhaltshöhe schrumpfen kann — ohne das greift der eigene
    // Bildlauf nie und die Tabelle drückt den Dialog auf.
    expect(quelle).toMatch(/\.f3d-imp-table-wrap\s*\{[^}]*min-height:\s*0/)
    expect(quelle).toMatch(/\.f3d-imp-table-wrap\s*\{[^}]*overflow:\s*auto/)
  })

  it('hat keine Reste der Vorschau im Markup', () => {
    // Ein zurückgebliebenes ref oder ein toter Handler wäre ein
    // ReferenceError beim Überfahren einer Zeile
    expect(code).not.toMatch(/vorschau/i)
    expect(code).not.toMatch(/hebeHervor/)
  })
})
