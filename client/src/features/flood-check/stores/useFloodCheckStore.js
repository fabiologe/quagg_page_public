
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { area } from '@turf/area'
import { KostraApiService } from '../../kostra/services/KostraApiService'

export const useFloodCheckStore = defineStore('floodCheck', () => {
  const surfaces = ref([])

  // Globale Einstellungen
  const rainDuration = ref(5) // Minuten (Standard: 5)
  const isLoadingKostra = ref(false)

  // KOSTRA-DWD 2020 Daten
  const rainData = ref({
    raw: null, // Full dataset
    r5_2: 333.0,
    r5_30: 586.0,
    r5_100: 0 // Für Notentwässerung
  })

  // Optionale Berechnungen
  const additionalCalculations = ref({
    hydraulic: {
      active: false,
      qVoll: 0 // l/s
    },
    throttle: {
      active: false,
      qDr: 0, // l/s
      safetyFactor: 1.15, // f_Z
      returnPeriod: 30 // T in Jahren (Default per Audit/User Request likely 30, but configurable)
    }
  })

  // Surface Types with Mean Runoff Coefficient (cm)
  const surfaceTypes = [
    // --- CS = 0.2 ---
    { id: 'roof_green_int', name: 'Gründach intensiv (> 30cm)', cs: 0.2, cm: 0.2, color: '#2ecc71' },
    { id: 'grass_paver_rare', name: 'Rasengitter (wenig befahren)', cs: 0.2, cm: 0.2, color: '#27ae60' },
    { id: 'sport_grass', name: 'Rasenfläche (Sport)', cs: 0.2, cm: 0.2, color: '#2ecc71' },
    { id: 'garden_flat', name: 'Garten/Park (flach)', cs: 0.2, cm: 0.2, color: '#f1c40f' },

    // --- CS = 0.3 ---
    { id: 'gravel_loose', name: 'Lockerer Kies / Schotterrasen', cs: 0.3, cm: 0.3, color: '#e67e22' },
    { id: 'sport_clay', name: 'Tennenfläche', cs: 0.3, cm: 0.3, color: '#d35400' },
    { id: 'garden_steep', name: 'Garten/Park (steil)', cs: 0.3, cm: 0.3, color: '#f39c12' },

    // --- CS = 0.4 ---
    { id: 'roof_green_ext_thick', name: 'Gründach extensiv (> 10cm, ≤ 5°)', cs: 0.4, cm: 0.4, color: '#16a085' },
    { id: 'paved_drain', name: 'Sicker-/Drainsteine', cs: 0.4, cm: 0.4, color: '#3498db' },
    { id: 'grass_paver_busy', name: 'Rasengitter (stark befahren)', cs: 0.4, cm: 0.4, color: '#2980b9' },

    // --- CS = 0.5 ---
    { id: 'roof_green_ext_thin', name: 'Gründach extensiv (< 10cm, ≤ 5°)', cs: 0.5, cm: 0.5, color: '#1abc9c' },

    // --- CS = 0.6 ---
    { id: 'sport_plastic', name: 'Kunststoffbahn', cs: 0.6, cm: 0.6, color: '#e74c3c' },

    // --- CS = 0.7 ---
    { id: 'roof_green_ext_steep', name: 'Gründach extensiv (> 5°)', cs: 0.7, cm: 0.7, color: '#27ae60' },
    { id: 'paved_gap', name: 'Pflaster (Fugen > 15%)', cs: 0.7, cm: 0.7, color: '#aab7b8' },

    // --- CS = 0.8 ---
    { id: 'roof_gravel', name: 'Kiesdach', cs: 0.8, cm: 0.8, color: '#bdc3c7' },

    // --- CS = 0.9 ---
    { id: 'paved_sand', name: 'Betonsteinpflaster (in Sand)', cs: 0.9, cm: 0.9, color: '#95a5a6' },
    { id: 'water_bound', name: 'Wassergebundene Decke', cs: 0.9, cm: 0.9, color: '#d2b48c' },

    // --- CS = 1.0 ---
    { id: 'roof_sloped_hard', name: 'Schrägdach (Metall/Glas/Faserzement)', cs: 1.0, cm: 0.95, color: '#c0392b' },
    { id: 'roof_sloped_tile', name: 'Schrägdach (Ziegel/Pappe)', cs: 1.0, cm: 0.9, color: '#d35400' },
    { id: 'roof_flat_hard', name: 'Flachdach (Metall/Glas)', cs: 1.0, cm: 0.95, color: '#7f8c8d' },
    { id: 'roof_flat_seal', name: 'Flachdach (Abdichtung)', cs: 1.0, cm: 0.9, color: '#95a5a6' },
    { id: 'traffic_concrete', name: 'Betonfläche', cs: 1.0, cm: 0.9, color: '#34495e' },
    { id: 'traffic_asphalt', name: 'Asphalt (Schwarzdecke)', cs: 1.0, cm: 0.9, color: '#2c3e50' },
    { id: 'traffic_paved_sealed', name: 'Pflaster (Fugenverguss)', cs: 1.0, cm: 0.9, color: '#57606f' },
    { id: 'ramp', name: 'Rampe zum Gebäude', cs: 1.0, cm: 1.0, color: '#8e44ad' }
  ]

  async function fetchKostraData(lat, lng) {
    isLoadingKostra.value = true
    try {
      const data = await KostraApiService.fetchRainData(lat, lng)
      rainData.value.r5_2 = data.r5_2
      rainData.value.r5_30 = data.r5_30
      rainData.value.r5_100 = data.r5_100
      rainData.value.raw = data.raw // Store full dataset
    } catch (error) {
      console.error(error)
      alert('Fehler beim Laden der KOSTRA-Daten. Bitte prüfen Sie Ihre Internetverbindung.')
    } finally {
      isLoadingKostra.value = false
    }
  }

  function addOrUpdateSurface(feature) {
    if (!feature) return
    const areaVal = Math.round(area(feature) * 100) / 100

    const index = surfaces.value.findIndex(s => s.id === feature.id)
    const defaultType = surfaceTypes[0]

    // Check for imported properties
    const importedName = feature.properties?.name
    const importedType = feature.properties?.type // typeId from export

    // Validate imported type
    const isValidType = importedType && surfaceTypes.some(t => t.id === importedType)

    const newSurface = {
      id: feature.id,
      area: areaVal,
      typeId: index > -1 ? surfaces.value[index].typeId : (isValidType ? importedType : defaultType.id),
      name: index > -1 ? surfaces.value[index].name : (importedName || `Fläche ${surfaces.value.length + 1}`)
    }

    if (index > -1) {
      surfaces.value[index] = newSurface
    } else {
      surfaces.value.push(newSurface)
    }
  }

  function removeSurface(id) {
    surfaces.value = surfaces.value.filter(s => s.id !== id)
  }

  // --- BERECHNUNGEN ---

  // 1. Gesamtfläche (A_ges)
  const totalArea = computed(() => {
    return surfaces.value.reduce((sum, s) => sum + s.area, 0)
  })

  // 2. Abflusswirksame Fläche (A_u) -> Cs
  const totalEffectiveArea = computed(() => {
    return surfaces.value.reduce((sum, s) => {
      const type = surfaceTypes.find(t => t.id === s.typeId)
      return sum + (s.area * (type ? type.cs : 1.0))
    }, 0)
  })

  // 2b. Mittlere Abflusswirksame Fläche (A_u_mean) -> Cm
  const totalEffectiveAreaMean = computed(() => {
    return surfaces.value.reduce((sum, s) => {
      const type = surfaceTypes.find(t => t.id === s.typeId)
      return sum + (s.area * (type ? type.cm : 1.0))
    }, 0)
  })

  const availableDurations = computed(() => {
    if (!rainData.value.raw) return []
    // Extract keys that are numbers
    return Object.keys(rainData.value.raw)
      .map(k => parseInt(k))
      .filter(k => !isNaN(k))
      .sort((a, b) => a - b)
  })

  // Helper: Get Rain Intensity r(D, T)
  function getRainIntensity(duration, returnPeriod) {
    if (!rainData.value.raw) return 0
    const row = rainData.value.raw[duration.toString()]
    if (!row) return 0

    // Map return period to field name
    // KOSTRA standard keys: RN_001A, RN_002A, RN_005A, RN_010A, RN_020A, RN_030A, RN_050A, RN_100A
    // Careful with number formatting (005 vs 5?) - Usually 3 digits.
    const tMap = {
      1: 'RN_001A',
      2: 'RN_002A',
      3: 'RN_003A', // Sometimes exists
      5: 'RN_005A',
      10: 'RN_010A',
      20: 'RN_020A',
      30: 'RN_030A',
      50: 'RN_050A',
      100: 'RN_100A'
    }

    const key = tMap[returnPeriod]
    if (!key) return 0

    return row[key] || 0
  }

  // === FORMEL 20 (Standard) ===
  // Berechnet das maßgebende Volumen aus den Dauerstufen 5, 10, 15 min
  const standardCheckDetails = computed(() => {
    if (!rainData.value.raw) return []

    return [5, 10, 15].map(D => {
      const r30 = getRainIntensity(D, 30)
      const r2 = getRainIntensity(D, 2)

      const qIn = (r30 * totalEffectiveArea.value) / 10000
      const qOut = (r2 * totalEffectiveArea.value) / 10000

      const vIn = qIn * D * 60 / 1000
      const vOut = qOut * D * 60 / 1000
      const vol = vIn - vOut

      return {
        duration: D,
        inflow: vIn,
        outflow: vOut,
        volume: vol > 0 ? vol : 0,
        r30,
        r2
      }
    })
  })

  const standardCheckResult = computed(() => {
    if (standardCheckDetails.value.length === 0) return { volume: 0, inflow: 0, outflow: 0, duration: 5 }

    // Find max volume
    return standardCheckDetails.value.reduce((max, curr) => {
      return curr.volume > max.volume ? curr : max
    }, standardCheckDetails.value[0])
  })

  // Exposed for UI/PDF - consistently returns values from the critical duration
  const retentionVolumeStandard = computed(() => {
    return standardCheckResult.value.volume > 0 ? standardCheckResult.value.volume : 0
  })

  const volumeIn30 = computed(() => standardCheckResult.value.inflow)
  const volumeOut2 = computed(() => standardCheckResult.value.outflow)

  // 6. Dachflächen-Anteil prüfen (für Notentwässerung)
  const roofAreaPercentage = computed(() => {
    if (totalArea.value === 0) return 0
    const roofArea = surfaces.value
      .filter(s => s.typeId.includes('roof'))
      .reduce((sum, s) => sum + s.area, 0)
    return (roofArea / totalArea.value) * 100
  })

  // === FORMEL 21 (Hydraulisch) ===
  const hydraulicCheckDetails = computed(() => {
    if (!additionalCalculations.value.hydraulic.active) return []
    if (!rainData.value.raw) return []

    const qVoll = additionalCalculations.value.hydraulic.qVoll

    // RESTRICTED to 5, 10, 15 as per standard
    return [5, 10, 15].map(D => {
      const r30 = getRainIntensity(D, 30) // Assuming T=30 for standard hydraulic check input? Or configurable? 
      // Usually DIN 1986-100 uses T=30 (or T=5/20 depends on location).
      // We'll stick to 30 for now as previously implemented.
      const qIn = (r30 * totalEffectiveArea.value) / 10000 // l/s
      let vol = (qIn - qVoll) * D * 60 / 1000
      if (vol < 0) vol = 0

      return {
        duration: D,
        volume: vol,
        inflow: qIn * D * 60 / 1000,
        outflow: qVoll * D * 60 / 1000
      }
    })
  })

  const retentionVolumeHydraulic = computed(() => {
    if (hydraulicCheckDetails.value.length === 0) return 0

    // Max volume
    const max = hydraulicCheckDetails.value.reduce((currMax, item) => item.volume > currMax.volume ? item : currMax, hydraulicCheckDetails.value[0])
    return max.volume
  })

  // === FORMEL 22 (Drossel / RRR) ===
  const throttleCheckDetails = computed(() => {
    if (!additionalCalculations.value.throttle.active) return []
    if (!rainData.value.raw) return []

    const qDr = additionalCalculations.value.throttle.qDr
    const fZ = additionalCalculations.value.throttle.safetyFactor
    const T = additionalCalculations.value.throttle.returnPeriod || 30 // User selected T
    const Au_mean = totalEffectiveAreaMean.value

    // EXTENDED: Iterate over ALL available durations
    return availableDurations.value.map(D => {
      const r = getRainIntensity(D, T)

      const qIn_l_s = (Au_mean * r) / 10000
      const diff_l_s = qIn_l_s - qDr
      let vol = diff_l_s * D * 60 * fZ / 1000
      if (vol < 0) vol = 0

      // Calculate Transparency Values (including fZ)
      const inflowDisp = (qIn_l_s * D * 60 * fZ) / 1000
      const outflowDisp = (qDr * D * 60 * fZ) / 1000

      return {
        duration: D,
        volume: vol,
        inflow: inflowDisp,
        outflow: outflowDisp,
        r
      }
    })
  })

  const retentionVolumeThrottle = computed(() => {
    if (throttleCheckDetails.value.length === 0) return 0

    const max = throttleCheckDetails.value.reduce((currMax, item) => item.volume > currMax.volume ? item : currMax, throttleCheckDetails.value[0])
    return max.volume
  })

  return {
    surfaces,
    surfaceTypes,
    rainData,
    rainDuration,
    isLoadingKostra,
    additionalCalculations,
    addOrUpdateSurface,
    removeSurface,
    fetchKostraData,
    totalArea,
    totalEffectiveArea,
    totalEffectiveAreaMean,
    volumeIn30,
    volumeOut2,
    retentionVolumeStandard,
    retentionVolumeHydraulic,
    retentionVolumeThrottle,
    roofAreaPercentage,
    availableDurations,
    standardCheckDetails,
    hydraulicCheckDetails,
    throttleCheckDetails
  }
})