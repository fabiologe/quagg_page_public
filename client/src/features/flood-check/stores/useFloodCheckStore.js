
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
      safetyFactor: 1.15 // f_Z
    }
  })

  const surfaceTypes = [
    // --- CS = 0.2 ---
    { id: 'roof_green_int', name: 'Gründach intensiv (> 30cm)', cs: 0.2, color: '#2ecc71' },
    { id: 'grass_paver_rare', name: 'Rasengitter (wenig befahren)', cs: 0.2, color: '#27ae60' },
    { id: 'sport_grass', name: 'Rasenfläche (Sport)', cs: 0.2, color: '#2ecc71' },
    { id: 'garden_flat', name: 'Garten/Park (flach)', cs: 0.2, color: '#f1c40f' },

    // --- CS = 0.3 ---
    { id: 'gravel_loose', name: 'Lockerer Kies / Schotterrasen', cs: 0.3, color: '#e67e22' },
    { id: 'sport_clay', name: 'Tennenfläche', cs: 0.3, color: '#d35400' },
    { id: 'garden_steep', name: 'Garten/Park (steil)', cs: 0.3, color: '#f39c12' },

    // --- CS = 0.4 ---
    { id: 'roof_green_ext_thick', name: 'Gründach extensiv (> 10cm, ≤ 5°)', cs: 0.4, color: '#16a085' },
    { id: 'paved_drain', name: 'Sicker-/Drainsteine', cs: 0.4, color: '#3498db' },
    { id: 'grass_paver_busy', name: 'Rasengitter (stark befahren)', cs: 0.4, color: '#2980b9' },

    // --- CS = 0.5 ---
    { id: 'roof_green_ext_thin', name: 'Gründach extensiv (< 10cm, ≤ 5°)', cs: 0.5, color: '#1abc9c' },

    // --- CS = 0.6 ---
    { id: 'sport_plastic', name: 'Kunststoffbahn', cs: 0.6, color: '#e74c3c' },

    // --- CS = 0.7 ---
    { id: 'roof_green_ext_steep', name: 'Gründach extensiv (> 5°)', cs: 0.7, color: '#27ae60' },
    { id: 'paved_gap', name: 'Pflaster (Fugen > 15%)', cs: 0.7, color: '#aab7b8' },

    // --- CS = 0.8 ---
    { id: 'roof_gravel', name: 'Kiesdach', cs: 0.8, color: '#bdc3c7' },

    // --- CS = 0.9 ---
    { id: 'paved_sand', name: 'Betonsteinpflaster (in Sand)', cs: 0.9, color: '#95a5a6' },
    { id: 'water_bound', name: 'Wassergebundene Decke', cs: 0.9, color: '#d2b48c' },

    // --- CS = 1.0 ---
    { id: 'roof_sloped_hard', name: 'Schrägdach (Metall/Glas/Faserzement)', cs: 1.0, color: '#c0392b' },
    { id: 'roof_sloped_tile', name: 'Schrägdach (Ziegel/Pappe)', cs: 1.0, color: '#d35400' },
    { id: 'roof_flat_hard', name: 'Flachdach (Metall/Glas)', cs: 1.0, color: '#7f8c8d' },
    { id: 'roof_flat_seal', name: 'Flachdach (Abdichtung)', cs: 1.0, color: '#95a5a6' },
    { id: 'traffic_concrete', name: 'Betonfläche', cs: 1.0, color: '#34495e' },
    { id: 'traffic_asphalt', name: 'Asphalt (Schwarzdecke)', cs: 1.0, color: '#2c3e50' },
    { id: 'traffic_paved_sealed', name: 'Pflaster (Fugenverguss)', cs: 1.0, color: '#57606f' },
    { id: 'ramp', name: 'Rampe zum Gebäude', cs: 1.0, color: '#8e44ad' }
  ]

  async function fetchKostraData(lat, lng) {
    isLoadingKostra.value = true
    try {
      const data = await KostraApiService.fetchRainData(lat, lng)
      rainData.value.r5_2 = data.r5_2
      rainData.value.r5_30 = data.r5_30
      rainData.value.r5_100 = data.r5_100
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

  // 2. Abflusswirksame Fläche (A_u)
  const totalEffectiveArea = computed(() => {
    return surfaces.value.reduce((sum, s) => {
      const type = surfaceTypes.find(t => t.id === s.typeId)
      return sum + (s.area * (type ? type.cs : 1.0))
    }, 0)
  })

  // === FORMEL 20 (Standard) ===
  const volumeIn30 = computed(() => {
    const q_30 = (rainData.value.r5_30 * totalEffectiveArea.value) / 10000 // l/s
    return (q_30 * rainDuration.value * 60) / 1000 // m³
  })

  const volumeOut2 = computed(() => {
    const q_2 = (rainData.value.r5_2 * totalEffectiveArea.value) / 10000 // l/s
    return (q_2 * rainDuration.value * 60) / 1000 // m³
  })

  // 5. Erforderliches Rückhaltevolumen (V_rueck)
  // Differenz zwischen dem was runterkommt (30a) und dem was weg darf (2a)
  const retentionVolumeStandard = computed(() => {
    const vol = volumeIn30.value - volumeOut2.value
    return vol > 0 ? vol : 0
  })

  // 6. Dachflächen-Anteil prüfen (für Notentwässerung)
  const roofAreaPercentage = computed(() => {
    if (totalArea.value === 0) return 0

    // Wir nehmen an, dass 'roof' und 'green_roof' als Dachflächen zählen
    const roofArea = surfaces.value
      .filter(s => s.typeId === 'roof' || s.typeId === 'green_roof')
      .reduce((sum, s) => sum + s.area, 0)

    return (roofArea / totalArea.value) * 100
  })

  // === FORMEL 21 (Hydraulisch) ===
  const retentionVolumeHydraulic = computed(() => {
    if (!additionalCalculations.value.hydraulic.active) return 0

    const qIn = (rainData.value.r5_30 * totalArea.value) / 10000 // l/s (mit A_ges!)
    const qOut = additionalCalculations.value.hydraulic.qVoll
    const vol = (qIn - qOut) * rainDuration.value * 60 / 1000
    return vol > 0 ? vol : 0
  })

  // === FORMEL 22 (Drossel) ===
  const retentionVolumeThrottle = computed(() => {
    if (!additionalCalculations.value.throttle.active) return 0

    const D = rainDuration.value
    const fZ = additionalCalculations.value.throttle.safetyFactor
    const r = rainData.value.r5_30
    const Au = totalEffectiveArea.value
    const qDr = additionalCalculations.value.throttle.qDr

    const vIn = (Au * r / 10000) * D * fZ * 0.06
    const vOut = D * fZ * qDr * 0.06

    const vol = vIn - vOut
    return vol > 0 ? vol : 0
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
    volumeIn30,
    volumeOut2,
    retentionVolumeStandard,
    retentionVolumeHydraulic,
    retentionVolumeThrottle,
    roofAreaPercentage
  }
})