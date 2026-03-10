<template>
  <div 
    class="volume-panel" 
    :style="panelStyle"
  >
    <div 
      class="panel-header" 
      :style="headerStyle"
      @mousedown="startDrag"
    >
      <span class="title" :style="{ color: polygon.color }">🧊 Volumen-Analyse</span>
      <button class="clear-btn" @click.stop="handleClear" title="Polygon löschen">Löschen</button>
    </div>

    <div class="panel-body">
      <div v-if="!polygon" class="loading-state">
        Berechne...
      </div>
      <div v-else class="stats-container">
        <div class="stat-row main-volume">
          <span class="label">Eingestautes Volumen</span>
          <span class="value">{{ formattedVolume }} <span class="unit">m³</span></span>
        </div>

        <div class="stat-row error-margin">
          <span class="label">Fehlermarge (Konfidenz)</span>
          <span class="value">± {{ polygon.formattedError }} <span class="unit">m³</span></span>
        </div>
        
        <div class="info-text">
          Toleranz: DGM-Ungenauigkeit + Polygon-Randzellen
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  polygon: Object
});

const emit = defineEmits(['clearRequested']);

const formattedVolume = computed(() => {
  return props.polygon?.formattedVolume || '0';
});

function handleClear() {
  if (props.polygon) {
    emit('clearRequested', props.polygon.id);
  }
}

// --- Dragging Logic ---
const position = ref({ x: 0, y: 0 });
const isDragging = ref(false);
let startMousePos = { x: 0, y: 0 };
let startPanelPos = { x: 0, y: 0 };

onMounted(() => {
  // Spawn panels slightly offset so they don't perfectly overlap
  const offset = Math.floor(Math.random() * 40);
  position.value.x = 24 + offset;
  position.value.y = 80 + offset;
});

function startDrag(e) {
  // Ignore clicks on buttons
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
  position.value.y = Math.max(0, startPanelPos.y + dy); // Prevent dragging completely above viewport
}

function stopDrag() {
  isDragging.value = false;
  window.removeEventListener('mousemove', onDrag);
  window.removeEventListener('mouseup', stopDrag);
}

const panelStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
  borderColor: hexToRgba(props.polygon?.color || '#00e5ff', 0.6),
  boxShadow: `0 8px 32px ${hexToRgba(props.polygon?.color || '#000000', 0.15)}`
}));

const headerStyle = computed(() => ({
  backgroundColor: hexToRgba(props.polygon?.color || '#00e5ff', 0.15),
  cursor: isDragging.value ? 'grabbing' : 'grab'
}));

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
</script>

<style scoped>
.volume-panel {
  position: absolute;
  width: 320px;
  background: rgba(20, 20, 40, 0.92);
  backdrop-filter: blur(16px);
  border-radius: 12px;
  border: 1px solid rgba(0, 229, 255, 0.4);
  z-index: 20;
  overflow: hidden;
  font-family: 'Inter', sans-serif;
  color: #e0e0e0;
  transition: box-shadow 0.2s, border-color 0.2s;
  user-select: none;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.title {
  font-weight: 600;
  font-size: 0.95rem;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

.clear-btn {
  background: rgba(255, 82, 82, 0.15);
  border: 1px solid rgba(255, 82, 82, 0.5);
  color: #ff5252;
  font-size: 0.8rem;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: rgba(255, 82, 82, 0.3);
  color: #fff;
}

.panel-body {
  padding: 16px;
}

.loading-state {
  text-align: center;
  color: #90a4ae;
  font-style: italic;
}

.stats-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: 0.8rem;
  color: #90a4ae;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.value {
  font-size: 1.8rem;
  font-weight: 700;
  color: #ffffff;
  font-variant-numeric: tabular-nums;
}

.error-margin .value {
  font-size: 1.2rem;
  color: #ffb74d; /* warning orange */
}

.unit {
  font-size: 0.9rem;
  font-weight: 400;
  color: #90a4ae;
}

.info-text {
  margin-top: 8px;
  font-size: 0.7rem;
  color: #78909c;
  border-top: 1px solid rgba(255,255,255,0.1);
  padding-top: 8px;
}
</style>
