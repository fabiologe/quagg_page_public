<template>
  <div class="bridge-results-panel">

    <!-- Geometrie-Fehler + Warnungen (aus useBridgeValidation) -->
    <div v-if="errors.length || warnings.length" class="geometry-warnings">
      <div v-for="e in errors" :key="e.code" class="geo-warn geo-error">
        <span class="geo-warn-code">Fehler</span>
        <span><strong>{{ e.title }}</strong> – {{ e.detail }}</span>
      </div>
      <div v-for="w in warnings" :key="w.code" class="geo-warn geo-hint">
        <span class="geo-warn-code">Hinweis</span>
        <span><strong>{{ w.title }}</strong> – {{ w.detail }}</span>
      </div>
    </div>

    <!-- Aktueller Zustand -->
    <div class="current-section">
      <div class="current-header">
        <h3 class="sec-title">WSP = {{ store.wsp.toFixed(2) }} m</h3>
        <div class="q-total-chip">
          Q<sub>ges</sub> = <strong>{{ r.Q_total.toFixed(3) }}</strong> m³/s
        </div>
      </div>

      <!-- Hydraulischer Zustand -->
      <div class="state-banner" :class="[stateBannerClass, { 'state-override': r.flowModeUsed !== 'auto' }]">
        <span class="state-label">{{ stateLabel }}</span>
        <span v-if="r.flowModeUsed === 'free'" class="state-tag override-free">Freispiegel erzwungen</span>
        <span v-else-if="r.flowModeUsed === 'pressure'" class="state-tag override-pressure">Druckabfluss erzwungen</span>
        <span v-if="r.isUWActive" class="state-tag uw-tag">
          Eingestaut · &Delta;h = {{ r.h_drive.toFixed(2) }} m
        </span>
        <span v-if="r.frWarn && !r.chokeWarn" class="state-tag fr-warn-tag">
          Fr = {{ Math.max(r.Fr1, r.Fr_open).toFixed(2) }} ≥ 0.8
        </span>
        <span v-if="r.chokeWarn" class="state-tag choke-tag">
          Fr<sub>öffn.</sub> = {{ r.Fr_open.toFixed(2) }} ≥ 1 — kritischer Abfluss in der Öffnung
        </span>
        <span v-if="r.weirSubmerged" class="state-tag uw-tag">
          Überfall eingestaut · σ = {{ r.weirSigma.toFixed(2) }}
        </span>
        <span class="state-formula">{{ stateFormula }}</span>
      </div>

      <div class="zones-grid">
        <!-- Zone 1 -->
        <div class="zone-card z1" :class="{ submerged: r.isSubmerged, 'no-bridge': !r.hasBridge }">
          <div class="zone-header">
            <span class="zlabel">Zone 1 – Durchströmung</span>
            <span class="zmode">
              {{ !r.hasBridge ? 'Manning' : r.isSubmerged ? 'Orifice' : 'Manning' }}
            </span>
          </div>
          <div class="metrics">
            <div class="m"><span>Q₁</span><strong>{{ r.Q1_total.toFixed(3) }}</strong><em>m³/s</em></div>
            <div class="m"><span>v̄₁</span><strong>{{ r.v1_mean.toFixed(2) }}</strong><em>m/s</em></div>
            <div class="m">
              <span>{{ r.isSubmerged ? 'A_öffn.' : 'A₁' }}</span>
              <strong>{{ (r.isSubmerged ? r.A_bridge : r.A1_total).toFixed(2) }}</strong>
              <em>m²</em>
            </div>
            <div class="m" v-if="store.nPiers > 0 && r.hasBridge">
              <span>φ</span><strong>{{ (r.phi * 100).toFixed(1) }}%</strong><em>&nbsp;</em>
            </div>
            <div class="m" v-if="r.isSubmerged && store.nPiers > 0">
              <span>A_netto</span><strong>{{ r.A_netto.toFixed(2) }}</strong><em>m²</em>
            </div>
            <div class="m" v-if="!r.isSubmerged">
              <span>R̄₁</span><strong>{{ r.R1_mean.toFixed(3) }}</strong><em>m</em>
            </div>
            <div class="m">
              <span>Fr</span>
              <strong :class="{ 'fr-warn-val': r.Fr1 >= 0.8 }">{{ r.Fr1.toFixed(3) }}</strong>
              <em>–</em>
            </div>
            <div class="m" v-if="!r.isSubmerged && r.hasBridge && r.Fr_open > 0">
              <span>Fr_öffn.</span>
              <strong :class="{ 'fr-warn-val': r.Fr_open >= 0.8 }">{{ r.Fr_open.toFixed(3) }}</strong>
              <em>–</em>
            </div>
            <div class="m" v-if="!r.isSubmerged && r.dh_pier > 0.0005">
              <span>Δh_P</span>
              <strong>{{ (r.dh_pier * 100).toFixed(1) }}</strong>
              <em>cm Pfeilerstau</em>
            </div>
            <div class="m" v-if="r.isSubmerged">
              <span>Q_Orifice</span><strong>{{ r.Q_orifice.toFixed(3) }}</strong><em>m³/s</em>
            </div>
            <div class="m" v-if="r.isSubmerged && store.zeta > 0">
              <span>μ_eff</span><strong>{{ r.mu_eff.toFixed(3) }}</strong><em>–</em>
            </div>
          </div>
        </div>

        <!-- Zone 2 -->
        <div class="zone-card z2" :class="{ inactive: !r.hasOverflow }">
          <div class="zone-header">
            <span class="zlabel">Zone 2 – Überströmung</span>
            <span class="zmode">{{ r.hasOverflow ? 'Poleni' : 'Inaktiv' }}</span>
          </div>
          <template v-if="r.hasOverflow">
            <div class="metrics">
              <div class="m"><span>Q₂</span><strong>{{ r.Q2_total.toFixed(3) }}</strong><em>m³/s</em></div>
              <div class="m"><span>Q_Poleni</span><strong>{{ r.Q_poleni.toFixed(3) }}</strong><em>m³/s</em></div>
              <div class="m"><span>A₂</span><strong>{{ r.A2_total.toFixed(2) }}</strong><em>m²</em></div>
              <div class="m"><span>v̄₂</span><strong>{{ r.v2_mean.toFixed(2) }}</strong><em>m/s</em></div>
              <div class="m" v-if="r.weirSubmerged">
                <span>σ</span><strong>{{ r.weirSigma.toFixed(3) }}</strong><em>Rückstau</em>
              </div>
            </div>
          </template>
          <div v-else class="inactive-note">WSP ≤ BOK</div>
        </div>
      </div>

      <!-- kSt-Zonen Aufschlüsselung (nur bei Freispiegel mit mehreren Zonen) -->
      <div v-if="!r.isSubmerged && r.zoneResults.length > 1" class="kst-breakdown">
        <div class="kst-breakdown-title">Composite Manning – kSt-Zonen</div>
        <table class="kst-table">
          <thead>
            <tr>
              <th>kSt</th>
              <th>A₁ (m²)</th>
              <th>Q₁ (m³/s)</th>
              <th>A₂ (m²)</th>
              <th>Q₂ (m³/s)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="z in r.zoneResults" :key="z.kst">
              <td class="kst-val">{{ z.kst }}</td>
              <td>{{ z.A1.toFixed(2) }}</td>
              <td>{{ z.Q1.toFixed(3) }}</td>
              <td>{{ z.A2.toFixed(2) }}</td>
              <td>{{ z.Q2.toFixed(3) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Gesamtabfluss -->
      <div class="total-bar">
        <span class="total-formula">
          Q<sub>ges</sub> = Q₁ + Q₂ = {{ r.Q1_total.toFixed(3) }} + {{ r.Q2_total.toFixed(3) }}
        </span>
        <span class="total-val">{{ r.Q_total.toFixed(3) }} m³/s</span>
        <span class="total-ls">= {{ (r.Q_total * 1000).toFixed(0) }} l/s</span>
      </div>
    </div>

    <!-- Ratingkurve -->
    <div class="rating-section">
      <div class="rating-header">
        <h3 class="sec-title">Rating Curve</h3>
        <span class="rating-range">{{ store.wspMin.toFixed(1) }} – {{ store.wspMax.toFixed(1) }} m</span>
      </div>

      <div class="table-wrap">
        <table class="rating-table">
          <thead>
            <tr>
              <th>WSP (m)</th>
              <th>A₁ (m²)</th>
              <th>Q₁ (m³/s)</th>
              <th>A₂ (m²)</th>
              <th>Q₂ (m³/s)</th>
              <th class="col-total">Q<sub>ges</sub></th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in store.ratingCurve" :key="row.wsp"
              :class="{
                'row-active': isCurrentRow(row.wsp),
                'row-submerged': row.isSubmerged && !row.hasOverflow,
                'row-overflow': row.hasOverflow
              }">
              <td class="col-wsp">{{ row.wsp.toFixed(2) }}</td>
              <td>{{ row.A1_total.toFixed(2) }}</td>
              <td>{{ row.Q1_total.toFixed(3) }}</td>
              <td>{{ row.A2_total > 0 ? row.A2_total.toFixed(2) : '–' }}</td>
              <td>{{ row.Q2_total > 0 ? row.Q2_total.toFixed(3) : '–' }}</td>
              <td class="col-total">{{ row.Q_total.toFixed(3) }}</td>
              <td class="col-status">
                <span v-if="row.hasOverflow"      class="sbadge overflow">Z3</span>
                <span v-else-if="row.isSubmerged" class="sbadge pressure">Z2</span>
                <span v-else                      class="sbadge free">Z1</span>
                <span v-if="row.chokeWarn"        class="sbadge choke">krit</span>
                <span v-else-if="row.frWarn"      class="sbadge fr-warn">Fr⚠</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useBridgeStore } from '../stores/useBridgeStore.js'
import { useBridgeValidation } from '../composables/useBridgeValidation.js'

const store = useBridgeStore()
const { errors, warnings } = useBridgeValidation()
const r = computed(() => store.currentResult)

const rowStep = computed(() => (store.wspMax - store.wspMin) / store.ratingSteps)
function isCurrentRow(wsp) {
  return Math.abs(wsp - store.wsp) < rowStep.value * 0.55
}

const STATE_INFO = {
  0: { label: 'Zustand 0 – Freispiegel',         formula: 'Q = Σ kSt · A · R^(2/3) · I^(1/2)',           cls: 'state-free'     },
  1: { label: 'Zustand 1 – Freispiegel',          formula: 'Q = Σ kSt · A · R^(2/3) · I^(1/2)',           cls: 'state-free'     },
  2: { label: 'Zustand 2 – Druckabfluss',         formula: 'Q = μ · A_öffn. · √(2g·Δh) / √(1+μ²·ζ)',    cls: 'state-pressure'  },
  3: { label: 'Zustand 3 – Druck + Überströmung', formula: 'Q₁ = μ·A·√(2g·Δh)/√(1+μ²ζ)  |  Q₂ = ²⁄₃·μD·√(2g)·∫h³/²dx', cls: 'state-overflow'  },
}

const stateLabel    = computed(() => STATE_INFO[r.value.state]?.label    ?? '')
const stateFormula  = computed(() => STATE_INFO[r.value.state]?.formula  ?? '')
const stateBannerClass = computed(() => STATE_INFO[r.value.state]?.cls   ?? '')
</script>

<style scoped>
.bridge-results-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.sec-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

/* Geometry warnings */
.geometry-warnings { display: flex; flex-direction: column; gap: 0.35rem; }
.geo-warn {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  font-size: 0.79rem;
  padding: 0.4rem 0.7rem;
  border-radius: 7px;
  border: 1px solid;
  line-height: 1.4;
}
.geo-error  { background: #fef2f2; border-color: #fca5a5; color: #991b1b; }
.geo-hint   { background: #fffbeb; border-color: #fcd34d; color: #78350f; }
.geo-warn-code { font-weight: 700; white-space: nowrap; flex-shrink: 0; }

/* State banner */
.state-banner {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  padding: 0.35rem 0.7rem;
  border-radius: 7px;
  margin-bottom: 0.65rem;
  border: 1px solid;
  flex-wrap: wrap;
}
.state-label {
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
}
.state-formula {
  font-size: 0.71rem;
  font-family: 'Courier New', monospace;
  opacity: 0.85;
}
.state-free     { background: #f0fdf4; border-color: #86efac; color: #15803d; }
.state-pressure { background: #fffbeb; border-color: #fcd34d; color: #92400e; }
.state-overflow { background: #eff6ff; border-color: #93c5fd; color: #1e40af; }
.state-override { opacity: 0.92; }
.state-tag {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.1rem 0.45rem;
  border-radius: 20px;
  white-space: nowrap;
}
.override-free     { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
.override-pressure { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
.uw-tag            { background: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; }

/* Current state */
.current-section {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.9rem 1rem;
}

.current-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.q-total-chip {
  font-size: 0.88rem;
  color: #1d4ed8;
  background: #dbeafe;
  border-radius: 20px;
  padding: 0.15rem 0.7rem;
}
.q-total-chip strong { font-size: 1rem; }

.zones-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.7rem;
  margin-bottom: 0.7rem;
}

.zone-card {
  border-radius: 9px;
  padding: 0.6rem 0.75rem;
  border: 1.5px solid;
}

.z1 { border-color: #93c5fd; background: #eff6ff; }
.z1.submerged { border-color: #fbbf24; background: #fffbeb; }
.z2 { border-color: #99f6e4; background: #f0fdfa; }
.z2.inactive { border-color: #e2e8f0; background: #f8fafc; opacity: 0.6; }

.zone-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.45rem;
}

.zlabel { font-size: 0.78rem; font-weight: 700; color: #1e293b; }
.zmode {
  font-size: 0.7rem;
  font-weight: 600;
  color: #64748b;
  background: white;
  border-radius: 8px;
  padding: 0.08rem 0.38rem;
  border: 1px solid #e2e8f0;
}

.metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem 0.4rem; }
.m { display: flex; align-items: baseline; gap: 0.2rem; }
.m span { font-size: 0.7rem; color: #64748b; min-width: 18px; }
.m strong { font-size: 0.84rem; font-weight: 700; color: #1e293b; }
.m em { font-size: 0.63rem; color: #94a3b8; font-style: normal; }

.inactive-note { font-size: 0.78rem; color: #94a3b8; padding-top: 0.2rem; }

/* kSt breakdown */
.kst-breakdown {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  padding: 0.5rem 0.6rem;
  margin-bottom: 0.6rem;
}

.kst-breakdown-title {
  font-size: 0.74rem;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 0.35rem;
}

.kst-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}
.kst-table th { padding: 0.2rem 0.35rem; text-align: right; font-size: 0.72rem; color: #94a3b8; border-bottom: 1px solid #e2e8f0; }
.kst-table th:first-child { text-align: left; }
.kst-table td { padding: 0.18rem 0.35rem; text-align: right; color: #374151; }
.kst-table td:first-child { text-align: left; }
.kst-val { font-weight: 700; color: #1e293b; }

/* Total bar */
.total-bar {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  background: #eff6ff;
  border: 1.5px solid #bfdbfe;
  border-radius: 8px;
  padding: 0.55rem 0.9rem;
  flex-wrap: wrap;
}

.total-formula { font-size: 0.8rem; color: #475569; flex: 1; min-width: 130px; }
.total-val { font-size: 1.25rem; font-weight: 800; color: #1d4ed8; }
.total-ls { font-size: 0.8rem; color: #64748b; }

/* Rating */
.rating-section {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.9rem 1rem;
}

.rating-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.rating-range { font-size: 0.76rem; color: #94a3b8; }

.table-wrap {
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  scrollbar-width: thin;
}

.rating-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}

.rating-table thead {
  position: sticky;
  top: 0;
  background: #f1f5f9;
  z-index: 1;
}

.rating-table th {
  padding: 0.38rem 0.45rem;
  text-align: right;
  font-weight: 600;
  color: #64748b;
  border-bottom: 2px solid #e2e8f0;
  white-space: nowrap;
}

.rating-table th:first-child,
.rating-table td:first-child { text-align: left; padding-left: 0.6rem; }

.rating-table td {
  padding: 0.3rem 0.45rem;
  text-align: right;
  color: #374151;
  border-bottom: 1px solid #f1f5f9;
  font-variant-numeric: tabular-nums;
}

.rating-table tr:last-child td { border-bottom: none; }

.col-wsp { font-weight: 600; }
.col-total { font-weight: 700; color: #1d4ed8 !important; }
.col-status { text-align: center !important; }

.row-active td { background: #dbeafe; }
.row-submerged:not(.row-active) td { background: #fefce8; }
.row-overflow:not(.row-active) td { background: #f0fdfa; }

.sbadge {
  font-size: 0.66rem;
  font-weight: 600;
  padding: 0.08rem 0.35rem;
  border-radius: 10px;
  display: inline-block;
}
.sbadge.free { background: #dcfce7; color: #15803d; }
.sbadge.pressure { background: #fef3c7; color: #b45309; }
.sbadge.overflow { background: #dbeafe; color: #1e40af; }
.sbadge.fr-warn { background: #fde68a; color: #92400e; margin-left: 2px; }

.fr-warn-tag { background: #fde68a; color: #92400e; border: 1px solid #f59e0b; }
.fr-warn-val { color: #b45309 !important; font-weight: 800 !important; }
.choke-tag   { background: #fecaca; color: #991b1b; border: 1px solid #f87171; }
.sbadge.choke { background: #fecaca; color: #991b1b; margin-left: 2px; }
</style>
