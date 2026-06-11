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

    <!-- Brückenkoeffizienten -->
    <div class="param-group coeff-group" v-if="store.currentResult.hasBridge">
      <h4 class="group-title">Brückenkoeffizienten</h4>

      <!-- Hydraulischer Zustandsmodus -->
      <div class="coeff-block flow-mode-block">
        <div class="coeff-header">
          <span class="coeff-sym fm-sym">Z</span>
          <span class="coeff-name">Hydraulischer Zustand</span>
        </div>
        <div class="flow-mode-tabs">
          <button :class="['fmode-btn', { active: store.flowMode === 'auto' }]"
            @click="store.flowMode = 'auto'; store.save()" title="Automatisch: Freispiegel wenn WSP < BUK, sonst Orifice">
            Auto
          </button>
          <button :class="['fmode-btn', { active: store.flowMode === 'free' }]"
            @click="store.flowMode = 'free'; store.save()" title="Manning-Strickler erzwingen, auch wenn WSP ≥ BUK">
            Freispiegel
          </button>
          <button :class="['fmode-btn', { active: store.flowMode === 'pressure' }]"
            @click="store.flowMode = 'pressure'; store.save()" title="Orifice-Formel erzwingen, auch wenn WSP < BUK">
            Druckabfluss
          </button>
        </div>

        <!-- Unterwasser-WSP (nur relevant wenn Orifice aktiv sein kann) -->
        <div class="uw-wsp-row" v-if="store.flowMode !== 'free'">
          <label>UW-WSP <span class="uw-hint">(Rückstau)</span></label>
          <input type="number"
            :value="store.wspUW ?? ''"
            @input="store.wspUW = $event.target.value === '' ? null : +$event.target.value; store.save()"
            placeholder="leer = frei"
            step="0.05" />
          <span class="unit">m</span>
        </div>
        <div class="uw-delta" v-if="store.flowMode !== 'free' && store.wspUW != null">
          &Delta;h = OW &minus; UW = {{ (store.wsp - store.wspUW).toFixed(2) }} m
          <span v-if="store.wspUW >= store.wsp" class="uw-warn">⚠ UW &ge; OW → kein Antrieb</span>
        </div>

        <p v-if="store.flowMode !== 'auto'" class="hint-small fm-override-note">
          <strong v-if="store.flowMode === 'free'">Freispiegel erzwungen</strong>
          <strong v-else>Druckabfluss erzwungen</strong>
          — Auto-Erkennung deaktiviert.
          <span v-if="store.flowMode === 'pressure' && !store.currentResult.isSubmergedGeo">
            WSP liegt geometrisch unter BUK (Δh = 0 → Q = 0).
          </span>
          <span v-if="store.flowMode === 'free' && store.currentResult.isSubmergedGeo">
            ⚠ WSP liegt geometrisch über BUK — Orifice wäre der physikalisch korrekte Modus.
          </span>
        </p>
      </div>

      <!-- μ Druckabfluss -->
      <div class="coeff-block">
        <div class="coeff-header">
          <span class="coeff-sym">&mu;</span>
          <span class="coeff-name">Druckabfluss</span>
          <input class="coeff-num" type="number"
            :value="store.mu"
            @input="store.mu = +$event.target.value; store.save()"
            min="0.50" max="0.95" step="0.01" title="Benutzerdefinierter Wert" />
          <span class="coeff-unit">–</span>
        </div>
        <div class="preset-chips">
          <button v-for="p in MU_PRESETS" :key="p.value"
            :class="['preset-chip', { active: Math.abs(store.mu - p.value) < 0.005 }]"
            @click="store.mu = p.value; store.save()">
            <span class="chip-top">{{ p.label }}</span>
            <span class="chip-sub">{{ p.detail }}</span>
            <span class="chip-num">{{ p.value.toFixed(2) }}</span>
          </button>
        </div>
      </div>

      <!-- μD Überströmung -->
      <div class="coeff-block">
        <div class="coeff-header">
          <span class="coeff-sym">&mu;<sub>D</sub></span>
          <span class="coeff-name">Überströmung</span>
          <input class="coeff-num" type="number"
            :value="store.muDeck"
            @input="store.muDeck = +$event.target.value; store.save()"
            min="0.25" max="0.60" step="0.01" title="Benutzerdefinierter Wert" />
          <span class="coeff-unit">–</span>
        </div>
        <div class="preset-chips">
          <button v-for="p in MU_DECK_PRESETS" :key="p.value"
            :class="['preset-chip', { active: Math.abs(store.muDeck - p.value) < 0.005 }]"
            @click="store.muDeck = p.value; store.save()">
            <span class="chip-top">{{ p.label }}</span>
            <span class="chip-sub">{{ p.detail }}</span>
            <span class="chip-num">{{ p.value.toFixed(2) }}</span>
          </button>
        </div>
      </div>

      <!-- ζ Pfeiler -->
      <div class="coeff-block">
        <div class="coeff-header">
          <span class="coeff-sym">&zeta;</span>
          <span class="coeff-name">Formwiderstand</span>
          <input class="coeff-num" type="number"
            :value="store.zeta"
            @input="store.zeta = +$event.target.value; store.save()"
            min="0" max="2.0" step="0.05" title="Benutzerdefinierter Wert" />
          <span class="coeff-unit">–</span>
        </div>
        <div class="preset-chips">
          <button v-for="p in ZETA_PRESETS" :key="p.value"
            :class="['preset-chip', { active: Math.abs(store.zeta - p.value) < 0.005 }]"
            @click="store.zeta = p.value; store.save()">
            <span class="chip-top">{{ p.label }}</span>
            <span class="chip-sub">{{ p.detail }}</span>
            <span class="chip-num">{{ p.value.toFixed(2) }}</span>
          </button>
        </div>
      </div>

      <!-- Pfeiler-Geometrie -->
      <div class="coeff-block pier-block">
        <div class="coeff-header">
          <span class="coeff-sym pier-sym">&#x03C6;</span>
          <span class="coeff-name">Pfeiler-Geometrie</span>
        </div>
        <div class="pier-inputs">
          <div class="pier-row">
            <label>Anzahl <em>n</em></label>
            <input type="number"
              :value="store.nPiers"
              @input="store.nPiers = Math.max(0, Math.round(+$event.target.value)); store.save()"
              min="0" max="20" step="1" />
            <span class="unit">Stk.</span>
          </div>
          <div class="pier-row">
            <label>Breite <em>b<sub>P</sub></em></label>
            <input type="number"
              :value="store.bPier"
              @input="store.bPier = Math.max(0.01, +$event.target.value); store.save()"
              min="0.01" max="20" step="0.05" />
            <span class="unit">m</span>
          </div>
          <div v-if="store.nPiers > 0 && store.currentResult.hasBridge" class="pier-result">
            <span class="pier-phi">
              &phi; = {{ (store.currentResult.phi * 100).toFixed(1) }} %
            </span>
            <span class="pier-anetto">
              A<sub>netto</sub> = {{ store.currentResult.A_netto.toFixed(2) }} m²
            </span>
            <span v-if="store.currentResult.phi >= 0.5" class="pier-warn">⚠ &phi; &ge; 50 %</span>
          </div>
          <p class="hint-small">
            Nur verwenden wenn Pfeiler <em>nicht</em> im Geländeprofil eingezeichnet sind.<br>
            Pfeiler als Terrain-Erhöhung modelliert → n = 0 setzen (sonst Doppelabzug).<br>
            &phi; = n &middot; b<sub>P</sub> / L<sub>BUK</sub> &nbsp;&nbsp; A<sub>netto</sub> = A<sub>öffn.</sub> &middot; (1 &minus; &phi;)
            &nbsp;—&nbsp; wirkt in allen Zuständen (auch Freispiegel).<br>
            Im Freispiegel zusätzlich Pfeilerstau-Abschätzung &Delta;h<sub>P</sub> = &zeta; &middot; v<sub>öffn.</sub>²/2g.<br>
            Verklausung (Treibgut) näherungsweise: b<sub>P</sub> um angenommene Verlegungsbreite erhöhen.
          </p>
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
          step="0.01"
          @input="store.wsp = +$event.target.value; store.save()"
          class="wsp-slider" />
        <input type="number"
          :value="store.wsp"
          :min="wspSliderMin"
          :max="wspSliderMax"
          step="0.01"
          @change="store.wsp = Math.round(+$event.target.value * 1000) / 1000; store.save()"
          class="wsp-num-inp" />
        <span class="unit">m</span>
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

      <!-- Q → WSP Inversion -->
      <div class="q-inv-block">
        <span class="q-inv-label">Q → WSP</span>
        <input type="number"
          v-model.number="qTarget"
          min="0" step="0.01"
          placeholder="Q (m³/s)"
          @input="computeWspFromQ"
          class="q-inv-inp" />
        <span class="q-inv-arrow">→</span>
        <span class="q-inv-result" :class="{ 'q-inv-active': wspFromQ != null }">
          {{ wspFromQ != null ? wspFromQ.toFixed(3) + ' m' : '–' }}
        </span>
        <button class="q-inv-apply" @click="applyWspFromQ"
          :disabled="wspFromQ == null" title="WSP auf diesen Wert setzen">
          Setzen
        </button>
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
        <div class="kst-zone-row" :class="{ 'zone-inactive': zone.inactive }"
          v-for="zone in store.kstZones" :key="zone.id">
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
              min="1" max="120" step="1" class="kst-inp" :disabled="zone.inactive" />
          </div>

          <button :class="['inactive-btn', { on: zone.inactive }]"
            @click="store.updateKstZone(zone.id, { inactive: !zone.inactive })"
            title="Ineffective Flow Area: Zone führt keinen Abfluss (Totwasser hinter Widerlagern o.ä.) — Fläche zählt weder zu A noch zu Q">
            {{ zone.inactive ? 'Totwasser' : 'aktiv' }}
          </button>

          <button class="remove-btn" @click="store.removeKstZone(zone.id)"
            :disabled="store.kstZones.length <= 1" title="Zone entfernen">×</button>
        </div>
      </div>

      <p class="hint-small">
        Leer = ±∞ · Mehrere Zonen: Letzte Übereinstimmung gilt · Empfehlungen:
        Betongerinne 70–85 · Naturgerinne 25–40 · Vorland/Brückendeck 20–30<br>
        <strong>Totwasser</strong> = Ineffective Flow Area (z.B. hinter Widerlagern):
        Zone wird hydraulisch ignoriert, dient nur der Retention.
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
import { useBridgeHydraulics } from '../composables/useBridgeHydraulics.js'
import { parseGeoJSON, readFileAsText } from '../composables/useCrossSectionImporter.js'
import BridgeImportModal from './BridgeImportModal.vue'

const store = useBridgeStore()
const { findWSPForQ } = useBridgeHydraulics()
const importStatus = ref(null)
const showImportModal = ref(false)

const qTarget  = ref(null)
const wspFromQ = ref(null)

function computeWspFromQ() {
  if (qTarget.value == null || qTarget.value < 0) { wspFromQ.value = null; return }
  wspFromQ.value = findWSPForQ(store.calcParams, qTarget.value, store.wspMin, store.wspMax)
}

function applyWspFromQ() {
  if (wspFromQ.value == null) return
  store.wsp = wspFromQ.value
  store.save()
}

const MU_PRESETS = [
  { label: 'Scharfkantig',  detail: 'Betonkante, Winkel',   value: 0.65 },
  { label: 'Abgerundet',    detail: 'gefaste Einlaufkante',  value: 0.82 },
  { label: 'Gewölbt',       detail: 'Gewölbe / Trog',        value: 0.90 },
]
const MU_DECK_PRESETS = [
  { label: 'Scharf',        detail: 'BOK-Kante, Bordstein',  value: 0.38 },
  { label: 'Abgerundet',    detail: 'Fahrbahn, Krone',        value: 0.47 },
]
const ZETA_PRESETS = [
  { label: 'Kein Pfeiler',  detail: 'offene Brücke',         value: 0.00 },
  { label: 'Tropfenform',   detail: 'aerodyn. Querschnitt',  value: 0.20 },
  { label: 'Rechteckig',    detail: 'massiver Pfeiler',       value: 0.90 },
]

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

.kst-zone-row.zone-inactive { opacity: 0.65; background: #f1f5f9; }
.kst-zone-row.zone-inactive .zone-label-inp { text-decoration: line-through; color: #94a3b8; }

.inactive-btn {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  background: #f0fdf4;
  color: #15803d;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.inactive-btn:hover { border-color: #94a3b8; }
.inactive-btn.on { background: #f1f5f9; color: #64748b; border-color: #cbd5e1; }

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

/* Brückenkoeffizienten — Preset-Chips */
.coeff-group { grid-column: 1 / -1; }

.coeff-block {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.45rem 0;
  border-bottom: 1px solid #f1f5f9;
}
.coeff-block:last-child { border-bottom: none; }

.coeff-header {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.coeff-sym {
  font-size: 0.9rem;
  font-weight: 700;
  color: #1e293b;
  min-width: 20px;
  font-family: 'Georgia', serif;
}
.coeff-name {
  font-size: 0.78rem;
  color: #64748b;
  flex: 1;
}
.coeff-num {
  width: 54px;
  padding: 0.2rem 0.35rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 5px;
  font-size: 0.82rem;
  text-align: right;
  background: #f8fafc;
  font-family: 'Courier New', monospace;
}
.coeff-num:focus { outline: none; border-color: #3b82f6; background: white; }
.coeff-unit { font-size: 0.74rem; color: #94a3b8; }

.preset-chips {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}

.preset-chip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  padding: 0.28rem 0.5rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 7px;
  background: #f8fafc;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.12s, background 0.12s;
  flex: 1;
  min-width: 72px;
}
.preset-chip:hover {
  border-color: #94a3b8;
  background: #f1f5f9;
}
.preset-chip.active {
  border-color: #3b82f6;
  background: #eff6ff;
}
.chip-top {
  font-size: 0.76rem;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.3;
  white-space: nowrap;
}
.preset-chip.active .chip-top { color: #1d4ed8; }
.chip-sub {
  font-size: 0.65rem;
  color: #94a3b8;
  line-height: 1.2;
  white-space: nowrap;
}
.chip-num {
  font-size: 0.71rem;
  font-family: 'Courier New', monospace;
  color: #64748b;
  font-weight: 600;
  margin-top: 0.1rem;
}
.preset-chip.active .chip-num { color: #2563eb; }

/* Hydraulischer Zustandsmodus */
.flow-mode-block { background: #f8fafc; border-radius: 7px; padding: 0.5rem 0.6rem !important; }
.fm-sym { color: #0f766e; font-size: 0.85rem; }
.flow-mode-tabs {
  display: flex;
  gap: 0.25rem;
  margin: 0.35rem 0 0.4rem;
}
.fmode-btn {
  flex: 1;
  padding: 0.3rem 0.3rem;
  font-size: 0.77rem;
  font-weight: 600;
  border: 1.5px solid #e2e8f0;
  border-radius: 6px;
  background: white;
  color: #475569;
  cursor: pointer;
  transition: all 0.12s;
  white-space: nowrap;
}
.fmode-btn:hover { background: #f1f5f9; border-color: #94a3b8; }
.fmode-btn.active { background: #0f766e; border-color: #0f766e; color: white; }
.uw-wsp-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.35rem;
}
.uw-wsp-row label { font-size: 0.8rem; color: #475569; flex: 1; }
.uw-wsp-row input {
  width: 70px;
  padding: 0.22rem 0.35rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 5px;
  font-size: 0.82rem;
  text-align: right;
  background: white;
}
.uw-wsp-row input:focus { outline: none; border-color: #0f766e; }
.uw-hint { font-size: 0.69rem; color: #94a3b8; }
.uw-delta {
  font-size: 0.77rem;
  color: #0f766e;
  font-family: 'Courier New', monospace;
  margin-top: 0.2rem;
  padding: 0.2rem 0.4rem;
  background: #f0fdf4;
  border-radius: 4px;
  border: 1px solid #bbf7d0;
}
.uw-warn { color: #b45309; font-weight: 600; margin-left: 0.5rem; }
.fm-override-note { color: #92400e; background: #fef3c7; border-radius: 4px; padding: 0.25rem 0.4rem; margin-top: 0.3rem !important; }

/* Pfeiler-Geometrie */
.pier-block { background: #f8fafc; border-radius: 7px; padding: 0.5rem 0.6rem !important; margin-top: 0.3rem; border-bottom: none !important; }
.pier-sym { color: #7c3aed; }
.pier-inputs { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.3rem; }
.pier-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.pier-row label { font-size: 0.8rem; color: #64748b; flex: 1; }
.pier-row input {
  width: 58px;
  padding: 0.22rem 0.35rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 5px;
  font-size: 0.82rem;
  text-align: right;
  background: white;
}
.pier-row input:focus { outline: none; border-color: #7c3aed; }
.pier-result {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 0.1rem;
  padding: 0.3rem 0.45rem;
  background: #ede9fe;
  border-radius: 5px;
  border: 1px solid #c4b5fd;
}
.pier-phi { font-size: 0.78rem; font-weight: 700; color: #5b21b6; font-family: 'Georgia', serif; }
.pier-anetto { font-size: 0.78rem; color: #6d28d9; }
.pier-warn { font-size: 0.75rem; color: #b45309; background: #fef3c7; border-radius: 4px; padding: 0.1rem 0.35rem; }

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

/* WSP number input */
.wsp-num-inp {
  width: 68px;
  padding: 0.22rem 0.35rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 5px;
  font-size: 0.84rem;
  font-family: 'Courier New', monospace;
  text-align: right;
  background: #f8fafc;
  color: #1d4ed8;
  font-weight: 700;
}
.wsp-num-inp:focus { outline: none; border-color: #3b82f6; background: white; }

/* Q → WSP inversion row */
.q-inv-block {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-bottom: 0.45rem;
  padding: 0.4rem 0.5rem;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 7px;
}
.q-inv-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: #0369a1;
  white-space: nowrap;
}
.q-inv-inp {
  width: 80px;
  padding: 0.22rem 0.35rem;
  border: 1.5px solid #bae6fd;
  border-radius: 5px;
  font-size: 0.82rem;
  text-align: right;
  background: white;
}
.q-inv-inp:focus { outline: none; border-color: #0ea5e9; }
.q-inv-arrow { font-size: 0.9rem; color: #0369a1; }
.q-inv-result {
  font-size: 0.82rem;
  font-family: 'Courier New', monospace;
  color: #94a3b8;
  min-width: 58px;
  font-weight: 600;
}
.q-inv-result.q-inv-active { color: #0369a1; }
.q-inv-apply {
  padding: 0.22rem 0.6rem;
  font-size: 0.77rem;
  font-weight: 600;
  border: 1.5px solid #0369a1;
  border-radius: 5px;
  background: #0369a1;
  color: white;
  cursor: pointer;
  transition: background 0.12s;
  margin-left: auto;
}
.q-inv-apply:hover:not(:disabled) { background: #0284c7; border-color: #0284c7; }
.q-inv-apply:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
