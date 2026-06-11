<template>
  <div class="vol-tab">
    <div class="card-header">
      <span class="card-title">📦 Volumen-Übersicht (m³)</span>
      <button class="card-btn" :disabled="loading" @click="$emit('refresh')" title="Neu berechnen">
        {{ loading ? '⏳' : '↻' }}
      </button>
    </div>

    <div v-if="loading" class="state-msg">Berechne…</div>
    <div v-else-if="!result || !result.byCategory.size" class="state-msg">
      Keine Geometrie geladen — Volumen werden aus den Bounding-Boxen abgeleitet.
    </div>

    <template v-else>
      <!-- Summe oben -->
      <div class="totals-bar">
        <div class="total-cell">
          <div class="total-label">Σ Volumen</div>
          <div class="total-value">{{ fmt(result.totals.volume_m3) }} m³</div>
        </div>
        <div class="total-cell">
          <div class="total-label">Elemente</div>
          <div class="total-value">{{ result.totals.count }}</div>
        </div>
        <div class="total-cell">
          <div class="total-label">Kategorien</div>
          <div class="total-value">{{ result.byCategory.size }}</div>
        </div>
      </div>

      <!-- Filter -->
      <div class="filter-row">
        <label class="filter-check">
          <input type="checkbox" v-model="onlyVolumeBilled" />
          Nur „Volumen-Positionen" (Wände, Decken, Stützen, Fundamente…)
        </label>
      </div>

      <!-- Tabelle -->
      <div class="vol-table-wrap">
        <table class="vol-table">
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
              <th class="col-vol" @click="setSort('volume')">
                Σ m³
                <span v-if="sortKey === 'volume'" class="sort-arrow">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
              </th>
              <th class="col-avg" @click="setSort('avg')">
                ⌀ m³
                <span v-if="sortKey === 'avg'" class="sort-arrow">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in sortedRows"
              :key="row.category"
              class="vol-row"
              :class="{ 'is-billed': isBilled(row.category) }"
              @click="$emit('select-category', row.category)"
            >
              <td class="col-cat">
                <span class="cat-name">{{ row.category.replace(/^IFC/, '') }}</span>
                <span v-if="isBilled(row.category)" class="cat-badge" title="Typischerweise nach Volumen abgerechnet">⚡</span>
              </td>
              <td class="col-count">{{ row.count }}</td>
              <td class="col-vol">{{ fmt(row.volume_m3) }}</td>
              <td class="col-avg">{{ fmt(row.avgVolume_m3) }}</td>
            </tr>
            <tr v-if="!sortedRows.length" class="vol-row empty">
              <td colspan="4">Keine Kategorien passen zum Filter.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="hint-row">
        ⓘ Volumen aus BoundingBox (Width × Height × Depth). Mesh-genaue Berechnung folgt in Sprint Volume-Truth.
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { VOLUME_BILLED_CATEGORIES } from '../services/QuantitySummary.js';

const props = defineProps({
  result:  { type: Object,  default: null },  // { byCategory: Map, totals }
  loading: { type: Boolean, default: false },
});
defineEmits(['refresh', 'select-category']);

const sortKey = ref('volume');
const sortDir = ref('desc');
const onlyVolumeBilled = ref(false);

function setSort(key) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  else { sortKey.value = key; sortDir.value = key === 'name' ? 'asc' : 'desc'; }
}

function isBilled(cat) { return VOLUME_BILLED_CATEGORIES.has(cat); }

const sortedRows = computed(() => {
  if (!props.result?.byCategory) return [];
  let rows = [];
  for (const [category, data] of props.result.byCategory.entries()) {
    if (onlyVolumeBilled.value && !isBilled(category)) continue;
    rows.push({ category, ...data });
  }
  const dir = sortDir.value === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    let av, bv;
    if (sortKey.value === 'name')  { av = a.category; bv = b.category; return av.localeCompare(bv) * dir; }
    if (sortKey.value === 'count') { av = a.count;       bv = b.count; }
    else if (sortKey.value === 'avg')    { av = a.avgVolume_m3; bv = b.avgVolume_m3; }
    else                                  { av = a.volume_m3;    bv = b.volume_m3; }
    return (av - bv) * dir;
  });
  return rows;
});

function fmt(n) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v === 0) return '–';
  return v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
</script>

<style scoped>
.vol-tab { display: flex; flex-direction: column; gap: 0.55rem; font-size: 0.78rem; color: #cfd8dc; }

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
  background: rgba(126, 87, 194, 0.12);
  border: 1px solid rgba(126, 87, 194, 0.3);
  border-radius: 4px;
  padding: 0.35rem 0.45rem;
  text-align: center;
}
.total-label { font-size: 0.62rem; color: #b39ddb; letter-spacing: 0.04em; text-transform: uppercase; }
.total-value { font-size: 0.92rem; color: #eceff1; font-weight: 600; }

.filter-row { padding: 0 0.1rem; }
.filter-check {
  display: flex; align-items: center; gap: 0.4rem;
  font-size: 0.72rem; color: #b0bec5; cursor: pointer;
}
.filter-check input { accent-color: #b39ddb; }

.vol-table-wrap { overflow-y: auto; max-height: 380px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.06); }
.vol-table { width: 100%; border-collapse: collapse; font-size: 0.74rem; font-variant-numeric: tabular-nums; }
.vol-table th {
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
.vol-table th.col-cat { text-align: left; }
.vol-table th:hover { color: #4fc3f7; }
.sort-arrow { font-size: 0.65rem; color: #4fc3f7; margin-left: 0.2rem; }

.vol-table td {
  padding: 0.3rem 0.5rem;
  text-align: right;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.vol-table td.col-cat { text-align: left; color: #eceff1; }
.col-vol { font-weight: 600; color: #ce93d8; }
.col-avg { color: #90a4ae; }

.vol-row { cursor: pointer; transition: background 0.08s; }
.vol-row:hover { background: rgba(52,152,219,0.15); }
.vol-row.is-billed td.col-cat { color: #b39ddb; font-weight: 600; }
.vol-row.empty { color: #90a4ae; font-style: italic; }
.vol-row.empty td { text-align: center; }

.cat-badge { font-size: 0.7rem; margin-left: 0.25rem; }
.cat-name { display: inline; }

.hint-row {
  font-size: 0.62rem; color: #607d8b;
  font-style: italic;
  padding: 0 0.2rem;
}
</style>
