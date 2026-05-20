import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useBridgeHydraulics } from '../composables/useBridgeHydraulics.js'

const STORAGE_KEY = 'bridgeHydraulics_v2'
const PROJECT_FORMAT = 'BrueckenHydraulik'
const PROJECT_VERSION = 1
const MAX_HISTORY = 60

// ─── Vorgabewerte (realistisches Standardbeispiel) ─────────────────────────
const DEFAULT_TERRAIN = [
  { x: -24, z: 5 }, { x: -5, z: 0 }, { x: 5, z: 0 }, { x: 24, z: 5 }
]
const DEFAULT_BUK = [
  { x: -15, z: 5 }, { x: 15, z: 5 }
]
const DEFAULT_BOK = [
  { x: -15, z: 6.2 }, { x: 15, z: 6.2 }
]
const DEFAULT_KST_ZONES = [
  { id: 'z0', xLeft: null, xRight: null, kst: 40, color: '#3b82f6', label: 'Hauptgerinne' }
]

const ZONE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16']

export const useBridgeStore = defineStore('bridgeHydraulics', () => {
  const { calculateAtWSP, generateRatingCurve } = useBridgeHydraulics()

  // ─── Querschnitt-Profile ─────────────────────────────────────────────────
  const terrainPoints = ref(DEFAULT_TERRAIN.map(p => ({ ...p })))
  const bukProfile    = ref(DEFAULT_BUK.map(p => ({ ...p })))
  const bokProfile    = ref(DEFAULT_BOK.map(p => ({ ...p })))

  // ─── kSt-Zonen ───────────────────────────────────────────────────────────
  const kstZones = ref(DEFAULT_KST_ZONES.map(z => ({ ...z })))

  // ─── Hydraulische Parameter ───────────────────────────────────────────────
  const slope       = ref(0.001)
  const wsp         = ref(5.0)
  const wspMin      = ref(0.5)
  const wspMax      = ref(8.0)
  const ratingSteps = ref(30)

  // ─── Berechnungsparameter ─────────────────────────────────────────────────
  const calcParams = computed(() => ({
    crossSectionPoints: terrainPoints.value,
    bukProfile: bukProfile.value.length >= 2 ? bukProfile.value : null,
    bokProfile: bokProfile.value.length >= 2 ? bokProfile.value : null,
    kstZones: kstZones.value,
    slope: slope.value
  }))

  const currentResult = computed(() =>
    calculateAtWSP({ ...calcParams.value, wsp: wsp.value })
  )

  const ratingCurve = computed(() =>
    generateRatingCurve(calcParams.value, wspMin.value, wspMax.value, ratingSteps.value)
  )

  // ─── History (Undo / Redo) ────────────────────────────────────────────────
  const historyStack = ref([])   // JSON-Strings
  const historyIdx   = ref(-1)
  let   historyTimer = null

  const canUndo = computed(() => historyIdx.value > 0)
  const canRedo = computed(() => historyIdx.value < historyStack.value.length - 1)

  function _stateJson() {
    return JSON.stringify({
      terrainPoints: terrainPoints.value,
      bukProfile:    bukProfile.value,
      bokProfile:    bokProfile.value,
      kstZones:      kstZones.value,
      slope: slope.value, wsp: wsp.value,
      wspMin: wspMin.value, wspMax: wspMax.value,
      ratingSteps: ratingSteps.value
    })
  }

  function _applyJson(json) {
    const s = JSON.parse(json)
    terrainPoints.value = s.terrainPoints ?? terrainPoints.value
    bukProfile.value    = s.bukProfile    ?? bukProfile.value
    bokProfile.value    = s.bokProfile    ?? bokProfile.value
    kstZones.value      = s.kstZones      ?? kstZones.value
    if (s.slope       != null) slope.value       = s.slope
    if (s.wsp         != null) wsp.value         = s.wsp
    if (s.wspMin      != null) wspMin.value      = s.wspMin
    if (s.wspMax      != null) wspMax.value      = s.wspMax
    if (s.ratingSteps != null) ratingSteps.value = s.ratingSteps
  }

  function _pushHistory(snap) {
    // Drop any redo branch
    historyStack.value = historyStack.value.slice(0, historyIdx.value + 1)
    if (historyStack.value[historyIdx.value] === snap) return  // no change
    historyStack.value.push(snap)
    if (historyStack.value.length > MAX_HISTORY) historyStack.value.shift()
    historyIdx.value = historyStack.value.length - 1
  }

  function undo() {
    clearTimeout(historyTimer)
    if (!canUndo.value) return
    historyIdx.value--
    const snap = historyStack.value[historyIdx.value]
    _applyJson(snap)
    try { localStorage.setItem(STORAGE_KEY, snap) } catch { /* ignore */ }
  }

  function redo() {
    clearTimeout(historyTimer)
    if (!canRedo.value) return
    historyIdx.value++
    const snap = historyStack.value[historyIdx.value]
    _applyJson(snap)
    try { localStorage.setItem(STORAGE_KEY, snap) } catch { /* ignore */ }
  }

  // ─── Persistenz ───────────────────────────────────────────────────────────
  function save() {
    const snap = _stateJson()
    try { localStorage.setItem(STORAGE_KEY, snap) } catch { /* ignore */ }
    // Debounce history push so rapid drag calls produce one entry
    clearTimeout(historyTimer)
    historyTimer = setTimeout(() => _pushHistory(snap), 450)
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      if (s.terrainPoints?.length >= 2) terrainPoints.value = s.terrainPoints
      if (s.bukProfile?.length >= 2)    bukProfile.value    = s.bukProfile
      if (s.bokProfile?.length >= 2)    bokProfile.value    = s.bokProfile
      if (s.kstZones?.length >= 1)      kstZones.value      = s.kstZones
      if (s.slope       != null) slope.value       = s.slope
      if (s.wsp         != null) wsp.value         = s.wsp
      if (s.wspMin      != null) wspMin.value      = s.wspMin
      if (s.wspMax      != null) wspMax.value      = s.wspMax
      if (s.ratingSteps != null) ratingSteps.value = s.ratingSteps
    } catch { /* ignore */ }
    // Seed history with current (loaded) state
    _pushHistory(_stateJson())
  }

  function resetToDefault() {
    terrainPoints.value = DEFAULT_TERRAIN.map(p => ({ ...p }))
    bukProfile.value    = DEFAULT_BUK.map(p => ({ ...p }))
    bokProfile.value    = DEFAULT_BOK.map(p => ({ ...p }))
    kstZones.value      = DEFAULT_KST_ZONES.map(z => ({ ...z }))
    slope.value = 0.001; wsp.value = 5.0; wspMin.value = 0.5; wspMax.value = 8.0
    save()
  }

  // ─── Projekt Export / Import ─────────────────────────────────────────────
  function exportProject() {
    return JSON.stringify({
      format:  PROJECT_FORMAT,
      version: PROJECT_VERSION,
      terrainPoints: terrainPoints.value,
      bukProfile:    bukProfile.value,
      bokProfile:    bokProfile.value,
      kstZones:      kstZones.value,
      slope: slope.value, wsp: wsp.value,
      wspMin: wspMin.value, wspMax: wspMax.value,
      ratingSteps: ratingSteps.value
    }, null, 2)
  }

  function importProject(jsonString) {
    const s = JSON.parse(jsonString)
    if (s.format !== PROJECT_FORMAT)
      throw new Error(`Unbekanntes Format: "${s.format}" — erwartet "${PROJECT_FORMAT}"`)
    if (s.terrainPoints?.length >= 2) terrainPoints.value = s.terrainPoints
    if (s.bukProfile?.length >= 2)    bukProfile.value    = s.bukProfile
    if (s.bokProfile?.length >= 2)    bokProfile.value    = s.bokProfile
    if (s.kstZones?.length >= 1)      kstZones.value      = s.kstZones
    if (s.slope       != null) slope.value       = s.slope
    if (s.wsp         != null) wsp.value         = s.wsp
    if (s.wspMin      != null) wspMin.value      = s.wspMin
    if (s.wspMax      != null) wspMax.value      = s.wspMax
    if (s.ratingSteps != null) ratingSteps.value = s.ratingSteps
    save()
  }

  // ─── kSt-Zonen Hilfsmethoden ──────────────────────────────────────────────
  function addKstZone() {
    const id = `z${Date.now()}`
    const color = ZONE_COLORS[kstZones.value.length % ZONE_COLORS.length]
    kstZones.value.push({ id, xLeft: null, xRight: null, kst: 30, color, label: 'Neue Zone' })
    save()
  }

  function removeKstZone(id) {
    if (kstZones.value.length <= 1) return
    kstZones.value = kstZones.value.filter(z => z.id !== id)
    save()
  }

  function updateKstZone(id, patch) {
    const z = kstZones.value.find(z => z.id === id)
    if (z) Object.assign(z, patch)
    save()
  }

  // ─── Profil-Hilfsmethoden ─────────────────────────────────────────────────
  function addPoint(layer, point) {
    const arr = layer === 'terrain' ? terrainPoints : layer === 'buk' ? bukProfile : bokProfile
    arr.value = [...arr.value, point].sort((a, b) => a.x - b.x)
    save()
  }

  function movePoint(layer, index, newPoint) {
    const arr = layer === 'terrain' ? terrainPoints : layer === 'buk' ? bukProfile : bokProfile
    const pts = [...arr.value]
    pts[index] = newPoint
    arr.value = pts.sort((a, b) => a.x - b.x)
    save()
  }

  function deletePoint(layer, index) {
    const arr = layer === 'terrain' ? terrainPoints : layer === 'buk' ? bukProfile : bokProfile
    arr.value = arr.value.filter((_, i) => i !== index)
    save()
  }

  function clearLayer(layer) {
    if (layer === 'terrain') terrainPoints.value = []
    else if (layer === 'buk') bukProfile.value = []
    else if (layer === 'bok') bokProfile.value = []
    save()
  }

  function setLayer(layer, points) {
    if (layer === 'terrain') {
      terrainPoints.value = [...points].sort((a, b) => a.x - b.x)
      const zVals = terrainPoints.value.map(p => p.z)
      const zMin = Math.min(...zVals), zMax = Math.max(...zVals)
      const range = Math.max(zMax - zMin, 0.5)
      wspMin.value = Math.round((zMin - range * 0.05) * 100) / 100
      wspMax.value = Math.round((zMax + range * 0.3) * 100) / 100
      if (wsp.value < zMin || wsp.value > wspMax.value)
        wsp.value = Math.round((zMin + range * 0.5) * 100) / 100
    } else if (layer === 'buk') {
      bukProfile.value = [...points].sort((a, b) => a.x - b.x)
    } else if (layer === 'bok') {
      bokProfile.value = [...points].sort((a, b) => a.x - b.x)
    }
    save()
  }

  load()

  return {
    // State
    terrainPoints, bukProfile, bokProfile, kstZones,
    slope, wsp, wspMin, wspMax, ratingSteps,
    // Computed
    calcParams, currentResult, ratingCurve,
    // Undo / Redo
    canUndo, canRedo, undo, redo,
    // Persist / Project
    save, resetToDefault, exportProject, importProject,
    // Profil
    addKstZone, removeKstZone, updateKstZone,
    addPoint, movePoint, deletePoint, clearLayer, setLayer
  }
})
