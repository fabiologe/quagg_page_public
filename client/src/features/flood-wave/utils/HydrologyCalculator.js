/**
 * HydrologyCalculator
 *
 * Abflussbildung nach dem SCS-Curve-Number-Verfahren (USDA-SCS / NRCS TR-55)
 * und Abflusskonzentration über eine lineare Speicherkaskade (Nash).
 *
 * WICHTIG zu den Einheiten:
 *   - Niederschlagshöhen (P, Pe, S, Ia) durchgängig in mm
 *   - Zeiten (Tc, k, dt, t) durchgängig in Stunden
 *   - Flächen im Store in m², in diesem Modul in km²
 *   - Abflüsse in m³/s, Volumina in m³
 *
 * Die Methoden werfen bei unzulässigen Parametern einen Error mit deutscher
 * Meldung, statt still NaN zu liefern. Der Store fängt das und zeigt es an.
 */

/** Curve-Number-Grenzen, außerhalb derer das SCS-Verfahren nicht mehr sinnvoll ist. */
export const CN_MIN = 30
export const CN_MAX = 100

export class HydrologyCalculator {

    // ------------------------------------------------------------------
    // 1. Konzentrationszeit
    // ------------------------------------------------------------------

    /**
     * Konzentrationszeit Tc nach California Culverts Practice (1942).
     *
     *     Tc [h] = (0,868 · Lf³ / Δh)^0,385      Lf in km, Δh in m
     *
     * Das ist die metrische Form derselben Beziehung, die auch der
     * Kirpich-Formel (1940) zugrunde liegt (identischer Exponent 0,385);
     * numerisch deckungsgleich mit Tc[min] = 0,0195·(L³/H)^0,385 (L, H in m).
     *
     * Gültigkeitsbereich: kleine bis mittlere Gebiete mit ausgeprägtem
     * Gerinne und natürlichem Gefälle. Für stark versiegelte oder sehr
     * flache Gebiete liefert die Formel zu kurze Zeiten.
     *
     * @param {number} Lf - Fließlänge in km
     * @param {number} deltaH - Höhendifferenz in m
     * @returns {number} Tc in Stunden (0, wenn Eingaben unvollständig)
     */
    static calculateTc(Lf, deltaH) {
        if (!Number.isFinite(Lf) || !Number.isFinite(deltaH)) return 0
        if (Lf <= 0 || deltaH <= 0) return 0
        return Math.pow((0.868 * Math.pow(Lf, 3)) / deltaH, 0.385)
    }

    /**
     * Grenzen, außerhalb derer Tc nach California Culverts Practice
     * nicht mehr belastbar ist – für Hinweise in der Oberfläche.
     * @returns {string|null} Hinweistext oder null
     */
    static checkTcValidity(Lf, deltaH) {
        if (Lf <= 0 || deltaH <= 0) return null
        const slope = deltaH / (Lf * 1000)
        if (Lf > 10) return 'Fließlänge über 10 km – die Formel ist für kleine bis mittlere Gebiete abgeleitet.'
        if (slope < 0.003) return 'Sehr geringes Gefälle (< 0,3 %) – Tc wird tendenziell unterschätzt.'
        if (slope > 0.10) return 'Sehr steiles Gefälle (> 10 %) – Tc liegt außerhalb des abgesicherten Bereichs.'
        return null
    }

    /**
     * Speicherkoeffizient k aus Konzentrationszeit und Kaskadenzahl.
     * In der Nash-Kaskade ist die Gesamtverzögerung n·k; Tc wird darauf
     * gleichmäßig aufgeteilt.
     *
     * @param {number} Tc - Konzentrationszeit in h
     * @param {number} n - Anzahl Speicher
     * @returns {number} k in h (0, wenn nicht ableitbar)
     */
    static storageCoefficientFromTc(Tc, n) {
        if (!Number.isFinite(Tc) || Tc <= 0) return 0
        if (!Number.isFinite(n) || n < 1) return 0
        return Tc / n
    }

    // ------------------------------------------------------------------
    // 2. Abflussbildung (SCS-CN)
    // ------------------------------------------------------------------

    /**
     * Umrechnung der Curve Number zwischen den Vorfeuchteklassen (AMC).
     *
     * AMC I   = trockener Vorzustand
     * AMC II  = mittlerer Vorzustand (Tabellenwert)
     * AMC III = nasser Vorzustand – für seltene Ereignisse (HQ100) üblich,
     *           weil ein Extremregen praktisch nie auf trockenem Boden fällt.
     *
     * Formeln nach Chow/Maidment/Mays, Applied Hydrology (1988).
     *
     * @param {number} cn2 - Curve Number für AMC II (Tabellenwert)
     * @param {'I'|'II'|'III'} amc - Zielklasse
     * @returns {number} umgerechnete Curve Number
     */
    static convertCn(cn2, amc = 'II') {
        if (!Number.isFinite(cn2) || cn2 <= 0) return 0
        const cn = Math.min(100, cn2)
        if (amc === 'I') return (4.2 * cn) / (10 - 0.058 * cn)
        if (amc === 'III') return (23 * cn) / (10 + 0.13 * cn)
        return cn
    }

    /**
     * Maximales Rückhaltevermögen S des Bodens.
     * @param {number} CN - Curve Number
     * @returns {number} S in mm
     */
    static retentionS(CN) {
        if (CN >= CN_MAX) return 0
        if (CN <= 0) return Infinity
        return (25400 / CN) - 254
    }

    /**
     * Effektiver Niederschlag nach SCS-CN für eine einzelne Fläche.
     *
     *     S  = 25400/CN - 254            [mm]
     *     Ia = iaRatio · S               [mm]
     *     Pe = (P - Ia)² / (P - Ia + S)  für P > Ia, sonst 0
     *
     * @param {number} P - Niederschlagshöhe in mm
     * @param {number} CN - Curve Number (bereits auf die gewünschte AMC umgerechnet)
     * @param {number} [iaRatio=0.2] - Anfangsverlustbeiwert Ia/S.
     *        0,20 = Originalansatz des SCS. 0,05 wird in Europa vielfach als
     *        besser angepasst angesehen (Woodward et al. 2003) und führt zu
     *        deutlich mehr Abfluss bei kleinen Niederschlagshöhen.
     * @returns {number} Pe in mm
     */
    static calculateScsRunoff(P, CN, iaRatio = 0.2) {
        if (!Number.isFinite(P) || P <= 0) return 0
        if (!Number.isFinite(CN) || CN <= 0) return 0
        if (CN >= CN_MAX) return P

        const S = this.retentionS(CN)
        const Ia = iaRatio * S
        if (P <= Ia) return 0
        return Math.pow(P - Ia, 2) / (P - Ia + S)
    }

    /**
     * Baut die Zeitreihe des effektiven Niederschlags auf.
     *
     * Zwei Dinge, die eine einfache Gleichverteilung von Pe falsch macht und
     * die hier korrekt behandelt werden:
     *
     *  1. Die SCS-Gleichung ist nichtlinear in CN. Der flächengewichtete
     *     Misch-CN in die Gleichung einzusetzen unterschätzt den Abfluss bei
     *     heterogenen Gebieten erheblich (bei 50 % CN 98 + 50 % CN 55 und
     *     P = 60 mm um rund 42 %). Deshalb wird Pe je Fläche gerechnet und
     *     erst danach flächengewichtet gemittelt.
     *
     *  2. Der Anfangsverlust Ia fällt am *Anfang* des Ereignisses an, nicht
     *     gleichmäßig verteilt. Deshalb wird die SCS-Gleichung inkrementell
     *     auf die kumulierte Niederschlagshöhe angewandt und differenziert.
     *
     * @param {number[]} rainDepths - Niederschlagshöhe je Zeitschritt in mm
     * @param {Array<{area:number, cn:number}>} areas - Teilflächen (area in m²,
     *        cn bereits auf die gewünschte AMC umgerechnet)
     * @param {number} [iaRatio=0.2]
     * @returns {{series:number[], peTotal:number, pTotal:number, perArea:Array}}
     *          series = effektiver Niederschlag je Schritt in mm, bezogen auf
     *          die Gesamtfläche
     */
    static buildEffectiveRainSeries(rainDepths, areas, iaRatio = 0.2) {
        const valid = (areas || []).filter(a => Number.isFinite(a.area) && a.area > 0)
        const totalArea = valid.reduce((s, a) => s + a.area, 0)

        if (totalArea <= 0) {
            throw new Error('Keine Fläche mit positiver Größe vorhanden – Abflussbildung nicht berechenbar.')
        }

        const pTotal = rainDepths.reduce((s, v) => s + v, 0)

        // Kumulierte Abflusshöhe je Fläche, Schritt für Schritt
        const prevQ = new Array(valid.length).fill(0)
        const series = new Array(rainDepths.length).fill(0)
        let cumP = 0

        for (let i = 0; i < rainDepths.length; i++) {
            cumP += rainDepths[i]
            let weighted = 0
            for (let a = 0; a < valid.length; a++) {
                const Q = this.calculateScsRunoff(cumP, valid[a].cn, iaRatio)
                const inc = Q - prevQ[a]
                prevQ[a] = Q
                weighted += inc * valid[a].area
            }
            series[i] = weighted / totalArea
        }

        const perArea = valid.map((a, idx) => {
            const S = this.retentionS(a.cn)
            return {
                area: a.area,
                cn: a.cn,
                S: Number.isFinite(S) ? S : null,
                Ia: Number.isFinite(S) ? iaRatio * S : null,
                Pe: prevQ[idx]
            }
        })

        return {
            series,
            peTotal: series.reduce((s, v) => s + v, 0),
            pTotal,
            perArea
        }
    }

    // ------------------------------------------------------------------
    // 3. Regenverteilung
    // ------------------------------------------------------------------

    /**
     * Blockregen: Gesamthöhe gleichmäßig auf alle Schritte verteilt.
     * @param {number} P - Gesamtniederschlagshöhe in mm
     * @param {number} steps - Anzahl Schritte
     * @returns {number[]} mm je Schritt
     */
    static blockRainDepths(P, steps) {
        if (steps < 1) throw new Error('Regendauer ergibt keinen einzigen Zeitschritt.')
        return new Array(steps).fill(P / steps)
    }

    /**
     * Modellregen Euler Typ II aus einer KOSTRA-Zeile mit Niederschlagshöhen.
     *
     * Vorgehen: Aus den Höhen der Dauerstufen werden die Höhendifferenzen der
     * Teilintervalle gebildet (Δh_j = h(j·Δt) − h((j−1)·Δt), zwischen den
     * Dauerstufen linear interpoliert), absteigend sortiert und um einen
     * Scheitel bei 30 % der Gesamtdauer alternierend angeordnet. Ergebnis ist
     * ein steiler Anstieg und ein flacher, langer Ablauf.
     *
     * Anders als der Blockregen ist die Gesamthöhe gleich der KOSTRA-Höhe der
     * betrachteten Dauerstufe – der Scheitelabfluss fällt aber deutlich höher aus.
     *
     * @param {Object<string|number, number>} heightsByDuration - Dauerstufe [min] -> Höhe [mm]
     * @param {number} D_min - Gesamtdauer in min
     * @param {number} steps - Anzahl Zeitschritte
     * @returns {number[]} mm je Schritt
     */
    static eulerType2Depths(heightsByDuration, D_min, steps) {
        if (steps < 1) throw new Error('Regendauer ergibt keinen einzigen Zeitschritt.')
        if (!heightsByDuration) throw new Error('Für den Euler-II-Modellregen werden KOSTRA-Daten benötigt.')

        const durations = Object.keys(heightsByDuration)
            .map(Number)
            .filter(d => Number.isFinite(d) && d > 0)
            .sort((a, b) => a - b)

        if (durations.length === 0) {
            throw new Error('Die KOSTRA-Daten enthalten keine auswertbaren Dauerstufen.')
        }

        // Höhe h(d) mit linearer Interpolation zwischen den Dauerstufen
        const h = (d) => {
            if (d <= 0) return 0
            if (heightsByDuration[d] !== undefined) return heightsByDuration[d]
            let lower = null, upper = null
            for (const ad of durations) {
                if (ad <= d) lower = ad
                if (ad > d && upper === null) upper = ad
            }
            if (lower !== null && upper !== null) {
                const hl = heightsByDuration[lower]
                const hu = heightsByDuration[upper]
                return hl + (hu - hl) * (d - lower) / (upper - lower)
            }
            if (lower !== null) return heightsByDuration[lower]
            // unterhalb der kleinsten Dauerstufe linear gegen 0 laufen lassen
            return heightsByDuration[upper] * (d / upper)
        }

        const dtMin = D_min / steps
        const blocks = []
        for (let j = 1; j <= steps; j++) {
            const inc = h(j * dtMin) - h((j - 1) * dtMin)
            blocks.push(Math.max(0, inc))
        }

        blocks.sort((a, b) => b - a)

        const out = new Array(steps).fill(0)
        const peak = Math.max(0, Math.min(steps - 1, Math.floor(steps * 0.3)))
        out[peak] = blocks[0]

        let left = peak - 1
        let right = peak + 1
        for (let i = 1; i < blocks.length; i++) {
            const toLeft = (i % 2 === 1)
            if (toLeft && left >= 0) out[left--] = blocks[i]
            else if (right < steps) out[right++] = blocks[i]
            else if (left >= 0) out[left--] = blocks[i]
        }
        return out
    }

    // ------------------------------------------------------------------
    // 4. Zeitraster
    // ------------------------------------------------------------------

    /**
     * Wählt den Zeitschritt so, dass
     *   (a) die Regendauer D exakt abgebildet wird (kein Aufrunden!) und
     *   (b) dt fein genug gegenüber dem Speicherkoeffizienten k ist.
     *
     * Ein fester Zeitschritt (früher 0,1 h) rundet kurze Dauerstufen auf:
     * D = 5/10/15/20 min wurden als 6/12/18/24 min gerechnet, die Intensität
     * damit um 20 % zu klein.
     *
     * @param {number} D_h - Regendauer in h
     * @param {number} k - Speicherkoeffizient in h
     * @param {number} n - Anzahl Kaskaden (bestimmt die Länge des Nachlaufs)
     * @param {{minSteps?:number, maxRainSteps?:number, maxTotalSteps?:number}} [opts]
     * @returns {{dt:number, rainSteps:number, coarse:boolean, estWindow:number}}
     */
    static chooseTimeStep(D_h, k, n, opts = {}) {
        const minSteps = opts.minSteps ?? 24
        const maxRainSteps = opts.maxRainSteps ?? 5000
        const maxTotalSteps = opts.maxTotalSteps ?? 60000

        if (!Number.isFinite(D_h) || D_h <= 0) {
            throw new Error('Die Regendauer muss größer als 0 sein.')
        }
        if (!Number.isFinite(k) || k <= 0) {
            throw new Error('Der Speicherkoeffizient k muss größer als 0 sein.')
        }

        // grobe Abschätzung des benötigten Rechenfensters: Regendauer plus
        // Anstieg (n-1)·k plus Ablauf; ~12·k deckt den Ablauf bis << 1 % ab
        const estWindow = D_h + (n + 12) * k

        const target = Math.min(k / 10, D_h / minSteps)
        let rainSteps = Math.ceil(D_h / target)
        rainSteps = Math.max(minSteps, Math.min(maxRainSteps, rainSteps))

        // Fenster darf nicht in Millionen Schritte laufen (z. B. D = 5 min, k = 100 h).
        // Ist k sehr viel größer als D, darf die Regenauflösung dafür grob werden –
        // die Kaskade glättet den Regen ohnehin vollständig weg.
        let dt = D_h / rainSteps
        if (estWindow / dt > maxTotalSteps) {
            const dtNeeded = estWindow / maxTotalSteps
            rainSteps = Math.max(4, Math.floor(D_h / dtNeeded))
            dt = D_h / rainSteps
        }

        return { dt, rainSteps, coarse: dt > k / 5, estWindow }
    }

    // ------------------------------------------------------------------
    // 5. Abflusskonzentration (Nash-Kaskade)
    // ------------------------------------------------------------------

    /**
     * Routet den effektiven Niederschlag durch eine Kaskade aus n gleichen
     * Linearspeichern und läuft anschließend so lange mit Zufluss 0 weiter,
     * bis die Welle abgeklungen ist.
     *
     * Früher war das Nachlauffenster fest auf 50 Schritte (= 5 h) gesetzt.
     * Bei k = 12 h / n = 3 lag der Scheitel damit bei t = 37,8 h außerhalb
     * eines 29-h-Fensters: Q_max 14,5 % zu klein, nur 19 % des Volumens erfasst.
     *
     * Für jeden Speicher gilt die exakte Lösung bei konstantem Zufluss I:
     *     S_neu = S_alt·e^(−Δt/k) + I·k·(1 − e^(−Δt/k))
     * An den nächsten Speicher wird der über den Schritt *gemittelte* Abfluss
     * weitergegeben (aus der Massenbilanz Q̄ = I − (S_neu − S_alt)/Δt), nicht
     * der Momentanwert am Schrittende.
     *
     * Die Ordinaten sind Momentanwerte am *Ende* des jeweiligen Schritts und
     * werden entsprechend bei t = (i+1)·dt abgelegt; zusätzlich wird der
     * physikalisch korrekte Startpunkt Q(0) = 0 vorangestellt. Früher lag die
     * gesamte Ganglinie dadurch einen Zeitschritt zu früh und begann mit einem
     * Sprung statt bei null.
     *
     * @param {Object} p
     * @param {number[]} p.rainSeries - effektiver Niederschlag je Schritt in mm
     * @param {number} p.area_km2 - Gesamtfläche in km²
     * @param {number} p.k - Speicherkoeffizient in h
     * @param {number} p.n - Anzahl Speicher (ganzzahlig >= 1)
     * @param {number} p.dt - Zeitschritt in h
     * @param {number} [p.recessionRatio=0.005] - Abbruch, wenn Q unter diesen
     *        Anteil des Scheitels gefallen ist
     * @param {number} [p.stopBelow=Infinity] - zusätzliche absolute Schranke in
     *        m³/s; erst wenn Q auch darunter liegt, wird abgebrochen. Der Store
     *        setzt sie aus dem Drosselabfluss, damit das Rückhaltevolumen
     *        garantiert auskonvergiert ist.
     * @param {number} [p.maxSteps=200000] - harte Obergrenze
     * @returns {{hydrograph:Array<{t:number,Q:number}>, peak:{t:number,Q:number},
     *            volume:number, inflowVolume:number, truncated:boolean}}
     */
    static routeNashCascade({ rainSeries, area_km2, k, n, dt, recessionRatio = 0.005, stopBelow = Infinity, maxSteps = 200000 }) {
        if (!Number.isFinite(k) || k <= 0) {
            throw new Error('Der Speicherkoeffizient k muss größer als 0 sein.')
        }
        if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
            throw new Error('Die Anzahl der Kaskaden n muss eine ganze Zahl >= 1 sein.')
        }
        if (!Number.isFinite(dt) || dt <= 0) {
            throw new Error('Der Zeitschritt dt muss größer als 0 sein.')
        }
        if (!Number.isFinite(area_km2) || area_km2 <= 0) {
            throw new Error('Die Einzugsgebietsfläche muss größer als 0 sein.')
        }
        if (!Array.isArray(rainSeries) || rainSeries.length === 0) {
            throw new Error('Die Niederschlagsreihe ist leer.')
        }
        if (rainSeries.some(v => !Number.isFinite(v))) {
            throw new Error('Die Niederschlagsreihe enthält ungültige Werte.')
        }

        const dts = dt * 3600
        const ks = k * 3600
        const e = Math.exp(-dts / ks)

        const S = new Array(n).fill(0)
        const hydrograph = [{ t: 0, Q: 0 }]
        let peak = { t: 0, Q: 0 }
        let inflowVolume = 0

        let i = 0
        let truncated = false

        while (true) {
            const Pe_mm = i < rainSeries.length ? rainSeries[i] : 0
            const volIn = Pe_mm * area_km2 * 1000       // m³
            inflowVolume += volIn

            let I = volIn / dts                          // m³/s, konstant über dt
            for (let j = 0; j < n; j++) {
                const So = S[j]
                const Sn = So * e + I * ks * (1 - e)
                const Qmean = I - (Sn - So) / dts        // exakte Massenbilanz
                S[j] = Sn
                I = Qmean
            }

            const t = (i + 1) * dt
            const Q = S[n - 1] / ks                      // Momentanwert am Schrittende
            hydrograph.push({ t, Q })
            if (Q > peak.Q) peak = { t, Q }

            i++

            if (i >= rainSeries.length) {
                if (i >= maxSteps) { truncated = true; break }
                if (peak.Q <= 0) break            // gar kein Abfluss entstanden
                // abgeklungen? Scheitel überschritten und Q unter beiden Schranken
                if (t > peak.t && Q <= recessionRatio * peak.Q && Q <= stopBelow) break
            }
        }

        return {
            hydrograph,
            peak,
            volume: this.integrate(hydrograph),
            inflowVolume,
            truncated
        }
    }

    /**
     * Trapezintegration einer Ganglinie.
     * @param {Array<{t:number,Q:number}>} series - t in h, Q in m³/s
     * @param {number} [offset=0] - konstanter Abzug (z. B. Basisabfluss) in m³/s
     * @returns {number} Volumen in m³
     */
    static integrate(series, offset = 0) {
        let v = 0
        for (let i = 1; i < series.length; i++) {
            const a = series[i - 1].Q - offset
            const b = series[i].Q - offset
            v += 0.5 * (a + b) * (series[i].t - series[i - 1].t) * 3600
        }
        return v
    }

    // ------------------------------------------------------------------
    // 6. Rückhaltevolumen
    // ------------------------------------------------------------------

    /**
     * Erforderliches Rückhaltevolumen als größter Überschuss des Zuflusses
     * über den Drosselabfluss.
     *
     *     V = max_t ∫ (Q_zu − Q_Dr) dt,  Untergrenze 0 (leeres Becken)
     *
     * Voraussetzung für ein konvergentes Ergebnis ist Q_Dr > Q_Basis – sonst
     * kann das Becken nie leerlaufen und V wächst nur noch mit der Länge des
     * Rechenfensters. Das wird hier nicht stillschweigend geschluckt, sondern
     * über `neverEmpties` gemeldet.
     *
     * @param {Array<{t:number,Q:number}>} hydrograph - Gesamtzufluss (inkl. Basisabfluss)
     * @param {number} Q_allowed - zulässiger Drosselabfluss in m³/s
     * @param {number} [baseFlow=0] - Basisabfluss in m³/s (nur für die Diagnose)
     * @returns {{volume:number, tStart:number|null, tEnd:number|null,
     *            stillFilling:boolean, neverEmpties:boolean}}
     */
    static calculateRetentionVolume(hydrograph, Q_allowed, baseFlow = 0) {
        if (!Array.isArray(hydrograph) || hydrograph.length < 2) {
            return { volume: 0, tStart: null, tEnd: null, stillFilling: false, neverEmpties: false }
        }
        if (!Number.isFinite(Q_allowed) || Q_allowed < 0) {
            throw new Error('Der Drosselabfluss muss eine Zahl >= 0 sein.')
        }

        let cur = 0, max = 0
        let start = null, tStart = null, tEnd = null

        for (let i = 1; i < hydrograph.length; i++) {
            const a = hydrograph[i - 1].Q - Q_allowed
            const b = hydrograph[i].Q - Q_allowed
            const dtSec = (hydrograph[i].t - hydrograph[i - 1].t) * 3600

            const before = cur
            cur += 0.5 * (a + b) * dtSec

            if (before <= 0 && cur > 0) start = hydrograph[i - 1].t
            if (cur < 0) { cur = 0; start = null }
            if (cur > max) {
                max = cur
                tStart = start
                tEnd = hydrograph[i].t
            }
        }

        return {
            volume: max,
            tStart,
            tEnd,
            // Am Fensterende liegt der Zufluss noch über der Drossel: das Becken
            // füllt sich weiter, das Maximum ist also noch nicht erreicht.
            // (Ein am Ende noch *gefülltes*, aber bereits leerlaufendes Becken ist
            // dagegen unkritisch – V_erf steht dann bereits fest.)
            stillFilling: hydrograph[hydrograph.length - 1].Q > Q_allowed,
            neverEmpties: Q_allowed <= baseFlow
        }
    }
}
