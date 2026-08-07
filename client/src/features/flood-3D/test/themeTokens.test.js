// Regressionstest für die Fehlerklasse „Farbe zeigt auf ein Token, das
// hier gar nicht gilt". Konkret aufgetreten (2026-08-07): die Erklärkarte
// KennwertHilfe hängt per <Teleport> am <body> und lag damit ausserhalb
// von .f3d-root, wo die Tokens definiert waren — jedes var(--f3d-text)
// war dort undefiniert, der Text fiel auf die dunkle Dokumentfarbe
// zurück und stand unlesbar auf dunkelblauem Grund. Dazu drei Tokens,
// die es nie gab (--f3d-muted, --f3d-akzent, --f3d-bg-alt).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WURZEL = new URL('..', import.meta.url).pathname
const THEME = join(WURZEL, 'styles/f3d-theme.css')

function dateienSammeln(dir, treffer = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) dateienSammeln(p, treffer)
    else if (/\.(vue|css)$/.test(name)) treffer.push(p)
  }
  return treffer
}

// Definierte Tokens samt Selektor, in dem sie stehen
function tokenBloecke(css) {
  const bloecke = {}
  const re = /([^{}]+)\{([^}]*)\}/g
  let m
  while ((m = re.exec(css))) {
    const selektor = m[1].trim().split('\n').pop().trim()
    for (const t of m[2].matchAll(/(--f3d-[a-z0-9-]+)\s*:/g)) {
      bloecke[t[1]] = selektor
    }
  }
  return bloecke
}

describe('flood-3D Theme-Tokens', () => {
  const css = readFileSync(THEME, 'utf8')
  const definiert = tokenBloecke(css)

  it('definiert die Tokens auf :root, nicht auf .f3d-root', () => {
    // Sonst erben teleportierte Elemente (Erklärkarte, künftige Modals)
    // sie NICHT — genau der Bug, der die Hilfetexte unlesbar machte.
    expect(Object.keys(definiert).length).toBeGreaterThan(10)
    for (const [token, selektor] of Object.entries(definiert)) {
      expect(selektor, `${token} steht auf "${selektor}"`).toBe(':root')
    }
  })

  it('verwendet kein Token, das nirgends definiert ist', () => {
    const unbekannt = []
    for (const datei of dateienSammeln(WURZEL)) {
      const text = readFileSync(datei, 'utf8')
      for (const m of text.matchAll(/var\((--f3d-[a-z0-9-]+)/g)) {
        if (!(m[1] in definiert)) {
          unbekannt.push(`${datei.replace(WURZEL, '')}: ${m[1]}`)
        }
      }
    }
    // Ein Fallback rettet die Optik, aber der Wert läuft dann an der
    // Palette vorbei und ändert sich bei einem Theme-Wechsel nicht mit.
    expect(unbekannt).toEqual([])
  })

  it('gibt der Erklärkarte Farben, die auch ausserhalb von .f3d-root tragen', () => {
    const karte = readFileSync(
      join(WURZEL, 'components/post/KennwertHilfe.vue'), 'utf8')
    const block = karte.slice(karte.indexOf('.f3d-hilfe-karte {'))
    // Jede Farbangabe der Karte braucht einen Fallback — sie hängt am
    // <body> und ist damit von der Token-Vererbung abgeschnitten, falls
    // die Definition je zurück auf .f3d-root wandert.
    for (const m of block.matchAll(/(?:color|border[a-z-]*):[^;]*var\((--f3d-[a-z0-9-]+)([^)]*)\)/g)) {
      expect(m[2], `${m[1]} in der Erklärkarte ohne Fallback`).toMatch(/^,\s*#/)
    }
  })
})
