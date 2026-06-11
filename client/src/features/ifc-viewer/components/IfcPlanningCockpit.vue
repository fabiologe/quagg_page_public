<template>
  <DraggableModal
    :isOpen="true"
    initialWidth="540px"
    initialHeight="640px"
    initialTop="80px"
    initialLeft="calc(50% - 270px)"
    @close="emit('close')"
  >
    <div class="cockpit">
      <!-- Header -->
      <div class="ck-header">
        <div class="ck-title">
          <span class="ck-icon">📊</span>
          <span>Planungs-Cockpit</span>
          <span class="ck-phase">LP 2–4</span>
        </div>
        <button class="ck-close" @click="emit('close')" title="Schließen">&times;</button>
      </div>

      <!-- Tabs (Karten 1-3 + später 4) -->
      <div class="ck-tabs">
        <button
          v-for="t in tabs"
          :key="t.id"
          class="ck-tab"
          :class="{ active: activeTab === t.id, disabled: t.disabled }"
          :disabled="t.disabled"
          @click="activeTab = t.id"
        >
          <span class="tab-icon">{{ t.icon }}</span>
          <span class="tab-label">{{ t.label }}</span>
          <span v-if="t.disabled" class="tab-soon">bald</span>
        </button>
      </div>

      <!-- Body — active card -->
      <div class="ck-body">
        <IfcAreaSchedule
          v-if="activeTab === 'areas'"
          :result="areaResult"
          :storeys="storeys"
          :loading="areaLoading"
          @refresh="recomputeAreas"
          @select-space="onSelectSpace"
          @override-class="onOverrideClass"
        />
        <IfcKgEditor
          v-else-if="activeTab === 'kg'"
          :result="kgResult"
          :loading="kgLoading"
          :kgColorMode="kgColorMode"
          @refresh="recomputeKg"
          @toggle-color-mode="onToggleKgColorMode"
          @select-kg="onSelectKg"
        />
        <IfcVolumeTab
          v-else-if="activeTab === 'volume'"
          :result="quantityResult"
          :loading="quantityLoading"
          @refresh="recomputeQuantities"
          @select-category="onSelectCategory"
        />
        <IfcCountTab
          v-else-if="activeTab === 'count'"
          :result="quantityResult"
          :loading="quantityLoading"
          @refresh="recomputeQuantities"
          @select-category="onSelectCategory"
        />
        <IfcPauschalTab
          v-else-if="activeTab === 'pauschal'"
        />
        <div v-else-if="activeTab === 'quality'" class="placeholder">
          <p>✅ Karte 3 — BIM-Qualität via IDS</p>
          <p class="hint">Kommt im Sprint danach (1.3).</p>
        </div>
      </div>
    </div>
  </DraggableModal>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import DraggableModal from '@/features/isyifc/components/common/DraggableModal.vue';
import IfcAreaSchedule from './IfcAreaSchedule.vue';
import IfcKgEditor     from './IfcKgEditor.vue';
import IfcVolumeTab    from './IfcVolumeTab.vue';
import IfcCountTab     from './IfcCountTab.vue';
import IfcPauschalTab  from './IfcPauschalTab.vue';
import { classifyDin277 } from '../services/Din277Classifier.js';
import { classifyKg }     from '../services/KgClassifier.js';
import { summarizeQuantities } from '../services/QuantitySummary.js';
import { KG_DEFAULT_RULES, kgColor } from '../services/Din276Defaults.js';
import { repo } from '../services/RepoFacade.js';

const props = defineProps({
  // Engine accessors — like the PDF modal pattern, props in instead of singletons.
  getCategoryGroups:   { type: Function, default: null },
  getFragmentsList:    { type: Function, default: null },
  getFragmentsManager: { type: Function, default: null },
  getSpatialTree:      { type: Function, default: null }, // () => OBC Tree node
  getStoreyList:       { type: Function, default: null }, // () => [{localId, name, elevation}]
  zoomToElement:       { type: Function, default: null }, // (modelId, localId) => void
  // Card 2: KG color mode → recolours the live 3D view by KG code.
  setElementColors:    { type: Function, default: null }, // (Map<`${modelId}|${localId}`, color>) => void
  resetElementColors:  { type: Function, default: null }, // () => void
});
const emit = defineEmits(['close']);

const tabs = [
  { id: 'areas',    icon: '📐', label: 'Flächen',       disabled: false },
  { id: 'kg',       icon: '🏷️', label: 'Kostengruppen', disabled: false },
  { id: 'volume',   icon: '📦', label: 'Volumen',       disabled: false },
  { id: 'count',    icon: '🔢', label: 'Stück',         disabled: false },
  { id: 'pauschal', icon: '💰', label: 'Pauschal',      disabled: false },
  { id: 'quality',  icon: '✅', label: 'BIM-Qualität',  disabled: true },
];
const activeTab = ref('areas');

// ── Card 1: DIN 277 areas ────────────────────────────────────────────────
const areaResult  = ref(null);
const areaLoading = ref(false);
const storeys     = ref([]);
const overrides   = ref(new Map());       // GlobalId → classCode
const REPO_KEY_OVERRIDES = 'din277-overrides';

async function loadOverrides() {
  const stored = await repo.get(REPO_KEY_OVERRIDES);
  if (stored && typeof stored === 'object') {
    overrides.value = new Map(Object.entries(stored));
  }
}
async function saveOverrides() {
  await repo.set(REPO_KEY_OVERRIDES, Object.fromEntries(overrides.value));
}

// ── Card 2: DIN 276 KG-Klassifikation ────────────────────────────────────
const kgResult     = ref(null);
const kgLoading    = ref(false);
const kgColorMode  = ref(false);
const kgRules      = ref([...KG_DEFAULT_RULES]); // future: user-editable
const kgOverrides  = ref(new Map()); // GlobalId → kgCode
const REPO_KEY_KG_OVERRIDES = 'din276-overrides';
const REPO_KEY_KG_RULES     = 'din276-rules';

async function loadKgPersisted() {
  const ovStored = await repo.get(REPO_KEY_KG_OVERRIDES);
  if (ovStored && typeof ovStored === 'object') {
    kgOverrides.value = new Map(Object.entries(ovStored));
  }
  const rulesStored = await repo.get(REPO_KEY_KG_RULES);
  if (Array.isArray(rulesStored) && rulesStored.length) {
    kgRules.value = rulesStored;
  }
}
async function saveKgOverrides() {
  await repo.set(REPO_KEY_KG_OVERRIDES, Object.fromEntries(kgOverrides.value));
}

async function recomputeKg() {
  if (!props.getCategoryGroups || !props.getFragmentsList || !props.getFragmentsManager) return;
  kgLoading.value = true;
  try {
    kgResult.value = await classifyKg({
      categoryGroups:   props.getCategoryGroups(),
      fragmentsList:    props.getFragmentsList(),
      fragmentsManager: props.getFragmentsManager(),
      rules:            kgRules.value,
      overrides:        kgOverrides.value,
    });
    if (kgColorMode.value) applyKgColors();
  } catch (e) {
    console.error('[Cockpit] KG compute failed', e);
    kgResult.value = null;
  } finally {
    kgLoading.value = false;
  }
}

function applyKgColors() {
  if (!props.setElementColors || !kgResult.value) return;
  const colorMap = new Map();
  for (const [kgCode, bucket] of kgResult.value.byKg.entries()) {
    const hex = kgColor(kgCode);
    for (const el of bucket.elements) {
      colorMap.set(`${el.modelId}|${el.localId}`, hex);
    }
  }
  props.setElementColors(colorMap);
}

function onToggleKgColorMode() {
  kgColorMode.value = !kgColorMode.value;
  if (kgColorMode.value) applyKgColors();
  else props.resetElementColors?.();
}

function onSelectKg(kgCode) {
  // Zoom to first element of the selected KG bucket — quick navigation.
  const bucket = kgResult.value?.byKg.get(kgCode);
  const first  = bucket?.elements?.[0];
  if (first) props.zoomToElement?.(first.modelId, first.localId);
}

// ── Volumen + Stück (shared QuantitySummary) ────────────────────────────
const quantityResult  = ref(null);
const quantityLoading = ref(false);

async function recomputeQuantities() {
  if (!props.getCategoryGroups || !props.getFragmentsList) return;
  quantityLoading.value = true;
  try {
    quantityResult.value = await summarizeQuantities({
      categoryGroups: props.getCategoryGroups(),
      fragmentsList:  props.getFragmentsList(),
      perElementKg:   kgResult.value?.perElement ?? null,
    });
  } catch (e) {
    console.error('[Cockpit] quantity summary failed', e);
    quantityResult.value = null;
  } finally {
    quantityLoading.value = false;
  }
}

function onSelectCategory(category) {
  // Zoom to first element of the selected category — same pattern as KG selection.
  const groups = props.getCategoryGroups?.() ?? [];
  const group  = groups.find(g => g.name === category);
  if (!group) return;
  group.groupData.get().then(map => {
    const entries = map instanceof Map ? [...map.entries()] : Object.entries(map);
    for (const [modelId, rawIds] of entries) {
      const localIds = Array.isArray(rawIds) ? rawIds : (rawIds instanceof Set ? [...rawIds] : null);
      if (localIds?.length) {
        props.zoomToElement?.(modelId, localIds[0]);
        return;
      }
    }
  }).catch(() => { /* swallow */ });
}

// ── Card 1: DIN 277 areas ────────────────────────────────────────────────
async function recomputeAreas() {
  if (!props.getCategoryGroups || !props.getFragmentsList || !props.getFragmentsManager) return;
  areaLoading.value = true;
  try {
    const categoryGroups   = props.getCategoryGroups();
    const fragmentsList    = props.getFragmentsList();
    const fragmentsManager = props.getFragmentsManager();
    const spatialTree      = props.getSpatialTree ? await props.getSpatialTree() : null;
    if (props.getStoreyList) {
      try { storeys.value = await props.getStoreyList(); }
      catch { storeys.value = []; }
    }
    areaResult.value = await classifyDin277({
      categoryGroups, fragmentsList, fragmentsManager,
      spatialTree, overrides: overrides.value,
    });
  } catch (e) {
    console.error('[Cockpit] DIN 277 compute failed', e);
    areaResult.value = null;
  } finally {
    areaLoading.value = false;
  }
}

function onSelectSpace(space) {
  if (!space?.modelId || space?.localId == null) return;
  props.zoomToElement?.(space.modelId, space.localId);
}

async function onOverrideClass({ globalId, classCode }) {
  if (!globalId) return;
  overrides.value.set(globalId, classCode);
  await saveOverrides();
  recomputeAreas();
}

onMounted(async () => {
  await Promise.all([loadOverrides(), loadKgPersisted()]);
  recomputeAreas();
  // KG zuerst — perElement-Map wird vom Volumen/Stück-Service als Filter genutzt
  await recomputeKg();
  recomputeQuantities();
});

// Re-apply KG colours when the user switches into the KG tab
watch(activeTab, (t) => {
  if (t === 'kg' && kgColorMode.value) applyKgColors();
  // Quantity-Tabs: nachladen falls noch leer (z.B. wenn Initial-Compute fehlschlug)
  if ((t === 'volume' || t === 'count') && !quantityResult.value && !quantityLoading.value) {
    recomputeQuantities();
  }
});
</script>

<style scoped>
.cockpit {
  display: flex; flex-direction: column;
  height: 100%;
  background: linear-gradient(180deg, #1a2a35 0%, #0d1820 100%);
  color: #cfd8dc;
}
.ck-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.55rem 0.7rem;
  background: rgba(255,255,255,0.05);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  cursor: move;
}
.ck-title { display: flex; align-items: center; gap: 0.45rem; font-weight: 600; font-size: 0.95rem; }
.ck-icon { font-size: 1.1rem; }
.ck-phase {
  font-size: 0.65rem; color: #a5d6a7;
  background: rgba(102,187,106,0.18);
  padding: 0.08rem 0.45rem; border-radius: 8px;
  margin-left: 0.4rem;
}
.ck-close {
  width: 1.8rem; height: 1.8rem;
  background: transparent; color: #b0bec5; border: 1px solid transparent;
  font-size: 1.2rem; cursor: pointer; border-radius: 4px;
}
.ck-close:hover { background: rgba(244,67,54,0.2); color: #ff8a80; }

.ck-tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.4rem 0.55rem 0;
  background: rgba(255,255,255,0.02);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.ck-tab {
  display: flex; align-items: center; gap: 0.3rem;
  padding: 0.4rem 0.7rem 0.45rem;
  background: transparent;
  border: 1px solid transparent;
  border-bottom: none;
  color: #90a4ae; font-size: 0.78rem;
  cursor: pointer; border-radius: 5px 5px 0 0;
  transition: background 0.1s, color 0.1s;
}
.ck-tab:hover:not(.disabled):not(.active) { background: rgba(255,255,255,0.06); color: #cfd8dc; }
.ck-tab.active {
  background: rgba(255,255,255,0.06);
  color: #4fc3f7;
  border-color: rgba(79,195,247,0.3);
  border-bottom-color: rgba(255,255,255,0.06);
}
.ck-tab.disabled { opacity: 0.4; cursor: not-allowed; }
.tab-icon { font-size: 0.95rem; }
.tab-soon {
  font-size: 0.55rem; color: #ffb74d;
  background: rgba(255,183,77,0.15);
  padding: 0.05rem 0.3rem; border-radius: 7px;
  margin-left: 0.2rem;
}

.ck-body {
  flex: 1; overflow-y: auto;
  padding: 0.7rem;
}

.placeholder { color: #90a4ae; text-align: center; padding: 2rem 0.5rem; }
.placeholder p { margin: 0.2rem 0; }
.placeholder .hint { font-size: 0.75rem; color: #607d8b; font-style: italic; }
</style>
