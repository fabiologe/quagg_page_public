import { describe, it, expect } from 'vitest'
import { runFloodWaveScenario, findGoverningDuration } from '../utils/floodWaveModel'
import { FloodWaveReportService } from '../services/FloodWaveReportService'

/**
 * Der Berichtsaufbau war vorher gar nicht ausführbar geprüft – insbesondere
 * der Seitenumbruch, den es schlicht nicht gab: `y` wuchs monoton und der
 * Inhalt lief unten aus der Seite heraus.
 */

const KOSTRA = {
    5: { HN_100A: 18.2 }, 10: { HN_100A: 22.8 }, 15: { HN_100A: 26.9 },
    30: { HN_100A: 33.5 }, 60: { HN_100A: 41.2 }, 120: { HN_100A: 49.5 },
    240: { HN_100A: 58.0 }, 720: { HN_100A: 74.0 }, 1440: { HN_100A: 88.0 }
}

function makeStore({ areaCount = 3, withSweep = false } = {}) {
    const areas = Array.from({ length: areaCount }, (_, i) => ({
        id: 'a' + i,
        name: `Teileinzugsgebiet ${String(i + 1).padStart(2, '0')} mit langem Namen`,
        area: 40000 + i * 9000,
        cn: 55 + (i % 5) * 9
    }))

    const input = {
        P_mm: 41.2, D_min: 60, areas, amc: 'III', iaRatio: 0.2, arf: 1,
        rainType: 'block', k_h: 0.674, n: 2,
        qBase_lskm2: 5, qDr_ls: 120, Lf: 5, deltaH: 50
    }

    const detail = runFloodWaveScenario(input)
    const totalArea = areas.reduce((s, a) => s + a.area, 0)

    let sweep = null
    if (withSweep) {
        const base = { ...input }
        delete base.P_mm
        delete base.D_min
        sweep = findGoverningDuration(base, KOSTRA)
    }

    return {
        results: { detail },
        params: { Lf: 5, deltaH: 50, qBase: 5, qDr: 120, autoK: true },
        tcResult: 1.3475,
        tcWarning: null,
        totalArea,
        weightedCN: areas.reduce((s, a) => s + a.area * a.cn, 0) / totalArea,
        kostraLocation: { lat: 51.0, lng: 7.0 },
        durationSweep: sweep
    }
}

/** Textinhalt aller Seiten, um Zellen und Beschriftungen prüfen zu können. */
function pageTexts(doc) {
    const out = []
    for (let i = 1; i <= doc.internal.getNumberOfPages(); i++) {
        const page = doc.internal.pages[i] || []
        out.push(page.join('\n'))
    }
    return out
}

describe('FloodWaveReportService', () => {
    it('verlangt ein Berechnungsergebnis', () => {
        expect(() => FloodWaveReportService.buildFloodWaveReport({ results: {} }))
            .toThrow(/Berechnungsergebnis/)
    })

    it('erzeugt ein gültiges PDF', () => {
        const doc = FloodWaveReportService.buildFloodWaveReport(makeStore())
        const buf = Buffer.from(doc.output('arraybuffer'))
        expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
        expect(buf.length).toBeGreaterThan(2000)
    })

    it('bricht bei vielen Teilflächen auf mehrere Seiten um', () => {
        const wenige = FloodWaveReportService.buildFloodWaveReport(makeStore({ areaCount: 2 }))
        const viele = FloodWaveReportService.buildFloodWaveReport(makeStore({ areaCount: 40 }))

        expect(viele.internal.getNumberOfPages())
            .toBeGreaterThan(wenige.internal.getNumberOfPages())
        expect(viele.internal.getNumberOfPages()).toBeGreaterThanOrEqual(3)
    })

    it('nummeriert alle Seiten in der Fußzeile', () => {
        const doc = FloodWaveReportService.buildFloodWaveReport(makeStore({ areaCount: 40 }))
        const total = doc.internal.getNumberOfPages()
        const texts = pageTexts(doc)
        expect(texts.length).toBe(total)
        texts.forEach((t, i) => {
            expect(t).toContain(`Seite ${i + 1} von ${total}`)
        })
    })

    it('führt die nachweisrelevanten Zwischengrößen auf', () => {
        const doc = FloodWaveReportService.buildFloodWaveReport(makeStore())
        const all = pageTexts(doc).join('\n')
        for (const key of [
            'Konzentrationszeit Tc', 'Vorfeuchteklasse AMC', 'Anfangsverlustbeiwert Ia/S',
            'Wirksamer Niederschlag Pe', 'Abflussbeiwert psi', 'Speicherkoeffizient k',
            'Zeitschritt dt', 'Rechenfenster', 'Massenbilanz',
            'Maximaler Abfluss Q_max', 'Scheitelzeit', 'Erforderliches Rueckhaltevolumen'
        ]) {
            expect(all).toContain(key)
        }
    })

    it('nimmt den Dauerstufenvergleich auf, wenn er vorliegt', () => {
        const ohne = pageTexts(FloodWaveReportService.buildFloodWaveReport(makeStore())).join('\n')
        const mit = pageTexts(FloodWaveReportService.buildFloodWaveReport(makeStore({ withSweep: true }))).join('\n')
        expect(ohne).not.toContain('Dauerstufenvergleich')
        expect(mit).toContain('Dauerstufenvergleich')
        expect(mit).toMatch(/massgebend/)
    })

    it('schreibt Zahlen mit deutschem Dezimalkomma', () => {
        const all = pageTexts(FloodWaveReportService.buildFloodWaveReport(makeStore())).join('\n')
        // z. B. "1,35 h" statt "1.35 h"
        expect(all).toMatch(/1,35 h/)
        expect(all).not.toMatch(/\d\.\d\d h/)
    })
})
