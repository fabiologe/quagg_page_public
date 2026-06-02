<template>
  <div class="afs63-view">
    <div class="map-section" :class="{ 'export-mode': isExporting }">
      <BaseMap
        ref="mapRef"
        :polygon-styles="mapStyles"
        @update="store.addOrUpdateSurface"
        @delete="store.removeSurface"
        @select="handleSurfaceSelect"
      />
      <Transition name="fade">
        <div v-if="showInstruction" class="map-overlay">
          <p><strong>Anleitung:</strong> Zeichnen Sie Herkunftsflächen mit dem Polygon-Werkzeug (links oben) und ordnen Sie jeder Fläche eine DWA-Flächengruppe zu.</p>
        </div>
      </Transition>
    </div>

    <Teleport to="body">
      <Afs63CalculationAudit v-if="showAuditModal" @close="showAuditModal = false" />
    </Teleport>

    <div class="tools-section">
      <div class="tools-header">
        <div class="title-row">
          <h2>Behandlungsbedarf AFS63</h2>
          <button class="info-btn" @click="showAuditModal = true" title="Berechnungsgrundlage anzeigen">ℹ️</button>
        </div>
        <p class="subtitle">Emissionsnachweis nach DWA-A 102-2</p>
      </div>

      <!-- Behandlungsszenario -->
      <div class="treatment-section">
        <h3>Behandlungsszenario</h3>
        <div class="mode-options">
          <label class="mode-label">
            <input type="radio" value="none" v-model="store.treatmentMode" />
            <span>Ohne Behandlung (Ist-Bilanz)</span>
          </label>
          <label class="mode-label">
            <input type="radio" value="decentral" v-model="store.treatmentMode" />
            <span>Dezentral (Wirkungsgrad je Fläche)</span>
          </label>
          <label class="mode-label">
            <input type="radio" value="central" v-model="store.treatmentMode" />
            <span>Zentral (Gesamtwirkungsgrad)</span>
          </label>
        </div>
        <div v-if="store.treatmentMode === 'central'" class="input-group central-eff">
          <label>η<sub>ges</sub> (%) – Wirkungsgrad zentrale Anlage</label>
          <input type="number" min="0" max="100" v-model.number="store.centralEfficiency" placeholder="0" />
        </div>
      </div>

      <!-- Flächenliste -->
      <div class="surfaces-list">
        <h3>Erfasste Flächen</h3>
        <div v-if="store.surfaces.length === 0" class="empty-hint">
          <p>Keine Flächen vorhanden.</p>
          <small>Nutzen Sie das Polygon-Werkzeug links oben.</small>
        </div>

        <div
          v-for="s in store.surfaceLoads"
          :key="s.id"
          class="surface-card"
          :class="{ 'selected': selectedSurfaceId === s.id }"
          :style="{ borderLeftColor: s.color }"
          :ref="el => { if (el) surfaceRefs[s.id] = el }"
        >
          <div class="surface-header">
            <input v-model="surfaceById[s.id].name" class="name-input" placeholder="Name..." />
            <span class="area-badge" :title="`${fmt(s.area, 0)} m²`">{{ fmt(s.areaHa, 3) }} ha</span>
          </div>

          <!-- Sonderfall Außerortsstraße (REwS, Tabelle 7) -->
          <label class="rural-toggle">
            <input type="checkbox" v-model="surfaceById[s.id].isRuralRoad" />
            <span>Außerortsstraße (REwS, Tabelle 7)</span>
          </label>

          <div v-if="!s.isRuralRoad" class="surface-type">
            <label>Flächengruppe (Tabelle A.1):</label>
            <SurfaceGroupSelector
              v-model="surfaceById[s.id].groupId"
              :options="store.surfaceGroups"
            />
          </div>

          <div v-else class="input-group dtv-input">
            <label>DTV (Kfz/24 h) – bestimmt Kategorie &amp; Fracht</label>
            <input type="number" min="0" step="100" v-model.number="surfaceById[s.id].dtv" placeholder="0" />
          </div>

          <div class="surface-meta">
            <span class="cat-chip" :style="{ backgroundColor: s.color }">Kat. {{ s.category }}</span>
            <span class="meta-val" :title="s.source">
              {{ s.specificLoad }} kg/(ha·a)<sup v-if="s.footnote" class="fn" :title="s.footnoteText">{{ s.footnote }}</sup>
            </span>
            <span class="meta-val strong" title="Stoffabtrag BR,a,i (Gl. 3)">{{ fmt(s.load, 1) }} kg/a</span>
          </div>

          <div v-if="store.treatmentMode === 'decentral'" class="input-group eff-input">
            <label>η<sub>i</sub> (%) – Wirkungsgrad</label>
            <input type="number" min="0" max="100" v-model.number="surfaceById[s.id].treatmentEfficiency" placeholder="0" />
          </div>
        </div>
      </div>

      <!-- Ergebnisblock -->
      <div class="calculation-box">
        <div class="result-grid">
          <div class="res-item">
            <span class="label">Gesamtfläche A<sub>b,a</sub></span>
            <span class="value" :title="`${fmt(store.totalArea, 0)} m²`">{{ fmt(store.totalAreaHa, 3) }} ha</span>
          </div>
          <div class="res-item">
            <span class="label">Stoffabtrag B<sub>R,a</sub> <small>(Gl. 4)</small></span>
            <span class="value">{{ fmt(store.totalLoad, 0) }} kg/a</span>
          </div>
        </div>

        <div class="divider"></div>

        <div class="result-row">
          <span>Spez. Stoffabtrag b<sub>R,a</sub> <small>(Gl. 5)</small>:</span>
          <strong>{{ fmt(store.specificLoad, 1) }} kg/(ha·a)</strong>
        </div>
        <div class="result-row secondary">
          <span>Zulässig b<sub>R,e,zul</sub>:</span>
          <strong>{{ store.allowedSpecificLoad }} kg/(ha·a)</strong>
        </div>

        <!-- Ampel Behandlungsbedarf (gebietsbezogen, Gl. 6) -->
        <div class="verdict" :class="store.treatmentRequired ? 'bad' : 'good'">
          <template v-if="store.treatmentRequired">
            <div>⚠️ Behandlung erforderlich</div>
            <small>Gebiet gesamt: η<sub>erf</sub> ≈ {{ fmt(store.requiredEfficiency, 0) }} %</small>
          </template>
          <template v-else>
            ✓ Keine Behandlung erforderlich
          </template>
        </div>

        <!-- Anlagenvorschläge je behandlungsbedürftiger Kategorie (inkl. ηerf je Kategorie) -->
        <div v-if="store.treatmentSuggestions.length" class="suggestions">
          <div class="suggestions-title">Empfohlene Behandlungsanlagen</div>
          <div v-for="grp in store.treatmentSuggestions" :key="grp.category + '-' + grp.specificLoad" class="sugg-group">
            <div class="sugg-head">
              <span>Kat. {{ grp.category }} ({{ grp.specificLoad }} kg/(ha·a)){{ grp.isRuralRoad ? ' · REwS' : '' }}</span>
              <span class="sugg-req">η<sub>erf</sub> ≥ {{ fmt(grp.requiredEfficiency, 0) }} %</span>
            </div>
            <div v-for="f in grp.facilities" :key="f.id" class="sugg-row" :class="f.status">
              <span class="sugg-status" :title="statusLabel(f.status)">{{ statusIcon(f.status) }}</span>
              <span class="sugg-name">{{ f.name }}<span v-if="f.note" class="sugg-note"> ({{ f.note }})</span></span>
              <span class="sugg-eff">{{ f.achievable }} %<span v-if="f.retention" class="sugg-ret" title="mit Rückhaltung">⛁</span></span>
            </div>
          </div>
        </div>

        <!-- Anlagenbemessung Regenklärbecken (Stufe 2, DWA-A 102-2 Abschn. 6.2) – ausklappbar -->
        <div v-if="store.dimensioningResult" class="dimensioning">
          <button class="dim-toggle" @click="store.dimensioning.enabled = !store.dimensioning.enabled">
            🛠️ Anlagenbemessung (Regenklärbecken) {{ store.dimensioning.enabled ? '▾' : '▸' }}
          </button>

          <div v-if="store.dimensioning.enabled" class="dim-body">
            <!-- Eingaben -->
            <div class="dim-inputs">
              <label class="dim-field">
                <span>Becken­überlauf a<sub>BÜ</sub></span>
                <input type="number" min="0" max="0.5" step="0.05" v-model.number="store.dimensioning.overflowFraction" />
              </label>
              <label class="dim-field">
                <span>r<sub>krit</sub> [l/(s·ha)]</span>
                <input type="number" min="1" step="0.5" v-model.number="store.dimensioning.rkrit" />
              </label>
              <label class="dim-field">
                <span>Q<sub>F</sub> [l/s]</span>
                <input type="number" min="0" step="1" v-model.number="store.dimensioning.foreignWater" />
              </label>
              <label class="dim-field">
                <span>f<sub>D</sub></span>
                <input type="number" min="0" max="1" step="0.05" v-model.number="store.dimensioning.fD" />
              </label>
              <label class="dim-field">
                <span>Becken­tiefe h<sub>RKB</sub> [m]</span>
                <input type="number" min="2" step="0.1" v-model.number="store.dimensioning.basinDepth" />
              </label>
            </div>

            <!-- Ergebnis -->
            <template v-if="store.dimensioningResult.feasible">
              <div class="dim-row"><span>Erf. Gesamtwirkungsgrad η<sub>ges</sub></span><strong>{{ fmt(store.dimensioningResult.etaGes * 100, 1) }} %</strong></div>
              <div class="dim-row"><span>Oberflächenbeschickung q<sub>A,Bem</sub> <small>(Bild 4)</small></span><strong>{{ fmt(store.dimensioningResult.qABem, 2) }} m/h</strong></div>
              <div class="dim-row"><span>Bemessungszufluss Q<sub>Bem,Tr</sub></span><strong>{{ fmt(store.dimensioningResult.qBemTr, 1) }} l/s</strong></div>
              <div class="dim-row highlight"><span>Beckenoberfläche A<sub>RKB</sub> <small>(Gl. 10)</small></span><strong>{{ fmt(store.dimensioningResult.aRKB, 1) }} m²</strong></div>
              <div class="dim-row highlight"><span>Beckenvolumen V<sub>RKB</sub> <small>(Gl. 11)</small></span><strong>{{ fmt(store.dimensioningResult.vRKB, 0) }} m³</strong></div>
              <div class="dim-row"><span>spez. Volumen</span><strong>{{ fmt(store.dimensioningResult.specificVolume, 1) }} m³/ha</strong></div>
              <div class="dim-row"><span>Abmessungen L×B <small>(DWA-A 166)</small></span><strong>{{ fmt(store.dimensioningResult.length, 1) }} × {{ fmt(store.dimensioningResult.width, 1) }} m</strong></div>

              <div v-if="store.dimensioning.facility === 'schraegklaerer' && store.dimensioningResult.lamella" class="dim-row">
                <span>Schrägklärer A<sub>eff</sub> <small>(Gl. 12)</small></span>
                <strong>{{ fmt(store.dimensioningResult.lamella.aEff, 1) }} m²</strong>
              </div>
              <label class="dim-field dim-facility">
                <span>Bauart</span>
                <select v-model="store.dimensioning.facility">
                  <option value="rkb">Regenklärbecken</option>
                  <option value="schraegklaerer">+ Schrägklärer (A_eff)</option>
                </select>
              </label>
              <label v-if="store.dimensioning.facility === 'schraegklaerer'" class="dim-field">
                <span>q<sub>A,max</sub> [m/h]</span>
                <input type="number" min="1" step="0.5" v-model.number="store.dimensioning.qAmax" />
              </label>
            </template>

            <div v-else class="dim-infeasible">
              ⚠️ η<sub>ges</sub> zu hoch — ein Regenklärbecken ist nicht wirtschaftlich darstellbar
              (q<sub>A,Bem</sub> ≤ 0). Retentionsbodenfilter nach DWA-A 178 erforderlich.
            </div>
          </div>
        </div>

        <!-- Fußnoten-Legende (REwS, Tabelle 7) – onclick ausklappbar -->
        <div v-if="activeFootnotes.length" class="footnotes">
          <div v-for="fn in activeFootnotes" :key="fn.marker" class="footnote">
            <button class="fn-toggle" @click="toggleFootnote(fn.marker)">
              <sup>{{ fn.marker }}</sup> Fußnote (REwS, Tab. 7) {{ expandedFootnotes[fn.marker] ? '▾' : '▸' }}
            </button>
            <p v-if="expandedFootnotes[fn.marker]" class="fn-text">{{ fn.text }}</p>
          </div>
        </div>

        <!-- Reststofffracht nach Behandlung -->
        <div v-if="store.treatmentMode !== 'none'" class="residual">
          <div class="result-row secondary">
            <span>Reststofffracht B<sub>R,e</sub> <small>({{ store.treatmentMode === 'central' ? 'Gl. 8' : 'Gl. 7' }})</small>:</span>
            <strong>{{ fmt(store.residualLoad, 0) }} kg/a</strong>
          </div>
          <div class="result-row secondary">
            <span>Spez. Reststoffaustrag:</span>
            <strong :style="{ color: store.residualWithinLimit ? '#2ecc71' : '#e74c3c' }">
              {{ fmt(store.residualSpecificLoad, 1) }} kg/(ha·a)
            </strong>
          </div>
        </div>

        <div class="export-actions">
          <BaseButton variant="secondary" class="export-btn" @click="exportCalculation">
            📄 Bericht
          </BaseButton>
          <BaseButton variant="primary" class="export-btn" @click="exportMap">
            🗺️ Lageplan
          </BaseButton>
          <BaseButton variant="secondary" class="export-btn" @click="exportGeoJSON">
            💾 GeoJSON
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, nextTick } from 'vue'
import BaseMap from '@/components/base/BaseMap.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import SurfaceGroupSelector from '../components/SurfaceGroupSelector.vue'
import Afs63CalculationAudit from '../components/Afs63CalculationAudit.vue'
import { useAfs63Store } from '../stores/useAfs63Store'
import { Afs63ReportService } from '../services/Afs63ReportService'

const store = useAfs63Store()

// Deutsche Zahlenformatierung (Komma-Dezimal, Tausenderpunkt) statt JS-Default.
function fmt(value, dec = 0) {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(value ?? 0)
}

const showInstruction = ref(true)
const showAuditModal = ref(false)
const isExporting = ref(false)
const mapRef = ref(null)
const selectedSurfaceId = ref(null)
const surfaceRefs = ref({})

// Schneller Zugriff auf die editierbaren Roh-Flächen (surfaceLoads ist read-only abgeleitet).
const surfaceById = computed(() => {
  const map = {}
  store.surfaces.forEach(s => { map[s.id] = s })
  return map
})

function handleSurfaceSelect(id) {
  selectedSurfaceId.value = id
  const el = surfaceRefs.value[id]
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

onMounted(() => {
  setTimeout(() => { showInstruction.value = false }, 10000)
})

const mapStyles = computed(() => {
  return store.surfaceLoads.map(s => ({ id: s.id, color: s.color }))
})

// Aktive Fußnoten (REwS, Tabelle 7), abgeleitet aus den erfassten Außerortsstraßen.
const activeFootnotes = computed(() => {
  const seen = new Map()
  store.surfaceLoads.forEach(s => {
    if (s.footnote && s.footnoteText && !seen.has(s.footnote)) {
      seen.set(s.footnote, { marker: s.footnote, text: s.footnoteText })
    }
  })
  return Array.from(seen.values())
})

// Onclick-ausklappbare Fußnoten (sparen Platz im Ergebnisblock).
const expandedFootnotes = ref({})
function toggleFootnote(marker) {
  expandedFootnotes.value = { ...expandedFootnotes.value, [marker]: !expandedFootnotes.value[marker] }
}

// Statusdarstellung der Anlagenvorschläge.
function statusIcon(status) {
  return status === 'geeignet' ? '✓' : status === 'grenzwertig' ? '≈' : '✗'
}
function statusLabel(status) {
  return status === 'geeignet' ? 'erreicht den erforderlichen Wirkungsgrad'
    : status === 'grenzwertig' ? 'grenzwertig (knapp unter ηerf)'
    : 'unzureichend für ηerf'
}

function exportCalculation() {
  Afs63ReportService.generateCalculationPdf(store)
}

async function exportMap() {
  isExporting.value = true
  await nextTick()
  const map = mapRef.value?.getMap()
  const editableLayers = mapRef.value?.getEditableLayers()
  if (map && editableLayers) {
    const bounds = editableLayers.getBounds()
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }
  setTimeout(async () => {
    const mapEl = document.querySelector('.map-section')
    await Afs63ReportService.generateMapPdf(mapEl)
    isExporting.value = false
  }, 1000)
}

function exportGeoJSON() {
  const editableLayers = mapRef.value?.getEditableLayers()
  if (!editableLayers) return
  const geoJSON = editableLayers.toGeoJSON()
  geoJSON.features = geoJSON.features.map(feature => {
    const s = store.surfaceLoads.find(x => x.id === feature.id)
    if (s) {
      feature.properties = {
        ...feature.properties,
        name: s.name,
        groupId: s.groupId,
        groupName: s.groupName,
        isRuralRoad: s.isRuralRoad,
        dtv: s.dtv,
        source: s.source,
        category: s.category,
        specificLoad: s.specificLoad,
        areaHa: s.areaHa,
        load: s.load
      }
    }
    return feature
  })
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(geoJSON, null, 2))
  const downloadAnchorNode = document.createElement('a')
  downloadAnchorNode.setAttribute('href', dataStr)
  downloadAnchorNode.setAttribute('download', 'afs63_flaechen.geojson')
  document.body.appendChild(downloadAnchorNode)
  downloadAnchorNode.click()
  downloadAnchorNode.remove()
}
</script>

<style scoped>
.afs63-view {
  display: grid;
  grid-template-columns: 65% 35%;
  height: calc(100vh - 64px);
  overflow: hidden;
}

.export-mode :deep(.map-overlay),
.export-mode :deep(.search-overlay),
.export-mode :deep(.leaflet-control-container) {
  display: none !important;
}

.map-section {
  position: relative;
  height: 100%;
}

.tools-section {
  padding: 1.5rem;
  background: #f8f9fa;
  border-left: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
}

.tools-header h2 { margin: 0; color: #2c3e50; font-size: 1.5rem; }
.title-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
.info-btn { background: none; border: none; font-size: 1.2rem; cursor: pointer; padding: 0; opacity: 0.7; transition: transform 0.2s, opacity 0.2s; }
.info-btn:hover { transform: scale(1.1); opacity: 1; }
.subtitle { color: #7f8c8d; margin: 0 0 1.5rem 0; font-size: 0.9rem; }

.treatment-section {
  background: white; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}
.treatment-section h3 { margin: 0 0 0.75rem 0; font-size: 1rem; color: #2c3e50; }
.mode-options { display: flex; flex-direction: column; gap: 0.5rem; }
.mode-label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.9rem; color: #34495e; }
.central-eff { margin-top: 0.75rem; }

.input-group { display: flex; flex-direction: column; }
.input-group label { font-size: 0.8rem; color: #7f8c8d; margin-bottom: 0.25rem; }
.input-group input { padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; }

.surfaces-list { margin-bottom: 1rem; }
.surfaces-list h3 { margin: 0 0 1rem 0; font-size: 1rem; color: #2c3e50; }
.empty-hint { text-align: center; color: #95a5a6; padding: 2rem; border: 2px dashed #e0e0e0; border-radius: 8px; }

.surface-card {
  background: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05); border-left: 4px solid transparent;
}
.surface-card.selected { background-color: #fdf2f2; }
.surface-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
.name-input { border: none; font-weight: bold; width: 60%; background: transparent; }
.name-input:focus { outline: none; border-bottom: 2px solid #3498db; }
.area-badge { background: #e1f0fa; color: #2980b9; padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.85rem; font-weight: 600; }
.surface-type label { font-size: 0.8rem; color: #7f8c8d; display: block; margin-bottom: 0.25rem; }
.rural-toggle { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: #34495e; cursor: pointer; margin-bottom: 0.6rem; }
.dtv-input { margin-bottom: 0.2rem; }
.fn { color: #e67e22; font-weight: 700; cursor: help; margin-left: 1px; }

.surface-meta { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.6rem; flex-wrap: wrap; }
.cat-chip { color: white; font-weight: 700; border-radius: 4px; padding: 2px 8px; font-size: 0.75rem; }
.meta-val { font-size: 0.8rem; color: #7f8c8d; }
.meta-val.strong { font-weight: 700; color: #2c3e50; margin-left: auto; }
.eff-input { margin-top: 0.75rem; }

.calculation-box {
  background: #2c3e50; color: white; padding: 1.5rem; border-radius: 12px;
  box-shadow: 0 -4px 15px rgba(0,0,0,0.1); margin-top: auto;
}
.result-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
.res-item { display: flex; flex-direction: column; }
.res-item .label { font-size: 0.75rem; opacity: 0.7; margin-bottom: 0.2rem; }
.res-item .value { font-size: 1.1rem; font-weight: bold; }
.divider { height: 1px; background: rgba(255,255,255,0.2); margin: 0.5rem 0 1rem 0; }
.result-row { display: flex; justify-content: space-between; align-items: center; font-size: 1rem; margin-bottom: 0.5rem; color: white; }
.result-row small { opacity: 0.6; font-size: 0.7rem; }
.result-row.secondary { font-size: 0.9rem; opacity: 0.9; }

.verdict { margin: 0.75rem 0; padding: 0.6rem 0.8rem; border-radius: 6px; font-weight: 600; font-size: 0.95rem; text-align: center; }
.verdict small { display: block; font-weight: 400; font-size: 0.78rem; opacity: 0.85; margin-top: 0.2rem; }
.verdict.bad { background: rgba(231, 76, 60, 0.2); color: #ff8a80; border: 1px solid rgba(231,76,60,0.4); }
.verdict.good { background: rgba(46, 204, 113, 0.2); color: #a5f0c4; border: 1px solid rgba(46,204,113,0.4); }

.residual { border-top: 1px dashed rgba(255,255,255,0.2); padding-top: 0.5rem; margin-top: 0.5rem; }

.suggestions { margin-top: 0.75rem; padding-top: 0.6rem; border-top: 1px solid rgba(255,255,255,0.15); }
.suggestions-title { font-size: 0.78rem; opacity: 0.75; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.03em; }
.sugg-group { margin-bottom: 0.6rem; }
.sugg-head { display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; font-weight: 600; margin-bottom: 0.3rem; }
.sugg-req { font-size: 0.72rem; opacity: 0.7; font-weight: 400; }
.sugg-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; padding: 0.2rem 0; opacity: 0.92; }
.sugg-row.unzureichend { opacity: 0.5; }
.sugg-status { width: 1.1em; text-align: center; font-weight: 700; }
.sugg-row.geeignet .sugg-status { color: #2ecc71; }
.sugg-row.grenzwertig .sugg-status { color: #f1c40f; }
.sugg-row.unzureichend .sugg-status { color: #e74c3c; }
.sugg-name { flex: 1; }
.sugg-note { opacity: 0.6; font-size: 0.72rem; }
.sugg-eff { font-weight: 700; white-space: nowrap; }
.sugg-ret { margin-left: 3px; opacity: 0.7; }

.dimensioning { margin-top: 0.75rem; padding-top: 0.6rem; border-top: 1px solid rgba(255,255,255,0.15); }
.dim-toggle { background: none; border: none; color: inherit; cursor: pointer; font-size: 0.82rem; font-weight: 600; padding: 0; opacity: 0.9; }
.dim-toggle:hover { opacity: 1; }
.dim-body { margin-top: 0.6rem; }
.dim-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem 0.6rem; margin-bottom: 0.6rem; }
.dim-field { display: flex; flex-direction: column; font-size: 0.72rem; opacity: 0.85; }
.dim-field span { margin-bottom: 0.15rem; }
.dim-field input, .dim-field select { padding: 0.3rem; border: 1px solid rgba(255,255,255,0.25); border-radius: 4px; background: rgba(255,255,255,0.08); color: white; font-size: 0.8rem; }
.dim-facility { grid-column: 1 / -1; }
.dim-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; padding: 0.2rem 0; }
.dim-row small { opacity: 0.6; font-size: 0.7rem; }
.dim-row.highlight strong { color: #5dade2; }
.dim-infeasible { background: rgba(231,76,60,0.2); border: 1px solid rgba(231,76,60,0.4); color: #ff8a80; border-radius: 6px; padding: 0.6rem 0.8rem; font-size: 0.82rem; }

.footnotes { margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.15); }
.footnote { margin-bottom: 0.3rem; }
.fn-toggle { background: none; border: none; color: inherit; opacity: 0.7; cursor: pointer; font-size: 0.7rem; padding: 0; text-align: left; }
.fn-toggle:hover { opacity: 1; }
.fn-toggle sup { color: #f39c12; font-weight: 700; margin-right: 2px; }
.fn-text { font-size: 0.68rem; opacity: 0.7; line-height: 1.45; margin: 0.3rem 0 0 0; }

.export-actions { display: flex; gap: 0.5rem; margin-top: 1.5rem; }
.export-btn { flex: 1; font-size: 0.8rem !important; padding: 0.5rem !important; }

.map-overlay {
  position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.95); padding: 0.75rem 1.5rem; border-radius: 50px;
  font-size: 0.9rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); pointer-events: none; z-index: 1000;
  max-width: 80%; text-align: center;
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.5s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 768px) {
  .afs63-view { display: flex; flex-direction: column; height: auto; overflow: visible; }
  .map-section { height: 400px; }
  .tools-section { height: auto; overflow: visible; border-left: none; border-top: 1px solid #e0e0e0; }
  .export-actions { flex-direction: column; }
}
</style>
