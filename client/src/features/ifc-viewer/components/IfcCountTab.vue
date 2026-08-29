<template>
  <div class="cnt-tab cde-card">
    <CdeCardHeader icon="count" titel="Stück-Übersicht (Stk)">
      <CdeIconButton icon="refresh" titel="Neu berechnen" :busy="loading" @click="$emit('refresh')" />
    </CdeCardHeader>

    <div v-if="loading" class="cde-state-msg">Berechne…</div>
    <div v-else-if="!result || !result.byCategory.size" class="cde-state-msg">
      <CdeIcon name="count" :size="22" />
      Kein Modell geladen.
    </div>

    <template v-else>
      <!-- Summe oben -->
      <div class="cde-totals">
        <div class="cde-total-cell prim">
          <div class="cde-total-label">Σ Stück</div>
          <div class="cde-total-value">{{ result.totals.count }}</div>
        </div>
        <div class="cde-total-cell">
          <div class="cde-total-label">davon abrechenbar</div>
          <div class="cde-total-value">{{ billedTotal }}</div>
        </div>
        <div class="cde-total-cell">
          <div class="cde-total-label">Kategorien</div>
          <div class="cde-total-value">{{ result.byCategory.size }}</div>
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
      <div class="cde-table-wrap">
        <table class="cde-table">
          <thead>
            <tr>
              <th class="col-cat sortable" @click="setSort('name')">
                Kategorie
                <CdeIcon v-if="sortKey === 'name'" class="sort-arrow" :name="sortDir === 'asc' ? 'chevron-up' : 'chevron-down'" :size="11" />
              </th>
              <th class="col-count sortable" @click="setSort('count')">
                Anzahl
                <CdeIcon v-if="sortKey === 'count'" class="sort-arrow" :name="sortDir === 'asc' ? 'chevron-up' : 'chevron-down'" :size="11" />
              </th>
              <th class="col-share">% v. ges.</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in sortedRows"
              :key="row.category"
              class="klickbar"
              :class="{ 'is-billed': isBilled(row.category) }"
              @click="$emit('select-category', row.category)"
            >
              <td class="col-cat">
                <span class="cat-name">{{ row.category.replace(/^IFC/, '') }}</span>
                <CdeIcon v-if="isBilled(row.category)" class="cat-badge" name="billed" :size="11" />
              </td>
              <td class="col-count">{{ row.count }}</td>
              <td class="col-share">{{ pct(row.count, result.totals.count) }}</td>
            </tr>
            <tr v-if="!sortedRows.length" class="leer">
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
import CdeIcon from './ui/CdeIcon.vue';
import CdeCardHeader from './ui/CdeCardHeader.vue';
import CdeIconButton from './ui/CdeIconButton.vue';

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
/* Bausteine (Kopf, Summen, Tabelle) stehen in styles/theme.css —
   hier bleibt nur, was diese Kachel wirklich von den anderen unterscheidet. */
.cnt-tab { --card-accent: var(--cde-accent); font-size: 0.78rem; color: var(--cde-text); }

.filter-row { padding: 0 0.1rem; }
.filter-check {
  display: flex; align-items: center; gap: 0.4rem;
  font-size: var(--cde-font-sm); color: var(--cde-text-soft); cursor: pointer;
}
.filter-check input { accent-color: var(--card-accent); }

.col-count { font-weight: 600; color: var(--cde-accent-soft); }
.col-share { color: var(--cde-text-dim); }

tr.is-billed td.col-cat { color: var(--cde-accent-soft); font-weight: 600; }

.cat-badge { display: inline-block; margin-left: 0.25rem; color: var(--card-accent); vertical-align: -1px; }
</style>
