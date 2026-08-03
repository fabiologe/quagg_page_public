import { HydrologyCalculator as H, CN_MIN, CN_MAX } from './HydrologyCalculator'

/**
 * Vollständiger Rechengang der Hochwasserwelle als reine Funktion.
 *
 * Bewusst frei von Pinia/Vue, damit der gesamte Nachweis testbar ist und für
 * die Suche nach der maßgebenden Dauerstufe mehrfach durchlaufen werden kann.
 *
 * Harte Fehler (fehlende Fläche, k <= 0, ...) werfen einen Error mit deutscher
 * Meldung. Alles, was rechenbar ist, aber fachlich auffällt, kommt als
 * `warnings` zurück – nichts wird still verschluckt.
 */

/**
 * @typedef {Object} ScenarioInput
 * @property {number} P_mm - Niederschlagshöhe der Dauerstufe in mm
 * @property {number} D_min - Regendauer in min
 * @property {Array<{id?:string, name?:string, area:number, cn:number}>} areas - Flächen in m², CN als AMC-II-Tabellenwert
 * @property {'I'|'II'|'III'} [amc='III'] - Vorfeuchteklasse
 * @property {number} [iaRatio=0.2] - Anfangsverlustbeiwert Ia/S
 * @property {number} [arf=1] - Gebietsreduktionsfaktor (Punkt- -> Gebietsniederschlag)
 * @property {'block'|'euler2'} [rainType='block'] - Regenverteilung
 * @property {Object} [kostraHeights] - Dauerstufe [min] -> Höhe [mm], nur für Euler II
 * @property {number} k_h - Speicherkoeffizient in h
 * @property {number} n - Anzahl Kaskaden
 * @property {number} qBase_lskm2 - Basisabfluss in l/(s·km²)
 * @property {number} qDr_ls - Drosselabfluss in l/s
 * @property {number} [Lf] - Fließlänge in km (nur für Plausibilitätshinweise)
 * @property {number} [deltaH] - Höhendifferenz in m (nur für Plausibilitätshinweise)
 */

export function runFloodWaveScenario(input) {
    const {
        P_mm, D_min, areas, amc = 'III', iaRatio = 0.2, arf = 1,
        rainType = 'block', kostraHeights = null,
        k_h, n, qBase_lskm2 = 0, qDr_ls = 0,
        Lf = 0, deltaH = 0
    } = input

    const warnings = []
    const warn = (text, level = 'warn') => warnings.push({ level, text })

    // --- 1. Eingangsprüfung -------------------------------------------------
    const usable = (areas || []).filter(a => Number.isFinite(a.area) && a.area > 0)
    if (usable.length === 0) {
        throw new Error('Es ist keine Einzugsgebietsfläche definiert. Fläche zeichnen oder schätzen lassen.')
    }
    const totalArea_m2 = usable.reduce((s, a) => s + a.area, 0)
    const A_km2 = totalArea_m2 / 1e6

    if (!Number.isFinite(D_min) || D_min <= 0) {
        throw new Error('Die Regendauer D muss größer als 0 sein.')
    }
    if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
        throw new Error('Die Anzahl der Kaskaden n muss eine ganze Zahl >= 1 sein.')
    }
    if (!Number.isFinite(k_h) || k_h <= 0) {
        throw new Error('Der Speicherkoeffizient k muss größer als 0 sein. Tipp: k aus der Konzentrationszeit ableiten (k = Tc/n).')
    }
    if (rainType === 'block' && (!Number.isFinite(P_mm) || P_mm <= 0)) {
        throw new Error('Die Niederschlagshöhe P muss größer als 0 sein.')
    }
    if (rainType === 'euler2' && !kostraHeights) {
        throw new Error('Für den Euler-II-Modellregen müssen zuerst KOSTRA-Daten geladen werden.')
    }

    for (const a of usable) {
        if (!Number.isFinite(a.cn) || a.cn <= 0 || a.cn > CN_MAX) {
            throw new Error(`Ungültiger CN-Wert bei "${a.name || 'Fläche'}": ${a.cn}. Zulässig sind Werte über 0 bis ${CN_MAX}.`)
        }
        if (a.cn < CN_MIN) {
            warn(`CN = ${a.cn} bei "${a.name || 'Fläche'}" liegt unter ${CN_MIN}; das SCS-Verfahren ist dort nicht mehr abgesichert.`)
        }
    }

    // --- 2. Vorfeuchte ------------------------------------------------------
    const areasAmc = usable.map(a => ({ ...a, cn2: a.cn, cn: H.convertCn(a.cn, amc) }))
    if (amc === 'II') {
        warn('Vorfeuchteklasse AMC II (mittel). Für ein 100-jährliches Ereignis wird üblicherweise AMC III (nass) angesetzt – AMC II liefert deutlich weniger Abfluss.')
    }

    // --- 3. Zeitraster ------------------------------------------------------
    const D_h = D_min / 60
    const { dt, rainSteps, coarse } = H.chooseTimeStep(D_h, k_h, n)
    if (coarse) {
        warn(`Zeitschritt dt = ${(dt * 60).toFixed(1)} min ist grob gegenüber k = ${k_h.toFixed(2)} h; die Ganglinie ist entsprechend geglättet.`)
    }

    // --- 4. Regenverteilung -------------------------------------------------
    let rainDepths = rainType === 'euler2'
        ? H.eulerType2Depths(kostraHeights, D_min, rainSteps)
        : H.blockRainDepths(P_mm, rainSteps)

    if (!Number.isFinite(arf) || arf <= 0 || arf > 1) {
        throw new Error('Der Gebietsreduktionsfaktor muss zwischen 0 und 1 liegen.')
    }
    if (arf !== 1) rainDepths = rainDepths.map(v => v * arf)

    const P_used = rainDepths.reduce((s, v) => s + v, 0)

    if (A_km2 > 25 && arf === 1) {
        warn(`Einzugsgebiet ${A_km2.toFixed(1)} km²: KOSTRA liefert Punktniederschlag. Ab etwa 25 km² sollte ein Gebietsreduktionsfaktor < 1 angesetzt werden.`)
    }
    if (rainType === 'block') {
        warn('Blockregen: gleichmäßige Intensität über die gesamte Dauer. Ein Euler-II-Modellregen liefert bei gleicher Höhe in der Regel einen höheren Scheitel – außer wenn der Anfangsverlust Ia einen großen Teil der Regenhöhe aufzehrt, dann kann sich das Verhältnis umkehren.')
    }

    // --- 5. Abflussbildung --------------------------------------------------
    const eff = H.buildEffectiveRainSeries(rainDepths, areasAmc, iaRatio)
    if (eff.peTotal <= 0) {
        warn('Der Niederschlag bleibt vollständig im Anfangsverlust – es entsteht kein Direktabfluss.', 'error')
    }

    // --- 6. Abflusskonzentration -------------------------------------------
    const Q_base = (qBase_lskm2 * A_km2) / 1000    // m³/s
    const Q_allowed = qDr_ls / 1000                // m³/s

    // Rechenfenster erst beenden, wenn der Direktabfluss auch unter die
    // Drosselleistung gefallen ist – sonst wäre V_erf abgeschnitten.
    const stopBelow = Q_allowed > Q_base ? (Q_allowed - Q_base) * 0.25 : Infinity

    const routed = H.routeNashCascade({
        rainSeries: eff.series,
        area_km2: A_km2,
        k: k_h,
        n,
        dt,
        stopBelow
    })

    if (routed.truncated) {
        warn('Das Rechenfenster hat die Obergrenze erreicht, bevor die Welle abgeklungen war. Q_max und V_erf sind untere Schranken.', 'error')
    }

    // --- 7. Gesamtganglinie inkl. Basisabfluss ------------------------------
    const hydrograph = routed.hydrograph.map(p => ({ t: p.t, Q: p.Q + Q_base, Qd: p.Q }))
    const qMax = routed.peak.Q + Q_base
    const tPeak = routed.peak.t

    // --- 8. Rückhaltevolumen ------------------------------------------------
    const retention = H.calculateRetentionVolume(hydrograph, Q_allowed, Q_base)

    if (retention.neverEmpties) {
        warn(`Drosselabfluss ${qDr_ls.toFixed(1)} l/s ist nicht größer als der Basisabfluss ${(Q_base * 1000).toFixed(1)} l/s. Das Becken kann nie leerlaufen; V_erf ist keine belastbare Größe.`, 'error')
    }
    if (retention.stillFilling) {
        warn('Das Becken füllt sich am Ende des Rechenfensters noch – V_erf ist eine untere Schranke.', 'error')
    }
    if (Q_allowed >= qMax) {
        warn('Der Drosselabfluss ist größer als der Scheitelabfluss – rechnerisch wird kein Rückhaltevolumen benötigt.')
    }

    // --- 9. Plausibilität der Konzentrationszeit ----------------------------
    const tcNote = H.checkTcValidity(Lf, deltaH)
    if (tcNote) warn(tcNote)

    // Abflussbeiwert als Kontrollgröße
    const psi = P_used > 0 ? eff.peTotal / P_used : 0

    return {
        // Ergebnisse
        hydrograph,
        rainDepths,
        effectiveRain: eff.series,
        qMax,
        tPeak,
        qBase: Q_base,
        qAllowed: Q_allowed,
        vReq: retention.volume,
        retention,

        // Nachweisrelevante Zwischengrößen
        area_km2: A_km2,
        P_input: P_mm,
        P_used,
        peTotal: eff.peTotal,
        psi,
        perArea: eff.perArea.map((p, i) => ({
            ...p,
            id: areasAmc[i].id,
            name: areasAmc[i].name,
            cn2: areasAmc[i].cn2
        })),
        amc,
        iaRatio,
        arf,
        rainType,
        dt,
        rainSteps,
        D_min,
        k: k_h,
        n,
        window_h: hydrograph[hydrograph.length - 1].t,
        directVolume: routed.volume,
        inflowVolume: routed.inflowVolume,
        massBalance: routed.inflowVolume > 0 ? routed.volume / routed.inflowVolume : 1,

        warnings
    }
}

/**
 * Sucht die maßgebende Dauerstufe: rechnet alle KOSTRA-Dauerstufen durch und
 * gibt die Reihe sowie die für V_erf bzw. Q_max maßgebenden Stufen zurück.
 *
 * Genau dieser Schritt fehlte bisher komplett – eine einzelne, vom Nutzer
 * gewählte Dauerstufe ist für eine Bemessung nicht ausreichend.
 *
 * @param {ScenarioInput} baseInput - Eingaben ohne P_mm/D_min
 * @param {Object} kostraRaw - KOSTRA-Rohdaten (Dauerstufe -> Zeile)
 * @param {string} [heightKey='HN_100A'] - Feld der Niederschlagshöhe in mm
 * @returns {{rows:Array, governingByVolume:Object|null, governingByPeak:Object|null}}
 */
export function findGoverningDuration(baseInput, kostraRaw, heightKey = 'HN_100A') {
    if (!kostraRaw) throw new Error('Für die Dauerstufensuche werden KOSTRA-Daten benötigt.')

    const durations = Object.keys(kostraRaw)
        .map(Number)
        .filter(d => Number.isFinite(d) && d > 0)
        .sort((a, b) => a - b)

    const heights = {}
    for (const d of durations) {
        const h = kostraRaw[String(d)]?.[heightKey]
        if (Number.isFinite(h)) heights[d] = h
    }

    const rows = []
    for (const d of durations) {
        const P = heights[d]
        if (!Number.isFinite(P)) continue
        try {
            const r = runFloodWaveScenario({ ...baseInput, P_mm: P, D_min: d, kostraHeights: heights })
            rows.push({
                D_min: d,
                P_mm: P,
                qMax: r.qMax,
                tPeak: r.tPeak,
                vReq: r.vReq,
                peTotal: r.peTotal,
                usable: !r.retention.neverEmpties && !r.retention.stillFilling
            })
        } catch (e) {
            rows.push({ D_min: d, P_mm: P, error: e.message })
        }
    }

    const ok = rows.filter(r => !r.error)
    const governingByVolume = ok.length
        ? ok.reduce((b, r) => (r.vReq > b.vReq ? r : b))
        : null
    const governingByPeak = ok.length
        ? ok.reduce((b, r) => (r.qMax > b.qMax ? r : b))
        : null

    return { rows, governingByVolume, governingByPeak }
}
