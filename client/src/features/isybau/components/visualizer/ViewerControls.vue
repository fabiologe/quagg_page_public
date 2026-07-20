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
        <svg v-if="gridSize === 0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#aeadd2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="3" x2="21" y2="21"></line></svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M3 9h18"></path><path d="M3 15h18"></path><path d="M9 3v18"></path><path d="M15 3v18"></path></svg>
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
  </div>
</template>

<script setup>
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
</script>

<style scoped>
.controls {
  position: absolute;
  bottom: 1rem;
  left: 1rem;
  background: #040647;
  padding: 0.4rem;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(4,6,71,0.4);
  border: 1px solid #594491;
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
  border: 1px solid #594491;
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
  background: #594491;
  border-color: #8f8be1;
}

.controls button:hover {
  background: #594491;
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
  font-family: 'Press Start 2P', monospace;
  font-size: 0.5rem;
  color: #2ecc71;
}

/* Size sliders */
.size-control {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0 0.25rem;
}

.size-label {
  color: #aeadd2;
  font-weight: 700;
  line-height: 1;
}
.size-label.sm { font-size: 0.75rem; }
.size-label.lg { font-size: 1.1rem; }

.size-control input[type="range"] {
  width: 70px;
  cursor: pointer;
  accent-color: #594491;
}

.separator-v {
  width: 1px;
  height: 20px;
  background: #594491;
  flex-shrink: 0;
}
</style>
