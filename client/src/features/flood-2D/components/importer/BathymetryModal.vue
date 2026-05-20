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

      <!-- ── Pipeline ────────────────────────────────────────────────── -->
      <div v-else class="pipeline">

        <!-- ════ Step 1 · Validierung ════════════════════════════════ -->
        <div class="step" :class="{ 'step-open': activeStep === 0 }">
          <div class="step-header" @click="activeStep = activeStep === 0 ? -1 : 0">
            <div class="step-badge" :class="badgeClass(step1Status)">{{ badgeIcon(step1Status, '1') }}</div>
            <div class="step-meta">
              <span class="step-title">Validierung</span>
              <span class="step-summary">{{ step1Summary }}</span>
            </div>
            <svg class="chevron" :class="{ open: activeStep === 0 }" width="14" height="14"
              fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
          <div v-show="activeStep === 0" class="step-body">
            <p class="step-desc">DGM-Metadaten und Vermessungspunkte auf Plausibilität prüfen. Kann jederzeit wiederholt werden.</p>
            <div class="row-actions">
              <button class="btn-run" :disabled="validating" @click="runValidation">
                {{ validating ? 'Prüfe…' : bathyStore.validationReport ? 'Erneut validieren' : 'Datensätze validieren' }}
              </button>
              <span v-if="lastValidatedAt" class="val-timestamp">Zuletzt: {{ lastValidatedAt }}</span>
            </div>
            <div v-if="validationStale" class="tp-warn">⚠ Terrain wurde verändert — Ergebnis veraltet.</div>
            <div v-if="bathyStore.validationReport" class="report" :class="{ 'report-stale': validationStale }">
              <div class="report-header" :class="bathyStore.validationReport.status">
                <span>{{ statusEmoji }}</span><span>{{ statusLabel }}</span>
              </div>
              <!-- Delta-Zusammenfassung: prominente Kennzahlen -->
              <template v-if="bathyStore.validationReport.summary?.deltaMedian != null">
                <div class="delta-summary">
                  <div class="ds-item">
                    <span class="ds-label">Median Δ</span>
                    <strong class="ds-value"
                      :class="Math.abs(bathyStore.validationReport.summary.deltaMedian) > 5 ? 'val-err' :
                              Math.abs(bathyStore.validationReport.summary.deltaMedian) > 0.15 ? 'val-warn' : 'val-ok'">
                      {{ (bathyStore.validationReport.summary.deltaMedian >= 0 ? '+' : '') + bathyStore.validationReport.summary.deltaMedian.toFixed(3) }} m
                    </strong>
                  </div>
                  <div class="ds-item">
                    <span class="ds-label">MAD</span>
                    <strong class="ds-value"
                      :class="bathyStore.validationReport.summary.deltaMAD > 2 ? 'val-err' :
                              bathyStore.validationReport.summary.deltaMAD > 0.3 ? 'val-warn' : 'val-ok'">
                      ± {{ bathyStore.validationReport.summary.deltaMAD.toFixed(3) }} m
                    </strong>
                  </div>
                  <div class="ds-item">
                    <span class="ds-label">Kanal-Q1</span>
                    <strong class="ds-value"
                      :class="bathyStore.validationReport.summary.channelPct >= 30 ? 'val-warn' :
                              bathyStore.validationReport.summary.channelPct >= 10 ? 'val-warn' : 'val-ok'">
                      {{ bathyStore.validationReport.summary.channelPct.toFixed(0) }}%
                    </strong>
                  </div>
                  <div class="ds-item">
                    <span class="ds-label">P10 / P90</span>
                    <span class="ds-value ds-range">
                      {{ bathyStore.validationReport.summary.deltaP10.toFixed(2) }} /
                      {{ bathyStore.validationReport.summary.deltaP90.toFixed(2) }} m
                    </span>
                  </div>
                </div>
                <!-- Otsu-Cluster-Karte wenn Bimodalität erkannt -->
                <div v-if="bathyStore.validationReport.summary.isBimodal" class="otsu-card">
                  <div class="otsu-header">
                    ⚠ Zwei Populationen erkannt — Otsu-Grenze: Δ = {{ bathyStore.validationReport.summary.otsuThreshold.toFixed(2) }} m
                    &ensp;·&ensp; BC = {{ bathyStore.validationReport.summary.bimodalityCoeff.toFixed(3) }}
                  </div>
                  <div class="otsu-clusters">
                    <div class="otsu-cluster otsu-a">
                      <span class="oc-label">Gruppe A — Ufer/Vorland</span>
                      <span class="oc-n">{{ bathyStore.validationReport.summary.clusterA.n }} Pkt</span>
                      <span class="oc-med">Median Δ {{ (bathyStore.validationReport.summary.clusterA.median >= 0 ? '+' : '') + bathyStore.validationReport.summary.clusterA.median?.toFixed(3) }} m</span>
                    </div>
                    <div class="otsu-cluster otsu-b">
                      <span class="oc-label">Gruppe B — Kanal-Kandidaten</span>
                      <span class="oc-n">{{ bathyStore.validationReport.summary.clusterB.n }} Pkt</span>
                      <span class="oc-med">Median Δ {{ (bathyStore.validationReport.summary.clusterB.median >= 0 ? '+' : '') + bathyStore.validationReport.summary.clusterB.median?.toFixed(3) }} m</span>
                    </div>
                  </div>
                </div>
              </template>
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
            <div class="step-footer">
              <button class="btn-next" :disabled="!bathyStore.validationReport" @click="activeStep = 1">Weiter →</button>
            </div>
          </div>
        </div>

        <!-- ════ Step 2 · Offset-Korrektur ══════════════════════════ -->
        <div class="step" :class="{ 'step-open': activeStep === 1 }">
          <div class="step-header" @click="activeStep = activeStep === 1 ? -1 : 1">
            <div class="step-badge" :class="badgeClass(step2Status)">{{ badgeIcon(step2Status, '2') }}</div>
            <div class="step-meta">
              <span class="step-title">Offset-Korrektur</span>
              <span class="step-summary">{{ step2Summary }}</span>
            </div>
            <svg class="chevron" :class="{ open: activeStep === 1 }" width="14" height="14"
              fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
          <div v-show="activeStep === 1" class="step-body">
            <p class="step-desc">
              Berechnet für jeden Vermessungspunkt Δ = Survey&thinsp;Z − DEM&thinsp;Z.
              Klicke einen Punkt als Referenz an — dessen Δ wird als Offset angewendet.
              Ohne Auswahl gilt der globale Median aller Punkte.
            </p>

            <div class="row-actions">
              <button class="btn-run" :disabled="diagRunning" @click="runStage2">
                {{ diagRunning ? 'Analysiere…' : pointDeltaData.length ? 'Erneut analysieren' : 'Punkte analysieren' }}
              </button>
              <button class="btn-secondary" style="white-space:nowrap"
                @click="simStore.setActiveTool('OFFSET_REF_PICK'); $emit('close')">
                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  style="display:inline;vertical-align:-1px;margin-right:4px">
                  <circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>
                </svg>
                Punkt im Viewer wählen
              </button>
            </div>
            <div v-if="diagError" class="tp-error">{{ diagError }}</div>

            <!-- Viewer pick result when table not yet populated -->
            <div v-if="refPickState.selectedOrigIdx >= 0 && !pointDeltaData.length" class="pick-hint">
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                style="display:inline;vertical-align:-1px;margin-right:4px;color:#ffaa00">
                <circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>
              </svg>
              Punkt P{{ refPickState.selectedOrigIdx + 1 }} gewählt — „Punkte analysieren" ausführen um Δ zu berechnen.
            </div>

            <!-- Reference point table -->
            <template v-if="pointDeltaData.length">
              <div class="section-label">
                Referenzpunkt wählen
                <span class="sl-sub">({{ sortedDeltaData.length }} Punkte · sortiert nach |Δ|)</span>
              </div>

              <!-- Outlier-Hinweis -->
              <div v-if="outlierCount > 0" class="outlier-bar">
                <span class="ob-icon">⚠</span>
                <span>
                  <strong>{{ outlierCount }} Ausreißer</strong> mit |Δ| &gt; 2m —
                  wahrscheinlich Strukturpunkte (Brücke, Wehr, Mast) oder Messpunkte auf Gelände
                  das im Laserscan fehlt. Für die Offset-Berechnung <em>nicht geeignet</em>.
                </span>
                <label class="ob-toggle">
                  <input type="checkbox" v-model="hideOutliers" />
                  ausblenden
                </label>
              </div>

              <div class="ref-table-wrap">
                <table class="ref-table">
                  <thead>
                    <tr>
                      <th style="width:20px"></th>
                      <th>Punkt</th>
                      <th>X / Y</th>
                      <th>Survey Z</th>
                      <th>DEM Z</th>
                      <th>Δ Z</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="pt in sortedDeltaData" :key="pt.origIdx"
                      :class="{ 'row-selected': selectedRefIdx === pt.origIdx, 'row-outlier': pt.outlier }"
                      :title="pt.outlier ? '⚠ Ausreißer: |Δ| > 2m — nicht als Referenzpunkt geeignet' : ''"
                      @click="!pt.outlier && (selectedRefIdx = selectedRefIdx === pt.origIdx ? -1 : pt.origIdx)">
                      <td>
                        <span v-if="pt.outlier" class="outlier-flag" title="Ausreißer |Δ| > 2m">⚠</span>
                        <span v-else class="sel-radio" :class="{ 'sel-active': selectedRefIdx === pt.origIdx }"></span>
                      </td>
                      <td class="pt-label">{{ pt.label || `P${pt.origIdx + 1}` }}</td>
                      <td class="pt-coord">{{ pt.x.toFixed(1) }} / {{ pt.y.toFixed(1) }}</td>
                      <td class="pt-z">{{ pt.surveyZ.toFixed(3) }}</td>
                      <td class="pt-z">{{ pt.demZ.toFixed(3) }}</td>
                      <td class="pt-delta" :class="pt.outlier ? 'val-outlier' : deltaClass(pt.delta)">
                        {{ fmtOffset(pt.delta) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Offset summary card -->
              <div class="offset-summary">
                <div class="os-main">
                  <span class="os-label">
                    {{ selectedRefIdx >= 0 ? 'Referenzpunkt-Offset' : 'Globaler Median' }}
                  </span>
                  <strong class="os-value" :class="deltaClass(effectiveOffset)">
                    {{ fmtOffset(effectiveOffset) }} m
                  </strong>
                </div>
                <div v-if="selectedRefIdx >= 0" class="os-secondary">
                  Globaler Median: {{ fmtOffset(bathyStore.offsetDiagnosis?.median ?? 0) }} m
                  &ensp;·&ensp; MAD ± {{ bathyStore.offsetDiagnosis?.mad?.toFixed(3) ?? '—' }} m
                </div>
                <div class="os-interp">{{ offsetInterpretation }}</div>
              </div>

              <div class="row-actions">
                <button class="btn-run" @click="applyOffset"
                  :disabled="offsetApplied || Math.abs(effectiveOffset) < 1e-6">
                  {{ offsetApplied ? '✓ Angewendet' : `Offset anwenden (${fmtOffset(effectiveOffset)} m)` }}
                </button>
                <button v-if="selectedRefIdx >= 0" class="btn-skip"
                  style="font-size:0.75rem" @click="selectedRefIdx = -1">
                  Auswahl aufheben
                </button>
              </div>
            </template>

            <div class="step-footer">
              <button class="btn-skip" @click="activeStep = 2">Überspringen</button>
              <button class="btn-next" @click="activeStep = 2">Weiter →</button>
            </div>
          </div>
        </div>

        <!-- ════ Step 3 · Kanal-Geometrie ══════════════════════════════ -->
        <div class="step" :class="{ 'step-open': activeStep === 2 }">
          <div class="step-header" @click="activeStep = activeStep === 2 ? -1 : 2">
            <div class="step-badge" :class="badgeClass(step3Status)">{{ badgeIcon(step3Status, '3') }}</div>
            <div class="step-meta">
              <span class="step-title">Kanal-Geometrie</span>
              <span class="step-summary">{{ step3Summary }}</span>
            </div>
            <svg class="chevron" :class="{ open: activeStep === 2 }" width="14" height="14"
              fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
          <div v-show="activeStep === 2" class="step-body">
            <p class="step-desc">
              Kanal-Mittellinie im 3D-Viewer zeichnen — erster Punkt = Oberstrom, letzter = Unterstrom.
              Wird für monotonen Thalweg in Schritt 4 verwendet. <em>Optional.</em>
            </p>
            <div class="polyline-status" :class="hasCommittedLine ? 'pl-ok' : 'pl-empty'">
              <span v-if="hasCommittedLine">✓ {{ bathyStore.channelPolyline.length }} Punkte gespeichert</span>
              <span v-else>Keine Linie gezeichnet</span>
            </div>
            <div class="row-actions">
              <button class="btn-run" @click="simStore.setActiveTool('CHANNEL_LINE'); $emit('close')">
                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"
                  style="display:inline;vertical-align:-1px;margin-right:4px">
                  <path d="M3 17 Q8 7 12 12 Q16 17 21 7"/>
                </svg>
                Linie zeichnen
              </button>
              <button v-if="hasCommittedLine" class="btn-danger" @click="bathyStore.setChannelPolyline([])">Löschen</button>
            </div>

            <template v-if="hasCommittedLine">
              <div class="section-label" style="margin-top:0.5rem">Längsschnitt</div>
              <BathymetryLaengsschnitt />
            </template>

            <!-- ── Flussschlauch-Polygon ─────────────────────────────── -->
            <div class="section-label" style="margin-top:0.9rem">
              Flussschlauch-Polygon
              <span class="sl-sub">— alle Zellen innen werden lückenlos mit IDW befüllt</span>
            </div>
            <p class="step-desc" style="margin-top:0.2rem">
              Markiert den Bereich, in dem der Laserscan die Wasseroberfläche misst statt der Kanalsohle.
              Alle Rasterzellen innerhalb des Polygons werden durch IDW aus den Vermessungspunkten ersetzt —
              Zellen ohne Punkt in der Nähe erhalten einen globalen IDW-Fallback (keine Lücken).
            </p>
            <div class="polyline-status" :class="hasCommittedPolygon ? 'pl-ok' : 'pl-empty'">
              <span v-if="hasCommittedPolygon">
                ✓ {{ bathyStore.channelPolygon.length }} Punkte gespeichert
              </span>
              <span v-else>Kein Polygon gezeichnet</span>
            </div>
            <div class="row-actions">
              <button class="btn-run" @click="simStore.setActiveTool('CHANNEL_POLYGON'); $emit('close')">
                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"
                  style="display:inline;vertical-align:-1px;margin-right:4px">
                  <polygon points="3,18 8,6 16,3 21,14 12,21"/>
                </svg>
                Polygon zeichnen
              </button>
              <button v-if="hasCommittedPolygon" class="btn-danger"
                @click="bathyStore.setChannelPolygon([])">Löschen</button>
            </div>

            <div class="step-footer">
              <button class="btn-skip" @click="activeStep = 3">Überspringen</button>
              <button class="btn-next" @click="activeStep = 3">Weiter →</button>
            </div>
          </div>
        </div>

        <!-- ════ Step 4 · Kanalinterpolation ═══════════════════════════ -->
        <div class="step" :class="{ 'step-open': activeStep === 3 }">
          <div class="step-header" @click="activeStep = activeStep === 3 ? -1 : 3">
            <div class="step-badge" :class="badgeClass(step4Status)">{{ badgeIcon(step4Status, '4') }}</div>
            <div class="step-meta">
              <span class="step-title">Kanalinterpolation</span>
              <span class="step-summary">{{ step4Summary }}</span>
            </div>
            <svg class="chevron" :class="{ open: activeStep === 3 }" width="14" height="14"
              fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
          <div v-show="activeStep === 3" class="step-body">

            <!-- ── Modus-Karte ──────────────────────────────────────── -->
            <div class="mode-card" :class="hasCommittedPolygon ? 'mode-polygon' : 'mode-legacy'">
              <div class="mc-header">
                <span class="mc-badge">{{ hasCommittedPolygon ? '▣ Polygon-Modus' : '◎ Punkt-Einflussmodus' }}</span>
                <button class="mc-change" @click="activeStep = 2">
                  {{ hasCommittedPolygon ? 'Polygon ändern →' : 'Polygon zeichnen →' }}
                </button>
              </div>
              <template v-if="hasCommittedPolygon">
                <div class="mc-row">
                  <span class="mc-key">Maske</span>
                  <span class="mc-val">Alle Zellen im Flussschlauch-Polygon ({{ bathyStore.channelPolygon.length }} Eckpunkte)</span>
                </div>
                <div class="mc-row">
                  <span class="mc-key">Zellen mit Punkten in Suchradius</span>
                  <span class="mc-val">Lokales IDW · exakt an Messpunkten</span>
                </div>
                <div class="mc-row">
                  <span class="mc-key">Lücken (kein Punkt im Suchradius)</span>
                  <span class="mc-val mc-fallback">Globaler IDW-Fallback (alle {{ bathyStore.surveyPoints.length }} Punkte) · keine Lücken</span>
                </div>
                <div class="mc-row">
                  <span class="mc-key">Außerhalb Polygon</span>
                  <span class="mc-val" style="color:#5d7a96">Laser-DGM unverändert</span>
                </div>
              </template>
              <template v-else>
                <div class="mc-row">
                  <span class="mc-key">Maske</span>
                  <span class="mc-val">Kreise um jeden Messpunkt (Radius = Suchradius)</span>
                </div>
                <div class="mc-row">
                  <span class="mc-key">Bereiche ohne Messpunkte</span>
                  <span class="mc-val mc-warn">Unverändert — Laser-DGM bleibt (mögliche Lücken!)</span>
                </div>
                <div class="mc-row">
                  <span class="mc-key">Empfehlung</span>
                  <span class="mc-val" style="color:#5d7a96">Flussschlauch-Polygon zeichnen für lückenlose Füllung</span>
                </div>
              </template>
            </div>

            <!-- ── IDW-Parameter ───────────────────────────────────── -->
            <div class="section-label" style="margin-top:0.7rem">IDW-Parameter</div>
            <div class="params-grid">
              <label class="param-label"
                :title="hasCommittedPolygon ? 'Radius für lokales IDW. Zellen ohne Punkt im Suchradius → globaler Fallback' : 'Bestimmt welche Zellen befüllt werden und wie weit IDW reicht'">
                {{ hasCommittedPolygon ? 'Suchradius (lokal)' : 'Suchradius' }}
              </label>
              <input type="range" v-model.number="bathyBrushSettings.searchRadius" min="5" max="500" step="5" class="param-slider" />
              <span class="param-val">{{ bathyBrushSettings.searchRadius }} m</span>

              <label class="param-label">Potenz</label>
              <div class="power-btns">
                <button v-for="p in [1,2,3]" :key="p"
                  :class="{ active: bathyBrushSettings.power === p }"
                  @click="bathyBrushSettings.power = p">{{ p }}</button>
              </div>
              <span class="param-val"/>

              <label class="param-label"
                :title="hasCommittedPolygon ? 'Gilt nur für lokales IDW — Lücken nutzen automatisch globalen Fallback unabhängig von dieser Zahl' : 'Min. Punkte im Suchradius'">
                Min. Punkte
                <span v-if="hasCommittedPolygon" style="color:#5d7a96;font-size:0.68rem"> (lokal)</span>
              </label>
              <input type="range" v-model.number="bathyBrushSettings.minPoints" min="1" max="10" step="1" class="param-slider" />
              <span class="param-val">{{ bathyBrushSettings.minPoints }}</span>

              <label class="param-label" title="0 = alle im Suchradius">Max. K-Punkte</label>
              <input type="range" v-model.number="bathyBrushSettings.maxPoints" min="0" max="20" step="1" class="param-slider" />
              <span class="param-val">{{ bathyBrushSettings.maxPoints === 0 ? 'Alle' : bathyBrushSettings.maxPoints }}</span>

              <label class="param-label" title="Glättet Bullseye-Artefakte um Messpunkte">Nugget</label>
              <input type="range" v-model.number="bathyBrushSettings.nugget" min="0" max="2" step="0.05" class="param-slider" />
              <span class="param-val">{{ bathyBrushSettings.nugget.toFixed(2) }} m</span>
            </div>
            <label class="checkbox-label">
              <input type="checkbox" v-model="bathyBrushSettings.zClamp" />
              Z-Begrenzung — Ergebnis ≤ umgebende DGM-Zellen
              <span v-if="hasCommittedPolygon" style="color:#5d7a96;font-size:0.71rem">
                &ensp;(im Polygon-Modus meist deaktivieren — Sohle liegt unter Laserscan)
              </span>
            </label>

            <!-- ── Thalweg (wenn Flusslinie gezeichnet) ────────────── -->
            <template v-if="hasCommittedLine">
              <div class="section-label" style="margin-top:0.6rem">Thalweg</div>
              <label class="checkbox-label">
                <input type="checkbox" v-model="vrThalwegEnforce" />
                Monoton fallend entlang Flusslinie erzwingen
              </label>
              <div v-if="vrThalwegEnforce" class="params-grid" style="margin-top:0.15rem">
                <label class="param-label">Korridor-Halbbreite</label>
                <input type="range" v-model.number="vrThalwegRadius" min="5" max="100" step="5" class="param-slider" />
                <span class="param-val">{{ vrThalwegRadius }} m</span>
              </div>
            </template>

            <!-- ── Berechnung & Vorschau ────────────────────────────── -->
            <div class="section-label" style="margin-top:0.7rem">Berechnung &amp; Vorschau</div>
            <div class="row-actions" style="flex-wrap:wrap;gap:0.4rem">
              <button class="btn-run" :disabled="vrRunning" @click="runVirtualRaster">
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  style="display:inline;vertical-align:-2px;margin-right:5px">
                  <path d="M4 7h16M7 12h10M10 17h4"/>
                </svg>
                {{ vrRunning ? `Berechne… ${vrProgress}%`
                   : bathyZone ? 'Neu berechnen'
                   : hasCommittedPolygon ? 'Polygon interpolieren' : 'Virtuelles Raster berechnen' }}
              </button>
              <button v-if="bathyZone && !vrFused && !vrRunning" class="btn-secondary"
                style="font-size:0.75rem" @click="rasterStore.removeZone(BATHY_ZONE_ID)">
                Löschen
              </button>
            </div>
            <div v-if="vrRunning" class="progress-bar-wrap">
              <div class="progress-bar" :style="{ width: vrProgress + '%' }"></div>
            </div>
            <div v-if="vrError" class="tp-error">{{ vrError }}</div>

            <template v-if="vrStats">
              <div class="vr-stats-card">
                <span class="vrs-count">{{ vrStats.count.toLocaleString() }} Zellen</span>
                <span class="vrs-sep">·</span>
                <span class="vrs-range">Z: {{ vrStats.minZ.toFixed(2) }} – {{ vrStats.maxZ.toFixed(2) }} m</span>
                <label class="vrs-toggle">
                  <input type="checkbox" v-model="vrVisible" />
                  Vorschau
                </label>
              </div>
              <button v-if="!vrFused" class="btn-run btn-fuse" @click="fuseVirtualRaster">
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  style="display:inline;vertical-align:-2px;margin-right:5px">
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4"/><rect x="3" y="17" width="18" height="4" rx="1"/>
                </svg>
                In Laser-DGM übernehmen
              </button>
              <div v-else class="tp-ok">
                ✓ {{ vrStats.count.toLocaleString() }} Zellen in DGM fusioniert
              </div>
            </template>

            <!-- ── Manuelle Nachkorrektur (Pinsel) ─────────────────── -->
            <div class="section-label" style="margin-top:0.7rem">Manuelle Nachkorrektur (Pinsel)</div>
            <div class="params-grid">
              <label class="param-label">Pinselradius</label>
              <input type="range" v-model.number="bathyBrushSettings.radius" min="1" max="100" step="1" class="param-slider" />
              <span class="param-val">{{ bathyBrushSettings.radius }} m</span>
            </div>
            <button :class="['btn-run', brushActive ? 'btn-run-active' : '']" @click="toggleBrush">
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                style="display:inline;vertical-align:-2px;margin-right:5px">
                <path d="M20 4l-4 4M14 8l-6 6c-1 1-1.5 2.5-1.5 4V20h2c1.5 0 3-.5 4-1.5l6-6M14 8l2-2"/>
                <path d="M3 21c0-2 1.5-4 4-4"/>
              </svg>
              {{ brushActive ? 'Pinsel deaktivieren' : 'Pinsel aktivieren' }}
            </button>

            <!-- ── Direkte Füllung (nur im Punkt-Modus relevant) ───── -->
            <template v-if="!hasCommittedPolygon">
              <div class="section-label" style="margin-top:0.7rem">Gesamtgebiet füllen
                <span class="sl-sub">— ohne Polygon, alle NoData-Zellen</span>
              </div>
              <label class="checkbox-label">
                <input type="checkbox" v-model="autoFillNodataOnly" />
                Nur NoData-Zellen ersetzen (konservativ)
              </label>
              <button class="btn-run" :disabled="autoFillRunning" @click="runAutoFill">
                {{ autoFillRunning ? `Berechne… ${autoFillProgress}%` : 'Gesamtgebiet füllen' }}
              </button>
              <div v-if="autoFillRunning" class="progress-bar-wrap">
                <div class="progress-bar" :style="{ width: autoFillProgress + '%' }"></div>
              </div>
            </template>

            <div v-if="bathyStore.modifiedCount > 0" class="mod-info">
              <span class="mod-dot"></span>
              {{ bathyStore.modifiedCount.toLocaleString() }} Zellen modifiziert
            </div>

            <div class="step-footer">
              <button class="btn-next" :disabled="bathyStore.modifiedCount === 0" @click="activeStep = 4">Weiter →</button>
            </div>
          </div>
        </div>

        <!-- ════ Step 5 · Blending ════════════════════════════════════ -->
        <div class="step" :class="{ 'step-open': activeStep === 4 }">
          <div class="step-header" @click="activeStep = activeStep === 4 ? -1 : 4">
            <div class="step-badge" :class="badgeClass(step5Status)">{{ badgeIcon(step5Status, '5') }}</div>
            <div class="step-meta">
              <span class="step-title">Blending</span>
              <span class="step-summary">{{ step5Summary }}</span>
            </div>
            <svg class="chevron" :class="{ open: activeStep === 4 }" width="14" height="14"
              fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
          <div v-show="activeStep === 4" class="step-body">
            <p class="step-desc">Sanften Übergang zwischen IDW-gefüllten und originalen DGM-Zellen erzeugen (Laplacian-Glättung).</p>
            <div v-if="bathyStore.modifiedCount === 0" class="tp-warn">
              Bitte zuerst Schritt 4 (IDW-Füllung) ausführen.
            </div>
            <template v-else>
              <div class="params-grid">
                <label class="param-label">Übergangsbreite</label>
                <input type="range" v-model.number="sigBlendWidth" min="1" max="20" step="1" class="param-slider" />
                <span class="param-val">{{ sigBlendWidth }} m</span>
              </div>
              <button class="btn-run" :disabled="blendRunning" @click="runSigmoidBlend">
                {{ blendRunning ? 'Berechne…' : blendApplied ? 'Erneut anwenden' : 'Blending anwenden' }}
              </button>
            </template>
            <div class="step-footer">
              <button class="btn-skip" @click="activeStep = 5">Überspringen</button>
              <button class="btn-next" @click="activeStep = 5">Weiter →</button>
            </div>
          </div>
        </div>

        <!-- ════ Step 6 · Qualitätssicherung ═════════════════════════ -->
        <div class="step" :class="{ 'step-open': activeStep === 5 }">
          <div class="step-header" @click="activeStep = activeStep === 5 ? -1 : 5">
            <div class="step-badge" :class="badgeClass(step6Status)">{{ badgeIcon(step6Status, '6') }}</div>
            <div class="step-meta">
              <span class="step-title">Qualitätssicherung</span>
              <span class="step-summary">{{ step6Summary }}</span>
            </div>
            <svg class="chevron" :class="{ open: activeStep === 5 }" width="14" height="14"
              fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
          <div v-show="activeStep === 5" class="step-body">
            <p class="step-desc">
              Leave-One-Out Kreuzvalidierung — jeden Punkt weglassen, mit IDW der übrigen vorhersagen, Fehler messen.
              Nutzt die IDW-Parameter aus Schritt 4.
            </p>
            <button class="btn-run" :disabled="crossRunning || bathyStore.surveyPoints.length < 3" @click="runCrossVal">
              {{ crossRunning ? 'Berechne…' : bathyStore.crossValResult ? 'Erneut berechnen' : 'Cross-Validation starten' }}
            </button>
            <div v-if="bathyStore.crossValResult" class="result-card">
              <div class="rc-header"
                :class="bathyStore.crossValResult.n === 0 ? 'oc-error' : bathyStore.crossValResult.rmse < 0.1 ? 'oc-ok' : bathyStore.crossValResult.rmse < 0.3 ? 'oc-warn' : 'oc-error'">
                LOO-Ergebnis · {{ bathyStore.crossValResult.n }} / {{ bathyStore.surveyPoints.length }} Punkte vorhergesagt
              </div>
              <div v-if="bathyStore.crossValResult.warning" class="tp-warn" style="border-radius:0;margin:0">
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
                <span>Übersprungen</span><strong>{{ bathyStore.crossValResult.skipped ?? 0 }} Punkte</strong>
              </div>
            </div>
          </div>
        </div>

      </div><!-- /pipeline -->
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore.js';
import { useBathymetryStore } from '@/features/flood-2D/stores/useBathymetryStore.js';
import { useRasterProcessingStore, ZoneType } from '@/features/flood-2D/stores/useRasterProcessingStore.js';
import { useSimulationStore } from '@/features/flood-2D/stores/useSimulationStore.js';
import { bathyBrushSettings, computeIDW } from '@/features/flood-2D/composables/editor/useBathyBrushTool.js';
import { channelLineState } from '@/features/flood-2D/composables/editor/useChannelLineTool.js';
import { refPickState }    from '@/features/flood-2D/composables/editor/useOffsetRefPickTool.js';
import BathymetryLaengsschnitt from './BathymetryLaengsschnitt.vue';

const emit         = defineEmits(['close']);
const geoStore     = useGeoStore();
const bathyStore   = useBathymetryStore();
const rasterStore  = useRasterProcessingStore();
const simStore     = useSimulationStore();

// ── Stepper ────────────────────────────────────────────────────────────────
const activeStep = ref(0);

// ── Terrain helper ─────────────────────────────────────────────────────────
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

// ── Badge helpers ──────────────────────────────────────────────────────────
function badgeClass(status) {
    return {
        'badge-pending': status === 'pending',
        'badge-running': status === 'running',
        'badge-ok':      status === 'ok',
        'badge-warn':    status === 'warn',
        'badge-error':   status === 'error',
    };
}
function badgeIcon(status, num) {
    if (status === 'ok')      return '✓';
    if (status === 'warn')    return '⚠';
    if (status === 'error')   return '✗';
    if (status === 'running') return '…';
    return num;
}

// ── Step statuses ──────────────────────────────────────────────────────────
const step1Status = computed(() => {
    if (validating.value) return 'running';
    if (!bathyStore.validationReport) return 'pending';
    return bathyStore.validationReport.status;
});
const step2Status = computed(() => {
    if (diagRunning.value) return 'running';
    if (!bathyStore.offsetDiagnosis) return 'pending';
    return (offsetApplied.value || Math.abs(effectiveOffset.value) < 0.05) ? 'ok' : 'warn';
});
const step3Status = computed(() => {
    if (bathyStore.channelPolygon.length >= 3) return 'ok';
    if (bathyStore.channelPolyline.length >= 2) return 'warn'; // line but no polygon
    return 'pending';
});
const step4Status = computed(() => {
    if (vrRunning.value || autoFillRunning.value) return 'running';
    if (bathyStore.modifiedCount > 0) return 'ok';
    if (bathyZone.value) return 'warn'; // computed but not yet fused
    return 'pending';
});
const step5Status = computed(() => {
    if (blendRunning.value) return 'running';
    return blendApplied.value ? 'ok' : 'pending';
});
const step6Status = computed(() => {
    if (crossRunning.value) return 'running';
    const r = bathyStore.crossValResult;
    if (!r) return 'pending';
    if (r.n === 0) return 'error';
    return r.rmse < 0.1 ? 'ok' : r.rmse < 0.3 ? 'warn' : 'error';
});

// ── Step summaries ─────────────────────────────────────────────────────────
const step1Summary = computed(() => {
    if (validating.value) return 'Prüfe…';
    if (!bathyStore.validationReport) return 'Noch nicht ausgeführt';
    return validationStale.value ? '⚠ Ergebnis veraltet — bitte wiederholen' : statusLabel.value;
});
const step2Summary = computed(() => {
    if (diagRunning.value) return 'Analysiere…';
    if (!bathyStore.offsetDiagnosis) return 'Noch nicht ausgeführt';
    const label = selectedRefIdx.value >= 0 ? 'Ref.-Punkt' : 'Median';
    return `${label} ${fmtOffset(effectiveOffset.value)} m${offsetApplied.value ? ' · Angewendet' : ''}`;
});
const step3Summary = computed(() => {
    const nPoly = bathyStore.channelPolygon.length;
    const nLine = bathyStore.channelPolyline.length;
    if (nPoly >= 3) return `Polygon: ${nPoly} Pkt · Linie: ${nLine >= 2 ? nLine + ' Pkt' : '—'}`;
    if (nLine >= 2) return `Linie: ${nLine} Pkt — Polygon fehlt noch`;
    return 'Optional — noch nicht gezeichnet';
});
const step4Summary = computed(() => {
    if (vrRunning.value) return `Virtuelles Raster… ${vrProgress.value}%`;
    if (autoFillRunning.value) return `Berechne… ${autoFillProgress.value}%`;
    if (vrFused.value && vrStats.value) return `${vrStats.value.count.toLocaleString()} Zellen fusioniert`;
    if (bathyZone.value && vrStats.value) return `${vrStats.value.count.toLocaleString()} Zellen berechnet — noch nicht übernommen`;
    const n = bathyStore.modifiedCount;
    return n > 0 ? `${n.toLocaleString()} Zellen modifiziert` : 'Noch nicht ausgeführt';
});
const step5Summary = computed(() => {
    if (blendRunning.value) return 'Berechne…';
    return blendApplied.value ? 'Angewendet' : 'Noch nicht ausgeführt';
});
const step6Summary = computed(() => {
    if (crossRunning.value) return 'Berechne…';
    const r = bathyStore.crossValResult;
    if (!r) return 'Noch nicht ausgeführt';
    return r.n > 0 ? `RMSE ${r.rmse.toFixed(4)} m` : 'Keine Vorhersagen möglich';
});

// ── Status-Leiste ──────────────────────────────────────────────────────────
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

// ── Validierung ────────────────────────────────────────────────────────────
const validating      = ref(false);
const validationStale = ref(false);
const lastValidatedAt = ref(null);

watch(() => geoStore.terrainVersion, () => {
    if (bathyStore.validationReport) validationStale.value = true;
});
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

    // ── 1. DGM-Metadaten ────────────────────────────────────────────────────
    checks.push({ id: 'dem', label: 'DGM-Metadaten', status: 'ok',
        detail: `${ncols}×${nrows} Zellen · ${cellsize}m · X[${xllcorner.toFixed(0)}–${xur.toFixed(0)}] · Y[${yllcorner.toFixed(0)}–${yur.toFixed(0)}]` });

    // ── 2. Rasterauflösung ───────────────────────────────────────────────────
    const csOk = cellsize >= 0.1 && cellsize <= 20;
    checks.push({ id: 'cellsize', label: 'Rasterauflösung', status: csOk ? 'ok' : 'warn',
        detail: csOk ? `${cellsize}m — plausibel` : `${cellsize}m außerhalb 0.1–20m — Einheit prüfen` });

    // ── 3. Höhenplausibilität ────────────────────────────────────────────────
    let hStatus = 'ok', hDetail = `Z: ${minZ.toFixed(2)} – ${maxZ.toFixed(2)} m NN`;
    if (maxZ > 5000 || minZ < -500)  { hStatus = 'warn'; hDetail += ' — Einheit prüfen (m statt cm?)'; }
    else if ((maxZ - minZ) < 0.05)   { hStatus = 'warn'; hDetail += ' — sehr geringer Höhenunterschied'; }
    checks.push({ id: 'height', label: 'Höhenplausibilität', status: hStatus, detail: hDetail });

    // ── 4. Vermessungspunkte ─────────────────────────────────────────────────
    checks.push({ id: 'survey', label: 'Vermessungspunkte', status: points.length >= 3 ? 'ok' : 'error',
        detail: `${points.length} Punkte` + (points.length < 3 ? ' — min. 3 für IDW benötigt' : '') });

    // ── 5. Räumliche Überlappung ──────────────────────────────────────────────
    const inExtent = points.filter(p => p.x >= xllcorner && p.x <= xur && p.y >= yllcorner && p.y <= yur);
    const oPct = points.length > 0 ? inExtent.length / points.length * 100 : 0;
    const oSt  = oPct < 50 ? 'error' : oPct < 80 ? 'warn' : 'ok';
    checks.push({ id: 'overlap', label: 'Räumliche Überlappung', status: oSt,
        detail: `${oPct.toFixed(0)}% der Punkte im DGM-Bereich (${inExtent.length}/${points.length})` +
            (oSt === 'error' ? ' — KBS stimmt möglicherweise nicht überein!' : '') });

    // ── Δ = DGM_Z − Survey_Z, mit Survey-Z für Stratifizierung ──────────────
    // Positives Δ: Laser liegt über der Sohlvermessung
    // (typisch in der Rinne — Laser misst Wasseroberfläche, nicht Sohle)
    const deltaPairs = [];   // [{delta, surveyZ}]
    let nodataCount = 0;
    for (const p of inExtent) {
        const col = Math.round((p.x - xllcorner) / cellsize);
        const row = Math.round((p.y - yllcorner) / cellsize);
        if (col < 0 || col >= ncols || row < 0 || row >= nrows) continue;
        const demZ = gridData[row * ncols + col];
        if (demZ <= -9990) { nodataCount++; continue; }
        deltaPairs.push({ delta: demZ - p.z, surveyZ: p.z });
    }
    const validCovPct = inExtent.length > 0 ? (inExtent.length - nodataCount) / inExtent.length * 100 : 0;

    // ── 6. Abdeckung ─────────────────────────────────────────────────────────
    const covSt = validCovPct < 50 ? 'error' : validCovPct < 80 ? 'warn' : 'ok';
    checks.push({ id: 'coverage', label: 'Abdeckung Messpunkte', status: covSt,
        detail: `${validCovPct.toFixed(0)}% der Punkte auf gültigen DGM-Zellen` +
            (nodataCount > 0 ? ` (${nodataCount} auf NoData)` : '') +
            (covSt === 'error' ? ' — DGM lückenhaft im Messbereich' : '') });

    if (deltaPairs.length >= 10) {
        const deltas = deltaPairs.map(p => p.delta).sort((a, b) => a - b);
        const n = deltas.length;

        function arrMedian(arr) {
            const s = [...arr].sort((a, b) => a - b);
            return s.length % 2 === 0 ? (s[s.length/2-1] + s[s.length/2]) / 2 : s[Math.floor(s.length/2)];
        }

        const median = arrMedian(deltas);
        const mean   = deltas.reduce((s, d) => s + d, 0) / n;
        const p10    = deltas[Math.floor(n * 0.10)];
        const p90    = deltas[Math.floor(n * 0.90)];
        const absDevs = deltas.map(d => Math.abs(d - median)).sort((a, b) => a - b);
        const mad    = absDevs[Math.floor(absDevs.length / 2)];

        // ── Otsu-Schwellwert auf Δ-Verteilung ─────────────────────────────
        // Teilt die Δ-Werte in zwei Cluster (Ufer/Vorland vs. Kanal)
        function otsuThreshold(sorted) {
            const mn = sorted[0], mx = sorted[sorted.length - 1];
            const range = mx - mn;
            if (range < 1e-6) return mn;
            const K = Math.min(200, Math.ceil(sorted.length / 3));
            const hist = new Array(K).fill(0);
            for (const v of sorted) hist[Math.min(K - 1, ((v - mn) / range * K) | 0)]++;
            let sum = 0;
            for (let i = 0; i < K; i++) sum += i * hist[i];
            let sumB = 0, wB = 0, maxVar = 0, tBin = 0;
            for (let i = 0; i < K; i++) {
                wB += hist[i];
                if (!wB || wB === sorted.length) continue;
                sumB += i * hist[i];
                const wF = sorted.length - wB;
                const mB = sumB / wB, mF = (sum - sumB) / wF;
                const v  = wB * wF * (mB - mF) ** 2;
                if (v > maxVar) { maxVar = v; tBin = i; }
            }
            return mn + (tBin + 0.5) / K * range;
        }

        // ── Bimodalitätskoeffizient (BC) ──────────────────────────────────
        // BC = (skew² + 1) / kurtosis  →  BC > 5/9 ≈ 0.555 deutet auf Bimodalität hin
        // Formel nach SAS Institute / Freeman & Dale 2013
        function bimodalityCoeff(arr) {
            const m = arr.reduce((s, v) => s + v, 0) / arr.length;
            let m2 = 0, m3 = 0, m4 = 0;
            for (const v of arr) { const d = v - m; m2 += d*d; m3 += d*d*d; m4 += d*d*d*d; }
            m2 /= arr.length; m3 /= arr.length; m4 /= arr.length;
            const skew = m2 > 0 ? m3 / m2 ** 1.5 : 0;
            const kurt = m2 > 0 ? m4 / m2 ** 2   : 3;   // raw kurtosis (not excess)
            return (skew * skew + 1) / Math.max(0.01, kurt);
        }

        const otsuT  = otsuThreshold(deltas);
        const bc     = bimodalityCoeff(deltas);
        const isBimodal = bc > 0.555;

        const clusterA = deltaPairs.filter(p => p.delta <= otsuT);  // Ufer/Vorland
        const clusterB = deltaPairs.filter(p => p.delta >  otsuT);  // Kanal-Kandidaten
        const medA = clusterA.length ? arrMedian(clusterA.map(p => p.delta)) : null;
        const medB = clusterB.length ? arrMedian(clusterB.map(p => p.delta)) : null;

        // ── Z-stratifizierte Kanal-Signatur (unteres Quartil nach Survey-Z) ─
        // Nur die tiefsten 25% der Messpunkte — diese liegen mit hoher
        // Wahrscheinlichkeit in der Rinne, nicht auf Böschung oder Vorland
        const sortedByZ = [...deltaPairs].sort((a, b) => a.surveyZ - b.surveyZ);
        const q1end     = Math.max(1, Math.ceil(sortedByZ.length * 0.25));
        const q1        = sortedByZ.slice(0, q1end);
        const q1ChanPts = q1.filter(p => p.delta > 0.5).length;
        const q1ChanPct = q1ChanPts / q1.length * 100;
        const q1ZRange  = `${q1[0].surveyZ.toFixed(2)}–${q1[q1.length-1].surveyZ.toFixed(2)}`;

        // ── 7. Median Δ (DGM − Survey) ──────────────────────────────────────
        const sign = median >= 0 ? '+' : '';
        let medSt, medHint;
        if (Math.abs(median) > 5.0) {
            medSt = 'error'; medHint = ' — unplausibel groß, Höhenbezug prüfen';
        } else if (Math.abs(median) > 0.15) {
            medSt = 'warn';
            medHint = median > 0
                ? ' — Laser über Sohle (typisch für Kanalbathymetrie)'
                : ' — Laser unter Sohle (Auflandung oder Datum-Versatz?)';
        } else {
            medSt = 'ok'; medHint = ' — gute Übereinstimmung';
        }
        checks.push({ id: 'deltaMedian', label: 'Median Δ (DGM − Survey)', status: medSt,
            detail: `${sign}${median.toFixed(3)} m  ·  Mittelwert ${mean >= 0 ? '+' : ''}${mean.toFixed(3)} m  ·  P10/P90 [${p10.toFixed(2)} / ${p90.toFixed(2)}]${medHint}` });

        // ── 8. MAD — Offset-Konsistenz ───────────────────────────────────────
        let madSt, madHint;
        if (mad > 2.0) {
            madSt = 'error'; madHint = ' — sehr hohe Streuung, Ausreißer oder falscher Datensatz?';
        } else if (mad > 0.3) {
            madSt = 'warn'; madHint = ' — gemischte Populationen (Ufer- und Kanalpunkte erwartet)';
        } else {
            madSt = 'ok'; madHint = ' — gleichmäßiger Offset, einfache Korrektur möglich';
        }
        checks.push({ id: 'deltaMad', label: 'Streuung des Δ (MAD)', status: madSt,
            detail: `MAD = ${mad.toFixed(3)} m${madHint}` });

        // ── 9. Bimodalität ───────────────────────────────────────────────────
        let biSt, biDetail;
        if (isBimodal && clusterB.length > n * 0.05) {
            biSt = 'warn';
            biDetail = `BC = ${bc.toFixed(3)} — zwei Populationen erkannt · ` +
                `Otsu-Grenze: Δ = ${otsuT.toFixed(2)} m · ` +
                `Gruppe A (Ufer/Vorland): ${clusterA.length} Pkt, Median Δ ${medA >= 0 ? '+' : ''}${medA?.toFixed(3) ?? '?'} m · ` +
                `Gruppe B (Kanal?): ${clusterB.length} Pkt, Median Δ ${medB >= 0 ? '+' : ''}${medB?.toFixed(3) ?? '?'} m`;
        } else {
            biSt = 'ok';
            biDetail = `BC = ${bc.toFixed(3)} — keine klare Bimodalität · ` +
                `Otsu-Grenze: Δ = ${otsuT.toFixed(2)} m · ` +
                (clusterB.length > 0
                    ? `${clusterB.length} Pkt über Grenze (Median Δ ${medB >= 0 ? '+' : ''}${medB?.toFixed(3) ?? '?'} m)`
                    : 'alle Punkte in einer Population');
        }
        checks.push({ id: 'bimodal', label: 'Bimodalität (Otsu)', status: biSt, detail: biDetail });

        // ── 10. Z-stratifizierte Kanal-Signatur ──────────────────────────────
        // Nur das unterste Quartil nach Survey-Z — diese Punkte sind am ehesten Sohlpunkte
        let chSt, chHint;
        if (q1ChanPct >= 30) {
            chSt = 'warn'; chHint = ' — Kanal-Sohlpunkte liegen klar unter dem Laserscan → Flussschlauch-Ansatz empfohlen';
        } else if (q1ChanPct >= 10) {
            chSt = 'warn'; chHint = ' — teilweise Sohle unter Laserscan';
        } else {
            chSt = 'ok'; chHint = ' — auch tiefste Punkte stimmen mit DGM überein (Trockenperiode?)';
        }
        checks.push({ id: 'channelSig', label: 'Kanal-Signatur (Q1 nach Z)', status: chSt,
            detail: `Unteres Quartil (${q1.length} Pkt, Z ${q1ZRange} m NN): ` +
                    `${q1ChanPct.toFixed(0)}% mit Δ > 0.5m${chHint}` });

        const areaKm2 = ncols * cellsize * nrows * cellsize / 1e6;
        const hasErr  = checks.some(c => c.status === 'error');
        const hasWarn = checks.some(c => c.status === 'warn');
        return {
            status: hasErr ? 'error' : hasWarn ? 'warn' : 'ok',
            checks,
            summary: {
                xllcorner, yllcorner, xur, yur, inExtentCount: inExtent.length, areaKm2,
                deltaMedian: median, deltaMean: mean, deltaMAD: mad, deltaP10: p10, deltaP90: p90,
                channelPct: q1ChanPct, validCovPct,
                otsuThreshold: otsuT, bimodalityCoeff: bc, isBimodal,
                clusterA: { n: clusterA.length, median: medA },
                clusterB: { n: clusterB.length, median: medB },
            },
        };
    }

    const areaKm2 = ncols * cellsize * nrows * cellsize / 1e6;
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

// ── Offset-Diagnose ────────────────────────────────────────────────────────
const diagRunning    = ref(false);
const diagError      = ref(null);
const offsetApplied  = ref(false);

/** All overlap points with their Δ, populated by runStage2. */
const pointDeltaData = ref([]); // [{ origIdx, label, x, y, surveyZ, demZ, delta }]

/** Index into pointDeltaData; -1 = use global median */
const selectedRefIdx = ref(-1);

const hideOutliers = ref(true);

/** Sorted copy: smallest |Δ| first, outliers (|Δ| > 2m) always at bottom */
const sortedDeltaData = computed(() => {
    const data = hideOutliers.value
        ? pointDeltaData.value.filter(p => !p.outlier)
        : pointDeltaData.value;
    return [...data].sort((a, b) => {
        if (a.outlier !== b.outlier) return a.outlier ? 1 : -1;
        return Math.abs(a.delta) - Math.abs(b.delta);
    });
});

const outlierCount = computed(() => pointDeltaData.value.filter(p => p.outlier).length);

// When the user picks a point in the 3D viewer, find it in pointDeltaData and select it
watch(() => refPickState.selectedOrigIdx, (origIdx) => {
    if (origIdx < 0) return;
    const found = pointDeltaData.value.findIndex(pt => pt.origIdx === origIdx);
    if (found >= 0) {
        selectedRefIdx.value = origIdx;
    } else {
        // pointDeltaData not yet populated — trigger analysis first then reapply
        // (this branch rarely hit; user normally runs analysis before picking)
        selectedRefIdx.value = origIdx;
    }
});

/** The offset that will actually be applied */
const effectiveOffset = computed(() => {
    if (selectedRefIdx.value >= 0) {
        const pt = pointDeltaData.value[selectedRefIdx.value];
        return pt ? pt.delta : (bathyStore.offsetDiagnosis?.median ?? 0);
    }
    return bathyStore.offsetDiagnosis?.median ?? 0;
});

const fmtOffset = v => (v >= 0 ? '+' : '') + v.toFixed(3);

function deltaClass(v) {
    const a = Math.abs(v);
    return a < 0.05 ? 'val-ok' : a < 0.3 ? 'val-warn' : 'val-err';
}

const offsetInterpretation = computed(() => {
    const a = Math.abs(effectiveOffset.value);
    if (!bathyStore.offsetDiagnosis) return '';
    if (a < 0.05) return 'Kein signifikanter Versatz';
    if (a < 0.3)  return 'Geringer Versatz — Korrektur empfohlen';
    return 'Signifikanter Versatz — KBS / Höhenbezug prüfen!';
});

function runStage2() {
    diagRunning.value    = true;
    diagError.value      = null;
    offsetApplied.value  = false;
    selectedRefIdx.value = -1;
    pointDeltaData.value = [];
    setTimeout(() => {
        try {
            const dem = getTerrain();
            if (!dem) { diagError.value = 'Kein DGM geladen.'; return; }
            const { ncols, nrows, cellsize, xllcorner, yllcorner, gridData } = dem;
            const pts    = bathyStore.surveyPoints;
            const deltas = [];

            for (let i = 0; i < pts.length; i++) {
                const pt  = pts[i];
                // gridData is stored BOTTOM-UP (row 0 = yllcorner) — no flip needed
                const col = Math.floor((pt.x - xllcorner) / cellsize);
                const row = Math.floor((pt.y - yllcorner) / cellsize);
                if (col < 0 || col >= ncols || row < 0 || row >= nrows) continue;
                const demZ = gridData[row * ncols + col];
                if (demZ <= -9000) continue;
                const delta = pt.z - demZ;
                deltas.push(delta);
                pointDeltaData.value.push({
                    origIdx: i,
                    label:   pt.label ?? null,
                    x: pt.x, y: pt.y,
                    surveyZ: pt.z, demZ, delta,
                    outlier: Math.abs(delta) > 2.0,
                });
            }

            if (deltas.length < 3) {
                diagError.value = `Nur ${deltas.length} Überlapp-Punkte — mind. 3 benötigt.`;
                return;
            }
            deltas.sort((a, b) => a - b);
            const n       = deltas.length;
            const median  = n % 2 === 0 ? (deltas[n/2-1] + deltas[n/2]) / 2 : deltas[Math.floor(n/2)];
            const absDevs = deltas.map(d => Math.abs(d - median)).sort((a, b) => a - b);
            const mad     = absDevs[Math.floor(absDevs.length / 2)];
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
    const offset = effectiveOffset.value;
    if (Math.abs(offset) < 1e-6) return;
    bathyStore.setSurveyPoints(
        bathyStore.surveyPoints.map(p => ({ ...p, z: p.z - offset })),
        bathyStore.surveyFileName,
    );
    if (bathyStore.offsetDiagnosis)
        bathyStore.setOffsetDiagnosis({ ...bathyStore.offsetDiagnosis, median: 0 });
    offsetApplied.value = true;
    // Recalculate deltas to reflect the new Z values
    pointDeltaData.value = pointDeltaData.value.map(pt => ({
        ...pt, surveyZ: pt.surveyZ - offset, delta: pt.delta - offset,
    }));
    selectedRefIdx.value = -1;
}

// ── Flusslinie / Flussschlauch ─────────────────────────────────────────────
const hasCommittedLine    = computed(() => bathyStore.channelPolyline.length >= 2);
const hasCommittedPolygon = computed(() => bathyStore.channelPolygon.length >= 3);

// ── Virtual Raster ─────────────────────────────────────────────────────────
const vrRunning        = ref(false);
const vrProgress       = ref(0);
const vrError          = ref(null);
const vrThalwegEnforce = ref(true);
const vrThalwegRadius  = ref(20);

let _vrWorker = null;

// The bathymetry zone in the raster processing store
const BATHY_ZONE_ID = bathyStore.BATHY_ZONE_ID;

const bathyZone = computed(() =>
    rasterStore.zones.find(z => z.id === BATHY_ZONE_ID) ?? null
);

const vrFused = computed(() => bathyZone.value?.status === 'fused');

const vrVisible = computed({
    get: () => bathyZone.value?.visible ?? true,
    set: (v) => rasterStore.setZoneVisible(BATHY_ZONE_ID, v),
});

const vrStats = computed(() => {
    const zone = bathyZone.value;
    if (!zone?.indices?.length) return null;
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < zone.zValues.length; i++) {
        if (zone.zValues[i] < minZ) minZ = zone.zValues[i];
        if (zone.zValues[i] > maxZ) maxZ = zone.zValues[i];
    }
    return { count: zone.indices.length, minZ, maxZ };
});

function runVirtualRaster() {
    const dem = getTerrain();
    if (!dem || !bathyStore.surveyPoints.length) return;

    vrRunning.value  = true;
    vrProgress.value = 0;
    vrError.value    = null;

    rasterStore.addZone({
        id:     BATHY_ZONE_ID,
        type:   ZoneType.BATHYMETRY,
        label:  'Bathymetrie IDW',
        status: 'pending',
    });

    const { gridData, ncols, nrows, cellsize, xllcorner, yllcorner } = dem;
    const pts     = bathyStore.surveyPoints;
    const polyline = bathyStore.channelPolyline;

    const pts_xyz = new Float64Array(pts.length * 3);
    pts.forEach((p, i) => { pts_xyz[i*3] = p.x; pts_xyz[i*3+1] = p.y; pts_xyz[i*3+2] = p.z; });

    const gridDataCopy = bathyBrushSettings.zClamp ? new Float32Array(gridData) : null;

    // Flussschlauch polygon — if drawn, switches worker to polygon-mask mode
    // which guarantees lückenlose Füllung inside the channel area.
    let polygon_xy = null;
    if (hasCommittedPolygon.value) {
        const poly = bathyStore.channelPolygon;
        polygon_xy = new Float64Array(poly.length * 2);
        poly.forEach((p, i) => { polygon_xy[i*2] = p.x; polygon_xy[i*2+1] = p.y; });
    }

    // Polyline is optional — only used for thalweg enforcement when drawn
    const useThalweg = vrThalwegEnforce.value && hasCommittedLine.value;
    let polyline_xy = null;
    if (useThalweg) {
        polyline_xy = new Float64Array(polyline.length * 2);
        polyline.forEach((p, i) => { polyline_xy[i*2] = p.x; polyline_xy[i*2+1] = p.y; });
    }

    if (_vrWorker) { _vrWorker.terminate(); _vrWorker = null; }

    _vrWorker = new Worker(
        new URL('../../workers/virtualRasterWorker.js', import.meta.url),
        { type: 'module' },
    );

    _vrWorker.onmessage = ({ data }) => {
        if (data.type === 'progress') {
            vrProgress.value = data.value;
            return;
        }
        if (data.type === 'done') {
            if (data.indices.length) {
                rasterStore.setZoneResult(BATHY_ZONE_ID, data.indices, data.zValues);
            } else {
                rasterStore.removeZone(BATHY_ZONE_ID);
                vrError.value = 'Keine Zellen berechnet — Suchradius vergrößern oder min. Punkte reduzieren.';
            }
            vrRunning.value = false;
            _vrWorker?.terminate();
            _vrWorker = null;
        }
    };

    _vrWorker.onerror = (e) => {
        vrError.value = e.message;
        vrRunning.value = false;
        _vrWorker?.terminate();
        _vrWorker = null;
    };

    const transferList = [pts_xyz.buffer];
    if (gridDataCopy) transferList.push(gridDataCopy.buffer);
    if (polygon_xy)   transferList.push(polygon_xy.buffer);
    if (polyline_xy)  transferList.push(polyline_xy.buffer);

    _vrWorker.postMessage({
        pts_xyz,
        ncols, nrows, cellsize, xllcorner, yllcorner,
        searchRadius:   bathyBrushSettings.searchRadius,
        power:          bathyBrushSettings.power,
        minPoints:      bathyBrushSettings.minPoints,
        maxPoints:      bathyBrushSettings.maxPoints,
        nugget:         bathyBrushSettings.nugget,
        zClamp:         bathyBrushSettings.zClamp,
        gridData:       gridDataCopy ?? undefined,
        polygon_xy:     polygon_xy   ?? undefined,
        polyline_xy:    polyline_xy  ?? undefined,
        thalwegEnforce: useThalweg,
        thalwegRadius:  vrThalwegRadius.value,
    }, transferList);
}

function fuseVirtualRaster() {
    const zone = bathyZone.value;
    if (!zone?.indices?.length) return;

    const count = rasterStore.fuseZone(BATHY_ZONE_ID);
    if (count > 0) {
        for (let i = 0; i < zone.indices.length; i++) {
            bathyStore.markCell(zone.indices[i]);
        }
        bathyStore.addModifiedCount(count);
    }
}

// ── Auto-Fill ──────────────────────────────────────────────────────────────
const autoFillRunning    = ref(false);
const autoFillNodataOnly = ref(true);
const autoFillProgress   = ref(0);

let _fillWorker = null;

function runAutoFill() {
    const dem = getTerrain();
    if (!dem || !bathyStore.surveyPoints.length) return;

    autoFillRunning.value  = true;
    autoFillProgress.value = 0;

    const { gridData, ncols, nrows, cellsize, xllcorner, yllcorner } = dem;
    const pts = bathyStore.surveyPoints;

    const pts_xyz = new Float64Array(pts.length * 3);
    pts.forEach((p, i) => { pts_xyz[i*3]=p.x; pts_xyz[i*3+1]=p.y; pts_xyz[i*3+2]=p.z; });

    const gridDataCopy = new Float32Array(gridData);

    if (_fillWorker) { _fillWorker.terminate(); _fillWorker = null; }

    _fillWorker = new Worker(
        new URL('../../workers/idwFillWorker.js', import.meta.url),
        { type: 'module' },
    );

    _fillWorker.onmessage = ({ data }) => {
        if (data.type === 'progress') {
            autoFillProgress.value = data.value;
            return;
        }
        if (data.type === 'done') {
            const { indices, zValues } = data;
            for (let i = 0; i < indices.length; i++) {
                gridData[indices[i]] = zValues[i];
                bathyStore.markCell(indices[i]);
            }
            bathyStore.addModifiedCount(indices.length);
            geoStore.notifyTerrainModified();
            autoFillRunning.value  = false;
            autoFillProgress.value = 100;
            _fillWorker.terminate();
            _fillWorker = null;
        }
    };

    _fillWorker.onerror = (e) => {
        console.error('[idwFillWorker]', e.message);
        autoFillRunning.value = false;
        _fillWorker?.terminate();
        _fillWorker = null;
    };

    _fillWorker.postMessage(
        {
            pts_xyz, gridData: gridDataCopy,
            ncols, nrows, cellsize, xllcorner, yllcorner,
            searchRadius: bathyBrushSettings.searchRadius,
            power:        bathyBrushSettings.power,
            minPoints:    bathyBrushSettings.minPoints,
            maxPoints:    bathyBrushSettings.maxPoints,
            nugget:       bathyBrushSettings.nugget,
            zClamp:       bathyBrushSettings.zClamp,
            onlyNoData:   autoFillNodataOnly.value,
        },
        [pts_xyz.buffer, gridDataCopy.buffer],
    );
}

// ── Brush ──────────────────────────────────────────────────────────────────
const brushActive = computed(() => simStore.activeTool === 'BATHY_BRUSH');
function toggleBrush() {
    simStore.setActiveTool(brushActive.value ? null : 'BATHY_BRUSH');
}

// ── Blending ───────────────────────────────────────────────────────────────
const blendRunning  = ref(false);
const blendApplied  = ref(false);
const sigBlendWidth = ref(5);

function runSigmoidBlend() {
    blendRunning.value = true;
    setTimeout(() => {
        try {
            const dem = getTerrain();
            if (!dem) return;
            const { gridData, ncols, nrows, cellsize } = dem;
            const modCells = bathyStore.modifiedCells;
            const passes   = Math.max(1, Math.round(sigBlendWidth.value / cellsize));
            const DIRS     = [[-1,0],[1,0],[0,-1],[0,1]];
            for (let pass = 0; pass < passes; pass++) {
                const snap = gridData.slice();
                for (const idx of modCells) {
                    const row = Math.floor(idx / ncols);
                    const col = idx % ncols;
                    const isBoundary = DIRS.some(([dr, dc]) => {
                        const nr = row + dr, nc = col + dc;
                        if (nr < 0 || nr >= nrows || nc < 0 || nc >= ncols) return false;
                        const ni = nr * ncols + nc;
                        return snap[ni] > -9000 && !modCells.has(ni);
                    });
                    if (!isBoundary) continue;
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
            blendApplied.value = true;
        } finally { blendRunning.value = false; }
    }, 20);
}

// ── Cross-Validation ───────────────────────────────────────────────────────
const crossRunning = ref(false);

function runCrossVal() {
    crossRunning.value = true;
    setTimeout(() => {
        try {
            const pts = bathyStore.surveyPoints;
            if (pts.length < 3) return;
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
                    warning: 'Alle Punkte lagen außerhalb des Suchradius — Suchradius vergrößern.' });
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
</script>

<style scoped>
/* ── Base ─────────────────────────────────────────────────────────────────── */
.modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.65);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 1100;
}
.modal-content {
    background: #2c3e50; color: #ecf0f1;
    width: 640px; max-height: 92vh;
    border-radius: 10px;
    box-shadow: 0 16px 40px rgba(0,0,0,0.6);
    display: flex; flex-direction: column;
    overflow: hidden;
    font-family: 'Segoe UI', sans-serif;
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.modal-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding: 0.9rem 1.2rem; background: #1e2d3d;
    border-bottom: 1px solid #3d5166; flex-shrink: 0;
}
.header-left   { display: flex; gap: 0.65rem; align-items: flex-start; }
.header-icon   { font-size: 1.35rem; margin-top: 2px; }
.modal-header h3 { margin: 0 0 0.1rem; font-size: 0.95rem; color: #fff; }
.header-sub    { margin: 0; font-size: 0.72rem; color: #7f8c8d; }
.close-btn     { background: none; border: none; color: #95a5a6; font-size: 1.5rem; cursor: pointer; line-height: 1; }
.close-btn:hover { color: #fff; }

/* ── Status Bar ───────────────────────────────────────────────────────────── */
.status-bar {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.55rem 1.2rem; background: #233140;
    border-bottom: 1px solid #3d5166; flex-shrink: 0;
}
.status-item {
    display: flex; align-items: center; gap: 0.45rem; flex: 1;
    padding: 0.35rem 0.6rem; border-radius: 5px;
    border: 1px solid #3d5166; background: #2c3e50;
}
.status-item.ok      { border-color: #27ae60; }
.status-item.missing { border-color: #465c71; opacity: 0.6; }
.status-icon               { font-size: 0.85rem; }
.status-item.ok .status-icon    { color: #27ae60; }
.status-item.missing .status-icon { color: #7f8c8d; }
.status-body   { display: flex; flex-direction: column; gap: 0.02rem; min-width: 0; }
.status-label  { font-weight: 600; font-size: 0.74rem; color: #ecf0f1; }
.status-detail { font-size: 0.68rem; color: #95a5a6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status-divider { color: #465c71; font-size: 0.9rem; flex-shrink: 0; }

/* ── Missing hint ─────────────────────────────────────────────────────────── */
.missing-hint {
    margin: 1.1rem; padding: 0.8rem 1rem;
    background: rgba(243,156,18,0.1); border: 1px solid #f39c12;
    border-radius: 6px; color: #f39c12; font-size: 0.83rem; line-height: 1.5;
}

/* ══ PIPELINE ════════════════════════════════════════════════════════════════ */
.pipeline {
    flex: 1; overflow-y: auto;
    padding: 0.7rem 1rem;
    display: flex; flex-direction: column; gap: 0.4rem;
}

/* ── Step card ────────────────────────────────────────────────────────────── */
.step {
    border: 1px solid #3d5166;
    border-radius: 7px;
    overflow: hidden;
    background: #233140;
    transition: border-color 0.15s;
}
.step.step-open {
    border-color: #2980b9;
}

/* ── Step header ──────────────────────────────────────────────────────────── */
.step-header {
    display: flex; align-items: center; gap: 0.7rem;
    padding: 0.6rem 0.85rem;
    cursor: pointer;
    user-select: none;
    transition: background 0.12s;
}
.step-header:hover { background: rgba(255,255,255,0.04); }

.step-badge {
    width: 26px; height: 26px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.75rem; font-weight: 700; flex-shrink: 0;
    border: 2px solid currentColor;
    transition: all 0.15s;
}
.badge-pending { color: #5d7a96; border-color: #3d5166; background: #1e2d3d; }
.badge-running { color: #f39c12; border-color: #f39c12; background: rgba(243,156,18,0.1); }
.badge-ok      { color: #27ae60; border-color: #27ae60; background: rgba(39,174,96,0.12); }
.badge-warn    { color: #f39c12; border-color: #f39c12; background: rgba(243,156,18,0.12); }
.badge-error   { color: #e74c3c; border-color: #e74c3c; background: rgba(231,76,60,0.12); }

.step-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.05rem; }
.step-title   { font-size: 0.84rem; font-weight: 700; color: #ecf0f1; }
.step-summary { font-size: 0.72rem; color: #7f8c8d; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.chevron { color: #5d7a96; flex-shrink: 0; transition: transform 0.2s; }
.chevron.open { transform: rotate(180deg); }

/* ── Step body ────────────────────────────────────────────────────────────── */
.step-body {
    padding: 0 0.85rem 0.85rem;
    display: flex; flex-direction: column; gap: 0.65rem;
    border-top: 1px solid #3d5166;
}

.step-desc {
    font-size: 0.78rem; color: #95a5a6; line-height: 1.5;
    margin-top: 0.65rem; margin-bottom: 0;
}

/* ── Section label (within step body) ────────────────────────────────────── */
.section-label {
    font-size: 0.67rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: #5d7a96;
    border-bottom: 1px solid #3d5166; padding-bottom: 0.25rem;
}

/* ── Step footer ──────────────────────────────────────────────────────────── */
.step-footer {
    display: flex; align-items: center; justify-content: flex-end;
    gap: 0.5rem; padding-top: 0.3rem;
    border-top: 1px solid #3d5166; margin-top: 0.1rem;
}
.btn-next {
    padding: 0.4rem 1rem; border: none; border-radius: 5px;
    background: #2980b9; color: #fff;
    font-weight: 700; font-size: 0.82rem; cursor: pointer;
    transition: background 0.15s;
}
.btn-next:hover:not(:disabled) { background: #3498db; }
.btn-next:disabled { opacity: 0.35; cursor: not-allowed; }
.btn-skip {
    padding: 0.4rem 0.75rem; border: 1px solid #3d5166; border-radius: 5px;
    background: transparent; color: #7f8c8d;
    font-size: 0.8rem; cursor: pointer; transition: all 0.15s;
}
.btn-skip:hover { border-color: #5d7a96; color: #bdc3c7; }

/* ── Buttons ──────────────────────────────────────────────────────────────── */
.btn-run {
    padding: 0.5rem 1.1rem; border: none; border-radius: 6px;
    background: #2980b9; color: #fff;
    font-weight: 700; font-size: 0.85rem; cursor: pointer;
    transition: background 0.2s; align-self: flex-start;
}
.btn-run:hover:not(:disabled) { background: #3498db; }
.btn-run:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-run.btn-run-active { background: #8e44ad; }
.btn-run.btn-run-active:hover { background: #9b59b6; }

.btn-secondary {
    padding: 0.35rem 0.85rem; border: 1px solid #2980b9;
    border-radius: 5px; background: transparent;
    color: #3498db; font-size: 0.78rem; cursor: pointer; white-space: nowrap;
}
.btn-secondary:hover:not(:disabled) { background: rgba(52,152,219,0.15); }
.btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-danger {
    padding: 0.35rem 0.75rem; border: 1px solid #e74c3c;
    border-radius: 5px; background: transparent;
    color: #e74c3c; font-size: 0.78rem; cursor: pointer;
}
.btn-danger:hover { background: rgba(231,76,60,0.1); }

/* ── Row / option areas ───────────────────────────────────────────────────── */
.row-actions    { display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap; }
.val-timestamp  { font-size: 0.71rem; color: #7f8c8d; }
.fill-options   { display: flex; flex-direction: column; gap: 0.35rem; }

/* ── Params grid ──────────────────────────────────────────────────────────── */
.params-grid {
    display: grid; grid-template-columns: 100px 1fr 50px;
    align-items: center; gap: 0.4rem 0.55rem;
    padding: 0.65rem; background: #1e2d3d; border-radius: 5px;
    border: 1px solid #3d5166;
}
.param-label  { font-size: 0.75rem; color: #95a5a6; }
.param-slider { width: 100%; accent-color: #2980b9; }
.param-val    { font-size: 0.72rem; color: #ecf0f1; font-family: monospace; text-align: right; }
.power-btns   { display: flex; gap: 3px; }
.power-btns button {
    flex: 1; padding: 0.12rem 0; border: 1px solid #3d5166;
    border-radius: 3px; background: #2c3e50; color: #7f8c8d;
    font-size: 0.75rem; cursor: pointer;
}
.power-btns button.active { background: #2980b9; color: #fff; border-color: #2980b9; }

/* ── Checkbox ─────────────────────────────────────────────────────────────── */
.checkbox-label {
    display: flex; align-items: center; gap: 0.4rem;
    font-size: 0.78rem; color: #bdc3c7; cursor: pointer; user-select: none;
}
.checkbox-label input[type="checkbox"] { accent-color: #2980b9; cursor: pointer; }

/* ── Progress bar ─────────────────────────────────────────────────────────── */
.progress-bar-wrap {
    height: 4px; background: #1e2d3d; border-radius: 2px; overflow: hidden;
}
.progress-bar {
    height: 100%; background: #2980b9; border-radius: 2px;
    transition: width 0.3s ease;
}

/* ── Polyline status ──────────────────────────────────────────────────────── */
.polyline-status {
    padding: 0.28rem 0.65rem; border-radius: 4px;
    font-size: 0.76rem; font-weight: 600; align-self: flex-start;
}
.pl-ok    { background: rgba(0,229,255,0.1); border: 1px solid #00e5ff; color: #00e5ff; }
.pl-empty { background: rgba(93,122,150,0.12); border: 1px solid #3d5166; color: #7f8c8d; }
.polyline-actions { display: flex; align-items: center; gap: 0.5rem; }

/* ── Pick hint ────────────────────────────────────────────────────────────── */
.pick-hint {
    padding: 0.35rem 0.7rem; border-radius: 4px;
    font-size: 0.76rem; color: #f39c12;
    background: rgba(243,156,18,0.08); border: 1px solid rgba(243,156,18,0.3);
}

/* ── Section label sub-text ───────────────────────────────────────────────── */
.sl-sub { font-weight: 400; text-transform: none; letter-spacing: 0; color: #465c71; margin-left: 0.4rem; }

/* ── Reference point table ────────────────────────────────────────────────── */
.ref-table-wrap {
    max-height: 200px; overflow-y: auto;
    border: 1px solid #3d5166; border-radius: 5px;
    background: #1e2d3d;
}
.ref-table {
    width: 100%; border-collapse: collapse;
    font-size: 0.73rem;
}
.ref-table thead tr {
    background: #233140; position: sticky; top: 0; z-index: 1;
}
.ref-table th {
    padding: 0.3rem 0.55rem; text-align: left;
    color: #7f8c8d; font-weight: 600; font-size: 0.68rem;
    border-bottom: 1px solid #3d5166;
}
.ref-table tbody tr {
    cursor: pointer; transition: background 0.1s;
    border-bottom: 1px solid rgba(61,81,102,0.4);
}
.ref-table tbody tr:last-child { border-bottom: none; }
.ref-table tbody tr:hover { background: rgba(41,128,185,0.1); }
.ref-table tbody tr.row-selected { background: rgba(41,128,185,0.2); }
.ref-table tbody tr.row-outlier  { opacity: 0.55; cursor: default; }
.ref-table tbody tr.row-outlier:hover { background: transparent; }
.ref-table td { padding: 0.28rem 0.55rem; vertical-align: middle; }
.outlier-flag { color: #e67e22; font-size: 0.8rem; }
.val-outlier  { color: #e67e22 !important; font-family: monospace; font-weight: 700; }

.sel-radio {
    display: inline-block; width: 10px; height: 10px;
    border-radius: 50%; border: 2px solid #3d5166;
    background: transparent; transition: all 0.15s;
}
.sel-radio.sel-active { border-color: #2980b9; background: #2980b9; }

.pt-label { color: #ecf0f1; font-weight: 600; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-coord { color: #7f8c8d; font-size: 0.68rem; font-family: monospace; }
.pt-z     { color: #bdc3c7; font-family: monospace; }
.pt-delta { font-family: monospace; font-weight: 700; }

/* ── Outlier bar ──────────────────────────────────────────────────────────── */
.outlier-bar {
    display: flex; align-items: flex-start; gap: 0.5rem;
    background: rgba(230,126,34,0.1); border: 1px solid rgba(230,126,34,0.3);
    border-radius: 5px; padding: 0.45rem 0.7rem; margin-bottom: 0.5rem;
    font-size: 0.74rem; color: #bdc3c7; line-height: 1.4;
}
.ob-icon { color: #e67e22; font-size: 0.85rem; flex-shrink: 0; margin-top: 1px; }
.ob-toggle { margin-left: auto; flex-shrink: 0; display: flex; align-items: center;
    gap: 0.3rem; white-space: nowrap; cursor: pointer; color: #7f8c8d; }

/* ── Offset summary ───────────────────────────────────────────────────────── */
.offset-summary {
    padding: 0.6rem 0.75rem; background: #1e2d3d;
    border: 1px solid #3d5166; border-radius: 5px;
    display: flex; flex-direction: column; gap: 0.2rem;
}
.os-main { display: flex; align-items: center; justify-content: space-between; }
.os-label  { font-size: 0.78rem; color: #95a5a6; }
.os-value  { font-size: 1rem; font-family: monospace; font-weight: 700; }
.os-secondary { font-size: 0.71rem; color: #5d7a96; }
.os-interp    { font-size: 0.73rem; color: #bdc3c7; }

/* ── Mod info ─────────────────────────────────────────────────────────────── */
.mod-info {
    display: flex; align-items: center; gap: 0.45rem;
    font-size: 0.76rem; color: #2ecc71; font-weight: 600;
}
.mod-dot {
    width: 7px; height: 7px; border-radius: 50%; background: #2ecc71; flex-shrink: 0;
}

/* ── Warnings / errors / hints / ok ──────────────────────────────────────── */
.tp-warn {
    padding: 0.5rem 0.8rem;
    background: rgba(243,156,18,0.1); border: 1px solid #f39c12;
    border-radius: 5px; color: #f39c12; font-size: 0.78rem;
}
.tp-error {
    padding: 0.5rem 0.8rem;
    background: rgba(231,76,60,0.1); border: 1px solid #e74c3c;
    border-radius: 5px; color: #e74c3c; font-size: 0.78rem;
}
.tp-hint {
    padding: 0.45rem 0.8rem;
    background: rgba(41,128,185,0.08); border: 1px solid #2980b9;
    border-radius: 5px; color: #7fb3d3; font-size: 0.78rem; line-height: 1.5;
}
.tp-ok {
    padding: 0.4rem 0.8rem;
    background: rgba(39,174,96,0.1); border: 1px solid #27ae60;
    border-radius: 5px; color: #2ecc71; font-size: 0.8rem; font-weight: 600;
}

/* ── Virtual Raster stats card ────────────────────────────────────────────── */
.vr-stats-card {
    display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
    padding: 0.45rem 0.75rem;
    background: rgba(0,212,255,0.06); border: 1px solid rgba(0,212,255,0.25);
    border-radius: 5px;
}
.vrs-count { font-size: 0.8rem; font-weight: 700; color: #00d4ff; }
.vrs-sep   { color: #3d5166; }
.vrs-range { font-size: 0.78rem; color: #95a5a6; font-family: monospace; }
.vrs-toggle {
    display: flex; align-items: center; gap: 0.3rem;
    margin-left: auto; font-size: 0.75rem; color: #bdc3c7;
    cursor: pointer; user-select: none;
}
.vrs-toggle input { accent-color: #00d4ff; cursor: pointer; }

/* ── Fuse button ──────────────────────────────────────────────────────────── */
.btn-fuse {
    background: #1a7a3a !important;
    border-color: #27ae60 !important;
}
.btn-fuse:hover:not(:disabled) { background: #27ae60 !important; }

/* ── Delta summary bar ────────────────────────────────────────────────────── */
.delta-summary {
    display: flex; flex-wrap: wrap; gap: 0; border-bottom: 1px solid #3d5166;
    background: rgba(15,25,35,0.5);
}
.ds-item {
    display: flex; flex-direction: column; align-items: center;
    padding: 0.45rem 0.9rem; gap: 0.1rem; flex: 1; min-width: 80px;
    border-right: 1px solid #2c3e50;
}
.ds-item:last-child { border-right: none; }
.ds-label { font-size: 0.68rem; color: #5d7a96; text-transform: uppercase; letter-spacing: 0.03em; }
.ds-value { font-size: 0.87rem; font-weight: 700; color: #ecf0f1; }
.ds-range  { font-size: 0.76rem; font-weight: 400; color: #7f8c8d; }

/* ── Otsu-Cluster-Karte ───────────────────────────────────────────────────── */
.otsu-card {
    border-top: 1px solid #3d5166;
    background: rgba(243,156,18,0.05);
}
.otsu-header {
    padding: 0.4rem 0.85rem; font-size: 0.74rem; color: #f39c12; font-weight: 600;
    border-bottom: 1px solid #3d5166;
}
.otsu-clusters { display: flex; }
.otsu-cluster {
    flex: 1; display: flex; flex-direction: column; gap: 0.1rem;
    padding: 0.4rem 0.85rem; font-size: 0.73rem;
}
.otsu-a { border-right: 1px solid #2c3e50; background: rgba(52,152,219,0.06); }
.otsu-b { background: rgba(231,76,60,0.06); }
.oc-label { font-weight: 600; color: #bdc3c7; }
.oc-n     { color: #7f8c8d; }
.oc-med   { color: #ecf0f1; font-weight: 600; }

/* ── Report ───────────────────────────────────────────────────────────────── */
.report { border: 1px solid #3d5166; border-radius: 6px; overflow: hidden; }
.report-stale { opacity: 0.65; }
.report-header {
    display: flex; align-items: center; gap: 0.45rem;
    padding: 0.5rem 0.85rem; font-weight: 600; font-size: 0.83rem;
}
.report-header.ok    { background: rgba(39,174,96,0.18);  color: #2ecc71; }
.report-header.warn  { background: rgba(243,156,18,0.18); color: #f39c12; }
.report-header.error { background: rgba(231,76,60,0.18);  color: #e74c3c; }
.check-list { list-style: none; margin: 0; padding: 0; }
.check-item {
    display: flex; align-items: flex-start; gap: 0.55rem;
    padding: 0.4rem 0.85rem; border-bottom: 1px solid #1e2d3d; font-size: 0.76rem;
}
.check-item:last-child { border-bottom: none; }
.check-item.ok    { background: rgba(39,174,96,0.04); }
.check-item.warn  { background: rgba(243,156,18,0.06); }
.check-item.error { background: rgba(231,76,60,0.06); }
.ci-icon { padding-top: 1px; min-width: 11px; }
.check-item.ok    .ci-icon { color: #27ae60; }
.check-item.warn  .ci-icon { color: #f39c12; }
.check-item.error .ci-icon { color: #e74c3c; }
.ci-body    { display: flex; flex-direction: column; gap: 0.03rem; }
.ci-label   { font-weight: 600; color: #ecf0f1; }
.ci-detail  { color: #7f8c8d; font-size: 0.71rem; }

/* ── Result card ──────────────────────────────────────────────────────────── */
.result-card { border: 1px solid #3d5166; border-radius: 6px; overflow: hidden; }
.rc-header {
    padding: 0.5rem 0.85rem; font-weight: 600; font-size: 0.82rem;
}
.rc-header.oc-ok    { background: rgba(39,174,96,0.18);  color: #2ecc71; }
.rc-header.oc-warn  { background: rgba(243,156,18,0.18); color: #f39c12; }
.rc-header.oc-error { background: rgba(231,76,60,0.18);  color: #e74c3c; }
.rc-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    padding: 0.45rem 0.85rem 0.6rem; gap: 0.22rem 1.2rem;
    background: #1e2d3d;
}
.rc-grid span   { font-size: 0.74rem; color: #7f8c8d; align-self: center; }
.rc-grid strong { font-size: 0.76rem; color: #ecf0f1; font-family: monospace; }
.rc-actions {
    display: flex; align-items: center; gap: 0.65rem;
    padding: 0.55rem 0.85rem; background: #1a2634;
    border-top: 1px solid #3d5166;
}
.rc-hint { font-size: 0.69rem; color: #7f8c8d; }
.val-ok   { color: #2ecc71 !important; }
.val-warn { color: #f39c12 !important; }
.val-err  { color: #e74c3c !important; }

/* ── Step 4 Modus-Karte ───────────────────────────────────────────────────── */
.mode-card {
    border-radius: 6px;
    border: 1px solid;
    margin-bottom: 1rem;
    overflow: hidden;
}
.mode-polygon {
    border-color: rgba(249,115,22,0.45);
    background: rgba(249,115,22,0.07);
}
.mode-legacy {
    border-color: rgba(59,130,246,0.4);
    background: rgba(59,130,246,0.06);
}
.mc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.45rem 0.75rem;
}
.mode-polygon .mc-header { background: rgba(249,115,22,0.18); }
.mode-legacy  .mc-header { background: rgba(59,130,246,0.14); }
.mc-badge {
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.02em;
}
.mode-polygon .mc-badge { color: #f97316; }
.mode-legacy  .mc-badge { color: #60a5fa; }
.mc-change {
    font-size: 0.71rem;
    padding: 0.2rem 0.55rem;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-weight: 500;
}
.mode-polygon .mc-change { background: rgba(249,115,22,0.25); color: #fb923c; }
.mode-legacy  .mc-change { background: rgba(59,130,246,0.22); color: #93c5fd; }
.mc-change:hover { filter: brightness(1.2); }
.mc-row {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.28rem 0.75rem;
    border-top: 1px solid rgba(255,255,255,0.04);
    font-size: 0.74rem;
}
.mc-key {
    flex: 0 0 auto;
    min-width: 13rem;
    color: #7f8c8d;
}
.mc-val  { color: #b0c4d8; }
.mc-fallback { color: #4ade80; }
.mc-warn     { color: #f97316; }
</style>
