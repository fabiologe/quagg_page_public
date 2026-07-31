// Zustand des PreViewers (Stufe 4). Die casespec liegt hier als einfaches
// Objekt (JSON) — das Frontend erzeugt keine maßgebliche Geometrie, es
// bearbeitet Parameter und zeigt an, was terrain/solids serverseitig
// liefern (Spez. Kap. 3). geometryVersion zählt hoch, wenn die 3D-Szene
// neu vom Server geladen werden muss.
import { defineStore } from 'pinia'
import { flood3dApi } from '../services/api'

// Objektlisten der casespec: Auswahl-Kind -> Pfad in der Spec
export const KIND_PATHS = {
  terrain_op: (s) => s.terrain?.operations,
  structure: (s) => s.structures,
  refinement: (s) => s.mesh?.refinements,
  boundary: (s) => s.boundaries,
  section: (s) => s.evaluation?.sections,
  gauge: (s) => s.evaluation?.gauges,
  target: (s) => s.evaluation?.targets,
}

export const usePreStore = defineStore('flood3d-pre', {
  state: () => ({
    cases: [],
    activeCaseId: null,
    spec: null,
    dirty: false,
    validation: [],
    terrain: null,        // { x0, y0, resolution, dims, z: Float32Array }
    solids: [],           // [{ patch, stl: ArrayBuffer }]
    geometryVersion: 0,
    selection: null,      // { kind, id }
    loading: false,
    error: '',
    meshPreview: null,    // Ergebnis des Vernetzungsprobelaufs
    meshPreviewLoading: false,
    startedRun: null,     // { run_id } des zuletzt gestarteten Laufs
    // Bearbeitungsverlauf: Snapshots der GESAMTEN spec (JSON-Strings).
    // Jede Mutation läuft durch update/add/removeObject — damit ist die
    // Historie zwangsläufig vollständig (keine Feld-für-Feld-Falle).
    undoStack: [],
    redoStack: [],
    // Workflow-Phase des Arbeitsbereichs: modell | simulation | laeufe
    activePhase: 'modell',
    caseRuns: [],          // Läufe DIESES Falls (run_id-Präfix)
  }),

  getters: {
    selectedObject(state) {
      if (!state.selection || !state.spec) return null
      const list = KIND_PATHS[state.selection.kind]?.(state.spec)
      return list?.find((o) => o.id === state.selection.id) ?? null
    },
    worstSeverity(state) {
      return (objectId) => {
        let worst = null
        for (const f of state.validation) {
          if (f.object_id !== objectId) continue
          if (f.severity === 'fehler') return 'fehler'
          if (f.severity === 'warnung') worst = 'warnung'
          else worst = worst ?? 'hinweis'
        }
        return worst
      }
    },
    nFehler: (state) => state.validation.filter((f) => f.severity === 'fehler').length,
    nWarnungen: (state) => state.validation.filter((f) => f.severity === 'warnung').length,
    canUndo: (state) => state.undoStack.length > 0,
    canRedo: (state) => state.redoStack.length > 0,
  },

  actions: {
    async loadCases() {
      try {
        this.cases = await flood3dApi.listCases()
      } catch (e) {
        this.error = e.message
      }
    },

    async createCaseAndOpen(caseId) {
      this.error = ''
      try {
        await flood3dApi.createCase(caseId, caseId)
        await this.loadCases()
        await this.openCase(caseId)
      } catch (e) {
        this.error = e.message
        throw e
      }
    },

    // Nach dem Geometrie-Import: der Server hat den Fall bereits
    // geschrieben und liefert ihn zurück — nur Zustand nachziehen, ohne
    // Phase oder Undo-Verlauf zu verlieren (openCase täte beides).
    async adoptImportedSpec(spec) {
      const snap = this.spec ? JSON.stringify(this.spec) : null
      if (snap) {
        this.undoStack.push(snap)
        this.redoStack = []
      }
      this.spec = spec
      this.dirty = false
      this.selection = null
      await Promise.all([this.refreshGeometry(), this.refreshValidation()])
    },

    async openCase(caseId) {
      this.loading = true
      this.error = ''
      try {
        this.spec = await flood3dApi.getCase(caseId)
        this.activeCaseId = caseId
        this.dirty = false
        this.undoStack = []
        this.redoStack = []
        this.activePhase = 'modell'
        this.loadCaseRuns()
        this.selection = null
        await Promise.all([this.refreshGeometry(), this.refreshValidation()])
      } catch (e) {
        this.error = e.message
      } finally {
        this.loading = false
      }
    },

    async refreshGeometry() {
      const id = this.activeCaseId
      const [terrain, solids] = await Promise.all([
        flood3dApi.caseTerrain(id).catch(() => null),
        flood3dApi.caseSolids(id).catch(() => ({ solids: [], errors: [] })),
      ])
      if (terrain) {
        const bin = atob(terrain.z_b64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        this.terrain = { ...terrain, z: new Float32Array(bytes.buffer) }
      } else {
        this.terrain = null
      }
      this.solids = solids.solids.map((s) => {
        const bin = atob(s.stl_b64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        return { patch: s.patch, stl: bytes.buffer }
      })
      this.geometryVersion++
    },

    async refreshValidation() {
      this.validation = await flood3dApi.caseValidate(this.activeCaseId)
        .catch(() => [])
    },

    async saveCase() {
      this.loading = true
      this.error = ''
      try {
        const result = await flood3dApi.saveCase(this.activeCaseId, this.spec)
        this.validation = result.validation
        this.dirty = false
        await this.refreshGeometry()
        return true
      } catch (e) {
        this.error = `Speichern fehlgeschlagen: ${e.message}`
        return false
      } finally {
        this.loading = false
      }
    },

    select(kind, id) {
      this.selection = { kind, id }
    },

    // Live-Vorschau des Entwurfs: nach jeder Änderung (entprellt) Gelände,
    // Bauwerke und Prüfung vom Server holen — OHNE zu speichern. Damit
    // reagiert die 3D-Szene unmittelbar auf Drag und Formularänderungen.
    scheduleDraftPreview() {
      clearTimeout(this._draftTimer)
      this._draftTimer = setTimeout(() => this.refreshDraftPreview(), 350)
    },

    async refreshDraftPreview() {
      if (!this.activeCaseId || !this.spec) return
      const seq = (this._draftSeq = (this._draftSeq ?? 0) + 1)
      try {
        const p = await flood3dApi.casePreview(this.activeCaseId, this.spec)
        if (seq !== this._draftSeq) return
        this.validation = p.validation
        if (p.terrain) {
          const bin = atob(p.terrain.z_b64)
          const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          this.terrain = { ...p.terrain, z: new Float32Array(bytes.buffer) }
        }
        this.solids = p.solids.map((s) => {
          const bin = atob(s.stl_b64)
          const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          return { patch: s.patch, stl: bytes.buffer }
        })
        this.geometryVersion++
      } catch (e) {
        // Entwurf aktuell nicht baubar (z. B. Tippfehler) — Meldung zeigen
        this.error = `Vorschau: ${e.message}`
      }
    },

    // -- Bearbeitungsverlauf ------------------------------------------------

    recordUndo() {
      if (!this.spec) return
      this.undoStack.push(JSON.stringify(this.spec))
      if (this.undoStack.length > 100) this.undoStack.shift()
      this.redoStack = []           // neuer Zweig verwirft die Redo-Kette
    },

    _restoreSnapshot(snap) {
      this.spec = JSON.parse(snap)
      if (this.selection && !this.selectedObject) this.selection = null
      this.dirty = true
      this.error = ''
      this.scheduleDraftPreview()
    },

    undoEdit() {
      if (!this.undoStack.length) return
      this.redoStack.push(JSON.stringify(this.spec))
      this._restoreSnapshot(this.undoStack.pop())
    },

    redoEdit() {
      if (!this.redoStack.length) return
      this.undoStack.push(JSON.stringify(this.spec))
      this._restoreSnapshot(this.redoStack.pop())
    },

    updateObject(kind, id, updated) {
      const list = KIND_PATHS[kind]?.(this.spec)
      const i = list?.findIndex((o) => o.id === id)
      if (i != null && i >= 0) {
        this.recordUndo()
        list[i] = updated
        this.dirty = true
        this.error = ''
        this.scheduleDraftPreview()
      }
    },

    addObject(kind, template) {
      // Snapshot VOR der Mutation nehmen, aber erst beim echten Einfügen
      // in den Stack schieben — sonst frisst ein Fehlschlag einen Undo-Klick
      const snap = this.spec ? JSON.stringify(this.spec) : null
      let list = KIND_PATHS[kind]?.(this.spec)
      if (!list) {
        // Liste in der Spec anlegen, falls der Abschnitt noch fehlt
        if (kind === 'terrain_op' && this.spec.terrain) {
          this.spec.terrain.operations = []
          list = this.spec.terrain.operations
        } else if (kind === 'refinement' && this.spec.mesh) {
          this.spec.mesh.refinements = []
          list = this.spec.mesh.refinements
        } else if (['section', 'gauge', 'target'].includes(kind)) {
          this.spec.evaluation = this.spec.evaluation
            ?? { sections: [], gauges: [], force_patches: [], profiles: [], targets: [] }
          const key = { section: 'sections', gauge: 'gauges', target: 'targets' }[kind]
          this.spec.evaluation[key] = this.spec.evaluation[key] ?? []
          list = this.spec.evaluation[key]
        }
      }
      if (!list || !snap) return
      this.undoStack.push(snap)
      if (this.undoStack.length > 100) this.undoStack.shift()
      this.redoStack = []
      // eindeutige ID
      let n = list.length + 1
      while (list.some((o) => o.id === `${template.id}_${n}`)) n++
      const obj = { ...template, id: `${template.id}_${n}` }
      if ('patch' in obj) obj.patch = obj.id
      list.push(obj)
      this.dirty = true
      this.select(kind, obj.id)
      this.scheduleDraftPreview()
    },

    async runMeshPreview() {
      this.meshPreviewLoading = true
      this.error = ''
      try {
        if (this.dirty) await this.saveCase()
        this.meshPreview = await flood3dApi.meshPreview(this.activeCaseId)
      } catch (e) {
        this.error = `Netzvorschau: ${e.message}`
      } finally {
        this.meshPreviewLoading = false
      }
    },

    async startRun() {
      this.error = ''
      try {
        if (this.dirty) await this.saveCase()
        this.startedRun = await flood3dApi.startRun(this.activeCaseId)
        this.activePhase = 'laeufe'          // dem Lauf direkt zuschauen
        await this.loadCaseRuns()
      } catch (e) {
        this.error = `Lauf starten: ${e.message}`
      }
    },

    // Läufe dieses Falls (Namenskonvention <case>_rNNN)
    async loadCaseRuns() {
      if (!this.activeCaseId) return
      try {
        const all = await flood3dApi.listRuns()
        this.caseRuns = all
          .filter((r) => r.run_id.startsWith(`${this.activeCaseId}_`))
          .reverse()
      } catch (e) {
        this.error = e.message
      }
    },

    // Einstellungs-Mutation (Simulation/Gebiet/Gelände/Meta) mit Undo und
    // Live-Vorschau — mutator bekommt die spec und ändert sie in place.
    updateSettings(mutator) {
      if (!this.spec) return
      this.recordUndo()
      mutator(this.spec)
      this.dirty = true
      this.error = ''
      this.scheduleDraftPreview()
    },

    removeObject(kind, id) {
      const list = KIND_PATHS[kind]?.(this.spec)
      const i = list?.findIndex((o) => o.id === id)
      if (i != null && i >= 0) {
        this.recordUndo()
        list.splice(i, 1)
        this.dirty = true
        if (this.selection?.id === id) this.selection = null
        this.scheduleDraftPreview()
      }
    },
  },
})
