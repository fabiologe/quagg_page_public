import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { cloneDefaults } from '../services/DefaultLineStyles.js';
import { BUILT_IN_PRESETS } from '../services/VectorStylePresets.js';
import { styleToLegacy } from '../services/VectorStyleEngine.js';
import { repo } from '../services/RepoFacade.js';

/**
 * Trailing-edge debounce with a sync flush hook. Used to batch persistence
 * writes triggered by rapid edits (style editor sliders, label-template typing).
 * The wrapped function fires once after `ms` of quiet; .flush() runs it now.
 */
function _debounce(fn, ms) {
  let t = null;
  const wrapped = (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, ms);
  };
  wrapped.flush = () => { if (t) { clearTimeout(t); t = null; fn(); } };
  return wrapped;
}

// ── Persistenz-Keys (RepoFacade, Scope 'global') ────────────────────────────
// Stufe B: alle Direktzugriffe auf localStorage sind auf die RepoFacade
// migriert. Die alten `ifc-viewer-*`-localStorage-Keys werden einmalig
// übernommen und danach gelöscht.
const REPO_SAVED_VIEWS   = 'saved-views';
const REPO_DIMENSIONS    = 'plan-dimensions';
const REPO_MESSUNGEN     = 'messungen';
const REPO_VECTOR_STYLES = 'vector-styles';
const REPO_VECTOR_RULES  = 'vector-rules';
const REPO_STYLES_MODEL  = 'vector-styles-by-model';
const REPO_PRESETS       = 'vector-style-presets';
const REPO_ANN_PREFIX    = 'annotations:';

const LEGACY_KEYS = {
  [REPO_SAVED_VIEWS]:   'ifc-viewer-saved-views',
  [REPO_VECTOR_STYLES]: 'ifc-viewer-vector-styles',
  [REPO_VECTOR_RULES]:  'ifc-viewer-vector-rules',
  [REPO_STYLES_MODEL]:  'ifc-viewer-vector-styles-by-model',
  [REPO_PRESETS]:       'ifc-viewer-vector-style-presets',
};

/**
 * Repo-Wert lesen; fehlt er, den alten localStorage-Key übernehmen (einmalige
 * Migration) und danach löschen. Gibt null zurück, wenn beides leer ist.
 */
async function _loadWithLegacy(repoKey, legacyLsKey) {
  const stored = await repo.get(repoKey);
  if (stored != null) return stored;
  if (typeof localStorage === 'undefined' || !legacyLsKey) return null;
  try {
    const raw = localStorage.getItem(legacyLsKey);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    await repo.set(repoKey, parsed);
    localStorage.removeItem(legacyLsKey);
    return parsed;
  } catch { return null; }
}

export const useIfcStore = defineStore('cde-modell', () => {
  const selectedElement = ref(null);
  // Fehlertext beim Anlegen eines Merkmalssatzes. Der Store HAELT ihn nur —
  // gesetzt wird er vom Aufrufer (Sprint I/Stufe 5: die Komponenten sprechen
  // die viewerApi direkt an, statt ueber hinterlegte Store-Rueckrufe).
  const psetError       = ref(null);
  const modelLoaded     = ref(false);

  // Spatial tree (set after IFC load)
  const spatialTree = ref(null);

  // Loaded model list [{modelId, name}]
  const modelList = ref([]);
    /**
     * Zählt hoch, wenn eine ANGEWANDTE Änderung die Geometrie berührt hat
     * (FormSchreiber-Verdrahtung, Stufe 16). Der Lageplan hängt daran: seine
     * gesammelten Inhalte (Umrisse, Achsen, Gelände) sind teuer und werden
     * nur entwertet, wenn sich wirklich Geometrie geändert hat.
     */
    const geometrieStand = ref(0);
    function bumpGeometrieStand() { geometrieStand.value++; }

  // Engine actions registered by IfcViewer
  let _searchIndex    = ref([]); // populated on model load — [{name, globalId, category, localId, modelId}]

  // T2.2: Saved views (camera + visible cats + section)
  const savedViews = ref([]);
  const _persistSavedViews = _debounce(() => {
    repo.set(REPO_SAVED_VIEWS, JSON.parse(JSON.stringify(savedViews.value)));
  }, 250);
  function saveView(name, viewState) {
    if (!name || !viewState) return;
    const id = Date.now().toString(36);
    savedViews.value.push({ id, name: name.trim(), createdAt: Date.now(), state: viewState });
    _persistSavedViews();
  }
  function deleteSavedView(id) {
    savedViews.value = savedViews.value.filter(v => v.id !== id);
    _persistSavedViews();
  }
  function renameSavedView(id, newName) {
    const v = savedViews.value.find(x => x.id === id);
    if (v) { v.name = newName.trim(); _persistSavedViews(); }
  }

  // ── Messstrecken im 3D (Sprint I, Stufe 5) ───────────────────────────────
  //
  // Reine Daten [{p1, p2, dist}]. Lagen als Ref in IfcViewer.vue, obwohl zwei
  // Konsumenten AUSSERHALB der Komponente sie lesen (HUD und Planexport) und
  // sie eine Sitzung überleben sollten — taten sie nicht. Muster wie
  // savedViews: entprellt über die RepoFacade.
  //
  // Damit verschwindet zugleich das dritte Messungs-Register: die Engine
  // führte in `_measurements` eine eigene Liste, die zuletzt niemand las.
  const messungen = ref([]);
  const _persistMessungen = _debounce(() => {
    repo.set(REPO_MESSUNGEN, JSON.parse(JSON.stringify(messungen.value)));
  }, 250);

  function addMessung(p1, p2, dist) {
    messungen.value.push({ p1, p2, dist });
    _persistMessungen();
  }
  function removeMessung(index) {
    messungen.value = messungen.value.filter((_, i) => i !== index);
    _persistMessungen();
  }
  function clearMessungen() {
    messungen.value = [];
    _persistMessungen();
  }

  // ── Bemaßung im Lageplan (Sprint I, AP-10) ───────────────────────────────
  //
  // In WELTKOORDINATEN (Welt-XZ), nicht in Prozent der Zeichenfläche. Die alte
  // Prozent-Verankerung im Exporter überlebte jeden Schwenk und jeden
  // Maßstabswechsel: das Maß stand danach an einer anderen Stelle des Modells
  // und behauptete dort weiter seinen alten Wert. Ein Maß, das am falschen Ort
  // das Richtige sagt, ist schlimmer als keines.
  //
  // Persistenzmuster wie savedViews: entprellt über die RepoFacade, damit das
  // Setzen mehrerer Maße nicht in ebenso viele Schreibvorgänge läuft.
  const planDimensions = ref([]);
  const _persistDimensions = _debounce(() => {
    repo.set(REPO_DIMENSIONS, JSON.parse(JSON.stringify(planDimensions.value)));
  }, 250);

  /**
   * Maßkette anlegen.
   * @param {{x:number,z:number}} p1 Weltpunkt
   * @param {{x:number,z:number}} p2 Weltpunkt
   */
  function addPlanDimension(p1, p2) {
    if (!p1 || !p2) return null;
    const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    // Ein Doppelklick erzeugt sonst ein Maß der Länge 0, das man kaum
    // wieder anklicken kann, um es loszuwerden.
    if (!(dist > 1e-4)) return null;
    const eintrag = {
      id: 'dim-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      p1: { x: p1.x, z: p1.z }, p2: { x: p2.x, z: p2.z }, dist,
    };
    planDimensions.value.push(eintrag);
    _persistDimensions();
    return eintrag;
  }

  function removePlanDimension(id) {
    planDimensions.value = planDimensions.value.filter(d => d.id !== id);
    _persistDimensions();
  }

  function clearPlanDimensions() {
    planDimensions.value = [];
    _persistDimensions();
  }

  // T2.4 → Issues: Annotationen sind vollwertige Projekt-Issues (BCF-nah):
  // Status, Zuständigkeit, Fälligkeit, Kommentar-Thread, Viewpoint (Kamera).
  // Schlüssel ist der stabile Modell-Key (IfcProject.GlobalId bzw. SHA-256),
  // NICHT der Dateiname.
  // Shape: [{ id, idx, position, text, color, labelOffset,
  //           status: 'open'|'in-progress'|'closed', assignee, dueDate,
  //           author, createdAt, comments: [{author, text, createdAt}],
  //           viewpoint: engine.captureView()-Objekt | null }]
  const annotations = ref([]);
  let _currentAnnKey = null;

  /** Altbestände (reine Notizen) auf das Issue-Schema heben. */
  function _normalizeIssue(a, i) {
    return {
      ...a,
      idx:        a.idx ?? i + 1,
      status:     a.status ?? 'open',
      assignee:   a.assignee ?? '',
      dueDate:    a.dueDate ?? null,
      author:     a.author ?? '',
      createdAt:  a.createdAt ?? null,
      comments:   Array.isArray(a.comments) ? a.comments : [],
      viewpoint:  a.viewpoint ?? null,
      color:      a.color ?? '#e91e63',
      labelOffset: a.labelOffset ?? [40, -60],
    };
  }

  const _persistAnnotations = _debounce(() => {
    if (!_currentAnnKey) return;
    repo.set(_currentAnnKey, JSON.parse(JSON.stringify(annotations.value)));
  }, 250);

  /**
   * @param {string} modelKey   stabiler Schlüssel (GlobalId/Hash)
   * @param {string} legacyName Dateiname — nur für die einmalige Übernahme
   *                            alter `ifc-viewer-annotations:<Name>`-Bestände
   */
  async function loadAnnotationsForModel(modelKey, legacyName = null) {
    _currentAnnKey = REPO_ANN_PREFIX + (modelKey || 'default');
    const legacyLsKey = legacyName ? `ifc-viewer-annotations:${legacyName}` : null;
    const stored = await _loadWithLegacy(_currentAnnKey, legacyLsKey);
    annotations.value = (Array.isArray(stored) ? stored : []).map(_normalizeIssue);
    return annotations.value;
  }
  function pushAnnotation(ann) {
    annotations.value.push(_normalizeIssue(ann, annotations.value.length));
    _persistAnnotations();
  }

  /** Generisches Issue-Update: status, assignee, dueDate, text, … */
  function updateAnnotation(id, patch) {
    const a = annotations.value.find(x => x.id === id);
    if (a) { Object.assign(a, patch); _persistAnnotations(); }
  }

  /** Kommentar an ein Issue anhängen (Thread). */
  function addAnnotationComment(id, { author = '', text = '' } = {}) {
    const a = annotations.value.find(x => x.id === id);
    if (!a || !text.trim()) return false;
    a.comments.push({ author, text: text.trim(), createdAt: Date.now() });
    _persistAnnotations();
    return true;
  }
  function removeAnnotation(id) {
    annotations.value = annotations.value.filter(a => a.id !== id);
    // Renumber
    annotations.value.forEach((a, i) => { a.idx = i + 1; });
    _persistAnnotations();
  }
  function updateAnnotationText(id, text) {
    const a = annotations.value.find(x => x.id === id);
    if (a) { a.text = text; _persistAnnotations(); }
  }
  function updateAnnotationColor(id, color) {
    const a = annotations.value.find(x => x.id === id);
    if (a) { a.color = color; _persistAnnotations(); }
  }
  function updateAnnotationOffset(id, offset) {
    const a = annotations.value.find(x => x.id === id);
    if (a) { a.labelOffset = offset; _persistAnnotations(); }
  }
  function clearAnnotations() {
    annotations.value = [];
    _persistAnnotations();
  }

  /** Export current annotations as a JSON Blob for download. */
  function exportAnnotationsJSON() {
    const payload = {
      schema:     'ifc-viewer-annotations/v1',
      exportedAt: new Date().toISOString(),
      modelKey:   _currentAnnKey,
      annotations: annotations.value,
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  }
  function importAnnotationsJSON(jsonText) {
    try {
      const data = JSON.parse(jsonText);
      const arr  = Array.isArray(data) ? data : data.annotations;
      if (!Array.isArray(arr)) return false;
      // Renumber idx so they're sequential + auf Issue-Schema normalisieren
      annotations.value = arr.map((a, i) => _normalizeIssue({ ...a, idx: i + 1 }, i));
      _persistAnnotations();
      return true;
    } catch { return false; }
  }

  // ── Sprint 2: Vector Style Manager (per-category styles, persisted) ────────
  const vectorStyles = ref(cloneDefaults());
  const _persistVectorStyles = _debounce(() => {
    repo.set(REPO_VECTOR_STYLES, JSON.parse(JSON.stringify(vectorStyles.value)));
  }, 250);
  function setVectorStyle(category, patch) {
    const current = vectorStyles.value[category] ?? vectorStyles.value.default ?? {};
    vectorStyles.value = { ...vectorStyles.value, [category]: { ...current, ...patch } };
    _persistVectorStyles();
  }
  function setVectorStylesBulk(categories, patch) {
    const next = { ...vectorStyles.value };
    for (const cat of categories) {
      const current = next[cat] ?? next.default ?? {};
      next[cat] = { ...current, ...patch };
    }
    vectorStyles.value = next;
    _persistVectorStyles();
  }
  function resetVectorStyle(category) {
    const defaults = cloneDefaults();
    const next = { ...vectorStyles.value };
    if (defaults[category]) next[category] = defaults[category];
    else                    delete next[category];
    vectorStyles.value = next;
    _persistVectorStyles();
  }
  function resetAllVectorStyles() {
    vectorStyles.value = cloneDefaults();
    _persistVectorStyles();
  }

  // ── Sprint 2.2: Vector Rules (Pset/Attribute-driven style overrides) ───────
  const vectorRules = ref([]);
  const _persistVectorRules = _debounce(() => {
    repo.set(REPO_VECTOR_RULES, JSON.parse(JSON.stringify(vectorRules.value)));
  }, 250);
  function addVectorRule(rule) {
    const id = 'rule-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    vectorRules.value = [...vectorRules.value, {
      id,
      name:      rule?.name      ?? 'Neue Regel',
      enabled:   rule?.enabled   ?? true,
      priority:  rule?.priority  ?? 10,
      condition: rule?.condition ?? { category: '', psetName: '', propertyName: '', operator: 'equals', value: '' },
      style:     rule?.style     ?? { color: '#000000', lineWidth: 0.35, lineDash: 'solid', hatchPattern: 'none' },
    }];
    _persistVectorRules();
    return id;
  }
  function updateVectorRule(id, patch) {
    vectorRules.value = vectorRules.value.map(r => r.id === id ? { ...r, ...patch } : r);
    _persistVectorRules();
  }
  function deleteVectorRule(id) {
    vectorRules.value = vectorRules.value.filter(r => r.id !== id);
    _persistVectorRules();
  }
  function toggleVectorRule(id) {
    vectorRules.value = vectorRules.value.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
    _persistVectorRules();
  }

  // ── Sprint 2.3: Per-Model overrides + named presets ────────────────────────
  // vectorStylesByModel: { [modelId]: { [category]: style } }  — partial; categories
  // not present in the override map fall through to the global vectorStyles.
  const vectorStylesByModel = ref({});
  const _persistModelStyles = _debounce(() => {
    repo.set(REPO_STYLES_MODEL, JSON.parse(JSON.stringify(vectorStylesByModel.value)));
  }, 250);
  function setVectorStyleForModel(modelId, category, patch) {
    if (!modelId) return;
    const next = { ...vectorStylesByModel.value };
    const modelMap = { ...(next[modelId] ?? {}) };
    const current = modelMap[category] ?? vectorStyles.value[category] ?? vectorStyles.value.default ?? {};
    modelMap[category] = { ...current, ...patch };
    next[modelId] = modelMap;
    vectorStylesByModel.value = next;
    _persistModelStyles();
  }
  function clearModelOverrides(modelId) {
    if (!modelId) return;
    const next = { ...vectorStylesByModel.value };
    delete next[modelId];
    vectorStylesByModel.value = next;
    _persistModelStyles();
  }
  function clearModelOverride(modelId, category) {
    if (!modelId) return;
    const cur = vectorStylesByModel.value[modelId];
    if (!cur) return;
    const m = { ...cur };
    delete m[category];
    const next = { ...vectorStylesByModel.value };
    if (Object.keys(m).length) next[modelId] = m;
    else                       delete next[modelId];
    vectorStylesByModel.value = next;
    _persistModelStyles();
  }

  // Shared style-resolver getters — consumed by PDF export + style editor.
  // Single source of truth for the legacy-shape map the renderer expects.
  const resolvedVectorStyleMap = computed(() => {
    const out = {};
    for (const cat of Object.keys(vectorStyles.value)) {
      out[cat] = styleToLegacy(vectorStyles.value[cat]);
    }
    return out;
  });
  const resolvedVectorStyleMapByModel = computed(() => {
    const out = {};
    for (const [modelId, override] of Object.entries(vectorStylesByModel.value)) {
      const merged = { ...vectorStyles.value, ...override };
      const legacy = {};
      for (const cat of Object.keys(merged)) legacy[cat] = styleToLegacy(merged[cat]);
      out[modelId] = legacy;
    }
    return out;
  });

  // ── Named presets ──────────────────────────────────────────────────────────
  // Built-ins are merged with user-saved presets. User can save the current
  // global style map under a name, load any preset (replacing or merging), and
  // delete custom presets.
  const userPresets = ref([]);
  const _persistUserPresets = _debounce(() => {
    repo.set(REPO_PRESETS, JSON.parse(JSON.stringify(userPresets.value)));
  }, 250);
  function allPresets() {
    return [...BUILT_IN_PRESETS, ...userPresets.value];
  }
  function saveCurrentAsPreset(name) {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return null;
    const id = 'preset-' + Date.now().toString(36);
    const snapshot = JSON.parse(JSON.stringify(vectorStyles.value));
    userPresets.value = [...userPresets.value, {
      id, name: trimmed, styles: snapshot, builtin: false, createdAt: Date.now(),
    }];
    _persistUserPresets();
    return id;
  }
  function deleteUserPreset(id) {
    userPresets.value = userPresets.value.filter(p => p.id !== id);
    _persistUserPresets();
  }
  function loadPreset(id, { merge = true } = {}) {
    const preset = allPresets().find(p => p.id === id);
    if (!preset) return false;
    if (merge) {
      vectorStyles.value = { ...vectorStyles.value, ...preset.styles };
    } else {
      vectorStyles.value = { ...cloneDefaults(), ...preset.styles };
    }
    _persistVectorStyles();
    return true;
  }

  // ── Initiales Laden aus der RepoFacade (inkl. Legacy-Übernahme) ────────────
  // Refs starten mit Defaults und werden asynchron gefüllt — alle Konsumenten
  // sind reaktiv. `ready` erlaubt Aufrufern, auf den Ladevorgang zu warten.
  async function _initPersistence() {
    const [views, styles, rules, byModel, presets, dims, mess] = await Promise.all([
      _loadWithLegacy(REPO_SAVED_VIEWS,   LEGACY_KEYS[REPO_SAVED_VIEWS]),
      _loadWithLegacy(REPO_VECTOR_STYLES, LEGACY_KEYS[REPO_VECTOR_STYLES]),
      _loadWithLegacy(REPO_VECTOR_RULES,  LEGACY_KEYS[REPO_VECTOR_RULES]),
      _loadWithLegacy(REPO_STYLES_MODEL,  LEGACY_KEYS[REPO_STYLES_MODEL]),
      _loadWithLegacy(REPO_PRESETS,       LEGACY_KEYS[REPO_PRESETS]),
      // Kein Legacy-Weg: die Bemaßung gab es vorher nur flüchtig im Modal.
      repo.get(REPO_DIMENSIONS),
      repo.get(REPO_MESSUNGEN),
    ]);
    if (Array.isArray(views)) savedViews.value = views;
    if (styles && typeof styles === 'object') {
      // Merge: gespeicherte Stile übersteuern Defaults; Defaults liefern
      // fehlende Kategorien nach (z. B. nach App-Updates).
      vectorStyles.value = { ...cloneDefaults(), ...styles };
    }
    if (Array.isArray(rules)) vectorRules.value = rules;
    if (byModel && typeof byModel === 'object') vectorStylesByModel.value = byModel;
    if (Array.isArray(presets)) userPresets.value = presets;
    if (Array.isArray(dims)) planDimensions.value = dims;
    if (Array.isArray(mess)) messungen.value = mess;
  }
  const ready = _initPersistence();

  function setElement(el) {
    selectedElement.value = el;
    psetError.value = null;
  }

  function clearElement() {
    selectedElement.value = null;
    psetError.value = null;
  }

  function setPsetError(msg) {
    psetError.value = msg;
  }

  function setSpatialTree(tree) {
    spatialTree.value = tree;
  }

  function setModelList(list) {
    modelList.value = list;
  }


  function setSearchIndex(entries) { _searchIndex.value = entries; }
  function getSearchIndex() { return _searchIndex.value; }




  // Ausstehende Debounce-Writes anstoßen, wenn der Tab schließt oder in den
  // Hintergrund geht. visibilitychange feuert früher und zuverlässiger als
  // beforeunload — bei IndexedDB zählt jede Millisekunde Vorlauf.
  function _flushAll() {
    _persistSavedViews.flush();
    _persistAnnotations.flush();
    _persistVectorStyles.flush();
    _persistVectorRules.flush();
    _persistModelStyles.flush();
    _persistUserPresets.flush();
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', _flushAll);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') _flushAll();
    });
  }

  return {
    selectedElement, psetError, modelLoaded, spatialTree, modelList,
    geometrieStand, bumpGeometrieStand,
    ready,
    setElement, clearElement, setPsetError,
    setSpatialTree, setModelList,
    setSearchIndex, getSearchIndex,
    // T2.2: Saved Views
    savedViews, saveView, deleteSavedView, renameSavedView,
    // T2.4 → Issues (Annotationen mit Status/Zuständigkeit/Kommentaren/Viewpoint)
    planDimensions, addPlanDimension, removePlanDimension, clearPlanDimensions,
    messungen, addMessung, removeMessung, clearMessungen,
    annotations, loadAnnotationsForModel, pushAnnotation, removeAnnotation,
    updateAnnotationText, updateAnnotationColor, updateAnnotationOffset,
    updateAnnotation, addAnnotationComment,
    clearAnnotations, exportAnnotationsJSON, importAnnotationsJSON,
    // Sprint 2: Vector styles
    vectorStyles, setVectorStyle, setVectorStylesBulk, resetVectorStyle, resetAllVectorStyles,
    // Sprint 2.2: Vector rules
    vectorRules, addVectorRule, updateVectorRule, deleteVectorRule, toggleVectorRule,
    // Sprint 2.3: Per-model + presets
    vectorStylesByModel, setVectorStyleForModel, clearModelOverrides, clearModelOverride,
    userPresets, allPresets, saveCurrentAsPreset, deleteUserPreset, loadPreset,
    // Computed resolvers consumed by PDF export + style editor
    resolvedVectorStyleMap, resolvedVectorStyleMapByModel,
  };
});
