/**
 * Welche zwei Läufe darf man verschneiden — und ist der Reiter dafür
 * überhaupt verdrahtet?
 *
 * Karte C legt zwei Läufe Zelle auf Zelle übereinander. Passt das Raster
 * nicht, entsteht kein Fehler, sondern ein plausibel aussehendes Bild von
 * zwei verschiedenen Orten. Genau das fangen diese Tests ab.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  netzKurz, paarKandidaten, paarStufe, rasterVergleich, unterschiedText,
} from '../utils/laubpaar'
import { VORBELEGUNG, tauKritVorgabe } from '../utils/grenzwerte'

const WURZEL = new URL('..', import.meta.url).pathname

const lauf = (id, hash, status = 'completed') =>
  ({ run_id: id, netz_hash: hash, status })

describe('Laufpaare', () => {
  const runs = [
    lauf('becken_r001', 'aaaa1111'),
    lauf('becken_r002', 'aaaa1111'),
    lauf('becken_r003', 'bbbb2222'),
    lauf('becken_r004', 'aaaa1111', 'failed'),
    lauf('becken_r005', null),
  ]

  it('bietet jeden fertigen Lauf an — auch auf anderem Netz', () => {
    // Bis 2026-08-17 wurde hier nach netz_hash ausgegraut. Die Kennung war
    // zu streng (sie umfasste die Zuflussmenge), und ein Leerlauf-/
    // Schwall-Paar unterscheidet sich per Definition genau darin. Wer ein
    // Paar auswählen will, soll es auswählen können — beurteilt wird
    // danach, mit Begründung.
    const k = paarKandidaten(runs, 'becken_r001').map((x) => x.run_id)
    expect(k).toEqual(['becken_r002', 'becken_r003', 'becken_r005'])
    // der Lauf selbst ist kein Partner, gescheiterte auch nicht
    expect(k).not.toContain('becken_r001')
    expect(k).not.toContain('becken_r004')
  })

  it('kommt ohne Referenzlauf und ohne Liste klar', () => {
    expect(paarKandidaten(runs, '').length).toBe(4)
    expect(paarKandidaten(undefined, 'x')).toEqual([])
    expect(netzKurz(null)).toBe('–')
    expect(netzKurz('0123456789abcdef')).toBe('0123456789ab')
  })
})

describe('Ampel für ein Laufpaar', () => {
  const antwort = (extra = {}) => ({
    raster: { gleich: true, grund: '' },
    netz: { gleich: false },
    geometrie: { stand: 'gleich' },
    unterschiede: [],
    stufe: 'gelb',
    ...extra,
  })

  it('grün bei gleichem Netz', () => {
    const a = paarStufe(antwort({ netz: { gleich: true }, stufe: 'gruen' }))
    expect(a.stufe).toBe('gruen')
    expect(a.rechenbar).toBe(true)
  })

  it('gelb ist der NORMALFALL eines Leerlauf-/Schwall-Paars', () => {
    const a = paarStufe(antwort())
    expect(a.stufe).toBe('gelb')
    expect(a.rechenbar).toBe(true)
    // Der Text muss das als gewollt benennen — sonst liest man Gelb als
    // Fehler und sucht einen, den es nicht gibt.
    expect(a.text).toMatch(/Normalfall/)
    expect(a.titel).toMatch(/Randbedingungen/)
  })

  it('nennt einen Altlauf ohne gesicherte Geometrie beim Namen', () => {
    const a = paarStufe(antwort({ geometrie: { stand: 'unbekannt' } }))
    expect(a.stufe).toBe('gelb')
    expect(a.rechenbar).toBe(true)
    expect(a.text).toMatch(/nicht mitgesichert/)
  })

  it('warnt bei verschiedener Geometrie — sperrt aber nicht', () => {
    // Genau das Sperren war der Fehler von vorher.
    const a = paarStufe(antwort({ geometrie: { stand: 'verschieden' },
      stufe: 'rot' }))
    expect(a.stufe).toBe('rot')
    expect(a.rechenbar).toBe(true)
    expect(a.text).toMatch(/zwei verschiedene Bauwerke/)
  })

  it('sperrt genau dann, wenn sich die Karten nicht decken', () => {
    const a = paarStufe(antwort({
      raster: { gleich: false, grund: 'Verschieden große Ausgaberaster.' },
      stufe: 'rot' }))
    expect(a.stufe).toBe('rot')
    expect(a.rechenbar).toBe(false)
    expect(a.text).toMatch(/Ausgaberaster/)
  })

  it('ist vor der Auswahl still', () => {
    const a = paarStufe(null)
    expect(a.stufe).toBe('')
    expect(a.rechenbar).toBe(false)
  })

  it('macht aus einer Fundstelle einen lesbaren Satz', () => {
    expect(unterschiedText({ pfad: 'boundaries[0].q', a: 0, b: 0.8 }))
      .toBe('boundaries[0].q: 0 → 0.8')
    expect(unterschiedText({ pfad: 'x', a: null, b: 1 })).toBe('x: – → 1')
  })
})

describe('Rastervergleich', () => {
  const gitter = (dims, origin = [0, 0, 0], spacing = [0.5, 0.5, 0.2]) =>
    ({ dims, origin, spacing })

  it('nimmt gleiche Grundrissraster an, auch bei anderer Höhenschichtung', () => {
    // nz darf abweichen — in die Karten geht nur die Grundrissebene ein
    const v = rasterVergleich(gitter([40, 20, 30]), gitter([40, 20, 55]))
    expect(v.passt).toBe(true)
  })

  it('lehnt verschieden feine Ausgaberaster ab und sagt warum', () => {
    const v = rasterVergleich(gitter([40, 20, 30]), gitter([80, 40, 30]))
    expect(v.passt).toBe(false)
    // Der Grund muss auf die URSACHE zeigen (Datenbudget/Schreibintervall),
    // nicht nur „passt nicht" sagen
    expect(v.grund).toMatch(/Schreibintervall|Laufdauer/)
  })

  it('lehnt verschobene oder verschieden große Zellen ab', () => {
    expect(rasterVergleich(gitter([40, 20, 30]),
      gitter([40, 20, 30], [1, 0, 0])).passt).toBe(false)
    expect(rasterVergleich(gitter([40, 20, 30]),
      gitter([40, 20, 30], [0, 0, 0], [0.25, 0.5, 0.2])).passt).toBe(false)
    expect(rasterVergleich(null, gitter([40, 20, 30])).passt).toBe(false)
  })
})

describe('τ_krit', () => {
  it('nimmt das Fall-Kriterium, sonst die benannte Vorbelegung', () => {
    const ohne = tauKritVorgabe(null)
    expect(ohne.wert).toBe(VORBELEGUNG.tau_krit)
    expect(ohne.ausFall).toBe(false)

    const mit = tauKritVorgabe({ targets: [
      { kind: 'min_bed_shear', limit_min: 3.5 }] })
    expect(mit.wert).toBe(3.5)
    expect(mit.ausFall).toBe(true)
  })
})

describe('Reiter „Laubkarten"', () => {
  it('ist an allen drei Stellen verdrahtet', () => {
    // Die Fehlerklasse: Reiter im Store eingetragen, aber kein v-else-if
    // in der Phase — der Knopf erscheint und zeigt eine leere Fläche.
    const store = readFileSync(join(WURZEL, 'stores/usePostStore.js'), 'utf8')
    const phase = readFileSync(join(WURZEL, 'components/pre/ErgebnisPhase.vue'),
      'utf8')
    expect(store).toMatch(/id: 'laubkarten'/)
    expect(phase).toMatch(/activeTab === 'laubkarten'/)
    expect(phase).toMatch(/import LaubkartenPanel/)
  })

  it('bekommt die volle Höhe wie die anderen Kartenansichten', () => {
    // Ohne die Vollhöhen-Regel schrumpft die Zeichenfläche auf einen
    // Streifen — dieselbe Falle wie beim Grundriss (min-height: 0).
    const phase = readFileSync(join(WURZEL, 'components/pre/ErgebnisPhase.vue'),
      'utf8')
    expect(phase).toMatch(/\.f3d-ergebnis > \.f3d-laub/)
  })
})
