<template>
  <div class="vcp" :class="{ collapsed: !open }">
    <div class="vcp-head" @click="open = !open">
      <span class="vcp-title"><SvEmoji emoji="🎛" :size="15" /> Steuerung</span>
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
          ><SvEmoji :emoji="layer.icon" :size="14" /> {{ layer.label }}</button>
        </div>
      </div>

      <!-- Kanalnetz (1D): Layer-Toggle + Färbmodus der Haltungen -->
      <div v-if="networkAvailable" class="vcp-section">
        <div class="vcp-label">Kanalnetz (1D)</div>
        <div class="vcp-grid">
          <button
            :class="['vcp-chip', { active: showNetwork }]"
            @click="$emit('update:showNetwork', !showNetwork)"
            title="Kanalnetz ein-/ausblenden"
          ><SvEmoji emoji="👁" :size="14" /> Sichtbar</button>
          <button
            v-for="m in networkModes"
            :key="m.id"
            :class="['vcp-chip', { active: networkColorMode === m.id }]"
            :disabled="!showNetwork"
            @click="$emit('update:networkColorMode', m.id)"
            :title="m.title"
          >{{ m.label }}</button>
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
          ><SvEmoji :emoji="tool.icon" :size="14" /> {{ tool.label }}</button>
        </div>
      </div>

      <!-- Regler -->
      <div class="vcp-section">
        <label class="vcp-slider">
          <span><SvEmoji emoji="💧" :size="14" /> Deckkraft</span>
          <input type="range" min="0" max="1" step="0.01" :value="waterOpacity"
                 @input="$emit('update:waterOpacity', Number($event.target.value))" />
        </label>
        <label v-if="activeLayer === 'flow' || activeLayer === 'streamlines'" class="vcp-slider">
          <span>
            <SvEmoji :emoji="activeLayer === 'streamlines' ? '🌀' : '🧭'" :size="14" />
            {{ activeLayer === 'streamlines' ? 'Liniendichte' : 'Pfeildichte' }}
          </span>
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
import SvEmoji from '@/features/flood-2D/components/common/SvEmoji.vue';

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
  networkAvailable: { type: Boolean, default: false }, // 1D-Ergebnisse vorhanden?
  showNetwork: { type: Boolean, default: true },
  networkColorMode: { type: String, default: 'capacity' },
});

defineEmits([
  'update:activeLayer', 'update:activeTool', 'update:waterOpacity',
  'update:flowDensity', 'update:velMin', 'update:velMax',
  'update:showNetwork', 'update:networkColorMode',
]);

// Färbmodi der Haltungen (Skala jeweils global über das ganze Netz)
const networkModes = [
  { id: 'capacity', label: 'Füllgrad',        title: 'Füllgrad (grau → blau, Vollfüllung rot)' },
  { id: 'flow',     label: 'Durchfluss',      title: '|Q| global normiert (Basis → blau → rot)' },
  { id: 'velocity', label: 'Geschwindigkeit', title: '|v| global normiert (Basis → blau → rot)' },
];

const open = ref(true);
</script>

<style scoped>
.vcp {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 12;
  width: 320px;
  background: var(--sv-surface);
  backdrop-filter: blur(10px);
  border: 1px solid var(--sv-border);
  border-radius: var(--sv-radius);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45), var(--sv-glow-violet);
  overflow: hidden;
  font-family: var(--sv-font);
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
.vcp-head:hover { background: rgba(139, 92, 246, 0.1); }
.vcp-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--sv-text-violet);
  text-shadow: var(--sv-glow-violet);
  letter-spacing: 0.3px;
}
.vcp-toggle {
  background: none;
  border: none;
  color: var(--sv-text-dim);
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
  color: var(--sv-text-dim);
}
.vcp-grid { display: flex; flex-wrap: wrap; gap: 6px; }

.vcp-chip {
  padding: 5px 10px;
  border: 1px solid var(--sv-border);
  border-radius: 6px;
  background: transparent;
  color: var(--sv-text-dim);
  font-size: 0.74rem;
  font-family: var(--sv-font);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.vcp-chip:hover { background: rgba(139, 92, 246, 0.15); color: var(--sv-text); }
.vcp-chip:disabled { opacity: 0.4; cursor: default; }
.vcp-chip.active {
  background: rgba(139, 92, 246, 0.25);
  border-color: var(--sv-lime);
  color: var(--sv-lime);
}

.vcp-slider {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 0.72rem;
  color: var(--sv-text-dim);
}
.vcp-slider input[type="range"] {
  flex: 1;
  max-width: 170px;
  accent-color: var(--sv-lime);
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
