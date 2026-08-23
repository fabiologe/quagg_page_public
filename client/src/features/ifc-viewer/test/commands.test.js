// @vitest-environment jsdom
//
// Befehls-Registry + Palette-Filter (Sprint U): eine Quelle für Palette,
// Hilfe-Overlay und Tooltips.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { usePaletteCommands, filterCommands } from '../stores/useCommands'

const CMDS = [
  { id: 'tool.measure', titel: 'Strecke messen',   gruppe: 'Werkzeug', key: 'M', run: () => {} },
  { id: 'tool.section', titel: 'Horizontaler Schnitt', gruppe: 'Werkzeug', key: 'T/R', run: () => {} },
  { id: 'panel.cockpit', titel: 'Planungs-Cockpit ein-/ausblenden', gruppe: 'Panel', run: () => {} },
  { id: 'exp.dxf', titel: 'Lageplan als DXF', gruppe: 'Export', run: () => {} },
]

beforeEach(() => { setActivePinia(createPinia()) })

describe('usePaletteCommands', () => {
  it('sammelt Befehle über mehrere Bereiche und meldet sie wieder ab', () => {
    const c = usePaletteCommands()
    c.register('viewer', CMDS.slice(0, 2))
    c.register('projekt', CMDS.slice(2))
    expect(c.alle).toHaveLength(4)
    c.unregister('projekt')
    expect(c.alle.map(x => x.id)).toEqual(['tool.measure', 'tool.section'])
  })

  it('blendet Befehle aus, deren Voraussetzung fehlt', () => {
    // `verfuegbar` MUSS reaktiven Zustand lesen (im Viewer z. B.
    // `ifc.selectedElement`) — sonst merkt die Liste die Änderung nicht.
    const c = usePaletteCommands()
    const hatAuswahl = ref(false)
    c.register('viewer', [
      ...CMDS,
      { id: 'sel.hide', titel: 'Auswahl ausblenden', gruppe: 'Auswahl',
        verfuegbar: () => hatAuswahl.value, run: () => {} },
    ])
    expect(c.alle.find(x => x.id === 'sel.hide')).toBeUndefined()
    hatAuswahl.value = true
    expect(c.alle.find(x => x.id === 'sel.hide')).toBeTruthy()
  })

  it('mitTaste liefert genau die Befehle mit Kürzel (Grundlage des Hilfe-Overlays)', () => {
    const c = usePaletteCommands()
    c.register('viewer', CMDS)
    expect(c.mitTaste.map(x => x.key)).toEqual(['M', 'T/R'])
  })

  it('run führt aus und merkt sich die Reihenfolge', () => {
    const c = usePaletteCommands()
    const spy = vi.fn()
    c.register('viewer', [{ id: 'x', titel: 'X', gruppe: 'G', run: spy }, ...CMDS])
    expect(c.run('x')).toBe(true)
    expect(spy).toHaveBeenCalledOnce()
    c.run('exp.dxf')
    expect(c.zuletzt).toEqual(['exp.dxf', 'x'])
    expect(c.run('gibtsnicht')).toBe(false)
  })
})

describe('filterCommands', () => {
  it('ohne Suchtext: zuletzt benutzte zuerst', () => {
    const out = filterCommands(CMDS, '', ['exp.dxf', 'tool.section'])
    expect(out.map(c => c.id).slice(0, 2)).toEqual(['exp.dxf', 'tool.section'])
  })

  it('Titel-Präfix schlägt Wortanfang schlägt Teilstring', () => {
    const liste = [
      { id: 'a', titel: 'Modell zeigen',     gruppe: '' },
      { id: 'b', titel: 'Strecke messen',    gruppe: '' },
      { id: 'c', titel: 'Messen beenden',    gruppe: '' },
    ]
    // 'messen': c beginnt damit (0), b hat Wortanfang (1), a fällt raus
    expect(filterCommands(liste, 'messen').map(c => c.id)).toEqual(['c', 'b'])
  })

  it('findet auch über die Gruppe', () => {
    expect(filterCommands(CMDS, 'export').map(c => c.id)).toEqual(['exp.dxf'])
  })

  it('Sonderzeichen in der Suche werfen keinen Regex-Fehler', () => {
    expect(() => filterCommands(CMDS, 'a(b[c')).not.toThrow()
    expect(filterCommands(CMDS, 'a(b[c')).toEqual([])
  })

  it('leere Eingaben sind unkritisch', () => {
    expect(filterCommands([], 'x')).toEqual([])
    expect(filterCommands(CMDS, null)).toHaveLength(4)
  })
})
