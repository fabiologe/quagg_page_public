// Zustand des PreViewers (Stufe 4). Die casespec liegt hier als einfaches
// Objekt (JSON) — das Frontend erzeugt keine maßgebliche Geometrie, es
// bearbeitet Parameter und zeigt an, was terrain/solids serverseitig
// liefern (Spez. Kap. 3). geometryVersion zählt hoch, wenn die 3D-Szene
// neu vom Server geladen werden muss.
import { defineStore } from 'pinia'
import { flood3dApi } from '../services/api'
import { b64ToBuffer as b64Buffer } from '../services/volume'
import { KIND_PATHS } from '../utils/kindPfade'
import { setzeSchema } from '../utils/feldTypen'
import { aufraeumplan } from '../utils/aufraeumen'



export { KIND_PATHS } from '../utils/kindPfade'

export const usePreStore = defineStore('flood3d-pre', {
  state: () => ({
    // Gelände formen (Pinsel im Editor) — vom Baum/Eigenschaften-Panel
    // ein-, vom Editor ausgeschaltet
    sculptAktiv: false,
    // Ein modaler Dialog ist offen. Die globalen Tastatur-Handler (Escape
    // im Editor, Strg+Z in der Hauptansicht) hängen am window und wirkten
    // sonst HINTER dem Dialog auf die Szene bzw. auf das Modell.
    dialogOffen: false,
    cases: [],
    activeCaseId: null,
    spec: null,
    dirty: false,
    validation: [],
    terrain: null,        // { x0, y0, resolution, dims, z: Float32Array }
    // Serverseitig aufgelöste Regeln aus der Geometrie-Antwort:
    // { bcFaces, fenster, oeffnungen } — siehe uebernehmeGeometrie
    aufgeloest: { bcFaces: {}, fenster: {}, oeffnungen: {} },
    // Import-Verwaltung: {import_id: {filename, candidates, wiederholbar}}
    importe: {},
    // Geländekörper (Volumen statt Höhenfläche) — nur gesetzt, wenn der
    // Fall wirklich mit einem Körper vernetzt wird
    terrainSolid: null,   // { stl: ArrayBuffer, volume, watertight, … }
    solids: [],           // [{ patch, stl: ArrayBuffer }]
    geometryVersion: 0,
    selection: null,      // { kind, id }
    loading: false,
    error: '',
    meshPreview: null,    // Ergebnis des Vernetzungsprobelaufs
    meshPreviewLoading: false,
    meshPreviewStale: false,   // Vorschaunetz gehört nicht mehr zum Fall
    // Bearbeitungsverlauf: Snapshots der GESAMTEN spec (JSON-Strings).
    // Jede Mutation läuft durch update/add/removeObject — damit ist die
    // Historie zwangsläufig vollständig (keine Feld-für-Feld-Falle).
    undoStack: [],
    redoStack: [],
    // Workflow-Phase des Arbeitsbereichs: modell | simulation | laeufe
    activePhase: 'modell',
    caseRuns: [],          // Läufe DIESES Falls (run_id-Präfix)
    // Bearbeitung, die gerade in die Szene GEZEICHNET wird:
    // { art: 'bohrung'|'oeffnung'|'schnitt', id } — der Editor zeigt
    // eine Vorschau am Körper und stanzt sie beim Klick ein. Zahlen tippen
    // kann man danach immer noch.
    platzierung: null,
    rasterDateien: [],     // Höhenraster neben dem Fall (Bereich ersetzen)
    rezepte: [],           // Bauwerkskatalog (Aushub + Bauteile in einem Zug)
    // Stützpunkt, den der Editor gerade hervorheben soll — die Zeile einer
    // Punktliste zeigt sonst nicht, welcher Punkt in der Szene gemeint ist.
    // { x, y, z } oder null.
    fokusPunkt: null,
    // Die Szene zeigt einen älteren Stand, weil der Entwurf gerade nicht
    // lesbar war oder die Vorschau nicht durchkam. Lieber gekennzeichnet
    // als stillschweigend etwas zeigen, das es nicht mehr gibt.
    previewStale: false,
    // Dasselbe für den Erdkörper allein: bei sehr großen Rastern wird er
    // in der Entwurfsvorschau nicht neu gebaut
    terrainSolidStale: false,
    // EIN Meldungsweg für das ganze Werkzeug. Vorher gab es neun
    // nebeneinander (`error`, `parseError`, `uebernommen`, `hinweis`,
    // `rezeptMeldungen`, `meldungen`, dazu lokale refs je Panel) — jeder
    // mit eigener Farbe, eigener Lebensdauer und eigenem Ort. `error`
    // wurde an 17 Stellen gesetzt, an vier angezeigt, in der Phase
    // „Ergebnis" nirgends: Fehler waren dort unsichtbar.
    // [{ id, text, art: 'erfolg'|'hinweis'|'warnung'|'fehler' }]
    meldungen: [],
  }),

  getters: {
    selectedObject(state) {
      if (!state.selection || !state.spec) return null
      // Das Modellgebiet ist kein Listenobjekt, aber man muss es anfassen
      // können wie eines — sonst lässt es sich nur über Zahlen ändern.
      if (state.selection.kind === 'domain') {
        return { id: 'domain', type: 'domain', ...state.spec.domain }
      }
      if (state.selection.kind === 'terrain') {
        if (!state.spec.terrain) return null
        // erdkoerper sitzt am Terrain, nicht an der Basis — hier gehört er
        // trotzdem ins Formular: DER Schalter (P3) braucht einen Ort
        return { id: 'gelaende', type: 'terrain',
          erdkoerper: state.spec.terrain.erdkoerper ?? 'auto',
          erdkoerper_unterkante:
            state.spec.terrain.erdkoerper_unterkante ?? null,
          erdkoerper_ueberstand:
            state.spec.terrain.erdkoerper_ueberstand ?? null,
          ...state.spec.terrain.base }
      }
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
    // --- Meldungen --------------------------------------------------------
    // Erfolg und Hinweise verschwinden von selbst, Fehler bleiben stehen,
    // bis sie weggeklickt werden — eine Fehlermeldung, die nach acht
    // Sekunden verschwindet, hat der Bearbeiter unter Umständen nie gesehen.
    melden(text, art = 'hinweis') {
      if (!text) return
      const id = (this._meldungsNr = (this._meldungsNr ?? 0) + 1)
      this.meldungen.push({ id, text, art })
      // Fehler UND Warnungen bleiben stehen, bis sie weggeklickt werden —
      // eine Warnung, die nach zehn Sekunden verschwindet, hat der
      // Bearbeiter unter Umständen nie gesehen (Audit F3). Nur Erfolg und
      // Hinweise räumen sich selbst weg.
      if (art !== 'fehler' && art !== 'warnung') {
        setTimeout(() => this.meldungWeg(id), art === 'erfolg' ? 4000 : 10000)
      }
      // `error` bleibt vorerst als zweiter Kanal bestehen, damit ältere
      // Anzeigen weiter funktionieren
      if (art === 'fehler') this.error = text
    },

    meldungWeg(id) {
      const i = this.meldungen.findIndex((m) => m.id === id)
      if (i >= 0) this.meldungen.splice(i, 1)
    },


    // Höhe des Geländerasters an einer Stelle (bilinear, wie im Editor).
    // Steht hier, weil sowohl der Objektbaum (Vorlagen ans Gelände hängen)
    // als auch die Punktliste (2D-Punkt in der Szene zeigen) sie braucht.
    gelaendeZ(x, y) {
      const t = this.terrain
      if (!t) return 0
      const [ny, nx] = t.dims
      const fx = Math.min(nx - 1.001, Math.max(0, (x - t.x0) / t.resolution))
      const fy = Math.min(ny - 1.001, Math.max(0, (y - t.y0) / t.resolution))
      const i = Math.floor(fx)
      const j = Math.floor(fy)
      const dx = fx - i
      const dy = fy - j
      const z = t.z
      return z[j * nx + i] * (1 - dx) * (1 - dy)
        + z[j * nx + i + 1] * dx * (1 - dy)
        + z[(j + 1) * nx + i] * (1 - dx) * dy
        + z[(j + 1) * nx + i + 1] * dx * dy
    },

    // Stützpunkt in der Szene hervorheben (null = wieder ausblenden). Ohne
    // eigene Höhe wird das Gelände abgetastet.
    zeigePunkt(p) {
      if (!p) { this.fokusPunkt = null; return }
      const [x, y, z] = p
      this.fokusPunkt = {
        x, y, z: Number.isFinite(z) ? z : this.gelaendeZ(x, y),
      }
    },

    async loadCases() {
      try {
        this.cases = await flood3dApi.listCases()
      } catch (e) {
        this.melden(e.message, 'fehler')
      }
    },

    async createCaseAndOpen(caseId) {
      this.error = ''
      try {
        await flood3dApi.createCase(caseId, caseId)
        await this.loadCases()
        await this.openCase(caseId)
      } catch (e) {
        this.melden(e.message, 'fehler')
        throw e
      }
    },

    async ladeRaster() {
      if (!this.activeCaseId) return
      try {
        this.rasterDateien = await flood3dApi.caseRasters(this.activeCaseId)
      } catch { this.rasterDateien = [] }
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
      await Promise.all([this.refreshGeometry(), this.ladeRaster()])
    },

    // DER eine Weg für Server-Mutationen (Kur, Drehen, Anschluss, Rezept,
    // Kantenableitung): ungespeicherte Änderungen sichern, wirken lassen,
    // Zustand nachziehen — mit EINEM Undo-Schritt, auch wenn ein Rezept
    // ein halbes Dutzend Objekte einsetzt. Der Server speichert nur bei
    // echter Änderung (res.geaendert) und sagt über den Netz-Hash, ob die
    // Vorschau veraltet ist.
    async serverMutation(aufruf, fehlerText,
      { raster = false, undo = true } = {}) {
      if (!this.activeCaseId) return []
      if (this.dirty && !(await this.saveCase())) return []
      const snap = this.spec ? JSON.stringify(this.spec) : null
      this.loading = true
      try {
        const res = await aufruf(this.activeCaseId)
        if (undo && res.geaendert !== false && snap) {
          this.undoStack.push(snap)
          this.redoStack = []
        }
        this.spec = res.spec
        this.validation = res.validation
        this.dirty = false
        if (this.meshPreview && res.netz_stale !== undefined) {
          this.meshPreviewStale = res.netz_stale
        }
        const nacharbeit = [this.refreshGeometry()]
        if (raster) nacharbeit.push(this.ladeRaster())
        await Promise.all(nacharbeit)
        return res.meldungen ?? []
      } catch (e) {
        this.melden(`${fehlerText}: ${e.message}`, 'fehler')
        return []
      } finally {
        this.loading = false
      }
    },

    // Den ganzen Fall um die z-Achse drehen — das Rechengebiet bleibt
    // achsparallel, es ist das MODELL, das sich dreht.
    async drehen(grad) {
      if (!grad) return []
      return this.serverMutation(
        (id) => flood3dApi.caseRotate(id, grad),
        'Drehen fehlgeschlagen', { raster: true })
    },

    // Mechanische Anschlüsse herstellen: Randbedingung auf die Fläche
    // legen, an der ihr Bauwerk endet, Rohrachse bis dorthin führen,
    // Verfeinerungsquader ins Gebiet beschneiden. Ändert keine Hydraulik.
    async anschlussHerstellen() {
      return this.serverMutation(
        (id) => flood3dApi.caseAnschluss(id), 'Anschluss fehlgeschlagen')
    },

    // Pinsel-Patches auf die Sculpt-Ebene des Geländes. KEIN globaler
    // Undo-Eintrag: der Spec-Snapshot kann die Delta-Datei nicht
    // zurückdrehen — Rückgängig ist das inverse Patch (editor/sculpt.js)
    async sculptPatches(patches) {
      return this.serverMutation(
        (id) => flood3dApi.sculpt(id, patches),
        'Formen fehlgeschlagen', { undo: false })
    },

    // Einen Import mit seiner gespeicherten Anwendung neu ableiten —
    // ersetzt alle Objekte dieses Imports (idempotent), baut derived/ neu
    async importNeuAbleiten(importId, rollen = null) {
      const meldungen = await this.serverMutation(
        (id) => flood3dApi.importReapply(id, importId, rollen),
        'Neu ableiten fehlgeschlagen', { raster: true })
      this.ladeImporte()
      return meldungen
    },

    // Import-Verwaltung (Dateinamen, Kandidaten, Wiederholbarkeit) — vom
    // Baum (Grundlagen-Gruppen) und vom PropertyPanel (Zuordnung) gelesen
    async ladeImporte() {
      if (!this.activeCaseId) { this.importe = {}; return }
      try {
        const res = await flood3dApi.listImports(this.activeCaseId)
        this.importe = Object.fromEntries(
          (res.imports ?? []).map((i) => [i.import_id, i]))
      } catch { this.importe = {} }
    },

    // DER eine Löschweg (Baum und Eigenschaftenpanel): Grundlagen-Objekte
    // nur mit Rückfrage — meist ist die Zuordnung der gemeinte Weg
    loescheObjekt(kind, id) {
      const o = KIND_PATHS[kind]?.(this.spec)?.find((x) => x.id === id)
      if (o?.herkunft === 'import' && !window.confirm(
        `„${id}" stammt aus einem Import. Wirklich löschen?\n`
        + 'Beim Neu-Ableiten des Imports kommt es wieder — dauerhaft '
        + 'entfernt wird es über die Zuordnung (ignorieren).')) {
        return false
      }
      this.removeObject(kind, id)
      return true
    },

    async ladeRezepte() {
      if (this.rezepte.length) return
      try {
        this.rezepte = (await flood3dApi.rezeptKatalog()).rezepte ?? []
      } catch (e) {
        this.melden(e.message, 'fehler')
      }
    },

    // Ein Bauwerk in einem Zug einsetzen. Läuft bewusst über denselben Weg
    // wie eine Kur: speichern, anwenden, Prüfung und Geometrie nachziehen —
    // und mit EINEM Undo-Schritt wieder rückgängig zu machen, obwohl ein
    // Rezept ein halbes Dutzend Objekte einsetzt.
    async rezeptEinsetzen(name, args = {}) {
      if (!name) return []
      return this.serverMutation(
        (id) => flood3dApi.caseRezept(id, name, args),
        'Rezept fehlgeschlagen')
    },

    // Aus den Vermessungskanten die Geländeoperationen ableiten. Was in
    // der Zeichnung steht, bleibt erhalten; was daraus folgt, entsteht neu
    // — gepaart wird über die LAGE, nicht über den Layernamen.
    async kantenVerknuepfen() {
      return this.serverMutation(
        (id) => flood3dApi.caseKantenVerknuepfen(id),
        'Kanten verknüpfen fehlgeschlagen')
    },

    // Die Kur zu einem Prüfbefund ausführen. Sie richtet nur Netz,
    // Auswertung oder Anschluss — keine fachliche Festlegung.
    async kurAnwenden(fix) {
      if (!fix) return ''
      const meldungen = await this.serverMutation(
        (id) => flood3dApi.caseKur(id, fix.aktion, fix.args ?? {}),
        'Kur fehlgeschlagen')
      return meldungen.join(' · ')
    },

    async openCase(caseId) {
      this.loading = true
      this.error = ''
      try {
        // Das Backend-Schema als Feldkunde-Quelle (einmal je Sitzung) —
        // Auswahlwerte kommen damit aus der casespec statt aus Kopien
        if (!this._schemaGeladen) {
          flood3dApi.caseSchema(caseId)
            .then((s) => { setzeSchema(s); this._schemaGeladen = true })
            .catch(() => {})
        }
        this.spec = await flood3dApi.getCase(caseId)
        this.activeCaseId = caseId
        this.dirty = false
        this.undoStack = []
        this.redoStack = []
        this.activePhase = 'modell'
        this.loadCaseRuns()
        this.selection = null
        this.ladeMeshPreviewStand()
        this.ladeImporte()
        await Promise.all([this.refreshGeometry(), this.ladeRaster()])
      } catch (e) {
        this.melden(e.message, 'fehler')
      } finally {
        this.loading = false
      }
    },

    // Gespeicherte Netzvorschau samt Aktualitätsmarke — ohne sie zeigt die
    // Netzansicht nach einer Änderung klaglos das alte Netz.
    async ladeMeshPreviewStand() {
      try {
        const s = await flood3dApi.meshPreviewState(this.activeCaseId)
        this.meshPreview = s.preview
        this.meshPreviewStale = s.stale
        if (s.beschaedigt) {
          this.melden('Die gespeicherte Netzvorschau ist beschädigt — '
            + 'bitte neu rechnen.', 'warnung')
        }
      } catch {
        this.meshPreview = null
        this.meshPreviewStale = false
      }
    },

    // DIE eine Übernahme einer Geometrie-Antwort — /preview (Entwurf),
    // PUT (Speichern) und GET /geometry liefern dieselbe Form; base64 →
    // Buffer passiert nur hier. `entwurf`: bei unlesbarem/kaputtem Entwurf
    // bleibt die letzte Geometrie sichtbar stehen (als veraltet markiert)
    // statt die Szene zu leeren.
    uebernehmeGeometrie(p, { entwurf = false } = {}) {
      this.validation = p.validation
      // Ob das Netz veraltet ist, sagt der Server (Netz-Hash) — eine
      // Änderung, die kein Netzelement berührt, entwertet es nicht
      if (this.meshPreview && p.netz_stale !== undefined) {
        this.meshPreviewStale = p.netz_stale
      }
      if (p.spec_ungueltig) {
        this.previewStale = true
        return
      }
      this.previewStale = false
      if (p.terrain) {
        this.terrain = { ...p.terrain,
          z: new Float32Array(b64Buffer(p.terrain.z_b64)) }
      } else if (!entwurf) {
        this.terrain = null
      }
      // Nur eine VORHANDENE Liste übernehmen — fehlt sie in der Antwort
      // (Serverfehler beim Körperbau), bleibt im Entwurf die letzte Szene
      // stehen statt dass alle Bauwerke verschwinden (gleicher Schutz wie
      // beim Gelände oben)
      if (Array.isArray(p.solids)) {
        this.solids = p.solids.map((s) => ({
          patch: s.patch, stl: b64Buffer(s.stl_b64),
        }))
      } else if (!entwurf) {
        this.solids = []
      }
      // Erdkörper: bei sehr großen Rastern lässt der Server ihn weg
      // (koerper_zu_gross) — dann bleibt der letzte Stand stehen, aber als
      // veraltet markiert, sobald sich die Geometrie geändert hat. Braucht
      // der Fall gar keinen Körper mehr, verschwindet er.
      if (p.terrain_solid) {
        this.terrainSolid = { ...p.terrain_solid,
          stl: b64Buffer(p.terrain_solid.stl_b64) }
        this.terrainSolidStale = false
      } else if (p.koerper_zu_gross) {
        this.terrainSolidStale =
          p.koerper_signatur !== this.terrainSolid?.signatur
      } else {
        this.terrainSolid = null
        this.terrainSolidStale = false
      }
      // Serverseitig aufgelöste Regeln (Randflächen, wirksame Fenster,
      // Öffnungslagen) — sie ERSETZEN die früheren Editor-Spiegel der
      // Serverlogik. Fenster: Serverschlüssel (lo/hi, z_w0/z_w1) auf die
      // Editor-Form (span, zw0/zw1) gebracht — eine Stelle, ein Vertrag.
      const fenster = {}
      for (const [id, w] of Object.entries(p.fenster ?? {})) {
        fenster[id] = { ...w, span: [w.lo, w.hi],
          zw0: w.z_w0, zw1: w.z_w1 }
      }
      this.aufgeloest = { bcFaces: p.bc_faces ?? {},
        fenster, oeffnungen: p.oeffnungen ?? {} }
      this.geometryVersion++
    },

    async refreshGeometry() {
      if (!this.activeCaseId) return
      try {
        this.uebernehmeGeometrie(
          await flood3dApi.caseGeometry(this.activeCaseId))
      } catch (e) {
        this.melden(`Geometrie: ${e.message}`, 'fehler')
      }
    },
    async saveCase() {
      this.loading = true
      this.error = ''
      try {
        const result = await flood3dApi.saveCase(this.activeCaseId, this.spec)
        // PUT liefert die Geometrie gleich mit — kein Nachladen mehr
        this.uebernehmeGeometrie(result)
        this.dirty = false
        return true
      } catch (e) {
        this.melden(`Speichern fehlgeschlagen: ${e.message}`, 'fehler')
        return false
      } finally {
        this.loading = false
      }
    },

    select(kind, id) {
      this.selection = { kind, id }
    },

    // Auswahl aufheben (Esc, Klick ins Leere) — vorher konnte `selection`
    // nur durch Löschen/Fallwechsel wieder null werden
    deselect() {
      this.selection = null
    },

    // Live-Vorschau des Entwurfs: nach jeder Änderung (entprellt) Gelände,
    // Bauwerke und Prüfung vom Server holen — OHNE zu speichern. Damit
    // reagiert die 3D-Szene unmittelbar auf Drag und Formularänderungen.
    scheduleDraftPreview() {
      // Ob das Vorschaunetz noch steht, entscheidet der Server anhand des
      // NETZ-Hashes (Antwort in refreshDraftPreview). Hier pauschal auf
      // „veraltet" zu stellen war der Grund, warum die Warnung nach jeder
      // Eingabe stand — auch nach einem geänderten Grenzwert, der kein
      // einziges Netzelement berührt.
      clearTimeout(this._draftTimer)
      this._draftTimer = setTimeout(() => this.refreshDraftPreview(), 350)
    },

    async refreshDraftPreview() {
      if (!this.activeCaseId || !this.spec) return
      const seq = (this._draftSeq = (this._draftSeq ?? 0) + 1)
      try {
        const p = await flood3dApi.casePreview(this.activeCaseId, this.spec)
        if (seq !== this._draftSeq) return
        this.uebernehmeGeometrie(p, { entwurf: true })
      } catch (e) {
        // Netzfehler o. Ä. — die Szene zeigt jetzt einen alten Stand, und
        // das muss sichtbar sein statt nur in einer Fehlerzeile zu stehen
        this.previewStale = true
        this.melden(`Vorschau: ${e.message}`, 'fehler')
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

    startPlatzierung(art, id) {
      this.platzierung = { art, id }
    },

    endPlatzierung() {
      this.platzierung = null
    },

    // Eine gezeichnete Bearbeitung an ein Bauwerk hängen.
    addEdit(id, edit) {
      const st = (this.spec?.structures ?? []).find((o) => o.id === id)
      if (!st) return
      const kopie = JSON.parse(JSON.stringify(st))
      kopie.edits = [...(kopie.edits ?? []), edit]
      this.updateObject('structure', id, kopie)
    },

    // Kraftauswertung je Bauwerk — steht in der Auswertung, nicht am
    // Bauwerk selbst, deshalb ein eigener Weg mit Undo-Eintrag
    setForcePatches(liste) {
      if (!this.spec) return
      this.recordUndo()
      this.spec.evaluation.force_patches = liste
      this.dirty = true
      this.scheduleDraftPreview()
    },

    updateObject(kind, id, updated) {
      // Modellgebiet und Geländebasis sind keine Listeneinträge, aber man
      // muss sie anfassen können wie welche. Die Geländebasis war bisher
      // nur in der Phase „Simulation" erreichbar — getrennt von den
      // Operationen, die genau auf sie wirken.
      const einzeln = { domain: () => this.spec.domain,
        terrain: () => this.spec.terrain?.base }
      if (einzeln[kind]) {
        const ziel = einzeln[kind]()
        if (!ziel) return
        this.recordUndo()
        const { id: _id, type: _t, erdkoerper, erdkoerper_unterkante,
          erdkoerper_ueberstand, ...rest } = updated
        if (kind === 'terrain') {
          if (erdkoerper !== undefined) {
            this.spec.terrain.erdkoerper = erdkoerper
          }
          if (erdkoerper_unterkante !== undefined) {
            this.spec.terrain.erdkoerper_unterkante = erdkoerper_unterkante
          }
          if (erdkoerper_ueberstand !== undefined) {
            this.spec.terrain.erdkoerper_ueberstand = erdkoerper_ueberstand
          }
        }
        Object.assign(ziel, rest)
        this.dirty = true
        this.error = ''
        this.scheduleDraftPreview()
        return
      }
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
        } else if (kind === 'vorfuellung' && this.spec.solver) {
          this.spec.solver.vorfuellungen = []
          list = this.spec.solver.vorfuellungen
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
      // eingefügtes Objekt zurückgeben: id und patch werden hier vergeben,
      // der Aufrufer kennt sie sonst nicht
      return obj
    },

    // `ohneVerfeinerung`: Schnellvorschau ohne die verschachtelte
    // Verfeinerung — schneller, Zellzahl/Kosten sind eine untere Grenze
    async runMeshPreview({ ohneVerfeinerung = false } = {}) {
      this.meshPreviewLoading = true
      this.error = ''
      try {
        if (this.dirty) await this.saveCase()
        this.meshPreview = await flood3dApi.meshPreview(this.activeCaseId,
          ohneVerfeinerung ? { ohne_verfeinerung: true } : {})
        this.meshPreviewStale = false
        return true
      } catch (e) {
        this.melden(`Netzvorschau: ${e.message}`, 'fehler')
        return false
      } finally {
        this.meshPreviewLoading = false
      }
    },

    async startRun() {
      // `loading` ist hier kein Schönheitsfehler: ohne die Sperre startet
      // ein Doppelklick ZWEI Läufe — und ein Lauf kostet Rechenzeit und
      // Geld. Der Knopf war bisher nur gegen den LOKALEN Lauf gesperrt,
      // und `localRunning` ist beim Serverlauf immer false.
      if (this.loading) return
      this.loading = true
      this.error = ''
      try {
        if (this.dirty) await this.saveCase()
        await flood3dApi.startRun(this.activeCaseId)
        this.melden('Lauf gestartet', 'erfolg')
        this.activePhase = 'laeufe'          // dem Lauf direkt zuschauen
        await this.loadCaseRuns()
      } catch (e) {
        this.melden(`Lauf starten: ${e.message}`, 'fehler')
      } finally {
        this.loading = false
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
        this.melden(e.message, 'fehler')
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

    // Ein eingesetztes Rezept als GANZES löschen — ein Undo-Schritt,
    // Aufräumkaskade je Teil (verwaiste Verfeinerungen/Verweise gehen mit)
    loescheGruppe(gruppe) {
      if (!this.spec || !gruppe) return
      const mitglieder = []
      for (const [kind, pfad] of Object.entries(KIND_PATHS)) {
        for (const o of pfad(this.spec) ?? []) {
          if (o.gruppe === gruppe) mitglieder.push({ kind, id: o.id })
        }
      }
      if (!mitglieder.length) return
      if (!window.confirm(
        `Bauwerk „${gruppe}“ mit ${mitglieder.length} Teilen löschen?`)) {
        return
      }
      this.recordUndo()
      let spec = this.spec
      for (const m of mitglieder) {
        const plan = aufraeumplan(spec, m.kind, m.id)
        if (plan.ok) spec = plan.spec
      }
      this.spec = spec
      this.dirty = true
      if (mitglieder.some((m) => m.id === this.selection?.id)) {
        this.selection = null
      }
      this.scheduleDraftPreview()
      this.melden(
        `Bauwerk „${gruppe}“ gelöscht (${mitglieder.length} Teile)`, 'erfolg')
    },

    // Löschen räumt mit auf: ein Nachweiskriterium auf einem gelöschten
    // Pegel, eine Flächenverfeinerung auf einem entfernten Bauwerk, ein
    // Eintrag in der Kraftauswertung — das alles blieb bisher liegen und
    // wurde danach als Fehler gemeldet, den der Bearbeiter selbst suchen
    // musste. EIN Undo-Schritt für die ganze Kaskade.
    removeObject(kind, id) {
      if (!this.spec) return []
      const plan = aufraeumplan(this.spec, kind, id)
      if (!plan.ok) return []
      this.recordUndo()
      this.spec = plan.spec
      this.dirty = true
      if (this.selection?.id === id) this.selection = null
      this.scheduleDraftPreview()

      if (plan.meldungen.length) {
        this.melden(`${plan.entfernt} gelöscht · `
          + plan.meldungen.join(' · '), 'hinweis')
      } else {
        this.melden(`${plan.entfernt} gelöscht`, 'erfolg')
      }
      if (plan.verwaist.length) {
        this.melden(`Im Grundriss des entfernten Objekts liegen noch: `
          + `${plan.verwaist.map((v) => v.label).join(', ')} — falls sie dazu `
          + 'gehörten, jetzt löschen.', 'hinweis')
      }
      return plan.meldungen
    },
  },
})
