<template>
  <Transition name="fade">
    <div v-if="open" class="vse-overlay" @mousedown.self="emit('close')">
      <div class="vse-modal">
        <div class="vse-header">
          <span class="vse-title">🎨 Linienstil-Editor</span>
          <div class="vse-tabs">
            <button class="vse-tab" :class="{ active: tab === 'categories' }" @click="tab = 'categories'">Kategorien</button>
            <button class="vse-tab" :class="{ active: tab === 'rules' }"      @click="tab = 'rules'">
              Regeln <span class="vse-tab-badge" v-if="ifc.vectorRules.length">{{ ifc.vectorRules.length }}</span>
            </button>
          </div>
          <div class="vse-header-actions">
            <button v-if="tab === 'categories'" class="vse-btn vse-btn--ghost" @click="onResetAll" title="Auf Default zurück">
              ↻ Alle zurücksetzen
            </button>
            <button class="vse-close" @click="emit('close')">✕</button>
          </div>
        </div>

        <!-- ── CATEGORIES TAB ── -->
        <template v-if="tab === 'categories'">

        <!-- Presets + Per-Model bar -->
        <div class="vse-presets">
          <span class="vse-presets-lbl">Preset:</span>
          <select :value="''" @change="onLoadPreset">
            <option value="" disabled>Laden…</option>
            <optgroup label="Vorgaben">
              <option v-for="p in builtInPresets" :key="p.id" :value="p.id">{{ p.name }}</option>
            </optgroup>
            <optgroup v-if="ifc.userPresets.length" label="Eigene">
              <option v-for="p in ifc.userPresets" :key="p.id" :value="p.id">{{ p.name }}</option>
            </optgroup>
          </select>
          <button class="vse-btn vse-btn--ghost" @click="onSavePreset" title="Aktuelle Stile als Preset speichern">💾 Als Preset…</button>
          <button v-if="ifc.userPresets.length" class="vse-btn vse-btn--ghost" @click="onDeleteUserPreset">🗑 Eigenes löschen</button>

          <span class="vse-sep">|</span>
          <span class="vse-presets-lbl">Wirkt für:</span>
          <select v-model="scopeModelId">
            <option value="">Alle Modelle (global)</option>
            <option v-for="m in modelList" :key="m.modelId" :value="m.modelId">{{ m.name }}</option>
          </select>
          <button v-if="scopeModelId" class="vse-btn vse-btn--ghost" @click="onClearModel">↻ Modell-Override entfernen</button>
        </div>

        <div class="vse-toolbar">
          <input v-model="filterText" placeholder="Kategorie suchen…" class="vse-search" />
          <span class="vse-count">{{ filteredRows.length }} / {{ rows.length }}</span>
          <span class="vse-sep">|</span>
          <button
            class="vse-btn vse-btn--ghost"
            :disabled="!hasSelection"
            @click="onSelectNone"
          >Auswahl löschen ({{ selectedCount }})</button>
        </div>

        <div class="vse-table-wrap">
          <table class="vse-table">
            <thead>
              <tr>
                <th class="col-check">
                  <input
                    type="checkbox"
                    :checked="allFilteredSelected"
                    :indeterminate.prop="someFilteredSelected"
                    @change="toggleAllFiltered"
                  />
                </th>
                <th class="col-cat">Kategorie</th>
                <th class="col-color">Farbe</th>
                <th class="col-width">Stärke (mm)</th>
                <th class="col-dash">Linientyp</th>
                <th class="col-hatch">Schraffur</th>
                <th class="col-label">Beschriftung</th>
                <th class="col-on">An</th>
                <th class="col-reset"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredRows" :key="row.category"
                  :class="{ 'is-selected': selected.has(row.category), 'is-override': row.isOverridden }">
                <td class="col-check">
                  <input type="checkbox"
                         :checked="selected.has(row.category)"
                         @change="toggleOne(row.category)" />
                </td>
                <td class="col-cat" :title="row.category">
                  <span v-if="row.isOverridden" class="vse-override-dot" title="Modell-Override aktiv">●</span>
                  {{ row.label }}
                </td>
                <td class="col-color">
                  <input type="color" :value="row.color"
                         @input="onPatch(row.category, { color: $event.target.value })" />
                </td>
                <td class="col-width">
                  <input type="number" step="0.05" min="0.05" max="2.5"
                         :value="row.lineWidth"
                         @change="onPatch(row.category, { lineWidth: +$event.target.value })" />
                </td>
                <td class="col-dash">
                  <select :value="row.lineDash"
                          @change="onPatch(row.category, { lineDash: $event.target.value })">
                    <option v-for="d in DASH_OPTIONS" :key="d" :value="d">{{ d }}</option>
                  </select>
                </td>
                <td class="col-hatch">
                  <select :value="row.hatchPattern"
                          @change="onPatch(row.category, { hatchPattern: $event.target.value })">
                    <option v-for="h in HATCH_OPTIONS" :key="h" :value="h">{{ h }}</option>
                  </select>
                </td>
                <td class="col-label">
                  <div class="vse-label-cell">
                    <input type="text" :value="row.labelTemplate"
                           placeholder="z.B. {Name}"
                           @input="onPatch(row.category, { labelTemplate: $event.target.value })" />
                    <input type="number" step="0.1" min="0.5" max="20" class="vse-font-input"
                           title="Schrifthöhe (mm)"
                           :value="row.labelFontSize"
                           @input="onPatch(row.category, { labelFontSize: +$event.target.value })" />
                    <select class="vse-anchor-input" title="Ausrichtung"
                            :value="row.labelAnchor"
                            @change="onPatch(row.category, { labelAnchor: $event.target.value })">
                      <option value="center">⊙</option>
                      <option value="top">▲</option>
                      <option value="bottom">▼</option>
                      <option value="left">◀</option>
                      <option value="right">▶</option>
                    </select>
                    <button class="vse-iconbtn" title="Verfügbare Attribute…" @click="openAttrBrowser(row.category)">🔍</button>
                  </div>
                </td>
                <td class="col-on">
                  <input type="checkbox" :checked="row.enabled"
                         @change="onPatch(row.category, { enabled: $event.target.checked })" />
                </td>
                <td class="col-reset">
                  <button class="vse-iconbtn" @click="onResetRow(row.category)" title="Auf Default zurück">↻</button>
                </td>
              </tr>
              <tr v-if="!filteredRows.length">
                <td colspan="8" class="vse-empty">Keine Kategorien — IFC laden oder Filter ändern.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Bulk-edit bar — shows when ≥1 selected -->
        <div v-if="hasSelection" class="vse-bulk">
          <span class="vse-bulk-label">Auswahl ({{ selectedCount }}) →</span>
          <input type="color" :value="bulkPatch.color" @input="bulkPatch.color = $event.target.value" />
          <input type="number" step="0.05" min="0.05" max="2.5" placeholder="Stärke"
                 v-model.number="bulkPatch.lineWidth" />
          <select v-model="bulkPatch.lineDash">
            <option value="">(Linientyp)</option>
            <option v-for="d in DASH_OPTIONS" :key="d" :value="d">{{ d }}</option>
          </select>
          <select v-model="bulkPatch.hatchPattern">
            <option value="">(Schraffur)</option>
            <option v-for="h in HATCH_OPTIONS" :key="h" :value="h">{{ h }}</option>
          </select>
          <button class="vse-btn vse-btn--primary" @click="applyBulk">Anwenden</button>
        </div>
        </template>

        <!-- ── RULES TAB ── -->
        <template v-if="tab === 'rules'">
        <div class="vse-toolbar">
          <button class="vse-btn vse-btn--primary" @click="addRule">＋ Neue Regel</button>
          <span class="vse-count">{{ ifc.vectorRules.length }} Regeln</span>
          <span class="vse-hint">Höhere Priorität gewinnt bei mehreren Treffern</span>
        </div>
        <div class="vse-rules-wrap">
          <div v-if="!ifc.vectorRules.length" class="vse-empty">
            Noch keine Regeln. Klick „＋ Neue Regel“ um z.B. „Außenwände dick schwarz“ einzustellen.
          </div>
          <div v-for="rule in sortedRules" :key="rule.id" class="vse-rule" :class="{ disabled: !rule.enabled }">
            <div class="vse-rule-head">
              <input type="checkbox" :checked="rule.enabled" @change="ifc.toggleVectorRule(rule.id)" />
              <input class="vse-rule-name" :value="rule.name"
                     @change="ifc.updateVectorRule(rule.id, { name: $event.target.value })"
                     placeholder="Regel-Name" />
              <label class="vse-rule-prio" title="Priorität — höhere Werte gewinnen">
                Prio
                <input type="number" :value="rule.priority" min="0" max="100" step="1"
                       @change="ifc.updateVectorRule(rule.id, { priority: +$event.target.value })" />
              </label>
              <button class="vse-iconbtn vse-iconbtn--danger" @click="ifc.deleteVectorRule(rule.id)" title="Löschen">🗑</button>
            </div>
            <div class="vse-rule-body">
              <div class="vse-rule-cond">
                <span class="vse-cond-lbl">Wenn</span>
                <select :value="rule.condition.category"
                        @change="onCondPatch(rule, { category: $event.target.value })">
                  <option value="">Alle Kategorien</option>
                  <option v-for="c in categoryNames" :key="c" :value="c">{{ c.replace(/^IFC/, '') }}</option>
                </select>
                <input :value="rule.condition.psetName"
                       @change="onCondPatch(rule, { psetName: $event.target.value })"
                       placeholder="Pset (optional)" />
                <input :value="rule.condition.propertyName"
                       @change="onCondPatch(rule, { propertyName: $event.target.value })"
                       placeholder="Property (optional)" />
                <select :value="rule.condition.operator"
                        @change="onCondPatch(rule, { operator: $event.target.value })">
                  <option value="equals">=</option>
                  <option value="notEquals">≠</option>
                  <option value="contains">enthält</option>
                  <option value="gt">&gt;</option>
                  <option value="lt">&lt;</option>
                  <option value="exists">existiert</option>
                </select>
                <input v-if="rule.condition.operator !== 'exists'"
                       :value="rule.condition.value"
                       @change="onCondPatch(rule, { value: $event.target.value })"
                       placeholder="Wert" />
              </div>
              <div class="vse-rule-style">
                <span class="vse-cond-lbl">Dann</span>
                <input type="color" :value="rule.style.color"
                       @input="onStylePatch(rule, { color: $event.target.value })" />
                <input type="number" step="0.05" min="0.05" max="2.5"
                       :value="rule.style.lineWidth"
                       @change="onStylePatch(rule, { lineWidth: +$event.target.value })" />
                <select :value="rule.style.lineDash"
                        @change="onStylePatch(rule, { lineDash: $event.target.value })">
                  <option v-for="d in DASH_OPTIONS" :key="d" :value="d">{{ d }}</option>
                </select>
                <select :value="rule.style.hatchPattern"
                        @change="onStylePatch(rule, { hatchPattern: $event.target.value })">
                  <option v-for="h in HATCH_OPTIONS" :key="h" :value="h">{{ h }}</option>
                </select>
                <input :value="rule.style.labelTemplate ?? ''"
                       placeholder="Label-Template (optional)"
                       style="flex: 1; min-width: 160px;"
                       @change="onStylePatch(rule, { labelTemplate: $event.target.value })" />
              </div>
            </div>
          </div>
        </div>
        </template>

        <!-- ── Attribute Browser overlay (shown on top of either tab) ── -->
        <Transition name="fade">
          <div v-if="attrBrowser.open" class="vse-attr-overlay" @mousedown.self="attrBrowser.open = false">
            <div class="vse-attr-modal">
              <div class="vse-attr-header">
                <span class="vse-attr-title">🔍 Attribute · {{ attrBrowser.category }}</span>
                <button class="vse-close" @click="attrBrowser.open = false">✕</button>
              </div>
              <div class="vse-attr-info">
                <span v-if="attrBrowser.loading">Lese {{ attrBrowser.sampleSize }} Beispiele…</span>
                <span v-else>
                  {{ attrBrowser.result?.samplesUsed ?? 0 }} von {{ attrBrowser.result?.totalElements ?? 0 }} Elementen analysiert.
                  Klick auf eine Zeile fügt das Token in das Label-Template ein.
                </span>
              </div>
              <div class="vse-attr-body" v-if="!attrBrowser.loading && attrBrowser.result">
                <div v-if="attrBrowser.result.attributes.length" class="vse-attr-section">
                  <div class="vse-attr-section-title">Attribute</div>
                  <div v-for="a in attrBrowser.result.attributes" :key="'a-' + a.key"
                       class="vse-attr-row" @click="insertToken(a.key)">
                    <span class="vse-attr-token">{{ '{' + a.key + '}' }}</span>
                    <span class="vse-attr-samples" :title="a.samples.join(', ')">
                      {{ a.samples.slice(0, 3).join(' · ') }}
                    </span>
                  </div>
                </div>
                <div v-for="ps in attrBrowser.result.psets" :key="'p-' + ps.name" class="vse-attr-section">
                  <div class="vse-attr-section-title">{{ ps.name }}</div>
                  <div v-for="p in ps.properties" :key="'p-' + ps.name + '-' + p.key"
                       class="vse-attr-row" @click="insertToken(ps.name + '.' + p.key)">
                    <span class="vse-attr-token">{{ '{' + ps.name + '.' + p.key + '}' }}</span>
                    <span class="vse-attr-samples" :title="p.samples.join(', ')">
                      {{ p.samples.slice(0, 3).join(' · ') }}
                    </span>
                  </div>
                </div>
                <div v-if="!attrBrowser.result.attributes.length && !attrBrowser.result.psets.length"
                     class="vse-empty">Keine Attribute/Psets in dieser Kategorie gefunden.</div>
              </div>
            </div>
          </div>
        </Transition>

      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, reactive } from 'vue';
import { useIfcStore } from '../stores/useIfcStore.js';
import { DASH_PATTERNS, HATCH_PATTERNS_OPTIONS } from '../services/DefaultLineStyles.js';
import { probeCategory } from '../services/CategoryAttributeProbe.js';

const props = defineProps({
  open:                { type: Boolean,  default: false },
  categoryNames:       { type: Array,    default: () => [] },
  modelList:           { type: Array,    default: () => [] },
  getCategoryGroups:   { type: Function, default: null },   // () => engine.getCategoryGroups()
  getFragmentsList:    { type: Function, default: null },
  getFragmentsManager: { type: Function, default: null },
});
const emit = defineEmits(['close']);

const ifc = useIfcStore();

const DASH_OPTIONS  = Object.keys(DASH_PATTERNS);
const HATCH_OPTIONS = HATCH_PATTERNS_OPTIONS;

const tab = ref('categories');   // 'categories' | 'rules'

const filterText   = ref('');
const selected     = ref(new Set());
const scopeModelId = ref('');     // '' = global, otherwise modelId

const modelList = computed(() => props.modelList ?? []);
const builtInPresets = computed(() => ifc.allPresets().filter(p => p.builtin));

function onLoadPreset(e) {
  const id = e.target.value;
  if (!id) return;
  ifc.loadPreset(id, { merge: true });
  // Reset the dropdown
  e.target.value = '';
}
function onSavePreset() {
  const name = prompt('Name für den Preset:', `Stil ${ifc.userPresets.length + 1}`);
  if (name?.trim()) ifc.saveCurrentAsPreset(name);
}
function onDeleteUserPreset() {
  if (!ifc.userPresets.length) return;
  const choices = ifc.userPresets.map((p, i) => `${i + 1}: ${p.name}`).join('\n');
  const pick = prompt(`Welchen Preset löschen?\n${choices}\n\nNummer eingeben:`);
  const idx = Number(pick) - 1;
  if (Number.isInteger(idx) && ifc.userPresets[idx]) {
    if (confirm(`„${ifc.userPresets[idx].name}“ wirklich löschen?`)) {
      ifc.deleteUserPreset(ifc.userPresets[idx].id);
    }
  }
}
function onClearModel() {
  if (!scopeModelId.value) return;
  if (confirm(`Alle Stil-Overrides für dieses Modell entfernen?`)) {
    ifc.clearModelOverrides(scopeModelId.value);
  }
}

// Rules sorting (highest priority first)
const sortedRules = computed(() => {
  const arr = [...(ifc.vectorRules ?? [])];
  arr.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  return arr;
});

const categoryNames = computed(() => props.categoryNames ?? []);

function addRule() {
  ifc.addVectorRule({
    name:     'Neue Regel',
    priority: 10,
    enabled:  true,
    condition: {
      category: categoryNames.value[0] ?? '',
      psetName: '',
      propertyName: '',
      operator: 'equals',
      value: '',
    },
    style: { color: '#000000', lineWidth: 0.5, lineDash: 'solid', hatchPattern: 'none' },
  });
}
function onCondPatch(rule, patch) {
  ifc.updateVectorRule(rule.id, { condition: { ...rule.condition, ...patch } });
}
function onStylePatch(rule, patch) {
  ifc.updateVectorRule(rule.id, { style: { ...rule.style, ...patch } });
}

// ── Attribute Browser ───────────────────────────────────────────────────────
const attrBrowser = reactive({
  open: false,
  category: '',
  loading: false,
  result: null,
  sampleSize: 30,
});

async function openAttrBrowser(category) {
  attrBrowser.category = category;
  attrBrowser.open     = true;
  attrBrowser.loading  = true;
  attrBrowser.result   = null;

  const groups   = props.getCategoryGroups?.() ?? [];
  const fragList = props.getFragmentsList?.() ?? null;
  const fragMgr  = props.getFragmentsManager?.() ?? null;
  if (!groups.length || !fragMgr) {
    attrBrowser.loading = false;
    attrBrowser.result  = { attributes: [], psets: [], samplesUsed: 0, totalElements: 0 };
    return;
  }
  try {
    attrBrowser.result = await probeCategory(category, groups, fragList, fragMgr, attrBrowser.sampleSize);
  } catch {
    attrBrowser.result = { attributes: [], psets: [], samplesUsed: 0, totalElements: 0 };
  }
  attrBrowser.loading = false;
}

function insertToken(token) {
  // Append the token to the category's existing label template
  const cat = attrBrowser.category;
  if (!cat) return;
  const styles = ifc.vectorStyles ?? {};
  const current = styles[cat]?.labelTemplate ?? '';
  const sep = current && !current.endsWith(' ') ? ' ' : '';
  const next = current + sep + '{' + token + '}';
  if (scopeModelId.value) ifc.setVectorStyleForModel(scopeModelId.value, cat, { labelTemplate: next });
  else                    ifc.setVectorStyle(cat, { labelTemplate: next });
}

// Active style source — global vectorStyles, optionally merged with model override
const activeStyles = computed(() => {
  if (!scopeModelId.value) return ifc.vectorStyles ?? {};
  const override = ifc.vectorStylesByModel?.[scopeModelId.value] ?? {};
  return { ...ifc.vectorStyles, ...override };
});

const rows = computed(() => {
  const styles = activeStyles.value;
  const cats = props.categoryNames?.length
    ? props.categoryNames
    : Object.keys(styles).filter(k => k !== 'default');
  return cats.map(category => {
    const s = styles[category] ?? styles.default ?? {};
    const isOverridden = !!scopeModelId.value
      && !!(ifc.vectorStylesByModel?.[scopeModelId.value]?.[category]);
    return {
      category,
      label: category.replace(/^IFC/, ''),
      color:        s.color        ?? '#646464',
      lineWidth:    s.lineWidth    ?? 0.18,
      lineDash:     s.lineDash     ?? 'solid',
      hatchPattern: s.hatchPattern ?? 'none',
      labelTemplate:  s.labelTemplate  ?? '',
      labelFontSize:  s.labelFontSize  ?? 2.2,
      labelAnchor:    s.labelAnchor    ?? 'center',
      enabled:        s.enabled !== false,
      isOverridden,
    };
  }).sort((a, b) => a.label.localeCompare(b.label));
});

const filteredRows = computed(() => {
  const q = filterText.value.trim().toLowerCase();
  if (!q) return rows.value;
  return rows.value.filter(r => r.label.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
});

const selectedCount = computed(() => selected.value.size);
const hasSelection  = computed(() => selectedCount.value > 0);

const allFilteredSelected = computed(() =>
  filteredRows.value.length > 0 && filteredRows.value.every(r => selected.value.has(r.category)));
const someFilteredSelected = computed(() => {
  const total = filteredRows.value.length;
  if (!total) return false;
  const n = filteredRows.value.filter(r => selected.value.has(r.category)).length;
  return n > 0 && n < total;
});

function toggleOne(cat) {
  const next = new Set(selected.value);
  if (next.has(cat)) next.delete(cat);
  else               next.add(cat);
  selected.value = next;
}
function toggleAllFiltered() {
  if (allFilteredSelected.value) {
    const next = new Set(selected.value);
    for (const r of filteredRows.value) next.delete(r.category);
    selected.value = next;
  } else {
    const next = new Set(selected.value);
    for (const r of filteredRows.value) next.add(r.category);
    selected.value = next;
  }
}
function onSelectNone() { selected.value = new Set(); }

function onPatch(category, patch) {
  if (scopeModelId.value) ifc.setVectorStyleForModel(scopeModelId.value, category, patch);
  else                    ifc.setVectorStyle(category, patch);
}
function onResetRow(category) {
  if (scopeModelId.value) ifc.clearModelOverride(scopeModelId.value, category);
  else                    ifc.resetVectorStyle(category);
}
function onResetAll() {
  if (!confirm('Alle Linienstile auf Default zurücksetzen?')) return;
  ifc.resetAllVectorStyles();
  selected.value = new Set();
}

// Bulk-edit state — only non-empty fields are applied
const bulkPatch = reactive({ color: '', lineWidth: null, lineDash: '', hatchPattern: '' });
function applyBulk() {
  const patch = {};
  if (bulkPatch.color)        patch.color = bulkPatch.color;
  if (typeof bulkPatch.lineWidth === 'number' && bulkPatch.lineWidth > 0)
                              patch.lineWidth = bulkPatch.lineWidth;
  if (bulkPatch.lineDash)     patch.lineDash = bulkPatch.lineDash;
  if (bulkPatch.hatchPattern) patch.hatchPattern = bulkPatch.hatchPattern;
  if (!Object.keys(patch).length) return;

  if (scopeModelId.value) {
    for (const cat of selected.value) ifc.setVectorStyleForModel(scopeModelId.value, cat, patch);
  } else {
    ifc.setVectorStylesBulk([...selected.value], patch);
  }
}
</script>

<style scoped>
.vse-overlay {
  position: fixed; inset: 0; z-index: 240;
  background: rgba(0,0,0,0.55);
  display: flex; justify-content: center; align-items: center;
}
.vse-modal {
  width: 880px; max-width: 95vw; height: 75vh;
  background: #1a1e2e;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.6);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.vse-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.6rem 1rem;
  background: rgba(30, 35, 50, 0.7);
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.vse-title { font-size: 0.9rem; font-weight: 700; color: #90caf9; }
.vse-header-actions { display: flex; gap: 0.4rem; align-items: center; }
.vse-close {
  background: none; border: none; color: #78909c;
  font-size: 1.2rem; cursor: pointer; padding: 0 0.4rem;
}
.vse-close:hover { color: #ef5350; }

.vse-toolbar {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.5rem 1rem;
  background: rgba(20, 24, 36, 0.6);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}
.vse-search {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px; padding: 0.3rem 0.5rem;
  color: #cfd8dc; font-size: 0.78rem; min-width: 220px;
}
.vse-count { font-size: 0.7rem; color: #607d8b; }
.vse-sep { color: rgba(255,255,255,0.1); }

.vse-table-wrap { flex: 1; overflow-y: auto; }
.vse-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
.vse-table thead th {
  position: sticky; top: 0;
  background: rgba(30, 35, 50, 0.95);
  color: #90a4ae; font-weight: 600; font-size: 0.7rem;
  text-align: left; padding: 0.45rem 0.5rem;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.vse-table tbody tr { border-bottom: 1px solid rgba(255,255,255,0.04); }
.vse-table tbody tr:hover { background: rgba(255,255,255,0.03); }
.vse-table tbody tr.is-selected { background: rgba(33,150,243,0.08); }
.vse-table td { padding: 0.35rem 0.5rem; color: #cfd8dc; vertical-align: middle; }

.col-check { width: 36px; }
.col-cat   { white-space: nowrap; }
.col-color { width: 60px; }
.col-width { width: 90px; }
.col-dash  { width: 110px; }
.col-hatch { width: 110px; }
.col-label { width: 260px; }
.vse-font-input { width: 52px; }
.vse-anchor-input { width: 44px; }
.col-on    { width: 50px; text-align: center; }
.col-reset { width: 40px; text-align: center; }
.vse-label-cell { display: flex; gap: 0.2rem; align-items: center; }
.vse-label-cell input[type="text"] {
  flex: 1; padding: 0.2rem 0.4rem;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 3px; color: #cfd8dc; font-size: 0.74rem;
  min-width: 100px;
}

.vse-table input[type="color"] { width: 32px; height: 22px; border: none; padding: 0; background: none; cursor: pointer; }
.vse-table input[type="number"], .vse-table select {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 3px; padding: 0.18rem 0.3rem;
  color: #cfd8dc; font-size: 0.74rem;
  width: 100%; box-sizing: border-box;
}
.vse-table input[type="checkbox"] { cursor: pointer; }

.vse-iconbtn {
  background: none; border: none; color: #78909c;
  cursor: pointer; font-size: 0.85rem; padding: 0 0.3rem;
}
.vse-iconbtn:hover { color: #cfd8dc; }

.vse-empty { padding: 2rem; text-align: center; color: #607d8b; }

.vse-bulk {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(33,150,243,0.10);
  border-top: 1px solid rgba(33,150,243,0.3);
  flex-shrink: 0;
}
.vse-bulk-label { font-size: 0.74rem; color: #90caf9; font-weight: 600; }
.vse-bulk input[type="color"] { width: 30px; height: 22px; border: none; padding: 0; cursor: pointer; }
.vse-bulk input[type="number"], .vse-bulk select {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 3px; padding: 0.2rem 0.4rem;
  color: #cfd8dc; font-size: 0.74rem;
}

.vse-btn {
  padding: 0.3rem 0.7rem;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 4px;
  background: rgba(255,255,255,0.05);
  color: #cfd8dc;
  font-size: 0.72rem;
  cursor: pointer;
  transition: background 0.12s;
}
.vse-btn:hover  { background: rgba(255,255,255,0.1); }
.vse-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.vse-btn--ghost { background: none; }
.vse-btn--primary {
  background: rgba(33,150,243,0.3);
  color: #90caf9;
  border-color: rgba(33,150,243,0.5);
}
.vse-btn--primary:hover { background: rgba(33,150,243,0.45); }

.vse-tabs { display: flex; gap: 0.3rem; margin-left: 1rem; }
.vse-tab {
  background: none;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  padding: 0.25rem 0.7rem;
  color: #90a4ae;
  font-size: 0.74rem;
  cursor: pointer;
  transition: background 0.12s;
  display: inline-flex; align-items: center; gap: 0.3rem;
}
.vse-tab:hover  { background: rgba(255,255,255,0.05); color: #cfd8dc; }
.vse-tab.active {
  background: rgba(33,150,243,0.25);
  color: #90caf9; border-color: rgba(33,150,243,0.4);
}
.vse-tab-badge {
  background: rgba(33,150,243,0.4);
  color: #fff;
  font-size: 0.62rem; font-weight: 700;
  border-radius: 8px;
  padding: 0 5px;
}
.vse-hint { font-size: 0.68rem; color: #546e7a; margin-left: auto; }

.vse-presets {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(102,187,106,0.06);
  border-bottom: 1px solid rgba(102,187,106,0.18);
  flex-wrap: wrap;
  flex-shrink: 0;
}
.vse-presets-lbl { font-size: 0.68rem; color: #a5d6a7; font-weight: 600; }
.vse-presets select {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 4px; padding: 0.22rem 0.5rem;
  color: #cfd8dc; font-size: 0.74rem;
}

.vse-override-dot { color: #66bb6a; font-size: 0.7rem; margin-right: 4px; }
.vse-table tbody tr.is-override { background: rgba(102,187,106,0.05); }
.vse-table tbody tr.is-override.is-selected { background: rgba(102,187,106,0.13); }

.vse-rules-wrap {
  flex: 1; overflow-y: auto;
  padding: 0.6rem 1rem; display: flex; flex-direction: column; gap: 0.6rem;
}
.vse-rule {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  padding: 0.55rem 0.7rem;
}
.vse-rule.disabled { opacity: 0.45; }
.vse-rule-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
.vse-rule-name {
  flex: 1;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 3px; padding: 0.25rem 0.4rem;
  color: #cfd8dc; font-size: 0.76rem; font-weight: 600;
}
.vse-rule-prio { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.66rem; color: #78909c; }
.vse-rule-prio input { width: 50px; padding: 0.18rem 0.3rem;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 3px;
  color: #cfd8dc; font-size: 0.74rem; }
.vse-rule-body { display: flex; flex-direction: column; gap: 0.4rem; }
.vse-rule-cond, .vse-rule-style {
  display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;
}
.vse-cond-lbl { font-size: 0.66rem; color: #607d8b; font-weight: 700; min-width: 36px; }
.vse-rule-cond input, .vse-rule-cond select,
.vse-rule-style input, .vse-rule-style select {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 3px; padding: 0.2rem 0.4rem;
  color: #cfd8dc; font-size: 0.72rem;
}
.vse-rule-style input[type="color"] { width: 32px; height: 22px; padding: 0; cursor: pointer; }
.vse-rule-style input[type="number"] { width: 70px; }
.vse-iconbtn--danger { color: #ef9a9a; }
.vse-iconbtn--danger:hover { background: rgba(239,83,80,0.15); color: #ef5350; border-radius: 3px; }

/* Attribute browser overlay */
.vse-attr-overlay {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex; justify-content: center; align-items: center;
  z-index: 5;
}
.vse-attr-modal {
  width: 600px; max-width: 92%; max-height: 80%;
  background: #1a1e2e;
  border: 1px solid rgba(102,187,106,0.4);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.5);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.vse-attr-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.55rem 0.9rem;
  background: rgba(102,187,106,0.10);
  border-bottom: 1px solid rgba(102,187,106,0.3);
  flex-shrink: 0;
}
.vse-attr-title { font-size: 0.85rem; font-weight: 700; color: #a5d6a7; }
.vse-attr-info {
  padding: 0.4rem 0.9rem;
  font-size: 0.7rem; color: #78909c;
  background: rgba(20,24,36,0.5);
  border-bottom: 1px solid rgba(255,255,255,0.05);
  flex-shrink: 0;
}
.vse-attr-body {
  flex: 1; overflow-y: auto; padding: 0.5rem 0.9rem;
}
.vse-attr-section { margin-bottom: 1rem; }
.vse-attr-section-title {
  font-size: 0.72rem; font-weight: 700; color: #ffd54f;
  text-transform: uppercase; letter-spacing: 0.08em;
  padding-bottom: 0.3rem; border-bottom: 1px solid rgba(255,213,79,0.2);
  margin-bottom: 0.3rem;
}
.vse-attr-row {
  display: flex; justify-content: space-between; gap: 0.5rem; align-items: center;
  padding: 0.3rem 0.4rem;
  border-radius: 4px;
  cursor: pointer; transition: background 0.12s;
}
.vse-attr-row:hover { background: rgba(102,187,106,0.12); }
.vse-attr-token {
  font-family: monospace; font-size: 0.74rem; color: #a5d6a7;
  background: rgba(102,187,106,0.08);
  padding: 0.1rem 0.4rem; border-radius: 3px;
}
.vse-attr-samples {
  font-size: 0.7rem; color: #78909c;
  flex: 1; text-align: right;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.18s; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }
</style>
