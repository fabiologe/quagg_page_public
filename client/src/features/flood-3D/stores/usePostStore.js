// Zentraler Zustand des Nachweis-Viewers (Spez. Kap. 10):
// Zeitzustand (currentTime, ausgewählte Läufe), Darstellungszustand
// (aktive Ansicht; Farbskalen folgen mit den Feldansichten) und
// Auswahlzustand. Serien- und Ergebnis-Caches, damit ein Tabwechsel
// keine erneuten Netzabrufe auslöst.
import { defineStore } from 'pinia'
import { flood3dApi } from '../services/api'

// Validierte Kategorie-Palette (dark, siehe dataviz-Referenz): Farbe folgt
// dem Ort (Pegel/Querschnitt/Bauteil), der Lauf wird über das Strichmuster
// unterschieden — so bleibt die Zuordnung beim Laufvergleich stabil.
export const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181']
export const LIMIT_COLOR = '#e66767'
export const RUN_DASHES = [[], [10, 5], [3, 3], [10, 3, 3, 3]]

// Ansichten der Ergebnis-Phase (Spez. Kap. 8)
export const VIEWER_TABS = [
  { id: 'nachweis', label: 'Nachweis' },
  { id: 'qualitaet', label: 'Qualität' },
  { id: 'zeitreihen', label: 'Zeitreihen' },
  { id: 'grundriss', label: 'Grundriss & Schnitt' },
  { id: 'raum', label: 'Raum (3D)' },
  { id: 'extremwerte', label: 'Extremwerte' },
  { id: 'abbildungen', label: 'Abbildungen' },
  { id: 'lauf', label: 'Lauf & Log' },
]

export const usePostStore = defineStore('flood3d-post', {
  state: () => ({
    runs: [],
    runsLoading: false,
    runsError: '',
    caseFilter: '',      // nur Läufe dieses Falls anzeigen (<fall>_rNNN)
    selectedRunIds: [],
    activeTab: 'nachweis',
    currentTime: null,
    resultCache: {},     // runId -> result.json
    balanceCache: {},    // runId -> balance payload
    seriesCache: {},     // `${runId}|${quantity}|${component}` -> series[]
    extremesCache: {},   // runId -> extremes[]
    colorSlots: {},      // location_id -> Palettenindex, stabil je Sitzung
  }),

  getters: {
    visibleRuns(state) {
      if (!state.caseFilter) return state.runs
      return state.runs.filter((r) => r.run_id.startsWith(`${state.caseFilter}_r`))
    },
    selectedRuns(state) {
      return state.runs.filter((r) => state.selectedRunIds.includes(r.run_id))
    },
    runDash(state) {
      return (runId) => {
        const i = state.selectedRunIds.indexOf(runId)
        return RUN_DASHES[Math.max(i, 0) % RUN_DASHES.length]
      }
    },
  },

  actions: {
    async loadRuns() {
      this.runsLoading = true
      this.runsError = ''
      try {
        this.runs = await flood3dApi.listRuns()
        this.selectedRunIds = this.selectedRunIds
          .filter((id) => this.visibleRuns.some((r) => r.run_id === id))
        if (!this.selectedRunIds.length && this.visibleRuns.length) {
          // API liefert aufsteigend sortiert -> letzter Eintrag = neuester Lauf
          this.selectedRunIds = [this.visibleRuns[this.visibleRuns.length - 1].run_id]
        }
      } catch (e) {
        this.runsError = e.message
      } finally {
        this.runsLoading = false
      }
    },

    async removeRun(runId) {
      await flood3dApi.deleteRun(runId)
      this.selectedRunIds = this.selectedRunIds.filter((id) => id !== runId)
      delete this.resultCache[runId]
      delete this.balanceCache[runId]
      delete this.extremesCache[runId]
      for (const k of Object.keys(this.seriesCache)) {
        if (k.startsWith(`${runId}|`)) delete this.seriesCache[k]
      }
      await this.loadRuns()
    },

    toggleRun(runId) {
      const i = this.selectedRunIds.indexOf(runId)
      if (i >= 0) this.selectedRunIds.splice(i, 1)
      else this.selectedRunIds.push(runId)
    },

    // Ergebnis-Phase gezielt auf einen Lauf stellen (z. B. aus der Laufliste)
    focusRun(runId, tab = 'nachweis') {
      this.selectedRunIds = [runId]
      this.activeTab = tab
    },

    locationColor(locationId) {
      if (!(locationId in this.colorSlots)) {
        const used = Object.keys(this.colorSlots).length
        this.colorSlots[locationId] = used % SERIES_COLORS.length
      }
      return SERIES_COLORS[this.colorSlots[locationId]]
    },

    async ensureResult(runId) {
      if (!this.resultCache[runId]) {
        this.resultCache[runId] = await flood3dApi.result(runId)
      }
      return this.resultCache[runId]
    },

    async ensureBalance(runId) {
      if (!this.balanceCache[runId]) {
        this.balanceCache[runId] = await flood3dApi.balance(runId)
      }
      return this.balanceCache[runId]
    },

    async ensureExtremes(runId) {
      if (!this.extremesCache[runId]) {
        this.extremesCache[runId] = await flood3dApi.extremes(runId)
      }
      return this.extremesCache[runId]
    },

    async ensureSeries(runId, quantity, component = '') {
      const key = `${runId}|${quantity}|${component}`
      if (!this.seriesCache[key]) {
        const data = await flood3dApi.series(runId, quantity, component)
        this.seriesCache[key] = data.series
      }
      return this.seriesCache[key]
    },
  },
})
