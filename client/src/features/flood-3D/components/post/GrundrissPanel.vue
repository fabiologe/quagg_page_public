<template>
  <section class="f3d-plan">
    <div class="f3d-plan-controls">
      <div class="f3d-ctl-group" v-if="store.selectedRunIds.length > 1">
        <label>Lauf</label>
        <select v-model="activeRunId" class="f3d-select">
          <option v-for="id in store.selectedRunIds" :key="id" :value="id">{{ id }}</option>
        </select>
      </div>

      <div class="f3d-ctl-group">
        <label>Raster</label>
        <select v-model="raster" class="f3d-select">
          <option value="depth">Wassertiefe</option>
          <option value="umag">Geschwindigkeit (Oberfläche)</option>
          <option value="umagM">Geschwindigkeit (tiefengemittelt)</option>
          <option value="froude">Froude-Zahl</option>
          <option value="tau" :disabled="!hasTau">Sohlschubspannung</option>
          <option value="none">kein Raster</option>
        </select>
        <label class="f3d-check">
          <input type="checkbox" v-model="showContours" />
          Wasserspiegel-Höhenlinien
        </label>
        <div class="f3d-row" v-if="showContours">
          <span class="f3d-lbl">Intervall</span>
          <input type="number" step="0.05" min="0.01" v-model.number="contourInterval"
                 class="f3d-num" />
          <span class="f3d-lbl">m</span>
        </div>
        <label class="f3d-check">
          <input type="checkbox" v-model="showArrows" />
          Geschwindigkeitspfeile
        </label>
        <label class="f3d-check" v-if="raster !== 'none'">
          <input type="checkbox" v-model="umhuellend" @change="huelleUmschalten" />
          Umhüllende (Maximum über die Laufzeit)
        </label>
        <p v-if="huellenFortschritt > 0 && huellenFortschritt < 1"
           class="f3d-muted f3d-small">
          Umhüllende wird gebildet … {{ Math.round(huellenFortschritt * 100) }} %
        </p>
        <label class="f3d-check" v-if="raster === 'froude'">
          <input type="checkbox" v-model="showFroudeLine" />
          Grenzlinie Fr = 1 (strömend / schießend)
        </label>
        <p class="f3d-muted f3d-small">
          Dargestellt ab {{ TIEFE_TROCKEN * 1000 }} mm Wassertiefe;
          bis {{ TIEFE_BENETZT * 100 }} cm als helle Benetzung,
          darüber greift das Farbraster.
          <template v-if="gridLabel">
            Darstellungsraster {{ gridLabel }} (vom Rechennetz gemittelt).
          </template>
        </p>
      </div>

      <div class="f3d-ctl-group" v-if="raster !== 'none'">
        <label>
          Farbskala {{ RASTER_LABELS[raster] }}
          <KennwertHilfe :groesse="HILFE_SCHLUESSEL[raster]"
                         :wert="shownRange[1]" />
        </label>
        <div class="f3d-legend" :style="{ background: VIRIDIS_CSS }"></div>
        <div class="f3d-row f3d-legend-labels">
          <span class="f3d-mono">{{ fmt(shownRange[0]) }}</span>
          <span class="f3d-mono">{{ fmt(shownRange[1]) }} {{ RASTER_UNITS[raster] }}</span>
        </div>
        <label class="f3d-check">
          <input type="checkbox" v-model="lockScale" /> fixieren
        </label>
        <div class="f3d-row" v-if="lockScale">
          <input type="number" step="any" v-model.number="lockMin" class="f3d-num"
                 title="untere Grenze der Farbskala" />
          <span>bis</span>
          <input type="number" step="any" v-model.number="lockMax" class="f3d-num"
                 title="obere Grenze der Farbskala" />
        </div>
        <p v-if="skalaFehler" class="f3d-muted f3d-small">
          Grenzen unbrauchbar (leer oder von ≥ bis) — gezeichnet wird
          weiter mit dem automatischen Bereich.
        </p>
      </div>

      <div class="f3d-ctl-group">
        <label>Längsschnitt</label>
        <button class="f3d-btn" :class="{ 'f3d-btn-primary': sectionMode }"
                @click="toggleSection">
          {{ sectionMode ? 'Zwei Punkte klicken …' : 'Schnitt ziehen' }}
        </button>
        <button v-if="profile" class="f3d-btn" @click="clearProfile">
          Schnitt entfernen
        </button>
      </div>

      <div class="f3d-ctl-group" v-if="hover">
        <label>Cursor</label>
        <table class="f3d-probe">
          <tbody>
            <tr v-for="row in hover" :key="row[0]">
              <td>{{ row[0] }}</td>
              <td class="f3d-mono">{{ row[1] }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="error" class="f3d-error">{{ error }}</p>
      <p v-else-if="loading" class="f3d-muted f3d-small">lade Felddaten …</p>
    </div>

    <div class="f3d-plan-main">
      <div class="f3d-plan-canvas" ref="canvasHost">
        <canvas ref="canvas" @pointermove="onMove" @pointerleave="hover = null"
                @click="onClick"></canvas>
      </div>

      <div class="f3d-timebar" v-if="times.length">
        <button class="f3d-btn" @click="togglePlay">{{ playing ? '⏸' : '▶' }}</button>
        <input type="range" min="0" :max="times.length - 1" v-model.number="timeIdx" />
        <span class="f3d-mono">t = {{ fmt(times[timeIdx]) }} s</span>
      </div>

      <template v-if="profile">
        <UPlotChart title="Wasserspiegellängsschnitt" :series="profile.heights"
                    ylabel="Höhe in m NHN" xlabel="Station in m"
                    sync-key="f3d-schnitt" :height="230" />
        <UPlotChart title="Froude-Zahl entlang des Schnitts" :series="profile.froude"
                    ylabel="Fr" xlabel="Station in m"
                    sync-key="f3d-schnitt" :height="160" />
      </template>
    </div>
  </section>
</template>

<script setup>
// Grundriss mit Feldern + Schnitt/Längsprofil (Spez. Kap. 8): Wassertiefe/
// Geschwindigkeit/Sohlschubspannung als Farbraster, Wasserspiegel-Höhenlinien,
// Geschwindigkeitspfeile, Punktwerte am Cursor — und ein im Grundriss
// gezogener Längsschnitt mit Gelände, Wasserspiegel, Energielinie und
// Froude-Zahl. Alles clientseitig aus den vorhandenen Felddaten berechnet.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import KennwertHilfe from './KennwertHilfe.vue'
import { usePostStore } from '../../stores/usePostStore'
import { getGeometry, getTimesteps, getVolume, planFieldsCached }
  from '../../composables/useFieldCache'
import { TIEFE_TROCKEN, TIEFE_BENETZT } from '../../utils/anzeigeSchwellen'
import { bereichUngueltig, uebernehmeBereich, wirksamerBereich }
  from '../../utils/farbskala'
import { viridis, VIRIDIS_CSS } from '../../utils/colormap'
import { isoSegments } from '../../utils/marchingSquares'
import { einordnen } from '../../utils/kennwerte'
import UPlotChart from './UPlotChart.vue'

const G = 9.81
const RASTER_LABELS = { depth: 'Wassertiefe', umag: 'Geschwindigkeit (Oberfläche)',
  umagM: 'Geschwindigkeit (tiefengemittelt)', froude: 'Froude-Zahl',
  tau: 'Sohlschubspannung' }
const RASTER_UNITS = { depth: 'm', umag: 'm/s', umagM: 'm/s', froude: '—',
  tau: 'N/m²' }
// Rasterschlüssel -> Erklärtext (Oberflächen- und Tiefenmittel teilen sich
// die Einordnung der Fließgeschwindigkeit)
const HILFE_SCHLUESSEL = { depth: 'depth', umag: 'umag', umagM: 'umag',
  froude: 'froude', tau: 'bed_shear' }

const store = usePostStore()
const canvasHost = ref(null)
const canvas = ref(null)
const activeRunId = ref(null)
const times = ref([])
const timeIdx = ref(0)
const playing = ref(false)
const raster = ref('depth')
const showContours = ref(true)
const contourInterval = ref(0.1)
const showArrows = ref(false)
const showFroudeLine = ref(true)
const lockScale = ref(false)
const lockMin = ref(0)
const lockMax = ref(1)
const autoRange = ref([0, 1])
const hasTau = ref(false)
const hover = ref(null)
const sectionMode = ref(false)
const sectionPts = ref([])
const profile = ref(null)
const loading = ref(false)
const error = ref('')
const gridLabel = ref('')

const shownRange = computed(() => wirksamerBereich(
  lockScale.value, lockMin.value, lockMax.value, autoRange.value))
const skalaFehler = computed(() =>
  bereichUngueltig(lockScale.value, lockMin.value, lockMax.value))
// Beim Anhaken die Grenzen aus dem sichtbaren Bereich übernehmen —
// vorher sprang die Skala auf die Startwerte 0…1 und die Karte wurde
// flächig gelb, als wäre die Rechnung kaputt.
watch(lockScale, (an) => {
  if (an) [lockMin.value, lockMax.value] = uebernehmeBereich(autoRange.value)
})

const fmt = (v) => (v == null || Number.isNaN(v) ? '–'
  : Math.abs(v) >= 1000 ? v.toFixed(0) : v.toPrecision(3))

let terrain = null          // { z: Float32Array (ny*nx) }
let grid = null
let pf = null               // abgeleitete Grundrissfelder
let huelle = null           // Maximum je Rasterfeld ueber ALLE Zeitpunkte
const umhuellend = ref(false)
const huellenFortschritt = ref(0)
let playTimer = null
let requestSeq = 0
let resizeObs = null

// Der Grundriss braucht genau diese Felder — p, p_rgh, k, ω, νt, T
// wurden vorher bei jedem Zeitschritt mitgeladen und nie angefasst
function feldListe() {
  return hasTau.value ? ['alpha', 'U', 'bed_shear'] : ['alpha', 'U']
}

async function loadRun() {
  if (!activeRunId.value) return
  loading.value = true
  error.value = ''
  try {
    const [index, geo] = await Promise.all([
      getTimesteps(activeRunId.value), getGeometry(activeRunId.value)])
    grid = index.grid
    gridLabel.value = grid.spacing.map((s) => Number(s.toPrecision(3))).join(' × ') + ' m'
    hasTau.value = index.fields.includes('bed_shear')
    if (raster.value === 'tau' && !hasTau.value) raster.value = 'depth'
    terrain = geo.terrain
    times.value = index.timesteps.map((e) => e.time)
    if (timeIdx.value >= times.value.length) timeIdx.value = 0
    // Zeitcursor aus den anderen Ansichten übernehmen (Zeitreihen/3D)
    if (store.currentTime != null && times.value.length) {
      timeIdx.value = times.value.reduce((best, t, i) =>
        (Math.abs(t - store.currentTime) < Math.abs(times.value[best] - store.currentTime)
          ? i : best), 0)
    }
    await update()
  } catch (e) {
    error.value = e.message
    times.value = []
  } finally {
    loading.value = false
  }
}

// Maximum je Zelle ueber alle Ausgabezeitpunkte. Genau diese Karten
// wandern in den Bericht: die groesste Tiefe, die hoechste Geschwindigkeit
// und die groesste Froude-Zahl, die im Verlauf irgendwann aufgetreten sind
// — ein einzelner Zeitpunkt zeigt davon nur einen Ausschnitt.
async function baueHuelle() {
  const felder = ['depth', 'umag', 'umagM', 'froude', 'tau']
  const acc = {}
  huellenFortschritt.value = 0.001
  for (let i = 0; i < times.value.length; i++) {
    const vol = await getVolume(activeRunId.value, times.value[i], feldListe())
    const f = planFieldsCached(vol, terrain?.z)
    for (const name of felder) {
      const q = f[name]
      if (!q) continue
      if (!acc[name]) acc[name] = Float32Array.from(q)
      else for (let c = 0; c < q.length; c++) {
        // NaN (z. B. Froude am Benetzungsrand) darf das Maximum nicht kippen
        if (Number.isFinite(q[c]) && !(acc[name][c] >= q[c])) acc[name][c] = q[c]
      }
    }
    huellenFortschritt.value = (i + 1) / times.value.length
  }
  huelle = acc
  huellenFortschritt.value = 1
}

async function huelleUmschalten() {
  if (umhuellend.value && !huelle) {
    try {
      await baueHuelle()
    } catch (e) {
      error.value = e.message
      umhuellend.value = false
    }
  }
  draw()
}

async function update() {
  if (!grid || !times.value.length) return
  const seq = ++requestSeq
  try {
    const vol = await getVolume(activeRunId.value, times.value[timeIdx.value],
      feldListe())
    if (seq !== requestSeq) return
    store.currentTime = vol.time
    pf = planFieldsCached(vol, terrain?.z)
    draw()
    if (profile.value) computeProfile()
    // Beim Abspielen den Folgeschritt schon in den Cache holen — der
    // 700-ms-Takt laesst dafuer Luft, der Wechsel kommt dann ohne Laden
    if (playing.value && times.value.length > 1) {
      const naechster = (timeIdx.value + 1) % times.value.length
      getVolume(activeRunId.value, times.value[naechster], feldListe())
        .catch(() => {})
    }
  } catch (e) {
    if (seq === requestSeq) error.value = e.message
  }
}

// --- Zeichnen -------------------------------------------------------------

const PAD = 34   // Rand für Achsenbeschriftung

function layout() {
  const host = canvasHost.value
  const [nx, ny] = [pf.nx, pf.ny]
  const worldW = nx * pf.spacing[0]
  const worldH = ny * pf.spacing[1]
  const availW = host.clientWidth - PAD * 2
  const availH = Math.max(host.clientHeight, 380) - PAD * 2
  const scale = Math.min(availW / worldW, availH / worldH)
  return { nx, ny, worldW, worldH, scale,
    w: worldW * scale + PAD * 2, h: worldH * scale + PAD * 2 }
}

function worldToCanvas(L, x, y) {
  return [PAD + (x - pf.origin[0]) * L.scale,
    PAD + (pf.origin[1] + L.worldH - y) * L.scale]
}

// Welche Tiefe entscheidet, ob eine Zelle „nass" ist? Bei der Umhüllenden
// die größte je aufgetretene — sonst bliebe die Karte am Zeitpunkt t = 0
// vollständig leer, obwohl das Maximum überall Werte hat.
function maskeTiefe() {
  return umhuellend.value && huelle?.depth ? huelle.depth : pf.depth
}

function rasterValues() {
  if (umhuellend.value && huelle) return huelle[raster.value] ?? null
  if (raster.value === 'depth') return pf.depth
  if (raster.value === 'umag') return pf.umag
  if (raster.value === 'umagM') return pf.umagM
  if (raster.value === 'froude') return pf.froude
  if (raster.value === 'tau') return pf.tau
  return null
}

function draw() {
  if (!pf || !canvas.value) return
  const L = layout()
  const dpr = window.devicePixelRatio || 1
  const cv = canvas.value
  cv.width = L.w * dpr
  cv.height = L.h * dpr
  cv.style.width = `${L.w}px`
  cv.style.height = `${L.h}px`
  const ctx = cv.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#0a101f'
  ctx.fillRect(0, 0, L.w, L.h)

  const { nx, ny } = L
  const img = new OffscreenCanvas(nx, ny)
  const ictx = img.getContext('2d')
  const data = ictx.createImageData(nx, ny)

  // Gelände-Basis (blaugraue Schummerung nach Höhe)
  let zMin = Infinity
  let zMax = -Infinity
  if (terrain) {
    for (const z of terrain.z) { zMin = Math.min(zMin, z); zMax = Math.max(zMax, z) }
  }
  const zSpan = Math.max(zMax - zMin, 0.01)

  const values = rasterValues()
  let lo = Infinity
  let hi = -Infinity
  if (values) {
    for (let c = 0; c < values.length; c++) {
      const v = values[c]
      if (raster.value !== 'tau' && !(maskeTiefe()[c] > TIEFE_BENETZT)) continue
      if (raster.value === 'tau' && !(v > 1e-9)) continue
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1 }
    autoRange.value = [lo, hi]
  }
  const [rLo, rHi] = wirksamerBereich(lockScale.value, lockMin.value,
    lockMax.value, [lo, hi])
  const span = Math.max(rHi - rLo, 1e-9)

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const col = j * nx + i
      const p = ((ny - 1 - j) * nx + i) * 4
      const shade = terrain ? 0.35 + 0.5 * ((terrain.z[col] - zMin) / zSpan) : 0.5
      let r = 34 * shade + 14
      let g = 44 * shade + 18
      let b = 66 * shade + 30
      const tiefe = maskeTiefe()[col]
      const wet = tiefe > TIEFE_BENETZT
      // Benetzung: Wasser ist da, aber zu flach fuer belastbare Rasterwerte
      // — vorher blieben solche Saeulen unsichtbar ("trocken")
      const benetzt = !wet && tiefe > TIEFE_TROCKEN
      const show = values && (raster.value === 'tau' ? values[col] > 1e-9 : wet)
      if (show) {
        const [vr, vg, vb] = viridis((values[col] - rLo) / span)
        const a = 0.85
        r = r * (1 - a) + vr * a
        g = g * (1 - a) + vg * a
        b = b * (1 - a) + vb * a
      } else if (wet && raster.value === 'none') {
        r = 30; g = 70; b = 140
      } else if (benetzt && raster.value !== 'tau') {
        // heller Blauton ueber der Gelaendeschummerung
        const a = 0.45
        r = r * (1 - a) + 120 * a
        g = g * (1 - a) + 170 * a
        b = b * (1 - a) + 215 * a
      }
      data.data[p] = r
      data.data[p + 1] = g
      data.data[p + 2] = b
      data.data[p + 3] = 255
    }
  }
  ictx.putImageData(data, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(img, PAD, PAD, L.worldW * L.scale, L.worldH * L.scale)

  // Wasserspiegel-Höhenlinien
  if (showContours.value) {
    const surf = new Float32Array(pf.surface)
    for (let c = 0; c < surf.length; c++) {
      if (!(pf.depth[c] > TIEFE_BENETZT)) surf[c] = NaN
    }
    let sMin = Infinity
    let sMax = -Infinity
    for (const s of surf) if (!Number.isNaN(s)) { sMin = Math.min(sMin, s); sMax = Math.max(sMax, s) }
    if (Number.isFinite(sMin)) {
      const dz = Math.max(contourInterval.value || 0.1, 0.01)
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let lev = Math.ceil(sMin / dz) * dz; lev <= sMax; lev += dz) {
        for (const [i0, j0, i1, j1] of isoSegments(surf, nx, ny, lev)) {
          const [x0, y0] = worldToCanvas(L,
            pf.origin[0] + (i0 + 0.5) * pf.spacing[0],
            pf.origin[1] + (j0 + 0.5) * pf.spacing[1])
          const [x1, y1] = worldToCanvas(L,
            pf.origin[0] + (i1 + 0.5) * pf.spacing[0],
            pf.origin[1] + (j1 + 0.5) * pf.spacing[1])
          ctx.moveTo(x0, y0)
          ctx.lineTo(x1, y1)
        }
      }
      ctx.stroke()
    }
  }

  // Grenzlinie Fr = 1: trennt stroemenden von schiessendem Abfluss. Im
  // Wasserbau die Linie, an der man den Wechselsprung ablesen kann.
  if (raster.value === 'froude' && showFroudeLine.value) {
    const fr = rasterValues()
    if (fr) {
      const feld = new Float32Array(fr.length)
      const tiefe = umhuellend.value && huelle ? huelle.depth : pf.depth
      for (let c = 0; c < fr.length; c++) {
        feld[c] = tiefe[c] > TIEFE_BENETZT ? fr[c] : NaN
      }
      ctx.beginPath()
      ctx.strokeStyle = '#ff4d4d'
      ctx.lineWidth = 2
      for (const [i0, j0, i1, j1] of isoSegments(feld, nx, ny, 1.0)) {
        const [x0, y0] = worldToCanvas(L,
          pf.origin[0] + (i0 + 0.5) * pf.spacing[0],
          pf.origin[1] + (j0 + 0.5) * pf.spacing[1])
        const [x1, y1] = worldToCanvas(L,
          pf.origin[0] + (i1 + 0.5) * pf.spacing[0],
          pf.origin[1] + (j1 + 0.5) * pf.spacing[1])
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
      }
      ctx.stroke()
    }
  }

  // Geschwindigkeitspfeile
  if (showArrows.value) {
    let uMax = 0
    for (const u of pf.umag) uMax = Math.max(uMax, u)
    const stridePx = 26
    const stride = Math.max(1, Math.round(stridePx / (pf.spacing[0] * L.scale)))
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1.3
    for (let j = 0; j < ny; j += stride) {
      for (let i = 0; i < nx; i += stride) {
        const col = j * nx + i
        if (!(pf.depth[col] > TIEFE_BENETZT) || pf.umag[col] < 1e-4) continue
        const len = (6 + 16 * (pf.umag[col] / (uMax || 1)))
        const ang = Math.atan2(-pf.uy[col], pf.ux[col])   // Canvas-y invertiert
        const [cx, cy] = worldToCanvas(L,
          pf.origin[0] + (i + 0.5) * pf.spacing[0],
          pf.origin[1] + (j + 0.5) * pf.spacing[1])
        const dx = Math.cos(ang)
        const dy = Math.sin(ang)
        ctx.beginPath()
        ctx.moveTo(cx - dx * len / 2, cy - dy * len / 2)
        ctx.lineTo(cx + dx * len / 2, cy + dy * len / 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(cx + dx * len / 2, cy + dy * len / 2)
        ctx.lineTo(cx + dx * len / 2 - dx * 4 - dy * 2.6, cy + dy * len / 2 - dy * 4 + dx * 2.6)
        ctx.lineTo(cx + dx * len / 2 - dx * 4 + dy * 2.6, cy + dy * len / 2 - dy * 4 - dx * 2.6)
        ctx.fill()
      }
    }
  }

  // Schnittlinie
  const pts = profile.value?.pts ?? sectionPts.value
  if (pts?.length) {
    ctx.strokeStyle = '#4d9fff'
    ctx.lineWidth = 2
    ctx.beginPath()
    pts.forEach(([x, y], idx) => {
      const [cx, cy] = worldToCanvas(L, x, y)
      idx ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy)
    })
    ctx.stroke()
    for (const [x, y] of pts) {
      const [cx, cy] = worldToCanvas(L, x, y)
      ctx.beginPath()
      ctx.arc(cx, cy, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#4d9fff'
      ctx.fill()
    }
  }

  // Achsen
  ctx.strokeStyle = 'rgba(143,160,194,0.5)'
  ctx.lineWidth = 1
  ctx.strokeRect(PAD, PAD, L.worldW * L.scale, L.worldH * L.scale)
  ctx.fillStyle = '#8fa0c2'
  ctx.font = '10px system-ui'
  ctx.textAlign = 'center'
  const xTicks = 5
  for (let t = 0; t <= xTicks; t++) {
    const wx = pf.origin[0] + (L.worldW * t) / xTicks
    const [cx] = worldToCanvas(L, wx, pf.origin[1])
    ctx.fillText(wx.toFixed(0), cx, L.h - PAD + 14)
  }
  ctx.save()
  ctx.textAlign = 'right'
  for (let t = 0; t <= xTicks; t++) {
    const wy = pf.origin[1] + (L.worldH * t) / xTicks
    const [, cy] = worldToCanvas(L, pf.origin[0], wy)
    ctx.fillText(wy.toFixed(0), PAD - 5, cy + 3)
  }
  ctx.restore()
  ctx.textAlign = 'center'
  ctx.fillText('x in m', L.w / 2, L.h - 4)
}

// --- Interaktion ----------------------------------------------------------

function canvasToWorld(e) {
  if (!pf) return null
  const L = layout()
  const rect = canvas.value.getBoundingClientRect()
  const px = e.clientX - rect.left
  const py = e.clientY - rect.top
  const x = pf.origin[0] + (px - PAD) / L.scale
  const y = pf.origin[1] + L.worldH - (py - PAD) / L.scale
  if (x < pf.origin[0] || y < pf.origin[1]
      || x > pf.origin[0] + L.worldW || y > pf.origin[1] + L.worldH) return null
  return [x, y]
}

function onMove(e) {
  const w = canvasToWorld(e)
  if (!w || !pf) { hover.value = null; return }
  const [x, y] = w
  const i = Math.min(pf.nx - 1, Math.floor((x - pf.origin[0]) / pf.spacing[0]))
  const j = Math.min(pf.ny - 1, Math.floor((y - pf.origin[1]) / pf.spacing[1]))
  const col = j * pf.nx + i
  const rows = [['Position', `${x.toFixed(2)} / ${y.toFixed(2)} m`]]
  if (terrain) rows.push(['Gelände', `${terrain.z[col].toFixed(2)} m`])
  if (pf.depth[col] > TIEFE_BENETZT) {
    rows.push(['Wasserspiegel', `${pf.surface[col].toFixed(2)} m`])
    rows.push(['Wassertiefe', `${fmt(pf.depth[col])} m`])
    rows.push(['|U| Oberfläche', `${fmt(pf.umag[col])} m/s`])
    rows.push(['|U| tiefengemittelt', `${fmt(pf.umagM[col])} m/s`])
    rows.push(['Froude-Zahl', `${fmt(pf.froude[col])}`
      + (pf.froude[col] > 1 ? ' (schießend)' : ' (strömend)')])
  } else if (pf.depth[col] > TIEFE_TROCKEN) {
    rows.push(['Zustand', 'benetzt'])
    rows.push(['Wassertiefe', `${fmt(pf.depth[col])} m`])
  } else {
    rows.push(['Zustand', 'trocken'])
  }
  if (pf.tau) {
    const st = einordnen('bed_shear', pf.tau[col])
    rows.push(['Sohlschubspannung', `${fmt(pf.tau[col])} N/m²`
      + (st && pf.depth[col] > TIEFE_BENETZT ? ` — ${st.text.split('.')[0]}` : '')])
  }
  hover.value = rows
}

function toggleSection() {
  sectionMode.value = !sectionMode.value
  sectionPts.value = []
}

function clearProfile() {
  profile.value = null
  sectionPts.value = []
  draw()
}

function onClick(e) {
  if (!sectionMode.value) return
  const w = canvasToWorld(e)
  if (!w) return
  sectionPts.value = [...sectionPts.value, w]
  if (sectionPts.value.length === 2) {
    profile.value = { pts: sectionPts.value }
    sectionMode.value = false
    computeProfile()
  }
  draw()
}

function sampleColumn(field, x, y) {
  const i = Math.min(pf.nx - 1, Math.max(0, Math.floor((x - pf.origin[0]) / pf.spacing[0])))
  const j = Math.min(pf.ny - 1, Math.max(0, Math.floor((y - pf.origin[1]) / pf.spacing[1])))
  return field[j * pf.nx + i]
}

function computeProfile() {
  if (!profile.value || !pf) return
  const [[x0, y0], [x1, y1]] = profile.value.pts
  const total = Math.hypot(x1 - x0, y1 - y0)
  const n = 160
  const s = []
  const ground = []
  const wsp = []
  const energy = []
  const froude = []
  const grenz = []
  for (let m = 0; m < n; m++) {
    const f = m / (n - 1)
    const x = x0 + (x1 - x0) * f
    const y = y0 + (y1 - y0) * f
    s.push(total * f)
    const g = terrain ? sampleColumn(terrain.z, x, y) : NaN
    ground.push(g)
    // Tiefe aus dem Phasenanteil und die TIEFENGEMITTELTE Geschwindigkeit —
    // mit der Oberflächengeschwindigkeit wären Energiehöhe und Froude-Zahl
    // systematisch zu groß (sie ist die schnellste im Profil).
    const h = sampleColumn(pf.hInt, x, y)
    if (h > TIEFE_TROCKEN) {
      const surf = sampleColumn(pf.surface, x, y)
      const u = sampleColumn(pf.umagM, x, y)
      wsp.push(surf)
      energy.push(surf + (u * u) / (2 * G))
      // Fr nur bei belastbarer Tiefe — im Benetzungsfilm dominiert das Raster
      froude.push(h > TIEFE_BENETZT ? u / Math.sqrt(G * h) : null)
      // Grenztiefe aus dem spezifischen Abfluss q = u·h: y_kr = (q²/g)^(1/3).
      // Wo der Wasserspiegel sie schneidet, geht der Abfluss durch den
      // kritischen Zustand — die Linie, an der man Kontrollquerschnitte
      // im Längsschnitt ablesen kann.
      const q = u * h
      grenz.push(g + Math.cbrt((q * q) / G))
    } else {
      wsp.push(null)
      energy.push(null)
      froude.push(null)
      grenz.push(null)
    }
  }
  profile.value = {
    pts: profile.value.pts,
    heights: [
      { label: 'Gelände', t: s, v: ground, color: '#c98500' },
      { label: 'Wasserspiegel', t: s, v: wsp, color: '#3987e5' },
      { label: 'Energielinie', t: s, v: energy, color: '#199e70', dash: [6, 4], width: 1.5 },
      { label: 'Grenztiefe', t: s, v: grenz, color: '#d55181', dash: [2, 3], width: 1 },
    ],
    froude: [
      { label: 'Froude-Zahl', t: s, v: froude, color: '#d55181' },
      { label: 'Fr = 1 (kritisch)', t: [0, total], v: [1, 1],
        color: '#e66767', dash: [4, 4], width: 1 },
    ],
  }
}

function togglePlay() {
  playing.value = !playing.value
  if (playing.value) {
    playTimer = setInterval(() => {
      timeIdx.value = (timeIdx.value + 1) % times.value.length
    }, 700)
  } else {
    clearInterval(playTimer)
  }
}

onMounted(() => {
  activeRunId.value = store.selectedRunIds[0] ?? null
  loadRun()
  resizeObs = new ResizeObserver(() => { if (pf) draw() })
  resizeObs.observe(canvasHost.value)
})

watch(() => store.selectedRunIds, (ids) => {
  if (!ids.includes(activeRunId.value)) activeRunId.value = ids[0] ?? null
}, { deep: true })
watch(activeRunId, loadRun)
watch(timeIdx, update)
watch([raster, showContours, contourInterval, showArrows, lockScale,
  lockMin, lockMax, umhuellend, showFroudeLine], () => draw())
// Laufwechsel verwirft die Umhüllende — sie gehört zu genau einem Lauf
watch(activeRunId, () => { huelle = null; umhuellend.value = false
  huellenFortschritt.value = 0 })

onBeforeUnmount(() => {
  clearInterval(playTimer)
  resizeObs?.disconnect()
})
</script>

<style scoped>
.f3d-plan {
  display: flex;
  gap: 14px;
  min-height: 560px;
}
.f3d-plan-controls {
  width: 250px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.f3d-plan-controls > * { min-width: 0; }
.f3d-ctl-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--f3d-surface);
  border: 1px solid var(--f3d-border);
  border-radius: 10px;
  padding: 10px 12px;
}
.f3d-ctl-group > label:first-child {
  color: var(--f3d-text-2);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.f3d-check {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--f3d-text);
  font-size: 0.8rem;
}
.f3d-row { display: flex; align-items: center; gap: 8px; }
.f3d-row input[type='range'] { flex: 1; min-width: 0; }
.f3d-lbl { color: var(--f3d-text-2); font-size: 0.75rem; white-space: nowrap; }
.f3d-num { width: 76px; }
.f3d-mono {
  font-variant-numeric: tabular-nums;
  color: var(--f3d-text-2);
  font-size: 0.75rem;
  white-space: nowrap;
}
.f3d-legend { height: 12px; border-radius: 4px; }
.f3d-legend-labels { justify-content: space-between; }
/* Die Cursor-Tabelle bleibt in der Spalte. Die Sohlschubspannungs-Zeile
   traegt einen Klartext („Kies wird transportiert — ohne Sohlsicherung
   entsteht hier Kolk"); mit dem geerbten white-space: nowrap der
   f3d-mono-Zellen lief die Zeile 100–160 px in den Canvas hinein. */
.f3d-probe {
  border-collapse: collapse;
  font-size: 0.74rem;
  width: 100%;
  table-layout: fixed;
}
.f3d-probe td {
  padding: 2px 6px 2px 0;
  color: var(--f3d-text);
  border-bottom: 1px solid var(--f3d-border);
  white-space: normal;
  overflow-wrap: anywhere;
}
.f3d-probe td:first-child { width: 41%; }
.f3d-probe td:first-child { color: var(--f3d-text-2); }
.f3d-plan-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.f3d-plan-canvas {
  flex: 1;
  min-height: 420px;
  border: 1px solid var(--f3d-border);
  border-radius: 10px;
  background: var(--f3d-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.f3d-plan-canvas canvas { cursor: crosshair; }
.f3d-timebar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--f3d-surface);
  border: 1px solid var(--f3d-border);
  border-radius: 10px;
  padding: 8px 12px;
}
.f3d-timebar input[type='range'] { flex: 1; }
</style>
