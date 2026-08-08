// Fängt die Fehlerklasse „Bezeichner existiert gar nicht" ab. Aufgetreten
// 2026-08-08 im UI-Audit: ValidationPanel.jump() prüfte eine nie
// definierte Variable `objectId` statt finding.object_id — JEDER Klick auf
// einen Prüfbefund warf stumm einen ReferenceError, der Sprung zum
// fehlerhaften Objekt hat nie funktioniert.
//
// Das Projekt hat eslint als Abhängigkeit, aber KEINE Konfiguration —
// deshalb lief nie eine Prüfung. Statt eine projektweite Config
// einzuführen (die über alle Module hinweg erst einmal aufräumen müsste),
// prüft dieser Test gezielt flood-3D auf genau diese eine Regel.
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

describe('flood-3D: keine undefinierten Bezeichner', () => {
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
  })
})
