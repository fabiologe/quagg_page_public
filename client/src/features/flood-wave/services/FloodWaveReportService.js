import { jsPDF } from 'jspdf'

const MARGIN = 20
const BOTTOM = 275          // ab hier wird umgebrochen (A4 = 297 mm)
const AMC_TEXT = {
    I: 'I (trocken)',
    II: 'II (mittel, Tabellenwert)',
    III: 'III (nass)'
}
const RAIN_TEXT = {
    block: 'Blockregen (gleichmaessige Intensitaet)',
    euler2: 'Modellregen Euler Typ II'
}

/** Deutsches Dezimalkomma – gleiche Schreibweise wie auf dem Bildschirm. */
const de = (v, d = 0) => {
    if (v === null || v === undefined || !Number.isFinite(Number(v))) return '-'
    return Number(v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export const FloodWaveReportService = {
    /**
     * Baut den Nachweisbericht auf und gibt das jsPDF-Dokument zurueck,
     * ohne es zu speichern.
     *
     * Bewusst vom Speichern getrennt: `doc.save()` braucht Browser-APIs, der
     * Aufbau nicht. So laesst sich das Layout (vor allem der Seitenumbruch)
     * im Test pruefen.
     *
     * Der Bericht dokumentiert auch die Zwischengroessen (S, Ia, Pe,
     * Vorfeuchte, Zeitschritt, Rechenfenster). Ohne sie ist der SCS-Schritt
     * nicht nachrechenbar und der Bericht damit nicht pruefbar.
     *
     * @param {Object} store - useFloodWaveStore-Instanz
     * @param {Object} [options]
     * @param {string} [options.chartDataUrl] - PNG der Ganglinie (Data-URL)
     * @returns {jsPDF}
     */
    buildFloodWaveReport(store, options = {}) {
        const detail = store.results?.detail
        if (!detail) {
            throw new Error('Es liegt kein Berechnungsergebnis vor. Bitte zuerst rechnen.')
        }

        const doc = new jsPDF()
        const pageWidth = doc.internal.pageSize.getWidth()
        const state = { y: MARGIN, page: 1 }

        // --- Layout-Helfer (fehlten bisher komplett: der Inhalt lief unten aus der Seite) ---
        const newPage = () => {
            doc.addPage()
            state.page += 1
            state.y = MARGIN
        }
        const need = (h) => { if (state.y + h > BOTTOM) newPage() }
        const heading = (text) => {
            need(16)
            state.y += 4
            doc.setFontSize(14)
            doc.setFont(undefined, 'bold')
            doc.setTextColor(0)
            doc.text(text, MARGIN, state.y)
            state.y += 8
        }
        const kv = (label, value) => {
            need(6)
            doc.setFontSize(11)
            doc.setFont(undefined, 'normal')
            doc.setTextColor(60)
            doc.text(label, MARGIN + 5, state.y)
            doc.setTextColor(0)
            doc.text(String(value), MARGIN + 95, state.y)
            state.y += 6
        }
        const note = (text) => {
            const wrapped = doc.splitTextToSize(text, pageWidth - 2 * MARGIN - 5)
            need(wrapped.length * 4.5 + 2)
            doc.setFontSize(8.5)
            doc.setFont(undefined, 'normal')
            doc.setTextColor(120)
            doc.text(wrapped, MARGIN + 5, state.y)
            state.y += wrapped.length * 4.5 + 2
            doc.setTextColor(0)
        }
        const rule = () => {
            need(4)
            doc.setDrawColor(210)
            doc.line(MARGIN + 5, state.y, pageWidth - MARGIN, state.y)
            state.y += 4
        }
        const row = (cells, cols, bold = false) => {
            need(6)
            doc.setFontSize(9.5)
            doc.setFont(undefined, bold ? 'bold' : 'normal')
            cells.forEach((c, i) => {
                const x = cols[i]
                const align = i === 0 ? 'left' : 'right'
                doc.text(String(c), align === 'left' ? x : x, state.y, { align })
            })
            state.y += 5.5
        }

        // --- KOPF ---
        doc.setFontSize(20)
        doc.setTextColor(44, 62, 80)
        doc.text('Hochwasserwelle HQ100', MARGIN, state.y)
        doc.setFontSize(10)
        doc.setTextColor(100)
        doc.text('SCS-Curve-Number-Verfahren und lineare Speicherkaskade (Nash)', MARGIN, state.y + 6)
        doc.text(`Datum: ${new Date().toLocaleDateString('de-DE')}`, pageWidth - MARGIN, state.y, { align: 'right' })
        doc.setTextColor(0)
        state.y += 18

        // --- 1. EINZUGSGEBIET ---
        heading('1. Einzugsgebiet und Konzentrationszeit')
        kv('Fliesslaenge Lf', `${store.params.Lf} km`)
        kv('Hoehendifferenz dh', `${store.params.deltaH} m`)
        kv('Konzentrationszeit Tc', `${de(store.tcResult, 2)} h`)
        note('Tc nach California Culverts Practice: Tc [h] = (0,868 * Lf^3 / dh)^0,385 mit Lf in km und dh in m. '
            + 'Gueltig fuer kleine bis mittlere Gebiete mit ausgepraegtem Gerinne.')
        if (store.tcWarning) note(`Hinweis: ${store.tcWarning}`)

        // --- 2. FLAECHEN ---
        heading('2. Flaechen und CN-Werte')
        const cols = [MARGIN + 5, 90, 115, 138, 160, 185]
        row(['Name', 'Flaeche (ha)', 'CN (II)', `CN (${detail.amc})`, 'S (mm)', 'Pe (mm)'], cols, true)
        rule()
        detail.perArea.forEach(p => {
            row([
                (p.name || 'Unbenannt').slice(0, 32),
                de((p.area / 10000), 2),
                de(p.cn2, 0),
                de(p.cn, 1),
                p.S === null ? '0,0' : de(p.S, 1),
                de(p.Pe, 2)
            ], cols)
        })
        rule()
        kv('Gesamtflaeche', `${de((store.totalArea / 10000), 2)} ha  (${de(detail.area_km2, 3)} km2)`)
        kv('Flaechengewichteter CN', de(store.weightedCN, 1))
        note('Der flaechengewichtete CN ist eine reine Kenngroesse. Die Abflussbildung wird flaechenweise '
            + 'gerechnet und erst danach gewichtet gemittelt, da die SCS-Gleichung nichtlinear in CN ist.')

        // --- 3. NIEDERSCHLAG ---
        heading('3. Niederschlag (T = 100 a)')
        kv('Dauerstufe D', `${detail.D_min} min`)
        kv('Niederschlagshoehe P (KOSTRA)', `${de(detail.P_input, 1)} mm`)
        kv('Gebietsreduktionsfaktor', de(detail.arf, 2))
        kv('Angesetzte Hoehe', `${de(detail.P_used, 1)} mm`)
        kv('Verteilung', RAIN_TEXT[detail.rainType] || detail.rainType)
        if (store.kostraLocation) {
            note(`KOSTRA-Abfrage am Gebietsschwerpunkt ${de(store.kostraLocation.lat, 4)} / `
                + `${de(store.kostraLocation.lng, 4)}, Feld HN_100A (Niederschlagshoehe in mm).`)
        }
        if (detail.arf === 1 && detail.area_km2 > 25) {
            note('Hinweis: KOSTRA liefert Punktniederschlag. Bei diesem Einzugsgebiet sollte ein '
                + 'Gebietsreduktionsfaktor kleiner 1 angesetzt werden.')
        }

        // --- 4. ABFLUSSBILDUNG ---
        heading('4. Abflussbildung (SCS-CN)')
        kv('Vorfeuchteklasse AMC', AMC_TEXT[detail.amc] || detail.amc)
        kv('Anfangsverlustbeiwert Ia/S', de(detail.iaRatio, 2))
        kv('Wirksamer Niederschlag Pe', `${de(detail.peTotal, 2)} mm`)
        kv('Abflussbeiwert psi', `${de((detail.psi * 100), 1)} %`)
        kv('Direktabflussvolumen', `${de(detail.directVolume, 0)} m3`)
        note('S = 25400/CN - 254 [mm], Ia = (Ia/S) * S, Pe = (P - Ia)^2 / (P - Ia + S) fuer P > Ia. '
            + 'Die eingegebenen CN sind AMC-II-Tabellenwerte und werden nach Chow (1988) auf die gewaehlte '
            + 'Vorfeuchteklasse umgerechnet. Die Gleichung wird inkrementell auf die kumulierte '
            + 'Niederschlagshoehe angewendet, damit der Anfangsverlust am Anfang des Ereignisses anfaellt.')

        // --- 5. ABFLUSSKONZENTRATION ---
        heading('5. Abflusskonzentration und Drossel')
        kv('Kaskaden n', detail.n)
        kv('Speicherkoeffizient k', `${de(detail.k, 3)} h` + (store.params.autoK ? '  (abgeleitet als Tc/n)' : '  (manuell)'))
        kv('Basisabfluss', `${store.params.qBase} l/(s*km2)  =  ${de((detail.qBase * 1000), 1)} l/s`)
        kv('Drosselabfluss Q_Dr', `${store.params.qDr} l/s`)
        kv('Zeitschritt dt', `${de((detail.dt * 60), 2)} min`)
        kv('Rechenfenster', `${de(detail.window_h, 1)} h`)
        kv('Massenbilanz (Vab/Vzu)', `${de((detail.massBalance * 100), 1)} %`)
        note('Lineare Speicherkaskade nach Nash: je Speicher S_neu = S_alt*e^(-dt/k) + I*k*(1-e^(-dt/k)). '
            + 'Das Rechenfenster wird so lange verlaengert, bis die Welle abgeklungen und der Zufluss unter '
            + 'die Drosselleistung gefallen ist.')

        // --- 6. ERGEBNISSE ---
        heading('6. Ergebnisse')
        kv('Maximaler Abfluss Q_max', `${de(detail.qMax, 3)} m3/s`)
        kv('Scheitelzeit', `${de(detail.tPeak, 2)} h`)
        kv('Erforderliches Rueckhaltevolumen V_erf', `${de(detail.vReq, 0)} m3`)
        if (detail.retention.tStart !== null) {
            kv('Massgebende Fuellphase', `${de(detail.retention.tStart, 2)} h bis ${de(detail.retention.tEnd, 2)} h`)
        }
        note('V_erf = groesster Ueberschuss des Zuflusses ueber den Drosselabfluss, Untergrenze leeres Becken.')

        // --- 7. HINWEISE ---
        if (detail.warnings?.length) {
            heading('7. Hinweise und Einschraenkungen')
            detail.warnings.forEach(w => {
                note(`${w.level === 'error' ? '[!]' : '[i]'} ${w.text}`)
            })
        }

        // --- 8. MASSGEBENDE DAUERSTUFE ---
        const sweep = store.durationSweep
        if (sweep?.rows?.length) {
            heading('8. Dauerstufenvergleich')
            const scols = [MARGIN + 5, 70, 105, 140, 180]
            row(['D (min)', 'P (mm)', 'Q_max (m3/s)', 'V_erf (m3)', ''], scols, true)
            rule()
            sweep.rows.forEach(r => {
                const gov = (r === sweep.governingByVolume ? 'V' : '') + (r === sweep.governingByPeak ? 'Q' : '')
                row([
                    r.D_min,
                    r.P_mm == null ? '-' : de(r.P_mm, 1),
                    r.error ? '-' : de(r.qMax, 3),
                    r.error ? '-' : de(r.vReq, 0),
                    gov ? `<- massgebend ${gov}` : ''
                ], scols, !!gov)
            })
            rule()
            note('V = massgebend fuer das Rueckhaltevolumen, Q = massgebend fuer den Scheitelabfluss.')
        }

        // --- 9. GANGLINIE ---
        if (options.chartDataUrl) {
            heading('9. Ganglinie')
            const w = pageWidth - 2 * MARGIN
            const h = w * 0.5
            need(h + 4)
            try {
                doc.addImage(options.chartDataUrl, 'PNG', MARGIN, state.y, w, h)
                state.y += h + 4
            } catch (e) {
                note('Die Grafik konnte nicht eingebettet werden.')
            }
        }

        // --- FUSSZEILEN ---
        const total = doc.internal.getNumberOfPages()
        for (let i = 1; i <= total; i++) {
            doc.setPage(i)
            doc.setFontSize(8)
            doc.setTextColor(150)
            doc.text(`Seite ${i} von ${total}`, pageWidth - MARGIN, 288, { align: 'right' })
            doc.text('Erstellt mit quagg-engineering – Ergebnisse sind vom Aufsteller zu pruefen.', MARGIN, 288)
        }

        return doc
    },

    /**
     * Baut den Bericht und loest den Download aus.
     * @param {Object} store
     * @param {Object} [options]
     */
    generateFloodWaveReport(store, options = {}) {
        const doc = this.buildFloodWaveReport(store, options)
        doc.save('hochwasserwelle_hq100_bericht.pdf')
        return doc
    }
}
