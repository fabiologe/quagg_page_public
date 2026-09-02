<template>
  <div class="area-schedule cde-card">
    <CdeCardHeader icon="areas" titel="Flächenbilanz DIN 277-1">
      <CdeIconButton icon="refresh" titel="Neu berechnen" :busy="loading" @click="$emit('refresh')" />
    </CdeCardHeader>

    <div v-if="loading" class="cde-state-msg">Berechne…</div>
    <div v-else-if="!result || !result.spaces.length" class="cde-state-msg">
      <CdeIcon name="areas" :size="22" />
      Kein IFCSPACE im Modell — keine Flächenbilanz möglich.
    </div>

    <template v-else>
      <!-- Gesamt-Summe oben -->
      <div class="cde-totals">
        <div class="cde-total-cell">
          <div class="cde-total-label">BGF</div>
          <div class="cde-total-value">{{ fmt(result.totals.BGF) }} m²</div>
        </div>
        <div class="cde-total-cell">
          <div class="cde-total-label">NGF</div>
          <div class="cde-total-value">{{ fmt(result.totals.NGF) }} m²</div>
        </div>
        <div class="cde-total-cell">
          <div class="cde-total-label">NUF gesamt</div>
          <div class="cde-total-value">{{ fmt(result.totals.NUF_total) }} m²</div>
        </div>
        <div class="cde-total-cell">
          <div class="cde-total-label">VF</div>
          <div class="cde-total-value">{{ fmt(result.totals.VF) }} m²</div>
        </div>
        <div class="cde-total-cell">
          <div class="cde-total-label">TF</div>
          <div class="cde-total-value">{{ fmt(result.totals.TF) }} m²</div>
        </div>
      </div>

      <!-- Geschosse × Klassen -->
      <div class="cde-table-wrap">
        <table class="cde-table">
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
              :disabled="!bearbeitung.modusAn"
              :title="bearbeitung.modusAn ? 'DIN-277-Klasse setzen' : 'Bearbeiten ist aus (E schaltet ein)'"
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
import CdeIcon from './ui/CdeIcon.vue';
import CdeCardHeader from './ui/CdeCardHeader.vue';
import CdeIconButton from './ui/CdeIconButton.vue';
import { useBearbeitung } from '../stores/useBearbeitung.js';

const props = defineProps({
  result:  { type: Object, default: null },   // { spaces, byStorey, totals }
  storeys: { type: Array,  default: () => [] }, // [{ localId, name, elevation }]
  loading: { type: Boolean, default: false },
});
defineEmits(['refresh', 'select-space', 'override-class']);

// Klassifizieren ist Bearbeiten — siehe IfcKgEditor.
const bearbeitung = useBearbeitung();

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
/* Bausteine: styles/theme.css. Hier nur das Eigene der Flächenbilanz. */
.area-schedule {
  --card-accent: var(--cde-success-strong);
  /* Fünf Kennwerte nebeneinander statt der drei üblichen. */
  --cols: 5;
  --table-max-h: none;
  font-size: 0.78rem;
  color: var(--cde-text);
}

.cde-total-value { font-size: 0.84rem; }

/* Nullwerte treten zurück, damit die belegten Zellen die Bilanz tragen. */
.cde-table td.zero { color: var(--cde-text-dimmer); }
.col-bgf { font-weight: 600; color: var(--card-accent); }
.cde-table td:first-child { font-weight: 500; }

.spaces-section { display: flex; flex-direction: column; gap: var(--cde-gap-xs); }
.section-title {
  font-size: 0.7rem; color: var(--cde-text-dim);
  text-transform: uppercase; letter-spacing: 0.07em;
}
.spaces-list { max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.15rem; }
.space-row {
  display: grid; grid-template-columns: 1fr 4rem 5rem;
  gap: var(--cde-gap-sm); align-items: center;
  padding: 0.25rem 0.4rem;
  background: var(--cde-fill);
  border-radius: var(--cde-radius-sm);
  cursor: pointer;
  transition: background 0.1s;
}
.space-row:hover { background: color-mix(in srgb, var(--card-accent) 16%, transparent); }
.space-row.override { border-left: 2px solid var(--cde-warn); }
.space-name { font-size: 0.75rem; color: var(--cde-text-bright); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.space-class {
  font-size: 0.7rem; padding: 0.1rem 0.25rem;
  background: var(--cde-fill-hover);
  border: 1px solid var(--cde-line-strong);
  border-radius: 3px; color: var(--cde-text);
  cursor: pointer;
}
.space-area { font-size: 0.74rem; color: var(--card-accent); text-align: right; }
</style>
