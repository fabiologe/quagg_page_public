/**
 * Widerstandszonen im Client.
 *
 * Die Vorschau rechnet dieselben Formeln wie der Fallaufbau — ein zweites
 * Mal, in einer anderen Sprache. Das ist Absicht (man soll beim Ziehen
 * eines Werts sehen, was herauskommt), aber es ist auch eine Stelle, an
 * der die beiden Seiten auseinanderlaufen können, ohne dass es jemandem
 * auffällt: es kommt weiter eine plausible Zahl heraus, nur die falsche.
 *
 * Deshalb prüfen diese Tests dieselben Zahlen wie
 * backend/.../tests/test_widerstandszone.py.
 */
import { describe, expect, it } from 'vitest'

import {
  ZONEN_VORLAGEN, beiwerte, fugenweite, verlustbeiwert, vorlageAnwenden,
  zoneAnsNetz, zonenArtGewechselt, zonenKasten, zonenName, zonenTiefe,
} from '../utils/widerstand'

const rechen = (u = {}) => ({
  type: 'screen', patch: 'r1',
  plane_polygon: [[0, 0, 0], [0, 4, 0], [0, 4, 2], [0, 0, 2]],
  bar_spacing: 0.02, bar_thickness: 0.008, bar_shape: 'rechteck',
  approach_angle_deg: 90,
  resistance: { kind: 'rechen', d: [0, 0, 0], f: [0, 0, 0],
    blockage_ratio: 0 },
  ...u,
})

const steine = (u = {}) => rechen({
  bar_spacing: null, bar_thickness: null, zonen_tiefe: 0.6,
  resistance: { kind: 'steinschuettung', d: [0, 0, 0], f: [0, 0, 0],
    blockage_ratio: 0, korngroesse: 0.1, porositaet: 0.4 },
  ...u,
})

const busch = (u = {}) => rechen({
  bar_spacing: null, bar_thickness: null, zonen_tiefe: 3.0,
  resistance: { kind: 'bewuchs', d: [0, 0, 0], f: [0, 0, 0],
    blockage_ratio: 0, flaechendichte: 3.0, cw: 1.2 },
  ...u,
})

describe('Beiwerte — dieselben Zahlen wie im Backend', () => {
  it('Rechen: Kirschmer, auf die Zonentiefe verteilt', () => {
    const zeta = 2.42 * (0.008 / 0.012) ** (4 / 3)
    expect(beiwerte(rechen()).f).toBeCloseTo(zeta / 0.15, 9)
    expect(beiwerte(rechen()).isotrop).toBe(false)
  })

  it('Rechen: f·L bleibt gleich, wenn die Zone tiefer wird', () => {
    // DER Grund, warum die Zonentiefe beim Rechen frei sein darf.
    const flach = beiwerte(rechen({ zonen_tiefe: 0.15 }))
    const tief = beiwerte(rechen({ zonen_tiefe: 0.6 }))
    expect(tief.f * 0.6).toBeCloseTo(flach.f * 0.15, 9)
    expect(verlustbeiwert(rechen({ zonen_tiefe: 0.6 })))
      .toBeCloseTo(verlustbeiwert(rechen({ zonen_tiefe: 0.15 })), 9)
  })

  it('Steinschüttung: Ergun, isotrop, unabhängig von der Tiefe', () => {
    const b = beiwerte(steine())
    expect(b.d).toBeCloseTo((150 * 0.6 ** 2) / (0.4 ** 3 * 0.1 ** 2), 6)
    expect(b.f).toBeCloseTo((3.5 * 0.6) / (0.4 ** 3 * 0.1), 6)
    expect(b.isotrop).toBe(true)
    // ein doppelt so dicker Wall bremst doppelt, der Beiwert bleibt
    expect(beiwerte(steine({ zonen_tiefe: 1.2 })).f).toBeCloseTo(b.f, 9)
    expect(verlustbeiwert(steine({ zonen_tiefe: 1.2 })))
      .toBeCloseTo(2 * verlustbeiwert(steine()), 6)
  })

  it('Bewuchs: Formwiderstand c_w·a', () => {
    expect(beiwerte(busch()).f).toBeCloseTo(3.6, 9)
    expect(beiwerte(busch()).d).toBe(0)
  })

  it('nimmt eingetragene Beiwerte, statt abzuleiten', () => {
    const eigen = rechen({ resistance: { kind: 'rechen', d: [0, 0, 0],
      f: [120, 0, 0], blockage_ratio: 0 } })
    expect(beiwerte(eigen).f).toBe(120)
    expect(beiwerte(eigen).quelle).toMatch(/Hand/)
  })

  it('sagt nichts, solange die Angaben fehlen', () => {
    expect(beiwerte(steine({ resistance: { kind: 'steinschuettung' } })))
      .toBeNull()
    expect(beiwerte(rechen({ resistance: { kind: 'manuell', d: [0, 0, 0],
      f: [0, 0, 0] } }))).toBeNull()
  })

  it('rechnet den Verlegungsgrad als Kontraktion', () => {
    const halb = rechen({ resistance: { kind: 'rechen', d: [0, 0, 0],
      f: [0, 0, 0], blockage_ratio: 0.5 } })
    expect(verlustbeiwert(halb)).toBeCloseTo(4 * verlustbeiwert(rechen()), 9)
  })
})

describe('Fugenweite', () => {
  it('passt zu den Namen der Vorlagen', () => {
    // Die Vorlage heißt „Fugen 3–5 cm" — die Rechnung muss das treffen,
    // sonst steht im Katalog eine Zahl, die das Modell nicht hergibt.
    expect(fugenweite(0.1, 0.4) * 100).toBeGreaterThan(3)
    expect(fugenweite(0.1, 0.4) * 100).toBeLessThan(5)
    expect(fugenweite(0.25, 0.42) * 100).toBeGreaterThan(8)
    expect(fugenweite(0.25, 0.42) * 100).toBeLessThan(13)
  })

  it('gibt nichts zurück, wo es nichts zu rechnen gibt', () => {
    expect(fugenweite(0, 0.4)).toBeNull()
    expect(fugenweite(0.1, 1.2)).toBeNull()
    expect(fugenweite(null, null)).toBeNull()
  })
})

describe('Artwechsel', () => {
  it('räumt die Stabmaße weg', () => {
    // Sie liegen am BAUWERK, nicht in der Untergruppe — die räumt beim
    // Wechsel nur ihre eigenen Felder auf. Bliebe die Stabteilung stehen,
    // stünde an einer Steinschüttung eine Zahl, die niemand rechnet.
    const neu = zonenArtGewechselt(rechen(), 'steinschuettung')
    expect(neu.bar_spacing).toBeNull()
    expect(neu.bar_thickness).toBeNull()
    expect(neu.resistance.kind).toBe('steinschuettung')
  })

  it('gibt dem Rechen seine Stabmaße zurück', () => {
    // Ohne sie lehnt das Modell den Rechen ab (casespec) — der Nutzer
    // sähe nur eine Fehlermeldung beim Speichern.
    const zurueck = zonenArtGewechselt(steine(), 'rechen')
    expect(zurueck.bar_spacing).toBeGreaterThan(0)
    expect(zurueck.bar_thickness).toBeGreaterThan(0)
  })

  it('lässt das Original in Ruhe', () => {
    const alt = rechen()
    zonenArtGewechselt(alt, 'bewuchs')
    expect(alt.bar_spacing).toBe(0.02)
  })
})

describe('Vorlagen', () => {
  it('setzen Maße und löschen alte Beiwerte', () => {
    // Ein stehengebliebener f-Wert hätte Vorrang und die Vorlage wäre
    // wirkungslos — sichtbar wäre nur der neue Name.
    const vorher = rechen({ resistance: { kind: 'rechen', d: [0, 0, 0],
      f: [999, 0, 0], blockage_ratio: 0 } })
    const v = ZONEN_VORLAGEN.find((x) => x.id === 'wasserbau_klein')
    const neu = vorlageAnwenden(vorher, v)
    expect(neu.resistance.f).toEqual([0, 0, 0])
    expect(neu.resistance.korngroesse).toBe(0.1)
    expect(beiwerte(neu).quelle).toMatch(/Ergun/)
  })

  it('hinterlassen keine Felder der alten Art', () => {
    const busch2 = vorlageAnwenden(steine(),
      ZONEN_VORLAGEN.find((x) => x.id === 'busch_dicht'))
    expect(busch2.resistance.korngroesse).toBeNull()
    expect(busch2.resistance.porositaet).toBeNull()
  })

  it('sind alle rechenbar', () => {
    for (const v of ZONEN_VORLAGEN) {
      const z = vorlageAnwenden(rechen(), v)
      expect(beiwerte(z), v.id).not.toBeNull()
      expect(beiwerte(z).f, v.id).toBeGreaterThan(0)
    }
  })
})

describe('Die Zone muss ins Netz passen', () => {
  it('vertieft einen zu dünnen Rechen, statt zu verfeinern', () => {
    // Vier Zellen, nicht zwei: gemessen kommen bei zwei Zellen nur rund
    // 63 % des angesetzten Verlusts an, bei vier 83 %. Beim Rechen kostet
    // das nichts — die Tiefe ist dort eine Rechengröße.
    const vor = zoneAnsNetz(rechen({ zonen_tiefe: 0.15 }), 1.0)
    expect(vor.zonen_tiefe).toBe(4)
    // und der Verlust bleibt derselbe — das ist der ganze Punkt
    expect(verlustbeiwert(rechen({ zonen_tiefe: 4 })))
      .toBeCloseTo(verlustbeiwert(rechen({ zonen_tiefe: 0.15 })), 9)
  })

  it('rührt eine Steinschüttung NICHT an', () => {
    // Dort ist die Tiefe die Dicke des Bauwerks. Sie zu vergrößern wäre
    // keine Rechengröße, sondern eine Fälschung.
    expect(zoneAnsNetz(steine({ zonen_tiefe: 0.2 }), 1.0)).toBeNull()
  })

  it('schweigt, wenn die Zone schon dick genug ist', () => {
    expect(zoneAnsNetz(rechen({ zonen_tiefe: 5 }), 1.0)).toBeNull()
  })

  it('spannt den Kasten über Fläche und Tiefe auf', () => {
    const k = zonenKasten(rechen({ zonen_tiefe: 0.5 }))
    expect(k[3] - k[0]).toBeCloseTo(0.5, 6)   // x: die Tiefe
    expect(k[4] - k[1]).toBeCloseTo(4, 6)     // y: die Fläche
    expect(k[5] - k[2]).toBeCloseTo(2, 6)     // z: die Höhe
  })
})

describe('Name im Baum', () => {
  it('nennt die Art, nicht den Typ', () => {
    expect(zonenName(rechen())).toBe('Rechen')
    expect(zonenName(steine())).toBe('Steinschüttung')
    expect(zonenName(busch())).toBe('Bewuchs')
    expect(zonenName({ type: 'wall' })).toBeNull()
  })

  it('behandelt einen Altfall ohne Art als Rechen', () => {
    expect(zonenName({ type: 'screen', resistance: {} })).toBe('Rechen')
    expect(zonenTiefe({ type: 'screen' })).toBe(0.15)
  })
})
