<template>
  <div class="vol-tab cde-card">
    <CdeCardHeader icon="volume" titel="Volumen-Übersicht (m³)">
      <CdeIconButton icon="refresh" titel="Neu berechnen" :busy="loading" @click="$emit('refresh')" />
    </CdeCardHeader>

    <div v-if="loading" class="cde-state-msg">Berechne…</div>
    <div v-else-if="!result || !result.byCategory.size" class="cde-state-msg">
      <CdeIcon name="volume" :size="22" />
      Keine Geometrie geladen — Volumen werden aus den Bounding-Boxen abgeleitet.
    </div>

    <template v-else>
      <!-- Summe oben -->
      <div class="cde-totals">
        <div class="cde-total-cell">
          <div class="cde-total-label">Σ Volumen</div>
          <div class="cde-total-value">{{ fmt(result.totals.volume_m3) }} m³</div>
        </div>
        <div class="cde-total-cell">
          <div class="cde-total-label">Elemente</div>
          <div class="cde-total-value">{{ result.totals.count }}</div>
        </div>
        <div class="cde-total-cell">
          <div class="cde-total-label">Qto-Quote</div>
          <div class="cde-total-value" :title="'Anteil der Elemente mit Modell-Quantities (Qto_*) statt BBox-Näherung'">
            {{ Math.round((result.totals.qtoShare ?? 0) * 100) }} %
          </div>
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
              <th class="col-vol sortable" @click="setSort('volume')">
                Σ m³
                <CdeIcon v-if="sortKey === 'volume'" class="sort-arrow" :name="sortDir === 'asc' ? 'chevron-up' : 'chevron-down'" :size="11" />
              </th>
              <th class="col-area sortable" @click="setSort('area')">
                Σ m²
                <CdeIcon v-if="sortKey === 'area'" class="sort-arrow" :name="sortDir === 'asc' ? 'chevron-up' : 'chevron-down'" :size="11" />
              </th>
              <th class="col-len sortable" @click="setSort('length')">
                Σ m
                <CdeIcon v-if="sortKey === 'length'" class="sort-arrow" :name="sortDir === 'asc' ? 'chevron-up' : 'chevron-down'" :size="11" />
              </th>
              <th class="col-src" title="Herkunft: Qto = Modell-Quantities, BBox = Näherung">Quelle</th>
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
              <td class="col-vol">{{ fmt(row.volume_m3) }}</td>
              <td class="col-area">{{ fmt(row.area_m2) }}</td>
              <td class="col-len">{{ fmt(row.length_m) }}</td>
              <td class="col-src">
                <span class="cde-badge" :class="srcClass(row)">{{ srcLabel(row) }}</span>
              </td>
            </tr>
            <tr v-if="!sortedRows.length" class="leer">
              <td colspan="6">Keine Kategorien passen zum Filter.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="cde-hint">
        <CdeIcon name="info" :size="12" />
        <span>
          „Qto" = Mengen aus den Modell-Quantities (Qto_*BaseQuantities) des Autorenwerkzeugs.
          „BBox" = Näherung aus der BoundingBox — nur für Kennwerte (LP 2-3) geeignet.
        </span>
      </p>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { VOLUME_BILLED_CATEGORIES } from '../services/QuantitySummary.js';
import CdeIcon from './ui/CdeIcon.vue';
import CdeCardHeader from './ui/CdeCardHeader.vue';
import CdeIconButton from './ui/CdeIconButton.vue';

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

/** Herkunfts-Badge: Qto / Mesh / BBox oder gemischt (Sprint G: 'mesh' neu). */
function srcLabel(row) {
  const q = row.sources?.qto ?? 0, m = row.sources?.mesh ?? 0, b = row.sources?.bbox ?? 0;
  const total = q + m + b;
  if (!total) return '–';
  if (q === total) return 'Qto';
  if (m === total) return 'Mesh';
  if (b === total) return 'BBox';
  const parts = [];
  if (q) parts.push(`Qto ${Math.round(q / total * 100)} %`);
  if (m) parts.push(`Mesh ${Math.round(m / total * 100)} %`);
  return parts.join(' · ') || 'BBox';
}
function srcClass(row) {
  const q = row.sources?.qto ?? 0, m = row.sources?.mesh ?? 0, b = row.sources?.bbox ?? 0;
  if ((q || m) && !b) return 'ok';
  if (!q && !m && b) return 'warn';
  return 'mute';
}

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
    else if (sortKey.value === 'area')   { av = a.area_m2 ?? 0;  bv = b.area_m2 ?? 0; }
    else if (sortKey.value === 'length') { av = a.length_m ?? 0; bv = b.length_m ?? 0; }
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
/* Leitfarbe dieser Kachel — Kopf, Summenleiste und Tabelle lesen sie
   (Definition der Bausteine: styles/theme.css). */
.vol-tab { --card-accent: var(--cde-violet); font-size: 0.78rem; color: var(--cde-text); }

.filter-row { padding: 0 0.1rem; }
.filter-check {
  display: flex; align-items: center; gap: 0.4rem;
  font-size: var(--cde-font-sm); color: var(--cde-text-soft); cursor: pointer;
}
.filter-check input { accent-color: var(--card-accent); }

/* Spaltenbetonung: das Volumen ist der Wert, um den es hier geht. */
.col-vol { font-weight: 600; color: color-mix(in srgb, var(--card-accent) 75%, var(--cde-text-bright)); }
.col-area, .col-len { color: var(--cde-text-dim); }

tr.is-billed td.col-cat { color: var(--card-accent); font-weight: 600; }

.cat-badge { display: inline-block; margin-left: 0.25rem; color: var(--card-accent); vertical-align: -1px; }
</style>
