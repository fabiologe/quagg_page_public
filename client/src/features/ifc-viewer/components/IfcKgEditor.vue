<template>
  <div class="kg-editor">
    <div class="card-header">
      <span class="card-title">📦 Kostengruppen DIN 276-1</span>
      <div class="card-actions">
        <button class="card-btn" :disabled="loading" @click="$emit('refresh')" title="Neu berechnen">
          {{ loading ? '⏳' : '↻' }}
        </button>
        <button
          class="card-btn"
          :class="{ active: kgColorMode }"
          @click="$emit('toggle-color-mode')"
          title="3D-Ansicht in KG-Farben anzeigen"
        >🎨</button>
      </div>
    </div>

    <div v-if="loading" class="state-msg">Klassifiziere…</div>
    <div v-else-if="!result || !result.byKg.size" class="state-msg">
      Keine Klassifikations-Treffer — Standard-Regeln erkennen IFCWALL, IFCSLAB, IFCROOF, IFCPIPESEGMENT u.a. Eventuell sind die Kategorien im Modell anders benannt.
    </div>

    <template v-else>
      <!-- Summen pro Hauptgruppe (300 / 400) -->
      <div class="kg-totals">
        <div v-for="root in KG_TREE" :key="root.code" class="kg-total-card" :style="{ borderColor: kgColor(root.code) }">
          <div class="kg-total-code" :style="{ color: kgColor(root.code) }">KG {{ root.code }}</div>
          <div class="kg-total-label">{{ root.label.split(' — ')[1] || root.label }}</div>
          <div class="kg-total-stats">
            <span>{{ rootStats[root.code]?.count ?? 0 }} Elemente</span>
            <span>·</span>
            <span>{{ fmt(rootStats[root.code]?.volume_m3 ?? 0) }} m³</span>
          </div>
        </div>
      </div>

      <!-- Tabelle pro Untergruppe -->
      <div class="kg-table-wrap">
        <table class="kg-table">
          <thead>
            <tr>
              <th class="col-color"></th>
              <th class="col-code">KG</th>
              <th class="col-label">Bezeichnung</th>
              <th class="col-count">Elemente</th>
              <th class="col-vol">Volumen</th>
            </tr>
          </thead>
          <tbody>
            <!-- Vue 3: der v-for-Key MUSS auf dem <template> stehen
                 (die IDE-Regel vue/no-v-for-template-key ist Vue-2-Erbe) -->
            <template v-for="entry in tableRows" :key="entry.code">
              <tr
                class="kg-row"
                :class="{ 'is-root': entry.isRoot }"
                @click="$emit('select-kg', entry.code)"
              >
                <td class="col-color">
                  <span class="swatch" :style="{ background: kgColor(entry.code) }" />
                </td>
                <td class="col-code">
                  <button
                    v-if="elementsFor(entry.code).length"
                    class="expand-btn"
                    :class="{ open: expanded.has(entry.code) }"
                    @click.stop="toggleExpand(entry.code)"
                    title="Elemente anzeigen / KG zuweisen"
                  >▸</button>
                  {{ entry.code }}
                </td>
                <td class="col-label">{{ entry.label }}</td>
                <td class="col-count">{{ entry.count || '–' }}</td>
                <td class="col-vol">{{ entry.volume_m3 ? fmt(entry.volume_m3) + ' m³' : '–' }}</td>
              </tr>
              <tr v-if="expanded.has(entry.code)" class="kg-detail-row">
                <td colspan="5">
                  <div class="el-list">
                    <div
                      v-for="el in elementsFor(entry.code).slice(0, MAX_ELEMENTS_SHOWN)"
                      :key="`${el.modelId}|${el.localId}`"
                      class="el-row"
                    >
                      <button class="el-zoom" @click="$emit('select-element', el)" title="Im 3D anzeigen">
                        {{ el.category.replace(/^IFC/, '') }} #{{ el.localId }}
                      </button>
                      <select
                        class="el-kg-select"
                        :value="currentKgFor(el)"
                        :disabled="!el.globalId"
                        :title="el.globalId ? 'KG manuell zuweisen (Override)' : 'Keine GlobalId geladen — über Regeln zuordnen'"
                        @change="onOverrideSelect(el, $event.target.value)"
                      >
                        <option value="">— per Regel —</option>
                        <option v-for="opt in kgOptions" :key="opt.code" :value="opt.code">
                          {{ opt.code }} {{ opt.shortLabel }}
                        </option>
                      </select>
                      <span v-if="overrides?.has(el.globalId)" class="el-override-badge" title="Manueller Override">✎</span>
                    </div>
                    <div v-if="elementsFor(entry.code).length > MAX_ELEMENTS_SHOWN" class="el-more">
                      … {{ elementsFor(entry.code).length - MAX_ELEMENTS_SHOWN }} weitere Elemente
                    </div>
                  </div>
                </td>
              </tr>
            </template>

            <template v-if="result.unassigned.count">
              <tr class="kg-row unassigned">
                <td class="col-color"><span class="swatch swatch-unassigned" /></td>
                <td class="col-code">
                  <button
                    v-if="result.unassigned.elements?.length"
                    class="expand-btn"
                    :class="{ open: expanded.has('__unassigned') }"
                    @click.stop="toggleExpand('__unassigned')"
                    title="Elemente anzeigen / KG zuweisen"
                  >▸</button>
                  —
                </td>
                <td class="col-label">
                  Nicht zugeordnet
                  <small>({{ unassignedCategoriesLabel }})</small>
                </td>
                <td class="col-count">{{ result.unassigned.count }}</td>
                <td class="col-vol">–</td>
              </tr>
              <tr v-if="expanded.has('__unassigned')" class="kg-detail-row">
                <td colspan="5">
                  <div class="el-list">
                    <div
                      v-for="el in (result.unassigned.elements ?? []).slice(0, MAX_ELEMENTS_SHOWN)"
                      :key="`${el.modelId}|${el.localId}`"
                      class="el-row"
                    >
                      <button class="el-zoom" @click="$emit('select-element', el)" title="Im 3D anzeigen">
                        {{ el.category.replace(/^IFC/, '') }} #{{ el.localId }}
                      </button>
                      <select
                        class="el-kg-select"
                        value=""
                        :disabled="!el.globalId"
                        :title="el.globalId ? 'KG manuell zuweisen (Override)' : 'Keine GlobalId geladen — über Regeln zuordnen'"
                        @change="onOverrideSelect(el, $event.target.value)"
                      >
                        <option value="">— zuweisen —</option>
                        <option v-for="opt in kgOptions" :key="opt.code" :value="opt.code">
                          {{ opt.code }} {{ opt.shortLabel }}
                        </option>
                      </select>
                    </div>
                    <div v-if="(result.unassigned.elements?.length ?? 0) > MAX_ELEMENTS_SHOWN" class="el-more">
                      … {{ result.unassigned.elements.length - MAX_ELEMENTS_SHOWN }} weitere Elemente
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue';
import { KG_TREE, KG_LOOKUP, kgColor } from '../services/Din276Defaults.js';

const props = defineProps({
  result:       { type: Object,  default: null },  // { byKg, unassigned, perElement }
  loading:      { type: Boolean, default: false },
  kgColorMode:  { type: Boolean, default: false },
  overrides:    { type: Map,     default: null },  // GlobalId → kgCode (manuelle Zuweisungen)
});
const emit = defineEmits(['refresh', 'toggle-color-mode', 'select-kg', 'select-element', 'override-kg']);

// ── B5: Elemente aufklappen + KG manuell zuweisen ──────────────────────────
const MAX_ELEMENTS_SHOWN = 50;
const expanded = reactive(new Set());

function toggleExpand(code) {
  if (expanded.has(code)) expanded.delete(code);
  else expanded.add(code);
}

/** Elemente eines KG-Codes inkl. aller Untergruppen (322 zählt unter 320). */
function elementsFor(code) {
  const out = [];
  const walkCodes = (c) => {
    const bucket = props.result?.byKg?.get(c);
    if (bucket?.elements?.length) out.push(...bucket.elements);
    for (const [childCode, node] of KG_LOOKUP) {
      if (node.parentCode === c) walkCodes(childCode);
    }
  };
  walkCodes(code);
  return out;
}

/** Auswahlliste: alle KG-Codes aus dem Baum, flach, mit Kurz-Label. */
const kgOptions = (() => {
  const out = [];
  const walk = (nodes, depth) => {
    for (const n of nodes) {
      out.push({ code: n.code, shortLabel: (n.label.split(' — ')[1] ?? n.label) });
      if (n.children) walk(n.children, depth + 1);
    }
  };
  walk(KG_TREE, 0);
  return out;
})();

/** Aktuelle Zuordnung eines Elements (Override oder Regel-Ergebnis). */
function currentKgFor(el) {
  if (el.globalId && props.overrides?.has(el.globalId)) return props.overrides.get(el.globalId);
  return props.result?.perElement?.get(`${el.modelId}|${el.localId}`) ?? '';
}

function onOverrideSelect(el, kgCode) {
  if (!el.globalId) return;
  // '' = Override entfernen, wieder per Regel klassifizieren
  emit('override-kg', { globalId: el.globalId, kgCode: kgCode || null });
}

const rootStats = computed(() => {
  const out = {};
  for (const root of KG_TREE) {
    let count = 0, volume_m3 = 0;
    const walk = (node) => {
      const b = props.result?.byKg?.get(node.code);
      if (b) { count += b.count; volume_m3 += b.volume_m3; }
      for (const c of (node.children ?? [])) walk(c);
    };
    walk(root);
    out[root.code] = { count, volume_m3 };
  }
  return out;
});

const tableRows = computed(() => {
  const rows = [];
  for (const root of KG_TREE) {
    rows.push({
      code: root.code, label: root.label, isRoot: true,
      count:     rootStats.value[root.code]?.count ?? 0,
      volume_m3: rootStats.value[root.code]?.volume_m3 ?? 0,
    });
    for (const child of (root.children ?? [])) {
      const b = props.result?.byKg?.get(child.code);
      // Include only KG-codes that either have direct hits or have grandchildren with hits
      const grandHits = (child.children ?? []).some(g => props.result?.byKg?.has(g.code));
      if (!b && !grandHits) continue;
      rows.push({
        code: child.code, label: child.label, isRoot: false,
        count: b?.count ?? 0, volume_m3: b?.volume_m3 ?? 0,
      });
    }
  }
  return rows;
});

const unassignedCategoriesLabel = computed(() => {
  if (!props.result?.unassigned?.byCategory?.size) return '';
  const entries = [...props.result.unassigned.byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([cat, n]) => `${cat.replace(/^IFC/, '')}: ${n}`);
  return entries.join(', ');
});

function fmt(n) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v === 0) return '–';
  return v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
</script>

<style scoped>
.kg-editor { display: flex; flex-direction: column; gap: 0.55rem; font-size: 0.78rem; color: #cfd8dc; }

.card-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.35rem 0.4rem;
  background: rgba(255,255,255,0.04);
  border-radius: 5px;
  border: 1px solid rgba(255,255,255,0.08);
}
.card-title { font-weight: 600; font-size: 0.84rem; color: #eceff1; }
.card-actions { display: flex; gap: 0.2rem; }
.card-btn {
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.12);
  color: #cfd8dc;
  width: 1.6rem; height: 1.6rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.card-btn:hover:not(:disabled) { background: rgba(255,255,255,0.14); }
.card-btn.active { background: rgba(52,152,219,0.3); color: #4fc3f7; border-color: rgba(52,152,219,0.55); }
.card-btn:disabled { opacity: 0.5; cursor: default; }

.state-msg { color: #90a4ae; font-style: italic; padding: 1rem 0.5rem; text-align: center; }

.kg-totals { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; }
.kg-total-card {
  padding: 0.45rem 0.55rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-left-width: 3px;
  border-radius: 4px;
}
.kg-total-code { font-weight: 700; font-size: 0.95rem; letter-spacing: 0.05em; }
.kg-total-label { font-size: 0.7rem; color: #b0bec5; margin-top: 0.1rem; }
.kg-total-stats { font-size: 0.7rem; color: #90a4ae; margin-top: 0.3rem; display: flex; gap: 0.3rem; }

.kg-table-wrap { overflow-y: auto; max-height: 380px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.06); }
.kg-table { width: 100%; border-collapse: collapse; font-size: 0.74rem; }
.kg-table th {
  position: sticky; top: 0; z-index: 1;
  background: rgba(15,30,40,0.95);
  color: #b0bec5;
  padding: 0.35rem 0.5rem;
  text-align: left;
  font-weight: 500;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.kg-table th.col-count, .kg-table th.col-vol { text-align: right; }
.kg-table td {
  padding: 0.28rem 0.5rem;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.col-color { width: 1.4rem; }
.col-code { width: 2.6rem; font-weight: 600; color: #eceff1; }
.col-label { color: #cfd8dc; }
.col-count, .col-vol { text-align: right; font-variant-numeric: tabular-nums; }

.swatch {
  display: inline-block; width: 0.9rem; height: 0.9rem;
  border-radius: 2px; border: 1px solid rgba(255,255,255,0.15);
}
.swatch-unassigned { background: transparent; border-style: dashed; border-color: #ff8a65; }

/* B5: Aufklappen + KG-Zuweisung */
.expand-btn {
  background: none; border: none; color: #90a4ae; cursor: pointer;
  font-size: 0.7rem; padding: 0 0.25rem 0 0;
  transition: transform 0.12s;
  display: inline-block;
}
.expand-btn.open { transform: rotate(90deg); }
.expand-btn:hover { color: #4fc3f7; }

.kg-detail-row td { padding: 0.2rem 0.4rem 0.4rem 1.6rem; background: rgba(0,0,0,0.18); }
.el-list { display: flex; flex-direction: column; gap: 0.15rem; max-height: 220px; overflow-y: auto; }
.el-row { display: flex; align-items: center; gap: 0.4rem; }
.el-zoom {
  flex: 1; text-align: left;
  background: none; border: none; color: #b0bec5; cursor: pointer;
  font-size: 0.72rem; padding: 0.15rem 0.2rem;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.el-zoom:hover { color: #4fc3f7; }
.el-kg-select {
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.14);
  color: #cfd8dc;
  border-radius: 3px;
  font-size: 0.7rem;
  padding: 0.1rem 0.2rem;
  max-width: 165px;
}
.el-kg-select:disabled { opacity: 0.4; cursor: not-allowed; }
.el-override-badge { color: #ffd54f; font-size: 0.7rem; }
.el-more { color: #78909c; font-size: 0.68rem; font-style: italic; padding: 0.2rem; }

.kg-row { cursor: pointer; transition: background 0.08s; }
.kg-row:hover { background: rgba(52,152,219,0.15); }
.kg-row.is-root td { background: rgba(255,255,255,0.04); font-weight: 600; color: #eceff1; }
.kg-row.is-root td.col-label { font-size: 0.78rem; }
.kg-row.unassigned td { color: #ff8a65; font-style: italic; }
.kg-row.unassigned small { color: #90a4ae; font-style: normal; font-size: 0.65rem; margin-left: 0.3rem; }
</style>
