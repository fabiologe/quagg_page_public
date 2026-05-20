<template>
  <teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-box" @paste.prevent="onPaste">

        <!-- Header -->
        <div class="modal-header">
          <div class="header-left">
            <h2 class="modal-title">Querschnittspunkte</h2>
            <span class="modal-subtitle">Manuell eingeben oder aus Excel einfügen</span>
          </div>
          <button class="close-btn" @click="$emit('close')">×</button>
        </div>

        <!-- Excel-artige Tabellenreiter -->
        <div class="sheet-tabs">
          <button v-for="tab in TABS" :key="tab.id"
            :class="['sheet-tab', { active: activeTab === tab.id }]"
            :style="activeTab === tab.id ? { '--tab-color': tab.color } : {}"
            @click="activeTab = tab.id">
            <span class="tab-icon" :style="{ background: tab.color }"></span>
            <span class="tab-name">{{ tab.label }}</span>
            <span class="tab-count">{{ editCount(tab.id) }}</span>
          </button>
        </div>

        <!-- Tabellenbereich -->
        <div class="table-area">

          <!-- Toolbar -->
          <div class="table-toolbar">
            <div class="toolbar-left">
              <button class="tbtn primary-tbtn" @click="addRow" title="Neue Zeile anfügen">
                + Zeile
              </button>
              <button class="tbtn" @click="pasteFromClipboard" title="Aus Zwischenablage einfügen (auch Strg+V auf Tabelle)">
                ⎘ Excel einfügen
              </button>
              <button class="tbtn" @click="sortByX" title="Nach x-Koordinate sortieren">
                ↕ Sortieren
              </button>
            </div>
            <div class="toolbar-right">
              <span v-if="pasteHint" class="paste-hint">{{ pasteHint }}</span>
              <button class="tbtn danger-tbtn" @click="clearTab">Leeren</button>
            </div>
          </div>

          <!-- Tabelle -->
          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="col-idx">#</th>
                  <th class="col-x">x (m) <span class="th-hint">Abstand/Breite</span></th>
                  <th class="col-z">
                    {{ activeTabMeta.zLabel }}
                    <span class="th-hint">{{ activeTabMeta.zHint }}</span>
                  </th>
                  <th class="col-warn"></th>
                  <th class="col-del"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in currentEdit" :key="i"
                  :class="{ 'row-warn': rowWarning(i) }">
                  <td class="col-idx">{{ i + 1 }}</td>
                  <td class="col-x">
                    <input
                      type="number" step="0.01" :value="row.x"
                      @input="updateRow(i, 'x', $event.target.value)"
                      @keydown.tab.exact.prevent="focusNext(i, 'z')"
                      :ref="el => setRef(el, i, 'x')"
                      class="cell-input" />
                  </td>
                  <td class="col-z">
                    <input
                      type="number" step="0.001" :value="row.z"
                      @input="updateRow(i, 'z', $event.target.value)"
                      @keydown.tab.exact.prevent="focusNext(i + 1, 'x')"
                      @keydown.enter.prevent="addRowAfter(i)"
                      :ref="el => setRef(el, i, 'z')"
                      class="cell-input" />
                  </td>
                  <td class="col-warn">
                    <span v-if="rowWarning(i)" class="warn-icon" :title="rowWarning(i)">⚠</span>
                  </td>
                  <td class="col-del">
                    <button class="del-btn" @click="deleteRow(i)" title="Zeile löschen">×</button>
                  </td>
                </tr>
                <tr v-if="currentEdit.length === 0" class="empty-row">
                  <td colspan="5">
                    Noch keine Punkte – Zeile hinzufügen oder aus Excel einfügen (Strg+V)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Statistik -->
          <div class="table-stats" v-if="currentEdit.length > 0">
            <span class="stat">{{ currentEdit.length }} Punkte</span>
            <template v-if="currentEdit.length >= 2">
              <span class="stat-sep">·</span>
              <span class="stat">
                x: {{ xMin.toFixed(2) }} … {{ xMax.toFixed(2) }} m
                (Δ {{ (xMax - xMin).toFixed(2) }} m)
              </span>
              <span class="stat-sep">·</span>
              <span class="stat">z: {{ zMin.toFixed(3) }} … {{ zMax.toFixed(3) }} m</span>
            </template>
          </div>

          <!-- Paste-Format Hinweis -->
          <details class="format-hint">
            <summary>Format-Hinweis</summary>
            <div class="format-body">
              <strong>2 Spalten</strong> – lokale Koordinaten (x, z):<br>
              <code>-15	5.00
-5	0.00
5	0.00
15	5.00</code>
              <strong>3 Spalten</strong> – Vermessungsdaten (Rechtswert, Hochwert, Höhe):<br>
              Distanz wird automatisch aus Rw/Hw berechnet.<br>
              <code>380468.5 5507139 245.457
380469.0 5507138 245.285
380470.0 5507136 244.986</code>
              Trennzeichen: Tab, Leerzeichen oder Semikolon · Dezimal: Punkt oder Komma
            </div>
          </details>

        </div>

        <!-- Datei-Import / Projekt ─────────────────────────────────────── -->
        <div class="file-section">

          <!-- Projekt speichern / laden -->
          <div class="file-row">
            <span class="file-row-label">Projekt</span>
            <button class="file-btn" @click="saveProject" title="Alle Einstellungen als .json herunterladen">
              Speichern (.json)
            </button>
            <label class="file-btn" title="Gespeichertes Projekt laden">
              Laden
              <input type="file" accept=".json" @change="onProjectImport" hidden />
            </label>
          </div>

          <!-- GeoJSON-Import -->
          <div class="file-row">
            <span class="file-row-label">GeoJSON</span>
            <label class="file-btn" title="GeoJSON-Datei mit Querschnittsprofilen importieren">
              Datei wählen
              <input type="file" accept=".geojson,.json" @change="onFileImport" hidden />
            </label>
          </div>

          <!-- Status-Meldung -->
          <div v-if="fileStatus" :class="['file-status-bar', fileStatus.ok ? 'ok' : 'err']">
            {{ fileStatus.msg }}
          </div>

        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <div class="footer-info">
            <span v-if="warnings.length" class="footer-warn">
              {{ warnings.join(' · ') }}
            </span>
          </div>
          <div class="footer-actions">
            <button class="btn-cancel" @click="$emit('close')">Abbrechen</button>
            <button class="btn-apply" @click="applyAll">
              Übernehmen ({{ totalPointCount }} Punkte)
            </button>
          </div>
        </div>

      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref, computed, reactive, nextTick } from 'vue'
import { useBridgeStore } from '../stores/useBridgeStore.js'
import { parseGeoJSON, readFileAsText } from '../composables/useCrossSectionImporter.js'
import { useBridgeHydraulics } from '../composables/useBridgeHydraulics.js'

const emit = defineEmits(['close'])
const store = useBridgeStore()
const { interpZ } = useBridgeHydraulics()

// ─── Tab-Definition ────────────────────────────────────────────────────────────
const TABS = [
  {
    id: 'terrain',
    label: 'Gelände',
    color: '#374151',
    zLabel: 'z (m ü. Ref.)',
    zHint: 'Sohlhöhe'
  },
  {
    id: 'buk',
    label: 'BUK',
    color: '#d97706',
    zLabel: 'z BUK (m)',
    zHint: 'Brückenunterkante'
  },
  {
    id: 'bok',
    label: 'BOK',
    color: '#7c3aed',
    zLabel: 'z BOK (m)',
    zHint: 'Brückenoberkante'
  }
]

// ─── Editier-Zustand (pro Tab separat) ─────────────────────────────────────────
const edits = reactive({
  terrain: store.terrainPoints.map(p => ({ ...p })),
  buk: store.bukProfile.map(p => ({ ...p })),
  bok: store.bokProfile.map(p => ({ ...p }))
})

const activeTab = ref('terrain')
const pasteHint = ref('')
const fileStatus = ref(null)

const activeTabMeta = computed(() => TABS.find(t => t.id === activeTab.value))
const currentEdit = computed(() => edits[activeTab.value])

function editCount(tabId) {
  const n = edits[tabId].length
  return n ? `(${n})` : ''
}

// ─── Statistiken ───────────────────────────────────────────────────────────────
const xMin = computed(() => Math.min(...currentEdit.value.map(p => p.x)))
const xMax = computed(() => Math.max(...currentEdit.value.map(p => p.x)))
const zMin = computed(() => Math.min(...currentEdit.value.map(p => p.z)))
const zMax = computed(() => Math.max(...currentEdit.value.map(p => p.z)))

const totalPointCount = computed(() =>
  edits.terrain.length + edits.buk.length + edits.bok.length
)

// ─── Validierungswarnungen ─────────────────────────────────────────────────────
function rowWarning(i) {
  const row = currentEdit.value[i]
  if (!row) return null

  if (activeTab.value === 'buk' && edits.terrain.length >= 2) {
    const terrainZ = interpZ(edits.terrain, row.x)
    if (row.z < terrainZ) return `z < Gelände (${terrainZ.toFixed(2)} m)`
  }

  if (activeTab.value === 'bok' && edits.buk.length >= 2) {
    const bukZ = interpZ(edits.buk, row.x)
    if (row.z < bukZ) return `z < BUK (${bukZ.toFixed(2)} m)`
  }
  return null
}

const warnings = computed(() => {
  const w = []
  if (edits.terrain.length < 2) w.push('Gelände: mind. 2 Punkte')
  if (edits.buk.length === 1) w.push('BUK: mind. 2 Punkte oder leer')
  if (edits.bok.length === 1) w.push('BOK: mind. 2 Punkte oder leer')
  return w
})

// ─── Zeilen-Operationen ────────────────────────────────────────────────────────
function addRow() {
  const pts = edits[activeTab.value]
  const lastX = pts.length > 0 ? pts[pts.length - 1].x + 1 : 0
  const lastZ = pts.length > 0 ? pts[pts.length - 1].z : 0
  pts.push({ x: lastX, z: lastZ })
  nextTick(() => focusNext(pts.length - 1, 'x'))
}

function addRowAfter(i) {
  const pts = edits[activeTab.value]
  const nextX = i < pts.length - 1 ? (pts[i].x + pts[i + 1].x) / 2 : pts[i].x + 1
  pts.splice(i + 1, 0, { x: nextX, z: pts[i].z })
  nextTick(() => focusNext(i + 1, 'x'))
}

function deleteRow(i) {
  edits[activeTab.value].splice(i, 1)
}

function updateRow(i, field, value) {
  const v = parseFloat(String(value).replace(',', '.'))
  if (!isNaN(v)) edits[activeTab.value][i][field] = v
}

function sortByX() {
  edits[activeTab.value].sort((a, b) => a.x - b.x)
}

function clearTab() {
  edits[activeTab.value].splice(0)
}

// ─── Tastatur-Navigation ───────────────────────────────────────────────────────
const cellRefs = {}
function setRef(el, i, col) {
  if (el) cellRefs[`${i}-${col}`] = el
}

function focusNext(i, col) {
  nextTick(() => {
    const el = cellRefs[`${i}-${col}`]
    if (el) { el.focus(); el.select() }
  })
}

// ─── Einfügen aus Zwischenablage ──────────────────────────────────────────────
function parseTableText(text) {
  // Alle Zeilen parsen → Rohe Zahlenlisten
  const rawRows = []
  for (const line of text.trim().split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    // Trennzeichen: Tab, Semikolon, Leerzeichen (auch einfach)
    const parts = trimmed.split(/[\t;]+|\s+/).filter(Boolean)
    if (parts.length < 2) continue
    const nums = parts.map(p => parseFloat(p.replace(',', '.')))
    if (nums.some(isNaN)) continue
    rawRows.push(nums)
  }
  if (rawRows.length === 0) return { rows: [], mode: '' }

  const colCount = rawRows[0].length

  if (colCount >= 3) {
    // Format: Rechtswert  Hochwert  Höhe (z.B. UTM-Vermessung)
    // x = kumulierte 2D-Distanz entlang des Profils, z = Höhe (3. Spalte)
    const rows = []
    let cumDist = 0
    for (let i = 0; i < rawRows.length; i++) {
      const [rx, ry, rz] = rawRows[i]
      if (i > 0) {
        const [px, py] = rawRows[i - 1]
        cumDist += Math.sqrt((rx - px) ** 2 + (ry - py) ** 2)
      }
      rows.push({ x: Math.round(cumDist * 1000) / 1000, z: rz })
    }
    return { rows, mode: 'xyz' }  // Reihenfolge beibehalten – nicht sortieren
  } else {
    // Format: x  z  (lokale Koordinaten, 2 Spalten)
    const rows = rawRows.map(n => ({ x: n[0], z: n[1] }))
    rows.sort((a, b) => a.x - b.x)
    return { rows, mode: 'xz' }
  }
}

function applyParsed({ rows, mode }) {
  if (!rows || rows.length === 0) {
    pasteHint.value = 'Keine gültigen Punkte erkannt'
    setTimeout(() => { pasteHint.value = '' }, 3000)
    return
  }
  edits[activeTab.value].splice(0, edits[activeTab.value].length, ...rows)
  const modeLabel = mode === 'xyz' ? ' (Rw/Hw/Höhe → Distanz/z)' : ''
  pasteHint.value = `${rows.length} Punkte eingefügt${modeLabel}`
  setTimeout(() => { pasteHint.value = '' }, 4000)
}

function onPaste(event) {
  const text = event.clipboardData?.getData('text') ?? ''
  applyParsed(parseTableText(text))
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    applyParsed(parseTableText(text))
  } catch {
    pasteHint.value = 'Strg+V direkt auf die Tabelle drücken'
    setTimeout(() => { pasteHint.value = '' }, 3000)
  }
}

// ─── Projekt speichern ────────────────────────────────────────────────────────
function saveProject() {
  const json = store.exportProject()
  const blob = new Blob([json], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `brueckenhydraulik_${new Date().toISOString().slice(0,10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Projekt laden ────────────────────────────────────────────────────────────
async function onProjectImport(e) {
  const file = e.target.files?.[0]
  if (!file) return
  e.target.value = ''
  try {
    const text = await readFileAsText(file)
    store.importProject(text)
    // Sync editing tables with fresh store data
    edits.terrain.splice(0, edits.terrain.length, ...store.terrainPoints.map(p => ({ ...p })))
    edits.buk.splice(0, edits.buk.length, ...store.bukProfile.map(p => ({ ...p })))
    edits.bok.splice(0, edits.bok.length, ...store.bokProfile.map(p => ({ ...p })))
    fileStatus.value = { ok: true, msg: `Projekt geladen: ${file.name}` }
  } catch (err) {
    fileStatus.value = { ok: false, msg: `Fehler: ${err.message}` }
  }
  setTimeout(() => { fileStatus.value = null }, 6000)
}

// ─── GeoJSON-Import ────────────────────────────────────────────────────────────
async function onFileImport(e) {
  const file = e.target.files?.[0]
  if (!file) return
  e.target.value = ''
  try {
    const text = await readFileAsText(file)
    const result = parseGeoJSON(text)
    let n = 0
    if (result.terrain?.length >= 2) { edits.terrain.splice(0, edits.terrain.length, ...result.terrain); n++ }
    if (result.buk?.length >= 2)     { edits.buk.splice(0, edits.buk.length, ...result.buk);             n++ }
    if (result.bok?.length >= 2)     { edits.bok.splice(0, edits.bok.length, ...result.bok);             n++ }
    fileStatus.value = n > 0
      ? { ok: true,  msg: `${n} Layer importiert` + (result.errors.length ? ` (${result.errors.join('; ')})` : '') }
      : { ok: false, msg: `Kein Layer erkannt. ${result.errors.join(' ')}` }
  } catch (err) {
    fileStatus.value = { ok: false, msg: err.message }
  }
  setTimeout(() => { fileStatus.value = null }, 6000)
}

// ─── Übernehmen ────────────────────────────────────────────────────────────────
function applyAll() {
  // Alle Tabs sortieren
  ;['terrain', 'buk', 'bok'].forEach(tab => {
    edits[tab].sort((a, b) => a.x - b.x)
  })

  if (edits.terrain.length >= 2) store.setLayer('terrain', edits.terrain)
  if (edits.buk.length >= 2) store.setLayer('buk', edits.buk)
  else if (edits.buk.length === 0) store.clearLayer('buk')
  if (edits.bok.length >= 2) store.setLayer('bok', edits.bok)
  else if (edits.bok.length === 0) store.clearLayer('bok')

  emit('close')
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9000;
  padding: 1rem;
}

.modal-box {
  background: white;
  border-radius: 14px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.25);
  width: min(760px, 100%);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 1.2rem 1.4rem 1rem;
  border-bottom: 1px solid #e2e8f0;
}

.header-left { display: flex; flex-direction: column; gap: 0.15rem; }
.modal-title { font-size: 1.1rem; font-weight: 700; color: #0f172a; margin: 0; }
.modal-subtitle { font-size: 0.78rem; color: #94a3b8; }

.close-btn {
  width: 30px; height: 30px;
  border: none; border-radius: 50%;
  background: #f1f5f9; color: #64748b;
  font-size: 1.1rem; font-weight: 700;
  cursor: pointer; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.close-btn:hover { background: #e2e8f0; color: #1e293b; }

/* Excel Sheet Tabs */
.sheet-tabs {
  display: flex;
  gap: 2px;
  padding: 0 1rem;
  background: #f1f5f9;
  border-bottom: 2px solid #e2e8f0;
}

.sheet-tab {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1rem;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: #e2e8f0;
  color: #64748b;
  font-size: 0.83rem;
  font-weight: 500;
  cursor: pointer;
  margin-bottom: -2px;
  transition: all 0.12s;
}
.sheet-tab:hover { background: #f8fafc; color: #1e293b; }
.sheet-tab.active {
  background: white;
  color: var(--tab-color, #1e293b);
  border-color: #e2e8f0;
  font-weight: 700;
  position: relative;
}
.sheet-tab.active::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0; right: 0; height: 2px;
  background: white;
}

.tab-icon {
  width: 10px; height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tab-count {
  font-size: 0.72rem;
  color: #94a3b8;
}

/* Table area */
.table-area {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 0.8rem 1rem;
  gap: 0.5rem;
}

.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.tbtn {
  padding: 0.3rem 0.75rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 6px;
  background: white;
  font-size: 0.81rem;
  color: #475569;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s;
}
.tbtn:hover { background: #f1f5f9; border-color: #94a3b8; }
.primary-tbtn { background: #1d4ed8; border-color: #1d4ed8; color: white; }
.primary-tbtn:hover { background: #1e40af; }
.danger-tbtn:hover { background: #fef2f2; border-color: #fca5a5; color: #b91c1c; }

.paste-hint {
  font-size: 0.78rem;
  color: #10b981;
  font-weight: 600;
}

/* Data table */
.table-scroll {
  flex: 1;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  max-height: 340px;
  scrollbar-width: thin;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}

.data-table thead {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f8fafc;
}

.data-table th {
  padding: 0.45rem 0.5rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.78rem;
  color: #64748b;
  border-bottom: 2px solid #e2e8f0;
  white-space: nowrap;
}

.th-hint { font-weight: 400; font-size: 0.7rem; color: #94a3b8; margin-left: 0.25rem; }

.data-table td {
  padding: 0.2rem 0.3rem;
  border-bottom: 1px solid #f8fafc;
}

.data-table tr:last-child td { border-bottom: none; }
.data-table tr:hover td { background: #f8fafc; }
.data-table tr.row-warn td { background: #fff7ed; }

.col-idx { width: 32px; text-align: right; color: #94a3b8; font-size: 0.75rem; padding-right: 0.5rem; }
.col-x { width: 46%; }
.col-z { width: 46%; }
.col-warn { width: 24px; }
.col-del { width: 28px; }

.cell-input {
  width: 100%;
  padding: 0.3rem 0.4rem;
  border: 1.5px solid transparent;
  border-radius: 4px;
  font-size: 0.83rem;
  background: transparent;
  color: #1e293b;
  text-align: right;
  font-variant-numeric: tabular-nums;
  transition: all 0.1s;
}
.cell-input:focus {
  outline: none;
  border-color: #3b82f6;
  background: white;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

.warn-icon { color: #f59e0b; font-size: 0.85rem; cursor: help; }

.del-btn {
  width: 22px; height: 22px;
  border: none; border-radius: 4px;
  background: transparent; color: #94a3b8;
  font-size: 1rem; font-weight: 700;
  cursor: pointer; line-height: 1;
}
.del-btn:hover { background: #fee2e2; color: #dc2626; }

.empty-row td {
  text-align: center;
  color: #94a3b8;
  font-size: 0.8rem;
  font-style: italic;
  padding: 1.5rem;
}

/* Stats */
.table-stats {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.77rem;
  color: #64748b;
  flex-wrap: wrap;
}
.stat { color: #475569; }
.stat-sep { color: #cbd5e1; }

/* Format hint */
.format-hint {
  font-size: 0.78rem;
  color: #94a3b8;
}
.format-hint summary { cursor: pointer; padding: 0.2rem 0; }
.format-body {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 0.6rem 0.8rem;
  margin-top: 0.3rem;
  line-height: 1.6;
  color: #475569;
}
.format-body code {
  display: block;
  font-family: monospace;
  font-size: 0.8rem;
  background: #f1f5f9;
  padding: 0.3rem 0.5rem;
  border-radius: 4px;
  margin-top: 0.3rem;
  white-space: pre;
  color: #1e293b;
}

/* Datei-Import / Projekt */
.file-section {
  border-top: 1px solid #e2e8f0;
  padding: 0.6rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.file-row-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  min-width: 56px;
}

.file-btn {
  padding: 0.28rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: white;
  font-size: 0.8rem;
  color: #475569;
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  transition: background 0.12s, border-color 0.12s;
}
.file-btn:hover { background: #f1f5f9; border-color: #94a3b8; }

.file-status-bar {
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.3rem 0.6rem;
  border-radius: 5px;
}
.file-status-bar.ok  { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
.file-status-bar.err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }

/* Footer */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.9rem 1.4rem;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.footer-info { flex: 1; }
.footer-warn { font-size: 0.78rem; color: #b45309; font-weight: 600; }

.footer-actions { display: flex; gap: 0.5rem; }

.btn-cancel {
  padding: 0.45rem 1.1rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 7px;
  background: white;
  font-size: 0.85rem;
  color: #64748b;
  cursor: pointer;
}
.btn-cancel:hover { background: #f1f5f9; }

.btn-apply {
  padding: 0.45rem 1.3rem;
  border: none;
  border-radius: 7px;
  background: #1d4ed8;
  color: white;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-apply:hover { background: #1e40af; }
</style>
