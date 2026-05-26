/**
 * Pinia Setup-Store — orchestriert den gesamten Brücken-Hydraulik-Zustand.
 *
 * ── Verantwortlichkeiten ──────────────────────────────────────────────────────────
 *   1. State-Haltung      terrainPoints, bukProfile, bokProfile, kstZones,
 *                         slope, wsp, mu, muDeck, zeta, nPiers, bPier, flowMode, wspUW
 *   2. Berechnungs-Computed
 *        calcParams        — gebündeltes Objekt aller Hydraulik-Eingaben (computed)
 *        currentResult     — calculateAtWSP(calcParams, wsp), reaktiv bei jedem Tick
 *        ratingCurve       — generateRatingCurve(...), 10 s debounced (CPU-Schutz)
 *   3. History / Undo-Redo historyStack (JSON-Snapshots, max 60), historyIdx
 *   4. Persistenz         localStorage, 100 ms debounced via save()
 *   5. Projekt-Export     exportProject() / importProject() als JSON-Datei
 *   6. Profil-Methoden    addPoint, movePoint, deletePoint, clearLayer, setLayer
 *   7. kSt-Zonen          addKstZone, removeKstZone, updateKstZone
 *
 * ── Datenfluss ───────────────────────────────────────────────────────────────────
 *   User-Eingabe → store.wsp / store.slope / ...
 *     → calcParams (computed)
 *       → currentResult = calculateAtWSP(calcParams)   sofort, kein Debounce
 *       → ratingCurve   = generateRatingCurve(...)     10 s Debounce
 *     → save()
 *       → localStorage.setItem(...)                    100 ms Debounce
 *       → _pushHistory(snapshot)                       450 ms Debounce
 *
 * ── Serialisierungs-Schema (DRY) ─────────────────────────────────────────────────
 *   SCALAR_SCHEMA / ARRAY_SCHEMA registrieren jedes State-Feld genau einmal.
 *   _serialize / _deserialize leiten daraus alle Persistenz-Operationen ab:
 *   save(), load(), undo(), redo(), resetToDefault(), exportProject(), importProject()
 *   — kein Copy-Paste zwischen den einzelnen Funktionen.
 */
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useBridgeHydraulics } from '../composables/useBridgeHydraulics.js'

const STORAGE_KEY = 'bridgeHydraulics_v3'
const PROJECT_FORMAT = 'BrueckenHydraulik'
const PROJECT_VERSION = 2
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
  const kstZones      = ref(DEFAULT_KST_ZONES.map(z => ({ ...z })))

  // ─── Skalare State-Felder ─────────────────────────────────────────────────
  const slope       = ref(0.001)
  const wsp         = ref(5.0)
  const wspMin      = ref(0.5)
  const wspMax      = ref(8.0)
  const ratingSteps = ref(30)
  const mu          = ref(0.80)
  const muDeck      = ref(0.45)
  const zeta        = ref(0.00)
  const nPiers      = ref(0)
  const bPier       = ref(0.50)
  const flowMode    = ref('auto')
  const wspUW       = ref(null)

  // ─── Serialisierungs-Schema ───────────────────────────────────────────────
  // Jedes Feld einmalig hier — _serialize/_deserialize generiert daraus
  // _stateJson, _applyJson, load, resetToDefault, exportProject, importProject.
  // nullable: true → null ist gültiger Wert ('key in s' statt '!= null'-Check).
  const SCALAR_SCHEMA = [
    { key: 'slope',       ref: slope,       default: 0.001  },
    { key: 'wsp',         ref: wsp,         default: 5.0    },
    { key: 'wspMin',      ref: wspMin,       default: 0.5    },
    { key: 'wspMax',      ref: wspMax,       default: 8.0    },
    { key: 'ratingSteps', ref: ratingSteps, default: 30     },
    { key: 'mu',          ref: mu,          default: 0.80   },
    { key: 'muDeck',      ref: muDeck,      default: 0.45   },
    { key: 'zeta',        ref: zeta,        default: 0.00   },
    { key: 'nPiers',      ref: nPiers,      default: 0      },
    { key: 'bPier',       ref: bPier,       default: 0.50   },
    { key: 'flowMode',    ref: flowMode,    default: 'auto' },
    { key: 'wspUW',       ref: wspUW,       default: null, nullable: true },
  ]
  const ARRAY_SCHEMA = [
    { key: 'terrainPoints', ref: terrainPoints, minLen: 2 },
    { key: 'bukProfile',    ref: bukProfile,    minLen: 2 },
    { key: 'bokProfile',    ref: bokProfile,    minLen: 2 },
    { key: 'kstZones',      ref: kstZones,      minLen: 1 },
  ]

  function _serialize() {
    const out = {}
    for (const f of ARRAY_SCHEMA)  out[f.key] = f.ref.value
    for (const f of SCALAR_SCHEMA) out[f.key] = f.ref.value
    return out
  }

  function _deserialize(s) {
    for (const f of ARRAY_SCHEMA)
      if (s[f.key]?.length >= f.minLen) f.ref.value = s[f.key]
    for (const f of SCALAR_SCHEMA)
      if (f.nullable ? f.key in s : s[f.key] != null) f.ref.value = s[f.key]
  }

  function _stateJson() { return JSON.stringify(_serialize()) }
  function _applyJson(json) { _deserialize(JSON.parse(json)) }

  // ─── Berechnungsparameter ─────────────────────────────────────────────────
  const calcParams = computed(() => ({
    crossSectionPoints: terrainPoints.value,
    bukProfile: bukProfile.value.length >= 2 ? bukProfile.value : null,
    bokProfile: bokProfile.value.length >= 2 ? bokProfile.value : null,
    kstZones: kstZones.value,
    slope: slope.value,
    mu: mu.value,
    muDeck: muDeck.value,
    zeta: zeta.value,
    nPiers: nPiers.value,
    bPier: bPier.value,
    flowMode: flowMode.value,
    wspUW: wspUW.value ?? undefined,
  }))

  const currentResult = computed(() =>
    calculateAtWSP({ ...calcParams.value, wsp: wsp.value })
  )

  // ─── History (Undo / Redo) ────────────────────────────────────────────────
  const historyStack = ref([])
  const historyIdx   = ref(-1)

  const canUndo = computed(() => historyIdx.value > 0)
  const canRedo = computed(() => historyIdx.value < historyStack.value.length - 1)

  function _pushHistory(snap) {
    historyStack.value = historyStack.value.slice(0, historyIdx.value + 1)
    if (historyStack.value[historyIdx.value] === snap) return
    historyStack.value.push(snap)
    if (historyStack.value.length > MAX_HISTORY) historyStack.value.shift()
    historyIdx.value = historyStack.value.length - 1
  }

  // ─── Persistenz ───────────────────────────────────────────────────────────
  // save() startet zwei UNABHÄNGIGE Debounce-Timer:
  //
  //   _persistTimer  (100 ms) → localStorage.setItem(STORAGE_KEY, JSON)
  //     Warum 100 ms: Schnell genug, dass kein Datenverlust bei Browser-Absturz
  //     während Mousemove-Drag entsteht. Ohne Debounce würde jeder Drag-Tick einen
  //     localStorage-Write auslösen (mehrere hundert pro Sekunde).
  //
  //   _snapshotTimer (450 ms) → _pushHistory(JSON-Snapshot)
  //     Warum 450 ms: Ein Undo-Schritt soll einer "Eingabe-Pause" entsprechen,
  //     nicht jedem einzelnen Buchstaben beim Tippen. 450 ms ist die typische
  //     Pause zwischen Tastatureingaben, ab der ein neuer Intent beginnt.
  //
  // Beide Timer werden in undo() / redo() abgebrochen (clearTimeout), damit ein
  // Undo mitten in einer debounced Sequenz nicht überschrieben wird.
  let _persistTimer  = null
  let _snapshotTimer = null

  function save() {
    clearTimeout(_persistTimer)
    _persistTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, _stateJson()) } catch { /* ignore */ }
    }, 100)

    clearTimeout(_snapshotTimer)
    _snapshotTimer = setTimeout(() => _pushHistory(_stateJson()), 450)
  }

  function undo() {
    clearTimeout(_persistTimer)
    clearTimeout(_snapshotTimer)
    if (!canUndo.value) return
    historyIdx.value--
    const snap = historyStack.value[historyIdx.value]
    _applyJson(snap)
    try { localStorage.setItem(STORAGE_KEY, snap) } catch { /* ignore */ }
  }

  function redo() {
    clearTimeout(_persistTimer)
    clearTimeout(_snapshotTimer)
    if (!canRedo.value) return
    historyIdx.value++
    const snap = historyStack.value[historyIdx.value]
    _applyJson(snap)
    try { localStorage.setItem(STORAGE_KEY, snap) } catch { /* ignore */ }
  }

  function load() {
    try { _deserialize(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')) } catch { /* ignore */ }
    _pushHistory(_stateJson())
  }

  function resetToDefault() {
    terrainPoints.value = DEFAULT_TERRAIN.map(p => ({ ...p }))
    bukProfile.value    = DEFAULT_BUK.map(p => ({ ...p }))
    bokProfile.value    = DEFAULT_BOK.map(p => ({ ...p }))
    kstZones.value      = DEFAULT_KST_ZONES.map(z => ({ ...z }))
    for (const f of SCALAR_SCHEMA) f.ref.value = f.default
    save()
  }

  // ─── Projekt Export / Import ─────────────────────────────────────────────
  function exportProject() {
    return JSON.stringify({ format: PROJECT_FORMAT, version: PROJECT_VERSION, ..._serialize() }, null, 2)
  }

  function importProject(jsonString) {
    const s = JSON.parse(jsonString)
    if (s.format !== PROJECT_FORMAT)
      throw new Error(`Unbekanntes Format: "${s.format}" — erwartet "${PROJECT_FORMAT}"`)
    _deserialize(s)
    save()
  }

  // ─── Rating-Curve: debounced watch statt computed ─────────────────────────
  // generateRatingCurve ruft calculateAtWSP (steps+1)-mal auf — bei steps=30 also
  // 31 vollständige Hydraulikberechnungen pro Aufruf. Als computed würde das bei
  // jedem WSP-Drag-Tick feuern (50–100×/s → CPU-Spike, UI-Freeze).
  // Lösung: watch mit 10 000 ms Debounce — die Kurve aktualisiert sich erst,
  // wenn der Nutzer 10 s lang keine Parameter geändert hat.
  // load() wird vor diesem Block aufgerufen → erste Berechnung spiegelt geladenen State.
  load()

  const ratingCurve = ref(
    generateRatingCurve(calcParams.value, wspMin.value, wspMax.value, ratingSteps.value)
  )
  let _ratingTimer = null
  watch([calcParams, wspMin, wspMax, ratingSteps], () => {
    clearTimeout(_ratingTimer)
    _ratingTimer = setTimeout(() => {
      ratingCurve.value = generateRatingCurve(
        calcParams.value, wspMin.value, wspMax.value, ratingSteps.value
      )
    }, 10000)
  })

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

  return {
    // State
    terrainPoints, bukProfile, bokProfile, kstZones,
    slope, wsp, wspMin, wspMax, ratingSteps,
    mu, muDeck, zeta, nPiers, bPier, flowMode, wspUW,
    // Computed / Reactive
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
