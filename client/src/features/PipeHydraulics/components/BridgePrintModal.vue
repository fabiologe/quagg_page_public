<template>
  <div class="print-modal-backdrop" @mousedown.self="$emit('close')">
    <div class="print-modal">

      <!-- Header -->
      <div class="pm-header">
        <h3 class="pm-title">Ausdruck / Export</h3>
        <button class="pm-close" @click="$emit('close')" title="Schließen">&times;</button>
      </div>

      <!-- Settings -->
      <div class="pm-settings">
        <div class="setting-group">
          <label>Format</label>
          <select v-model="paperKey">
            <option value="a4l">A4 quer</option>
            <option value="a3l">A3 quer</option>
            <option value="a4p">A4 hoch</option>
          </select>
        </div>
        <div class="setting-group">
          <label>Maßstab 1 :</label>
          <input type="number" v-model.number="scale" min="1" max="10000" step="1" style="width:72px" />
          <button class="sm-btn" @click="autoScale" title="Passt Maßstab so an, dass das Profil ins Blatt passt">Auto</button>
        </div>
        <div class="setting-group">
          <label>Überhöhung</label>
          <input type="number" v-model.number="ve" min="1" max="20" step="0.5" style="width:55px" />
          <span class="unit">×</span>
        </div>
        <div class="setting-group wide">
          <label>Titel</label>
          <input type="text" v-model="title" placeholder="Bezeichnung Querschnitt" style="flex:1;min-width:140px" />
        </div>
        <div class="setting-group wide">
          <label>Projekt</label>
          <input type="text" v-model="project" placeholder="Projektbezeichnung" style="flex:1;min-width:140px" />
        </div>
        <!-- Scale info -->
        <div class="scale-info">
          H 1:{{ scale }} · V 1:{{ vertScale }}
          <span v-if="profileFitsH && profileFitsV" class="fit-ok">passt</span>
          <span v-else class="fit-warn">Profil überschreitet Blatt</span>
        </div>
      </div>

      <!-- SVG Preview -->
      <div class="pm-preview">
        <svg
          :viewBox="`0 0 ${paper.mmW} ${paper.mmH}`"
          :width="previewW"
          :height="previewH"
          class="print-svg"
          ref="printSvgEl"
        >
          <defs>
            <clipPath :id="`pa-clip-${paperKey}`">
              <rect :x="PA.x" :y="PA.y" :width="PA.w" :height="PA.h" />
            </clipPath>
            <pattern id="print-hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="5" stroke="#4a5568" stroke-width="1.5" opacity="0.3" />
            </pattern>
          </defs>

          <!-- Page background + border -->
          <rect x="0" y="0" :width="paper.mmW" :height="paper.mmH" fill="white" />
          <rect x="1" y="1" :width="paper.mmW - 2" :height="paper.mmH - 2"
            fill="none" stroke="#374151" stroke-width="0.4" />

          <!-- ── Plot Area ─────────────────────────────────── -->
          <rect :x="PA.x" :y="PA.y" :width="PA.w" :height="PA.h" fill="#f8fafc" stroke="#374151" stroke-width="0.4" />

          <!-- Horizontal grid + Y-axis tick labels -->
          <g v-for="gl in printGridH" :key="'gh'+gl.z">
            <line :x1="PA.x" :y1="PA.y + gl.py" :x2="PA.x + PA.w" :y2="PA.y + gl.py"
              stroke="#dde3ec" stroke-width="0.3" />
            <text :x="PA.x - 1.5" :y="PA.y + gl.py + 1.1"
              font-family="Arial" font-size="2.8" fill="#4b5563" text-anchor="end">
              {{ gl.z.toFixed(2) }}
            </text>
          </g>

          <!-- Vertical grid + X-axis tick labels -->
          <g v-for="gl in printGridV" :key="'gv'+gl.x">
            <line :x1="PA.x + gl.px" :y1="PA.y" :x2="PA.x + gl.px" :y2="PA.y + PA.h"
              stroke="#dde3ec" stroke-width="0.3" />
            <text :x="PA.x + gl.px" :y="PA.y + PA.h + 4.5"
              font-family="Arial" font-size="2.8" fill="#4b5563" text-anchor="middle">
              {{ gl.x.toFixed(1) }}
            </text>
          </g>

          <!-- Axis labels -->
          <text
            :x="PA.x - YAXIS_TICK_W - 1"
            :y="PA.y + PA.h / 2"
            font-family="Arial" font-size="3" fill="#374151" text-anchor="middle"
            :transform="`rotate(-90, ${PA.x - YAXIS_TICK_W - 1}, ${PA.y + PA.h / 2})`">
            Höhe [m ü. NHN]
          </text>
          <text :x="PA.x + PA.w / 2" :y="PA.y + PA.h + 9"
            font-family="Arial" font-size="3" fill="#374151" text-anchor="middle">
            Stationierung [m]
          </text>

          <!-- kSt bands (clipped) -->
          <g :clip-path="`url(#pa-clip-${paperKey})`">
            <rect v-for="band in printKstBands" :key="band.id"
              :x="PA.x + band.px1" :y="PA.y" :width="band.px2 - band.px1" :height="PA.h"
              :fill="band.color" opacity="0.08" />
          </g>

          <!-- Profile content (clipped to PA) -->
          <g :clip-path="`url(#pa-clip-${paperKey})`" :transform="`translate(${PA.x}, ${PA.y})`">
            <!-- Terrain fill -->
            <path v-if="printTerrainFill" :d="printTerrainFill" fill="#d1d5db" fill-opacity="0.4" />
            <!-- Water Zone 1 -->
            <path v-if="printWaterZ1" :d="printWaterZ1" fill="#3b82f6" fill-opacity="0.28"
              stroke="#2563eb" stroke-width="0.35" />
            <!-- Water Zone 2 -->
            <path v-if="printWaterZ2" :d="printWaterZ2" fill="#14b8a6" fill-opacity="0.28"
              stroke="#0d9488" stroke-width="0.35" />
            <!-- Terrain line -->
            <path v-if="printTerrainLine" :d="printTerrainLine"
              fill="none" stroke="#374151" stroke-width="0.7" stroke-linejoin="round" />
            <!-- Bridge fill -->
            <path v-if="printBridgeFill" :d="printBridgeFill" fill="#64748b" fill-opacity="0.85" />
            <path v-if="printBridgeFill" :d="printBridgeFill" fill="url(#print-hatch)" />
            <!-- BUK line -->
            <path v-if="printBukLine" :d="printBukLine"
              fill="none" stroke="#d97706" stroke-width="0.55" stroke-dasharray="2.5,1.8" />
            <!-- BOK line -->
            <path v-if="printBokLine" :d="printBokLine"
              fill="none" stroke="#7c3aed" stroke-width="0.7" stroke-dasharray="2.5,1.8" />
            <!-- WSP line -->
            <line :x1="0" :y1="pZ(store.wsp)" :x2="PA.w" :y2="pZ(store.wsp)"
              stroke="#1d4ed8" stroke-width="0.7" stroke-dasharray="3.5,2" />
          </g>

          <!-- WSP label (outside clip so always visible) -->
          <text :x="PA.x + PA.w + 1.5" :y="PA.y + pZ(store.wsp) + 1.2"
            font-family="Arial" font-size="2.8" fill="#1d4ed8" font-weight="bold">
            WSP
          </text>

          <!-- ── Hydraulic Results Box ─────────────────────── -->
          <rect :x="HR.x" :y="HR.y" :width="HR.w" :height="HR.h"
            fill="#f0f9ff" stroke="#374151" stroke-width="0.35" rx="0.8" />
          <line :x1="HR.x" :y1="HR.y + 9" :x2="HR.x + HR.w" :y2="HR.y + 9"
            stroke="#e2e8f0" stroke-width="0.3" />
          <text :x="HR.x + 3" :y="HR.y + 6.5"
            font-family="Arial" font-size="3.2" font-weight="bold" fill="#1e293b">
            Hydraulische Ergebnisse  (WSP = {{ store.wsp.toFixed(2) }} m | I = {{ (store.slope*1000).toFixed(3) }} ‰ | {{ printStateLabel }})
          </text>
          <!-- Zone 1: Freispiegel -->
          <text v-if="!result.isSubmerged" :x="HR.x + 3" :y="HR.y + 15"
            font-family="Arial" font-size="2.9" fill="#1e40af">
            Zone 1 (Manning):
            Q₁ = {{ result.Q1_total.toFixed(3) }} m³/s ·
            A₁ = {{ result.A1_total.toFixed(3) }} m² ·
            v₁ = {{ result.v1_mean.toFixed(3) }} m/s ·
            R₁ = {{ result.R1_mean.toFixed(3) }} m
          </text>
          <!-- Zone 1: Druckabfluss (Orifice) -->
          <text v-if="result.isSubmerged" :x="HR.x + 3" :y="HR.y + 15"
            font-family="Arial" font-size="2.9" fill="#92400e">
            Zone 1 (Orifice, μ={{ store.mu.toFixed(2) }}<template v-if="store.zeta > 0">, ζ={{ store.zeta.toFixed(2) }}, μ_eff={{ result.mu_eff.toFixed(3) }}</template>):
            Q₁ = {{ result.Q1_total.toFixed(3) }} m³/s ·
            A_öffn. = {{ result.A_bridge.toFixed(3) }} m² ·
            Δh = {{ result.h_drive.toFixed(3) }} m
          </text>
          <!-- Zone 2 -->
          <text v-if="result.hasOverflow" :x="HR.x + 3" :y="HR.y + 21"
            font-family="Arial" font-size="2.9" fill="#0d9488">
            Zone 2 (Poleni, μD={{ store.muDeck.toFixed(2) }}):
            Q₂ = {{ result.Q2_total.toFixed(3) }} m³/s
            (Poleni: {{ result.Q_poleni.toFixed(3) }} m³/s) ·
            A₂ = {{ result.A2_total.toFixed(3) }} m²
          </text>
          <!-- Total -->
          <text :x="HR.x + 3" :y="result.hasOverflow ? HR.y + 27 : HR.y + 21"
            font-family="Arial" font-size="3.2" font-weight="bold" fill="#1d4ed8">
            Gesamt: Q = {{ result.Q_total.toFixed(3) }} m³/s
          </text>

          <!-- ── Title Block ────────────────────────────────── -->
          <rect :x="TB.x" :y="TB.y" :width="TB.w" :height="TB.h"
            fill="#f8fafc" stroke="#374151" stroke-width="0.4" />
          <!-- inner column dividers -->
          <line :x1="TB.x + TB.colTitle" :y1="TB.y" :x2="TB.x + TB.colTitle" :y2="TB.y + TB.h"
            stroke="#374151" stroke-width="0.3" />
          <line :x1="TB.x + TB.colScale" :y1="TB.y" :x2="TB.x + TB.colScale" :y2="TB.y + TB.h"
            stroke="#374151" stroke-width="0.3" />

          <!-- Title / Project column -->
          <text :x="TB.x + 3" :y="TB.y + 8"
            font-family="Arial" font-size="5" font-weight="bold" fill="#1e293b">
            {{ title || 'Querschnitt' }}
          </text>
          <text :x="TB.x + 3" :y="TB.y + 15"
            font-family="Arial" font-size="3.5" fill="#475569">
            {{ project || '–' }}
          </text>
          <text :x="TB.x + 3" :y="TB.y + 21"
            font-family="Arial" font-size="3" fill="#64748b">
            Datum: {{ today }}
          </text>

          <!-- Scale column -->
          <text :x="TB.x + TB.colTitle + 3" :y="TB.y + 8"
            font-family="Arial" font-size="3" fill="#475569" font-weight="bold">Maßstab</text>
          <text :x="TB.x + TB.colTitle + 3" :y="TB.y + 14"
            font-family="Arial" font-size="3.5" fill="#1e293b">
            H  1 : {{ scale }}
          </text>
          <text :x="TB.x + TB.colTitle + 3" :y="TB.y + 20"
            font-family="Arial" font-size="3.5" fill="#1e293b">
            V  1 : {{ vertScale }}
          </text>
          <text :x="TB.x + TB.colTitle + 3" :y="TB.y + 26"
            font-family="Arial" font-size="2.8" fill="#64748b">
            Überhöhung {{ ve }}×
          </text>

          <!-- Scale bar column -->
          <text :x="TB.x + TB.colScale + 3" :y="TB.y + 7"
            font-family="Arial" font-size="2.8" fill="#475569" font-weight="bold">Maßstabsleiste</text>
          <!-- Scale bar graphic -->
          <g :transform="`translate(${TB.x + TB.colScale + 4}, ${TB.y + 19})`">
            <!-- Black left half -->
            <rect x="0" y="-4" :width="scaleBarMm / 2" height="4" fill="#374151" />
            <!-- White right half (outlined) -->
            <rect :x="scaleBarMm / 2" y="-4" :width="scaleBarMm / 2" height="4"
              fill="white" stroke="#374151" stroke-width="0.3" />
            <!-- Tick marks -->
            <line x1="0" y1="-5" x2="0" y2="0" stroke="#374151" stroke-width="0.4" />
            <line :x1="scaleBarMm / 2" y1="-5" :x2="scaleBarMm / 2" y2="0" stroke="#374151" stroke-width="0.4" />
            <line :x1="scaleBarMm" y1="-5" :x2="scaleBarMm" y2="0" stroke="#374151" stroke-width="0.4" />
            <!-- Labels -->
            <text x="0" y="-7" font-family="Arial" font-size="2.5" fill="#374151" text-anchor="middle">0</text>
            <text :x="scaleBarMm / 2" y="-7" font-family="Arial" font-size="2.5" fill="#374151" text-anchor="middle">
              {{ (scaleBarReal / 2).toFixed(scaleBarDecimals) }}
            </text>
            <text :x="scaleBarMm" y="-7" font-family="Arial" font-size="2.5" fill="#374151" text-anchor="middle">
              {{ scaleBarReal.toFixed(scaleBarDecimals) }} m
            </text>
          </g>
        </svg>
      </div>

      <!-- Actions -->
      <div class="pm-actions">
        <button class="pm-btn primary" @click="doPrint">Drucken</button>
        <button class="pm-btn" @click="doSvgDownload">SVG speichern</button>
        <button class="pm-btn" @click="$emit('close')">Schließen</button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useBridgeStore } from '../stores/useBridgeStore.js'
import { useBridgeHydraulics } from '../composables/useBridgeHydraulics.js'

const emit = defineEmits(['close'])

const store = useBridgeStore()
const { interpZ, interpBridgeZ, bokRefZ } = useBridgeHydraulics()

// ── Settings ────────────────────────────────────────────────────────────────
const paperKey = ref('a4l')
const scale    = ref(100)   // horizontal scale denominator (1:scale)
const ve       = ref(5)     // vertical exaggeration
const title    = ref('')
const project  = ref('')

const PAPERS = {
  a4l: { mmW: 297, mmH: 210 },
  a3l: { mmW: 420, mmH: 297 },
  a4p: { mmW: 210, mmH: 297 },
}
const paper = computed(() => PAPERS[paperKey.value])

const today = new Date().toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' })

// ── World data ───────────────────────────────────────────────────────────────
const terrain   = computed(() => store.terrainPoints)
const bukProfRaw = computed(() => store.bukProfile.length >= 2 ? store.bukProfile : null)
const bokProfRaw = computed(() => store.bokProfile.length >= 2 ? store.bokProfile : null)

const worldXMin   = computed(() => terrain.value.length ? terrain.value[0].x : -10)
const worldXMax   = computed(() => terrain.value.length ? terrain.value[terrain.value.length - 1].x : 10)
const worldXRange = computed(() => worldXMax.value - worldXMin.value || 1)

const allZ = computed(() => {
  const zs = terrain.value.map(p => p.z)
  bukProfRaw.value?.forEach(p => zs.push(p.z))
  bokProfRaw.value?.forEach(p => zs.push(p.z))
  zs.push(store.wsp)
  return zs
})
const worldZMin   = computed(() => Math.min(...allZ.value))
const worldZMax   = computed(() => Math.max(...allZ.value))
const worldZRange = computed(() => worldZMax.value - worldZMin.value || 1)

// ── Layout (all coordinates in mm) ──────────────────────────────────────────
//
//   Page
//   ├─ Plot Area  (PA)      ← fills top portion
//   ├─ [gap 3]
//   ├─ Hydraulic Results   (HR)
//   ├─ [gap 3]
//   └─ Title Block         (TB)  ← anchored to bottom
//
const MARGIN     = 8    // page outer margin
const YAXIS_TICK_W = 16 // width reserved left of PA for z-tick labels
const YAXIS_LBL_W  = 5  // additional width for rotated y-axis label
const RIGHT_W      = 12 // right margin (room for WSP label)
const X_AXIS_H     = 11 // height below PA for x-tick labels + axis label
const GAP          = 3
const TB_H         = 30
const HR_H         = 30  // fixed, never shrinks (avoids PA jumping)

const PA_LEFT = computed(() => MARGIN + YAXIS_LBL_W + YAXIS_TICK_W)

const TB = computed(() => {
  const x = PA_LEFT.value
  const y = paper.value.mmH - MARGIN - TB_H
  const w = paper.value.mmW - x - RIGHT_W
  // Title block column positions (relative to TB.x)
  const colTitle = Math.round(w * 0.48)
  const colScale = Math.round(w * 0.72)
  return { x, y, w, h: TB_H, colTitle, colScale }
})

const HR = computed(() => ({
  x: PA_LEFT.value,
  y: TB.value.y - GAP - HR_H,
  w: TB.value.w,
  h: HR_H,
}))

const PA = computed(() => ({
  x: PA_LEFT.value,
  y: MARGIN,
  w: TB.value.w,
  h: HR.value.y - GAP - X_AXIS_H - MARGIN,
}))

// ── Scale & transforms ───────────────────────────────────────────────────────
//
//   Horizontal: 1 real metre → 1000/scale  mm on paper
//   Vertical:   1 real metre → ve×1000/scale mm on paper
//
//   Profile is centred horizontally in PA.w.
//   zMin always sits at the bottom of PA (y = PA.h).
//   Content outside PA is clipped by the SVG clipPath.

const mmPerMX = computed(() => 1000 / scale.value)                 // mm per real m (horiz)
const mmPerMZ = computed(() => ve.value * 1000 / scale.value)      // mm per real m (vert)

const profileMmW = computed(() => worldXRange.value * mmPerMX.value)
const profileMmH = computed(() => worldZRange.value * mmPerMZ.value)

// Horizontal centering offset within PA
const xOff = computed(() => Math.max(0, (PA.value.w - profileMmW.value) / 2))

const profileFitsH = computed(() => profileMmW.value <= PA.value.w + 0.01)
const profileFitsV = computed(() => profileMmH.value <= PA.value.h + 0.01)

// Group-local (origin = PA top-left corner)
function pwX(worldX) {
  return xOff.value + (worldX - worldXMin.value) * mmPerMX.value
}
function pZ(worldZ) {
  // zMin → PA.h (bottom),  zMin + PA.h/mmPerMZ → 0 (top)
  return PA.value.h - (worldZ - worldZMin.value) * mmPerMZ.value
}

const vertScale = computed(() => Math.round(scale.value / ve.value))

// ── Auto scale ───────────────────────────────────────────────────────────────
function autoScale() {
  const sX = worldXRange.value * 1000 / PA.value.w
  const sZ = worldZRange.value * ve.value * 1000 / PA.value.h
  const raw = Math.max(sX, sZ)
  const nice = [1,2,2.5,5,10,20,25,50,100,200,250,500,1000,2000,2500,5000,10000]
  scale.value = nice.find(s => s >= raw) ?? 10000
}

// ── Scale bar ────────────────────────────────────────────────────────────────
// Pick a nice real-world length that fits in ~35mm of the TB scale column
const scaleBarReal = computed(() => {
  const mmAvail = 35
  const realForBar = mmAvail * scale.value / 1000   // real metres that 35mm represents
  const steps = [0.1,0.2,0.25,0.5,1,2,2.5,5,10,20,25,50,100,200,250,500,1000,2000]
  return steps.find(s => s * 2 >= realForBar) ?? 2000
})
const scaleBarMm = computed(() => scaleBarReal.value * 1000 / scale.value)
const scaleBarDecimals = computed(() => scaleBarReal.value < 1 ? 2 : scaleBarReal.value < 10 ? 1 : 0)

// ── Grid ─────────────────────────────────────────────────────────────────────
function niceStep(range, targetLines) {
  const rough = range / targetLines
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1e-9))))
  for (const f of [1, 2, 2.5, 5, 10]) {
    if (f * mag >= rough) return f * mag
  }
  return 10 * mag
}

const printGridH = computed(() => {
  // Visible z-range at current scale: from worldZMin up to worldZMin + PA.h/mmPerMZ
  const zTop = worldZMin.value + PA.value.h / mmPerMZ.value
  const step = niceStep(Math.min(worldZRange.value, zTop - worldZMin.value), 6)
  const start = Math.ceil(worldZMin.value / step) * step
  const lines = []
  for (let z = start; z <= zTop + 1e-9; z = Math.round((z + step) * 1e9) / 1e9) {
    const py = pZ(z)
    if (py >= -0.5 && py <= PA.value.h + 0.5) lines.push({ z, py })
  }
  return lines
})

const printGridV = computed(() => {
  // x range that fits in PA (centered)
  const xLeft  = worldXMin.value - Math.max(0, (profileMmW.value - PA.value.w) / 2) / mmPerMX.value
  const xRight = xLeft + PA.value.w / mmPerMX.value
  const step = niceStep(Math.min(worldXRange.value, xRight - xLeft), 8)
  const start = Math.ceil(xLeft / step) * step
  const lines = []
  for (let x = start; x <= xRight + 1e-9; x = Math.round((x + step) * 1e9) / 1e9) {
    const px = pwX(x)
    if (px >= -0.5 && px <= PA.value.w + 0.5) lines.push({ x, px })
  }
  return lines
})

// ── kSt bands ────────────────────────────────────────────────────────────────
const printKstBands = computed(() => store.kstZones.map(z => ({
  id: z.id,
  color: z.color,
  px1: pwX(z.xLeft  == null ? worldXMin.value : Math.max(z.xLeft,  worldXMin.value)),
  px2: pwX(z.xRight == null ? worldXMax.value : Math.min(z.xRight, worldXMax.value)),
})))

// ── Visual clamping for BUK/BOK (same logic as editor) ──────────────────────
const bukDraw = computed(() => {
  const buk = bukProfRaw.value
  if (!buk) return null
  return buk.map(p => ({ x: p.x, z: Math.max(p.z, interpZ(terrain.value, p.x)) }))
})
const bokDraw = computed(() => {
  const bok = bokProfRaw.value
  const buk = bukDraw.value
  if (!bok) return null
  return bok.map(p => ({ x: p.x, z: Math.max(p.z, buk && buk.length >= 2 ? interpZ(buk, p.x) : interpZ(terrain.value, p.x)) }))
})

// ── Path builders (local coords: origin = PA top-left) ───────────────────────
function polylinePath(pts) {
  if (!pts?.length) return ''
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${pwX(p.x).toFixed(3)} ${pZ(p.z).toFixed(3)}`).join(' ')
}

const printTerrainLine = computed(() => polylinePath(terrain.value))

const printTerrainFill = computed(() => {
  const pts = terrain.value
  if (!pts.length) return ''
  const below = PA.value.h + 10   // well below visible area
  let d = `M ${pwX(pts[0].x).toFixed(3)} ${below.toFixed(3)} `
  d += pts.map(p => `L ${pwX(p.x).toFixed(3)} ${pZ(p.z).toFixed(3)}`).join(' ')
  d += ` L ${pwX(pts[pts.length - 1].x).toFixed(3)} ${below.toFixed(3)} Z`
  return d
})

const printBukLine = computed(() => polylinePath(bukDraw.value))

const printBokLine = computed(() => polylinePath(bokDraw.value))

const printBridgeFill = computed(() => {
  const buk = bukDraw.value
  const bok = bokDraw.value
  if (!buk || buk.length < 2 || !bok || bok.length < 2) return ''
  const top  = bok.map((p, i) => `${i === 0 ? 'M' : 'L'} ${pwX(p.x).toFixed(3)} ${pZ(p.z).toFixed(3)}`).join(' ')
  const back = [...buk].reverse().map(p => `L ${pwX(p.x).toFixed(3)} ${pZ(p.z).toFixed(3)}`).join(' ')
  return top + ' ' + back + ' Z'
})

const printWaterZ1 = computed(() => {
  const pts = terrain.value
  if (!pts.length) return ''
  const wsp = store.wsp
  const buk = bukProfRaw.value
  const bok = bokProfRaw.value
  const topPts = [], botPts = []
  for (const p of pts) {
    const bukz     = interpBridgeZ(buk, p.x)
    const bokInside = interpBridgeZ(bok, p.x)
    const bRef      = bokRefZ(bok, p.x)
    const ceilZ = bukz < Infinity ? Math.min(wsp, bukz)
                : bokInside < Infinity ? p.z
                : Math.min(wsp, bRef)
    if (ceilZ - p.z > 1e-4) {
      botPts.push({ x: p.x, z: p.z })
      topPts.push({ x: p.x, z: ceilZ })
    }
  }
  if (!topPts.length) return ''
  const top  = topPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${pwX(p.x).toFixed(3)} ${pZ(p.z).toFixed(3)}`).join(' ')
  const back = [...botPts].reverse().map(p => `L ${pwX(p.x).toFixed(3)} ${pZ(p.z).toFixed(3)}`).join(' ')
  return top + ' ' + back + ' Z'
})

const printWaterZ2 = computed(() => {
  const pts = terrain.value
  if (!pts.length) return ''
  const wsp = store.wsp
  const bok = bokProfRaw.value
  const topPts = [], botPts = []
  for (const p of pts) {
    const bRef = bokRefZ(bok, p.x)
    if (bRef === Infinity) continue
    const floorZ = Math.max(p.z, bRef)
    if (wsp - floorZ > 1e-4) {
      botPts.push({ x: p.x, z: floorZ })
      topPts.push({ x: p.x, z: wsp })
    }
  }
  if (!topPts.length) return ''
  const top  = topPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${pwX(p.x).toFixed(3)} ${pZ(p.z).toFixed(3)}`).join(' ')
  const back = [...botPts].reverse().map(p => `L ${pwX(p.x).toFixed(3)} ${pZ(p.z).toFixed(3)}`).join(' ')
  return top + ' ' + back + ' Z'
})

// ── Result ───────────────────────────────────────────────────────────────────
const result = computed(() => store.currentResult)

const PRINT_STATE_LABELS = ['Zustand 0', 'Zustand 1 – Freispiegel', 'Zustand 2 – Druckabfluss', 'Zustand 3 – Überströmung']
const printStateLabel = computed(() => PRINT_STATE_LABELS[result.value.state] ?? 'Zustand unbekannt')

// ── Preview sizing ────────────────────────────────────────────────────────────
const previewW = computed(() => Math.round(paper.value.mmW * 3.0))
const previewH = computed(() => Math.round(paper.value.mmH * 3.0))

const printSvgEl = ref(null)

// ── Export ────────────────────────────────────────────────────────────────────
function svgString() {
  const el = printSvgEl.value
  if (!el) return ''
  // Add explicit width/height in mm for correct print dimensions
  const clone = el.cloneNode(true)
  clone.setAttribute('width',  `${paper.value.mmW}mm`)
  clone.setAttribute('height', `${paper.value.mmH}mm`)
  return new XMLSerializer().serializeToString(clone)
}

function doPrint() {
  const data = svgString()
  if (!data) return
  const blob = new Blob([data], { type: 'image/svg+xml' })
  const url  = URL.createObjectURL(blob)
  const win  = window.open('', '_blank')
  win.document.write(`<!DOCTYPE html><html><head>
    <title>${title.value || 'Querschnitt'}</title>
    <style>
      @page { size: ${paper.value.mmW}mm ${paper.value.mmH}mm; margin: 0; }
      body  { margin: 0; }
      img   { display: block; width: ${paper.value.mmW}mm; height: ${paper.value.mmH}mm; }
    </style>
  </head><body>
    <img src="${url}" onload="setTimeout(()=>{window.print();URL.revokeObjectURL('${url}')},200)" />
  </body></html>`)
  win.document.close()
}

function doSvgDownload() {
  const data = svgString()
  if (!data) return
  const blob = new Blob([data], { type: 'image/svg+xml' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${(title.value || 'querschnitt').replace(/\s+/g, '_')}_1-${scale.value}.svg`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
</script>

<style scoped>
.print-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.52);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.print-modal {
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.35);
  display: flex;
  flex-direction: column;
  max-height: 95vh;
  width: min(98vw, 1050px);
  overflow: hidden;
}
.pm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1.2rem 0.65rem;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}
.pm-title { font-size: 1rem; font-weight: 700; color: #1e293b; margin: 0; }
.pm-close {
  border: 1px solid #e2e8f0; background: white; font-size: 1.1rem; line-height: 1;
  cursor: pointer; color: #64748b; padding: 0.2rem 0.55rem; border-radius: 5px;
}
.pm-close:hover { background: #f1f5f9; border-color: #94a3b8; }

.pm-settings {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem 1.1rem;
  align-items: center;
  padding: 0.65rem 1.2rem;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  flex-shrink: 0;
}
.setting-group {
  display: flex;
  align-items: center;
  gap: 0.32rem;
  font-size: 0.82rem;
}
.setting-group.wide { flex: 1; min-width: 200px; }
.setting-group label { color: #64748b; font-weight: 500; white-space: nowrap; }
.setting-group input, .setting-group select {
  padding: 0.22rem 0.38rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 5px;
  font-size: 0.82rem;
  background: white;
}
.setting-group input:focus, .setting-group select:focus { outline: none; border-color: #3b82f6; }
.unit { font-size: 0.74rem; color: #94a3b8; }
.sm-btn {
  font-size: 0.76rem; padding: 0.2rem 0.5rem;
  border: 1.5px solid #e2e8f0; border-radius: 4px;
  background: white; cursor: pointer; color: #475569;
}
.sm-btn:hover { background: #f1f5f9; }
.scale-info {
  font-size: 0.78rem;
  color: #64748b;
  padding: 0.2rem 0.5rem;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.fit-ok {
  color: #16a34a; font-weight: 600;
  padding: 0.1rem 0.45rem;
  background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px;
}
.fit-warn {
  color: #b45309; font-weight: 600;
  padding: 0.1rem 0.45rem;
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px;
}

.pm-preview {
  flex: 1;
  overflow: auto;
  padding: 0.9rem;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  background: #d1d5db;
}
.print-svg {
  display: block;
  box-shadow: 0 4px 20px rgba(0,0,0,0.22);
  background: white;
  flex-shrink: 0;
}

.pm-actions {
  display: flex;
  gap: 0.5rem;
  padding: 0.65rem 1.2rem;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  flex-shrink: 0;
}
.pm-btn {
  padding: 0.42rem 1rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 7px;
  font-size: 0.85rem;
  cursor: pointer;
  background: white;
  color: #475569;
  font-weight: 500;
}
.pm-btn:hover { background: #f1f5f9; }
.pm-btn.primary { background: #1d4ed8; color: white; border-color: #1d4ed8; }
.pm-btn.primary:hover { background: #1e40af; }
</style>
