<template>
  <div class="k-tab">
    <div class="card-header">
      <span class="card-title">💶 Kostenschätzung (DIN 276, Kennwerte)</span>
      <div class="card-actions">
        <button class="card-btn" :disabled="loading" @click="$emit('refresh')" title="Neu berechnen">
          {{ loading ? '⏳' : '↻' }}
        </button>
        <button class="card-btn" :disabled="!kosten.rows.length" @click="exportCsv" title="Als CSV exportieren">📄</button>
        <button class="card-btn" :disabled="!kosten.rows.length" @click="exportXlsx" title="Als Excel exportieren">📊</button>
      </div>
    </div>

    <div v-if="loading" class="state-msg">Berechne…</div>
    <div v-else-if="!kosten.rows.length" class="state-msg">
      Keine KG-Klassifikation vorhanden — erst im Tab „Kostengruppen" berechnen.
    </div>

    <template v-else>
      <div class="k-table-wrap">
        <table class="k-table">
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
              <td class="col-menge" :title="`${row.count} Elemente · ${fmt(row.volume_m3)} m³`">
                {{ row.einheit === 'stk' ? row.count : fmt(row.volume_m3) }}
              </td>
              <td class="col-einheit">
                <select
                  class="k-select"
                  :value="row.einheit"
                  @change="onKennwertChange(row.kgCode, { einheit: $event.target.value })"
                >
                  <option value="m3">m³</option>
                  <option value="stk">Stk</option>
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

      <div class="hint-row">
        ⓘ Spur je Zeile: Menge × Kennwert = Betrag. Kennwerte sind Anhaltswerte
        (editierbar, werden gespeichert) — Mengenherkunft siehe Volumen-Tab (Qto vs. BBox).
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { kgColor, kgTitle, KG_LOOKUP } from '../services/Din276Defaults.js';
import { computeKosten } from '../services/KgKennwerte.js';

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
    Menge: r.einheit === 'stk' ? r.count : Number(r.volume_m3.toFixed(2)),
    Einheit: r.einheit === 'stk' ? 'Stk' : 'm³',
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
.k-tab { display: flex; flex-direction: column; gap: 0.55rem; font-size: 0.78rem; color: #cfd8dc; }

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
}
.card-btn:hover:not(:disabled) { background: rgba(255,255,255,0.14); }
.card-btn:disabled { opacity: 0.5; cursor: default; }

.state-msg { color: #90a4ae; font-style: italic; padding: 1rem 0.5rem; text-align: center; }

.k-table-wrap { overflow-y: auto; max-height: 400px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.06); }
.k-table { width: 100%; border-collapse: collapse; font-size: 0.74rem; font-variant-numeric: tabular-nums; }
.k-table th {
  position: sticky; top: 0; z-index: 1;
  background: rgba(15,30,40,0.95);
  color: #b0bec5;
  padding: 0.35rem 0.45rem;
  text-align: right;
  font-weight: 500;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.k-table th.col-kg, .k-table th.col-label { text-align: left; }
.k-table td {
  padding: 0.25rem 0.45rem;
  text-align: right;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.k-table td.col-kg { text-align: left; font-weight: 600; color: #eceff1; white-space: nowrap; }
.k-table td.col-label { text-align: left; color: #cfd8dc; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-betrag { font-weight: 600; color: #a5d6a7; }
.k-row.no-kw .col-betrag { color: #78909c; }

.swatch {
  display: inline-block; width: 0.7rem; height: 0.7rem;
  border-radius: 2px; border: 1px solid rgba(255,255,255,0.15);
  margin-right: 0.25rem; vertical-align: -1px;
}

.k-select, .k-input {
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.14);
  color: #cfd8dc;
  border-radius: 3px;
  font-size: 0.72rem;
  padding: 0.1rem 0.2rem;
}
.k-input { width: 4.6rem; text-align: right; }
.k-input::-webkit-outer-spin-button, .k-input::-webkit-inner-spin-button { -webkit-appearance: none; }

.k-sum-row td {
  font-weight: 600; color: #eceff1;
  background: rgba(255,255,255,0.05);
  border-top: 1px solid rgba(255,255,255,0.12);
}
.k-sum-row.dim td { font-weight: 400; color: #b0bec5; background: rgba(255,255,255,0.02); border-top: none; }
.k-sum-row.total td { color: #a5d6a7; font-size: 0.8rem; }

.hint-row { font-size: 0.62rem; color: #607d8b; font-style: italic; padding: 0 0.2rem; }
</style>
