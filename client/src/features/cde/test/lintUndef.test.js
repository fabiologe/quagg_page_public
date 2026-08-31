// Fängt die Fehlerklasse „Bezeichner existiert gar nicht" ab — Übernahme des
// Wächters aus flood-3D, den Stufe 2 des CDE-Fahrplans vorgesehen, aber nie
// geholt hatte. Die Rechnung dafür kam am 31.08.2026: `defineExpose` in
// IfcViewer.vue reichte `zoomToAnnotation` heraus, eine Funktion, die es nach
// der Composable-Zerlegung (Stufe 5) nicht mehr gab — sie heißt seither
// `annotationen.zoomeAufPin`. Ergebnis: die GANZE /cde-Ansicht warf beim
// Aufbau einen ReferenceError und blieb leer.
//
// Zwei Dinge, die keine der 571 Prüfungen fangen konnte: `@vue/compiler-sfc`
// übersetzt so eine Datei anstandslos (der Bezeichner ist syntaktisch gültig),
// und kein Test importiert IfcViewer.vue. Genau dafür ist dieser Wächter da.
//
// Dieselbe Klasse hatte in Stufe 2 schon `storeyNavRef` erwischt — zweimal
// dieselbe Ursache ist einmal zu oft für eine Einzelkur.
//
// Das Projekt hat eslint als Abhängigkeit, aber KEINE Konfiguration — deshalb
// lief nie eine Prüfung. Statt eine projektweite Config einzuführen (die über
// alle Module hinweg erst aufräumen müsste), prüft dieser Test gezielt die CDE
// auf genau diese eine Regel.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Linter } from 'eslint'
import vueParser from 'vue-eslint-parser'

const WURZEL = new URL('..', import.meta.url).pathname

function quellDateien(dir, treffer = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) quellDateien(p, treffer)
    else if (/\.(vue|js)$/.test(name)) treffer.push(p)
  }
  return treffer
}

describe('CDE: keine undefinierten Bezeichner', () => {
  it('no-undef ist in allen .vue/.js sauber', () => {
    const linter = new Linter()
    linter.defineParser('vue-eslint-parser', vueParser)
    const befunde = []
    for (const datei of quellDateien(WURZEL)) {
      const code = readFileSync(datei, 'utf8')
      const cfg = {
        parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
        env: { browser: true, es2022: true, node: true },
        rules: { 'no-undef': 'error' },
      }
      if (datei.endsWith('.vue')) cfg.parser = 'vue-eslint-parser'
      for (const m of linter.verify(code, cfg)) {
        befunde.push(`${datei.replace(WURZEL, '')}:${m.line} ${m.message}`)
      }
    }
    expect(befunde).toEqual([])
  // eslint über ~130 Dateien braucht mehrere Sekunden; unter der Parallellast
  // des Gesamtlaufs reichen die voreingestellten 5 s nicht. Ohne diese Grenze
  // faellt der Waechter sporadisch — und ein flatterhafter Waechter wird
  // abgeschaltet statt beachtet.
  }, 60_000)
})
