<template>
  <div class="k-tab cde-card">
    <CdeCardHeader icon="kosten" titel="Kostenschätzung (DIN 276, Kennwerte)">
      <CdeIconButton icon="refresh" titel="Neu berechnen" :busy="loading" @click="$emit('refresh')" />
      <CdeIconButton icon="export" titel="Als CSV exportieren" :disabled="!kosten.rows.length" @click="exportCsv" />
      <CdeIconButton icon="excel"  titel="Als Excel exportieren" :disabled="!kosten.rows.length" @click="exportXlsx" />
    </CdeCardHeader>

    <div v-if="loading" class="cde-state-msg">Berechne…</div>
    <div v-else-if="!kosten.rows.length" class="cde-state-msg">
      <CdeIcon name="kosten" :size="22" />
      Keine KG-Klassifikation vorhanden — erst im Tab „Kostengruppen" berechnen.
    </div>

    <template v-else>
      <div class="cde-table-wrap">
        <table class="cde-table">
          <thead>
            <tr>
              <th class="col-kg">KG</th>
              <th class="col-label">Bezeichnung</th>
              <th class="col-menge">Menge</th>
              <th class="col-einheit">Einh.</th>
              <th class="col-wert">€/Einh.</th>
              <th class="col-betrag">Betrag</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in kosten.rows" :key="row.kgCode" class="k-row" :class="{ 'no-kw': !row.hasKennwert }">
              <td class="col-kg">
                <span class="swatch" :style="{ background: kgColor(row.kgCode) }" />
                {{ row.kgCode }}
              </td>
              <td class="col-label" :title="kgTitle(row.kgCode)">{{ shortTitle(row.kgCode) }}</td>
              <td class="col-menge" :title="`${row.count} Elemente · ${fmt(row.volume_m3)} m³ · ${fmt(row.length_m)} m`">
                {{ row.einheit === 'stk' ? row.count : row.einheit === 'm' ? fmt(row.length_m) : fmt(row.volume_m3) }}
              </td>
              <td class="col-einheit">
                <select
                  class="k-select"
                  :value="row.einheit"
                  @change="onKennwertChange(row.kgCode, { einheit: $event.target.value })"
                >
                  <option v-for="e in KENNWERT_EINHEITEN" :key="e" :value="e">{{ EINHEIT_LABELS[e] }}</option>
                </select>
              </td>
              <td class="col-wert">
                <input
                  class="k-input"
                  type="number" min="0" step="10"
                  :value="row.wert ?? ''"
                  placeholder="—"
                  @change="onKennwertChange(row.kgCode, { wert: Number($event.target.value) })"
                />
              </td>
              <td class="col-betrag">{{ row.hasKennwert ? fmtEur(row.betrag) : '–' }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="k-sum-row">
              <td colspan="5">Σ Kennwert-Schätzung</td>
              <td class="col-betrag">{{ fmtEur(kosten.summe) }}</td>
            </tr>
            <tr v-if="pauschalSumme > 0" class="k-sum-row dim">
              <td colspan="5">+ Pauschalpositionen</td>
              <td class="col-betrag">{{ fmtEur(pauschalSumme) }}</td>
            </tr>
            <tr v-if="pauschalSumme > 0" class="k-sum-row total">
              <td colspan="5">Σ Gesamt</td>
              <td class="col-betrag">{{ fmtEur(kosten.summe + pauschalSumme) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p class="cde-hint">
        <CdeIcon name="info" :size="12" />
        <span>
          Spur je Zeile: Menge × Kennwert = Betrag. Kennwerte sind Anhaltswerte
          (editierbar, werden gespeichert) — Mengenherkunft siehe Volumen-Tab (Qto vs. BBox).
        </span>
      </p>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { kgColor, kgTitle, KG_LOOKUP } from '../services/Din276Defaults.js';
import { computeKosten, KENNWERT_EINHEITEN, EINHEIT_LABELS } from '../services/KgKennwerte.js';
import CdeIcon from './ui/CdeIcon.vue';
import CdeCardHeader from './ui/CdeCardHeader.vue';
import CdeIconButton from './ui/CdeIconButton.vue';

const props = defineProps({
  kgResult:      { type: Object,  default: null },  // { byKg } aus KgClassifier
  kennwerte:     { type: Object,  default: () => ({}) },
  pauschalSumme: { type: Number,  default: 0 },
  loading:       { type: Boolean, default: false },
});
const emit = defineEmits(['refresh', 'update-kennwert']);

const kosten = computed(() => computeKosten(props.kgResult?.byKg, props.kennwerte));

function shortTitle(code) {
  const node = KG_LOOKUP.get(String(code));
  return node ? (node.label.split(' — ')[1] ?? node.label) : code;
}

function onKennwertChange(kgCode, patch) {
  emit('update-kennwert', { kgCode, patch });
}

function fmt(n) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v === 0) return '–';
  return v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function fmtEur(n) {
  const v = Number(n ?? 0);
  return v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

// ── Export ──────────────────────────────────────────────────────────────────

function _exportRows() {
  return kosten.value.rows.map(r => ({
    KG: r.kgCode,
    Bezeichnung: shortTitle(r.kgCode),
    Elemente: r.count,
    'Volumen_m3': Number(r.volume_m3.toFixed(2)),
    'Laenge_m': Number((r.length_m ?? 0).toFixed(2)),
    Menge: Number(r.menge.toFixed(2)),
    Einheit: EINHEIT_LABELS[r.einheit] ?? r.einheit,
    'Kennwert_EUR': r.wert ?? '',
    'Betrag_EUR': r.hasKennwert ? Number(r.betrag.toFixed(2)) : '',
  }));
}

function exportCsv() {
  const rows = _exportRows();
  const header = Object.keys(rows[0]);
  const lines = [header.join(';')];
  for (const r of rows) {
    lines.push(header.map(h => String(r[h]).replace(/;/g, ',')).join(';'));
  }
  lines.push('');
  lines.push(`Summe_Kennwert;;;;;;;${kosten.value.summe.toFixed(2)}`);
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  _download(blob, `kostenschaetzung-${_stamp()}.csv`);
}

async function exportXlsx() {
  // Dynamischer Import — hält xlsx aus dem Haupt-Bundle
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(_exportRows());
  XLSX.utils.sheet_add_aoa(ws, [['Σ Kennwert-Schätzung', '', '', '', '', '', '', Number(kosten.value.summe.toFixed(2))]], { origin: -1 });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Kosten DIN 276');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  _download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `kostenschaetzung-${_stamp()}.xlsx`);
}

function _stamp() { return new Date().toISOString().slice(0, 10); }
function _download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
</script>

<style scoped>
/* Bausteine: styles/theme.css. Die Kostenkachel führt Geld — Leitfarbe Bernstein. */
.k-tab {
  --card-accent: var(--cde-amber);
  --table-max-h: 400px;
  font-size: 0.78rem;
  color: var(--cde-text);
}

/* Zwei linksbündige Spalten statt nur der ersten. */
.cde-table th.col-label,
.cde-table td.col-label { text-align: left; }

.cde-table td.col-kg { font-weight: 600; white-space: nowrap; }
.cde-table td.col-label {
  color: var(--cde-text);
  max-width: 130px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.col-betrag { font-weight: 600; color: var(--cde-success); }
/* Ohne hinterlegten Kennwert ist der Betrag keine Aussage — er tritt zurück. */
.k-row.no-kw .col-betrag { color: var(--cde-text-mute); }

.swatch {
  display: inline-block; width: 0.7rem; height: 0.7rem;
  border-radius: 2px; border: 1px solid var(--cde-line-strong);
  margin-right: 0.25rem; vertical-align: -1px;
}

.k-select, .k-input {
  background: var(--cde-fill-hover);
  border: 1px solid var(--cde-line-strong);
  color: var(--cde-text);
  border-radius: 3px;
  font-size: 0.72rem;
  padding: 0.12rem 0.24rem;
}
.k-select:focus-visible, .k-input:focus-visible {
  outline: none;
  border-color: var(--card-accent);
}
.k-input { width: 4.6rem; text-align: right; }
.k-input::-webkit-outer-spin-button,
.k-input::-webkit-inner-spin-button { -webkit-appearance: none; }

.k-sum-row td {
  font-weight: 600; color: var(--cde-text-bright);
  background: var(--cde-fill);
  border-top: 1px solid var(--cde-line-strong);
  border-bottom: none;
}
.k-sum-row.dim td { font-weight: 400; color: var(--cde-text-soft); border-top: none; }
.k-sum-row.total td { color: var(--cde-success); font-size: 0.8rem; }
</style>
