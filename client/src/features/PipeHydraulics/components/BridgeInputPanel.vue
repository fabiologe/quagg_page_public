<template>
  <div class="bridge-input-panel">

    <!-- Hydraulik -->
    <div class="param-group">
      <h4 class="group-title">Hydraulik</h4>
      <div class="param-grid">
        <label>Sohlgefälle I</label>
        <div class="input-row">
          <input type="number"
            :value="(store.slope * 1000).toFixed(3)"
            @input="store.slope = +$event.target.value / 1000; store.save()"
            min="0.001" step="0.1" />
          <span class="unit">‰</span>
        </div>
      </div>
    </div>

    <!-- Wasserspiegel -->
    <div class="param-group wsp-group">
      <h4 class="group-title">Wasserspiegel (WSP)</h4>
      <div class="wsp-row">
        <input type="range"
          :value="store.wsp"
          :min="wspSliderMin"
          :max="wspSliderMax"
          step="0.05"
          @input="store.wsp = +$event.target.value; store.save()"
          class="wsp-slider" />
        <span class="wsp-val">{{ store.wsp.toFixed(2) }} m</span>
      </div>
      <div class="wsp-badges">
        <span :class="['badge', store.currentResult.isSubmerged ? 'badge-warn' : 'badge-ok']">
          {{ store.currentResult.isSubmerged ? 'Druckabfluss' : 'Freispiegel' }}
        </span>
        <span v-if="store.currentResult.hasOverflow" class="badge badge-blue">
          Überströmung aktiv
        </span>
        <span v-if="!store.currentResult.hasBridge" class="badge badge-gray">
          Kein Brücken-Profil
        </span>
      </div>
      <div class="rating-range">
        <span class="small-label">Ratingkurve</span>
        <input type="number" v-model.number="store.wspMin" step="0.5" min="0" @change="store.save()" />
        <span>bis</span>
        <input type="number" v-model.number="store.wspMax" step="0.5" @change="store.save()" />
        <span>m</span>
      </div>
    </div>

    <!-- kSt-Zonen -->
    <div class="param-group kst-group">
      <div class="group-header">
        <h4 class="group-title">kSt-Zonen (Composite Manning)</h4>
        <button class="add-btn" @click="store.addKstZone()" title="Neue Zone hinzufügen">+ Zone</button>
      </div>

      <div class="kst-zones-list">
        <div class="kst-zone-row" v-for="zone in store.kstZones" :key="zone.id">
          <span class="zone-color-dot" :style="{ background: zone.color }"></span>

          <input class="zone-label-inp" type="text" :value="zone.label"
            @input="store.updateKstZone(zone.id, { label: $event.target.value })"
            placeholder="Bezeichnung" />

          <div class="zone-range">
            <input type="number" :value="zone.xLeft == null ? '' : zone.xLeft"
              @input="store.updateKstZone(zone.id, { xLeft: $event.target.value === '' ? null : +$event.target.value })"
              placeholder="−∞" step="1" class="range-inp" />
            <span class="range-sep">–</span>
            <input type="number" :value="zone.xRight == null ? '' : zone.xRight"
              @input="store.updateKstZone(zone.id, { xRight: $event.target.value === '' ? null : +$event.target.value })"
              placeholder="+∞" step="1" class="range-inp" />
            <span class="unit-sm">m</span>
          </div>

          <div class="kst-inp-row">
            <span class="unit-sm">kSt</span>
            <input type="number" :value="zone.kst"
              @input="store.updateKstZone(zone.id, { kst: +$event.target.value })"
              min="1" max="120" step="1" class="kst-inp" />
          </div>

          <button class="remove-btn" @click="store.removeKstZone(zone.id)"
            :disabled="store.kstZones.length <= 1" title="Zone entfernen">×</button>
        </div>
      </div>

      <p class="hint-small">
        Leer = ±∞ · Mehrere Zonen: Letzte Übereinstimmung gilt · Empfehlungen:
        Betongerinne 70–85 · Naturgerinne 25–40 · Vorland/Brückendeck 20–30
      </p>
    </div>

    <!-- Import -->
    <div class="param-group import-group">
      <div class="group-header">
        <h4 class="group-title">Import</h4>
        <div class="import-btns">
          <button class="import-btn" @click="showImportModal = true" title="Punkte als Tabelle eingeben">
            Tabelle
          </button>
          <label class="import-btn" title="GeoJSON-Datei importieren">
            GeoJSON
            <input type="file" accept=".geojson,.json" @change="onFileImport" hidden />
          </label>
        </div>
      </div>

      <div v-if="importStatus" :class="['import-status', importStatus.ok ? 'ok' : 'err']">
        {{ importStatus.msg }}
      </div>

      <details class="format-info">
        <summary>Unterstützte Formate</summary>
        <pre class="format-pre">{{ GEOJSON_EXAMPLE }}</pre>
      </details>

      <div class="import-actions">
        <button class="tool-btn" @click="store.resetToDefault()">Zurücksetzen</button>
      </div>
    </div>

    <BridgeImportModal v-if="showImportModal" @close="showImportModal = false" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useBridgeStore } from '../stores/useBridgeStore.js'
import { parseGeoJSON, readFileAsText } from '../composables/useCrossSectionImporter.js'
import BridgeImportModal from './BridgeImportModal.vue'

const store = useBridgeStore()
const importStatus = ref(null)
const showImportModal = ref(false)

const wspSliderMin = computed(() => store.wspMin)
const wspSliderMax = computed(() => store.wspMax)

async function onFileImport(e) {
  const file = e.target.files?.[0]
  if (!file) return
  e.target.value = ''  // reset so same file can be re-imported

  try {
    const text = await readFileAsText(file)
    const result = parseGeoJSON(text)

    let assigned = 0
    if (result.terrain) { store.setLayer('terrain', result.terrain); assigned++ }
    if (result.buk)     { store.setLayer('buk', result.buk);         assigned++ }
    if (result.bok)     { store.setLayer('bok', result.bok);         assigned++ }
    if (result.kstZones) {
      store.kstZones.splice(0, store.kstZones.length, ...result.kstZones)
      store.save()
      assigned++
    }

    if (assigned > 0) {
      const msgs = []
      if (result.terrain) msgs.push(`Gelände (${result.terrain.length} Pkt.)`)
      if (result.buk)     msgs.push(`BUK (${result.buk.length} Pkt.)`)
      if (result.bok)     msgs.push(`BOK (${result.bok.length} Pkt.)`)
      importStatus.value = { ok: true, msg: `Importiert: ${msgs.join(', ')}` }
    } else {
      importStatus.value = { ok: false, msg: `Kein erkannter Layer. ${result.errors.join(' ')}` }
    }

    if (result.errors.length) {
      importStatus.value.msg += ` — ${result.errors.join('; ')}`
    }
  } catch (err) {
    importStatus.value = { ok: false, msg: `Fehler: ${err.message}` }
  }

  setTimeout(() => { importStatus.value = null }, 8000)
}

const GEOJSON_EXAMPLE = `// FeatureCollection mit Layern:
{ "type": "FeatureCollection", "features": [
  { "type": "Feature",
    "properties": { "layer": "terrain" },
    "geometry": { "type": "LineString",
      "coordinates": [[-15,5],[-5,0],[5,0],[15,5]] }},
  { "type": "Feature",
    "properties": { "layer": "buk" },
    "geometry": { "type": "LineString",
      "coordinates": [[-10,5],[10,5]] }},
  { "type": "Feature",
    "properties": { "layer": "bok" },
    "geometry": { "type": "LineString",
      "coordinates": [[-10,6.2],[10,6.2]] }}
]}

// Einzelnes Geländeprofil:
{ "type": "LineString",
  "coordinates": [[-15,5],[-5,0],[5,0],[15,5]] }

// Mit geograph. Koordinaten (lon,lat,z):
{ "type": "LineString",
  "coordinates": [[7.12,48.45,243.5],[7.13,48.45,241.0]] }`
</script>

<style scoped>
.bridge-input-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 0.9rem;
  align-items: start;
}

.param-group {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.8rem 1rem;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.6rem;
}

.group-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.055em;
  margin: 0 0 0.6rem;
}

.group-header .group-title { margin: 0; }

.param-grid {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.45rem 0.5rem;
  align-items: center;
}
.param-grid label { font-size: 0.82rem; color: #475569; }

.input-row {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.input-row input {
  width: 70px;
  padding: 0.28rem 0.4rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 5px;
  font-size: 0.83rem;
  text-align: right;
  background: #f8fafc;
}
.input-row input:focus { outline: none; border-color: #3b82f6; background: white; }
.unit { font-size: 0.74rem; color: #94a3b8; min-width: 24px; }

/* WSP */
.wsp-group { grid-column: span 1; }
.wsp-row { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.4rem; }
.wsp-slider { flex: 1; accent-color: #1d4ed8; }
.wsp-val { font-size: 0.9rem; font-weight: 700; color: #1d4ed8; min-width: 52px; }
.wsp-badges { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
.badge { font-size: 0.72rem; font-weight: 600; padding: 0.12rem 0.45rem; border-radius: 20px; }
.badge-ok { background: #dcfce7; color: #15803d; }
.badge-warn { background: #fef3c7; color: #b45309; }
.badge-blue { background: #dbeafe; color: #1e40af; }
.badge-gray { background: #f1f5f9; color: #64748b; }

.rating-range {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: #64748b;
  flex-wrap: wrap;
}
.rating-range input { width: 54px; padding: 0.2rem 0.3rem; border: 1.5px solid #e2e8f0; border-radius: 5px; font-size: 0.8rem; text-align: right; }
.small-label { font-size: 0.74rem; color: #94a3b8; }

/* kSt Zonen */
.kst-group { grid-column: 1 / -1; }
.add-btn { font-size: 0.78rem; padding: 0.22rem 0.6rem; border: 1.5px solid #e2e8f0; border-radius: 5px; background: white; color: #475569; cursor: pointer; }
.add-btn:hover { background: #f1f5f9; }

.kst-zones-list { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.5rem; }

.kst-zone-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  background: #f8fafc;
  border-radius: 6px;
  padding: 0.4rem 0.5rem;
  border: 1px solid #f1f5f9;
}

.zone-color-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

.zone-label-inp {
  flex: 1;
  min-width: 90px;
  padding: 0.22rem 0.4rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 5px;
  font-size: 0.8rem;
  background: white;
}

.zone-range { display: flex; align-items: center; gap: 0.25rem; }
.range-inp { width: 58px; padding: 0.22rem 0.3rem; border: 1.5px solid #e2e8f0; border-radius: 5px; font-size: 0.79rem; text-align: right; background: white; }
.range-sep { color: #94a3b8; font-size: 0.8rem; }
.unit-sm { font-size: 0.72rem; color: #94a3b8; }

.kst-inp-row { display: flex; align-items: center; gap: 0.25rem; }
.kst-inp { width: 52px; padding: 0.22rem 0.3rem; border: 1.5px solid #e2e8f0; border-radius: 5px; font-size: 0.82rem; text-align: right; background: white; font-weight: 600; }

.remove-btn {
  width: 22px; height: 22px;
  border: none; border-radius: 50%;
  background: #fee2e2; color: #dc2626;
  font-size: 0.9rem; font-weight: 700;
  cursor: pointer; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.remove-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.remove-btn:not(:disabled):hover { background: #fca5a5; }

.hint-small { font-size: 0.73rem; color: #94a3b8; margin: 0; font-style: italic; line-height: 1.4; }

/* Import */
.import-btns {
  display: flex;
  gap: 0.35rem;
}

.import-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  padding: 0.28rem 0.7rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 6px;
  background: white;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s;
}
.import-btn:hover { background: #f1f5f9; border-color: #94a3b8; }

.import-status {
  font-size: 0.8rem;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  margin: 0.5rem 0;
  line-height: 1.4;
}
.import-status.ok { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
.import-status.err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }

.format-info { margin: 0.4rem 0; }
.format-info summary { font-size: 0.78rem; color: #64748b; cursor: pointer; }
.format-pre { font-size: 0.7rem; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 5px; padding: 0.5rem; overflow: auto; margin: 0.3rem 0 0; white-space: pre; }

.import-actions { margin-top: 0.5rem; }
.tool-btn { font-size: 0.8rem; padding: 0.28rem 0.7rem; border: 1.5px solid #e2e8f0; border-radius: 5px; background: white; color: #475569; cursor: pointer; }
.tool-btn:hover { background: #f1f5f9; }
</style>
