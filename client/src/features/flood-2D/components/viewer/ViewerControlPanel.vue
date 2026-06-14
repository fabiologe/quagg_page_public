<template>
  <div class="vcp" :class="{ collapsed: !open }">
    <div class="vcp-head" @click="open = !open">
      <span class="vcp-title">🎛 Steuerung</span>
      <button class="vcp-toggle" :title="open ? 'Einklappen' : 'Ausklappen'">{{ open ? '▾' : '▸' }}</button>
    </div>

    <div v-show="open" class="vcp-body">
      <!-- Ebenen -->
      <div class="vcp-section">
        <div class="vcp-label">Ebene</div>
        <div class="vcp-grid">
          <button
            v-for="layer in layers"
            :key="layer.id"
            :class="['vcp-chip', { active: activeLayer === layer.id }]"
            @click="$emit('update:activeLayer', layer.id)"
            :title="layer.label"
          >{{ layer.icon }} {{ layer.label }}</button>
        </div>
      </div>

      <!-- Werkzeuge -->
      <div class="vcp-section">
        <div class="vcp-label">Werkzeuge</div>
        <div class="vcp-grid">
          <button
            v-for="tool in tools"
            :key="tool.id"
            :class="['vcp-chip', { active: activeTool === tool.id }]"
            @click="$emit('update:activeTool', activeTool === tool.id ? null : tool.id)"
            :title="tool.label"
          >{{ tool.icon }} {{ tool.label }}</button>
        </div>
      </div>

      <!-- Regler -->
      <div class="vcp-section">
        <label class="vcp-slider">
          <span>💧 Deckkraft</span>
          <input type="range" min="0" max="1" step="0.01" :value="waterOpacity"
                 @input="$emit('update:waterOpacity', Number($event.target.value))" />
        </label>
        <label v-if="activeLayer === 'flow' || activeLayer === 'streamlines'" class="vcp-slider">
          <span>{{ activeLayer === 'streamlines' ? '🌀 Liniendichte' : '🧭 Pfeildichte' }}</span>
          <input type="range" min="0" max="1" step="0.01" :value="flowDensity"
                 @input="$emit('update:flowDensity', Number($event.target.value))" />
        </label>
      </div>

      <!-- Velocity-Farbbereich + Histogramm -->
      <div v-if="activeLayer === 'velocity'" class="vcp-section">
        <VelocityColorControl
          :histogram="velocityHistogram"
          :globalMax="velocityGlobalMax"
          :min="velMin"
          :max="velMax"
          @update:min="$emit('update:velMin', $event)"
          @update:max="$emit('update:velMax', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import VelocityColorControl from '@/features/flood-2D/components/viewer/VelocityColorControl.vue';

defineProps({
  layers: { type: Array, default: () => [] },
  activeLayer: { type: String, default: 'depth' },
  tools: { type: Array, default: () => [] },
  activeTool: { type: String, default: null },
  waterOpacity: { type: Number, default: 0.9 },
  flowDensity: { type: Number, default: 0.65 },
  velocityHistogram: { type: Object, default: () => ({ counts: [], maxCount: 0 }) },
  velocityGlobalMax: { type: Number, default: 1 },
  velMin: { type: Number, default: 0 },
  velMax: { type: Number, default: 1 },
});

defineEmits([
  'update:activeLayer', 'update:activeTool', 'update:waterOpacity',
  'update:flowDensity', 'update:velMin', 'update:velMax',
]);

const open = ref(true);
</script>

<style scoped>
.vcp {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 12;
  width: 320px;
  background: rgba(20, 24, 40, 0.86);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  font-family: 'Inter', 'Segoe UI', sans-serif;
}
.vcp.collapsed { width: 180px; }

.vcp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  cursor: pointer;
  user-select: none;
}
.vcp-head:hover { background: rgba(255, 255, 255, 0.05); }
.vcp-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: #e0e0e0;
  letter-spacing: 0.3px;
}
.vcp-toggle {
  background: none;
  border: none;
  color: #90a4ae;
  font-size: 0.9rem;
  cursor: pointer;
  line-height: 1;
}

.vcp-body {
  padding: 4px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: calc(100vh - 130px);
  overflow-y: auto;
}

.vcp-section { display: flex; flex-direction: column; gap: 7px; }
.vcp-label {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #78909c;
}
.vcp-grid { display: flex; flex-wrap: wrap; gap: 6px; }

.vcp-chip {
  padding: 5px 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  background: transparent;
  color: #bdc3c7;
  font-size: 0.74rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.vcp-chip:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
.vcp-chip.active {
  background: rgba(52, 152, 219, 0.35);
  border-color: #3498db;
  color: #5dade2;
}

.vcp-slider {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 0.72rem;
  color: #b0bec5;
}
.vcp-slider input[type="range"] {
  flex: 1;
  max-width: 170px;
  accent-color: #3498db;
  cursor: pointer;
}

/* eingebetteten Velocity-Regler an die Panelbreite anpassen */
.vcp-section :deep(.vel-control) {
  width: 100%;
  box-shadow: none;
  border: none;
  background: rgba(255, 255, 255, 0.04);
  padding: 8px;
}
</style>
