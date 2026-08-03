import { describe, it, expect } from 'vitest'
import { HydrologyCalculator as H } from '../utils/HydrologyCalculator'
import { runFloodWaveScenario, findGoverningDuration } from '../utils/floodWaveModel'

// --------------------------------------------------------------------------
// Hilfen
// --------------------------------------------------------------------------

/** Analytische Sprungantwort der Nash-Kaskade bei konstantem Zufluss I ab t=0. */
function nashStepResponse(I, k, n, t) {
    let sum = 0
    let term = 1 // (t/k)^m / m!
    for (let m = 0; m < n; m++) {
        if (m > 0) term *= (t / k) / m
        sum += term
    }
    return I * (1 - Math.exp(-t / k) * sum)
}

const AREA_1KM2 = [{ id: 'a', name: 'Test', area: 1e6, cn: 75 }]

function baseScenario(over = {}) {
    return {
        P_mm: 60, D_min: 60, areas: AREA_1KM2,
        amc: 'II', iaRatio: 0.2, arf: 1, rainType: 'block',
        k_h: 1, n: 2, qBase_lskm2: 0, qDr_ls: 100,
        ...over
    }
}

// --------------------------------------------------------------------------
describe('Konzentrationszeit', () => {
    it('deckt sich mit der Referenzform Tc[min] = 0,0195·(L³/H)^0,385 (L, H in m)', () => {
        for (const [L_km, dH] of [[1, 10], [5, 50], [0.5, 20], [12, 120]]) {
            const ref = 0.0195 * Math.pow(Math.pow(L_km * 1000, 3) / dH, 0.385) / 60
            expect(H.calculateTc(L_km, dH)).toBeCloseTo(ref, 2)
        }
    })

    it('liefert 0 statt NaN bei unvollständigen Eingaben', () => {
        expect(H.calculateTc(0, 10)).toBe(0)
        expect(H.calculateTc(5, 0)).toBe(0)
        expect(H.calculateTc(5, -3)).toBe(0)
        expect(H.calculateTc(NaN, 10)).toBe(0)
    })

    it('meldet Fließlängen außerhalb des Gültigkeitsbereichs', () => {
        expect(H.checkTcValidity(20, 100)).toMatch(/10 km/)
        expect(H.checkTcValidity(5, 50)).toBeNull()
    })

    it('leitet k = Tc/n ab', () => {
        expect(H.storageCoefficientFromTc(6, 3)).toBeCloseTo(2, 10)
        expect(H.storageCoefficientFromTc(0, 3)).toBe(0)
        expect(H.storageCoefficientFromTc(6, 0)).toBe(0)
    })
})

// --------------------------------------------------------------------------
describe('SCS-CN Abflussbildung', () => {
    it('rechnet S und Pe nach Lehrbuch', () => {
        expect(H.retentionS(75)).toBeCloseTo(25400 / 75 - 254, 9)  // 84,667 mm
        // P=60, CN=75 -> S=84,667, Ia=16,933, Pe=(43,067)²/(127,733)
        expect(H.calculateScsRunoff(60, 75)).toBeCloseTo(14.52, 2)
    })

    it('gibt bei P <= Ia keinen Abfluss', () => {
        const S = H.retentionS(75)
        expect(H.calculateScsRunoff(0.2 * S - 0.01, 75)).toBe(0)
    })

    it('erzeugt mit Ia/S = 0,05 mehr Abfluss als mit 0,20', () => {
        expect(H.calculateScsRunoff(60, 75, 0.05)).toBeGreaterThan(H.calculateScsRunoff(60, 75, 0.2))
    })

    it('rechnet die Vorfeuchteklassen nach Chow um', () => {
        expect(H.convertCn(75, 'II')).toBe(75)
        expect(H.convertCn(75, 'III')).toBeCloseTo((23 * 75) / (10 + 0.13 * 75), 9)  // 87,34
        expect(H.convertCn(75, 'I')).toBeCloseTo((4.2 * 75) / (10 - 0.058 * 75), 9)  // 55,75
        expect(H.convertCn(75, 'III')).toBeGreaterThan(H.convertCn(75, 'I'))
    })

    it('versiegelt (CN=100) bedeutet vollständigen Abfluss', () => {
        expect(H.calculateScsRunoff(37, 100)).toBe(37)
    })
})

// --------------------------------------------------------------------------
describe('Effektiv-Regenreihe', () => {
    const areas = [
        { area: 500000, cn: 98 },
        { area: 500000, cn: 55 }
    ]

    it('rechnet flächenweise statt über den Misch-CN', () => {
        const depths = H.blockRainDepths(60, 100)
        const { peTotal } = H.buildEffectiveRainSeries(depths, areas)

        const perArea = 0.5 * H.calculateScsRunoff(60, 98) + 0.5 * H.calculateScsRunoff(60, 55)
        expect(peTotal).toBeCloseTo(perArea, 6)

        // der alte Weg über den flächengewichteten CN liegt deutlich darunter
        const viaMixedCn = H.calculateScsRunoff(60, 76.5)
        expect(viaMixedCn).toBeLessThan(peTotal * 0.7)
    })

    it('zieht den Anfangsverlust am Anfang ab, nicht gleichmäßig verteilt', () => {
        const depths = H.blockRainDepths(60, 10)
        const { series } = H.buildEffectiveRainSeries(depths, [{ area: 1e6, cn: 75 }])
        expect(series[0]).toBeCloseTo(0, 6)
        expect(series[1]).toBeCloseTo(0, 6)
        // monoton steigend, weil die Verlustrate mit zunehmender Sättigung sinkt
        for (let i = 1; i < series.length; i++) {
            expect(series[i]).toBeGreaterThanOrEqual(series[i - 1] - 1e-12)
        }
        expect(series[series.length - 1]).toBeGreaterThan(series[3])
    })

    it('erhält die Gesamtabflusshöhe', () => {
        const depths = H.blockRainDepths(60, 37)
        const { peTotal } = H.buildEffectiveRainSeries(depths, [{ area: 1e6, cn: 75 }])
        expect(peTotal).toBeCloseTo(H.calculateScsRunoff(60, 75), 6)
    })

    it('wirft bei fehlender Fläche statt still 0 zu liefern', () => {
        expect(() => H.buildEffectiveRainSeries([1, 1], [])).toThrow(/Fläche/)
    })
})

// --------------------------------------------------------------------------
describe('Zeitraster', () => {
    it('bildet die Regendauer exakt ab (kein Aufrunden mehr)', () => {
        for (const D_min of [5, 10, 15, 20, 30, 45, 60, 90]) {
            const D_h = D_min / 60
            const { dt, rainSteps } = H.chooseTimeStep(D_h, 1, 2)
            expect(dt * rainSteps).toBeCloseTo(D_h, 12)
        }
    })

    it('hält den Zeitschritt fein gegenüber k', () => {
        const { dt } = H.chooseTimeStep(1, 0.5, 2)
        expect(dt).toBeLessThanOrEqual(0.5 / 10 + 1e-12)
    })

    it('lässt das Fenster bei extremen Parametern nicht explodieren', () => {
        const { dt } = H.chooseTimeStep(5 / 60, 100, 3)   // 5 min Regen, k = 100 h
        expect((5 / 60 + 15 * 100) / dt).toBeLessThan(100000)
    })
})

// --------------------------------------------------------------------------
describe('Nash-Kaskade', () => {
    it('trifft die analytische Sprungantwort bei konstantem Zufluss', () => {
        const k = 2, n = 3, dt = k / 50
        const steps = Math.round(30 / dt)               // 30 h Dauerregen
        const mmPerStep = 1
        const rain = new Array(steps).fill(mmPerStep)
        const A = 1
        const I = (mmPerStep * A * 1000) / (dt * 3600)  // m³/s

        const { hydrograph } = H.routeNashCascade({ rainSeries: rain, area_km2: A, k, n, dt })

        for (const tCheck of [1, 3, 6, 12, 24]) {
            const pt = hydrograph.reduce((b, p) => Math.abs(p.t - tCheck) < Math.abs(b.t - tCheck) ? p : b)
            const ref = nashStepResponse(I, k, n, pt.t)
            expect(Math.abs(pt.Q - ref) / I).toBeLessThan(0.01)
        }
    })

    it('beginnt bei Q(0) = 0 und legt die Ordinaten ans Schrittende', () => {
        const { hydrograph } = H.routeNashCascade({
            rainSeries: [10, 0, 0, 0], area_km2: 1, k: 1, n: 2, dt: 0.1
        })
        expect(hydrograph[0].t).toBe(0)
        expect(hydrograph[0].Q).toBe(0)
        expect(hydrograph[1].t).toBeCloseTo(0.1, 12)
        expect(hydrograph[1].Q).toBeGreaterThan(0)
    })

    it('erhält das Volumen (Massenbilanz)', () => {
        for (const n of [1, 2, 3, 5]) {
            for (const k of [0.5, 2, 8]) {
                const dt = k / 40
                const rain = [...new Array(20).fill(1), ...new Array(5).fill(0)]
                const r = H.routeNashCascade({ rainSeries: rain, area_km2: 1, k, n, dt })
                expect(r.volume / r.inflowVolume).toBeCloseTo(1, 2)
                expect(r.truncated).toBe(false)
            }
        }
    })

    it('legt den Scheitel eines kurzen Impulses nahe (n-1)·k', () => {
        const k = 2, n = 3
        const dt = 0.02
        const rain = [...new Array(5).fill(2)]
        const r = H.routeNashCascade({ rainSeries: rain, area_km2: 1, k, n, dt })
        expect(r.peak.t).toBeGreaterThan((n - 1) * k * 0.9)
        expect(r.peak.t).toBeLessThan((n - 1) * k * 1.2)
    })

    it('verlängert das Fenster, bis die Welle abgeklungen ist', () => {
        // genau der Fall, der mit den früheren fixen 50 Schritten (5 h) scheiterte
        const k = 12, n = 3, dt = 0.5
        const rain = [...new Array(48).fill(0.3)]
        const r = H.routeNashCascade({ rainSeries: rain, area_km2: 1, k, n, dt })
        const window = r.hydrograph[r.hydrograph.length - 1].t
        expect(r.peak.t).toBeGreaterThan(30)      // Scheitel läge außerhalb von 29 h
        expect(window).toBeGreaterThan(r.peak.t)  // ...liegt jetzt im Fenster
        expect(r.volume / r.inflowVolume).toBeGreaterThan(0.99)
    })

    it('wirft bei entarteten Parametern statt NaN zu liefern', () => {
        const ok = { rainSeries: [1, 0], area_km2: 1, k: 1, n: 2, dt: 0.1 }
        expect(() => H.routeNashCascade({ ...ok, k: 0 })).toThrow(/k muss größer als 0/)
        expect(() => H.routeNashCascade({ ...ok, k: -1 })).toThrow(/k muss größer als 0/)
        expect(() => H.routeNashCascade({ ...ok, n: 0 })).toThrow(/ganze Zahl/)
        expect(() => H.routeNashCascade({ ...ok, n: 2.5 })).toThrow(/ganze Zahl/)
        expect(() => H.routeNashCascade({ ...ok, dt: 0 })).toThrow(/dt/)
        expect(() => H.routeNashCascade({ ...ok, area_km2: 0 })).toThrow(/[Ff]läche/)
        expect(() => H.routeNashCascade({ ...ok, rainSeries: [1, NaN] })).toThrow(/ungültige/)
    })
})

// --------------------------------------------------------------------------
describe('Rückhaltevolumen', () => {
    it('trifft ein analytisch bekanntes Dreieck', () => {
        // Zufluss: Dreieck 0 -> 2 -> 0 m³/s über 4 h, Drossel 1 m³/s.
        // Überschuss ist ein Dreieck der Höhe 1 m³/s über 2 h -> V = 0,5·1·7200 = 3600 m³
        const hg = []
        for (let i = 0; i <= 400; i++) {
            const t = i * 0.01
            const Q = t <= 2 ? t : Math.max(0, 2 - (t - 2))
            hg.push({ t, Q })
        }
        const r = H.calculateRetentionVolume(hg, 1)
        expect(r.volume).toBeCloseTo(3600, 0)
        expect(r.stillFilling).toBe(false)
    })

    it('meldet, wenn die Drossel den Basisabfluss nicht abführen kann', () => {
        const hg = [{ t: 0, Q: 0.02 }, { t: 1, Q: 0.02 }]
        const r = H.calculateRetentionVolume(hg, 0.01, 0.02)
        expect(r.neverEmpties).toBe(true)
    })

    it('meldet ein zu kurzes Fenster', () => {
        const hg = [{ t: 0, Q: 0 }, { t: 1, Q: 5 }, { t: 2, Q: 5 }]
        expect(H.calculateRetentionVolume(hg, 1).stillFilling).toBe(true)
    })
})

// --------------------------------------------------------------------------
describe('Euler-II-Modellregen', () => {
    const heights = { 5: 18.2, 10: 22.8, 15: 26.9, 30: 33.5, 45: 37.8, 60: 41.2, 90: 46.0, 120: 49.5 }

    it('erhält die KOSTRA-Höhe der Dauerstufe', () => {
        const d = H.eulerType2Depths(heights, 60, 12)
        expect(d.reduce((s, v) => s + v, 0)).toBeCloseTo(heights[60], 6)
    })

    it('setzt den Scheitel bei 30 % der Dauer', () => {
        const steps = 20
        const d = H.eulerType2Depths(heights, 60, steps)
        const peakIdx = d.indexOf(Math.max(...d))
        expect(peakIdx).toBe(Math.floor(steps * 0.3))
    })

    it('liefert bei kleinem Anfangsverlust einen höheren Scheitel als der Blockregen', () => {
        const wet = { areas: [{ area: 1e6, cn: 90 }], amc: 'III' }  // Ia nur wenige mm
        const block = runFloodWaveScenario(baseScenario({ ...wet, P_mm: heights[60], rainType: 'block' }))
        const euler = runFloodWaveScenario(baseScenario({ ...wet, rainType: 'euler2', kostraHeights: heights }))
        expect(euler.P_used).toBeCloseTo(block.P_used, 6)
        expect(euler.qMax).toBeGreaterThan(block.qMax)
    })

    it('kann sich umkehren, wenn Ia einen großen Teil der Regenhöhe aufzehrt', () => {
        // CN 75 / AMC II: Ia = 16,9 mm bei P = 41,2 mm. Der Euler-II-Scheitel bei
        // 30 % der Dauer fällt dann noch in den Anfangsverlust und geht verloren.
        const dry = { areas: [{ area: 1e6, cn: 75 }], amc: 'II' }
        const block = runFloodWaveScenario(baseScenario({ ...dry, P_mm: heights[60], rainType: 'block' }))
        const euler = runFloodWaveScenario(baseScenario({ ...dry, rainType: 'euler2', kostraHeights: heights }))
        expect(euler.qMax).toBeLessThan(block.qMax)
    })

    it('verlangt KOSTRA-Daten', () => {
        expect(() => H.eulerType2Depths(null, 60, 10)).toThrow(/KOSTRA/)
    })
})

// --------------------------------------------------------------------------
describe('Gesamtszenario', () => {
    it('rechnet ein plausibles Basisszenario durch', () => {
        const r = runFloodWaveScenario(baseScenario())
        expect(r.peTotal).toBeCloseTo(H.calculateScsRunoff(60, 75), 4)
        expect(r.qMax).toBeGreaterThan(0)
        expect(r.tPeak).toBeGreaterThan(0)
        expect(r.massBalance).toBeCloseTo(1, 2)
        expect(r.hydrograph[0]).toEqual({ t: 0, Q: 0, Qd: 0 })
    })

    it('AMC III liefert mehr Abfluss als AMC II', () => {
        const ii = runFloodWaveScenario(baseScenario({ amc: 'II' }))
        const iii = runFloodWaveScenario(baseScenario({ amc: 'III' }))
        expect(iii.qMax).toBeGreaterThan(ii.qMax * 1.2)
    })

    it('V_erf konvergiert und hängt nicht mehr am Rechenfenster', () => {
        // qDr > qBase -> Becken läuft leer -> Fenster darf das Ergebnis nicht bestimmen
        const r = runFloodWaveScenario(baseScenario({ qBase_lskm2: 20, qDr_ls: 40 }))
        expect(r.retention.neverEmpties).toBe(false)
        expect(r.retention.stillFilling).toBe(false)
        expect(r.vReq).toBeGreaterThan(0)
        expect(r.vReq).toBeLessThan(r.directVolume)
    })

    it('meldet eine Drossel unterhalb des Basisabflusses als Fehler', () => {
        const r = runFloodWaveScenario(baseScenario({ qBase_lskm2: 20, qDr_ls: 10 }))
        expect(r.retention.neverEmpties).toBe(true)
        expect(r.warnings.some(w => w.level === 'error' && /Basisabfluss/.test(w.text))).toBe(true)
    })

    it('bildet kurze Dauerstufen mit der richtigen Intensität ab', () => {
        // früher wurde D=5min als 6min gerechnet -> 20 % zu geringe Intensität
        const r = runFloodWaveScenario(baseScenario({ P_mm: 18.2, D_min: 5 }))
        expect(r.dt * r.rainSteps).toBeCloseTo(5 / 60, 12)
        expect(r.P_used).toBeCloseTo(18.2, 9)
    })

    it('skaliert mit dem Gebietsreduktionsfaktor', () => {
        const full = runFloodWaveScenario(baseScenario())
        const red = runFloodWaveScenario(baseScenario({ arf: 0.8 }))
        expect(red.P_used).toBeCloseTo(full.P_used * 0.8, 6)
        expect(red.qMax).toBeLessThan(full.qMax)
        expect(() => runFloodWaveScenario(baseScenario({ arf: 1.5 }))).toThrow(/Gebietsreduktionsfaktor/)
    })

    it('wirft verständlich statt NaN durchzureichen', () => {
        expect(() => runFloodWaveScenario(baseScenario({ areas: [] }))).toThrow(/Einzugsgebietsfläche/)
        expect(() => runFloodWaveScenario(baseScenario({ k_h: 0 }))).toThrow(/Tc\/n/)
        expect(() => runFloodWaveScenario(baseScenario({ n: 0 }))).toThrow(/ganze Zahl/)
        expect(() => runFloodWaveScenario(baseScenario({ D_min: 0 }))).toThrow(/Regendauer/)
        expect(() => runFloodWaveScenario(baseScenario({ P_mm: 0 }))).toThrow(/Niederschlagshöhe/)
        expect(() => runFloodWaveScenario(baseScenario({ areas: [{ area: 1e6, cn: 0 }] }))).toThrow(/CN-Wert/)
        expect(() => runFloodWaveScenario(baseScenario({ rainType: 'euler2', kostraHeights: null }))).toThrow(/KOSTRA/)
    })

    it('erfasst bei großem k den Scheitel (Regression zum 5-h-Fenster)', () => {
        const r = runFloodWaveScenario(baseScenario({ k_h: 12, n: 3, D_min: 1440, P_mm: 100 }))
        expect(r.tPeak).toBeGreaterThan(29)          // lag früher außerhalb des Fensters
        expect(r.window_h).toBeGreaterThan(r.tPeak)
        expect(r.massBalance).toBeGreaterThan(0.99)  // früher nur 19 % des Volumens
    })
})

// --------------------------------------------------------------------------
describe('Maßgebende Dauerstufe', () => {
    const kostraRaw = {
        5: { HN_100A: 18.2 }, 15: { HN_100A: 26.9 }, 30: { HN_100A: 33.5 },
        60: { HN_100A: 41.2 }, 120: { HN_100A: 49.5 }, 240: { HN_100A: 58.0 },
        720: { HN_100A: 74.0 }, 1440: { HN_100A: 88.0 }
    }

    it('rechnet alle Dauerstufen und benennt die maßgebende', () => {
        const base = baseScenario({ qBase_lskm2: 5, qDr_ls: 60 })
        delete base.P_mm
        delete base.D_min

        const sweep = findGoverningDuration(base, kostraRaw)
        expect(sweep.rows.length).toBe(8)
        expect(sweep.rows.every(r => !r.error)).toBe(true)
        expect(sweep.governingByVolume).toBeTruthy()
        expect(sweep.governingByPeak).toBeTruthy()

        // maßgebend für das Volumen ist eine längere Dauer als für den Scheitel
        expect(sweep.governingByVolume.D_min).toBeGreaterThanOrEqual(sweep.governingByPeak.D_min)
        for (const row of sweep.rows) {
            expect(row.vReq).toBeLessThanOrEqual(sweep.governingByVolume.vReq + 1e-6)
            expect(row.qMax).toBeLessThanOrEqual(sweep.governingByPeak.qMax + 1e-9)
        }
    })

    it('verlangt KOSTRA-Daten', () => {
        expect(() => findGoverningDuration(baseScenario(), null)).toThrow(/KOSTRA/)
    })
})
