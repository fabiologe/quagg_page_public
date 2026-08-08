<template>
  <section class="f3d-raum">
    <div class="f3d-raum-controls">
      <div class="f3d-ctl-group" v-if="store.selectedRunIds.length > 1">
        <label>Lauf</label>
        <select v-model="activeRunId" class="f3d-select">
          <option v-for="id in store.selectedRunIds" :key="id" :value="id">{{ id }}</option>
        </select>
      </div>

      <div class="f3d-ctl-group">
        <label>Feldgröße</label>
        <div class="f3d-row">
          <select v-model="activeFieldKey" class="f3d-select f3d-grow">
            <option v-for="f in FIELD_OPTIONS" :key="f.key" :value="f.key">{{ f.label }}</option>
          </select>
          <KennwertHilfe :groesse="hilfeSchluessel" :wert="shownRange[1]" />
        </div>
        <p v-if="gridLabel" class="f3d-hint-inline">
          Darstellungsraster {{ gridLabel }} — die Felder sind vom
          Rechennetz auf dieses Raster gemittelt; lokale Verfeinerungen
          sind hier nicht mehr sichtbar.
        </p>
      </div>

      <div class="f3d-ctl-group">
        <label>Darstellung</label>
        <label class="f3d-check"><input type="checkbox" v-model="layers.structures" /> Bauwerke (Eingabegeometrie)</label>
        <label class="f3d-check">
          <input type="checkbox" v-model="praesentation" />
          Präsentation (Bauwerke und Gelände neutral grau)
        </label>
        <label class="f3d-check"><input type="checkbox" v-model="layers.meshSurface" /> Solver-Netz (Zellfacetten)</label>
        <label class="f3d-check"><input type="checkbox" v-model="layers.terrain" /> Gelände</label>
        <label class="f3d-check f3d-indent">
          <input type="checkbox" v-model="layers.terrainShear" :disabled="!layers.terrain" />
          Sohlschubspannung einfärben
        </label>
        <label class="f3d-check"><input type="checkbox" v-model="layers.surface" /> Wasseroberfläche (Isofläche α = {{ alphaIso.toFixed(2) }})</label>
        <label class="f3d-check f3d-sub" v-if="layers.surface">
          <input type="checkbox" v-model="realistisch" />
          Realistisch darstellen
        </label>
        <div class="f3d-row f3d-sub" v-if="layers.surface">
          <span class="f3d-lbl">Glättung</span>
          <input type="range" min="0" max="3" step="1" v-model.number="glaettung" />
          <span class="f3d-mono">{{ glaettung }}×</span>
        </div>
        <div class="f3d-row f3d-sub" v-if="layers.surface">
          <span class="f3d-lbl">α-Grenze</span>
          <input type="range" min="0.05" max="0.95" step="0.05" v-model.number="alphaIso" />
          <span class="f3d-mono">{{ alphaIso.toFixed(2) }}</span>
        </div>
        <p v-if="layers.surface && alphaIso !== ALPHA_NASS" class="f3d-hint-inline">
          Abweichend von α = {{ ALPHA_NASS }}: kleinere Werte zeigen mehr
          (auch teilgefüllte Zellen und Gischt), größere weniger. Farbskala
          und Punktabfrage bleiben bei α ≥ {{ ALPHA_NASS }}.
        </p>
        <p v-if="layers.surface && glaettung === 0" class="f3d-hint-inline">
          Ohne Glättung zeigt die Oberfläche die Facetten des
          Darstellungsrasters — nicht die des Rechennetzes.
        </p>
        <p v-if="realistisch" class="f3d-hint-inline">
          Schaudarstellung: Glanzlicht und Wasserfarbe statt Feldeinfärbung.
          Die Geometrie bleibt exakt die gerechnete Oberfläche — für die
          Auswertung wieder abschalten.
        </p>
        <label class="f3d-check"><input type="checkbox" v-model="layers.film" /> Wasserfilm (flaches Wasser unter der α-Grenze)</label>
        <p v-if="layers.film" class="f3d-hint-inline">
          Zeigt Säulen mit Wasser ab {{ TIEFE_TROCKEN * 1000 }} mm Tiefe,
          die keine Isofläche erzeugen — sonst bliebe Wasser flacher als
          etwa eine halbe Rasterzelle unsichtbar.
        </p>
        <label class="f3d-check"><input type="checkbox" v-model="layers.body" /> Wasserkörper (Luftphase ausgeblendet)</label>
        <label class="f3d-check"><input type="checkbox" v-model="layers.slice" /> Schnittebene</label>
        <label class="f3d-check"><input type="checkbox" v-model="layers.arrows" /> Vektorpfeile</label>
        <label class="f3d-check"><input type="checkbox" v-model="layers.iso" /> Isofläche der Feldgröße</label>
        <label class="f3d-check"><input type="checkbox" v-model="layers.streamlines" /> Stromlinien</label>
      </div>

      <div class="f3d-ctl-group" v-if="layers.slice">
        <label>Schnitt</label>
        <div class="f3d-row">
          <select v-model="sliceAxis" class="f3d-select f3d-select-s">
            <option value="i">x</option>
            <option value="j">y</option>
            <option value="k">z</option>
          </select>
          <input type="range" min="0" :max="sliceMax" v-model.number="sliceIdx"
                 :disabled="sliceCount > 1" />
          <span class="f3d-mono">{{ sliceCount > 1 ? 'Stapel' : slicePosLabel }}</span>
        </div>
        <div class="f3d-row">
          <span class="f3d-lbl">Ebenen</span>
          <input type="range" min="1" max="8" step="1" v-model.number="sliceCount" />
          <span class="f3d-mono">{{ sliceCount }}</span>
        </div>
      </div>

      <div class="f3d-ctl-group" v-if="layers.arrows">
        <label>Vektorpfeile</label>
        <div class="f3d-row">
          <span class="f3d-lbl">Skalierung</span>
          <input type="range" min="0.5" max="8" step="0.5" v-model.number="arrowScale" />
          <span class="f3d-mono">{{ arrowScale }}</span>
        </div>
        <div class="f3d-row">
          <span class="f3d-lbl">Ausdünnung</span>
          <input type="range" min="2" max="8" step="1" v-model.number="arrowStride" />
          <span class="f3d-mono">jede {{ arrowStride }}. Zelle</span>
        </div>
        <label class="f3d-check">
          <input type="checkbox" v-model="arrowsOnSlice" :disabled="!layers.slice" />
          nur auf der Schnittebene
        </label>
      </div>

      <div class="f3d-ctl-group" v-if="layers.iso">
        <label>Isofläche {{ activeField.label }}</label>
        <div class="f3d-row">
          <input type="range" :min="shownRange[0]" :max="shownRange[1]"
                 :step="(shownRange[1] - shownRange[0]) / 100 || 0.01"
                 v-model.number="isoValue" />
          <input type="number" step="any" v-model.number="isoValue" class="f3d-num" />
        </div>
      </div>

      <div class="f3d-ctl-group" v-if="layers.streamlines">
        <label>Stromlinien</label>
        <div class="f3d-row">
          <span class="f3d-lbl">Anzahl</span>
          <input type="range" min="20" max="1500" step="20" v-model.number="slCount" />
          <span class="f3d-mono">{{ slCount }}</span>
        </div>
        <div class="f3d-row">
          <span class="f3d-lbl">Stärke</span>
          <input type="range" min="0.3" max="4" step="0.1" v-model.number="slThick" />
          <span class="f3d-mono">{{ slThick.toFixed(1) }}×</span>
        </div>
        <label class="f3d-check">
          <input type="checkbox" v-model="slSeedAll" />
          Startpunkte im ganzen Wasserkörper
        </label>
        <div class="f3d-row" v-if="!slSeedAll">
          <span class="f3d-lbl">Starthöhe</span>
          <input type="range" min="0" :max="grid ? grid.dims[2] - 1 : 0" v-model.number="slHeightIdx" />
          <span class="f3d-mono">{{ slHeightLabel }}</span>
        </div>
        <p v-if="slHeightAuto" class="f3d-hint-inline">
          Die gewählte Höhe liegt über dem Wasser — gezeichnet wird von der
          Ebene mit den meisten Nasszellen aus.
        </p>
        <div class="f3d-legend" :style="{ background: LEGEND_GRADIENT }"></div>
        <div class="f3d-row f3d-legend-labels">
          <span class="f3d-mono">{{ fmt(velRange[0]) }} m/s</span>
          <span class="f3d-mono">{{ fmt(velRange[1]) }} m/s</span>
        </div>
      </div>

      <div class="f3d-ctl-group">
        <label>Farbskala {{ activeField.label }} <span v-if="activeField.unit !== '—'">in {{ activeField.unit }}</span></label>
        <div class="f3d-legend" :style="{ background: LEGEND_GRADIENT }"></div>
        <div class="f3d-row f3d-legend-labels">
          <span class="f3d-mono">{{ fmt(shownRange[0]) }}</span>
          <span class="f3d-mono">{{ fmt(shownRange[1]) }}</span>
        </div>
        <label class="f3d-check">
          <input type="checkbox" v-model="colorLock" />
          fixieren (über Zeitpunkte und Läufe)
        </label>
        <div class="f3d-row" v-if="colorLock">
          <input type="number" step="any" v-model.number="colorMin" class="f3d-num"
                 title="untere Grenze der Farbskala" />
          <span>bis</span>
          <input type="number" step="any" v-model.number="colorMax" class="f3d-num"
                 title="obere Grenze der Farbskala" />
        </div>
        <p v-if="skalaFehler" class="f3d-hint-inline">
          Grenzen unbrauchbar (leer oder von ≥ bis) — dargestellt wird
          weiter der automatische Bereich.
        </p>
      </div>

      <div class="f3d-ctl-group" v-if="layers.terrain && layers.terrainShear">
        <div class="f3d-gruppenkopf">
          <span>Sohlschubspannung in N/m²</span>
          <KennwertHilfe groesse="bed_shear" :wert="tauRange[1]" />
        </div>
        <div class="f3d-legend" :style="{ background: LEGEND_GRADIENT }"></div>
        <div class="f3d-row f3d-legend-labels">
          <span class="f3d-mono">{{ fmt(tauRange[0]) }}</span>
          <span class="f3d-mono">{{ fmt(tauRange[1]) }}</span>
        </div>
      </div>

      <div class="f3d-ctl-group">
        <label>Punktabfrage</label>
        <label class="f3d-check">
          <input type="checkbox" v-model="probeActive" />
          Klick im Bild fragt Feldwerte ab
        </label>
        <table v-if="probeResult" class="f3d-probe">
          <tbody>
            <tr v-for="row in probeResult" :key="row[0]">
              <td>{{ row[0] }}</td>
              <td class="f3d-mono">{{ row[1] }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="f3d-ctl-group">
        <label>Kamera</label>
        <div class="f3d-row">
          <input v-model="viewName" class="f3d-num f3d-grow" placeholder="Name der Ansicht" />
          <button class="f3d-btn" @click="saveCurrentView" :disabled="!viewName.trim()">Speichern</button>
        </div>
        <div v-for="v in savedViews" :key="v.name" class="f3d-row f3d-view-row">
          <button class="f3d-btn f3d-grow" @click="applyView(v)" :title="`Ansicht ${v.name} anwenden`">{{ v.name }}</button>
          <button class="f3d-btn" @click="deleteView(v.name)" title="Ansicht löschen">✕</button>
        </div>
        <div class="f3d-row">
          <button class="f3d-btn f3d-grow" @click="resetCamera">Zurücksetzen</button>
          <button class="f3d-btn f3d-grow" @click="exportPng">PNG exportieren</button>
        </div>
      </div>

      <p v-if="error" class="f3d-error">{{ error }}</p>
      <p v-else-if="loading" class="f3d-muted">Felddaten werden geladen …</p>
    </div>

    <div class="f3d-raum-main">
      <div ref="viewport" class="f3d-viewport"
           @pointerdown="onPointerDown" @pointerup="onPointerUp"></div>
      <div class="f3d-timebar" v-if="times.length">
        <button class="f3d-btn" @click="togglePlay">{{ playing ? '⏸' : '▶' }}</button>
        <input type="range" min="0" :max="times.length - 1" v-model.number="timeIdx" />
        <span class="f3d-mono">t = {{ fmt(times[timeIdx]) }} s</span>
      </div>
    </div>
  </section>
</template>

<script setup>
// Räumliche Auswertung in 3D (Spez. Stufe 2b, Kap. 8) — vollständiges Set:
// Schwellwertfilter, Wasseroberfläche, Schnittebene, Sohlschubspannung,
// Vektorpfeile (Skalierung/Ausdünnung/Schnittebenen-Begrenzung), Isoflächen
// beliebiger Feldgrößen, Stromlinien mit einstellbaren Startpunkten,
// Punktabfrage, speicherbare Kamerastellungen (laufübergreifend, damit
// Abbildungen verschiedener Varianten deckungsgleich sind) und PNG-Export
// mit Laufkennung, Zeitpunkt, Größe und Wertebereich in der Unterschrift.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import '@kitware/vtk.js/Rendering/Profiles/Geometry'
import '@kitware/vtk.js/Rendering/Profiles/Volume'
import '@kitware/vtk.js/Rendering/Profiles/Glyph'
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow'
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData'
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray'
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData'
import vtkImageMarchingCubes from '@kitware/vtk.js/Filters/General/ImageMarchingCubes'
import vtkImageStreamline from '@kitware/vtk.js/Filters/General/ImageStreamline'
import vtkTubeFilter from '@kitware/vtk.js/Filters/General/TubeFilter'
import { VaryRadius } from '@kitware/vtk.js/Filters/General/TubeFilter/Constants'
import vtkArrowSource from '@kitware/vtk.js/Filters/Sources/ArrowSource'
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor'
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper'
import vtkGlyph3DMapper from '@kitware/vtk.js/Rendering/Core/Glyph3DMapper'
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume'
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper'
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice'
import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper'
import { SlicingMode } from '@kitware/vtk.js/Rendering/Core/ImageMapper/Constants'
import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker'
import vtkSTLReader from '@kitware/vtk.js/IO/Geometry/STLReader'
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction'
import vtkColorMaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps'
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction'
import KennwertHilfe from './KennwertHilfe.vue'
import { usePostStore } from '../../stores/usePostStore'
import { fetchGeometry, fetchTimesteps } from '../../services/volume'
import { getVolume } from '../../composables/useFieldCache'
import { glaetteFeldCached } from '../../utils/glaettung'
import { ALPHA_NASS, TIEFE_TROCKEN, TIEFE_BENETZT } from '../../utils/anzeigeSchwellen'
import { bereichUngueltig, uebernehmeBereich, wirksamerBereich }
  from '../../utils/farbskala'

const store = usePostStore()

// Alle Feldgrößen, die der Solver liefern kann. Angeboten wird nur, was
// im Lauf wirklich vorliegt (laminar hat kein k/omega/nut) — die Liste
// kommt aus dem Feldindex des Laufs.
const ALL_FIELDS = [
  { key: 'umag', label: 'Geschwindigkeitsbetrag', unit: 'm/s', needs: 'U' },
  { key: 'alpha', label: 'Wasseranteil (Phase)', unit: '—', needs: 'alpha' },
  { key: 'p_rgh', label: 'Druck (reduziert)', unit: 'Pa', needs: 'p_rgh' },
  { key: 'p', label: 'Druck (gesamt)', unit: 'Pa', needs: 'p' },
  { key: 'k', label: 'Turbulente kinetische Energie', unit: 'm²/s²', needs: 'k' },
  { key: 'omega', label: 'Turbulente Frequenz ω', unit: '1/s', needs: 'omega' },
  { key: 'nut', label: 'Wirbelviskosität', unit: 'm²/s', needs: 'nut' },
  { key: 'T', label: 'Markierungsstoff (Verweilzeit)', unit: '—', needs: 'T' },
]
const availableFieldKeys = ref(['umag', 'alpha', 'p_rgh'])
const FIELD_OPTIONS = computed(() =>
  ALL_FIELDS.filter((f) => availableFieldKeys.value.includes(f.needs)))
const LEGEND_GRADIENT = 'linear-gradient(90deg,#440154,#414487,#2a788e,#22a884,#7ad151,#fde725)'
const VIEWS_KEY = 'flood3d-camera-views'
const G = 9.81

const viewport = ref(null)
const activeRunId = ref(null)
const activeFieldKey = ref('umag')
// Schlüssel der Erklärtexte: der Viewer nennt den Geschwindigkeitsbetrag
// „umag", die Sohlschubspannung kommt aus einem eigenen Feld
const hilfeSchluessel = computed(() => activeFieldKey.value)
const layers = ref({
  terrain: true, terrainShear: true, surface: true, body: false, film: false,
  slice: false, arrows: false, iso: false, streamlines: false,
  structures: true, meshSurface: false,
})
// Isoflächen-Grenze der Wasseroberfläche — Vorgabe ALPHA_NASS, per Regler
// verstellbar (kleiner = mehr Wasser sichtbar, auch Gischt/Teilfüllung)
const alphaIso = ref(ALPHA_NASS)
const sliceAxis = ref('k')
const sliceIdx = ref(0)
const sliceCount = ref(1)      // Ebenenstapel entlang der Achse (Spez. Kap. 8)
const arrowScale = ref(3)
const arrowStride = ref(3)
const arrowsOnSlice = ref(false)
const isoValue = ref(0.5)
const slCount = ref(300)
const slThick = ref(1)          // Strichstärke, 1 = Standard
// Schaudarstellung: Wasser sieht aus wie Wasser statt wie eine Messfläche.
// Bewusst KEINE Auswertung — die Farbskala wird dabei bedeutungslos.
const realistisch = ref(false)
// true, wenn die gewählte Starthöhe trocken war und automatisch die
// nasseste Ebene genommen wurde
const slHeightAuto = ref(false)
const slSeedAll = ref(true)     // Startpunkte im ganzen Wasserkörper
const glaettung = ref(1)        // Durchgänge über das Alphafeld
const praesentation = ref(false)
const slHeightIdx = ref(16)
const velRange = ref([0, 1])
const times = ref([])
const timeIdx = ref(0)
const playing = ref(false)
const colorLock = ref(false)
const colorMin = ref(0)
const colorMax = ref(1)
const autoRange = ref([0, 1])
const tauRange = ref([0, 1])
const probeActive = ref(false)
const probeResult = ref(null)
const viewName = ref('')
const savedViews = ref([])
const loading = ref(false)
const error = ref('')
// effektive Aufloesung des Darstellungsrasters (Audit P2-6: stand nirgends)
const gridLabel = ref('')

const activeField = computed(() =>
  FIELD_OPTIONS.value.find((f) => f.key === activeFieldKey.value)
  ?? FIELD_OPTIONS.value[0])
const shownRange = computed(() => wirksamerBereich(
  colorLock.value, colorMin.value, colorMax.value, autoRange.value))
const skalaFehler = computed(() =>
  bereichUngueltig(colorLock.value, colorMin.value, colorMax.value))
// Grenzen beim Anhaken aus dem sichtbaren Bereich übernehmen (sonst
// Sprung auf die Startwerte 0…1)
watch(colorLock, (an) => {
  if (an) [colorMin.value, colorMax.value] = uebernehmeBereich(autoRange.value)
})

const fmt = (v) => (v == null || Number.isNaN(v) ? '–'
  : Math.abs(v) >= 1000 ? v.toFixed(0) : v.toPrecision(3))

// --- vtk-Szene (außerhalb der Vue-Reaktivität) ----------------------------
let grw = null
let renderer = null
let renderWindow = null
let resizeObs = null
let playTimer = null
let requestSeq = 0
let cameraInitialized = false
let grid = null
let terrainInfo = null            // { z: Float32Array, nx, ny } für die Punktabfrage
let currentVol = null
let downPos = null
const vtk = {}
// Skip-Guards: welche Daten zuletzt in die vtk-Images geschrieben wurden.
// Ein Layer-Toggle löste vorher die komplette Kette neu aus — Glättung,
// Maske, Marching Cubes —, obwohl sich die Daten gar nicht geändert hatten.
let lastAlphaKey = ''
let lastFieldKey = ''

function buildPipelines() {
  const preset = vtkColorMaps.getPresetByName('Viridis (matplotlib)')
  vtk.ctfField = vtkColorTransferFunction.newInstance()
  vtk.ctfField.applyColorMap(preset)
  vtk.ctfTau = vtkColorTransferFunction.newInstance()
  vtk.ctfTau.applyColorMap(preset)
  vtk.ctfVel = vtkColorTransferFunction.newInstance()
  vtk.ctfVel.applyColorMap(preset)

  // Gelände
  vtk.terrainData = vtkPolyData.newInstance()
  vtk.terrainMapper = vtkMapper.newInstance({ useLookupTableScalarRange: true })
  vtk.terrainMapper.setLookupTable(vtk.ctfTau)
  vtk.terrainMapper.setInputData(vtk.terrainData)
  vtk.terrainActor = vtkActor.newInstance()
  vtk.terrainActor.setMapper(vtk.terrainMapper)
  vtk.terrainActor.getProperty().setColor(0.45, 0.42, 0.38)

  // Phasenfeld -> Wasseroberfläche
  vtk.alphaImage = vtkImageData.newInstance()
  vtk.mc = vtkImageMarchingCubes.newInstance({ contourValue: 0.5, computeNormals: true, mergePoints: true })
  vtk.mc.setInputData(vtk.alphaImage)
  vtk.surfaceMapper = vtkMapper.newInstance({ useLookupTableScalarRange: true })
  vtk.surfaceMapper.setLookupTable(vtk.ctfField)
  vtk.surfaceActor = vtkActor.newInstance()
  vtk.surfaceActor.setMapper(vtk.surfaceMapper)
  vtk.surfaceActor.getProperty().setOpacity(0.92)
  vtk.surfaceActor.getProperty().setSpecular(0.3)

  // maskiertes Feld -> Volumen + Schnittebene + freie Isofläche
  vtk.fieldImage = vtkImageData.newInstance()
  vtk.volumeMapper = vtkVolumeMapper.newInstance()
  vtk.volumeMapper.setInputData(vtk.fieldImage)
  vtk.volumeActor = vtkVolume.newInstance()
  vtk.volumeActor.setMapper(vtk.volumeMapper)
  vtk.opacityFn = vtkPiecewiseFunction.newInstance()
  vtk.volumeActor.getProperty().setRGBTransferFunction(0, vtk.ctfField)
  vtk.volumeActor.getProperty().setScalarOpacity(0, vtk.opacityFn)
  vtk.volumeActor.getProperty().setInterpolationTypeToLinear()

  vtk.sliceMapper = vtkImageMapper.newInstance()
  vtk.sliceMapper.setInputData(vtk.fieldImage)
  vtk.sliceActor = vtkImageSlice.newInstance()
  vtk.sliceActor.setMapper(vtk.sliceMapper)
  vtk.sliceActor.getProperty().setRGBTransferFunction(0, vtk.ctfField)
  vtk.sliceActor.getProperty().setPiecewiseFunction(0, vtk.opacityFn)
  vtk.sliceActor.getProperty().setInterpolationTypeToNearest()

  vtk.isoMC = vtkImageMarchingCubes.newInstance({ contourValue: 0.5, computeNormals: true, mergePoints: true })
  vtk.isoMC.setInputData(vtk.fieldImage)
  vtk.isoMapper = vtkMapper.newInstance({ scalarVisibility: false })
  vtk.isoActor = vtkActor.newInstance()
  vtk.isoActor.setMapper(vtk.isoMapper)
  vtk.isoActor.getProperty().setOpacity(0.85)

  // Vektorpfeile: Länge relativ zur Zellgröße (Array 'len'), nicht absolut
  // in m/s — sonst verschwinden Pfeile bei langsamer Strömung. Ambient
  // angehoben, damit auch dunkle Skalenenden sichtbar bleiben.
  vtk.glyphData = vtkPolyData.newInstance()
  vtk.arrowSource = vtkArrowSource.newInstance({
    tipResolution: 10, shaftResolution: 10,
    tipRadius: 0.14, shaftRadius: 0.045, tipLength: 0.35 })
  vtk.glyphMapper = vtkGlyph3DMapper.newInstance({ useLookupTableScalarRange: true })
  vtk.glyphMapper.setInputData(vtk.glyphData, 0)
  vtk.glyphMapper.setInputConnection(vtk.arrowSource.getOutputPort(), 1)
  vtk.glyphMapper.setOrientationArray('vec')
  vtk.glyphMapper.setScaleArray('len')
  vtk.glyphMapper.setScaleModeToScaleByMagnitude()
  vtk.glyphMapper.setLookupTable(vtk.ctfVel)
  vtk.glyphActor = vtkActor.newInstance()
  vtk.glyphActor.setMapper(vtk.glyphMapper)
  vtk.glyphActor.getProperty().setAmbient(0.45)
  vtk.glyphActor.getProperty().setDiffuse(0.7)

  // Stromlinien
  vtk.vectorImage = vtkImageData.newInstance()
  vtk.seedPD = vtkPolyData.newInstance()
  vtk.slFilter = vtkImageStreamline.newInstance({ integrationStep: 0.3,
    maximumNumberOfSteps: 600 })
  // Der Radius wird beim Zeichnen aus der Modellgröße gesetzt (s. u.) — ein
  // fester Wert ergibt im 10-m-Becken Schläuche und im 200-m-Modell Fäden.
  // 4 Seiten reichen: bei zwei Pixel Strichstärke sieht niemand ein
  // Achteck, aber die Geometrie halbiert sich gegenüber 8 Seiten.
  vtk.tube = vtkTubeFilter.newInstance({ radius: 0.02, numberOfSides: 4,
    capping: false, varyRadius: VaryRadius.VARY_RADIUS_BY_SCALAR,
    radiusFactor: 2.5 })
  vtk.slMapper = vtkMapper.newInstance({ useLookupTableScalarRange: true })
  vtk.slMapper.setLookupTable(vtk.ctfVel)
  vtk.slActor = vtkActor.newInstance()
  vtk.slActor.setMapper(vtk.slMapper)
  // wenig Schattierung, damit die Farbskala die Farbe bestimmt und nicht
  // das Licht — bei dünnen Röhren sonst alles weißlich
  vtk.slActor.getProperty().setAmbient(0.55)
  vtk.slActor.getProperty().setDiffuse(0.55)
  vtk.slActor.getProperty().setSpecular(0.1)

  // Wasserfilm: flache Säulen, die keine Isofläche erzeugen (Σ α·dz über
  // TIEFE_TROCKEN, aber keine Zelle über der α-Grenze) — als heller,
  // durchscheinender Belag auf dem Gelände
  vtk.filmData = vtkPolyData.newInstance()
  vtk.filmMapper = vtkMapper.newInstance({ scalarVisibility: false })
  vtk.filmMapper.setInputData(vtk.filmData)
  vtk.filmActor = vtkActor.newInstance()
  vtk.filmActor.setMapper(vtk.filmMapper)
  vtk.filmActor.getProperty().setColor(0.55, 0.75, 0.92)
  vtk.filmActor.getProperty().setOpacity(0.55)
  vtk.filmActor.getProperty().setAmbient(0.4)

  vtk.picker = vtkCellPicker.newInstance()
  vtk.picker.setTolerance(0.005)
  vtk.structureActors = []
  vtk.meshActors = []
  vtk.sliceExtras = []

  const actors = [vtk.terrainActor, vtk.surfaceActor, vtk.filmActor,
    vtk.sliceActor, vtk.isoActor, vtk.glyphActor, vtk.slActor, vtk.volumeActor]
  // Bis zum ersten Datenpaket unsichtbar — Resize-Render auf leeren
  // ImageData bringt die Mapper sonst zum Absturz.
  for (const a of actors) a.setVisibility(false)
  for (const a of actors.slice(0, -1)) renderer.addActor(a)
  renderer.addVolume(vtk.volumeActor)
}

function setImageScalars(image, name, values, numberOfComponents = 1) {
  const { origin, spacing, dims } = grid
  image.setDimensions(dims[0], dims[1], dims[2])
  image.setSpacing(...spacing)
  image.setOrigin(origin[0] + spacing[0] / 2, origin[1] + spacing[1] / 2,
    origin[2] + spacing[2] / 2)
  image.getPointData().setScalars(
    vtkDataArray.newInstance({ name, values, numberOfComponents }))
  image.modified()
}

function buildTerrain(geo) {
  if (!geo.terrain) return          // Schicht fehlt — Rest bleibt nutzbar
  const [ny, nx] = geo.terrain.dims
  const { origin, spacing } = geo.grid
  terrainInfo = { z: geo.terrain.z, nx, ny }
  const pts = new Float32Array(nx * ny * 3)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const p = (j * nx + i) * 3
      pts[p] = origin[0] + (i + 0.5) * spacing[0]
      pts[p + 1] = origin[1] + (j + 0.5) * spacing[1]
      pts[p + 2] = geo.terrain.z[j * nx + i]
    }
  }
  const nTri = (nx - 1) * (ny - 1) * 2
  const cells = new Uint32Array(nTri * 4)
  let c = 0
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i
      cells.set([3, a, a + 1, a + nx + 1], c); c += 4
      cells.set([3, a, a + nx + 1, a + nx], c); c += 4
    }
  }
  vtk.terrainData.getPoints().setData(pts, 3)
  vtk.terrainData.getPolys().setData(cells)
  vtk.terrainData.modified()
}

function fieldArray(vol, key) {
  if (key === 'umag') {
    const U = vol.fields.U
    const n = U.data.length / 3
    const out = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const x = U.data[i]
      const y = U.data[n + i]
      const z = U.data[2 * n + i]
      out[i] = Math.sqrt(x * x + y * y + z * z)
    }
    return out
  }
  return vol.fields[key].data
}

function cellIndexAt(x, y, z) {
  const { origin, spacing, dims } = grid
  const i = Math.min(dims[0] - 1, Math.max(0, Math.round((x - origin[0]) / spacing[0] - 0.5)))
  const j = Math.min(dims[1] - 1, Math.max(0, Math.round((y - origin[1]) / spacing[1] - 0.5)))
  const k = Math.min(dims[2] - 1, Math.max(0, Math.round((z - origin[2]) / spacing[2] - 0.5)))
  return [i, j, k]
}

function sampleNearest(values, x, y, z) {
  const [i, j, k] = cellIndexAt(x, y, z)
  return values[(k * grid.dims[1] + j) * grid.dims[0] + i]
}

// Trilinear statt Nachbarzelle: die Einfärbung der Wasseroberfläche kam
// vorher aus JE EINER Zelle, dadurch die fleckigen Kacheln — mit
// Interpolation entsteht ein stetiger Verlauf. NaN-Nachbarn (Rasterzellen
// ohne Solverzelle, fill=NaN der Feldablage) werden übersprungen und die
// Gewichte neu normiert — sonst würde am Gelände jede Interpolation NaN.
function sampleLinear(values, x, y, z) {
  const { origin, spacing, dims } = grid
  const fx = (x - origin[0]) / spacing[0] - 0.5
  const fy = (y - origin[1]) / spacing[1] - 0.5
  const fz = (z - origin[2]) / spacing[2] - 0.5
  const i0 = Math.min(dims[0] - 2, Math.max(0, Math.floor(fx)))
  const j0 = Math.min(dims[1] - 2, Math.max(0, Math.floor(fy)))
  const k0 = Math.min(dims[2] - 2, Math.max(0, Math.floor(fz)))
  const tx = Math.min(1, Math.max(0, fx - i0))
  const ty = Math.min(1, Math.max(0, fy - j0))
  const tz = Math.min(1, Math.max(0, fz - k0))
  const at = (i, j, k) => values[(k * dims[1] + j) * dims[0] + i]
  let sum = 0
  let wsum = 0
  for (let dk = 0; dk <= 1; dk++) {
    for (let dj = 0; dj <= 1; dj++) {
      for (let di = 0; di <= 1; di++) {
        const v = at(i0 + di, j0 + dj, k0 + dk)
        if (!Number.isFinite(v)) continue
        const w = (di ? tx : 1 - tx) * (dj ? ty : 1 - ty) * (dk ? tz : 1 - tz)
        sum += v * w
        wsum += w
      }
    }
  }
  return wsum > 1e-12 ? sum / wsum : 0
}

// Die 3x3x3-Glättung des Alphafelds (Treppenstufen des Darstellungs-
// rasters brechen) lebt jetzt separabel und gecacht in utils/glaettung —
// vorher lief die 27-Nachbarn-Schleife bei JEDEM Szenen-Update neu.

function cellCenter(i, j, k) {
  const { origin, spacing } = grid
  return [origin[0] + (i + 0.5) * spacing[0],
    origin[1] + (j + 0.5) * spacing[1],
    origin[2] + (k + 0.5) * spacing[2]]
}

// Welche Felder die Szene wirklich braucht: alpha und U immer (Ober-
// fläche, Pfeile, Stromlinien), das aktive Feld, und bed_shear für die
// Geländeeinfärbung. Vorher lud jeder Zeitschritt ALLE Felder — p, k, ω,
// νt, T inklusive, auch wenn niemand sie ansah; nachgeladen wird bei
// Feldwechsel nur das Delta (gemeinsamer Cache mit dem Grundriss).
function benoetigteFelder() {
  const felder = new Set(['alpha', 'U'])
  const needs = activeField.value?.needs
  if (needs) felder.add(needs)
  if (availableFieldKeys.value.includes('bed_shear')) felder.add('bed_shear')
  return [...felder]
}

async function loadVolume(idx) {
  return getVolume(activeRunId.value, times.value[idx], benoetigteFelder())
}

// --- Teil-Updates ---------------------------------------------------------

function updateGlyphs(alpha, U, umag, vHi) {
  const { dims, spacing } = grid
  const [nx, ny] = [dims[0], dims[1]]
  const n = umag.length
  const stride = arrowStride.value
  const onSlice = arrowsOnSlice.value && layers.value.slice
  // horizontale Zellgröße — die z-Auflösung ist meist viel feiner und
  // würde die Pfeile auf Millimeterlänge schrumpfen
  const cell = Math.max(spacing[0], spacing[1])
  const vMax = Math.max(vHi, 1e-6)
  const pts = []
  const vecs = []
  const mags = []
  const lens = []
  for (let k = 0; k < dims[2]; k += onSlice && sliceAxis.value === 'k' ? 1 : stride) {
    if (onSlice && sliceAxis.value === 'k' && k !== sliceIdx.value) continue
    for (let j = 0; j < ny; j += onSlice && sliceAxis.value === 'j' ? 1 : stride) {
      if (onSlice && sliceAxis.value === 'j' && j !== sliceIdx.value) continue
      for (let i = 0; i < nx; i += onSlice && sliceAxis.value === 'i' ? 1 : stride) {
        if (onSlice && sliceAxis.value === 'i' && i !== sliceIdx.value) continue
        const idx = (k * ny + j) * nx + i
        if (alpha[idx] < ALPHA_NASS || umag[idx] < 1e-3) continue
        pts.push(...cellCenter(i, j, k))
        vecs.push(U.data[idx], U.data[n + idx], U.data[2 * n + idx])
        mags.push(umag[idx])
        // Pfeillänge: 0.4–1.0 Zellgrößen, linear mit |U|/|U|max
        lens.push((0.4 + 0.6 * (umag[idx] / vMax)) * cell)
      }
    }
  }
  vtk.glyphData.getPoints().setData(Float32Array.from(pts), 3)
  vtk.glyphData.getPointData().setScalars(
    vtkDataArray.newInstance({ name: 'mag', values: Float32Array.from(mags), numberOfComponents: 1 }))
  vtk.glyphData.getPointData().addArray(
    vtkDataArray.newInstance({ name: 'vec', values: Float32Array.from(vecs), numberOfComponents: 3 }))
  vtk.glyphData.getPointData().addArray(
    vtkDataArray.newInstance({ name: 'len', values: Float32Array.from(lens), numberOfComponents: 1 }))
  vtk.glyphData.modified()
  vtk.glyphMapper.setScaleFactor(arrowScale.value)
}

// Wasserfilm: je Säule das Phasenintegral Σ α·dz. Säulen mit Wasser über
// TIEFE_TROCKEN, aber ohne Zelle über der α-Grenze, bekommen ein flaches
// Viereck auf Höhe Gelände + Tiefe — sonst bliebe Wasser flacher als etwa
// eine halbe Rasterzelle in der 3D-Ansicht komplett unsichtbar.
function updateFilm(alpha) {
  const { dims, origin, spacing } = grid
  const [nx, ny, nz] = dims
  const dz = spacing[2]
  const pts = []
  const polys = []
  // Das Geländeraster liegt auf denselben Säulen wie das Feldraster; wenn
  // nicht (alter Lauf), lieber kein Film als ein falsch platzierter.
  if (terrainInfo && terrainInfo.nx === nx && terrainInfo.ny === ny) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let h = 0
        let sichtbar = false
        for (let k = 0; k < nz; k++) {
          const a = alpha[(k * ny + j) * nx + i]
          if (a >= alphaIso.value) { sichtbar = true; break }
          if (a > 0) h += Math.min(a, 1) * dz
        }
        if (sichtbar || h <= TIEFE_TROCKEN) continue
        // +2 mm Anhebung gegen Z-Fighting mit dem Gelände — rein optisch
        const z = terrainInfo.z[j * nx + i] + h + 0.002
        const x0 = origin[0] + i * spacing[0]
        const y0 = origin[1] + j * spacing[1]
        const b = pts.length / 3
        pts.push(x0, y0, z, x0 + spacing[0], y0, z,
          x0 + spacing[0], y0 + spacing[1], z, x0, y0 + spacing[1], z)
        polys.push(4, b, b + 1, b + 2, b + 3)
      }
    }
  }
  vtk.filmData.getPoints().setData(Float32Array.from(pts), 3)
  vtk.filmData.getPolys().setData(Uint32Array.from(polys))
  vtk.filmData.modified()
}

function updateIso() {
  vtk.isoMC.setContourValue(isoValue.value)
  vtk.isoMapper.setInputData(vtk.isoMC.getOutputData())
  const rgb = [0, 0, 0]
  vtk.ctfField.getColor(isoValue.value, rgb)
  vtk.isoActor.getProperty().setColor(...rgb)
}

function updateStreamlines(alpha, U, umag) {
  const { dims } = grid
  const [nx, ny] = [dims[0], dims[1]]
  const n = umag.length
  // Vektorfeld interleaved, Luft = 0 (Integration endet an der Wasseroberfläche).
  // vtkImageStreamline liest über getPointData().getVectors(), nicht Scalars!
  const inter = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const wet = alpha[i] >= ALPHA_NASS
    inter[i * 3] = wet ? U.data[i] : 0
    inter[i * 3 + 1] = wet ? U.data[n + i] : 0
    inter[i * 3 + 2] = wet ? U.data[2 * n + i] : 0
  }
  const { origin, spacing } = grid
  vtk.vectorImage.setDimensions(dims[0], dims[1], dims[2])
  vtk.vectorImage.setSpacing(...spacing)
  vtk.vectorImage.setOrigin(origin[0] + spacing[0] / 2, origin[1] + spacing[1] / 2,
    origin[2] + spacing[2] / 2)
  vtk.vectorImage.getPointData().setVectors(
    vtkDataArray.newInstance({ name: 'velocity', values: inter, numberOfComponents: 3 }))
  vtk.vectorImage.modified()

  // Startpunkte: deterministisch verteilte Nasszellen auf der Starthöhe.
  // Liegt die gewählte Höhe über dem Wasser, gäbe es KEINE Startpunkte und
  // damit gar keine Stromlinien — statt einer leeren Szene wird dann die
  // Ebene mit den meisten Nasszellen genommen.
  const nass = (k) => {
    const out = []
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = (k * ny + j) * nx + i
        if (alpha[idx] >= ALPHA_NASS && umag[idx] > 1e-3) out.push([i, j, k])
      }
    }
    return out
  }
  let k = Math.min(slHeightIdx.value, dims[2] - 1)
  let candidates = []
  slHeightAuto.value = false
  if (slSeedAll.value) {
    // Startpunkte aus dem GANZEN Wasserkörper. Eine einzelne Höhenebene
    // trifft in flachem Wasser oft nur eine Handvoll Zellen — dann standen
    // hier zwei einsame Fäden in einer leeren Szene.
    for (let kk = 0; kk < dims[2]; kk++) candidates.push(...nass(kk))
  } else {
    candidates = nass(k)
    if (!candidates.length) {
      let best = -1
      for (let kk = 0; kk < dims[2]; kk++) {
        const c = nass(kk)
        if (c.length > best) { best = c.length; k = kk; candidates = c }
      }
      slHeightAuto.value = candidates.length > 0
    }
  }
  let s = 42
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  const seeds = []
  const count = Math.min(slCount.value, candidates.length)
  for (let m = 0; m < count; m++) {
    const [i, j, kk] = candidates[Math.floor(rnd() * candidates.length)]
    seeds.push(...cellCenter(i, j, kk))
  }
  vtk.seedPD.getPoints().setData(Float32Array.from(seeds), 3)
  vtk.seedPD.modified()

  vtk.slFilter.setInputData(vtk.vectorImage, 0)
  vtk.slFilter.setInputData(vtk.seedPD, 1)
  const lines = vtk.slFilter.getOutputData()
  // Geschwindigkeit schon auf die LINIE legen: davon lebt sowohl die
  // Einfärbung als auch der mitwachsende Radius (langsam = dünn).
  const lp = lines.getPoints().getData()
  const scal = new Float32Array(lp.length / 3)
  for (let i = 0; i < scal.length; i++) {
    scal[i] = sampleLinear(umag, lp[i * 3], lp[i * 3 + 1], lp[i * 3 + 2])
  }
  lines.getPointData().setScalars(
    vtkDataArray.newInstance({ name: 'mag', values: scal, numberOfComponents: 1 }))
  lines.modified()

  // Strichstärke aus der Modellgröße: klassische CFD-Darstellung liegt bei
  // etwa 1 ‰ der Gebietsdiagonale, nicht bei einem festen Meterwert.
  const [dx, dy, dz] = [grid.dims[0] * grid.spacing[0],
    grid.dims[1] * grid.spacing[1], grid.dims[2] * grid.spacing[2]]
  const diag = Math.sqrt(dx * dx + dy * dy + dz * dz)
  // rund 1,2 ‰ der Diagonale ergibt bei üblicher Zoomstufe eine zwei Pixel
  // breite Linie — dünn wie in klassischer CFD-Software, aber sichtbar
  vtk.tube.setRadius(diag * 0.0012 * slThick.value)
  // Bei gleich schnellen Startpunkten ist der Skalarbereich entartet; der
  // Rohrfilter teilt dann durch null und liefert NaN-Geometrie (nichts zu
  // sehen). In dem Fall gleichmäßige Stärke.
  const sr = lines.getPointData().getScalars()?.getRange?.() ?? [0, 1]
  vtk.tube.setVaryRadius(sr[1] - sr[0] > 1e-6
    ? VaryRadius.VARY_RADIUS_BY_SCALAR : VaryRadius.VARY_RADIUS_OFF)
  vtk.tube.setInputData(lines)
  const rohre = vtk.tube.getOutputData()
  // Der Rohrfilter KOPIERT die Punktdaten, macht sie aber nicht zu den
  // aktiven Skalaren — ohne das zeichnet der Mapper einfarbige weiße
  // Schläuche statt der Geschwindigkeitsfarbe.
  const mag = rohre.getPointData().getArrayByName('mag')
  if (mag) rohre.getPointData().setScalars(mag)
  vtk.slMapper.setInputData(rohre)
}

async function updateScene() {
  if (!renderer || !activeRunId.value || !times.value.length) return
  const seq = ++requestSeq
  loading.value = true
  error.value = ''
  try {
    const vol = await loadVolume(timeIdx.value)
    if (seq !== requestSeq) return
    currentVol = vol
    store.currentTime = vol.time

    const alpha = vol.fields.alpha.data
    const field = fieldArray(vol, activeFieldKey.value)
    const umag = activeFieldKey.value === 'umag' ? field : fieldArray(vol, 'umag')

    let lo = Infinity
    let hi = -Infinity
    let vHi = 0
    for (let i = 0; i < field.length; i++) {
      if (alpha[i] >= ALPHA_NASS) {
        if (field[i] < lo) lo = field[i]
        if (field[i] > hi) hi = field[i]
        if (umag[i] > vHi) vHi = umag[i]
      }
    }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1 }
    if (hi <= lo) hi = lo + 1e-6
    autoRange.value = [lo, hi]
    velRange.value = [0, vHi || 1]
    const [rLo, rHi] = wirksamerBereich(colorLock.value, colorMin.value,
      colorMax.value, [lo, hi])

    const sentinel = rLo - (rHi - rLo) * 0.5 - 1e-6
    const masked = new Float32Array(field.length)
    for (let i = 0; i < field.length; i++) {
      masked[i] = alpha[i] >= ALPHA_NASS ? field[i] : sentinel
    }

    vtk.mc.setContourValue(alphaIso.value)
    const volKey = `${activeRunId.value}|${times.value[timeIdx.value]}`
    const alphaKey = `${volKey}|${glaettung.value}`
    if (alphaKey !== lastAlphaKey) {
      setImageScalars(vtk.alphaImage, 'alpha', glaettung.value > 0
        ? glaetteFeldCached(alpha, grid.dims, glaettung.value) : alpha)
      lastAlphaKey = alphaKey
    }
    const fieldKey = `${volKey}|${activeFieldKey.value}|${rLo}|${rHi}`
    if (fieldKey !== lastFieldKey) {
      setImageScalars(vtk.fieldImage, 'field', masked)
      lastFieldKey = fieldKey
    }

    vtk.ctfField.setMappingRange(rLo, rHi)
    vtk.ctfField.updateRange()
    vtk.ctfVel.setMappingRange(0, vHi || 1)
    vtk.ctfVel.updateRange()
    vtk.opacityFn.removeAllPoints()
    vtk.opacityFn.addPoint(sentinel, 0)
    vtk.opacityFn.addPoint(rLo, 0.25)
    vtk.opacityFn.addPoint(rHi, 0.85)
    vtk.volumeMapper.setSampleDistance(Math.min(...grid.spacing) * 0.8)

    if (layers.value.surface) {
      const pd = vtk.mc.getOutputData()
      const pts = pd.getPoints().getData()
      const scalars = new Float32Array(pts.length / 3)
      for (let i = 0; i < scalars.length; i++) {
        scalars[i] = sampleLinear(field, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2])
      }
      pd.getPointData().setScalars(
        vtkDataArray.newInstance({ name: 'field', values: scalars, numberOfComponents: 1 }))
      vtk.surfaceMapper.setInputData(pd)
    }

    const tau = vol.fields.bed_shear
    if (tau && layers.value.terrainShear) {
      let tHi = 0
      for (let i = 0; i < tau.data.length; i++) if (tau.data[i] > tHi) tHi = tau.data[i]
      tauRange.value = [0, tHi || 1]
      vtk.ctfTau.setMappingRange(0, tHi || 1)
      vtk.ctfTau.updateRange()
      vtk.terrainData.getPointData().setScalars(
        vtkDataArray.newInstance({ name: 'tau', values: tau.data, numberOfComponents: 1 }))
      vtk.terrainData.modified()
    }
    // In der Präsentationsansicht bleibt auch das Gelände farblos — Farbe
    // trägt dort nur das Wasser, sonst konkurrieren zwei Skalen im Bild.
    vtk.terrainMapper.setScalarVisibility(
      layers.value.terrainShear && !!tau && !praesentation.value)

    if (layers.value.arrows) updateGlyphs(alpha, vol.fields.U, umag, vHi)
    if (layers.value.iso) updateIso()
    if (layers.value.streamlines) updateStreamlines(alpha, vol.fields.U, umag)
    if (layers.value.film) updateFilm(alpha)

    vtk.terrainActor.setVisibility(layers.value.terrain)
    vtk.surfaceActor.setVisibility(layers.value.surface)
    vtk.filmActor.setVisibility(layers.value.film)
    const durchsicht = layers.value.arrows || layers.value.streamlines
    const prop = vtk.surfaceActor.getProperty()
    if (realistisch.value) {
      // Wasseroptik: eine ruhige Tiefenfarbe, kräftiges Glanzlicht und ein
      // schmaler Specular-Kegel. Die Feldeinfärbung wird abgeschaltet —
      // sonst mischt sich eine Messgröße in eine Schaudarstellung.
      vtk.surfaceMapper.setScalarVisibility(false)
      prop.setColor(0.16, 0.42, 0.55)
      prop.setAmbient(0.18)
      prop.setDiffuse(0.55)
      prop.setSpecular(0.9)
      prop.setSpecularPower(60)
      prop.setSpecularColor(1, 1, 1)
      prop.setOpacity(durchsicht ? 0.45 : 0.82)
    } else {
      vtk.surfaceMapper.setScalarVisibility(true)
      prop.setColor(1, 1, 1)
      prop.setAmbient(0.1)
      prop.setDiffuse(0.9)
      prop.setSpecular(0.3)
      prop.setSpecularPower(20)
      prop.setOpacity(durchsicht ? 0.4 : 0.92)
    }
    vtk.volumeActor.setVisibility(layers.value.body)
    vtk.sliceActor.setVisibility(layers.value.slice)
    vtk.glyphActor.setVisibility(layers.value.arrows)
    vtk.isoActor.setVisibility(layers.value.iso)
    vtk.slActor.setVisibility(layers.value.streamlines)
    // Präsentationsansicht wie im klassischen CFD-Bild: alles Feste in
    // neutralem Grau, Farbe bleibt allein dem Wasser vorbehalten. Die
    // Bauteilfarben helfen beim Modellieren, im Ergebnisbild lenken sie ab.
    for (const [i, a] of vtk.structureActors.entries()) {
      a.setVisibility(layers.value.structures)
      const pr = a.getProperty()
      if (praesentation.value) {
        pr.setColor(0.82, 0.80, 0.78)
        pr.setSpecular(0.12)
      } else {
        pr.setColor(...STRUCT_COLORS[i % STRUCT_COLORS.length])
        pr.setSpecular(0.25)
      }
    }
    vtk.terrainActor.getProperty().setColor(
      ...(praesentation.value ? [0.86, 0.85, 0.83] : [0.45, 0.42, 0.38]))
    for (const a of vtk.meshActors) a.setVisibility(layers.value.meshSurface)
    // Solver-Netz ersetzt die Höhenfeld-Ansicht des Geländes
    if (layers.value.meshSurface) vtk.terrainActor.setVisibility(false)
    const mode = { i: SlicingMode.I, j: SlicingMode.J, k: SlicingMode.K }[sliceAxis.value]
    vtk.sliceMapper.setSlicingMode(mode)

    // Ebenenstapel: Pool zusätzlicher Schnittebenen an die Anzahl anpassen
    while (vtk.sliceExtras.length < sliceCount.value - 1) {
      const m = vtkImageMapper.newInstance()
      m.setInputData(vtk.fieldImage)
      const a = vtkImageSlice.newInstance()
      a.setMapper(m)
      a.getProperty().setRGBTransferFunction(0, vtk.ctfField)
      a.getProperty().setPiecewiseFunction(0, vtk.opacityFn)
      a.getProperty().setInterpolationTypeToNearest()
      renderer.addActor(a)
      vtk.sliceExtras.push(a)
    }
    while (vtk.sliceExtras.length > sliceCount.value - 1) {
      renderer.removeActor(vtk.sliceExtras.pop())
    }
    const dimAxis = { i: grid.dims[0], j: grid.dims[1], k: grid.dims[2] }[sliceAxis.value]
    if (sliceCount.value === 1) {
      vtk.sliceMapper.setSlice(Math.min(sliceIdx.value, sliceMax.value))
    } else {
      const pos = [...Array(sliceCount.value)].map((_, m) =>
        Math.min(dimAxis - 1, Math.round(((m + 0.5) * dimAxis) / sliceCount.value)))
      vtk.sliceMapper.setSlice(pos[0])
      vtk.sliceExtras.forEach((a, m) => {
        a.getMapper().setSlicingMode(mode)
        a.getMapper().setSlice(pos[m + 1])
      })
    }
    vtk.sliceExtras.forEach((a) => a.setVisibility(layers.value.slice))

    if (!cameraInitialized) {
      renderer.resetCamera()
      renderer.getActiveCamera().elevation(-25)
      renderer.resetCameraClippingRange()
      cameraInitialized = true
      isoValue.value = Number(((lo + hi) / 2).toPrecision(3))
    }
    renderWindow.render()

    // Beim Abspielen den Folgeschritt schon in den Cache holen — der
    // Frame-Takt lässt dafür Luft, der Wechsel kommt dann ohne Laden
    if (playing.value && times.value.length > 1) {
      loadVolume((timeIdx.value + 1) % times.value.length).catch(() => {})
    }
  } catch (e) {
    if (seq === requestSeq) error.value = e.message
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

const sliceMax = computed(() => {
  if (!grid) return 0
  return { i: grid.dims[0], j: grid.dims[1], k: grid.dims[2] }[sliceAxis.value] - 1
})
const slicePosLabel = computed(() => {
  if (!grid) return ''
  const ax = { i: 0, j: 1, k: 2 }[sliceAxis.value]
  const pos = grid.origin[ax] + (sliceIdx.value + 0.5) * grid.spacing[ax]
  return `${['x', 'y', 'z'][ax]} = ${pos.toFixed(2)} m`
})
const slHeightLabel = computed(() => {
  if (!grid) return ''
  return `z = ${(grid.origin[2] + (slHeightIdx.value + 0.5) * grid.spacing[2]).toFixed(2)} m`
})

// --- Punktabfrage ---------------------------------------------------------

function onPointerDown(e) {
  downPos = [e.clientX, e.clientY]
}

async function onPointerUp(e) {
  if (!probeActive.value || !downPos || !currentVol || !grid) return
  const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1])
  downPos = null
  if (moved > 5) return   // Drag = Kamerabewegung, keine Abfrage

  // Druck gehört nicht zur Standard-Ladeliste der Szene — für die
  // Abfrage einmalig nachladen; der Cache merged ihn in DASSELBE Volumen
  if (!currentVol.fields.p_rgh && availableFieldKeys.value.includes('p_rgh')) {
    try {
      await getVolume(activeRunId.value, times.value[timeIdx.value], ['p_rgh'])
    } catch { /* Abfrage zeigt dann eben "–" */ }
  }

  const rect = viewport.value.getBoundingClientRect()
  const pos = [e.clientX - rect.left, rect.height - (e.clientY - rect.top), 0]
  vtk.picker.pick(pos, renderer)
  const picked = vtk.picker.getPickedPositions()
  if (!picked.length) { probeResult.value = null; return }
  const [x, y, z] = picked[0]

  const alpha = currentVol.fields.alpha.data
  const U = currentVol.fields.U
  const n = alpha.length
  let [i, j, k] = cellIndexAt(x, y, z)
  // Klick auf die Wasseroberfläche trifft die Luftzelle knapp darüber —
  // dann die erste Nasszelle darunter abfragen
  const flat = (kk) => (kk * grid.dims[1] + j) * grid.dims[0] + i
  while (k > 0 && alpha[flat(k)] < ALPHA_NASS && alpha[flat(k - 1)] >= ALPHA_NASS) k--
  const idx = flat(k)
  const ux = U.data[idx]
  const uy = U.data[n + idx]
  const uz = U.data[2 * n + idx]
  const umag = Math.sqrt(ux * ux + uy * uy + uz * uz)

  // Tiefe als Saeulenintegral Σ α·dz (volumenerhaltend, zeigt auch Filme),
  // Wasserspiegel subzellig aus dem Fuellgrad der obersten Nasszelle —
  // dieselbe Rekonstruktion wie im Grundriss (useFieldCache.planFields),
  // damit sich Punktabfrage und Karte nicht widersprechen.
  const dzz = grid.spacing[2]
  const nzz = grid.dims[2]
  let kTop = -1
  let depth = 0
  for (let kk = 0; kk < nzz; kk++) {
    const a = Math.min(Math.max(alpha[flat(kk)], 0), 1)
    if (a <= 0) continue
    depth += a * dzz
    if (a >= ALPHA_NASS) kTop = kk
  }
  const groundZ = terrainInfo ? terrainInfo.z[j * terrainInfo.nx + i] : null
  let surfZ = null
  if (depth > TIEFE_TROCKEN) {
    if (kTop >= 0) {
      const aTop = Math.min(Math.max(alpha[flat(kTop)], 0), 1)
      const aOver = kTop + 1 < nzz ? Math.min(Math.max(alpha[flat(kTop + 1)], 0), 1) : 0
      surfZ = grid.origin[2] + kTop * dzz + (aTop + aOver) * dzz
    } else if (groundZ != null) {
      surfZ = groundZ + depth
    }
  }
  const froude = depth > TIEFE_BENETZT ? umag / Math.sqrt(G * depth) : null
  const tau = currentVol.fields.bed_shear
    ? currentVol.fields.bed_shear.data[j * grid.dims[0] + i] : null

  probeResult.value = [
    ['Position', `${x.toFixed(2)} / ${y.toFixed(2)} / ${z.toFixed(2)} m`],
    ['Phasenanteil α', fmt(alpha[idx])],
    ['|U|', `${fmt(umag)} m/s`],
    ['U (x/y/z)', `${fmt(ux)} / ${fmt(uy)} / ${fmt(uz)}`],
    ['Druck p_rgh', `${fmt(currentVol.fields.p_rgh?.data[idx])} Pa`],
    ['Sohlschubspannung', tau != null ? `${fmt(tau)} N/m²` : '–'],
    ['Wasserspiegel', surfZ != null ? `${surfZ.toFixed(2)} m` : '–'],
    ['Wassertiefe', depth > TIEFE_TROCKEN ? `${fmt(depth)} m` : 'trocken'],
    ['Froude-Zahl', froude != null ? fmt(froude) : '–'],
  ]
}

// --- Kamerastellungen (laufübergreifend, Spez. Kap. 8) --------------------

function loadViews() {
  try {
    savedViews.value = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? '[]')
  } catch { savedViews.value = [] }
}

function persistViews() {
  localStorage.setItem(VIEWS_KEY, JSON.stringify(savedViews.value))
}

function saveCurrentView() {
  const cam = renderer.getActiveCamera()
  const v = {
    name: viewName.value.trim(),
    position: cam.getPosition(),
    focalPoint: cam.getFocalPoint(),
    viewUp: cam.getViewUp(),
  }
  savedViews.value = [...savedViews.value.filter((x) => x.name !== v.name), v]
  persistViews()
  viewName.value = ''
}

function applyView(v) {
  const cam = renderer.getActiveCamera()
  cam.setPosition(...v.position)
  cam.setFocalPoint(...v.focalPoint)
  cam.setViewUp(...v.viewUp)
  renderer.resetCameraClippingRange()
  renderWindow.render()
}

function deleteView(name) {
  savedViews.value = savedViews.value.filter((x) => x.name !== name)
  persistViews()
}

function resetCamera() {
  if (!renderer) return
  renderer.resetCamera()
  renderer.resetCameraClippingRange()
  renderWindow.render()
}

// --- Bildexport (Spez. Kap. 8: Kennung + Wertebereich in der Unterschrift)

async function exportPng() {
  const [imgPromise] = renderWindow.captureImages('image/png')
  const dataUrl = await imgPromise
  const img = new Image()
  await new Promise((resolve) => { img.onload = resolve; img.src = dataUrl })

  const bar = 52
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height + bar
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#131316'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)

  const [lo, hi] = shownRange.value
  const unit = activeField.value.unit !== '—' ? ` ${activeField.value.unit}` : ''
  ctx.fillStyle = '#e8e8ea'
  ctx.font = '14px system-ui, sans-serif'
  ctx.fillText(
    `Lauf ${activeRunId.value} · t = ${fmt(times.value[timeIdx.value])} s · ` +
    `${activeField.value.label} · Farbskala ${fmt(lo)} bis ${fmt(hi)}${unit}`,
    12, img.height + 32)

  const gw = Math.min(180, canvas.width / 4)
  const gx = canvas.width - gw - 14
  const gy = img.height + 20
  const grad = ctx.createLinearGradient(gx, 0, gx + gw, 0)
  const stops = [['#440154', 0], ['#414487', 0.2], ['#2a788e', 0.4],
    ['#22a884', 0.6], ['#7ad151', 0.8], ['#fde725', 1]]
  for (const [c, o] of stops) grad.addColorStop(o, c)
  ctx.fillStyle = grad
  ctx.fillRect(gx, gy, gw, 14)

  const a = document.createElement('a')
  a.download = `${activeRunId.value}_t${fmt(times.value[timeIdx.value])}s_${activeFieldKey.value}.png`
  a.href = canvas.toDataURL('image/png')
  a.click()
}

// --- Lebenszyklus ---------------------------------------------------------

const STRUCT_COLORS = [[0.22, 0.53, 0.9], [0.85, 0.35, 0.15], [0.1, 0.62, 0.44],
  [0.79, 0.52, 0.0], [0.84, 0.32, 0.51]]

function _disposeActorList(list) {
  for (const a of list) {
    renderer.removeActor(a)
    a.getMapper()?.getInputData()?.delete?.()
    a.delete?.()
  }
  list.length = 0
}

function buildGeometryActors(geo) {
  _disposeActorList(vtk.structureActors)
  _disposeActorList(vtk.meshActors)
  geo.solids.forEach((s, i) => {
    const reader = vtkSTLReader.newInstance()
    reader.parseAsArrayBuffer(s.stl)
    const mapper = vtkMapper.newInstance({ scalarVisibility: false })
    mapper.setInputData(reader.getOutputData())
    const actor = vtkActor.newInstance()
    actor.setMapper(mapper)
    actor.getProperty().setColor(...STRUCT_COLORS[i % STRUCT_COLORS.length])
    actor.getProperty().setSpecular(0.25)
    actor.setVisibility(false)
    renderer.addActor(actor)
    vtk.structureActors.push(actor)
  })
  for (const s of geo.meshPatches) {
    const reader = vtkSTLReader.newInstance()
    reader.parseAsArrayBuffer(s.stl)
    const mapper = vtkMapper.newInstance({ scalarVisibility: false })
    mapper.setInputData(reader.getOutputData())
    const actor = vtkActor.newInstance()
    actor.setMapper(mapper)
    const p = actor.getProperty()
    p.setColor(0.56, 0.63, 0.76)
    p.setEdgeVisibility(true)               // die Zellfacetten des Solvers
    p.setEdgeColor(0.08, 0.13, 0.25)
    p.setAmbient(0.35)
    actor.setVisibility(false)
    renderer.addActor(actor)
    vtk.meshActors.push(actor)
  }
}

async function loadRun() {
  if (!activeRunId.value) return
  error.value = ''
  try {
    const [index, geo] = await Promise.all([
      fetchTimesteps(activeRunId.value),
      fetchGeometry(activeRunId.value),
    ])
    grid = index.grid
    gridLabel.value = grid.spacing.map((s) => Number(s.toPrecision(3))).join(' × ') + ' m'
    availableFieldKeys.value = index.fields ?? []
    if (!FIELD_OPTIONS.value.some((f) => f.key === activeFieldKey.value)) {
      activeFieldKey.value = FIELD_OPTIONS.value[0]?.key ?? 'umag'
    }
    times.value = index.timesteps.map((e) => e.time)
    if (timeIdx.value >= times.value.length) timeIdx.value = 0
    // Zeitcursor aus den anderen Ansichten übernehmen (Zeitreihen/Grundriss)
    if (store.currentTime != null && times.value.length) {
      timeIdx.value = times.value.reduce((best, t, i) =>
        (Math.abs(t - store.currentTime) < Math.abs(times.value[best] - store.currentTime)
          ? i : best), 0)
    }
    slHeightIdx.value = Math.min(slHeightIdx.value, grid.dims[2] - 1)
    buildTerrain(geo)
    buildGeometryActors(geo)
    await updateScene()
  } catch (e) {
    error.value = e.message
    times.value = []
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
  grw = vtkGenericRenderWindow.newInstance({ background: [0.039, 0.063, 0.122] })
  grw.setContainer(viewport.value)
  renderer = grw.getRenderer()
  renderWindow = grw.getRenderWindow()
  buildPipelines()
  grw.resize()
  resizeObs = new ResizeObserver(() => grw.resize())
  resizeObs.observe(viewport.value)
  loadViews()
  activeRunId.value = store.selectedRunIds[0] ?? null
  loadRun()
})

watch(() => store.selectedRunIds, (ids) => {
  if (!ids.includes(activeRunId.value)) activeRunId.value = ids[0] ?? null
}, { deep: true })
watch(activeRunId, loadRun)
watch([timeIdx, activeFieldKey, layers, sliceAxis, sliceIdx, sliceCount,
  colorLock, colorMin, colorMax, arrowScale, arrowStride, arrowsOnSlice,
  isoValue, slCount, slHeightIdx, slThick, slSeedAll, realistisch,
  glaettung, praesentation, alphaIso], updateScene,
{ deep: true })

onBeforeUnmount(() => {
  clearInterval(playTimer)
  resizeObs?.disconnect()
  grw?.delete()
})
</script>

<style scoped>
.f3d-sub { margin-left: 1.1rem; opacity: 0.9; }
.f3d-hint-inline {
  margin: 0.15rem 0 0.35rem 1.1rem;
  font-size: 0.72rem;
  line-height: 1.35;
  /* --f3d-muted gibt es nicht (das Token heisst --f3d-text-2), es griff
     also immer der Fallback — und der war zu dunkel zum Lesen. */
  color: var(--f3d-text-hilfe, #dee7f9);
}

.f3d-raum {
  display: flex;
  gap: 14px;
  /* height: 100% bezog sich auf einen Container ohne feste Hoehe und war
     damit wirkungslos — die Ansicht bekommt ihren Platz jetzt von
     ErgebnisPhase per flex zugewiesen */
  min-height: 420px;
}
.f3d-raum-controls {
  width: 250px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  /* min-height: 0 fehlte — ohne das hat overflow-y in einer Flexbox
     keine Wirkung, die Spalte wuchs auf 1400+ px und dehnte den
     Viewport daneben gleich mit */
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.f3d-ctl-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--f3d-surface);
  border: 1px solid var(--f3d-border);
  border-radius: 8px;
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
.f3d-check input { accent-color: var(--f3d-accent); }
.f3d-indent { margin-left: 18px; color: var(--f3d-text-2); }
.f3d-select {
  background: var(--f3d-bg);
  color: var(--f3d-text);
  border: 1px solid var(--f3d-border);
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 0.8rem;
}
.f3d-select-s { width: 60px; }
.f3d-row { display: flex; align-items: center; gap: 8px; }
.f3d-row input[type='range'] { flex: 1; accent-color: var(--f3d-accent); min-width: 0; }
.f3d-lbl { color: var(--f3d-text-2); font-size: 0.75rem; white-space: nowrap; }
.f3d-num {
  width: 80px;
  background: var(--f3d-bg);
  color: var(--f3d-text);
  border: 1px solid var(--f3d-border);
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 0.78rem;
}
.f3d-grow { flex: 1; width: auto; }
.f3d-mono {
  font-variant-numeric: tabular-nums;
  color: var(--f3d-text-2);
  font-size: 0.75rem;
  white-space: nowrap;
}
/* wie die Gruppen-Beschriftung, aber KEIN <label> — sonst labelt es
   implizit den ?-Knopf und ein Klick auf die Überschrift öffnet die
   Erklärkarte */
.f3d-gruppenkopf {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--f3d-text-2);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.f3d-legend { height: 12px; border-radius: 4px; }
.f3d-legend-labels { justify-content: space-between; }
.f3d-probe { border-collapse: collapse; font-size: 0.74rem; }
.f3d-probe td {
  padding: 2px 6px 2px 0;
  color: var(--f3d-text);
  border-bottom: 1px solid var(--f3d-border);
}
.f3d-probe td:first-child { color: var(--f3d-text-2); }
.f3d-view-row .f3d-btn { text-align: left; }
.f3d-raum-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  min-height: 0;
}
.f3d-viewport {
  flex: 1;
  border: 1px solid var(--f3d-border);
  border-radius: 8px;
  overflow: hidden;
  min-height: 300px;
  position: relative;
}
.f3d-timebar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  background: var(--f3d-surface);
  border: 1px solid var(--f3d-border);
  border-radius: 8px;
  padding: 8px 12px;
}
.f3d-timebar input[type='range'] { flex: 1; accent-color: var(--f3d-accent); }
</style>
