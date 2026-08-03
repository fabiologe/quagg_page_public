import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { KostraApiService } from '../../kostra/services/KostraApiService'
import { ElevationService } from '@/services/ElevationService'
import { HydrologyCalculator } from '../utils/HydrologyCalculator'
import { runFloodWaveScenario, findGoverningDuration } from '../utils/floodWaveModel'
import buffer from '@turf/buffer'

/** KOSTRA: HN_* = Niederschlagshöhe [mm], RN_* = Regenspende [l/(s·ha)]. Hier wird die Höhe gebraucht. */
const KOSTRA_HEIGHT_KEY = 'HN_100A'

export const useFloodWaveStore = defineStore('floodWave', () => {
    // --- STATE ---
    const params = ref({
        Lf: 0,            // km
        deltaH: 10,       // m
        P: 50,            // mm
        D: 60,            // min
        qBase: 20,        // l/(s·km²)
        k: 1,             // h
        n: 2,             // Speicher
        qDr: 10,          // l/s
        // ab hier neu – vorher fest verdrahtete Annahmen
        amc: 'III',       // Vorfeuchte; III ist für HQ100 der übliche Ansatz
        iaRatio: 0.2,     // Ia/S
        rainType: 'block',// 'block' | 'euler2'
        arf: 1,           // Gebietsreduktionsfaktor
        autoK: true       // k aus Tc ableiten (k = Tc/n)
    })

    const riverLength = ref(0)      // m
    const riverCoords = ref(null)   // { start: [lat,lng], end: [lat,lng] }
    const riverId = ref(null)       // Layer-ID, damit Löschen auf der Karte greift
    const riverPath = ref(null)     // vollständige Stützpunkte [[lat,lng], ...]

    const areas = ref([])           // { id, name, area (m²), cn }

    const results = ref(emptyResults())
    const durationSweep = ref(null) // Ergebnis der Dauerstufensuche

    const isLoadingKostra = ref(false)
    const isLoadingElevation = ref(false)
    const isSweeping = ref(false)
    const kostraData = ref(null)
    const kostraLocation = ref(null)
    const notice = ref(null)        // kurzlebiger Hinweis für die Oberfläche

    const availableDurations = [
        5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 540, 720,
        1080, 1440, 2880, 4320, 5760, 7200, 8640, 10080
    ]

    function emptyResults() {
        return { qMax: 0, vReq: 0, hydrograph: [], warnings: [], error: null, detail: null }
    }

    // --- COMPUTED ---
    const tcResult = computed(() =>
        HydrologyCalculator.calculateTc(params.value.Lf, params.value.deltaH)
    )

    const tcWarning = computed(() =>
        HydrologyCalculator.checkTcValidity(params.value.Lf, params.value.deltaH)
    )

    /** k aus der Konzentrationszeit: n·k = Tc. */
    const suggestedK = computed(() =>
        HydrologyCalculator.storageCoefficientFromTc(tcResult.value, params.value.n)
    )

    /**
     * Der tatsächlich gerechnete Speicherkoeffizient.
     * Früher stand hier `params.k || Tc` – da k per Default 1 ist, ging die
     * aufwendig ermittelte Konzentrationszeit nie in die Rechnung ein.
     */
    const effectiveK = computed(() => {
        if (params.value.autoK && suggestedK.value > 0) return suggestedK.value
        return params.value.k
    })

    const totalArea = computed(() => areas.value.reduce((sum, a) => sum + (a.area || 0), 0))

    /**
     * Flächengewichteter CN – reine Anzeigegröße!
     * Gerechnet wird flächenweise (siehe buildEffectiveRainSeries), weil die
     * SCS-Gleichung nichtlinear in CN ist und der Misch-CN den Abfluss bei
     * heterogenen Gebieten deutlich unterschätzt.
     */
    const weightedCN = computed(() => {
        if (totalArea.value === 0) return 0
        return areas.value.reduce((sum, a) => sum + (a.area * a.cn), 0) / totalArea.value
    })

    /** Basisabfluss absolut – damit der Vergleich mit der Drossel sichtbar wird. */
    const baseFlowLs = computed(() => params.value.qBase * (totalArea.value / 1e6))

    /** Prüfungen, die schon vor dem Rechnen sichtbar sein sollen. */
    const inputIssues = computed(() => {
        const out = []
        if (totalArea.value <= 0) out.push({ level: 'error', text: 'Keine Einzugsgebietsfläche definiert.' })
        if (effectiveK.value <= 0) out.push({ level: 'error', text: 'Speicherkoeffizient k ist 0 – entweder Tc ermitteln (Fließlänge und Δh) oder k von Hand setzen.' })
        if (!Number.isInteger(params.value.n) || params.value.n < 1) out.push({ level: 'error', text: 'Die Kaskadenzahl n muss eine ganze Zahl >= 1 sein.' })
        // beide Größen in l/s – der Vergleich war vorher gar nicht vorhanden
        if (baseFlowLs.value > 0 && params.value.qDr <= baseFlowLs.value) {
            out.push({ level: 'error', text: `Drossel ${params.value.qDr} l/s <= Basisabfluss ${baseFlowLs.value.toFixed(1)} l/s – das Becken läuft nie leer.` })
        }
        if (params.value.rainType === 'euler2' && !kostraData.value) {
            out.push({ level: 'error', text: 'Euler-II-Modellregen benötigt geladene KOSTRA-Daten.' })
        }
        return out
    })

    const mapStyles = computed(() =>
        areas.value.map(a => ({ id: a.id, color: getColorForCN(a.cn) }))
    )

    function getColorForCN(cn) {
        if (cn >= 90) return '#e74c3c'
        if (cn >= 70) return '#e67e22'
        return '#2ecc71'
    }

    /**
     * Für die Grafik ausgedünnte Ganglinie – das Rechenfenster kann mehrere
     * zehntausend Schritte haben, Chart.js soll die nicht alle zeichnen.
     * Der Scheitel bleibt in jedem Fall erhalten.
     */
    const chartSeries = computed(() => {
        const hg = results.value.hydrograph
        if (hg.length <= 1200) return hg
        const stride = Math.ceil(hg.length / 1200)
        const out = []
        let peakIdx = 0
        for (let i = 1; i < hg.length; i++) if (hg[i].Q > hg[peakIdx].Q) peakIdx = i
        for (let i = 0; i < hg.length; i += stride) out.push(hg[i])
        if (!out.includes(hg[peakIdx])) {
            out.push(hg[peakIdx])
            out.sort((a, b) => a.t - b.t)
        }
        if (out[out.length - 1] !== hg[hg.length - 1]) out.push(hg[hg.length - 1])
        return out
    })

    /** KOSTRA-Niederschlagshöhen (mm) je Dauerstufe für den Euler-II-Regen. */
    const kostraHeights = computed(() => {
        if (!kostraData.value) return null
        const out = {}
        for (const key of Object.keys(kostraData.value)) {
            const d = Number(key)
            const h = kostraData.value[key]?.[KOSTRA_HEIGHT_KEY]
            if (Number.isFinite(d) && Number.isFinite(h)) out[d] = h
        }
        return Object.keys(out).length ? out : null
    })

    /** Schwerpunkt des Gebiets – für die KOSTRA-Abfrage besser als die Kartenmitte. */
    const referencePoint = computed(() => {
        if (riverCoords.value) {
            const [a, b] = [riverCoords.value.start, riverCoords.value.end]
            return { lat: (a[0] + b[0]) / 2, lng: (a[1] + b[1]) / 2 }
        }
        return null
    })

    // --- ACTIONS ---

    function setNotice(text, level = 'info') {
        notice.value = text ? { text, level } : null
    }

    function updateRiver(lengthMeters, coords, id = null, path = null) {
        if (id && riverId.value && id !== riverId.value) {
            setNotice('Es wird immer die zuletzt gezeichnete Linie als Fluss ausgewertet.', 'warn')
        }
        riverLength.value = lengthMeters
        if (coords) riverCoords.value = coords
        if (path) riverPath.value = path
        if (id) riverId.value = id
        if (lengthMeters > 0) {
            params.value.Lf = parseFloat((lengthMeters / 1000).toFixed(3))
        }
    }

    /** Setzt den Fluss zurück – wurde beim Löschen auf der Karte bisher nie aufgerufen. */
    function clearRiver() {
        riverLength.value = 0
        riverCoords.value = null
        riverPath.value = null
        riverId.value = null
        params.value.Lf = 0
    }

    function addOrUpdateArea(id, name, areaSqM, cn = 60) {
        const existing = areas.value.find(a => a.id === id)
        if (existing) {
            // cn bewusst NICHT überschreiben: der Nutzer pflegt ihn im Panel,
            // eine Geometrieänderung auf der Karte darf ihn nicht zurücksetzen
            existing.area = areaSqM
            if (name) existing.name = name
        } else {
            areas.value.push({ id, name, area: areaSqM, cn })
        }
    }

    function removeArea(id) {
        const idx = areas.value.findIndex(a => a.id === id)
        if (idx !== -1) areas.value.splice(idx, 1)
    }

    /** Ein Layer wurde auf der Karte gelöscht – kann Fläche ODER Fluss sein. */
    function removeFeature(id) {
        if (id && id === riverId.value) {
            clearRiver()
            setNotice('Fluss gelöscht – Fließlänge und Tc zurückgesetzt.', 'info')
            return
        }
        removeArea(id)
    }

    async function fetchKostra(lat, lng) {
        isLoadingKostra.value = true
        try {
            const data = await KostraApiService.fetchRainData(lat, lng)
            if (!data.raw) {
                throw new Error('KOSTRA liefert für diesen Punkt keine Daten (vermutlich außerhalb Deutschlands).')
            }
            kostraData.value = data.raw
            kostraLocation.value = { lat, lng }
            updatePFromKostra()
        } catch (e) {
            console.error(e)
            throw new Error(e.message || 'Fehler beim Laden der KOSTRA-Daten')
        } finally {
            isLoadingKostra.value = false
        }
    }

    function updatePFromKostra() {
        if (!kostraData.value) return
        const row = kostraData.value[String(params.value.D)]
        const h = row?.[KOSTRA_HEIGHT_KEY]
        if (Number.isFinite(h)) {
            params.value.P = h
        } else {
            setNotice(`KOSTRA enthält für die Dauerstufe ${params.value.D} min keinen Wert – P bleibt unverändert.`, 'warn')
        }
    }

    async function fetchElevation() {
        if (!riverCoords.value) {
            throw new Error('Zuerst den Flusslauf zeichnen.')
        }

        isLoadingElevation.value = true
        try {
            // Alle Stützpunkte abfragen, damit ein Zwischenhoch nicht übersehen wird
            const path = riverPath.value?.length >= 2
                ? riverPath.value
                : [riverCoords.value.start, riverCoords.value.end]
            const coords = path.map(p => ({ lat: p[0], lng: p[1] }))

            const elevations = await ElevationService.getElevations(coords)
            if (!Array.isArray(elevations) || elevations.length < 2) {
                throw new Error('Der Höhendienst hat keine verwertbaren Daten geliefert.')
            }

            const h1 = elevations[0]
            const h2 = elevations[elevations.length - 1]
            const hMax = Math.max(...elevations)
            const hMin = Math.min(...elevations)
            const diff = Math.abs(h1 - h2)

            params.value.deltaH = parseFloat(diff.toFixed(2))

            // Fließrichtung / Zwischenhoch melden statt still zu mitteln
            let hint = null
            if (h2 > h1) hint = 'Der Endpunkt liegt höher als der Startpunkt – Linie vermutlich gegen die Fließrichtung gezeichnet.'
            else if (hMax > Math.max(h1, h2) + 1) hint = `Zwischen den Endpunkten liegt ein Hochpunkt (${hMax.toFixed(1)} m) – die Linie folgt möglicherweise keinem durchgehenden Gerinne.`
            if (hint) setNotice(hint, 'warn')

            return { h1, h2, diff, hMin, hMax, points: elevations.length }
        } catch (e) {
            console.error(e)
            throw new Error(e.message || 'Fehler beim Laden der Höhendaten')
        } finally {
            isLoadingElevation.value = false
        }
    }

    /**
     * Grobe Einzugsgebietsschätzung nach Hack's Law: A [km²] = (L [km] / 1,4)^1,66.
     *
     * Der Pufferradius wird exakt aus der Pufferfläche gelöst
     * (A = 2·r·L + π·r²  ->  r = (−L + sqrt(L² + π·A)) / π).
     * Vorher wurde r = A/(2L) gesetzt, was die runden Endkappen ignoriert:
     * die tatsächlich gezeichnete Fläche war je nach Länge 16–45 % größer als
     * der Wert, den Hack's Law liefert – und genau die gezeichnete Fläche wird
     * über die Karte wieder in den Store zurückgeschrieben.
     */
    function estimateCatchmentArea() {
        if (riverLength.value <= 0 || !riverCoords.value) return null

        const L_km = riverLength.value / 1000
        const A_km2 = Math.pow(L_km / 1.4, 1.66)
        const r_km = (-L_km + Math.sqrt(L_km * L_km + Math.PI * A_km2)) / Math.PI

        const path = riverPath.value?.length >= 2
            ? riverPath.value
            : [riverCoords.value.start, riverCoords.value.end]

        const lineString = {
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'LineString',
                coordinates: path.map(p => [p[1], p[0]]) // [lng, lat]
            }
        }

        const buffered = buffer(lineString, r_km, { units: 'kilometers' })
        if (!buffered) return null

        const id = crypto.randomUUID()
        const name = 'Geschätztes EZG (Hack\'s Law)'
        addOrUpdateArea(id, name, A_km2 * 1e6, 60)

        buffered.id = id
        buffered.properties = { ...buffered.properties, name, cn: 60 }

        setNotice(`EZG geschätzt: ${A_km2.toFixed(2)} km² (Hack's Law, Streubreite Faktor 2–3 – bitte prüfen).`, 'warn')
        return buffered
    }

    /** Eingaben für den Rechenkern zusammenstellen. */
    function buildScenarioInput(overrides = {}) {
        return {
            P_mm: params.value.P,
            D_min: params.value.D,
            areas: areas.value.map(a => ({ id: a.id, name: a.name, area: a.area, cn: a.cn })),
            amc: params.value.amc,
            iaRatio: params.value.iaRatio,
            arf: params.value.arf,
            rainType: params.value.rainType,
            kostraHeights: kostraHeights.value,
            k_h: effectiveK.value,
            n: params.value.n,
            qBase_lskm2: params.value.qBase,
            qDr_ls: params.value.qDr,
            Lf: params.value.Lf,
            deltaH: params.value.deltaH,
            ...overrides
        }
    }

    function calculate() {
        durationSweep.value = null
        try {
            const r = runFloodWaveScenario(buildScenarioInput())
            results.value = {
                qMax: r.qMax,
                vReq: r.vReq,
                hydrograph: r.hydrograph,
                warnings: r.warnings,
                error: null,
                detail: r
            }
        } catch (e) {
            results.value = { ...emptyResults(), error: e.message }
        }
        return results.value
    }

    /** Alle KOSTRA-Dauerstufen durchrechnen und die maßgebende bestimmen. */
    function sweepDurations() {
        if (!kostraData.value) {
            throw new Error('Für die Dauerstufensuche müssen zuerst KOSTRA-Daten geladen werden.')
        }
        isSweeping.value = true
        try {
            const base = buildScenarioInput()
            delete base.P_mm
            delete base.D_min
            durationSweep.value = findGoverningDuration(base, kostraData.value, KOSTRA_HEIGHT_KEY)
            return durationSweep.value
        } finally {
            isSweeping.value = false
        }
    }

    /** Eine Dauerstufe aus dem Sweep übernehmen und neu rechnen. */
    function applyDuration(D_min) {
        params.value.D = D_min
        updatePFromKostra()
        return calculate()
    }

    // Beim Wechsel der Dauerstufe P nachziehen
    watch(() => params.value.D, () => updatePFromKostra())

    // n ganzzahlig halten – die Kaskade ist nur für ganze Speicher definiert
    watch(() => params.value.n, (v) => {
        if (Number.isFinite(v) && !Number.isInteger(v)) {
            params.value.n = Math.max(1, Math.round(v))
        }
    })

    return {
        params,
        riverLength,
        riverCoords,
        riverId,
        riverPath,
        areas,
        results,
        durationSweep,
        isLoadingKostra,
        isLoadingElevation,
        isSweeping,
        kostraData,
        kostraLocation,
        kostraHeights,
        notice,
        availableDurations,
        tcResult,
        tcWarning,
        suggestedK,
        effectiveK,
        totalArea,
        weightedCN,
        baseFlowLs,
        inputIssues,
        mapStyles,
        chartSeries,
        referencePoint,
        setNotice,
        updateRiver,
        clearRiver,
        addOrUpdateArea,
        removeArea,
        removeFeature,
        fetchKostra,
        fetchElevation,
        calculate,
        sweepDurations,
        applyDuration,
        estimateCatchmentArea
    }
})
