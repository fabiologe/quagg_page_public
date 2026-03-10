<template>
  <div class="result-viewer-root">
    <!-- Loading State -->
    <div v-if="bridge.isLoading.value" class="loading-overlay">
      <div class="loading-content">
        <div class="spinner"></div>
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
          :depthData="currentDepthData"
          :maxWaterDepth="bridge.maxWaterDepth.value"
          :bciContent="bridge.bciContent.value"
          :probeActive="activeTool === 'probe'"
          :activeTool="activeTool"
          @cellProbed="onCellProbed"
          @sectionDrawn="onSectionDrawn"
        />

        <!-- Legend Overlay -->
        <ResultLegend
          :maxDepth="bridge.maxWaterDepth.value"
          class="legend-overlay"
        />
        
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
        </template>

        <!-- Volume Panels -->
        <template v-if="activeTool === 'volume'">
          <TransitionGroup name="fade-slide">
            <ResultVolumePanel 
              v-for="poly in analysisStore.polygonVolumes" 
              :key="poly.id"
              :polygon="poly"
              @clearRequested="removeVolumeAnalysis"
            />
          </TransitionGroup>
        </template>

        <!-- Tool Buttons -->
        <div class="tool-buttons">
          <button
            v-for="tool in tools"
            :key="tool.id"
            :class="['tool-btn', { active: activeTool === tool.id }]"
            @click="activeTool = activeTool === tool.id ? null : tool.id"
            :title="tool.label"
          >
            {{ tool.icon }}
          </button>
        </div>

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
      <h2>😕 Keine Daten</h2>
      <p v-if="bridge.error.value">{{ bridge.error.value }}</p>
      <p v-else>Starte zuerst eine Simulation im Hauptfenster.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useResultDataFromOpener } from '@/features/flood-2D/composables/useResultDataBridge.js';

import ResultMap3D from '@/features/flood-2D/components/viewer/ResultMap3D.vue';
import ResultTimeline from '@/features/flood-2D/components/viewer/ResultTimeline.vue';
import ResultLegend from '@/features/flood-2D/components/viewer/ResultLegend.vue';
import ResultSectionChart from '@/features/flood-2D/components/viewer/ResultSectionChart.vue';
import ResultVolumePanel from '@/features/flood-2D/components/viewer/ResultVolumePanel.vue';
import ResultProbePanel from '@/features/flood-2D/components/viewer/ResultProbePanel.vue';

import { useAnalysisStore } from '@/features/flood-2D/stores/useAnalysisStore';

// --- Data Bridge (reads from window.opener) ---
const bridge = useResultDataFromOpener();

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
const playbackSpeed = ref(1);

const currentDepthData = ref(null);

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
    const fps = 10 * playbackSpeed.value;
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

function onSectionDrawn({ id, color, samples }) {
  sections.value.push({
    id,
    color,
    baseData: samples
  });
}

function removeSection(id) {
  sections.value = sections.value.filter(s => s.id !== id);
  if (map3d.value) map3d.value.removeSection(id);
}

function clearAllSections() {
  sections.value = [];
  if (map3d.value) map3d.value.clearSection();
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

  return sections.value.map(section => {
    const computedData = section.baseData.map(pt => {
      let waterDepth = 0;
      
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

        let wSum = 0;
        let dSum = 0;

        const getD = (c, r, weight) => {
          if (c >= 0 && c < t.ncols && r >= 0 && r < t.nrows) {
            const val = arr[r * t.ncols + c];
            if (val > -9000) { 
              dSum += Math.max(0, val) * weight;
              wSum += weight;
            }
          }
        };

        getD(col0, row0, (1 - wx) * (1 - wy));
        getD(col1, row0, wx * (1 - wy));
        getD(col0, row1, (1 - wx) * wy);
        getD(col1, row1, wx * wy);

        if (wSum > 0.001) {
          waterDepth = dSum / wSum;
        }
      }
      
      return {
        ...pt,
        waterDepth,
        wsp: waterDepth > 0.001 ? pt.terrainZ + waterDepth : null
      };
    });
    
    return {
      id: section.id,
      color: section.color,
      data: computedData
    };
  });
});

// --- VOLUME ---
function clearVolumeAnalysis() {
  analysisStore.clearAnalysis();
  if (map3d.value) {
    map3d.value.clearVolume();
  }
}

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
  background: #1a1a2e;
  overflow: hidden;
  font-family: 'Inter', 'Segoe UI', sans-serif;
}

/* Loading */
.loading-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}

.loading-content {
  text-align: center;
  color: #e0e0e0;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid rgba(255,255,255,0.15);
  border-top-color: #4fc3f7;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin { to { transform: rotate(360deg); } }

.progress-bar {
  width: 300px;
  height: 6px;
  background: rgba(255,255,255,0.1);
  border-radius: 3px;
  margin: 1rem auto;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4fc3f7, #00bcd4);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 0.85rem;
  color: #90a4ae;
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

/* Tool Buttons */
.tool-buttons {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 10;
}

.tool-btn {
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 10px;
  background: rgba(30, 30, 50, 0.85);
  backdrop-filter: blur(8px);
  color: #e0e0e0;
  font-size: 1.2rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tool-btn:hover {
  background: rgba(50, 50, 80, 0.9);
  transform: scale(1.1);
}

.tool-btn.active {
  background: rgba(79, 195, 247, 0.3);
  box-shadow: 0 0 12px rgba(79, 195, 247, 0.4);
  border: 1px solid rgba(79, 195, 247, 0.5);
}

/* Cell Info Panel */
.cell-info-panel {
  position: absolute;
  right: 72px;
  top: 16px;
  width: 280px;
  background: rgba(20, 20, 40, 0.92);
  backdrop-filter: blur(16px);
  border-radius: 14px;
  border: 1px solid rgba(79, 195, 247, 0.25);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  z-index: 20;
  overflow: hidden;
}

.cell-info-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(79, 195, 247, 0.12);
  border-bottom: 1px solid rgba(79, 195, 247, 0.15);
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
  color: #4fc3f7;
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
