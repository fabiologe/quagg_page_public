<template>
  <div class="area-schedule">
    <div class="card-header">
      <span class="card-title">📐 Flächenbilanz DIN 277-1</span>
      <button class="card-btn" :disabled="loading" @click="$emit('refresh')" title="Neu berechnen">
        {{ loading ? '⏳' : '↻' }}
      </button>
    </div>

    <div v-if="loading" class="state-msg">Berechne…</div>
    <div v-else-if="!result || !result.spaces.length" class="state-msg">
      Kein IFCSPACE im Modell — keine Flächenbilanz möglich.
    </div>

    <template v-else>
      <!-- Gesamt-Summe oben -->
      <div class="totals-bar">
        <div class="total-cell">
          <div class="total-label">BGF</div>
          <div class="total-value">{{ fmt(result.totals.BGF) }} m²</div>
        </div>
        <div class="total-cell">
          <div class="total-label">NGF</div>
          <div class="total-value">{{ fmt(result.totals.NGF) }} m²</div>
        </div>
        <div class="total-cell">
          <div class="total-label">NUF gesamt</div>
          <div class="total-value">{{ fmt(result.totals.NUF_total) }} m²</div>
        </div>
        <div class="total-cell">
          <div class="total-label">VF</div>
          <div class="total-value">{{ fmt(result.totals.VF) }} m²</div>
        </div>
        <div class="total-cell">
          <div class="total-label">TF</div>
          <div class="total-value">{{ fmt(result.totals.TF) }} m²</div>
        </div>
      </div>

      <!-- Geschosse × Klassen -->
      <div class="schedule-table-wrap">
        <table class="schedule-table">
          <thead>
            <tr>
              <th class="col-storey">Geschoss</th>
              <th v-for="cls in displayedClasses" :key="cls.code" :title="cls.label">{{ cls.code }}</th>
              <th class="col-bgf">BGF</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in storeyRows" :key="row.storeyLocalId ?? '__no_storey'">
              <td class="col-storey">{{ row.label }}</td>
              <td
                v-for="cls in displayedClasses"
                :key="cls.code"
                :class="{ zero: !row.totals[cls.code] }"
              >{{ fmt(row.totals[cls.code]) }}</td>
              <td class="col-bgf">{{ fmt(row.totals.BGF) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Einzelne Räume -->
      <div class="spaces-section">
        <div class="section-title">Räume ({{ result.spaces.length }})</div>
        <div class="spaces-list">
          <div
            v-for="s in result.spaces"
            :key="s.globalId || `${s.modelId}-${s.localId}`"
            class="space-row"
            :class="{ override: s.source === 'override' }"
            @click="$emit('select-space', s)"
            :title="storeysById.get(s.storeyLocalId)?.label ?? ''"
          >
            <span class="space-name">{{ s.name || s.longName || '—' }}</span>
            <select
              class="space-class"
              :value="s.classCode"
              @click.stop
              @change="$emit('override-class', { globalId: s.globalId, classCode: $event.target.value })"
            >
              <option v-for="c in classOptions" :key="c.code" :value="c.code">{{ c.code }}</option>
            </select>
            <span class="space-area">{{ fmt(s.area_m2) }} m²</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { DIN277_CLASSES } from '../services/Din277Classifier.js';

const props = defineProps({
  result:  { type: Object, default: null },   // { spaces, byStorey, totals }
  storeys: { type: Array,  default: () => [] }, // [{ localId, name, elevation }]
  loading: { type: Boolean, default: false },
});
defineEmits(['refresh', 'select-space', 'override-class']);

const classOptions = Object.values(DIN277_CLASSES);

// Show NUF1-7 + VF + TF, in this order
const displayedClasses = computed(() => classOptions);

const storeysById = computed(() => {
  const m = new Map();
  for (const s of props.storeys ?? []) m.set(s.localId, s);
  return m;
});

const storeyRows = computed(() => {
  if (!props.result?.byStorey) return [];
  const rows = [];
  // Sort storeys by elevation (lowest first)
  const sorted = [...(props.storeys ?? [])].sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0));
  for (const sty of sorted) {
    const totals = props.result.byStorey.get(sty.localId);
    if (!totals) continue;
    rows.push({ storeyLocalId: sty.localId, label: sty.name || `Geschoss ${sty.localId}`, totals });
  }
  // Spaces without an assigned storey
  const orphan = props.result.byStorey.get(null);
  if (orphan) rows.push({ storeyLocalId: null, label: '(ohne Geschoss)', totals: orphan });
  return rows;
});

function fmt(v) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n === 0) return '–';
  return n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
</script>

<style scoped>
.area-schedule {
  display: flex; flex-direction: column; gap: 0.55rem;
  font-size: 0.78rem;
  color: var(--cde-text);
}
.card-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.35rem 0.4rem;
  background: var(--cde-tint-weak);
  border-radius: 5px;
  border: 1px solid var(--cde-tint);
}
.card-title { font-weight: 600; font-size: 0.84rem; color: var(--cde-text-bright); }
.card-btn {
  background: var(--cde-tint);
  border: 1px solid var(--cde-tint-strong);
  color: var(--cde-text);
  width: 1.6rem; height: 1.6rem;
  border-radius: 4px;
  cursor: pointer;
}
.card-btn:hover:not(:disabled) { background: var(--cde-tint-max); }
.card-btn:disabled { opacity: 0.5; cursor: default; }

.state-msg { color: var(--cde-text-dim); font-style: italic; padding: 0.8rem 0.4rem; text-align: center; }

.totals-bar {
  display: grid; grid-template-columns: repeat(5, 1fr);
  gap: 0.3rem;
}
.total-cell {
  background: rgba(102,187,106,0.1);
  border: 1px solid rgba(102,187,106,0.25);
  border-radius: 4px;
  padding: 0.32rem 0.4rem;
  text-align: center;
}
.total-label { font-size: 0.62rem; color: var(--cde-success); letter-spacing: 0.04em; text-transform: uppercase; }
.total-value { font-size: 0.84rem; color: var(--cde-text-bright); font-weight: 600; }

.schedule-table-wrap {
  overflow-x: auto;
  border-radius: 4px;
  border: 1px solid var(--cde-tint-weak);
}
.schedule-table { width: 100%; border-collapse: collapse; font-size: 0.74rem; }
.schedule-table th {
  background: var(--cde-tint-weak);
  color: var(--cde-text-soft);
  padding: 0.32rem 0.45rem;
  text-align: right;
  font-weight: 500;
  border-bottom: 1px solid var(--cde-tint);
}
.schedule-table th:first-child { text-align: left; }
.schedule-table td {
  padding: 0.28rem 0.45rem;
  text-align: right;
  border-bottom: 1px solid var(--cde-tint-weak);
}
.schedule-table td:first-child { text-align: left; color: var(--cde-text-bright); font-weight: 500; }
.schedule-table td.zero { color: #455a64; }
.col-bgf { font-weight: 600; color: var(--cde-success) !important; }

.spaces-section { display: flex; flex-direction: column; gap: 0.25rem; }
.section-title { font-size: 0.7rem; color: var(--cde-text-dim); text-transform: uppercase; letter-spacing: 0.07em; }
.spaces-list { max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.15rem; }
.space-row {
  display: grid; grid-template-columns: 1fr 4rem 5rem;
  gap: 0.4rem; align-items: center;
  padding: 0.25rem 0.4rem;
  background: var(--cde-tint-weak);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.08s;
}
.space-row:hover { background: rgba(52,152,219,0.15); }
.space-row.override { border-left: 2px solid var(--cde-warn); }
.space-name { font-size: 0.75rem; color: var(--cde-text-bright); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.space-class {
  font-size: 0.7rem; padding: 0.1rem 0.25rem;
  background: var(--cde-tint);
  border: 1px solid var(--cde-tint-strong);
  border-radius: 3px; color: var(--cde-text);
  cursor: pointer;
}
.space-area { font-size: 0.74rem; color: var(--cde-success); text-align: right; }
</style>
