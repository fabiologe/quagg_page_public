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

import { netzKurz, paarKandidaten, rasterVergleich } from '../utils/laubpaar'
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

  it('lässt nur fertige Läufe auf demselben Netz zu', () => {
    const k = paarKandidaten(runs, 'becken_r001')
    const passend = k.filter((x) => x.passt).map((x) => x.run_id)
    expect(passend).toEqual(['becken_r002'])
    // der Lauf selbst ist kein Partner
    expect(k.some((x) => x.run_id === 'becken_r001')).toBe(false)
    // gescheiterte Läufe erscheinen gar nicht
    expect(k.some((x) => x.run_id === 'becken_r004')).toBe(false)
  })

  it('lässt einen Altlauf ohne Netzangabe nicht stillschweigend durch', () => {
    // Sonst verschneidet jemand zwei Altläufe und erfährt nie, dass sie
    // auf verschiedenen Netzen gerechnet wurden.
    const alt = paarKandidaten(runs, 'becken_r001')
      .find((x) => x.run_id === 'becken_r005')
    expect(alt.passt).toBe(false)
    expect(alt.unbekannt).toBe(true)
  })

  it('kommt ohne Referenzlauf klar', () => {
    expect(paarKandidaten(runs, '').every((x) => !x.passt)).toBe(true)
    expect(paarKandidaten(undefined, 'x')).toEqual([])
    expect(netzKurz(null)).toBe('–')
    expect(netzKurz('0123456789abcdef')).toBe('0123456789ab')
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
