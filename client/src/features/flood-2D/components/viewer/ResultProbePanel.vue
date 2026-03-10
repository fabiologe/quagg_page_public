<template>
  <div 
    class="cell-info-panel"
    :style="panelStyle"
  >
    <div 
      class="cell-info-header"
      :style="headerStyle"
      @mousedown="startDrag"
    >
      <span>📍 Zellenabfrage</span>
      <button class="close-btn" @click.stop="handleClose">&times;</button>
    </div>
    <div class="cell-info-body">
      <div class="info-row">
        <span class="info-label">Gelände</span>
        <span class="info-value">{{ cell.terrainZ.toFixed(2) }} m</span>
      </div>
      <div class="info-row" v-if="cell.wsp !== null">
        <span class="info-label">Wasserspiegel</span>
        <span class="info-value wsp">{{ cell.wsp.toFixed(2) }} m</span>
      </div>
      <div class="info-row">
        <span class="info-label">Wassertiefe</span>
        <span class="info-value" :class="{ wet: cell.waterDepth > 0.001 }">
          {{ cell.waterDepth > 0.001 ? cell.waterDepth.toFixed(3) + ' m' : '— trocken —' }}
        </span>
      </div>
      <div class="info-row">
        <span class="info-label">Zellvolumen</span>
        <span class="info-value">{{ cell.cellVolume.toFixed(3) }} m³</span>
      </div>
      <div class="info-divider"></div>
      <div class="info-row small">
        <span class="info-label">Koordinaten</span>
        <span class="info-value">{{ cell.worldX.toFixed(2) }}, {{ cell.worldY.toFixed(2) }}</span>
      </div>
      <div class="info-row small">
        <span class="info-label">Rasterzelle</span>
        <span class="info-value">Spalte {{ cell.col }}, Zeile {{ cell.row }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';

const props = defineProps({
  cell: Object
});

const emit = defineEmits(['closeRequested']);

function handleClose() {
  if (props.cell) {
    emit('closeRequested', props.cell.id);
  }
}

// --- Dragging Logic ---
const position = ref({ x: 0, y: 0 });
const isDragging = ref(false);
let startMousePos = { x: 0, y: 0 };
let startPanelPos = { x: 0, y: 0 };

onMounted(() => {
  // Spawn panels dynamically based on where the user clicked, or offset from right side
  const offset = Math.floor(Math.random() * 40);
  position.value.x = window.innerWidth - 300 - 24 - offset; // Right side
  position.value.y = 80 + offset;
});

function startDrag(e) {
  if (e.target.tagName.toLowerCase() === 'button') return;
  isDragging.value = true;
  startMousePos = { x: e.clientX, y: e.clientY };
  startPanelPos = { ...position.value };
  window.addEventListener('mousemove', onDrag);
  window.addEventListener('mouseup', stopDrag);
}

function onDrag(e) {
  if (!isDragging.value) return;
  e.preventDefault();
  const dx = e.clientX - startMousePos.x;
  const dy = e.clientY - startMousePos.y;
  position.value.x = startPanelPos.x + dx;
  position.value.y = Math.max(0, startPanelPos.y + dy);
}

function stopDrag() {
  isDragging.value = false;
  window.removeEventListener('mousemove', onDrag);
  window.removeEventListener('mouseup', stopDrag);
}

const panelStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
}));

const headerStyle = computed(() => ({
  cursor: isDragging.value ? 'grabbing' : 'grab'
}));
</script>

<style scoped>
.cell-info-panel {
  position: absolute;
  width: 250px;
  background: rgba(20, 20, 40, 0.92);
  backdrop-filter: blur(16px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  font-family: 'Inter', sans-serif;
  color: #e0e0e0;
  z-index: 25;
  user-select: none;
}

.cell-info-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-weight: 600;
  font-size: 0.95rem;
}

.close-btn {
  background: transparent;
  border: none;
  color: #90a4ae;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0 4px;
}

.close-btn:hover {
  color: #fff;
}

.cell-info-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
}

.info-row.small {
  font-size: 0.75rem;
  color: #90a4ae;
}

.info-label {
  color: #90a4ae;
}

.info-value {
  font-weight: 600;
  color: #fff;
}

.info-value.wet {
  color: #00e5ff;
}

.info-value.wsp {
  color: #81d4fa;
}

.info-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 4px 0;
}
</style>
