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
          @cellProbed="onCellProbed"
        />

        <!-- Legend Overlay -->
        <ResultLegend
          :maxDepth="bridge.maxWaterDepth.value"
          class="legend-overlay"
        />

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

        <!-- Cell Info Panel -->
        <Transition name="slide-info">
          <div v-if="probedCell" class="cell-info-panel">
            <div class="cell-info-header">
              <span>📍 Zellenabfrage</span>
              <button class="close-btn" @click="clearProbe">&times;</button>
            </div>
            <div class="cell-info-body">
              <div class="info-row">
                <span class="info-label">Gelände</span>
                <span class="info-value">{{ probedCell.terrainZ.toFixed(2) }} m</span>
              </div>
              <div class="info-row" v-if="probedCell.wsp !== null">
                <span class="info-label">Wasserspiegel</span>
                <span class="info-value wsp">{{ probedCell.wsp.toFixed(2) }} m</span>
              </div>
              <div class="info-row">
                <span class="info-label">Wassertiefe</span>
                <span class="info-value" :class="{ wet: probedCell.waterDepth > 0.001 }">
                  {{ probedCell.waterDepth > 0.001 ? probedCell.waterDepth.toFixed(3) + ' m' : '— trocken —' }}
                </span>
              </div>
              <div class="info-row">
                <span class="info-label">Zellvolumen</span>
                <span class="info-value">{{ probedCell.cellVolume.toFixed(3) }} m³</span>
              </div>
              <div class="info-divider"></div>
              <div class="info-row small">
                <span class="info-label">Koordinaten</span>
                <span class="info-value">{{ probedCell.worldX.toFixed(2) }}, {{ probedCell.worldY.toFixed(2) }}</span>
              </div>
              <div class="info-row small">
                <span class="info-label">Rasterzelle</span>
                <span class="info-value">Spalte {{ probedCell.col }}, Zeile {{ probedCell.row }}</span>
              </div>
              <div class="info-row small">
                <span class="info-label">Zellgröße</span>
                <span class="info-value">{{ probedCell.cellsize }} m</span>
              </div>
              <div class="info-divider"></div>
              <div class="info-row small">
                <span class="info-label">Frame</span>
                <span class="info-value">{{ currentFrame }} / {{ bridge.totalFrames.value }}</span>
              </div>
              <div class="info-row small">
                <span class="info-label">Depth Data</span>
                <span class="info-value">{{ currentDepthData ? '✅ ' + currentDepthData.length + ' cells' : '❌ null' }}</span>
              </div>
              <div class="info-row small">
                <span class="info-label">GridIdx</span>
                <span class="info-value">T:{{ probedCell.row * (bridge.terrain.value?.ncols || 0) + probedCell.col }} D:{{ ((bridge.terrain.value?.nrows || 1) - 1 - probedCell.row) * (bridge.terrain.value?.ncols || 0) + probedCell.col }}</span>
              </div>
              <div class="info-row small">
                <span class="info-label">Frame Keys</span>
                <span class="info-value" style="font-size:0.65rem">{{ [...bridge.resultFrames.value.keys()].slice(0,6).join(',') }}{{ bridge.resultFrames.value.size > 6 ? '...' : '' }}</span>
              </div>
            </div>
          </div>
        </Transition>
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

// --- Data Bridge (reads from window.opener) ---
const bridge = useResultDataFromOpener();

onMounted(() => {
  bridge.loadData();
  document.title = '🌊 Flood-2D Result Viewer';
});

// --- Timeline ---
const currentFrame = ref(0);
const playing = ref(false);
let playTimer = null;
const playbackSpeed = ref(1);

const currentDepthData = computed(() => {
  return bridge.resultFrames.value.get(currentFrame.value) || null;
});

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
// Store only the static cell position info; water data is computed per frame.
const probedCellPos = ref(null);

function onCellProbed(info) {
  probedCellPos.value = info;
}

function clearProbe() {
  probedCellPos.value = null;
  if (map3d.value) map3d.value.clearProbe();
}

// Reactive: re-computes water values whenever the frame changes
const probedCell = computed(() => {
  const pos = probedCellPos.value;
  if (!pos) return null;

  const t = bridge.terrain.value;
  if (!t) return null;

  // IMPORTANT: terrain gridData is BOTTOM-UP (row 0 = south).
  // pos.row follows terrain convention (bottom-up).
  // Depth data from OutputProcessor is TOP-DOWN (row 0 = north, ASC format).
  // So we must FLIP the row for depth data lookup.
  const terrainIdx = pos.row * t.ncols + pos.col;        // bottom-up (terrain)
  const depthIdx = (t.nrows - 1 - pos.row) * t.ncols + pos.col; // top-down (depth)

  // Read water depth from CURRENT frame
  let waterDepth = 0;
  const depthArr = currentDepthData.value;

  if (depthArr) {
    const arr = depthArr instanceof Float32Array ? depthArr : new Float32Array(depthArr);
    if (depthIdx >= 0 && depthIdx < arr.length) {
      waterDepth = Math.max(0, arr[depthIdx]);
    }
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
