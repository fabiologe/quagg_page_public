<template>
  <div class="bridge-profile-editor">

    <!-- Layer-Auswahl + Toolbar -->
    <div class="editor-toolbar">
      <div class="layer-tabs">
        <button v-for="layer in LAYERS" :key="layer.id"
          :class="['layer-tab', { active: activeLayer === layer.id }]"
          :style="activeLayer === layer.id ? { borderColor: layer.color, color: layer.color } : {}"
          @click="activeLayer = layer.id"
          :title="layer.hint">
          <span class="layer-dot" :style="{ background: layer.color }"></span>
          {{ layer.label }}
          <span class="layer-count" v-if="getLayerPoints(layer.id).length">
            ({{ getLayerPoints(layer.id).length }})
          </span>
        </button>
      </div>
      <div class="toolbar-actions">
        <button class="tool-btn undo-btn" @click="store.undo()" :disabled="!store.canUndo"
          title="Rückgängig (Strg+Z)">&#x21A9;</button>
        <button class="tool-btn undo-btn" @click="store.redo()" :disabled="!store.canRedo"
          title="Wiederholen (Strg+Y)">&#x21AA;</button>
        <div class="toolbar-sep"></div>
        <button class="tool-btn" @click="clearActiveLayer" title="Aktiven Layer leeren">
          Leeren
        </button>
        <button v-if="activeLayer !== 'terrain'" class="tool-btn danger"
          @click="clearBridgeLayer" :title="`${activeLayerMeta.label} komplett entfernen`">
          Entfernen
        </button>
        <div class="toolbar-sep"></div>
        <div class="view-controls">
          <button class="tool-btn" @click="resetView" title="Ansicht zurücksetzen (Fit All)">Fit</button>
          <span class="zoom-indicator">{{ zoomLevel.toFixed(1) }}×</span>
        </div>
        <button class="tool-btn print-btn" @click="showPrintModal = true" title="Ausdruck / Export">Drucken</button>
        <button class="tool-btn info-btn" @click="showInfoModal = true" title="Hydraulische Erklärung & Berechnungsprotokoll">Info</button>
      </div>
    </div>
    <BridgePrintModal v-if="showPrintModal" @close="showPrintModal = false" />
    <BridgeHydraulicsInfoModal v-if="showInfoModal" @close="showInfoModal = false" />

    <!-- Validierungspanel -->
    <BridgeValidationPanel />

    <!-- SVG Zeichenbereich -->
    <svg
      ref="svgEl"
      :viewBox="`0 0 ${SVG_W} ${SVG_H}`"
      class="profile-svg"
      :class="[`mode-${activeLayer}`, { 'mode-pan': dragState?.type === 'pan', 'mode-kst': dragState?.type === 'kst-bound' }]"
      @click="onSvgClick"
      @mousedown="onSvgMouseDown"
      @mousemove="onSvgMouseMove"
      @mouseup="endDrag"
      @mouseleave="endDrag"
      @wheel.prevent="onWheel"
      @contextmenu.prevent="onSvgRightClick"
    >
      <defs>
        <clipPath id="plot-area-clip">
          <rect :x="PAD.left" :y="PAD.top" :width="plotW" :height="plotH" />
        </clipPath>
        <pattern id="bridge-hatch" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="10" stroke="#4a5568" stroke-width="3.5" opacity="0.3" />
        </pattern>
        <pattern id="ground-dots" patternUnits="userSpaceOnUse" width="6" height="6">
          <circle cx="3" cy="3" r="1" fill="#9ca3af" opacity="0.4" />
        </pattern>
      </defs>

      <!-- Plot-Hintergrund -->
      <rect :x="PAD.left" :y="PAD.top" :width="plotW" :height="plotH" fill="#f8fafc" />

      <!-- kSt-Zonen Visualisierung (gefärbte Streifenboden) -->
      <g clip-path="url(#plot-area-clip)">
        <g v-for="zone in kstBands" :key="zone.id">
          <!-- Flächenfüllung -->
          <rect :x="zone.svgX1" :y="PAD.top" :width="zone.svgX2 - zone.svgX1" :height="plotH"
            :fill="zone.color" opacity="0.07" />
          <!-- Linke Grenzlinie (immer angezeigt, aber nur für explizite Grenzen draggable) -->
          <line :x1="zone.svgX1" :y1="PAD.top" :x2="zone.svgX1" :y2="PAD.top + plotH"
            :stroke="zone.color" stroke-width="1" stroke-dasharray="5,4" opacity="0.5" />
        </g>
      </g>

      <!-- kSt-Zonen Drag-Handles (nur für explizit gesetzte Grenzen) -->
      <g clip-path="url(#plot-area-clip)">
        <g v-for="zone in kstBands" :key="'kh-'+zone.id">
          <!-- Linke Grenze -->
          <g v-if="zone.hasLeft" style="cursor: col-resize"
            @mousedown.stop="startDragKstBound($event, zone.id, 'left')">
            <rect :x="zone.svgX1 - 7" :y="PAD.top" width="14" :height="plotH" fill="transparent" />
            <line :x1="zone.svgX1" :y1="PAD.top" :x2="zone.svgX1" :y2="PAD.top + plotH"
              :stroke="zone.color" stroke-width="2.5" opacity="0.75" />
            <rect :x="zone.svgX1 - 5" :y="PAD.top + plotH / 2 - 16" width="10" height="32"
              rx="5" :fill="zone.color" opacity="0.9" />
            <line :x1="zone.svgX1 - 2" :y1="PAD.top + plotH / 2 - 8" :x2="zone.svgX1 - 2" :y2="PAD.top + plotH / 2 + 8"
              stroke="white" stroke-width="1" opacity="0.7" />
            <line :x1="zone.svgX1 + 2" :y1="PAD.top + plotH / 2 - 8" :x2="zone.svgX1 + 2" :y2="PAD.top + plotH / 2 + 8"
              stroke="white" stroke-width="1" opacity="0.7" />
          </g>
          <!-- Rechte Grenze -->
          <g v-if="zone.hasRight" style="cursor: col-resize"
            @mousedown.stop="startDragKstBound($event, zone.id, 'right')">
            <rect :x="zone.svgX2 - 7" :y="PAD.top" width="14" :height="plotH" fill="transparent" />
            <line :x1="zone.svgX2" :y1="PAD.top" :x2="zone.svgX2" :y2="PAD.top + plotH"
              :stroke="zone.color" stroke-width="2.5" opacity="0.75" />
            <rect :x="zone.svgX2 - 5" :y="PAD.top + plotH / 2 - 16" width="10" height="32"
              rx="5" :fill="zone.color" opacity="0.9" />
            <line :x1="zone.svgX2 - 2" :y1="PAD.top + plotH / 2 - 8" :x2="zone.svgX2 - 2" :y2="PAD.top + plotH / 2 + 8"
              stroke="white" stroke-width="1" opacity="0.7" />
            <line :x1="zone.svgX2 + 2" :y1="PAD.top + plotH / 2 - 8" :x2="zone.svgX2 + 2" :y2="PAD.top + plotH / 2 + 8"
              stroke="white" stroke-width="1" opacity="0.7" />
          </g>
        </g>
      </g>

      <!-- Horizontale Gitterlinien -->
      <g clip-path="url(#plot-area-clip)">
        <line v-for="gl in gridH" :key="gl.z"
          :x1="PAD.left" :y1="gl.sy" :x2="PAD.left + plotW" :y2="gl.sy"
          stroke="#dde3ec" stroke-width="1" />
      </g>

      <!-- Geländeprofil (Terrain) – vor Brücke gezeichnet, damit Brücke es überdeckt -->
      <path v-if="terrainPathSvg" :d="terrainPathSvg"
        fill="none" stroke="#374151" stroke-width="2.5" stroke-linejoin="round"
        clip-path="url(#plot-area-clip)" />

      <!-- Wasser Zone 1 (Durchströmung) -->
      <path v-if="waterZ1Path" :d="waterZ1Path"
        fill="#3b82f6" fill-opacity="0.32" stroke="#2563eb" stroke-width="0.6"
        clip-path="url(#plot-area-clip)" />

      <!-- Wasser Zone 2 (Überströmung) -->
      <path v-if="waterZ2Path" :d="waterZ2Path"
        fill="#14b8a6" fill-opacity="0.36" stroke="#0d9488" stroke-width="0.6"
        clip-path="url(#plot-area-clip)" />

      <!-- Brückenbauwerk (zwischen BUK und BOK) – überdeckt Gelände und Wasser darunter -->
      <path v-if="bridgeFillPath" :d="bridgeFillPath"
        fill="#64748b" fill-opacity="1" clip-path="url(#plot-area-clip)" />
      <path v-if="bridgeFillPath" :d="bridgeFillPath"
        fill="url(#bridge-hatch)" clip-path="url(#plot-area-clip)" />

      <!-- Brückendecke (BOK-Linie, dicker) -->
      <path v-if="bokPathSvg" :d="bokPathSvg"
        fill="none" stroke="#475569" stroke-width="4"
        clip-path="url(#plot-area-clip)" />

      <!-- BUK-Linie -->
      <path v-if="bukPathSvg" :d="bukPathSvg"
        fill="none" stroke="#d97706" stroke-width="2" stroke-dasharray="8,5"
        clip-path="url(#plot-area-clip)" />

      <!-- BOK-Linie (Umriss) -->
      <path v-if="bokPathSvg" :d="bokPathSvg"
        fill="none" stroke="#7c3aed" stroke-width="2" stroke-dasharray="8,5"
        clip-path="url(#plot-area-clip)" />

      <!-- WSP Drag-Linie -->
      <g clip-path="url(#plot-area-clip)">
        <rect :x="PAD.left" :y="wy(store.wsp) - 10" :width="plotW" height="20"
          fill="transparent" style="cursor: row-resize"
          @mousedown.stop="startDragWSP" />
        <line :x1="PAD.left" :y1="wy(store.wsp)" :x2="PAD.left + plotW" :y2="wy(store.wsp)"
          stroke="#1d4ed8" stroke-width="2.5" pointer-events="none" />
      </g>
      <!-- WSP Griff -->
      <g :transform="`translate(${PAD.left + plotW * 0.5}, ${wy(store.wsp)})`"
        style="cursor: row-resize" @mousedown.stop="startDragWSP">
        <rect x="-32" y="-10" width="64" height="20" rx="10"
          fill="#1d4ed8" stroke="white" stroke-width="1.5" />
        <text x="0" y="4" text-anchor="middle" font-size="11" fill="white" font-weight="700">
          WSP {{ store.wsp.toFixed(2) }} m
        </text>
      </g>

      <!-- Achsen -->
      <line :x1="PAD.left" :y1="PAD.top" :x2="PAD.left" :y2="PAD.top + plotH"
        stroke="#94a3b8" stroke-width="1.5" />
      <line :x1="PAD.left" :y1="wy(0)" :x2="PAD.left + plotW" :y2="wy(0)"
        stroke="#94a3b8" stroke-width="1.5" />

      <!-- Y-Achsen Labels -->
      <text v-for="gl in gridH" :key="'yl'+gl.z"
        :x="PAD.left - 7" :y="gl.sy + 4"
        text-anchor="end" font-size="10.5" fill="#64748b">{{ gl.label }}</text>

      <!-- X-Achsen Labels -->
      <text v-for="gl in gridV" :key="'xl'+gl.x"
        :x="gl.sx" :y="SVG_H - PAD.bottom + 16"
        text-anchor="middle" font-size="10.5" fill="#64748b">{{ gl.label }}</text>

      <!-- Achsentitel -->
      <text :x="13" :y="PAD.top + plotH / 2" text-anchor="middle" font-size="11" fill="#94a3b8"
        :transform="`rotate(-90, 13, ${PAD.top + plotH / 2})`">Höhe (m)</text>
      <text :x="PAD.left + plotW / 2" :y="SVG_H - 4" text-anchor="middle" font-size="11" fill="#94a3b8">
        Abstand (m)
      </text>

      <!-- BUK/BOK/WSP Beschriftungen rechts -->
      <g v-if="store.bukProfile.length >= 2" font-size="11" fill="#d97706">
        <text :x="PAD.left + plotW + 5" :y="wy(bukMinZ) + 4">BUK {{ bukMinZ.toFixed(2) }}m</text>
      </g>
      <g v-if="store.bokProfile.length >= 2" font-size="11" fill="#7c3aed">
        <text :x="PAD.left + plotW + 5" :y="wy(bokMaxZ) - 2">BOK {{ bokMaxZ.toFixed(2) }}m</text>
      </g>

      <!-- kSt-Zonen Labels -->
      <g v-for="zone in kstBands" :key="'kl'+zone.id">
        <text :x="(zone.svgX1 + zone.svgX2) / 2" :y="PAD.top + plotH - 5"
          text-anchor="middle" font-size="10" :fill="zone.color" font-weight="600">
          {{ zone.label }} kSt={{ zone.kst }}
        </text>
      </g>

      <!-- Zonen-Labels im Profil -->
      <g v-if="z1LabelPos" text-anchor="middle" font-weight="600" clip-path="url(#plot-area-clip)">
        <text :x="z1LabelPos.x" :y="z1LabelPos.y" font-size="12" fill="#1e3a5f">Zone 1</text>
        <text :x="z1LabelPos.x" :y="z1LabelPos.y + 16" font-size="11" fill="#1e3a5f">
          {{ store.currentResult.Q1_total.toFixed(2) }} m³/s
        </text>
      </g>
      <g v-if="z2LabelPos" text-anchor="middle" font-weight="600" clip-path="url(#plot-area-clip)">
        <text :x="z2LabelPos.x" :y="z2LabelPos.y" font-size="12" fill="#064e3b">Zone 2</text>
        <text :x="z2LabelPos.x" :y="z2LabelPos.y + 16" font-size="11" fill="#064e3b">
          {{ store.currentResult.Q2_total.toFixed(2) }} m³/s
        </text>
      </g>

      <!-- Validierungs-Marker (Kreuzpunkte) -->
      <g clip-path="url(#plot-area-clip)">
        <!-- Fehler-Kreuzpunkte: rote senkrechte Linie + Raute oben -->
        <g v-for="(m, i) in allErrorMarkers" :key="'em'+i">
          <line
            :x1="wx(m.x)" :y1="PAD.top"
            :x2="wx(m.x)" :y2="PAD.top + plotH"
            stroke="#ef4444" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.85" />
          <polygon
            :points="`${wx(m.x)},${PAD.top + 2} ${wx(m.x)-7},${PAD.top + 14} ${wx(m.x)+7},${PAD.top + 14}`"
            fill="#ef4444" opacity="0.9" />
          <text :x="wx(m.x)" :y="PAD.top + 27"
            text-anchor="middle" font-size="9.5" fill="#b91c1c" font-weight="700">
            ✕ x={{ m.x.toFixed(2) }}
          </text>
        </g>
        <!-- Warn-Kreuzpunkte: orange gestrichelt + Dreieck -->
        <g v-for="(m, i) in allWarningMarkers" :key="'wm'+i">
          <line
            :x1="wx(m.x)" :y1="PAD.top"
            :x2="wx(m.x)" :y2="PAD.top + plotH"
            stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="4,4" opacity="0.7" />
          <polygon
            :points="`${wx(m.x)},${PAD.top + 4} ${wx(m.x)-6},${PAD.top + 14} ${wx(m.x)+6},${PAD.top + 14}`"
            fill="#f59e0b" opacity="0.85" />
        </g>
      </g>

      <!-- Profil-Punkte (alle Layer) -->
      <g clip-path="url(#plot-area-clip)">
        <g v-for="layer in LAYERS" :key="'pts-'+layer.id">
          <circle v-for="(pt, i) in getLayerPoints(layer.id)" :key="i"
            :cx="wx(pt.x)" :cy="wy(pt.z)" :r="activeLayer === layer.id ? 7 : 5"
            :fill="layer.color" :stroke="activeLayer === layer.id ? 'white' : 'rgba(255,255,255,0.6)'"
            :stroke-width="activeLayer === layer.id ? 2 : 1.5"
            :opacity="activeLayer === layer.id ? 1 : 0.4"
            :style="{ cursor: activeLayer === layer.id ? 'grab' : 'default', pointerEvents: activeLayer === layer.id ? 'all' : 'none' }"
            @mousedown.stop="startDragPoint($event, layer.id, i)" />
        </g>
      </g>
    </svg>

    <!-- Interaktionshinweis + Legende -->
    <div class="profile-footer">
      <div class="profile-legend">
        <span class="leg-item"><span class="leg-sw" style="background:#3b82f6;opacity:0.55"></span>Zone 1</span>
        <span class="leg-item"><span class="leg-sw" style="background:#14b8a6;opacity:0.55"></span>Zone 2</span>
        <span class="leg-item"><span class="leg-sw" style="background:#64748b"></span>Brücke</span>
        <span class="leg-item" v-for="l in LAYERS" :key="l.id">
          <span class="leg-dot" :style="{ background: l.color }"></span>{{ l.label }}
        </span>
      </div>
      <span class="interact-hint">Scroll: Zoom · Mitte / Ctrl+Klick: Pan · Klick: Punkt setzen · Rechtsklick: löschen</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useBridgeStore } from '../stores/useBridgeStore.js'
import { useBridgeHydraulics } from '../composables/useBridgeHydraulics.js'
import { useBridgeValidation } from '../composables/useBridgeValidation.js'
import BridgePrintModal from './BridgePrintModal.vue'
import BridgeValidationPanel from './BridgeValidationPanel.vue'
import BridgeHydraulicsInfoModal from './BridgeHydraulicsInfoModal.vue'

const store = useBridgeStore()
const { interpZ, interpBridgeZ, bokRefZ, buildZ1Vertices, buildZ2Vertices } = useBridgeHydraulics()
const { allErrorMarkers, allWarningMarkers } = useBridgeValidation()
const showPrintModal = ref(false)
const showInfoModal  = ref(false)

const svgEl = ref(null)
const activeLayer = ref('terrain')

// ─── Layer-Metadaten ─────────────────────────────────────────────────────────
const LAYERS = [
  { id: 'terrain', label: 'Gelände', color: '#374151', hint: 'Gerinnesohlprofil zeichnen' },
  { id: 'buk',     label: 'BUK',     color: '#d97706', hint: 'Brückenunterkante zeichnen' },
  { id: 'bok',     label: 'BOK',     color: '#7c3aed', hint: 'Brückenoberkante zeichnen' }
]

const activeLayerMeta = computed(() => LAYERS.find(l => l.id === activeLayer.value))

function getLayerPoints(layerId) {
  if (layerId === 'terrain') return store.terrainPoints
  if (layerId === 'buk') return store.bukProfile
  return store.bokProfile
}

// ─── SVG-Dimensionen ─────────────────────────────────────────────────────────
const SVG_W = 620
const SVG_H = 400
const PAD = { left: 52, right: 78, top: 22, bottom: 46 }
const plotW = SVG_W - PAD.left - PAD.right
const plotH = SVG_H - PAD.top - PAD.bottom

// ─── Automatischer Weltbereich (Datenbasis) ───────────────────────────────────
const worldMaxH = computed(() => {
  const allZ = [
    ...store.terrainPoints.map(p => p.z),
    ...store.bukProfile.map(p => p.z),
    ...store.bokProfile.map(p => p.z),
    store.wsp
  ]
  return Math.max(...allZ) * 1.25 + 1
})
const worldHalfW = computed(() => {
  const allX = [
    ...store.terrainPoints.map(p => Math.abs(p.x)),
    ...store.bukProfile.map(p => Math.abs(p.x)),
    ...store.bokProfile.map(p => Math.abs(p.x))
  ]
  return (allX.length ? Math.max(...allX) : 20) + 3
})

// ─── Ansichtszustand (Pan / Zoom) ─────────────────────────────────────────────
// null = Auto-Fit an Datenbereich; gesetzt = manueller Wert
const vMinX   = ref(null)
const vWidth  = ref(null)
const vMinZ   = ref(null)
const vHeight = ref(null)

// Effektive Ansichtsparameter
const vX0 = computed(() => vMinX.value  ?? -worldHalfW.value)
const vW  = computed(() => vWidth.value ?? 2 * worldHalfW.value)
const vZ0 = computed(() => vMinZ.value  ?? 0)
const vH  = computed(() => vHeight.value ?? worldMaxH.value)

const zoomLevel = computed(() => {
  if (vWidth.value == null) return 1
  return (2 * worldHalfW.value) / vWidth.value
})

function resetView() {
  vMinX.value = vWidth.value = vMinZ.value = vHeight.value = null
}

// ─── Koordinatentransformation ────────────────────────────────────────────────
function wx(worldX)   { return PAD.left + (worldX - vX0.value) / vW.value * plotW }
function wy(worldZ)   { return PAD.top  + plotH - (worldZ - vZ0.value) / vH.value * plotH }
function toWorldX(sx) { return vX0.value + (sx - PAD.left)         / plotW * vW.value }
function toWorldZ(sy) { return vZ0.value + (PAD.top + plotH - sy)  / plotH * vH.value }

// ─── Gitterlinien ─────────────────────────────────────────────────────────────
const gridH = computed(() => {
  const h = vH.value, z0 = vZ0.value
  const step = h > 20 ? 5 : h > 10 ? 2 : h > 4 ? 1 : h > 1.5 ? 0.5 : 0.1
  const lines = []
  for (let z = Math.floor(z0 / step) * step; z <= z0 + h + 0.001; z = +(z + step).toFixed(6)) {
    const sy = wy(z)
    if (sy >= PAD.top - 1 && sy <= PAD.top + plotH + 1)
      lines.push({ z, sy, label: Number.isInteger(z) ? z.toFixed(0) : z.toFixed(1) })
  }
  return lines
})

const gridV = computed(() => {
  const w = vW.value, x0 = vX0.value
  const step = w > 100 ? 20 : w > 40 ? 10 : w > 20 ? 5 : w > 8 ? 2 : 1
  const lines = []
  for (let x = Math.floor(x0 / step) * step; x <= x0 + w + 0.001; x = +(x + step).toFixed(6)) {
    const sx = wx(x)
    if (sx >= PAD.left - 1 && sx <= PAD.left + plotW + 1)
      lines.push({ x, sx, label: x.toFixed(0) })
  }
  return lines
})

// ─── Visuell geklemmte Profile (BUK ≥ Gelände, BOK ≥ BUK) ───────────────────
/** Für die SVG-Darstellung geklemmte BUK-Punkte: verhindert Linienkrümmungen unter dem Gelände */
const bukDrawPts = computed(() => {
  const terrain = store.terrainPoints
  if (terrain.length < 2) return store.bukProfile
  return store.bukProfile.map(p => ({
    x: p.x,
    z: Math.max(p.z, interpZ(terrain, p.x))
  }))
})

/** Für die SVG-Darstellung geklemmte BOK-Punkte: verhindert Kreuzung unter BUK */
const bokDrawPts = computed(() => {
  const buk = bukDrawPts.value
  if (buk.length < 2) return store.bokProfile
  return store.bokProfile.map(p => ({
    x: p.x,
    z: Math.max(p.z, interpZ(buk, p.x))
  }))
})

// ─── SVG-Pfade ────────────────────────────────────────────────────────────────
const terrainPathSvg = computed(() => {
  const pts = store.terrainPoints
  if (pts.length < 2) return ''
  return 'M ' + pts.map(p => `${wx(p.x).toFixed(1)},${wy(p.z).toFixed(1)}`).join(' L ')
})

const bukPathSvg = computed(() => {
  const pts = bukDrawPts.value
  if (pts.length < 2) return ''
  return 'M ' + pts.map(p => `${wx(p.x).toFixed(1)},${wy(p.z).toFixed(1)}`).join(' L ')
})

const bokPathSvg = computed(() => {
  const pts = bokDrawPts.value
  if (pts.length < 2) return ''
  return 'M ' + pts.map(p => `${wx(p.x).toFixed(1)},${wy(p.z).toFixed(1)}`).join(' L ')
})

/** Brückenfüllkörper: geklemmte BOK (oben) + geklemmte BUK umgekehrt (unten) */
const bridgeFillPath = computed(() => {
  const buk = bukDrawPts.value, bok = bokDrawPts.value
  if (buk.length < 2 || bok.length < 2) return ''
  const bokStr = bok.map(p => `${wx(p.x).toFixed(1)},${wy(p.z).toFixed(1)}`).join(' L ')
  const bukRev = [...buk].reverse().map(p => `${wx(p.x).toFixed(1)},${wy(p.z).toFixed(1)}`).join(' L ')
  return `M ${bokStr} L ${bukRev} Z`
})

/** Zone-1-Wasserpolygon: exakte Randkreuzpunkte via buildZ1Vertices */
const waterZ1Path = computed(() => {
  const segs = buildZ1Vertices(
    store.terrainPoints,
    store.bukProfile.length >= 2 ? store.bukProfile : null,
    store.bokProfile.length >= 2 ? store.bokProfile : null,
    store.wsp
  )
  if (segs.length < 2) return ''
  const bot = segs.map((s, i) => `${i === 0 ? 'M' : 'L'} ${wx(s.x).toFixed(1)},${wy(s.zBot).toFixed(1)}`).join(' ')
  const top = [...segs].reverse().map(s => `L ${wx(s.x).toFixed(1)},${wy(s.zTop).toFixed(1)}`).join(' ')
  return `${bot} ${top} Z`
})

/** Zone-2-Wasserpolygon: exakte Randkreuzpunkte via buildZ2Vertices */
const waterZ2Path = computed(() => {
  const segs = buildZ2Vertices(
    store.terrainPoints,
    store.bokProfile.length >= 2 ? store.bokProfile : null,
    store.wsp
  )
  if (segs.length < 2) return ''
  const bot = segs.map((s, i) => `${i === 0 ? 'M' : 'L'} ${wx(s.x).toFixed(1)},${wy(s.zBot).toFixed(1)}`).join(' ')
  const top = [...segs].reverse().map(s => `L ${wx(s.x).toFixed(1)},${wy(s.zTop).toFixed(1)}`).join(' ')
  return `${bot} ${top} Z`
})

// ─── kSt-Zonen als farbige Bereiche ──────────────────────────────────────────
const kstBands = computed(() => {
  const hw = worldHalfW.value
  return store.kstZones.map(z => {
    const xL = z.xLeft == null ? -hw : z.xLeft
    const xR = z.xRight == null ? hw : z.xRight
    return {
      id: z.id, kst: z.kst, color: z.color, label: z.label,
      svgX1: Math.max(PAD.left, wx(xL)),
      svgX2: Math.min(PAD.left + plotW, wx(xR)),
      hasLeft:  z.xLeft  != null,
      hasRight: z.xRight != null,
    }
  }).filter(z => z.svgX2 > z.svgX1)
})

// ─── Hilfswerte für Labels ─────────────────────────────────────────────────────
const bukMinZ = computed(() => store.bukProfile.length ? Math.min(...store.bukProfile.map(p => p.z)) : 0)
const bokMaxZ = computed(() => store.bokProfile.length ? Math.max(...store.bokProfile.map(p => p.z)) : 0)

const z1LabelPos = computed(() => {
  const terrain = store.terrainPoints
  if (!terrain.length) return null
  const h = Math.min(store.wsp, bukMinZ.value)
  if (h < 0.3) return null
  const xm = (terrain[0].x + terrain[terrain.length - 1].x) / 2
  const gz = interpZ(terrain, xm)
  const midZ = gz + (h - gz) * 0.45
  if (midZ >= h - 0.2) return null
  return { x: wx(xm), y: wy(midZ) }
})

const z2LabelPos = computed(() => {
  if (!store.currentResult.hasOverflow || store.bokProfile.length < 2) return null
  const boks = store.bokProfile
  const xm = (boks[0].x + boks[boks.length - 1].x) / 2
  const bokMid = interpBridgeZ(boks, xm)
  if (bokMid >= store.wsp - 0.3) return null
  return { x: wx(xm), y: wy(bokMid + (store.wsp - bokMid) * 0.45) }
})

// ─── Drag-Handling ─────────────────────────────────────────────────────────────
// type: 'wsp' | 'point' | 'pan'
const dragState = ref(null)
let clickWasDrag = false

function getSvgPos(e) {
  const svg = svgEl.value
  if (!svg) return null
  const rect = svg.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) / rect.width * SVG_W,
    y: (e.clientY - rect.top)  / rect.height * SVG_H
  }
}

// ─── Zoom per Scrollrad ───────────────────────────────────────────────────────
function onWheel(e) {
  e.preventDefault()
  const pos = getSvgPos(e)
  if (!pos || pos.x < PAD.left || pos.x > PAD.left + plotW ||
      pos.y < PAD.top  || pos.y > PAD.top  + plotH) return

  const factor = e.deltaY > 0 ? 1.18 : 1 / 1.18
  const curX0 = vX0.value, curW = vW.value
  const curZ0 = vZ0.value, curH = vH.value

  // Weltpunkt unter dem Mauszeiger bleibt fest
  const fixX = curX0 + (pos.x - PAD.left)         / plotW * curW
  const fixZ = curZ0 + (PAD.top + plotH - pos.y)  / plotH * curH

  const newW = curW * factor
  const newH = curH * factor
  vWidth.value  = newW
  vHeight.value = newH
  vMinX.value   = fixX - (pos.x - PAD.left)         / plotW * newW
  vMinZ.value   = fixZ - (PAD.top + plotH - pos.y)  / plotH * newH
}

// ─── Pan ──────────────────────────────────────────────────────────────────────
function startDragWSP(e) {
  e.preventDefault()
  dragState.value = { type: 'wsp' }
  clickWasDrag = false
}

function startDragPoint(e, layerId, index) {
  e.preventDefault()
  dragState.value = { type: 'point', layer: layerId, index }
  clickWasDrag = false
}

function startDragKstBound(e, zoneId, side) {
  e.preventDefault()
  dragState.value = { type: 'kst-bound', zoneId, side }
  clickWasDrag = true
}

function onSvgMouseDown(e) {
  // Mittlere Maustaste oder Ctrl+Links → Pan
  if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
    e.preventDefault()
    dragState.value = {
      type: 'pan',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX0: vX0.value,
      startZ0: vZ0.value
    }
    clickWasDrag = true
    return
  }
  clickWasDrag = false
}

function onSvgMouseMove(e) {
  if (!dragState.value) return
  clickWasDrag = true
  const pos = getSvgPos(e)
  if (!pos) return

  if (dragState.value.type === 'pan') {
    const svg = svgEl.value
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const dSvgX = (e.clientX - dragState.value.startClientX) / rect.width  * SVG_W
    const dSvgY = (e.clientY - dragState.value.startClientY) / rect.height * SVG_H
    vMinX.value = dragState.value.startX0 - dSvgX / plotW * vW.value
    vMinZ.value = dragState.value.startZ0 + dSvgY / plotH * vH.value
  } else if (dragState.value.type === 'wsp') {
    const z = toWorldZ(pos.y)
    store.wsp = Math.round(Math.max(0.05, Math.min(vZ0.value + vH.value * 0.97, z)) / 0.05) * 0.05
    store.save()
  } else if (dragState.value.type === 'point') {
    const { layer, index } = dragState.value
    const wx_ = Math.round(toWorldX(pos.x) * 100) / 100
    let wz = Math.round(Math.max(0, toWorldZ(pos.y)) * 100) / 100
    if (layer === 'buk' && store.terrainPoints.length >= 2)
      wz = Math.max(wz, Math.round(interpZ(store.terrainPoints, wx_) * 100) / 100)
    else if (layer === 'bok' && bukDrawPts.value.length >= 2)
      wz = Math.max(wz, Math.round(interpZ(bukDrawPts.value, wx_) * 100) / 100)
    store.movePoint(layer, index, { x: wx_, z: wz })
    const pts = getLayerPoints(layer)
    const newIdx = pts.findIndex(p => p.x === wx_ && p.z === wz)
    if (newIdx >= 0) dragState.value.index = newIdx
  } else if (dragState.value.type === 'kst-bound') {
    const { zoneId, side } = dragState.value
    const xWorld = Math.round(toWorldX(pos.x) * 100) / 100
    const zone = store.kstZones.find(z => z.id === zoneId)
    if (!zone) return
    if (side === 'left') {
      const max = zone.xRight != null ? zone.xRight - 0.1 : Infinity
      store.updateKstZone(zoneId, { xLeft: Math.min(xWorld, max) })
    } else {
      const min = zone.xLeft != null ? zone.xLeft + 0.1 : -Infinity
      store.updateKstZone(zoneId, { xRight: Math.max(xWorld, min) })
    }
    store.save()
  }
}

function endDrag() {
  dragState.value = null
}

function onSvgClick(e) {
  if (clickWasDrag) { clickWasDrag = false; return }
  if (e.target.tagName === 'circle') return

  const pos = getSvgPos(e)
  if (!pos) return
  if (pos.x < PAD.left || pos.x > PAD.left + plotW || pos.y < PAD.top || pos.y > PAD.top + plotH) return

  const wx_ = Math.round(toWorldX(pos.x) * 100) / 100
  let wz = Math.round(Math.max(0, toWorldZ(pos.y)) * 100) / 100
  if (activeLayer.value === 'buk' && store.terrainPoints.length >= 2)
    wz = Math.max(wz, Math.round(interpZ(store.terrainPoints, wx_) * 100) / 100)
  else if (activeLayer.value === 'bok' && bukDrawPts.value.length >= 2)
    wz = Math.max(wz, Math.round(interpZ(bukDrawPts.value, wx_) * 100) / 100)
  store.addPoint(activeLayer.value, { x: wx_, z: wz })
}

function onSvgRightClick(e) {
  const pos = getSvgPos(e)
  if (!pos) return

  const layerPts = getLayerPoints(activeLayer.value)
  let nearestIdx = -1, minDist = 20
  layerPts.forEach((pt, i) => {
    const dx = wx(pt.x) - pos.x
    const dz = wy(pt.z) - pos.y
    const d = Math.sqrt(dx * dx + dz * dz)
    if (d < minDist) { minDist = d; nearestIdx = i }
  })
  if (nearestIdx >= 0) store.deletePoint(activeLayer.value, nearestIdx)
}

// ─── Toolbar-Aktionen ──────────────────────────────────────────────────────────
function clearActiveLayer() {
  store.clearLayer(activeLayer.value)
}

function clearBridgeLayer() {
  store.clearLayer(activeLayer.value)
}

// ─── Tastaturkürzel ────────────────────────────────────────────────────────────
function onKeyDown(e) {
  if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); store.undo() }
  if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); store.redo() }
}
onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
</script>

<style scoped>
.bridge-profile-editor {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.layer-tabs {
  display: flex;
  gap: 0.3rem;
}

.layer-tab {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.7rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 6px;
  background: white;
  font-size: 0.82rem;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s;
}
.layer-tab:hover { background: #f1f5f9; }
.layer-tab.active { background: white; font-weight: 700; }

.layer-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.layer-count {
  font-size: 0.72rem;
  color: #94a3b8;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
}

.toolbar-sep {
  width: 1px;
  height: 18px;
  background: #e2e8f0;
  flex-shrink: 0;
}

.tool-btn {
  padding: 0.28rem 0.65rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: white;
  font-size: 0.8rem;
  color: #475569;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
  white-space: nowrap;
}
.tool-btn:hover { background: #f1f5f9; border-color: #94a3b8; }
.tool-btn:disabled { opacity: 0.35; cursor: not-allowed; pointer-events: none; }
.tool-btn.danger:hover { background: #fef2f2; border-color: #fca5a5; color: #b91c1c; }
.tool-btn.info-btn { color: #1d4ed8; border-color: #bfdbfe; background: #eff6ff; }
.tool-btn.info-btn:hover { background: #dbeafe; border-color: #93c5fd; }
.tool-btn.print-btn { color: #475569; }
.tool-btn.undo-btn { font-size: 0.95rem; padding: 0.2rem 0.55rem; }

.view-controls {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.zoom-indicator {
  font-size: 0.72rem;
  color: #94a3b8;
  min-width: 28px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.profile-svg {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: white;
  user-select: none;
  display: block;
}
.profile-svg.mode-terrain { cursor: crosshair; }
.profile-svg.mode-buk { cursor: crosshair; }
.profile-svg.mode-bok { cursor: crosshair; }
.profile-svg.mode-pan { cursor: grabbing; }
.profile-svg.mode-kst { cursor: col-resize !important; }

.profile-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0 0.2rem;
}

.profile-legend {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  font-size: 0.78rem;
  color: #64748b;
}

.interact-hint {
  font-size: 0.72rem;
  color: #b0bac6;
  font-style: italic;
  white-space: nowrap;
}

.leg-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.leg-sw {
  display: inline-block;
  width: 16px;
  height: 11px;
  border-radius: 3px;
}

.leg-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
</style>
