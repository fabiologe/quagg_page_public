<template>
  <!-- Sprint P/AP-12: Der frühere `chrome`-Zweig ist entfallen. Er hätte die
       Komponente wahlweise in ein schwebendes DraggableModal gehüllt — ein Weg,
       den seit Sprint U kein Aufrufer mehr nahm (alle setzten `chrome=false`),
       dessen Vorgabewert aber auf `true` stand. Das Chrome liefert jetzt
       ausschließlich CdePanel in der Leiste. -->
  <div class="rail-fill">
    <div class="cockpit">
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
          <CdeIcon class="tab-icon" :name="t.icon" :size="15" />
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
          :overrides="kgOverrides"
          @refresh="recomputeKg"
          @toggle-color-mode="onToggleKgColorMode"
          @select-kg="onSelectKg"
          @select-element="onSelectKgElement"
          @override-kg="onOverrideKg"
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
        <IfcKostenTab
          v-else-if="activeTab === 'kosten'"
          :kgResult="kgResult"
          :kennwerte="kennwerte"
          :pauschalSumme="pauschalSumme"
          :loading="kgLoading"
          @refresh="recomputeKg"
          @update-kennwert="onUpdateKennwert"
        />
        <IfcPauschalTab
          v-else-if="activeTab === 'pauschal'"
        />
        <IfcQualityTab
          v-else-if="activeTab === 'quality'"
          :result="idsResult"
          :loading="idsLoading"
          :befunde="befunde"
          @refresh="recomputeIds"
          @pruefe="pruefeGeometrie"
          @select-element="onSelectKgElement"
        />
<!-- Der Änderungen-Reiter ist zum PANEL „Verlauf" geworden (Teil XII, X1):
     ein Ort für die Versionskontrolle, nicht zwei. -->
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import IfcAreaSchedule from './IfcAreaSchedule.vue';
import CdeIcon from './ui/CdeIcon.vue';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useCdeStore } from '../stores/useCdeStore.js';
import IfcKgEditor     from './IfcKgEditor.vue';
import IfcVolumeTab    from './IfcVolumeTab.vue';
import IfcCountTab     from './IfcCountTab.vue';
import IfcPauschalTab  from './IfcPauschalTab.vue';
import IfcKostenTab    from './IfcKostenTab.vue';
import IfcQualityTab   from './IfcQualityTab.vue';
import { classifyDin277 } from '../services/Din277Classifier.js';
import { classifyKg }     from '../services/KgClassifier.js';
import { summarizeQuantities } from '../services/QuantitySummary.js';
import { KG_DEFAULT_RULES, kgColor } from '../services/Din276Defaults.js';
import { validateIds } from '../services/IdsValidator.js';
import { IDS_DEFAULT_SPECS } from '../services/IdsDefaults.js';
import { mergeKennwerte } from '../services/KgKennwerte.js';
import { repo } from '../services/RepoFacade.js';
import { useViewerApi } from '../composables/viewerApi.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { profilFuer } from '../services/bauform/Typprofile.js';

// Engine-Accessoren per provide/inject aus IfcViewer.vue statt Funktions-Props.
const api = useViewerApi();
const aenderungen = useAenderungen();
const cde = useCdeStore();
const bearbeitung = useBearbeitung();

/**
 * Die Prüfliste über das ganze Modell (Stufe 14.4).
 *
 * Auf Knopfdruck, nicht laufend: die Befunde werden abgeleitet, und über
 * hunderte Bauteile ist das nichts, was bei jedem Bildaufbau laufen soll.
 */
const befunde = ref([]);
function pruefeGeometrie() {
  const masse = aenderungen.wirksamerStand('parametrik');
  befunde.value = api.pruefeAlles?.({
    typprofilFuer: (kategorie) => profilFuer(kategorie, bearbeitung.profilSatz),
    // Eine korrigierte Fliessrichtung gilt auch für die Prüfliste.
    umgekehrtFuer: (globalId) => masse.get(globalId)?.fliessrichtung === 'umgekehrt',
  }) ?? [];
}
// Kein 'close'-Emit mehr: Das Schließen liegt bei CdePanel, das die
// Leiste kennt und den Panel-Store führt.

// `icon` ist der SEMANTISCHE Name aus CdeIcon — derselbe, den die Kachel in
// ihrem Kopf führt. Reiter und Kachelkopf können dadurch nicht auseinander
// laufen; früher stand hier ein Emoji, dort ein anderes.
const tabs = [
  { id: 'areas',    icon: 'areas',    label: 'Flächen',       disabled: false },
  { id: 'kg',       icon: 'kg',       label: 'Kostengruppen', disabled: false },
  { id: 'volume',   icon: 'volume',   label: 'Volumen',       disabled: false },
  { id: 'count',    icon: 'count',    label: 'Stück',         disabled: false },
  { id: 'kosten',   icon: 'kosten',   label: 'Kosten',        disabled: false },
  { id: 'pauschal', icon: 'pauschal', label: 'Pauschal',      disabled: false },
  { id: 'quality',  icon: 'quality',  label: 'BIM-Qualität',  disabled: false },
];
const activeTab = ref('areas');

// ── Card 1: DIN 277 areas ────────────────────────────────────────────────
const areaResult  = ref(null);
const areaLoading = ref(false);
const storeys     = ref([]);
// Wie bei den Kostengruppen: der Stand kommt aus dem Änderungsjournal.
const overrides   = computed(() => aenderungen.din277Stand);
const REPO_KEY_OVERRIDES = 'din277-overrides';   // Altbestand

async function loadOverrides() {
  const alt = await repo.get(REPO_KEY_OVERRIDES);
  if (alt && typeof alt === 'object' && Object.keys(alt).length) {
    await aenderungen.bereit;
    for (const [globalId, classCode] of Object.entries(alt)) {
      await aenderungen.eintragen({ art: 'din277', globalId, nachher: classCode, wer: 'Übernahme' });
    }
    await repo.delete(REPO_KEY_OVERRIDES);
  }
}

// ── Card 2: DIN 276 KG-Klassifikation ────────────────────────────────────
const kgResult     = ref(null);
const kgLoading    = ref(false);
const kgColorMode  = ref(false);
const kgRules      = ref([...KG_DEFAULT_RULES]); // future: user-editable
// Die Handzuweisungen kommen seit Stufe 7 aus dem Änderungsjournal — dort
// steht auch, was VORHER galt, und deshalb lässt sich zurücknehmen. Die Map
// wird daraus abgeleitet; `KgClassifier` merkt davon nichts.
const kgOverrides  = computed(() => aenderungen.kgStand);
const REPO_KEY_KG_OVERRIDES = 'din276-overrides';   // Altbestand, siehe unten
const REPO_KEY_KG_RULES     = 'din276-rules';

async function loadKgPersisted() {
  const rulesStored = await repo.get(REPO_KEY_KG_RULES);
  if (Array.isArray(rulesStored) && rulesStored.length) {
    kgRules.value = rulesStored;
  }
  // Einmalige Übernahme des Altbestands: vor Stufe 7 lagen die Zuweisungen
  // als flache Map unter einem eigenen Schlüssel, ohne Vorzustand. Sie werden
  // als Journaleinträge nachgetragen (vorher = null, weil niemand mehr weiß,
  // was vorher galt) und der alte Schlüssel danach gelöscht.
  const alt = await repo.get(REPO_KEY_KG_OVERRIDES);
  if (alt && typeof alt === 'object' && Object.keys(alt).length) {
    await aenderungen.bereit;
    for (const [globalId, kgCode] of Object.entries(alt)) {
      await aenderungen.eintragen({ art: 'kg', globalId, nachher: kgCode, wer: 'Übernahme' });
    }
    await repo.delete(REPO_KEY_KG_OVERRIDES);
  }
}

async function recomputeKg() {
  if (!api.getCategoryGroups || !api.getFragmentsList || !api.getFragmentsManager) return;
  kgLoading.value = true;
  try {
    kgResult.value = await classifyKg({
      categoryGroups:   api.getCategoryGroups(),
      fragmentsList:    api.getFragmentsList(),
      fragmentsManager: api.getFragmentsManager(),
      rules:            kgRules.value,
      overrides:        kgOverrides.value,
      // T1/E2: Laufmeter erheben, sobald irgendein Kennwert in €/m rechnet
      collectLengths:   Object.values(kennwerte.value).some(k => k?.einheit === 'm'),
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
  if (!api.setElementColors || !kgResult.value) return;
  const colorMap = new Map();
  for (const [kgCode, bucket] of kgResult.value.byKg.entries()) {
    const hex = kgColor(kgCode);
    for (const el of bucket.elements) {
      colorMap.set(`${el.modelId}|${el.localId}`, hex);
    }
  }
  api.setElementColors(colorMap);
}

function onToggleKgColorMode() {
  kgColorMode.value = !kgColorMode.value;
  if (kgColorMode.value) applyKgColors();
  else api.resetElementColors?.();
}

function onSelectKg(kgCode) {
  // Zoom to first element of the selected KG bucket — quick navigation.
  const bucket = kgResult.value?.byKg.get(kgCode);
  const first  = bucket?.elements?.[0];
  if (first) api.zoomToElement?.(first.modelId, first.localId);
}

function onSelectKgElement(el) {
  // Auswählen, nicht nur hinschauen: erst damit zeigt die Toolbox das Bauteil
  // samt seinen Befunden und der Kur dazu.
  if (api.waehleBauteil) api.waehleBauteil(el.modelId, el.localId);
  else api.zoomToElement?.(el.modelId, el.localId);
}

/**
 * B5: Manuelle KG-Zuweisung aus dem Editor. kgCode=null entfernt den
 * Override (zurück zur Regel-Klassifikation). Persistiert via RepoFacade
 * und rechnet sofort neu, damit Tabelle + Farbmodus den Stand zeigen.
 */
async function onOverrideKg({ globalId, kgCode }) {
  // AUCH HIER die Sperre, nicht nur am Auswahlfeld. Eine Sperre, die nur in
  // der Darstellung sitzt, ist keine — sie fällt beim nächsten Umbau der
  // Tabelle weg, und niemand merkt es.
  if (!globalId || !bearbeitung.modusAn) return;
  await aenderungen.eintragen({
    art: 'kg', globalId, nachher: kgCode || null,
    wer: cde.bearbeiter || '',
    modellSha: api.getLoadedModelSha?.() ?? null,
  });
  await recomputeKg();
}

// ── Kosten (Kennwerte × KG-Mengen) ──────────────────────────────────────
const REPO_KEY_KENNWERTE = 'kg-kennwerte';
const kennwerte      = ref(mergeKennwerte(null));
const pauschalSumme  = ref(0);

async function loadKennwerte() {
  kennwerte.value = mergeKennwerte(await repo.get(REPO_KEY_KENNWERTE));
  // Pauschal-Summe für die Gesamtzeile im Kosten-Tab mitlesen
  const pauschal = await repo.get('pauschal-items');
  pauschalSumme.value = Array.isArray(pauschal)
    ? pauschal.reduce((s, p) => s + (Number(p?.amount_eur) || 0), 0)
    : 0;
}
async function onUpdateKennwert({ kgCode, patch }) {
  kennwerte.value = { ...kennwerte.value, [kgCode]: { ...kennwerte.value[kgCode], ...patch } };
  await repo.set(REPO_KEY_KENNWERTE, kennwerte.value);
}

// ── BIM-Qualität (IDS-Prüfung) ──────────────────────────────────────────
const idsResult  = ref(null);
const idsLoading = ref(false);

async function recomputeIds() {
  if (!api.getCategoryGroups || !api.getFragmentsList || !api.getFragmentsManager) return;
  idsLoading.value = true;
  try {
    idsResult.value = await validateIds({
      specs:            IDS_DEFAULT_SPECS,
      categoryGroups:   api.getCategoryGroups(),
      fragmentsList:    api.getFragmentsList(),
      fragmentsManager: api.getFragmentsManager(),
    });
    // Prüf-Zusammenfassung persistieren — Grundlage für spätere Prüfberichte
    repo.set('ids-last-summary', {
      at: Date.now(),
      ...idsResult.value.summary,
    });
  } catch (e) {
    console.error('[Cockpit] IDS validation failed', e);
    idsResult.value = null;
  } finally {
    idsLoading.value = false;
  }
}

// ── Volumen + Stück (shared QuantitySummary) ────────────────────────────
const quantityResult  = ref(null);
const quantityLoading = ref(false);

async function recomputeQuantities() {
  if (!api.getCategoryGroups || !api.getFragmentsList) return;
  quantityLoading.value = true;
  try {
    quantityResult.value = await summarizeQuantities({
      categoryGroups:   api.getCategoryGroups(),
      fragmentsList:    api.getFragmentsList(),
      fragmentsManager: api.getFragmentsManager?.() ?? null,
      perElementKg:     kgResult.value?.perElement ?? null,
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
  const groups = api.getCategoryGroups?.() ?? [];
  const group  = groups.find(g => g.name === category);
  if (!group) return;
  group.groupData.get().then(map => {
    const entries = map instanceof Map ? [...map.entries()] : Object.entries(map);
    for (const [modelId, rawIds] of entries) {
      const localIds = Array.isArray(rawIds) ? rawIds : (rawIds instanceof Set ? [...rawIds] : null);
      if (localIds?.length) {
        api.zoomToElement?.(modelId, localIds[0]);
        return;
      }
    }
  }).catch(() => { /* swallow */ });
}

// ── Card 1: DIN 277 areas ────────────────────────────────────────────────
async function recomputeAreas() {
  if (!api.getCategoryGroups || !api.getFragmentsList || !api.getFragmentsManager) return;
  areaLoading.value = true;
  try {
    const categoryGroups   = api.getCategoryGroups();
    const fragmentsList    = api.getFragmentsList();
    const fragmentsManager = api.getFragmentsManager();
    const spatialTree      = api.getSpatialTree ? await api.getSpatialTree() : null;
    if (api.getStoreyList) {
      try { storeys.value = await api.getStoreyList(); }
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
  api.zoomToElement?.(space.modelId, space.localId);
}

async function onOverrideClass({ globalId, classCode }) {
  // AUCH HIER die Sperre, nicht nur am Auswahlfeld. Eine Sperre, die nur in
  // der Darstellung sitzt, ist keine — sie fällt beim nächsten Umbau der
  // Tabelle weg, und niemand merkt es.
  if (!globalId || !bearbeitung.modusAn) return;
  await aenderungen.eintragen({
    art: 'din277', globalId, nachher: classCode || null,
    wer: cde.bearbeiter || '',
    modellSha: api.getLoadedModelSha?.() ?? null,
  });
  recomputeAreas();
}

onMounted(async () => {
  await Promise.all([loadOverrides(), loadKgPersisted(), loadKennwerte()]);
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
  // Kosten-Tab: Pauschal-Summe auffrischen (kann sich im Pauschal-Tab geändert haben)
  if (t === 'kosten') loadKennwerte();
  // BIM-Qualität: beim ersten Öffnen automatisch prüfen
  if (t === 'quality' && !idsResult.value && !idsLoading.value) recomputeIds();
});
</script>

<style scoped>
/* Sprint U: In der Panel-Leiste füllt die Komponente das Panel-Body */
.rail-fill { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.cockpit {
  display: flex; flex-direction: column;
  height: 100%;
  background: linear-gradient(180deg, var(--cde-float-deep) 0%, var(--cde-float-deeper) 100%);
  color: var(--cde-text);
}
/* Das CSS des entfallenen Modal-Kopfes ist mit ihm weggefallen (Sprint P/AP-12). */

.ck-tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.4rem 0.55rem 0;
  background: var(--cde-tint-weak);
  border-bottom: 1px solid var(--cde-tint-weak);
}
.ck-tab {
  display: flex; align-items: center; gap: 0.3rem;
  padding: 0.4rem 0.7rem 0.45rem;
  background: transparent;
  border: 1px solid transparent;
  border-bottom: none;
  color: var(--cde-text-dim); font-size: 0.78rem;
  cursor: pointer; border-radius: 5px 5px 0 0;
  transition: background 0.1s, color 0.1s;
}
.ck-tab:hover:not(.disabled):not(.active) { background: var(--cde-tint-weak); color: var(--cde-text); }
.ck-tab.active {
  background: var(--cde-tint-weak);
  color: var(--cde-accent);
  border-color: color-mix(in srgb, var(--cde-accent) 30%, transparent);
  border-bottom-color: var(--cde-tint-weak);
}
.ck-tab.disabled { opacity: 0.4; cursor: not-allowed; }
/* Das Reiter-Icon ist jetzt ein SVG, keine Schriftglyphe — es folgt der
   Textfarbe des Reiters und braucht deshalb keine eigene Größe mehr. */
.tab-icon { flex-shrink: 0; }
.tab-soon {
  font-size: 0.55rem; color: var(--cde-warn);
  background: color-mix(in srgb, var(--cde-warn) 15%, transparent);
  padding: 0.05rem 0.3rem; border-radius: 7px;
  margin-left: 0.2rem;
}

.ck-body {
  flex: 1; overflow-y: auto;
  padding: 0.7rem;
}

.placeholder { color: var(--cde-text-dim); text-align: center; padding: 2rem 0.5rem; }
.placeholder p { margin: 0.2rem 0; }
.placeholder .hint { font-size: 0.75rem; color: var(--cde-text-faint); font-style: italic; }
</style>
