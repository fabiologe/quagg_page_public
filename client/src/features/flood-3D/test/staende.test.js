// @vitest-environment jsdom
/**
 * Geometrie-Stände: benannte Vollkopien der Fallgeometrie auf dem Server.
 * Diese Tests halten die drei Zusagen fest, an denen der Nutzen hängt:
 *
 *  1. Gesichert wird, was auf der PLATTE liegt — ein ungespeicherter
 *     Entwurf muss vorher gespeichert werden, sonst enthält der Stand
 *     etwas anderes als der Bildschirm zeigt.
 *  2. Nach dem Laden ist der Fall ein anderer: der Bearbeitungsverlauf
 *     gehört zum alten Stand (seine Snapshots verweisen auf Dateien, die
 *     es nicht mehr gibt — die Snapshot-Falle), das Vorschaunetz ist
 *     veraltet, und Spec/Geometrie kommen komplett neu vom Server.
 *  3. Ein Altlauf ohne gesicherte Geometrie (409) ist eine Meldung, kein
 *     Absturz.
 *
 * Dazu zwei Rendertests: eine Panelzeile, die beim Zeichnen abstürzt,
 * fällt bei reiner Template-Kompilierung nicht auf.
 */
import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', () => ({
  flood3dApi: {
    staende: vi.fn(),
    standAnlegen: vi.fn(),
    standLaden: vi.fn(),
    standLoeschen: vi.fn(),
    laufGeometrieAlsStand: vi.fn(),
    getCase: vi.fn(),
    caseSchema: vi.fn(),
    caseGeometry: vi.fn(),
    caseRasters: vi.fn(),
    listImports: vi.fn(),
    listRuns: vi.fn(),
    meshPreviewState: vi.fn(),
    saveCase: vi.fn(),
  },
  launchPasswortSichern: vi.fn(),
}))

import CaseRunsPanel from '../components/pre/CaseRunsPanel.vue'
import StaendePanel from '../components/pre/StaendePanel.vue'
import { flood3dApi } from '../services/api'
import { usePreStore } from '../stores/usePreStore'

let pre
let pinia

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  pre = usePreStore()
  pre.activeCaseId = 'demo'
  pre.spec = { meta: { title: 'Demo' } }
  vi.spyOn(pre, 'melden')
  vi.clearAllMocks()

  // Der volle Weg von openCase — der Stand-Wechsel liest den Fall damit neu
  flood3dApi.caseSchema.mockRejectedValue(new Error('kein Schema im Test'))
  flood3dApi.getCase.mockResolvedValue({ meta: { title: 'Demo' } })
  flood3dApi.caseGeometry.mockResolvedValue({ validation: [] })
  flood3dApi.caseRasters.mockResolvedValue([])
  flood3dApi.listImports.mockResolvedValue({ imports: [] })
  flood3dApi.listRuns.mockResolvedValue([])
  // Der Server hält das gespeicherte Vorschaunetz für aktuell — genau der
  // Fall, in dem die Marke nach dem Stand-Wechsel trotzdem stehen muss
  flood3dApi.meshPreviewState.mockResolvedValue({
    preview: { cells: 1000 }, stale: false })
  flood3dApi.staende.mockResolvedValue({ staende: [] })
})

describe('Stand sichern', () => {
  it('speichert einen ungespeicherten Entwurf VOR dem Sichern', async () => {
    pre.dirty = true
    const saveCase = vi.spyOn(pre, 'saveCase')
      .mockImplementation(async () => { pre.dirty = false; return true })
    flood3dApi.standAnlegen.mockResolvedValue(
      { stand: { id: 's1', name: 'Wehr 30 cm höher' } })

    expect(await pre.standSichern('Wehr 30 cm höher')).toBe(true)
    expect(saveCase).toHaveBeenCalled()
    expect(saveCase.mock.invocationCallOrder[0])
      .toBeLessThan(flood3dApi.standAnlegen.mock.invocationCallOrder[0])
    expect(flood3dApi.standAnlegen)
      .toHaveBeenCalledWith('demo', 'Wehr 30 cm höher')
    expect(flood3dApi.staende).toHaveBeenCalled()      // Liste nachgezogen
    expect(pre.melden).toHaveBeenCalledWith(
      expect.stringContaining('Wehr 30 cm höher'), 'erfolg')
  })

  it('legt keinen Stand an, wenn das Speichern scheitert', async () => {
    pre.dirty = true
    vi.spyOn(pre, 'saveCase').mockResolvedValue(false)
    expect(await pre.standSichern('kaputt')).toBe(false)
    expect(flood3dApi.standAnlegen).not.toHaveBeenCalled()
  })

  it('speichert nicht, wenn nichts offen ist — und nicht ohne Namen', async () => {
    const saveCase = vi.spyOn(pre, 'saveCase').mockResolvedValue(true)
    flood3dApi.standAnlegen.mockResolvedValue({ stand: { id: 's1', name: 'a' } })
    await pre.standSichern('a')
    expect(saveCase).not.toHaveBeenCalled()            // dirty === false
    expect(await pre.standSichern('   ')).toBe(false)
    expect(flood3dApi.standAnlegen).toHaveBeenCalledTimes(1)
  })

  it('meldet einen Fehlschlag statt ihn zu verschlucken', async () => {
    flood3dApi.standAnlegen.mockRejectedValue(new Error('Platte voll'))
    expect(await pre.standSichern('x')).toBe(false)
    expect(pre.melden).toHaveBeenCalledWith(
      expect.stringContaining('Platte voll'), 'fehler')
    expect(pre.staendeLoading).toBe(false)
  })
})

describe('Stand laden', () => {
  beforeEach(() => {
    pre.staende = [{ id: 's1', name: 'Ausgangslage', case_hash: 'alt',
      erstellt: 1_770_000_000, groesse_mb: 12, quelle: 'hand' }]
    pre.undoStack = ['{"a":1}', '{"a":2}']
    pre.redoStack = ['{"a":3}']
    pre.meshPreview = { cells: 1000 }
    pre.meshPreviewStale = false
  })

  it('leert Undo/Redo, markiert das Netz und liest den Fall neu ein', async () => {
    flood3dApi.standLaden.mockResolvedValue(
      { ok: true, case_hash: 'neu4711', auto_stand: { id: 'a1', name: 'vorher' } })

    expect(await pre.standLaden('s1')).toBe(true)
    expect(flood3dApi.standLaden).toHaveBeenCalledWith('demo', 's1')

    // Der Fall ist KOMPLETT neu gelesen — Spec, Geometrie, Raster, Importe
    expect(flood3dApi.getCase).toHaveBeenCalledWith('demo')
    expect(flood3dApi.caseGeometry).toHaveBeenCalledWith('demo')
    expect(flood3dApi.caseRasters).toHaveBeenCalledWith('demo')
    expect(flood3dApi.listImports).toHaveBeenCalledWith('demo')

    // Die Snapshot-Falle: alte Verlaufseinträge zeigen auf Dateien, die es
    // nach dem Tausch nicht mehr gibt
    expect(pre.undoStack).toEqual([])
    expect(pre.redoStack).toEqual([])
    expect(pre.canUndo).toBe(false)

    // Das Vorschaunetz wandert nicht mit — auch wenn der Server-Abgleich
    // (meshPreviewState: stale = false) etwas anderes behauptet
    expect(pre.meshPreviewStale).toBe(true)

    expect(pre.caseHash).toBe('neu4711')
    expect(flood3dApi.staende).toHaveBeenCalled()
    expect(pre.melden).toHaveBeenCalledWith(
      expect.stringContaining('Ausgangslage'), 'erfolg')
    expect(pre.melden).toHaveBeenCalledWith(
      expect.stringContaining('automatisch gesichert'), 'erfolg')
  })

  it('nennt die automatische Sicherung nur, wenn es sie gab', async () => {
    flood3dApi.standLaden.mockResolvedValue(
      { ok: true, case_hash: 'neu4711', auto_stand: null })
    await pre.standLaden('s1')
    const texte = pre.melden.mock.calls.map((c) => c[0]).join('|')
    expect(texte).toContain('Ausgangslage')
    expect(texte).not.toContain('automatisch gesichert')
  })

  it('speichert einen offenen Entwurf, bevor getauscht wird', async () => {
    pre.dirty = true
    const saveCase = vi.spyOn(pre, 'saveCase')
      .mockImplementation(async () => { pre.dirty = false; return true })
    flood3dApi.standLaden.mockResolvedValue({ ok: true, case_hash: 'h' })
    await pre.standLaden('s1')
    expect(saveCase.mock.invocationCallOrder[0])
      .toBeLessThan(flood3dApi.standLaden.mock.invocationCallOrder[0])
  })

  it('rührt den Fall nicht an, wenn der Tausch scheitert', async () => {
    flood3dApi.standLaden.mockRejectedValue(new Error('Stand nicht gefunden'))
    expect(await pre.standLaden('s1')).toBe(false)
    expect(flood3dApi.getCase).not.toHaveBeenCalled()
    expect(pre.undoStack.length).toBe(2)               // Verlauf bleibt
    expect(pre.melden).toHaveBeenCalledWith(
      expect.stringContaining('Stand nicht gefunden'), 'fehler')
  })
})

describe('Stand löschen und Liste holen', () => {
  it('löscht und zieht die Liste nach', async () => {
    pre.staende = [{ id: 's1', name: 'Ausgangslage' }]
    flood3dApi.standLoeschen.mockResolvedValue({ ok: true })
    expect(await pre.standLoeschen('s1')).toBe(true)
    expect(flood3dApi.standLoeschen).toHaveBeenCalledWith('demo', 's1')
    expect(flood3dApi.staende).toHaveBeenCalled()
    expect(pre.melden).toHaveBeenCalledWith(
      expect.stringContaining('Ausgangslage'), 'erfolg')
  })

  it('scheitert leise: leere Liste plus Meldung', async () => {
    pre.staende = [{ id: 's1', name: 'alt' }]
    flood3dApi.staende.mockRejectedValue(new Error('404'))
    await pre.ladeStaende()
    expect(pre.staende).toEqual([])
    expect(pre.staendeLoading).toBe(false)
    expect(pre.melden).toHaveBeenCalledWith(
      expect.stringContaining('404'), 'fehler')
  })
})

describe('Geometrie eines Laufs übernehmen', () => {
  it('sichert sie als Stand und zieht die Liste nach', async () => {
    flood3dApi.laufGeometrieAlsStand.mockResolvedValue(
      { case_id: 'demo', stand: { id: 's9', name: 'Lauf demo_r007' } })
    expect(await pre.laufGeometrieUebernehmen('demo_r007')).toBe(true)
    expect(flood3dApi.staende).toHaveBeenCalled()
    expect(pre.melden).toHaveBeenCalledWith(
      expect.stringContaining('demo_r007'), 'erfolg')
  })

  it('macht aus 409 (Altlauf) eine Meldung statt eines Absturzes', async () => {
    const fehler = new Error(
      'Lauf demo_r003 hat keine gesicherte Geometrie (vor Einführung der Stände)')
    fehler.status = 409
    flood3dApi.laufGeometrieAlsStand.mockRejectedValue(fehler)

    expect(await pre.laufGeometrieUebernehmen('demo_r003')).toBe(false)
    expect(pre.melden).toHaveBeenCalledWith(
      expect.stringContaining('keine gesicherte Geometrie'), 'fehler')
    expect(pre.staendeLoading).toBe(false)
    expect(flood3dApi.staende).not.toHaveBeenCalled()
  })

  it('zieht die Liste NICHT nach, wenn der Lauf zu einem anderen Fall gehört', async () => {
    flood3dApi.laufGeometrieAlsStand.mockResolvedValue(
      { case_id: 'anderer', stand: { id: 's9', name: 'x' } })
    await pre.laufGeometrieUebernehmen('anderer_r001')
    expect(flood3dApi.staende).not.toHaveBeenCalled()
  })
})

/** Komponente mit dieser Pinia-Instanz zeichnen und das Wurzelelement geben */
function zeichnen(Komponente) {
  const el = document.createElement('div')
  const app = createApp(Komponente)
  app.use(pinia)
  app.mount(el)
  return { el, app }
}

describe('Panels zeichnen', () => {
  it('Stände-Panel: Name, Datum, Stempel, Herkunft, Größe', () => {
    pre.caseHash = 'abc12345def'
    pre.staende = [
      { id: 's1', name: 'Ausgangslage', erstellt: 1_770_000_000,
        case_hash: 'abc12345def', groesse_mb: 12.4, quelle: 'hand' },
      { id: 's2', name: 'Vor dem Wechsel', erstellt: 1_770_000_900,
        case_hash: 'zzz', groesse_mb: 3, quelle: 'auto' },
      { id: 's3', name: 'Lauf 7', erstellt: 1_770_001_900,
        case_hash: null, groesse_mb: 3, quelle: 'lauf:demo_r007' },
    ]
    const { el, app } = zeichnen(StaendePanel)
    const text = el.textContent
    expect(text).toContain('Ausgangslage')
    expect(text).toContain('von Hand')
    expect(text).toContain('automatisch')
    expect(text).toContain('aus Lauf demo_r007')
    expect(text).toContain('abc12345')          // Stempel gekürzt
    expect(text).toContain('12 MB')
    // Genau der Stand, dessen Stempel dem offenen Fall entspricht,
    // ist hervorgehoben — die beiden anderen bleiben neutral
    expect(el.querySelectorAll('.f3d-chip.status-completed').length).toBe(1)
    app.unmount()
  })

  it('Läufe-Panel: „Geometrie als Stand" nur bei gesicherter Geometrie', () => {
    pre.caseRuns = [
      { run_id: 'demo_r001', status: 'completed', spec_gesichert: false },
      { run_id: 'demo_r002', status: 'completed', spec_gesichert: true },
    ]
    const { el, app } = zeichnen(CaseRunsPanel)
    const knoepfe = [...el.querySelectorAll('button')]
      .filter((b) => b.textContent.includes('Geometrie als Stand'))
    expect(knoepfe.length).toBe(2)
    expect(knoepfe[0].disabled).toBe(true)
    expect(knoepfe[0].title).toContain('vor den Ständen')
    expect(knoepfe[1].disabled).toBe(false)
    app.unmount()
  })
})
