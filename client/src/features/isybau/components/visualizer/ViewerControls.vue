<template>
  <div class="controls" @wheel.stop>
    <div class="mode-toggle">
      <button
        @click="$emit('set-mode', 'pan')"
        :class="{ active: mode === 'pan' }"
        title="Verschieben (Pan)"
      >
        <img class="vc-ic" src="/saintv1d/icons/Interface-Essential-Expand-3--Streamline-Pixel.svg" />
      </button>
      <button
        @click="$emit('set-mode', 'select')"
        :class="{ active: mode === 'select' }"
        title="Auswählen (Select)"
      >
        <img class="vc-ic" src="/saintv1d/icons/Interface-Essential-Cursor--Streamline-Pixel.svg" />
      </button>
    </div>
    <div class="separator-v"></div>
    <div class="grid-control">
      <button
        @click="cycleGridSize"
        class="grid-toggle-btn"
        :title="`Raster: ${gridSize === 0 ? 'Aus' : gridSize + 'x' + gridSize + 'm'}`"
      >
        <svg v-if="gridSize === 0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4a4a4a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="3" x2="21" y2="21"></line></svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--isy-pixel-green, #219653)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M3 9h18"></path><path d="M3 15h18"></path><path d="M9 3v18"></path><path d="M15 3v18"></path></svg>
        <span class="grid-label">{{ gridSize === 0 ? 'Aus' : gridSize + 'm' }}</span>
      </button>
    </div>
    <div class="separator-v"></div>
    <div class="size-control">
      <span class="size-label sm">T</span>
      <input type="range" :value="textSizeMultiplier" @input="$emit('update:textSizeMultiplier', Number($event.target.value))" min="0.1" max="3.0" step="0.1" title="Textgröße anpassen">
      <span class="size-label lg">T</span>
    </div>
    <div class="separator-v"></div>
    <div class="size-control">
      <span class="size-label sm">➔</span>
      <input type="range" :value="arrowSizeMultiplier" @input="$emit('update:arrowSizeMultiplier', Number($event.target.value))" min="0.1" max="3.0" step="0.1" title="Pfeilgröße anpassen">
      <span class="size-label lg">➔</span>
    </div>
    <div class="separator-v"></div>
    <button @click="$emit('reset-view')" title="Ansicht zurücksetzen">
      <img class="vc-ic" src="/saintv1d/icons/Interface-Essential-Synchronize-Arrows-Square-2--Streamline-Pixel.svg" />
    </button>
    <div class="separator-v"></div>
    <button
      @click="ezgLayer.toggle()"
      class="ezg-toggle-btn"
      :class="{ active: ezgLayer.enabled.value, loading: ezgLayer.status.value === 'loading', error: ezgLayer.status.value === 'error' }"
      :title="ezgTitle"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" :stroke="ezgLayer.enabled.value ? 'var(--isy-pixel-green, #219653)' : 'var(--isy-pixel-text-dim, #4a4a4a)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z"></path><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg>
      <span class="ezg-label">EZG-Karte</span>
    </button>
    <button
      v-if="store.terrain || ezgLayer.enabled.value"
      @click="ezgLayer.cycleContourInterval()"
      class="grid-toggle-btn contour-toggle-btn"
      :title="contourTitle"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c47f3d" stroke-width="2" stroke-linecap="round"><path d="M2 12c2-3 4 3 6 0s4 3 6 0 4 3 6 0" /><path d="M2 18c2-3 4 3 6 0s4 3 6 0 4 3 6 0" /></svg>
      <span class="grid-label contour-label">{{ ezgLayer.contourInterval.value === 0 ? 'Aus' : ezgLayer.contourInterval.value + 'm' }}</span>
    </button>
    <button
      v-if="ezgLayer.enabled.value"
      @click="ezgLayer.refresh()"
      class="ezg-reload-btn"
      :class="{ loading: ezgLayer.status.value === 'loading' || ezgLayer.contourStatus.value === 'loading' }"
      title="EZG-Karte: Bereich neu laden (z.B. wenn das Netz über den Kartenrand hinausgewachsen ist)"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4a4a4a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><polyline points="21 3 21 9 15 9" /></svg>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useEzgLayer } from '../../composables/useEzgLayer.js';
import { useIsybauStore } from '../../store/index.js';

const props = defineProps({
  mode: String,
  textSizeMultiplier: Number,
  arrowSizeMultiplier: Number,
  gridSize: { type: Number, default: 1 }
});

const emit = defineEmits(['set-mode', 'update:textSizeMultiplier', 'update:arrowSizeMultiplier', 'update:gridSize', 'reset-view']);

const cycleGridSize = () => {
  let nextValue = 1;
  if (props.gridSize === 1) nextValue = 10;
  else if (props.gridSize === 10) nextValue = 0;
  emit('update:gridSize', nextValue);
};

const ezgLayer = useEzgLayer();
const store = useIsybauStore();
const ezgTitle = computed(() => {
  if (ezgLayer.status.value === 'loading') return 'EZG-Karte: Luftbild wird geladen...';
  if (ezgLayer.status.value === 'error') return `EZG-Karte: Fehler — ${ezgLayer.error.value || 'unbekannt'}`;
  if (ezgLayer.enabled.value && store.terrain) {
    return 'EZG-Karte ausblenden (Luftbild — Höhenlinien kommen vom eigenen DGM und bleiben davon unabhängig)';
  }
  return ezgLayer.enabled.value ? 'EZG-Karte ausblenden' : 'EZG-Karte einblenden (Luftbild & Höhenlinien)';
});

const contourTitle = computed(() => {
  if (ezgLayer.contourStatus.value === 'loading') return 'Höhenlinien werden geladen...';
  if (ezgLayer.contourStatus.value === 'error') return `Höhenlinien: Fehler — ${ezgLayer.contourError.value || 'unbekannt'}`;
  const interval = ezgLayer.contourInterval.value;
  const source = store.terrain ? ' (eigenes DGM)' : '';
  return `Höhenlinien-Intervall${source}: ${interval === 0 ? 'Aus' : interval + 'm'} (klicken zum Wechseln)`;
});
</script>

<style scoped>
.controls {
  position: absolute;
  bottom: 1rem;
  left: 1rem;
  background: var(--isy-pixel-bg, #040647);
  padding: 0.4rem;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(4,6,71,0.4);
  border: 1px solid var(--isy-pixel-border, #4a4844);
  z-index: 10;
  display: flex;
  gap: 0.4rem;
  align-items: center;
}

.mode-toggle {
  display: flex;
  gap: 0.25rem;
}

.controls button {
  background: transparent;
  border: 1px solid var(--isy-pixel-border, #4a4844);
  border-radius: 5px;
  width: 32px;
  height: 32px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.controls button.active {
  background: var(--isy-pixel-border, #4a4844);
  border-color: var(--isy-pixel-border-hover, #65625c);
}

.controls button:hover {
  background: var(--isy-pixel-border, #4a4844);
}

/* Pixel art icons */
.vc-ic {
  width: 16px;
  height: 16px;
  image-rendering: pixelated;
  filter: invert(63%) sepia(36%) saturate(736%) hue-rotate(103deg) brightness(99%) contrast(96%);
}

/* Grid control */
.grid-control {
  display: flex;
  align-items: center;
  padding: 0 0.25rem;
}

.grid-toggle-btn {
  display: flex !important;
  align-items: center;
  gap: 4px;
  width: auto !important;
  padding: 0 8px !important;
  min-width: 52px;
}

.grid-label {
  font-family: var(--isy-pixel-font);
  font-size: 0.5rem;
  color: var(--isy-pixel-green, #219653);
}

/* EZG-Karte toggle */
.ezg-toggle-btn {
  display: flex !important;
  align-items: center;
  gap: 4px;
  width: auto !important;
  padding: 0 8px !important;
}

.ezg-toggle-btn.active {
  background: var(--isy-pixel-border, #4a4844);
  border-color: var(--isy-pixel-border-hover, #65625c);
}

.ezg-toggle-btn.loading {
  opacity: 0.6;
  cursor: wait;
}

.ezg-toggle-btn.error {
  border-color: var(--isy-pixel-danger, #e74c3c);
}

.ezg-label {
  font-family: var(--isy-pixel-font);
  font-size: 0.5rem;
  color: var(--isy-pixel-text-dim, #4a4a4a);
}

.contour-toggle-btn {
  min-width: unset !important;
}

.contour-label {
  color: #c47f3d;
}

.ezg-reload-btn.loading {
  opacity: 0.6;
  cursor: wait;
}

.ezg-reload-btn.loading svg {
  animation: ezg-spin 0.9s linear infinite;
}

@keyframes ezg-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Size sliders */
.size-control {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0 0.25rem;
}

.size-label {
  color: var(--isy-pixel-text-dim, #4a4a4a);
  font-weight: 700;
  line-height: 1;
}
.size-label.sm { font-size: 0.75rem; }
.size-label.lg { font-size: 1.1rem; }

.size-control input[type="range"] {
  width: 70px;
  cursor: pointer;
  accent-color: var(--isy-pixel-border, #4a4844);
}

.separator-v {
  width: 1px;
  height: 20px;
  background: var(--isy-pixel-border, #4a4844);
  flex-shrink: 0;
}
</style>
