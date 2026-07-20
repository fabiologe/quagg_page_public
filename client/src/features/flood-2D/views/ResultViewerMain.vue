<template>
  <div class="result-viewer-root">
    <!-- Loading State -->
    <div v-if="bridge.isLoading.value" class="loading-overlay">
      <div class="loading-content">
        <img class="loading-svg" src="/construction%20animations/Loading%20Icon%20-%20Plan.svg" alt="Lädt…" />
        <h2>Lade Simulationsdaten...</h2>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: bridge.loadProgress.value + '%' }"></div>
        </div>
        <span class="progress-text">{{ bridge.loadProgress.value }}%</span>
      </div>
    </div>

    <!-- Main Viewer -->
    <template v-else-if="bridge.terrain.value">
      <!-- Timeline Bar (Top) -->
      <ResultTimeline
        :totalFrames="bridge.totalFrames.value"
        :simDuration="bridge.simDuration.value"
        v-model:currentFrame="currentFrame"
        @play="playing = true"
        @pause="playing = false"
      />

      <!-- 3D Viewport -->
      <div class="viewport" :class="{ 'probe-active': activeTool === 'probe' }">
        <ResultMap3D
          ref="map3d"
          :terrain="bridge.terrain.value"
          :depthData="currentLayerData"
          :elevData="currentElevData"
          :maxWaterDepth="currentLayerMax"
          :layerMode="activeLayerMode"
          :flowData="currentFlowData"
          :qFluxData="currentQFluxData"
          :showFlow="activeLayer === 'flow'"
          :showStreamlines="activeLayer === 'streamlines'"
          :detectSpikes="depthLikeLayer"
          :depthField="currentDepthData"
          :velocityData="currentVelocityData"
          :velocityMin="velColorMin"
          :velocityMax="effVelMax"
          :flowDensity="flowDensity"
          :waterOpacity="waterOpacity"
          :bciContent="bridge.bciContent.value"
          :probeActive="activeTool === 'probe'"
          :activeTool="activeTool"
          :networkState="networkFrameState"
          :showNetwork="showNetwork"
          :networkColorMode="networkColorMode"
          @cellProbed="onCellProbed"
          @sectionDrawn="onSectionDrawn"
          @waterStats="onWaterStats"
          @sectionDraftChanged="sectionDrafting = $event"
        />

        <!-- Legende für JEDEN Layer (Tiefe/Velocity/Heatmaps), Skala spike-bereinigt. -->
        <ResultLegend
          :layerId="activeLayer"
          :min="legendMin"
          :max="legendMax"
          class="legend-overlay"
        />

        <!-- Instabilitäts-/Gefahrenstellen: numerische Tiefen-Dorne wurden für die
             Anzeige gekappt; hier bleibt die Info sichtbar (echter Wert via Probe). -->
        <div
          v-if="outlierCount > 0"
          class="instability-badge"
          :title="outlierTitle"
        >
          <SvEmoji emoji="⚠" :size="13" /> {{ outlierCount }} Instabilitätsstelle{{ outlierCount === 1 ? '' : 'n' }}
          <small>gekappt&nbsp;· Probe zeigt Rohwert</small>
        </div>

        <!-- Section Profile Charts -->
        <template v-if="activeTool === 'section'">
          <TransitionGroup name="fade-slide">
             <ResultSectionChart
               v-for="section in computedSectionsList"
               :key="section.id"
               :section="section"
               :currentFrame="currentFrame"
               @closeRequested="removeSection"
             />
          </TransitionGroup>

          <!-- Schnitt begonnen, aber noch nicht abgeschlossen: Endpunkt folgt frei
               der Maus — erst Doppelklick oder dieser Button übernimmt die Linie. -->
          <div v-if="sectionDrafting" class="section-confirm-hint">
            <span>Endpunkt setzen: Doppelklick oder</span>
            <button class="confirm-btn" @click="map3d?.confirmSection()">✓ Bestätigen</button>
            <span class="hint-key">(Enter · Esc = abbrechen)</span>
          </div>
        </template>

        <!-- Volume Panels -->
        <template v-if="activeTool === 'volume'">
          <TransitionGroup name="fade-slide">
            <ResultVolumePanel
              v-for="poly in volumePanelData"
              :key="poly.id"
              :polygon="poly"
              :currentFrame="currentFrame"
              @clearRequested="removeVolumeAnalysis"
            />
          </TransitionGroup>
        </template>

        <!-- Zusammenklappbare Steuerungs-Box (Ebenen, Werkzeuge, Regler, Velocity-Bereich) -->
        <ViewerControlPanel
          :layers="availableLayers"
          :activeLayer="activeLayer"
          :tools="tools"
          :activeTool="activeTool"
          :waterOpacity="waterOpacity"
          :flowDensity="flowDensity"
          :velocityHistogram="velocityHistogram"
          :velocityGlobalMax="velocityGlobalMax"
          :velMin="velColorMin"
          :velMax="effVelMax"
          :networkAvailable="hasNetworkResults"
          :showNetwork="showNetwork"
          :networkColorMode="networkColorMode"
          @update:activeLayer="activeLayer = $event"
          @update:activeTool="activeTool = $event"
          @update:waterOpacity="waterOpacity = $event"
          @update:flowDensity="flowDensity = $event"
          @update:velMin="velColorMin = $event"
          @update:velMax="velColorMax = $event"
          @update:showNetwork="showNetwork = $event"
          @update:networkColorMode="networkColorMode = $event"
        />

        <!-- Wehr-Durchfluss Q(t) — eigenes Panel, sichtbar sobald .Qx/.Qy-Daten da sind -->
        <WeirResultsPanel
          v-if="hasWeirData"
          :series="weirSeries"
          :currentFrame="currentFrame"
          :saveInterval="saveIntervalSec"
          @openChart="openWeirChart"
        />

        <!-- 1D-Kanalnetz: Ganglinien je Schacht/Haltung + Systemvolumen/Bilanz
             (gekoppelte Läufe; Serien aus der SWMM-.out via handler.py) -->
        <NetworkResultsPanel
          v-if="hasNetworkResults"
          :nodeSeries="nodeSeries"
          :linkSeries="linkSeries"
          :system="systemSeries"
          :budget="bridge.couplingBudget.value"
          :massReport="bridge.massReport.value"
          :currentFrame="currentFrame"
          :saveInterval="saveIntervalSec"
          @openChart="openNetworkChart"
        />

        <!-- Ausgeklinkte Ganglinien-Fenster (⧉ in den Panels): eins je Element,
             beliebig viele parallel, Cursor läuft mit der Timeline. -->
        <GanglinieWindow
          v-for="(w, i) in chartWindows"
          :key="w.key"
          :win="w"
          :index="i"
          :currentFrame="currentFrame"
          :saveInterval="saveIntervalSec"
          @close="closeChart"
        />

        <!-- Cell Info Panels -->
        <template v-if="activeTool === 'probe'">
          <TransitionGroup name="slide-info">
            <ResultProbePanel
              v-for="cell in probedCellList"
              :key="cell.id"
              :cell="cell"
              @closeRequested="removeProbe"
            />
          </TransitionGroup>
        </template>
      </div>
    </template>

    <!-- No Data -->
    <div v-else class="no-data">
      <h2><SvEmoji emoji="😕" :size="20" /> Keine Daten</h2>
      <p v-if="bridge.error.value">{{ bridge.error.value }}</p>
      <p v-else>Starte zuerst eine Simulation im Hauptfenster.</p>
    </div>
  </div>
</template>

<script setup>
import SvEmoji from '@/features/flood-2D/components/common/SvEmoji.vue';
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useResultDataFromOpener } from '@/features/flood-2D/composables/useResultDataBridge.js';

import ResultMap3D from '@/features/flood-2D/components/viewer/ResultMap3D.vue';
import ResultTimeline from '@/features/flood-2D/components/viewer/ResultTimeline.vue';
import ResultLegend from '@/features/flood-2D/components/viewer/ResultLegend.vue';
import ResultSectionChart from '@/features/flood-2D/components/viewer/ResultSectionChart.vue';
import ResultVolumePanel from '@/features/flood-2D/components/viewer/ResultVolumePanel.vue';
import ResultProbePanel from '@/features/flood-2D/components/viewer/ResultProbePanel.vue';
import ViewerControlPanel from '@/features/flood-2D/components/viewer/ViewerControlPanel.vue';
import WeirResultsPanel from '@/features/flood-2D/components/viewer/WeirResultsPanel.vue';
import NetworkResultsPanel from '@/features/flood-2D/components/viewer/NetworkResultsPanel.vue';
import GanglinieWindow from '@/features/flood-2D/components/viewer/GanglinieWindow.vue';
import { buildNetworkChartSpec, buildWeirChartSpec } from '@/features/flood-2D/components/viewer/ganglinienSpec.js';

import { useAnalysisStore } from '@/features/flood-2D/stores/useAnalysisStore';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore';
import { calculateVolumeWithConfidence } from '@/features/flood-2D/utils/VolumeCalculator';
import { useWeirResults } from '@/features/flood-2D/composables/viewer/useWeirResults.js';
import { useNetworkResults } from '@/features/flood-2D/composables/viewer/useNetworkResults.js';

// --- Data Bridge (reads from window.opener) ---
const bridge = useResultDataFromOpener();

// --- Wehr-Durchfluss (aus .Qx/.Qy → qFluxFrames; nur RunPod/LISFLOOD-8) ---
// GeoStore wird von der Bridge hydriert → weirLines liegen hier vor.
const geoStore = useGeoStore();
const saveIntervalSec = computed(() =>
  bridge.totalFrames.value > 0 ? (bridge.simDuration.value / bridge.totalFrames.value) : 0
);
const { weirSeries, hasWeirData } = useWeirResults({
  weirLines: computed(() => geoStore.weirLines),
  header: bridge.resultHeader,
  qFluxFrames: bridge.qFluxFrames,
  elevFrames: bridge.elevFrames,
  saveInterval: saveIntervalSec,
});

// --- 1D-Kanalnetz-Ergebnisse (gekoppelter SWMM-Lauf; Serien aus der Bridge) ---
const { nodeSeries, linkSeries, systemSeries, hasNetworkResults, stateAtFrame } =
  useNetworkResults({ networkResults: bridge.networkResults, saveInterval: saveIntervalSec });

// --- VOLUME ---
const analysisStore = useAnalysisStore();

onMounted(() => {
  bridge.loadData();
  document.title = '🌊 Flood-2D Result Viewer';
});

// --- Timeline ---
const currentFrame = ref(0);
const playing = ref(false);
let playTimer = null;

const currentDepthData = ref(null);

// 1D-Netz-Zustand des aktuellen Frames (Füllgrad/Überstau) → ResultMap3D-Einfärbung
const networkFrameState = computed(() =>
  hasNetworkResults.value ? stateAtFrame(currentFrame.value) : null
);

// Netz-Layer-Sichtbarkeit + Färbmodus der Haltungen (ViewerControlPanel → ResultMap3D)
const showNetwork = ref(true);
const networkColorMode = ref('capacity'); // 'capacity' | 'flow' | 'velocity'

// ── Ausgeklinkte Ganglinien-Fenster (⧉-Button in Netz-/Wehr-Panel) ──────────
// Offene Fenster als {kind:'net'|'weir', id}; die Specs werden reaktiv aus den
// aktuellen Serien gebaut (Re-Hydration ersetzt die Daten, Fenster bleiben offen).
const openCharts = ref([]);

function openNetworkChart(sel) {
  if (!sel) return;
  if (!openCharts.value.some(c => c.kind === 'net' && c.id === sel)) {
    openCharts.value.push({ kind: 'net', id: sel });
  }
}
function openWeirChart(id) {
  if (!id) return;
  if (!openCharts.value.some(c => c.kind === 'weir' && c.id === id)) {
    openCharts.value.push({ kind: 'weir', id });
  }
}
function closeChart(key) {
  openCharts.value = openCharts.value.filter(c =>
    (c.kind === 'net' ? `net:${c.id}` : `weir:${c.id}`) !== key);
}

const chartWindows = computed(() =>
  openCharts.value
    .map(c => c.kind === 'net'
      ? buildNetworkChartSpec(c.id, {
          nodeSeries: nodeSeries.value,
          linkSeries: linkSeries.value,
          system: systemSeries.value,
        })
      : buildWeirChartSpec(c.id, weirSeries.value))
    .filter(Boolean));  // Element nach Re-Run verschwunden → Fenster fällt weg

// ── Layer Switcher ──────────────────────────────────────────────────────────
const activeLayer = ref('depth'); // 'depth' | 'velocity' | 'max_depth' | 'hazard'

const availableLayers = computed(() => {
  const layers = [{ id: 'depth', icon: '💧', label: 'Tiefe' }];
  if (bridge.velocityFrames?.value?.size > 0)
    layers.push({ id: 'velocity', icon: '💨', label: 'Velocity' });
  if (bridge.velocityVectorFrames?.value?.size > 0) {
    layers.push({ id: 'flow', icon: '🧭', label: 'Strömung' });
    layers.push({ id: 'streamlines', icon: '🌀', label: 'Strömungslinien' });
  }
  if (bridge.maxDepthGrid?.value)
    layers.push({ id: 'max_depth', icon: '📈', label: 'Max-Tiefe' });
  if (bridge.maxHazardGrid?.value)
    layers.push({ id: 'hazard', icon: '⚠️', label: 'Hazard' });
  if (bridge.maxVelocityGrid?.value)
    layers.push({ id: 'max_velocity', icon: '🚀', label: 'Max-Geschw.' });
  if (bridge.maxElevGrid?.value)
    layers.push({ id: 'max_elev', icon: '🌊', label: 'Wasserspiegel' });
  if (bridge.arrivalTimeGrid?.value)
    layers.push({ id: 'arrival', icon: '⏱️', label: 'Ankunftszeit' });
  if (bridge.durationGrid?.value)
    layers.push({ id: 'duration', icon: '🕒', label: 'Dauer' });
  return layers;
});

// 0=depth (realistisch beleuchtet: Fresnel/Wellen/Himmel), 1=velocity, 2=max_depth/hazard (heat map)
// Flow rendert die Pfeile ÜBER dem normalen (Tiefen-)Wassershader → Modus 0.
const STATIC_GRID_LAYERS = ['max_depth', 'hazard', 'max_velocity', 'max_elev', 'arrival', 'duration'];
const activeLayerMode = computed(() => {
  if (activeLayer.value === 'velocity') return 1;
  if (STATIC_GRID_LAYERS.includes(activeLayer.value)) return 2;
  return 0;
});

// depthData speist IMMER die Wasser-Geometrie (Anhebung/Nass-Maske). Für velocity/flow daher
// die ECHTE Tiefe übergeben; die Geschwindigkeit kommt separat über velocityData (Farbe).
const currentLayerData = computed(() => {
  switch (activeLayer.value) {
    case 'velocity':
    case 'flow':
    case 'streamlines': return currentDepthData.value;   // echte Tiefe = Geometrie
    case 'max_depth':    return bridge.maxDepthGrid?.value ?? null;
    case 'hazard':       return bridge.maxHazardGrid?.value ?? null;
    case 'max_velocity': return bridge.maxVelocityGrid?.value ?? null;
    case 'max_elev':     return bridge.maxElevGrid?.value ?? null;
    case 'arrival':      return bridge.arrivalTimeGrid?.value ?? null;
    case 'duration':     return bridge.durationGrid?.value ?? null;
    default:             return currentDepthData.value;
  }
});

// Wasserspiegel (.elev) des aktuellen Frames — exakte Solver-Oberfläche für die Wasser-Geometrie.
// Nur für die dynamische Wasserhaut (echte Tiefe je Frame), nicht für statische Summenraster
// (max_*/hazard/arrival/duration haben kein per-Frame-.elev → Fallback baseZ+Tiefe).
const currentElevData = computed(() => {
  if (STATIC_GRID_LAYERS.includes(activeLayer.value)) return null;
  return bridge.elevFrames?.value?.get(currentFrame.value) ?? null;
});

// Geschwindigkeits-Betrag des aktuellen Frames (für die Heatmap-Farbe)
const currentVelocityData = computed(() => {
  if (activeLayer.value === 'velocity' || activeLayer.value === 'flow' || activeLayer.value === 'streamlines'
      || activeLayer.value === 'depth') // auch für Tiefe: aTurb bekommt Geschwindigkeits-Anteil → mehr Wellen/Schaum
    return bridge.velocityFrames?.value?.get(currentFrame.value) ?? null;
  return null;
});

// Vektorfeld (Vx/Vy, zell-zentriert) des aktuellen Frames für die Fließpfeile
const currentFlowData = computed(() =>
  bridge.velocityVectorFrames?.value?.get(currentFrame.value) ?? null
);

// Kantenfluss-Feld (Qx/Qy in m³/s, zell-zentriert) — Impuls-Quelle für die
// Wasser-Advektion im Shader (q=v·h ist träger als v im dünnen Film).
const currentQFluxData = computed(() =>
  bridge.qFluxFrames?.value?.get(currentFrame.value) ?? null
);

// ── Velocity-Farbbereich + Histogramm ───────────────────────────────────────
// Globales Geschwindigkeits-Max über ALLE Frames → stabile Reglergrenzen beim Abspielen.
const velocityGlobalMax = computed(() => {
  const frames = bridge.velocityFrames?.value;
  if (!frames || frames.size === 0) return 0;
  let m = 0;
  for (const arr of frames.values()) {
    for (let i = 0; i < arr.length; i++) { const v = arr[i]; if (v > m && v < 9000) m = v; }
  }
  return m;
});

// Benutzerwählbarer Farbbereich (persistiert über Frames). max wird beim ersten Datenfund initialisiert.
const velColorMin = ref(0);
const velColorMax = ref(null);
watch(velocityGlobalMax, (gm) => {
  if (gm > 0 && velColorMax.value == null) velColorMax.value = gm;
}, { immediate: true });
const effVelMax = computed(() => (velColorMax.value != null ? velColorMax.value : (velocityGlobalMax.value || 3)));

// Dichte der Fließpfeile (0..1) — etwas höher als Mitte für standardmäßig mehr Pfeile
const flowDensity = ref(0.65);

// Instabilitäts-/Gefahrenstellen (numerische Tiefen-Dorne) des aktuellen Frames.
// Werden von ResultMap3D (Wasserhaut) je Frame gemeldet; Rohwert bleibt via Probe abrufbar.
const outlierCount = ref(0);
const outlierInfo = ref([]);
const outlierTitle = computed(() => {
  if (!outlierInfo.value.length) return '';
  const top = [...outlierInfo.value].sort((a, b) => b.value - a.value).slice(0, 8)
    .map(o => `• Zelle (${o.col},${o.row}): ${o.value.toFixed(1)} m`);
  const more = outlierInfo.value.length - top.length;
  return 'Numerische Ausreißer (für die Anzeige gekappt):\n' + top.join('\n')
    + (more > 0 ? `\n… und ${more} weitere` : '');
});
// Robuster Anzeige-Deckel (p99 ohne Spikes) des AKTUELL gerenderten Grids — von der
// Wasserhaut je Frame gemeldet. Treibt sowohl Farbskala als auch die Legende.
const legendRobustMax = ref(0);
function onWaterStats({ outlierCount: n, outliers, robustMax }) {
  outlierCount.value = n || 0;
  outlierInfo.value = outliers || [];
  if (robustMax > 0) legendRobustMax.value = robustMax;
}

// Layer, deren gerendertes Grid eine echte Wasserhöhe/-tiefe ist → Spike-Erkennung
// (Kappung + Gefahrenmarker) sinnvoll. Für Hazard/Velocity/Zeit-Layer: nur robuste
// Skala, keine "Instabilitäts"-Marker.
const DEPTH_LIKE_LAYERS = ['depth', 'velocity', 'flow', 'streamlines', 'max_depth', 'max_elev'];
const depthLikeLayer = computed(() => DEPTH_LIKE_LAYERS.includes(activeLayer.value));

// Legenden-Skala: Velocity nutzt die Velocity-Range; sonst 0 … robuster Deckel.
const legendMin = computed(() => (activeLayer.value === 'velocity' ? velColorMin.value : 0));
const legendMax = computed(() => {
  if (activeLayer.value === 'velocity') return effVelMax.value;
  return legendRobustMax.value > 0 ? legendRobustMax.value : currentLayerMax.value;
});

// Histogramm der Geschwindigkeiten des AKTUELLEN Frames (nur nasse, gültige Zellen), Bins über [0, globalMax].
const HIST_BINS = 48;
const velocityHistogram = computed(() => {
  const counts = new Array(HIST_BINS).fill(0);
  const gm = velocityGlobalMax.value;
  const vf = bridge.velocityFrames?.value?.get(currentFrame.value);
  if (!vf || gm <= 0) return { counts, maxCount: 0 };

  const depthArr = currentDepthData.value;
  const arr = depthArr ? (depthArr instanceof Float32Array ? depthArr : new Float32Array(depthArr)) : null;
  const inv = HIST_BINS / gm;
  let maxCount = 0;
  for (let i = 0; i < vf.length; i++) {
    const v = vf[i];
    if (!(v >= 0) || v >= 9000) continue;
    if (arr && !(arr[i] > 0.005)) continue; // nur nasse Zellen (wie die Heatmap)
    let b = Math.floor(v * inv);
    if (b < 0) b = 0; else if (b >= HIST_BINS) b = HIST_BINS - 1;
    counts[b]++;
    if (counts[b] > maxCount) maxCount = counts[b];
  }
  return { counts, maxCount };
});

// Wasser-Deckkraft (Slider): 0 = fast durchsichtig … 1 = komplett deckend.
// Default hoch, damit das Geländebett gut verdeckt ist (Bauwerke sind via Tiefen-Prepass
// ohnehin immer verdeckt). Tiefer ziehen = mehr Durchsicht.
const waterOpacity = ref(0.9);

const currentLayerMax = computed(() => {
  if (activeLayer.value === 'depth') return bridge.maxWaterDepth.value;
  if (activeLayer.value === 'velocity' || activeLayer.value === 'flow' || activeLayer.value === 'streamlines') {
    // Rough max velocity for legend scaling
    const vf = bridge.velocityFrames?.value?.get(currentFrame.value);
    if (!vf) return 3.0;
    let max = 0;
    for (let i = 0; i < vf.length; i++) { if (vf[i] > max) max = vf[i]; }
    return max || 3.0;
  }
  if (activeLayer.value === 'max_depth') return bridge.maxWaterDepth.value;
  if (activeLayer.value === 'hazard') return 5.0; // typical hazard scale
  return bridge.maxWaterDepth.value;
});
// ───────────────────────────────────────────────────────────────────────────

watch(currentFrame, (val) => {
  const frames = bridge.resultFrames.value;
  if (frames && frames.has(val)) {
    currentDepthData.value = frames.get(val);
  } else {
    currentDepthData.value = null;
  }

  if (analysisStore) {
    analysisStore.setActiveDepthData(currentDepthData.value);
  }
}, { immediate: true });

// Playback loop
watch(playing, (isPlaying) => {
  if (isPlaying) {
    const fps = 10;
    playTimer = setInterval(() => {
      if (currentFrame.value < bridge.totalFrames.value - 1) {
        currentFrame.value++;
      } else {
        playing.value = false; // Stop at end
      }
    }, 1000 / fps);
  } else {
    clearInterval(playTimer);
  }
});

onUnmounted(() => {
  clearInterval(playTimer);
});

// --- Tools ---
const activeTool = ref(null);
const tools = [
  { id: 'probe', icon: '📍', label: 'Zellenabfrage' },
  { id: 'section', icon: '📏', label: 'Querschnitt' },
  { id: 'volume', icon: '🧊', label: 'Volumenberechnung' }
];

// Querschnitt: Start gesetzt, aber noch nicht abgeschlossen (ResultMap3D meldet
// dies über sectionDraftChanged — erst Doppelklick/Enter/Bestätigen-Button beendet).
const sectionDrafting = ref(false);

// --- Probe ---
// Store the static cell position info for all active probes
const probedCells = ref([]);

function onCellProbed(info) {
  probedCells.value.push(info);
}

function removeProbe(id) {
  probedCells.value = probedCells.value.filter(c => c.id !== id);
  if (map3d.value) map3d.value.clearProbe(id);
}

// Reactive: re-computes water values whenever the frame changes for all probes
const probedCellList = computed(() => {
  const t = bridge.terrain.value;
  if (!t || probedCells.value.length === 0) return [];

  const depthArr = currentDepthData.value;
  let arr = null;
  if (depthArr) {
    arr = depthArr instanceof Float32Array ? depthArr : new Float32Array(depthArr);
  }

  return probedCells.value.map(pos => {
    // IMPORTANT: terrain gridData is BOTTOM-UP (row 0 = south).
    // pos.row follows terrain convention (bottom-up).
    // Depth data from OutputProcessor is TOP-DOWN (row 0 = north, ASC format).
    // So we must FLIP the row for depth data lookup.
    const depthIdx = (t.nrows - 1 - pos.row) * t.ncols + pos.col; // top-down (depth)

    // Read water depth from CURRENT frame
    let waterDepth = 0;
    if (arr && depthIdx >= 0 && depthIdx < arr.length) {
      waterDepth = Math.max(0, arr[depthIdx]);
    }

    const wsp = waterDepth > 0.001 ? pos.terrainZ + waterDepth : null;
    const cellVolume = waterDepth > 0.001 ? waterDepth * pos.cellsize * pos.cellsize : 0;

    return {
      ...pos,
      waterDepth,
      wsp,
      cellVolume
    };
  });
});

// --- SECTION ---
const sections = ref([]); 

function onSectionDrawn({ id, color, samples, structures, network }) {
  sections.value.push({
    id,
    color,
    baseData: samples,
    structures: structures || [],  // gekreuzte Wehre/Brücken (statisch)
    network: network || []         // gekreuzte Haltungen/Schächte (Füllstand kommt je Frame)
  });
}

function removeSection(id) {
  sections.value = sections.value.filter(s => s.id !== id);
  if (map3d.value) map3d.value.removeSection(id);
}

// Reactively compute water depth for ALL sections based on currentFrame
const computedSectionsList = computed(() => {
  const t = bridge.terrain.value;
  if (!t || sections.value.length === 0) return [];
  
  const depthArr = currentDepthData.value;
  let arr = null;
  if (depthArr) {
    arr = depthArr instanceof Float32Array ? depthArr : new Float32Array(depthArr);
  }
  // B.1: exakte Solver-Wasseroberfläche (.elev) — wenn vorhanden, statt terrain+depth.
  const elevRaw = currentElevData.value;
  let elevArr = null;
  if (elevRaw) elevArr = elevRaw instanceof Float32Array ? elevRaw : new Float32Array(elevRaw);

  return sections.value.map(section => {
    const computedData = section.baseData.map(pt => {
      let waterDepth = 0;
      let wsp = null;

      // We saved fx, fy in Map3D. We must bilinear interpolate the water depth just like terrain.
      // Remember depthData is TOP-DOWN. So we use (nrows - 1 - fy).
      if (arr) {
        const col0 = Math.floor(pt.fx);
        const col1 = col0 + 1;

        // Convert fy (bottom-up) to depth row (top-down) BEFORE floor
        const depthFy = (t.nrows - 1) - pt.fy;

        const row0 = Math.floor(depthFy);
        const row1 = row0 + 1;

        const wx = pt.fx - col0;
        const wy = depthFy - row0;

        // Generische bilineare Abtastung eines TOP-DOWN-Grids an (fx, fy).
        const sampleGrid = (g, mapVal = (v) => v) => {
          let s = 0, w = 0;
          const tap = (c, r, weight) => {
            if (c >= 0 && c < t.ncols && r >= 0 && r < t.nrows) {
              const v = g[r * t.ncols + c];
              if (v > -9000) { s += mapVal(v) * weight; w += weight; }
            }
          };
          tap(col0, row0, (1 - wx) * (1 - wy));
          tap(col1, row0, wx * (1 - wy));
          tap(col0, row1, (1 - wx) * wy);
          tap(col1, row1, wx * wy);
          return w > 0.001 ? s / w : null;
        };

        const d = sampleGrid(arr, (v) => Math.max(0, v));
        if (d != null) waterDepth = d;
        wsp = waterDepth > 0.001 ? pt.terrainZ + waterDepth : null;

        // Exakte Solver-Oberfläche bevorzugen (z.B. über SGC-Gerinne korrekter als terrain+depth).
        if (elevArr) {
          const elev = sampleGrid(elevArr);
          if (elev != null && elev > pt.terrainZ + 0.001) {
            wsp = elev;
            waterDepth = elev - pt.terrainZ;
          }
        }
      }

      return { ...pt, waterDepth, wsp };
    });
    
    // Kanalnetz-Durchstoßpunkte mit dem 1D-Zustand des AKTUELLEN Frames anreichern
    // (Fließtiefe/Füllgrad/Q/v aus networkFrameState; ohne Ergebnisse bleibt res null
    // → das Chart zeichnet dann nur die Rohr-/Schacht-Geometrie).
    const st = networkFrameState.value;
    const network = (section.network || []).map(c => ({
      ...c,
      res: (c.kind === 'pipe' ? st?.links?.get(c.id) : st?.nodes?.get(c.id)) ?? null,
    }));

    return {
      id: section.id,
      color: section.color,
      data: computedData,
      structures: section.structures || [],
      network
    };
  });
});

// --- VOLUME ---
// Volumen-Ganglinie je Polygon über ALLE Frames (Volumen ist unabhängig von Toleranz & aktuellem Frame
// → einmalig, stabil; rechnet nur neu, wenn Polygone oder Frames wechseln).
const volumeSeriesById = computed(() => {
  const out = {};
  const frames = bridge.resultFrames?.value;
  const header = analysisStore.currentGridHeader;
  if (!frames || frames.size === 0 || !header) return out;
  const cs = header.cellsize;
  const sortedKeys = [...frames.keys()].sort((a, b) => a - b);
  for (const poly of analysisStore.polygons) {
    let maxVolume = 0;
    const series = sortedKeys.map(fk => {
      const depth = frames.get(fk);
      const v = calculateVolumeWithConfidence(
        poly.indices.activeIndices, poly.indices.boundaryIndices, depth, cs, 0
      ).volume;
      if (v > maxVolume) maxVolume = v;
      return { frame: fk, volume: v };
    });
    out[poly.id] = { series, maxVolume };
  }
  return out;
});

// Aktuelle Frame-Statistik (Volumen/Fehler/Konfidenz) mit Ganglinie + Max zusammenführen.
const volumePanelData = computed(() =>
  analysisStore.polygonVolumes.map(pv => ({
    ...pv,
    ...(volumeSeriesById.value[pv.id] || { series: [], maxVolume: pv.volume })
  }))
);

function removeVolumeAnalysis(id) {
  analysisStore.removePolygon(id);
  if (map3d.value) {
    map3d.value.removeVolumePolygon(id);
  }
}

// Ensure the Analysis Store knows if we close the viewer
onUnmounted(() => {
  clearInterval(playTimer);
  analysisStore.clearAnalysis();
});

// Expose for child components
const map3d = ref(null);
</script>

<style scoped>
.result-viewer-root {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--sv-bg);
  overflow: hidden;
  font-family: var(--sv-font);
}

/* Loading */
.loading-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 50% 40%, #1b1b28 0%, var(--sv-bg) 70%);
}

.loading-content {
  text-align: center;
  color: var(--sv-text-lime);
  font-family: var(--sv-font);
  letter-spacing: 0.06em;
  text-shadow: var(--sv-glow-lime);
}

.loading-svg {
  width: 160px;
  height: 160px;
  margin: 0 auto 0.5rem;
  filter: drop-shadow(0 0 12px rgba(139, 92, 246, 0.5));
}

.progress-bar {
  width: 300px;
  height: 6px;
  background: rgba(139, 92, 246, 0.18);
  border-radius: 3px;
  margin: 1rem auto;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--sv-violet), var(--sv-lime));
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 0.85rem;
  color: var(--sv-text-dim);
}

/* Viewport */
.viewport {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.viewport.probe-active {
  cursor: crosshair;
}

/* Legend */
.legend-overlay {
  position: absolute;
  left: 16px;
  bottom: 24px;
  z-index: 10;
}

/* Instabilitäts-/Gefahrenstellen-Badge */
.instability-badge {
  position: absolute;
  left: 16px;
  top: 16px;
  z-index: 11;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(183, 28, 28, 0.92);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.2px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  cursor: help;
  pointer-events: auto;
  animation: instab-pulse 1.6s ease-in-out infinite;
}
.instability-badge small {
  font-weight: 400;
  font-size: 10px;
  opacity: 0.85;
}
@keyframes instab-pulse {
  0%, 100% { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35); }
  50%      { box-shadow: 0 2px 14px rgba(255, 23, 68, 0.7); }
}

/* Querschnitt: Hinweis + Bestätigen-Button, solange der Schnitt noch nicht fertig ist */
.section-confirm-hint {
  position: absolute;
  left: 50%;
  top: 16px;
  transform: translateX(-50%);
  z-index: 11;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
  border-radius: 10px;
  background: rgba(20, 20, 40, 0.92);
  border: 1px solid rgba(163, 230, 53, 0.35);
  color: #e0e0e0;
  font-size: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  pointer-events: auto;
}
.section-confirm-hint .hint-key { color: #90a4ae; font-size: 11px; }
.confirm-btn {
  background: rgba(163, 230, 53, 0.2);
  border: 1px solid rgba(163, 230, 53, 0.6);
  color: #d9f99d;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 6px;
  cursor: pointer;
}
.confirm-btn:hover { background: rgba(163, 230, 53, 0.35); }

/* Cell Info Panel */
.cell-info-panel {
  position: absolute;
  right: 72px;
  top: 16px;
  width: 280px;
  background: rgba(20, 20, 40, 0.92);
  backdrop-filter: blur(16px);
  border-radius: 14px;
  border: 1px solid rgba(163,230,53, 0.25);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  z-index: 20;
  overflow: hidden;
}

.cell-info-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(163,230,53, 0.12);
  border-bottom: 1px solid rgba(163,230,53, 0.15);
  font-weight: 600;
  color: #e0e0e0;
  font-size: 0.9rem;
}

.close-btn {
  background: none;
  border: none;
  color: #90a4ae;
  font-size: 1.3rem;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.close-btn:hover { color: #ff5252; }

.cell-info-body {
  padding: 12px 16px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
}

.info-row.small {
  padding: 3px 0;
}

.info-label {
  color: #90a4ae;
  font-size: 0.82rem;
}

.info-row.small .info-label,
.info-row.small .info-value {
  font-size: 0.78rem;
}

.info-value {
  color: #e0e0e0;
  font-weight: 600;
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
}

.info-value.wsp {
  color: #a3e635;
}

.info-value.wet {
  color: #00e5ff;
}

.info-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 8px 0;
}

/* Slide transition */
.slide-info-enter-active,
.slide-info-leave-active {
  transition: all 0.25s ease;
}
.slide-info-enter-from,
.slide-info-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

/* No Data */
.no-data {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #90a4ae;
}

.no-data h2 { font-size: 2rem; margin-bottom: 0.5rem; }
.no-data p { font-size: 1.1rem; }
</style>
