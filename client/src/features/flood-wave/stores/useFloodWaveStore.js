import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { KostraApiService } from '../../kostra/services/KostraApiService'
import { ElevationService } from '@/services/ElevationService'
import { HydrologyCalculator } from '../utils/HydrologyCalculator'
import buffer from '@turf/buffer'

export const useFloodWaveStore = defineStore('floodWave', () => {
    // --- STATE ---
    const params = ref({
        Lf: 0, // km
        deltaH: 10, // m
        P: 50, // mm
        D: 60, // min
        qBase: 20, // l/s*km2
        k: 1, // h
        n: 2, // reservoirs
        qDr: 10 // l/s
    })

    const riverLength = ref(0) // meters
    const riverCoords = ref(null) // { start: [lat, lng], end: [lat, lng] }

    const areas = ref([]) // { id, name, area, cn }

    const results = ref({
        qMax: 0,
        vReq: 0,
        hydrograph: []
    })

    const isLoadingKostra = ref(false)
    const isLoadingElevation = ref(false)
    const kostraData = ref(null)

    const availableDurations = [
        5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 540, 720,
        1080, 1440, 2880, 4320, 5760, 7200, 8640, 10080
    ]

    // --- COMPUTED ---
    const tcResult = computed(() => {
        return HydrologyCalculator.calculateTc(params.value.Lf, params.value.deltaH)
    })

    const totalArea = computed(() => areas.value.reduce((sum, a) => sum + a.area, 0))

    const weightedCN = computed(() => {
        if (totalArea.value === 0) return 0
        const sumProduct = areas.value.reduce((sum, a) => sum + (a.area * a.cn), 0)
        return sumProduct / totalArea.value
    })

    const mapStyles = computed(() => {
        return areas.value.map(a => ({
            id: a.id,
            color: getColorForCN(a.cn)
        }))
    })

    function getColorForCN(cn) {
        if (cn >= 90) return '#e74c3c'
        if (cn >= 70) return '#e67e22'
        return '#2ecc71'
    }

    // --- ACTIONS ---

    function updateRiver(lengthMeters, coords) {
        riverLength.value = lengthMeters
        if (coords) {
            riverCoords.value = coords
        }
        // Auto-update Lf
        if (lengthMeters > 0) {
            params.value.Lf = parseFloat((lengthMeters / 1000).toFixed(3))
        }
    }

    function addOrUpdateArea(id, name, areaSqM, cn = 60) {
        const existing = areas.value.find(a => a.id === id)
        if (existing) {
            existing.area = areaSqM
        } else {
            areas.value.push({
                id,
                name,
                area: areaSqM,
                cn
            })
        }
    }

    function removeArea(id) {
        const idx = areas.value.findIndex(a => a.id === id)
        if (idx !== -1) areas.value.splice(idx, 1)
    }

    async function fetchKostra(lat, lng) {
        isLoadingKostra.value = true
        try {
            const data = await KostraApiService.fetchRainData(lat, lng)
            kostraData.value = data.raw
            updatePFromKostra()
        } catch (e) {
            console.error(e)
            throw new Error('Fehler beim Laden der KOSTRA Daten')
        } finally {
            isLoadingKostra.value = false
        }
    }

    function updatePFromKostra() {
        if (!kostraData.value) return
        const key = String(params.value.D)
        if (kostraData.value[key]) {
            params.value.P = kostraData.value[key].HN_100A
        }
    }

    async function fetchElevation() {
        if (!riverCoords.value) return

        isLoadingElevation.value = true
        try {
            const coords = [
                { lat: riverCoords.value.start[0], lng: riverCoords.value.start[1] },
                { lat: riverCoords.value.end[0], lng: riverCoords.value.end[1] }
            ]

            const elevations = await ElevationService.getElevations(coords)
            if (elevations.length === 2) {
                const h1 = elevations[0]
                const h2 = elevations[1]
                const diff = Math.abs(h1 - h2)

                params.value.deltaH = parseFloat(diff.toFixed(2))
                return { h1, h2, diff }
            }
        } catch (e) {
            console.error(e)
            throw new Error('Fehler beim Laden der Höhendaten')
        } finally {
            isLoadingElevation.value = false
        }
    }

    function estimateCatchmentArea() {
        if (riverLength.value === 0 || !riverCoords.value) return null

        // Hack's Law: A = C * L^n
        // Standard: A (km2) = (L (km) / 1.4)^1.66
        // L is in km
        const L_km = riverLength.value / 1000
        const A_km2 = Math.pow(L_km / 1.4, 1.66)

        // Create a buffer that approximates this area
        // Buffer area approx: 2 * radius * L
        // So radius (km) = A / (2 * L)
        // radius (m) = (A * 1e6) / (2 * riverLength)
        // This is a rough approximation for a line buffer

        const radius_m = (A_km2 * 1e6) / (2 * riverLength.value)
        const radius_km = radius_m / 1000

        // We need the GeoJSON of the river.
        // We don't have it stored directly, only coords.
        // Reconstruct LineString
        const lineString = {
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'LineString',
                coordinates: [
                    [riverCoords.value.start[1], riverCoords.value.start[0]], // lng, lat
                    [riverCoords.value.end[1], riverCoords.value.end[0]]      // lng, lat
                ]
            }
        }

        const buffered = buffer(lineString, radius_km, { units: 'kilometers' })

        // Add to areas
        const id = crypto.randomUUID()
        const name = 'Geschätztes EZG (Hack\'s Law)'
        const areaSqM = A_km2 * 1e6

        addOrUpdateArea(id, name, areaSqM, 60)

        // Attach ID to GeoJSON so BaseMap uses it
        buffered.id = id
        buffered.properties = { ...buffered.properties, name, cn: 60 }

        return buffered // Return so view can add it to map
    }

    function calculate() {
        // Auto-estimate if no areas
        if (areas.value.length === 0 && riverLength.value > 0) {
            estimateCatchmentArea()
        }

        const A_km2 = totalArea.value / 1e6
        const CN = weightedCN.value
        const P = params.value.P
        const Lf = params.value.Lf
        const deltaH = params.value.deltaH

        // 1. Tc
        const Tc = HydrologyCalculator.calculateTc(Lf, deltaH)

        // 2. Effective Rain
        const Pe = HydrologyCalculator.calculateScsRunoff(P, CN)

        // 3. Flood Wave
        const D_h = params.value.D / 60
        const dt = 0.1 // 6 min steps
        const steps = Math.ceil(D_h / dt)
        const rainSeries = []

        // Create block rain
        for (let i = 0; i < steps; i++) {
            rainSeries.push(Pe / steps) // mm per step
        }
        // Add trailing zeros for recession
        for (let i = 0; i < 50; i++) {
            rainSeries.push(0)
        }

        const k = params.value.k || Tc // Fallback
        const n = params.value.n

        const hydrograph = HydrologyCalculator.calculateFloodWave(rainSeries, A_km2, k, n, dt)

        // Add Baseflow
        const Q_base = params.value.qBase * A_km2 / 1000 // l/s -> m3/s
        hydrograph.forEach(pt => pt.Q += Q_base)

        // 4. Max & Volume
        const qMax = Math.max(...hydrograph.map(p => p.Q))

        // Allowed discharge: Q_Dr (l/s) -> m3/s
        const Q_allowed = params.value.qDr / 1000

        console.log('Calculation Debug:', {
            A_km2, CN, P, Pe,
            Q_base: params.value.qBase * A_km2 / 1000,
            qMax,
            Q_allowed,
            hydrographLength: hydrograph.length
        })

        const vReq = HydrologyCalculator.calculateRetentionVolume(hydrograph, Q_allowed, dt)

        console.log('V_req:', vReq)

        results.value = {
            qMax,
            vReq,
            hydrograph
        }
    }

    // Watchers
    watch(() => params.value.D, () => {
        updatePFromKostra()
    })

    return {
        params,
        riverLength,
        riverCoords,
        areas,
        results,
        isLoadingKostra,
        isLoadingElevation,
        availableDurations,
        tcResult,
        totalArea,
        weightedCN,
        mapStyles,
        updateRiver,
        addOrUpdateArea,
        removeArea,
        fetchKostra,
        fetchElevation,
        calculate,
        estimateCatchmentArea
    }
})
