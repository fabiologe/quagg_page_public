// Utility-Klassen müssen dort wirken, wo sie benutzt werden.
// Aufgetreten im UI-Audit (2026-08-08): acht Klassen (f3d-row, f3d-grow,
// f3d-check, f3d-field, f3d-mono, f3d-lbl, f3d-cta, f3d-select-s) waren
// nur in den SCOPED Styles einzelner Komponenten definiert und wirkten
// deshalb in allen anderen nicht — f3d-row ohne Flexbox, f3d-grow ohne
// Dehnung. Sie stehen jetzt global in f3d-theme.css.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WURZEL = new URL('..', import.meta.url).pathname
const UTILITIES = ['f3d-row', 'f3d-grow', 'f3d-check', 'f3d-field',
  'f3d-mono', 'f3d-lbl', 'f3d-cta', 'f3d-select-s']

function dateien(dir, treffer = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) dateien(p, treffer)
    else if (/\.vue$/.test(n)) treffer.push(p)
  }
  return treffer
}

describe('flood-3D Utility-Klassen', () => {
  const theme = readFileSync(join(WURZEL, 'styles/f3d-theme.css'), 'utf8')

  it.each(UTILITIES)('%s ist global definiert', (klasse) => {
    expect(theme).toMatch(new RegExp(`\\.${klasse}[\\s{,:]`))
  })

  it('jede benutzte Utility wirkt (global oder lokal definiert)', () => {
    const luecken = []
    for (const datei of dateien(WURZEL)) {
      const text = readFileSync(datei, 'utf8')
      const style = text.slice(text.indexOf('<style'))
      for (const klasse of UTILITIES) {
        const benutzt = new RegExp(`class="[^"]*\\b${klasse}\\b`).test(text)
        if (!benutzt) continue
        const lokal = new RegExp(`\\.${klasse}[\\s{,:]`).test(style)
        const global = new RegExp(`\\.${klasse}[\\s{,:]`).test(theme)
        if (!lokal && !global) luecken.push(`${datei.replace(WURZEL, '')}: ${klasse}`)
      }
    }
    expect(luecken).toEqual([])
  })
})
