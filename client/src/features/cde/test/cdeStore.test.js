// @vitest-environment jsdom
/**
 * CDE-Store — Auftrag, Modellsätze, Dokumentregister (Stufe 11.3).
 *
 * Vorher hiessen drei verschiedene Dinge „Projekt": der Auftragsordner auf der
 * StorageBox und zwei im Client erfundene Sammlungen. Seit Stufe 11 sind sie
 * getrennt, und diese Datei hält die Trennung fest:
 *
 *   Der AUFTRAG kommt vom Server — die CDE legt keinen an.
 *   Die DOKUMENTE gehören dem Auftrag, nicht dem Satz.
 *   Ein MODELLSATZ ist eine Auswahl; er besitzt nichts.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCdeStore, ISO_STATUS } from '../stores/useCdeStore'
import { dokumentAusManifest, repo } from '../services/RepoFacade'
import { useAuthStore } from '@/stores/useAuthStore.js'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

const REGISTER = {
  stammdaten: { nummer: '1337', name: 'Genau', bauherr: 'Stadt', lph: 'LPH 3' },
  saetze: [
    { id: 's-nord', name: 'Variante Nord', zweck: 'variante', enthaelt: ['aaa'] },
    { id: 's-sued', name: 'Variante Süd', zweck: 'variante', enthaelt: ['bbb'] },
  ],
}

describe('Der Auftrag kommt aus dem Ordner', () => {
  it('übernimmt Stammdaten und Sätze aus EINER Register-Antwort', async () => {
    // Zwei Wege zur selben Liste sind genau das, woran Register und
    // Viewer-Liste in Stufe 3 auseinandergelaufen sind.
    const cde = useCdeStore()
    await cde.ready
    await cde.uebernehmeRegister(REGISTER, 1337)

    expect(cde.auftrag).toEqual({ id: 1337, nummer: '1337', name: 'Genau', bauherr: 'Stadt', lph: 'LPH 3' })
    expect(cde.saetze.map(s => s.id)).toEqual(['s-nord', 's-sued'])
  })

  it('hat ohne Projekt-Id keinen Auftrag — und erfindet keinen', async () => {
    const cde = useCdeStore()
    await cde.ready
    await cde.uebernehmeRegister(REGISTER, null)
    expect(cde.auftrag).toBe(null)
  })

  it('bietet gar keinen Weg, einen Auftrag anzulegen', () => {
    // Ein Auftrag ist ein Ordner auf der StorageBox. Wer hier einen erfände,
    // bekäme ein Projekt ohne Ordner, ohne Nummer und ohne Bauherrn — und
    // genau zwei davon standen am Ende in 1337_Genau.
    const cde = useCdeStore()
    expect(cde.createProject).toBeUndefined()
    expect(cde.updateProject).toBeUndefined()
    expect(cde.deleteProject).toBeUndefined()
  })
})

describe('Modellsätze', () => {
  it('merkt sich den aktiven Satz über das Neuladen hinweg', async () => {
    const cde = useCdeStore()
    await cde.ready
    await cde.uebernehmeRegister(REGISTER, 1337)
    await cde.setzeSatz('s-nord')
    expect(cde.aktiverSatz.name).toBe('Variante Nord')

    setActivePinia(createPinia())
    const neu = useCdeStore()
    await neu.ready
    await neu.uebernehmeRegister(REGISTER, 1337)
    expect(neu.aktiverSatzId).toBe('s-nord')
  })

  it('lässt einen Satz fallen, den es nicht mehr gibt', async () => {
    // Sonst zeigte der Wähler auf etwas Verschwundenes, und alle Ablagen
    // liefen in einen Scope, den niemand mehr kennt.
    const cde = useCdeStore()
    await cde.ready
    await cde.uebernehmeRegister(REGISTER, 1337)
    await cde.setzeSatz('s-nord')

    await cde.uebernehmeRegister({ ...REGISTER, saetze: [REGISTER.saetze[1]] }, 1337)
    expect(cde.aktiverSatzId).toBe(null)
  })

  it('legt die Satz-Ablage unter einen eigenen Scope', async () => {
    const cde = useCdeStore()
    await cde.ready
    await cde.uebernehmeRegister(REGISTER, 1337)

    expect(cde.satzRepo().scope).toBe('global')      // ohne Satz: Auftragsebene
    await cde.setzeSatz('s-nord')
    expect(cde.satzRepo().scope).toBe('stand:s-nord')
  })
})

describe('Das Dokumentregister gehört dem AUFTRAG', () => {
  it('bleibt beim Satzwechsel gleich — Dateien gehören nicht dem Satz', async () => {
    const cde = useCdeStore()
    await cde.ready
    await cde.uebernehmeRegister(REGISTER, 1337)
    await cde.registerModel({ sha256: 'aaa', name: 'a.ifc' })

    await cde.setzeSatz('s-nord')
    expect(cde.dokumente).toHaveLength(1)
    await cde.setzeSatz('s-sued')
    expect(cde.dokumente).toHaveLength(1)
  })

  it('registriert Modelle als WIP mit Revisionszählung je GlobalId', async () => {
    const cde = useCdeStore()
    await cde.ready
    await cde.setBearbeiter('Fabio')

    const rev1 = await cde.registerModel({ sha256: 'aaa', name: 'haus_rev1.ifc', size: 100, projectGlobalId: 'GID-X' })
    const rev2 = await cde.registerModel({ sha256: 'bbb', name: 'haus_rev2.ifc', size: 120, projectGlobalId: 'GID-X' })
    const other = await cde.registerModel({ sha256: 'ccc', name: 'anders.ifc', size: 50, projectGlobalId: 'GID-Y' })

    expect(rev1.revision).toBe(1)
    expect(rev2.revision).toBe(2)   // gleiche GlobalId → nächste Revision
    expect(other.revision).toBe(1)  // andere GlobalId → eigenes Dokument
    expect(rev1.status).toBe('WIP')
    expect(rev1.statusHistorie[0].von).toBe('Fabio')

    // Gleiche sha nochmal → kein Duplikat
    await cde.registerModel({ sha256: 'aaa', name: 'haus_rev1.ifc' })
    expect(cde.dokumente).toHaveLength(3)
  })

  it('registriert auch OHNE Auftrag — das Modell liegt dann lokal', async () => {
    // Vorher hing das an `activeProjectId` und tat ohne Projekt gar nichts.
    const cde = useCdeStore()
    await cde.ready
    expect(await cde.registerModel({ sha256: 'aaa', name: 'a.ifc' })).toBeTruthy()
  })

  it('Statuswechsel schreibt die Audit-Spur, ungültige Status werden abgelehnt', async () => {
    const cde = useCdeStore()
    await cde.ready
    await cde.setBearbeiter('Fabio')
    await cde.registerModel({ sha256: 'aaa', name: 'x.ifc' })

    expect(await cde.setDokumentStatus('aaa', 'Shared')).toBe(true)
    expect(await cde.setDokumentStatus('aaa', 'Quatsch')).toBe(false)
    const doc = cde.dokumente[0]
    expect(doc.status).toBe('Shared')
    expect(doc.statusHistorie.map(h => h.status)).toEqual(['WIP', 'Shared'])
    expect(ISO_STATUS).toContain('Published')
  })
})

// Kassensturz H1: das Feld „Bearbeiter" ist aus der Kopfleiste verschwunden.
// Sein alter Wert lag im PROJEKTordner und galt für jeden, der das Projekt
// öffnete — ohne Feld liesse er sich nicht einmal mehr korrigieren.
describe('Wer bearbeitet — der Name aus der Anmeldung', () => {
  it('gewinnt gegen einen alten Wert im Projektordner', async () => {
    await repo.set('cde-bearbeiter', 'Jemand anderes')
    localStorage.setItem('user', JSON.stringify({ anzeigename: 'Fabio Login' }))
    const cde = useCdeStore()
    await cde.ready
    expect(useAuthStore().anzeigename).toBe('Fabio Login')
    expect(cde.bearbeiter).toBe('Fabio Login')
  })

  it('setBearbeiter ist nur der Rückfall ohne Anmeldung und schreibt nichts ab', async () => {
    const cde = useCdeStore()
    await cde.ready
    await cde.setBearbeiter('Ohne Login')
    expect(cde.bearbeiter).toBe('Ohne Login')
    expect(await repo.get('cde-bearbeiter')).not.toBe('Ohne Login')
  })
})

describe('Die Register-Antwort wird ÜBERSETZT, nicht durchgereicht', () => {
  /**
   * Das Manifest schreibt `datei`, `groesse`, `hochgeladen_am`; der Viewer
   * rechnet mit `name`, `size`, `addedAt` (ms-Epoche). Die Rohantwort
   * einzusetzen liess die Registertabelle mit leeren Namen und lauter Strichen
   * dastehen — die Zeilen waren da, nur sagte keine etwas.
   */
  const MANIFESTZEILE = {
    sha256: 'aaa', datei: 'Kanal_R01.ifc', groesse: 4096, art: 'modell',
    revision: 1, status: 'WIP', von: 'admin',
    hochgeladen_am: '2026-08-31T11:22:41+00:00', projekt_global_id: null,
  }

  it('macht aus datei/groesse/hochgeladen_am die Felder der Anzeige', async () => {
    const cde = useCdeStore()
    await cde.ready
    await cde.uebernehmeRegister({ ...REGISTER, dokumente: [MANIFESTZEILE] }, 1337)

    const d = cde.dokumente[0]
    expect(d.name).toBe('Kanal_R01.ifc')
    expect(d.size).toBe(4096)
    expect(d.addedAt).toBe(Date.parse('2026-08-31T11:22:41+00:00'))
    expect(d.status).toBe('WIP')
  })

  it('lässt keine Rohfelder stehen, die niemand liest', () => {
    // Sonst läge dieselbe Angabe in zwei Schreibweisen nebeneinander, und
    // niemand wüsste, welche gilt.
    const uebersetzt = dokumentAusManifest(MANIFESTZEILE)
    expect(uebersetzt.datei).toBeUndefined()
    expect(uebersetzt.groesse).toBeUndefined()
  })
})
