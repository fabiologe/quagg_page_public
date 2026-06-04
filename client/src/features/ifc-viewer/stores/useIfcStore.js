import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { cloneDefaults } from '../services/DefaultLineStyles.js';
import { BUILT_IN_PRESETS } from '../services/VectorStylePresets.js';
import { styleToLegacy } from '../services/VectorStyleEngine.js';

/**
 * Trailing-edge debounce with a sync flush hook. Used to batch localStorage
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

export const useIfcStore = defineStore('ifc-viewer', () => {
  const selectedElement = ref(null);
  const psetError       = ref(null);
  const modelLoaded     = ref(false);

  // Spatial tree (set after IFC load)
  const spatialTree = ref(null);

  // Loaded model list [{modelId, name}]
  const modelList = ref([]);

  // Engine actions registered by IfcViewer
  let _psetHandler    = null;
  let _storeyHandler  = null;
  let _zoomHandler    = null;
  let _zoomCategoryHandler = null;
  let _boxHandler     = null; // (localId, modelId) → { box: THREE.Box3, offset: THREE.Vector3 }
  let _searchIndex    = ref([]); // populated on model load — [{name, globalId, category, localId, modelId}]

  // T2.2: Saved views (camera + visible cats + section)
  const SAVED_VIEWS_KEY = 'ifc-viewer-saved-views';
  const savedViews = ref(_loadSavedViews());
  function _loadSavedViews() {
    try { return JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) || '[]'); }
    catch { return []; }
  }
  const _persistSavedViews = _debounce(() => {
    try { localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(savedViews.value)); }
    catch { /* quota */ }
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

  // T2.4: Annotations (per-IFC, key by first-loaded model name)
  const ANN_KEY_PREFIX = 'ifc-viewer-annotations:';
  const annotations = ref([]); // [{id, position, text, idx}]
  let _currentAnnKey = null;

  function _loadAnnotations(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch { return []; }
  }
  const _persistAnnotations = _debounce(() => {
    if (!_currentAnnKey) return;
    try { localStorage.setItem(_currentAnnKey, JSON.stringify(annotations.value)); }
    catch { /* */ }
  }, 250);
  function loadAnnotationsForModel(modelName) {
    _currentAnnKey = ANN_KEY_PREFIX + (modelName || 'default');
    annotations.value = _loadAnnotations(_currentAnnKey);
  }
  function pushAnnotation(ann) {
    annotations.value.push(ann);
    _persistAnnotations();
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
      // Renumber idx so they're sequential
      annotations.value = arr.map((a, i) => ({
        ...a,
        idx: i + 1,
        labelOffset: a.labelOffset ?? [40, -60],
        color:       a.color       ?? '#e91e63',
      }));
      _persistAnnotations();
      return true;
    } catch { return false; }
  }

  // ── Sprint 2: Vector Style Manager (per-category styles, persisted) ────────
  const VECTOR_STYLES_KEY = 'ifc-viewer-vector-styles';
  function _loadVectorStyles() {
    try {
      const saved = JSON.parse(localStorage.getItem(VECTOR_STYLES_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        // Merge: saved overrides defaults; defaults supply any missing categories
        return { ...cloneDefaults(), ...saved };
      }
    } catch { /* fall through */ }
    return cloneDefaults();
  }
  const vectorStyles = ref(_loadVectorStyles());
  const _persistVectorStyles = _debounce(() => {
    try { localStorage.setItem(VECTOR_STYLES_KEY, JSON.stringify(vectorStyles.value)); }
    catch { /* quota */ }
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
  const VECTOR_RULES_KEY = 'ifc-viewer-vector-rules';
  function _loadVectorRules() {
    try {
      const arr = JSON.parse(localStorage.getItem(VECTOR_RULES_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  const vectorRules = ref(_loadVectorRules());
  const _persistVectorRules = _debounce(() => {
    try { localStorage.setItem(VECTOR_RULES_KEY, JSON.stringify(vectorRules.value)); }
    catch { /* */ }
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
  const VECTOR_STYLES_MODEL_KEY = 'ifc-viewer-vector-styles-by-model';
  function _loadModelStyles() {
    try { return JSON.parse(localStorage.getItem(VECTOR_STYLES_MODEL_KEY) || '{}'); }
    catch { return {}; }
  }
  const vectorStylesByModel = ref(_loadModelStyles());
  const _persistModelStyles = _debounce(() => {
    try { localStorage.setItem(VECTOR_STYLES_MODEL_KEY, JSON.stringify(vectorStylesByModel.value)); }
    catch { /* */ }
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
  const VECTOR_PRESETS_KEY = 'ifc-viewer-vector-style-presets';
  function _loadUserPresets() {
    try {
      const arr = JSON.parse(localStorage.getItem(VECTOR_PRESETS_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  const userPresets = ref(_loadUserPresets());
  const _persistUserPresets = _debounce(() => {
    try { localStorage.setItem(VECTOR_PRESETS_KEY, JSON.stringify(userPresets.value)); }
    catch { /* */ }
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

  function registerPsetHandler(fn) {
    _psetHandler = fn;
  }

  function registerSpatialHandler(fn) {
    _storeyHandler = fn;
  }

  function registerZoomHandler(fn) { _zoomHandler = fn; }
  function registerZoomCategoryHandler(fn) { _zoomCategoryHandler = fn; }
  function registerBoxHandler(fn) { _boxHandler = fn; }

  /**
   * Get bridge-ready data for a selected IFC element.
   * Returns { box: THREE.Box3, offset: THREE.Vector3, modelId } or null.
   */
  async function getElementBridgeData(localId, modelId) {
    if (!_boxHandler) return null;
    return await _boxHandler(localId, modelId);
  }
  function setSearchIndex(entries) { _searchIndex.value = entries; }
  function getSearchIndex() { return _searchIndex.value; }

  async function zoomToElement(localId, modelId) {
    await _zoomHandler?.(localId, modelId);
  }
  async function zoomToCategory(name) {
    await _zoomCategoryHandler?.(name);
  }

  async function addPset(psetName, props) {
    if (!_psetHandler) { psetError.value = 'Kein Viewer verbunden'; return; }
    await _psetHandler(psetName, props);
  }

  async function setStoreyVisible(localId, visible) {
    await _storeyHandler?.(localId, visible);
  }

  // Flush pending debounced writes if the user closes the tab quickly after editing.
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      _persistSavedViews.flush();
      _persistAnnotations.flush();
      _persistVectorStyles.flush();
      _persistVectorRules.flush();
      _persistModelStyles.flush();
      _persistUserPresets.flush();
    });
  }

  return {
    selectedElement, psetError, modelLoaded, spatialTree, modelList,
    setElement, clearElement, setPsetError,
    setSpatialTree, setModelList,
    registerPsetHandler, registerSpatialHandler,
    registerZoomHandler, registerZoomCategoryHandler,
    registerBoxHandler,
    setSearchIndex, getSearchIndex,
    addPset, setStoreyVisible,
    zoomToElement, zoomToCategory,
    getElementBridgeData,
    // T2.2: Saved Views
    savedViews, saveView, deleteSavedView, renameSavedView,
    // T2.4: Annotations
    annotations, loadAnnotationsForModel, pushAnnotation, removeAnnotation,
    updateAnnotationText, updateAnnotationColor, updateAnnotationOffset,
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
