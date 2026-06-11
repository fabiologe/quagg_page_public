<template>
  <div class="cnt-tab">
    <div class="card-header">
      <span class="card-title">🔢 Stück-Übersicht (Stk)</span>
      <button class="card-btn" :disabled="loading" @click="$emit('refresh')" title="Neu berechnen">
        {{ loading ? '⏳' : '↻' }}
      </button>
    </div>

    <div v-if="loading" class="state-msg">Berechne…</div>
    <div v-else-if="!result || !result.byCategory.size" class="state-msg">
      Kein Modell geladen.
    </div>

    <template v-else>
      <!-- Summe oben -->
      <div class="totals-bar">
        <div class="total-cell prim">
          <div class="total-label">Σ Stück</div>
          <div class="total-value">{{ result.totals.count }}</div>
        </div>
        <div class="total-cell">
          <div class="total-label">davon abrechenbar</div>
          <div class="total-value">{{ billedTotal }}</div>
        </div>
        <div class="total-cell">
          <div class="total-label">Kategorien</div>
          <div class="total-value">{{ result.byCategory.size }}</div>
        </div>
      </div>

      <!-- Filter -->
      <div class="filter-row">
        <label class="filter-check">
          <input type="checkbox" v-model="onlyPieceBilled" />
          Nur „Stück-Positionen" (Türen, Fenster, Schächte, Armaturen…)
        </label>
      </div>

      <!-- Tabelle -->
      <div class="cnt-table-wrap">
        <table class="cnt-table">
          <thead>
            <tr>
              <th class="col-cat" @click="setSort('name')">
                Kategorie
                <span v-if="sortKey === 'name'" class="sort-arrow">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
              </th>
              <th class="col-count" @click="setSort('count')">
                Anzahl
                <span v-if="sortKey === 'count'" class="sort-arrow">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
              </th>
              <th class="col-share">% v. ges.</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in sortedRows"
              :key="row.category"
              class="cnt-row"
              :class="{ 'is-billed': isBilled(row.category) }"
              @click="$emit('select-category', row.category)"
            >
              <td class="col-cat">
                <span class="cat-name">{{ row.category.replace(/^IFC/, '') }}</span>
                <span v-if="isBilled(row.category)" class="cat-badge" title="Typischerweise pro Stück abgerechnet">⚡</span>
              </td>
              <td class="col-count">{{ row.count }}</td>
              <td class="col-share">{{ pct(row.count, result.totals.count) }}</td>
            </tr>
            <tr v-if="!sortedRows.length" class="cnt-row empty">
              <td colspan="3">Keine Kategorien passen zum Filter.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { PIECE_BILLED_CATEGORIES } from '../services/QuantitySummary.js';

const props = defineProps({
  result:  { type: Object,  default: null },
  loading: { type: Boolean, default: false },
});
defineEmits(['refresh', 'select-category']);

const sortKey = ref('count');
const sortDir = ref('desc');
const onlyPieceBilled = ref(false);

function setSort(key) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  else { sortKey.value = key; sortDir.value = key === 'name' ? 'asc' : 'desc'; }
}

function isBilled(cat) { return PIECE_BILLED_CATEGORIES.has(cat); }

const billedTotal = computed(() => {
  if (!props.result?.byCategory) return 0;
  let n = 0;
  for (const [cat, data] of props.result.byCategory.entries()) {
    if (isBilled(cat)) n += data.count;
  }
  return n;
});

const sortedRows = computed(() => {
  if (!props.result?.byCategory) return [];
  let rows = [];
  for (const [category, data] of props.result.byCategory.entries()) {
    if (onlyPieceBilled.value && !isBilled(category)) continue;
    rows.push({ category, count: data.count });
  }
  const dir = sortDir.value === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    if (sortKey.value === 'name') return a.category.localeCompare(b.category) * dir;
    return (a.count - b.count) * dir;
  });
  return rows;
});

function pct(n, total) {
  if (!total) return '–';
  const p = (n / total) * 100;
  return p < 0.05 ? '<0.1%' : p.toFixed(1) + '%';
}
</script>

<style scoped>
.cnt-tab { display: flex; flex-direction: column; gap: 0.55rem; font-size: 0.78rem; color: #cfd8dc; }

.card-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.35rem 0.4rem;
  background: rgba(255,255,255,0.04);
  border-radius: 5px;
  border: 1px solid rgba(255,255,255,0.08);
}
.card-title { font-weight: 600; font-size: 0.84rem; color: #eceff1; }
.card-btn {
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.12);
  color: #cfd8dc;
  width: 1.6rem; height: 1.6rem;
  border-radius: 4px;
  cursor: pointer;
}
.card-btn:hover:not(:disabled) { background: rgba(255,255,255,0.14); }
.card-btn:disabled { opacity: 0.5; cursor: default; }

.state-msg { color: #90a4ae; font-style: italic; padding: 1rem 0.5rem; text-align: center; }

.totals-bar { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem; }
.total-cell {
  background: rgba(33,150,243,0.1);
  border: 1px solid rgba(33,150,243,0.28);
  border-radius: 4px;
  padding: 0.35rem 0.45rem;
  text-align: center;
}
.total-cell.prim { background: rgba(33,150,243,0.18); border-color: rgba(33,150,243,0.5); }
.total-label { font-size: 0.62rem; color: #90caf9; letter-spacing: 0.04em; text-transform: uppercase; }
.total-value { font-size: 0.92rem; color: #eceff1; font-weight: 600; }

.filter-row { padding: 0 0.1rem; }
.filter-check {
  display: flex; align-items: center; gap: 0.4rem;
  font-size: 0.72rem; color: #b0bec5; cursor: pointer;
}
.filter-check input { accent-color: #4fc3f7; }

.cnt-table-wrap { overflow-y: auto; max-height: 380px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.06); }
.cnt-table { width: 100%; border-collapse: collapse; font-size: 0.74rem; font-variant-numeric: tabular-nums; }
.cnt-table th {
  position: sticky; top: 0; z-index: 1;
  background: rgba(15,30,40,0.95);
  color: #b0bec5;
  padding: 0.35rem 0.5rem;
  text-align: right;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  user-select: none;
}
.cnt-table th.col-cat { text-align: left; }
.cnt-table th:hover { color: #4fc3f7; }
.sort-arrow { font-size: 0.65rem; color: #4fc3f7; margin-left: 0.2rem; }

.cnt-table td {
  padding: 0.3rem 0.5rem;
  text-align: right;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.cnt-table td.col-cat { text-align: left; color: #eceff1; }
.col-count { font-weight: 600; color: #90caf9; }
.col-share { color: #607d8b; }

.cnt-row { cursor: pointer; transition: background 0.08s; }
.cnt-row:hover { background: rgba(52,152,219,0.15); }
.cnt-row.is-billed td.col-cat { color: #90caf9; font-weight: 600; }
.cnt-row.empty { color: #90a4ae; font-style: italic; }
.cnt-row.empty td { text-align: center; }

.cat-badge { font-size: 0.7rem; margin-left: 0.25rem; }
</style>
