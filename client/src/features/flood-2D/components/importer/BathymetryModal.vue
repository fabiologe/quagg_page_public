<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">

      <!-- ── Header ──────────────────────────────────────────────────── -->
      <div class="modal-header">
        <div class="header-left">
          <span class="header-icon">🌊</span>
          <div>
            <h3>Bathymetrie Preprocessing</h3>
            <p class="header-sub">DGM + Vermessungspunkte → fusioniertes Raster für LISFLOOD-FP</p>
          </div>
        </div>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>

      <!-- ── Status-Leiste ───────────────────────────────────────────── -->
      <div class="status-bar">
        <div class="status-item" :class="demStatus.cls">
          <span class="status-icon">{{ demStatus.icon }}</span>
          <div class="status-body">
            <span class="status-label">Laser-DGM</span>
            <span class="status-detail">{{ demStatus.text }}</span>
          </div>
        </div>
        <div class="status-divider">→</div>
        <div class="status-item" :class="surveyStatus.cls">
          <span class="status-icon">{{ surveyStatus.icon }}</span>
          <div class="status-body">
            <span class="status-label">Vermessungspunkte</span>
            <span class="status-detail">{{ surveyStatus.text }}</span>
          </div>
        </div>
      </div>

      <!-- ── Kein Daten ──────────────────────────────────────────────── -->
      <div v-if="!hasDem || !hasSurvey" class="missing-hint">
        <template v-if="!hasDem">
          <strong>Kein DGM geladen.</strong> Terrain über den 3D-Viewer importieren (.xyz / .asc).
        </template>
        <template v-else>
          <strong>Keine Vermessungspunkte geladen.</strong>
          Werkzeugkasten → Import Data → Tab „Vermessungspunkte".
        </template>
      </div>

      <!-- ── Hauptbereich ────────────────────────────────────────────── -->
      <div v-else class="modal-body">

        <!-- ════ WERKZEUGKASTEN ════════════════════════════════════════ -->
        <div class="werkzeugkasten">
          <button
            v-for="t in werkzeuge"
            :key="t.id"
            class="wz-btn"
            :class="{
              'wz-active':    activeWerkzeug === t.id,
              'wz-disabled':  t.needsReady && !bathyStore.isStage1Ready,
              'wz-brush-on':  t.id === 'BRUSH' && brushActive,
            }"
            :disabled="t.needsReady && !bathyStore.isStage1Ready"
            :title="t.label"
            @click="activeWerkzeug = t.id"
          >
            <span class="wz-icon" v-html="t.icon"></span>
            <span class="wz-label">{{ t.label }}</span>
            <span v-if="t.id === 'BRUSH' && bathyStore.modifiedCount > 0" class="wz-badge">
              {{ bathyStore.modifiedCount }}
            </span>
            <span v-if="t.id === 'CROSSVAL' && bathyStore.crossValResult" class="wz-badge wz-badge-ok">✓</span>
            <span v-if="t.id === 'THALWEG' && bathyStore.thalwegResult" class="wz-badge wz-badge-ok">✓</span>
          </button>
        </div>

        <!-- ════ TOOL PANELS ══════════════════════════════════════════ -->
        <div class="tool-panel-area">

          <!-- ── 1 · Validierung ─────────────────────────────────────── -->
          <div v-if="activeWerkzeug === 'VALIDATE'" class="tool-panel">
            <div class="tp-desc">DGM-Metadaten und Vermessungspunkte auf Plausibilität prüfen. Kann jederzeit wiederholt werden.</div>

            <div class="validate-actions">
              <button class="btn-run" :disabled="validating" @click="runValidation">
                {{ validating ? 'Prüfe…' : bathyStore.validationReport ? 'Erneut validieren' : 'Datensätze validieren' }}
              </button>
              <span v-if="lastValidatedAt" class="val-timestamp">
                Zuletzt: {{ lastValidatedAt }}
              </span>
            </div>

            <div v-if="validationStale" class="tp-warn">
              ⚠ Terrain wurde verändert — Ergebnis veraltet. Bitte erneut validieren.
            </div>

            <div v-if="bathyStore.validationReport" class="report" :class="{ 'report-stale': validationStale }">
              <div class="report-header" :class="bathyStore.validationReport.status">
                <span>{{ statusEmoji }}</span><span>{{ statusLabel }}</span>
              </div>
              <ul class="check-list">
                <li v-for="c in bathyStore.validationReport.checks" :key="c.id"
                    class="check-item" :class="c.status">
                  <span class="ci-icon">{{ c.status === 'ok' ? '✓' : c.status === 'warn' ? '⚠' : '✗' }}</span>
                  <div class="ci-body">
                    <span class="ci-label">{{ c.label }}</span>
                    <span class="ci-detail">{{ c.detail }}</span>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          <!-- ── 2 · Offset-Diagnose ─────────────────────────────────── -->
          <div v-if="activeWerkzeug === 'OFFSET'" class="tool-panel">
            <div class="tp-desc">
              Systematischen Höhenversatz zwischen Sohlmessung und Laser-DGM erkennen.
              Berechnet den robusten Median-Diff an allen Überlapp-Punkten.
            </div>
            <button class="btn-run" :disabled="diagRunning" @click="runStage2">
              {{ diagRunning ? 'Analysiere…' : bathyStore.offsetDiagnosis ? 'Erneut analysieren' : 'Offset-Diagnose starten' }}
            </button>
            <div v-if="diagError" class="tp-error">{{ diagError }}</div>

            <div v-if="bathyStore.offsetDiagnosis" class="result-card">
              <div class="rc-header" :class="offsetClass">
                {{ offsetIcon }} Offset-Diagnose &nbsp;·&nbsp;
                Median: <strong>{{ fmtOffset(bathyStore.offsetDiagnosis.median) }} m</strong>
              </div>
              <div class="rc-grid">
                <span>Überlapp-Punkte</span><strong>{{ bathyStore.offsetDiagnosis.n }}</strong>
                <span>MAD</span><strong>± {{ bathyStore.offsetDiagnosis.mad.toFixed(3) }} m</strong>
                <span>P10 / P90</span><strong>{{ fmtOffset(bathyStore.offsetDiagnosis.p10) }} / {{ fmtOffset(bathyStore.offsetDiagnosis.p90) }} m</strong>
                <span>Bewertung</span><strong>{{ offsetInterpretation }}</strong>
              </div>
              <div class="rc-actions">
                <button class="btn-secondary" @click="applyOffset"
                  :disabled="offsetApplied || Math.abs(bathyStore.offsetDiagnosis.median) < 1e-6"
                  :title="offsetApplied ? 'Bereits angewendet' : 'Verschiebt alle Punkte Z um −(' + fmtOffset(bathyStore.offsetDiagnosis.median) + ') m'">
                  {{ offsetApplied ? '✓ Angewendet' : 'Offset anwenden' }}
                </button>
                <span class="rc-hint">Passt Sohlmessung an DGM-Referenzsystem an</span>
              </div>
            </div>
          </div>

          <!-- ── 3 · IDW-Pinsel ──────────────────────────────────────── -->
          <div v-if="activeWerkzeug === 'BRUSH'" class="tool-panel">

            <!-- IDW-Parameter (shared by auto-fill, brush, cross-val) -->
            <div class="params-grid">
              <label class="param-label">Suchradius</label>
              <input type="range" v-model.number="bathyBrushSettings.searchRadius" min="5" max="500" step="5" class="param-slider" />
              <span class="param-val">{{ bathyBrushSettings.searchRadius }} m</span>

              <label class="param-label">IDW-Potenz</label>
              <div class="power-btns">
                <button v-for="p in [1,2,3]" :key="p"
                  :class="{ active: bathyBrushSettings.power === p }"
                  @click="bathyBrushSettings.power = p">{{ p }}</button>
              </div>
              <span class="param-val" />

              <label class="param-label" title="Mindestanzahl Punkte im Suchradius — zu wenige = keine Interpolation">Min. Punkte</label>
              <input type="range" v-model.number="bathyBrushSettings.minPoints" min="1" max="10" step="1" class="param-slider" />
              <span class="param-val">{{ bathyBrushSettings.minPoints }}</span>

              <label class="param-label" title="Nur die K nächsten Punkte nutzen (0 = alle im Suchradius)">Max. K-Punkte</label>
              <input type="range" v-model.number="bathyBrushSettings.maxPoints" min="0" max="20" step="1" class="param-slider" />
              <span class="param-val">{{ bathyBrushSettings.maxPoints === 0 ? 'Alle' : bathyBrushSettings.maxPoints }}</span>

              <label class="param-label" title="Dämpfungswert auf Distanz — verhindert Bullseye-Artefakte bei p≥2">Nugget</label>
              <input type="range" v-model.number="bathyBrushSettings.nugget" min="0" max="2" step="0.05" class="param-slider" />
              <span class="param-val">{{ bathyBrushSettings.nugget.toFixed(2) }} m</span>
            </div>

            <label class="checkbox-label" style="margin-top:-0.1rem">
              <input type="checkbox" v-model="bathyBrushSettings.zClamp" />
              Z-Begrenzung — Ergebnis ≤ umgebende DGM-Zellen (verhindert Sohle über Ufer)
            </label>

            <!-- ─── Automatisch ─────────────────────────────────────── -->
            <div class="brush-section-label">Automatisch</div>
            <div class="tp-desc" style="margin-top:0">
              Alle Rasterzellen im Einflussbereich der Vermessungspunkte werden in einem
              Schritt mit IDW ersetzt. Zellen außerhalb des Suchradius bleiben unverändert.
            </div>

            <div class="autofill-options">
              <label class="checkbox-label">
                <input type="checkbox" v-model="autoFillNodataOnly" />
                Nur NoData-Zellen ersetzen (konservativ)
              </label>
            </div>

            <button class="btn-run" :disabled="autoFillRunning || !bathyStore.surveyPoints.length" @click="runAutoFill">
              <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" style="display:inline;vertical-align:-2px;margin-right:5px"><path d="M4 12v-1a8 8 0 0116 0v1"/><path d="M4 12h16"/><path d="M8 16l4 4 4-4"/></svg>
              {{ autoFillRunning ? `Berechne… ${autoFillProgress}%` : 'Raster automatisch anpassen' }}
            </button>

            <!-- ─── Manuell (Pinsel für Nachkorrekturen) ────────────── -->
            <div class="brush-section-label" style="margin-top:0.5rem">Manuell (Nachkorrektur)</div>
            <div class="tp-desc" style="margin-top:0">
              Pinsel im 3D-Viewer für gezielte Korrekturen einzelner Bereiche.
            </div>

            <div class="params-grid" style="margin-top:0">
              <label class="param-label">Pinselradius</label>
              <input type="range" v-model.number="bathyBrushSettings.radius" min="1" max="100" step="1" class="param-slider" />
              <span class="param-val">{{ bathyBrushSettings.radius }} m</span>
            </div>

            <button :class="['btn-run', brushActive ? 'btn-run-active' : '']" @click="toggleBrush">
              <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" style="display:inline;vertical-align:-2px;margin-right:5px">
                <path d="M20 4l-4 4M14 8l-6 6c-1 1-1.5 2.5-1.5 4V20h2c1.5 0 3-.5 4-1.5l6-6M14 8l2-2"/><path d="M3 21c0-2 1.5-4 4-4"/>
              </svg>
              {{ brushActive ? 'Pinsel deaktivieren' : 'Pinsel aktivieren' }}
            </button>

            <div v-if="bathyStore.modifiedCount > 0" class="mod-info">
              <span class="mod-dot"></span>
              {{ bathyStore.modifiedCount.toLocaleString() }} Zellen modifiziert
            </div>
          </div>

          <!-- ── 4 · Sigmoid-Blending ────────────────────────────────── -->
          <div v-if="activeWerkzeug === 'BLEND'" class="tool-panel">
            <div class="tp-desc">
              Sanften Übergang zwischen IDW-gefüllten Zellen und dem originalen Laser-DGM erzeugen.
              Mehrere Laplacian-Glättungspässe an der Grenzzone.
            </div>

            <div v-if="bathyStore.modifiedCount === 0" class="tp-warn">
              Bitte zuerst mit dem IDW-Pinsel Zellen modifizieren.
            </div>

            <template v-else>
              <div class="params-grid">
                <label class="param-label">Übergangsbreite</label>
                <input type="range" v-model.number="sigBlendWidth" min="1" max="20" step="1" class="param-slider" />
                <span class="param-val">{{ sigBlendWidth }} m</span>
              </div>
              <button class="btn-run" :disabled="blendRunning" @click="runSigmoidBlend">
                {{ blendRunning ? 'Berechne…' : 'Blending anwenden' }}
              </button>
            </template>
          </div>

          <!-- ── 5 · Cross-Validation ────────────────────────────────── -->
          <div v-if="activeWerkzeug === 'CROSSVAL'" class="tool-panel">
            <div class="tp-desc">
              Leave-One-Out Kreuzvalidierung: jeden Punkt weglassen, mit IDW der übrigen vorhersagen, Fehler messen.
              Nutzt alle IDW-Parameter aus dem Pinsel-Tab (Suchradius, Potenz, Min./Max. Punkte, Nugget).
            </div>
            <div class="tp-hint">Parameter anpassen → im <strong>IDW-Pinsel</strong>-Tab</div>

            <button class="btn-run" :disabled="crossRunning || bathyStore.surveyPoints.length < 3" @click="runCrossVal">
              {{ crossRunning ? 'Berechne…' : bathyStore.crossValResult ? 'Erneut berechnen' : 'Cross-Validation starten' }}
            </button>

            <div v-if="bathyStore.crossValResult" class="result-card">
              <div class="rc-header"
                :class="bathyStore.crossValResult.n === 0 ? 'oc-error' : bathyStore.crossValResult.rmse < 0.1 ? 'oc-ok' : bathyStore.crossValResult.rmse < 0.3 ? 'oc-warn' : 'oc-error'">
                LOO-Ergebnis · {{ bathyStore.crossValResult.n }} / {{ bathyStore.surveyPoints.length }} Punkte vorhergesagt
              </div>
              <div v-if="bathyStore.crossValResult.warning" class="tp-warn" style="border-radius:0;border-left:0;border-right:0;margin:0">
                {{ bathyStore.crossValResult.warning }}
              </div>
              <div v-if="bathyStore.crossValResult.n > 0" class="rc-grid">
                <span>RMSE</span>
                <strong :class="bathyStore.crossValResult.rmse < 0.1 ? 'val-ok' : bathyStore.crossValResult.rmse < 0.3 ? 'val-warn' : 'val-err'">
                  {{ bathyStore.crossValResult.rmse.toFixed(4) }} m
                </strong>
                <span>MAE</span><strong>{{ bathyStore.crossValResult.mae.toFixed(4) }} m</strong>
                <span>Bias</span>
                <strong>{{ (bathyStore.crossValResult.bias >= 0 ? '+' : '') + bathyStore.crossValResult.bias.toFixed(4) }} m</strong>
                <span>Übersprungen</span><strong>{{ bathyStore.crossValResult.skipped ?? 0 }} Punkte (außerh. Radius)</strong>
              </div>
            </div>
          </div>

          <!-- ── 6 · Thalweg ─────────────────────────────────────────── -->
          <div v-if="activeWerkzeug === 'THALWEG'" class="tool-panel">
            <div class="tp-desc">
              Tiefste Sohlinie aus den Vermessungspunkten extrahieren — binnt Punkte entlang der
              Hauptachse, wählt pro Bin den tiefsten Punkt, interpoliert leere Bins linear.
            </div>
            <button class="btn-run" :disabled="thalwegRunning || bathyStore.surveyPoints.length < 4" @click="runThalweg">
              {{ thalwegRunning ? 'Berechne…' : bathyStore.thalwegResult ? 'Erneut berechnen' : 'Thalweg extrahieren' }}
            </button>
            <div v-if="bathyStore.surveyPoints.length < 4" class="tp-warn">
              Mindestens 4 Punkte für die Thalweg-Extraktion benötigt.
            </div>

            <div v-if="bathyStore.thalwegResult" class="result-card">
              <div class="rc-header oc-ok">
                Thalweg · {{ bathyStore.thalwegResult.nodes.length }} Stützstellen · Achse {{ bathyStore.thalwegResult.axis.toUpperCase() }}
              </div>
              <div class="rc-grid">
                <span>Länge</span><strong>{{ bathyStore.thalwegResult.len.toFixed(1) }} m</strong>
                <span>Sohlgefälle</span>
                <strong :class="bathyStore.thalwegResult.gradient < 0.05 ? 'val-warn' : 'val-ok'">
                  {{ bathyStore.thalwegResult.gradient.toFixed(3) }} ‰
                </strong>
                <span>Z Tief / Hoch</span>
                <strong>{{ bathyStore.thalwegResult.minZ.toFixed(3) }} / {{ bathyStore.thalwegResult.maxZ.toFixed(3) }} m</strong>
                <span>Bins gesamt / interp.</span>
                <strong>{{ bathyStore.thalwegResult.nBins }} / {{ bathyStore.thalwegResult.filled ?? 0 }}</strong>
              </div>
            </div>
          </div>

        </div><!-- /tool-panel-area -->
      </div><!-- /modal-body -->

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore.js';
import { useBathymetryStore } from '@/features/flood-2D/stores/useBathymetryStore.js';
import { useSimulationStore } from '@/features/flood-2D/stores/useSimulationStore.js';
import { bathyBrushSettings, computeIDW } from '@/features/flood-2D/composables/editor/useBathyBrushTool.js';

const emit       = defineEmits(['close']);
const geoStore   = useGeoStore();
const bathyStore = useBathymetryStore();
const simStore   = useSimulationStore();

// ── Terrain helper ─────────────────────────────────────────────────────────────
// gridData always lives on terrain root, never inside terrain.header (which is
// only a metadata sub-object written by cropTerrain, without the array).
function getTerrain() {
    const t = geoStore.terrain;
    if (!t?.gridData) return null;
    return {
        gridData:  t.gridData,
        ncols:     t.ncols     ?? t.header?.ncols     ?? 0,
        nrows:     t.nrows     ?? t.header?.nrows     ?? 0,
        cellsize:  t.cellsize  ?? t.header?.cellsize  ?? 1,
        xllcorner: t.xllcorner ?? t.xll ?? t.header?.xllcorner ?? t.header?.xll ?? 0,
        yllcorner: t.yllcorner ?? t.yll ?? t.header?.yllcorner ?? t.header?.yll ?? 0,
        minZ:      t.minZ ?? 0,
        maxZ:      t.maxZ ?? 1,
    };
}

// ── Werkzeugkasten ────────────────────────────────────────────────────────────
const activeWerkzeug = ref('VALIDATE');

const werkzeuge = [
  {
    id: 'VALIDATE', label: 'Validierung', needsReady: false,
    icon: `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>`,
  },
  {
    id: 'OFFSET', label: 'Offset', needsReady: false,
    icon: `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M8 7l4-4 4 4M16 17l-4 4-4-4M12 3v18"/></svg>`,
  },
  {
    id: 'BRUSH', label: 'IDW-Pinsel', needsReady: false,
    icon: `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M20 4l-4 4M14 8l-6 6c-1 1-1.5 2.5-1.5 4V20h2c1.5 0 3-.5 4-1.5l6-6M14 8l2-2"/><path d="M3 21c0-2 1.5-4 4-4"/></svg>`,
  },
  {
    id: 'BLEND', label: 'Blending', needsReady: false,
    icon: `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M3 12q3-6 4.5 0t4.5 0 4.5 0T20 12"/></svg>`,
  },
  {
    id: 'CROSSVAL', label: 'Cross-Val', needsReady: false,
    icon: `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M3 3l18 18M3 21L21 3"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`,
  },
  {
    id: 'THALWEG', label: 'Thalweg', needsReady: false,
    icon: `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M3 6c2 0 3 3 5 3s3-3 5-3 3 3 5 3"/><path d="M3 12c2 2 3 4 5 4s3-4 5-4 3 2 5 2"/><line x1="3" y1="20" x2="21" y2="20"/></svg>`,
  },
];

// ── Brush ─────────────────────────────────────────────────────────────────────
const brushActive = computed(() => simStore.activeTool === 'BATHY_BRUSH');
function toggleBrush() {
    simStore.setActiveTool(brushActive.value ? null : 'BATHY_BRUSH');
}

// ── Auto-Fill ─────────────────────────────────────────────────────────────────
const autoFillRunning    = ref(false);
const autoFillNodataOnly = ref(true);
const autoFillProgress   = ref(0);

function maxUnmodifiedNeighbour(row, col, gridData, ncols, nrows, W = 2) {
    let maxZ = -Infinity;
    for (let dr = -W; dr <= W; dr++) {
        for (let dc = -W; dc <= W; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr, nc = col + dc;
            if (nr < 0 || nr >= nrows || nc < 0 || nc >= ncols) continue;
            const ni = nr * ncols + nc;
            if (gridData[ni] > -9000 && !bathyStore.modifiedCells.has(ni)) {
                if (gridData[ni] > maxZ) maxZ = gridData[ni];
            }
        }
    }
    return maxZ;
}

function runAutoFill() {
    const dem = getTerrain();
    if (!dem) return;
    const pts = bathyStore.surveyPoints;
    if (!pts.length) return;

    autoFillRunning.value  = true;
    autoFillProgress.value = 0;

    const { gridData, ncols, nrows, cellsize, xllcorner, yllcorner } = dem;
    const onlyNoData = autoFillNodataOnly.value;
    const doClamp    = bathyBrushSettings.zClamp;
    const ROWS_PER_TICK = Math.max(1, Math.ceil(2000 / ncols));
    let   gridRow = 0;
    let   modified = 0;

    function processChunk() {
        const endRow = Math.min(gridRow + ROWS_PER_TICK, nrows);
        for (let r = gridRow; r < endRow; r++) {
            const realY = yllcorner + r * cellsize + cellsize / 2;
            for (let c = 0; c < ncols; c++) {
                const idx = r * ncols + c;
                if (onlyNoData && gridData[idx] > -9000) continue;

                const realX = xllcorner + c * cellsize + cellsize / 2;
                let newZ = computeIDW(realX, realY, pts);
                if (newZ === null) continue;

                // Z-Clamp: result must not exceed surrounding original DGM
                if (doClamp) {
                    const maxN = maxUnmodifiedNeighbour(r, c, gridData, ncols, nrows);
                    if (maxN > -Infinity && newZ > maxN) newZ = maxN;
                }

                gridData[idx] = newZ;
                bathyStore.markCell(idx);
                modified++;
            }
        }
        gridRow = endRow;
        autoFillProgress.value = Math.round(gridRow / nrows * 100);

        if (gridRow < nrows) {
            setTimeout(processChunk, 0);
        } else {
            bathyStore.addModifiedCount(modified);
            geoStore.notifyTerrainModified();
            autoFillRunning.value = false;
        }
    }

    setTimeout(processChunk, 0);
}

// ── Status-Leiste ─────────────────────────────────────────────────────────────
const hasDem    = computed(() => geoStore.terrain?.gridData != null);
const hasSurvey = computed(() => bathyStore.surveyPoints.length > 0);

const demStatus = computed(() => {
    if (!hasDem.value) return { cls: 'missing', icon: '○', text: 'Nicht geladen' };
    const t = geoStore.terrain;
    const ncols = t.ncols ?? t.header?.ncols ?? '?';
    const nrows = t.nrows ?? t.header?.nrows ?? '?';
    const cs    = t.cellsize ?? t.header?.cellsize ?? '?';
    return { cls: 'ok', icon: '✓', text: `${ncols} × ${nrows} · ${cs}m` };
});

const surveyStatus = computed(() => {
    if (!hasSurvey.value) return { cls: 'missing', icon: '○', text: 'Nicht geladen' };
    return { cls: 'ok', icon: '✓', text: `${bathyStore.surveyPoints.length} Punkte · ${bathyStore.surveyFileName}` };
});

// ── Validierung ───────────────────────────────────────────────────────────────
const validating      = ref(false);
const validationStale = ref(false);
const lastValidatedAt = ref(null);

// Mark result as stale when the terrain changes after a run
watch(() => geoStore.terrainVersion, () => {
    if (bathyStore.validationReport) validationStale.value = true;
});
// Also stale when new survey points loaded (store already clears validationReport via setSurveyPoints,
// but the stale flag covers in-place terrain changes)
watch(() => bathyStore.surveyPointsVersion, () => { validationStale.value = false; });

function runValidation() {
    validating.value = true;
    validationStale.value = false;
    setTimeout(() => {
        try {
            const dem = getTerrain();
            if (!dem) { validating.value = false; return; }
            bathyStore.setValidation(validate(dem, bathyStore.surveyPoints));
            lastValidatedAt.value = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } finally {
            validating.value = false;
        }
    }, 30);
}

function validate(dem, points) {
    const { ncols, nrows, cellsize, xllcorner, yllcorner, minZ, maxZ, gridData } = dem;
    const xur = xllcorner + ncols * cellsize;
    const yur = yllcorner + nrows * cellsize;
    const checks = [];

    checks.push({ id: 'dem', label: 'DGM-Metadaten', status: 'ok',
        detail: `${ncols}×${nrows} Zellen · ${cellsize}m · X[${xllcorner.toFixed(0)}–${xur.toFixed(0)}] · Y[${yllcorner.toFixed(0)}–${yur.toFixed(0)}]` });

    const csOk = cellsize >= 0.1 && cellsize <= 20;
    checks.push({ id: 'cellsize', label: 'Rasterauflösung', status: csOk ? 'ok' : 'warn',
        detail: csOk ? `${cellsize}m — plausibel` : `${cellsize}m außerhalb 0.1–20m — Einheit prüfen` });

    let nodata = 0;
    for (let i = 0; i < gridData.length; i++) if (gridData[i] <= -9990) nodata++;
    const ndPct = nodata / gridData.length * 100;
    checks.push({ id: 'nodata', label: 'NoData-Anteil', status: ndPct > 40 ? 'warn' : 'ok',
        detail: `${ndPct.toFixed(1)}%` + (ndPct > 40 ? ' — hoher Anteil, Daten prüfen' : '') });

    let hStatus = 'ok', hDetail = `Z: ${minZ.toFixed(2)} – ${maxZ.toFixed(2)} m NN`;
    if (maxZ > 5000 || minZ < -500)  { hStatus = 'warn'; hDetail += ' — Einheit prüfen (m statt cm?)'; }
    else if ((maxZ - minZ) < 0.05)   { hStatus = 'warn'; hDetail += ' — sehr geringer Höhenunterschied'; }
    checks.push({ id: 'height', label: 'Höhenplausibilität', status: hStatus, detail: hDetail });

    checks.push({ id: 'survey', label: 'Vermessungspunkte', status: points.length >= 3 ? 'ok' : 'error',
        detail: `${points.length} Punkte` + (points.length < 3 ? ' — min. 3 für IDW benötigt' : '') });

    const inExtent = points.filter(p => p.x >= xllcorner && p.x <= xur && p.y >= yllcorner && p.y <= yur);
    const oPct = points.length > 0 ? inExtent.length / points.length * 100 : 0;
    const oSt  = oPct < 50 ? 'error' : oPct < 80 ? 'warn' : 'ok';
    checks.push({ id: 'overlap', label: 'Räumliche Überlappung', status: oSt,
        detail: `${oPct.toFixed(0)}% der Punkte im DGM-Bereich (${inExtent.length}/${points.length})` +
            (oSt === 'error' ? ' — KBS stimmt möglicherweise nicht überein!' : '') });

    const areaKm2 = ncols * cellsize * nrows * cellsize / 1e6;
    const density = areaKm2 > 0 ? inExtent.length / areaKm2 : 0;
    checks.push({ id: 'density', label: 'Punktdichte', status: density < 1 ? 'warn' : 'ok',
        detail: `${density.toFixed(1)} Punkte/km²` + (density < 1 ? ' — gering, IDW-Qualität eingeschränkt' : '') });

    // Check Z range compatibility between survey and DEM
    if (inExtent.length > 0) {
        const surveyMinZ = Math.min(...inExtent.map(p => p.z));
        const surveyMaxZ = Math.max(...inExtent.map(p => p.z));
        const zOverlap = surveyMinZ <= maxZ && surveyMaxZ >= minZ;
        checks.push({ id: 'zrange', label: 'Höhenbezug Überlappung', status: zOverlap ? 'ok' : 'warn',
            detail: zOverlap
                ? `Vermessung Z[${surveyMinZ.toFixed(2)}–${surveyMaxZ.toFixed(2)}] überschneidet DGM Z[${minZ.toFixed(2)}–${maxZ.toFixed(2)}]`
                : `Vermessung Z[${surveyMinZ.toFixed(2)}–${surveyMaxZ.toFixed(2)}] außerhalb DGM-Bereich — Höhensystem prüfen` });
    }

    const hasErr  = checks.some(c => c.status === 'error');
    const hasWarn = checks.some(c => c.status === 'warn');
    return { status: hasErr ? 'error' : hasWarn ? 'warn' : 'ok', checks,
        summary: { xllcorner, yllcorner, xur, yur, inExtentCount: inExtent.length, areaKm2 } };
}

const statusEmoji = computed(() => {
    const s = bathyStore.validationReport?.status;
    return s === 'ok' ? '✅' : s === 'warn' ? '⚠️' : '❌';
});
const statusLabel = computed(() => {
    const s = bathyStore.validationReport?.status;
    return s === 'ok' ? 'Validierung bestanden' : s === 'warn' ? 'Validierung mit Warnungen' : 'Validierung fehlgeschlagen';
});

// ── Offset-Diagnose ───────────────────────────────────────────────────────────
const diagRunning = ref(false);
const diagError   = ref(null);
const offsetApplied = ref(false);

function runStage2() {
    diagRunning.value  = true;
    diagError.value    = null;
    offsetApplied.value = false;
    setTimeout(() => {
        try {
            const dem = getTerrain();
            if (!dem) { diagError.value = 'Kein DGM geladen.'; return; }
            const { ncols, nrows, cellsize, xllcorner, yllcorner, gridData } = dem;

            const deltas = [];
            for (const pt of bathyStore.surveyPoints) {
                const col     = Math.floor((pt.x - xllcorner) / cellsize);
                const geomRow = Math.floor((pt.y - yllcorner) / cellsize);
                const gridRow = (nrows - 1) - geomRow;
                if (col < 0 || col >= ncols || gridRow < 0 || gridRow >= nrows) continue;
                const demZ = gridData[gridRow * ncols + col];
                if (demZ <= -9000) continue;
                deltas.push(pt.z - demZ);
            }
            if (deltas.length < 3) {
                diagError.value = `Nur ${deltas.length} Überlapp-Punkte gefunden — mind. 3 benötigt. KBS und DGM-Bereich prüfen.`;
                return;
            }

            deltas.sort((a, b) => a - b);
            const n      = deltas.length;
            const median = n % 2 === 0 ? (deltas[n/2-1] + deltas[n/2]) / 2 : deltas[Math.floor(n/2)];
            const absDevs = deltas.map(d => Math.abs(d - median)).sort((a, b) => a - b);
            const mad    = absDevs[Math.floor(absDevs.length / 2)];
            bathyStore.setOffsetDiagnosis({
                n, median, mad,
                p10: deltas[Math.floor(n * 0.1)],
                p90: deltas[Math.floor(n * 0.9)],
            });
        } catch (e) {
            diagError.value = e.message;
        } finally {
            diagRunning.value = false;
        }
    }, 20);
}

function applyOffset() {
    const d = bathyStore.offsetDiagnosis;
    if (!d || Math.abs(d.median) < 1e-6) return;
    // setSurveyPoints bumps surveyPointsVersion → renderer rebuilds with new Z values
    bathyStore.setSurveyPoints(
        bathyStore.surveyPoints.map(p => ({ ...p, z: p.z - d.median })),
        bathyStore.surveyFileName,
    );
    bathyStore.setOffsetDiagnosis({ ...d, median: 0 });
    offsetApplied.value = true;
}

const fmtOffset = v => (v >= 0 ? '+' : '') + v.toFixed(3);
const offsetClass = computed(() => {
    const m = Math.abs(bathyStore.offsetDiagnosis?.median ?? 0);
    return m < 0.05 ? 'oc-ok' : m < 0.3 ? 'oc-warn' : 'oc-error';
});
const offsetIcon = computed(() => {
    const m = Math.abs(bathyStore.offsetDiagnosis?.median ?? 0);
    return m < 0.05 ? '✅' : m < 0.3 ? '⚠️' : '❌';
});
const offsetInterpretation = computed(() => {
    const d = bathyStore.offsetDiagnosis;
    if (!d) return '';
    const a = Math.abs(d.median);
    if (a < 0.05) return 'Kein signifikanter Versatz';
    if (a < 0.3)  return 'Geringer Versatz — Korrektur empfohlen';
    return 'Signifikanter Versatz — KBS / Höhenbezug prüfen!';
});

// ── Cross-Validation ──────────────────────────────────────────────────────────
const crossRunning = ref(false);

function runCrossVal() {
    crossRunning.value = true;
    setTimeout(() => {
        try {
            const pts = bathyStore.surveyPoints;
            if (pts.length < 3) return;
            // computeIDW uses current bathyBrushSettings (searchRadius, power, minPoints, maxPoints, nugget)
            const errors  = [];
            let   skipped = 0;
            for (let i = 0; i < pts.length; i++) {
                const others = pts.filter((_, j) => j !== i);
                const pred   = computeIDW(pts[i].x, pts[i].y, others);
                if (pred !== null) errors.push(pts[i].z - pred);
                else skipped++;
            }
            if (!errors.length) {
                bathyStore.setCrossVal({ n: 0, rmse: 0, mae: 0, bias: 0, skipped: pts.length,
                    warning: 'Alle Punkte lagen außerhalb des Suchradius — Suchradius vergrößern oder Min. Punkte reduzieren.' });
                return;
            }
            const n    = errors.length;
            const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / n);
            const mae  = errors.reduce((s, e) => s + Math.abs(e), 0) / n;
            const bias = errors.reduce((s, e) => s + e, 0) / n;
            bathyStore.setCrossVal({ n, rmse, mae, bias, skipped });
        } finally { crossRunning.value = false; }
    }, 20);
}

// ── Sigmoid-Blending ──────────────────────────────────────────────────────────
const blendRunning  = ref(false);
const sigBlendWidth = ref(5);

function runSigmoidBlend() {
    blendRunning.value = true;
    setTimeout(() => {
        try {
            const dem = getTerrain();
            if (!dem) return;
            const { gridData, ncols, nrows, cellsize } = dem;
            const modCells = bathyStore.modifiedCells; // Set<number>
            const passes   = Math.max(1, Math.round(sigBlendWidth.value / cellsize));
            const DIRS     = [[-1,0],[1,0],[0,-1],[0,1]];

            for (let pass = 0; pass < passes; pass++) {
                const snap = gridData.slice(); // read-only copy for this pass
                for (const idx of modCells) {
                    const row = Math.floor(idx / ncols);
                    const col = idx % ncols;
                    // Only smooth cells on the boundary (have at least one non-modified valid neighbor)
                    const isBoundary = DIRS.some(([dr, dc]) => {
                        const nr = row + dr, nc = col + dc;
                        if (nr < 0 || nr >= nrows || nc < 0 || nc >= ncols) return false;
                        const ni = nr * ncols + nc;
                        return snap[ni] > -9000 && !modCells.has(ni);
                    });
                    if (!isBoundary) continue;
                    // Weighted average: center gets weight 2, each neighbor weight 1
                    let sum = snap[idx] * 2, cnt = 2;
                    for (const [dr, dc] of DIRS) {
                        const nr = row + dr, nc = col + dc;
                        if (nr < 0 || nr >= nrows || nc < 0 || nc >= ncols) continue;
                        const ni = nr * ncols + nc;
                        if (snap[ni] > -9000) { sum += snap[ni]; cnt++; }
                    }
                    gridData[idx] = sum / cnt;
                }
            }
            geoStore.notifyTerrainModified();
        } finally { blendRunning.value = false; }
    }, 20);
}

// ── Thalweg ───────────────────────────────────────────────────────────────────
const thalwegRunning = ref(false);

function runThalweg() {
    thalwegRunning.value = true;
    setTimeout(() => {
        try {
            const pts = bathyStore.surveyPoints;
            if (pts.length < 4) return;

            // Determine principal axis (longer extent)
            const xMin = Math.min(...pts.map(p => p.x)), xMax = Math.max(...pts.map(p => p.x));
            const yMin = Math.min(...pts.map(p => p.y)), yMax = Math.max(...pts.map(p => p.y));
            const axis = (xMax - xMin) >= (yMax - yMin) ? 'x' : 'y';
            const vMin = axis === 'x' ? xMin : yMin;
            const vMax = axis === 'x' ? xMax : yMax;

            const N       = Math.min(50, Math.max(10, Math.floor(pts.length / 3)));
            const binSize = (vMax - vMin) / N;
            const bins    = Array.from({ length: N }, () => []);
            for (const p of pts) {
                const b = Math.min(N - 1, Math.floor((p[axis] - vMin) / binSize));
                bins[b].push(p);
            }

            // Deepest point per bin (thalweg node), interpolate empty bins linearly
            const rawNodes = bins.map((bin, i) => {
                if (!bin.length) return null;
                return { pos: vMin + (i + 0.5) * binSize, z: Math.min(...bin.map(p => p.z)) };
            });

            // Fill gaps by linear interpolation between adjacent known nodes
            const nodes = [];
            for (let i = 0; i < rawNodes.length; i++) {
                if (rawNodes[i]) { nodes.push(rawNodes[i]); continue; }
                const prev = rawNodes.slice(0, i).reverse().find(Boolean);
                const next = rawNodes.slice(i + 1).find(Boolean);
                if (prev && next) {
                    const t = (vMin + (i + 0.5) * binSize - prev.pos) / (next.pos - prev.pos);
                    nodes.push({ pos: vMin + (i + 0.5) * binSize, z: prev.z + t * (next.z - prev.z), interpolated: true });
                }
            }

            if (nodes.length < 2) return;
            const len      = Math.abs(nodes[nodes.length - 1].pos - nodes[0].pos);
            const gradient = len > 0 ? Math.abs(nodes[0].z - nodes[nodes.length - 1].z) / len * 1000 : 0;
            bathyStore.setThalweg({
                nodes, axis, len, gradient,
                minZ: Math.min(...nodes.map(n => n.z)),
                maxZ: Math.max(...nodes.map(n => n.z)),
                nBins: N,
                filled: nodes.filter(n => n.interpolated).length,
            });
        } finally { thalwegRunning.value = false; }
    }, 20);
}
</script>

<style scoped>
.modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.65);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 1100;
}
.modal-content {
    background: #2c3e50; color: #ecf0f1;
    width: 680px; max-height: 90vh;
    border-radius: 10px;
    box-shadow: 0 16px 40px rgba(0,0,0,0.6);
    display: flex; flex-direction: column;
    overflow: hidden;
    font-family: 'Segoe UI', sans-serif;
}

/* ── Header ─────────────────────────────────────────────────────────────── */
.modal-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding: 1rem 1.25rem; background: #1e2d3d;
    border-bottom: 1px solid #3d5166; flex-shrink: 0;
}
.header-left   { display: flex; gap: 0.7rem; align-items: flex-start; }
.header-icon   { font-size: 1.4rem; margin-top: 2px; }
.modal-header h3 { margin: 0 0 0.1rem; font-size: 1rem; color: #fff; }
.header-sub    { margin: 0; font-size: 0.75rem; color: #7f8c8d; }
.close-btn     { background: none; border: none; color: #95a5a6; font-size: 1.5rem; cursor: pointer; line-height: 1; }
.close-btn:hover { color: #fff; }

/* ── Status-Bar ─────────────────────────────────────────────────────────── */
.status-bar {
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0.7rem 1.25rem; background: #233140;
    border-bottom: 1px solid #3d5166; flex-shrink: 0;
}
.status-item {
    display: flex; align-items: center; gap: 0.5rem; flex: 1;
    padding: 0.4rem 0.65rem; border-radius: 6px;
    border: 1px solid #3d5166; background: #2c3e50;
}
.status-item.ok      { border-color: #27ae60; }
.status-item.missing { border-color: #465c71; opacity: 0.6; }
.status-icon          { font-size: 0.9rem; }
.status-item.ok .status-icon { color: #27ae60; }
.status-item.missing .status-icon { color: #7f8c8d; }
.status-body   { display: flex; flex-direction: column; gap: 0.05rem; min-width: 0; }
.status-label  { font-weight: 600; font-size: 0.78rem; color: #ecf0f1; }
.status-detail { font-size: 0.72rem; color: #95a5a6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status-divider { color: #465c71; font-size: 1rem; flex-shrink: 0; }

/* ── Missing hint ───────────────────────────────────────────────────────── */
.missing-hint {
    margin: 1.25rem; padding: 0.85rem 1rem;
    background: rgba(243,156,18,0.1); border: 1px solid #f39c12;
    border-radius: 6px; color: #f39c12; font-size: 0.85rem; line-height: 1.5;
}

/* ── Modal Body ─────────────────────────────────────────────────────────── */
.modal-body {
    display: flex; flex-direction: column;
    overflow: hidden; flex: 1;
}

/* ══ WERKZEUGKASTEN ═════════════════════════════════════════════════════════ */
.werkzeugkasten {
    display: flex; gap: 2px;
    padding: 0.6rem 1rem;
    background: #1e2d3d;
    border-bottom: 2px solid #3d5166;
    flex-shrink: 0;
}

.wz-btn {
    position: relative;
    display: flex; flex-direction: column; align-items: center; gap: 0.25rem;
    flex: 1; padding: 0.5rem 0.25rem;
    background: #2c3e50; border: 1px solid #3d5166;
    border-radius: 6px; color: #7f8c8d;
    cursor: pointer; transition: all 0.15s; font-size: 0.68rem;
}
.wz-btn:hover:not(:disabled) { background: #34495e; color: #bdc3c7; border-color: #5d7a96; }
.wz-btn.wz-active { background: #2980b9; border-color: #3498db; color: #fff; }
.wz-btn.wz-brush-on { background: #8e44ad; border-color: #9b59b6; color: #fff; }
.wz-btn.wz-disabled { opacity: 0.35; cursor: not-allowed; }
.wz-icon { display: flex; align-items: center; justify-content: center; line-height: 1; }
.wz-label { white-space: nowrap; font-weight: 600; letter-spacing: 0.02em; }
.wz-badge {
    position: absolute; top: -5px; right: -5px;
    background: #e74c3c; color: #fff;
    border-radius: 10px; font-size: 0.6rem; font-weight: 700;
    padding: 1px 5px; min-width: 16px; text-align: center;
}
.wz-badge-ok { background: #27ae60; }

/* ══ TOOL PANEL ═════════════════════════════════════════════════════════════ */
.tool-panel-area {
    flex: 1; overflow-y: auto;
    padding: 1.1rem 1.25rem;
    display: flex; flex-direction: column; gap: 0.9rem;
}

.tool-panel { display: flex; flex-direction: column; gap: 0.75rem; }

.tp-desc {
    font-size: 0.82rem; color: #95a5a6; line-height: 1.5;
}
.tp-warn {
    padding: 0.6rem 0.9rem;
    background: rgba(243,156,18,0.1); border: 1px solid #f39c12;
    border-radius: 6px; color: #f39c12; font-size: 0.82rem;
}
.tp-hint {
    font-size: 0.78rem; color: #5d7a96;
    padding: 0.3rem 0.6rem; background: rgba(41,128,185,0.08);
    border-radius: 4px; border: 1px solid #2c4a60;
}
.tp-hint strong { color: #3498db; }
.tp-error {
    padding: 0.6rem 0.9rem;
    background: rgba(231,76,60,0.12); border: 1px solid #e74c3c;
    border-radius: 6px; color: #e74c3c; font-size: 0.82rem;
}

/* Run button */
.btn-run {
    padding: 0.55rem 1.25rem; border: none; border-radius: 6px;
    background: #2980b9; color: #fff;
    font-weight: 700; font-size: 0.88rem; cursor: pointer;
    transition: background 0.2s; align-self: flex-start;
}
.btn-run:hover:not(:disabled) { background: #3498db; }
.btn-run:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-run.btn-run-active { background: #8e44ad; }
.btn-run.btn-run-active:hover { background: #9b59b6; }

/* Params grid (3 cols: label | slider | value) */
.params-grid {
    display: grid; grid-template-columns: 110px 1fr 52px;
    align-items: center; gap: 0.45rem 0.6rem;
    padding: 0.75rem; background: #233140; border-radius: 6px;
    border: 1px solid #3d5166;
}
.param-label  { font-size: 0.78rem; color: #95a5a6; }
.param-slider { width: 100%; accent-color: #2980b9; }
.param-val    { font-size: 0.75rem; color: #ecf0f1; font-family: monospace; text-align: right; }
.power-btns   { display: flex; gap: 4px; }
.power-btns button {
    flex: 1; padding: 0.15rem 0; border: 1px solid #3d5166;
    border-radius: 4px; background: #2c3e50; color: #7f8c8d;
    font-size: 0.78rem; cursor: pointer;
}
.power-btns button.active { background: #2980b9; color: #fff; border-color: #2980b9; }

/* Brush section headings */
.brush-section-label {
    font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: #5d7a96;
    border-bottom: 1px solid #3d5166; padding-bottom: 0.3rem;
    margin-bottom: 0.5rem;
}

/* Auto-fill options */
.autofill-options { display: flex; flex-direction: column; gap: 0.3rem; }
.checkbox-label {
    display: flex; align-items: center; gap: 0.45rem;
    font-size: 0.8rem; color: #bdc3c7; cursor: pointer;
    user-select: none;
}
.checkbox-label input[type="checkbox"] { accent-color: #2980b9; cursor: pointer; }

/* Modified info */
.mod-info {
    display: flex; align-items: center; gap: 0.5rem;
    font-size: 0.78rem; color: #2ecc71; font-weight: 600;
}
.mod-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #2ecc71; flex-shrink: 0;
}

/* ── Result Card ──────────────────────────────────────────────────────────── */
.result-card { border: 1px solid #3d5166; border-radius: 7px; overflow: hidden; }

.rc-header {
    padding: 0.55rem 0.9rem;
    font-weight: 600; font-size: 0.84rem;
}
.rc-header.oc-ok    { background: rgba(39,174,96,0.18);  color: #2ecc71; }
.rc-header.oc-warn  { background: rgba(243,156,18,0.18); color: #f39c12; }
.rc-header.oc-error { background: rgba(231,76,60,0.18);  color: #e74c3c; }

.rc-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    padding: 0.5rem 0.9rem 0.65rem; gap: 0.25rem 1.5rem;
    background: #233140;
}
.rc-grid span  { font-size: 0.78rem; color: #7f8c8d; align-self: center; }
.rc-grid strong { font-size: 0.8rem; color: #ecf0f1; font-family: monospace; }

.rc-actions {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.6rem 0.9rem; background: #1e2d3d;
    border-top: 1px solid #3d5166;
}
.btn-secondary {
    padding: 0.35rem 0.85rem; border: 1px solid #2980b9;
    border-radius: 5px; background: transparent;
    color: #3498db; font-size: 0.8rem; cursor: pointer; white-space: nowrap;
}
.btn-secondary:hover { background: rgba(52,152,219,0.15); }
.rc-hint { font-size: 0.73rem; color: #7f8c8d; }

/* Validate actions row */
.validate-actions {
    display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
}
.val-timestamp { font-size: 0.73rem; color: #7f8c8d; }

/* ── Validation Report ────────────────────────────────────────────────────── */
.report { border: 1px solid #3d5166; border-radius: 7px; overflow: hidden; }
.report-stale { opacity: 0.65; }
.report-header {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.6rem 0.9rem; font-weight: 600; font-size: 0.88rem;
}
.report-header.ok    { background: rgba(39,174,96,0.2);  color: #2ecc71; }
.report-header.warn  { background: rgba(243,156,18,0.2); color: #f39c12; }
.report-header.error { background: rgba(231,76,60,0.2);  color: #e74c3c; }

.check-list { list-style: none; margin: 0; padding: 0; }
.check-item {
    display: flex; align-items: flex-start; gap: 0.6rem;
    padding: 0.45rem 0.9rem; border-bottom: 1px solid #233140; font-size: 0.79rem;
}
.check-item:last-child { border-bottom: none; }
.check-item.ok    { background: rgba(39,174,96,0.04); }
.check-item.warn  { background: rgba(243,156,18,0.07); }
.check-item.error { background: rgba(231,76,60,0.07); }
.ci-icon { padding-top: 1px; min-width: 12px; }
.check-item.ok    .ci-icon { color: #27ae60; }
.check-item.warn  .ci-icon { color: #f39c12; }
.check-item.error .ci-icon { color: #e74c3c; }
.ci-body   { display: flex; flex-direction: column; gap: 0.05rem; }
.ci-label  { font-weight: 600; color: #ecf0f1; }
.ci-detail { color: #7f8c8d; font-size: 0.74rem; }

/* Value colors */
.val-ok   { color: #2ecc71 !important; }
.val-warn { color: #f39c12 !important; }
.val-err  { color: #e74c3c !important; }
</style>
