/**
 * Tragen die Routen den Schutz, den sie brauchen?
 *
 * `guard.test.js` prueft die ENTSCHEIDUNG — was passiert, wenn eine Route
 * `requiresAuth` traegt. Es prueft nicht, ob eine bestimmte Route das auch
 * tut: das `meta` wird dort von Hand gebaut. Genau in dieser Luecke lag die
 * CDE monatelang ungeschuetzt, waehrend zwoelf Nachbarrouten einen Guard
 * hatten und die Guard-Tests gruen waren.
 *
 * Diese Datei liest deshalb die ECHTE Routentabelle. Sie ist die einzige
 * Stelle, an der Regel und Wirklichkeit dieselbe Groesse messen.
 *
 * Der Test liest die Datei als TEXT statt den Router zu importieren: der
 * Router zieht `@/services/api`, Pinia und ein Dutzend Komponenten nach sich,
 * und ein Schutztest sollte nicht daran scheitern koennen, dass irgendeine
 * Komponente eine Abhaengigkeit aendert.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const QUELLE = readFileSync(new URL('../index.js', import.meta.url), 'utf8')

/** Den `meta`-Block einer Route ueber ihren Pfad finden. */
function metaVon(pfad) {
  const i = QUELLE.indexOf(`path: '${pfad}'`)
  if (i < 0) return null
  const bis = QUELLE.indexOf('meta:', i)
  if (bis < 0) return null
  // Bis zum Zeilenende — die Metas stehen im Projekt einzeilig.
  return QUELLE.slice(bis, QUELLE.indexOf('\n', bis))
}

/**
 * Routen, die interne Daten zeigen und deshalb angemeldete Nutzer verlangen.
 * Neue interne Route? Hier eintragen — sonst faellt sie durch dieselbe Luecke.
 */
const INTERN = ['/cde', '/mail']

describe('Interne Routen sind geschuetzt', () => {
  it.each(INTERN)('%s verlangt Anmeldung und eine Mindestrolle', (pfad) => {
    const meta = metaVon(pfad)
    expect(meta, `${pfad}: keine meta-Zeile gefunden`).toBeTruthy()
    expect(meta, `${pfad}: requiresAuth fehlt`).toMatch(/requiresAuth:\s*true/)
    expect(meta, `${pfad}: minRole fehlt`).toMatch(/minRole:/)
  })

  it('haelt die CDE mindestens auf WERKSTUDENT', () => {
    // Sie zeigt Projektakten, Dokumentregister, Mengen und Kosten. Fuer Kunden
    // gibt es das Portal; wird das hier gelockert, ist das eine Entscheidung
    // und kein Versehen.
    expect(metaVon('/cde')).toMatch(/minRole:\s*'(WERKSTUDENT|MITARBEITER|ADMIN)'/)
  })
})

describe('Die CDE steht nicht mehr auf dem oeffentlichen Dashboard', () => {
  it('verlinkt das oeffentliche Werkzeug-Dashboard sie nicht', () => {
    // Eine Karte, die Besucher auf eine Seite fuehrt, die ohne Anmeldung
    // nichts kann, ist schlimmer als keine Karte.
    const dashboard = readFileSync(
      new URL('../../views/public/tools/ToolsDashboard.vue', import.meta.url), 'utf8',
    )
    expect(dashboard).not.toMatch(/push\(['"]\/cde['"]\)/)
  })
})
