<template>
  <div class="controls">
    <div class="mode-toggle">
      <button 
        @click="$emit('set-mode', 'pan')" 
        :class="{ active: mode === 'pan' }" 
        title="Verschieben (Pan)"
      >✋</button>
      <button 
        @click="$emit('set-mode', 'select')" 
        :class="{ active: mode === 'select' }" 
        title="Auswählen (Select)"
      >↖️</button>
    </div>
    <div class="separator-v"></div>
    <div class="grid-control">
      <button 
        @click="cycleGridSize" 
        class="grid-toggle-btn"
        :title="`Raster: ${gridSize === 0 ? 'Aus' : gridSize + 'x' + gridSize + 'm'}`"
      >
        <svg v-if="gridSize === 0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="3" x2="21" y2="21"></line></svg>
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M3 9h18"></path><path d="M3 15h18"></path><path d="M9 3v18"></path><path d="M15 3v18"></path></svg>
        <span style="font-size: 0.8rem; font-weight: bold; margin-left: 4px;">{{ gridSize === 0 ? 'Aus' : gridSize + 'm' }}</span>
      </button>
    </div>
    <div class="separator-v"></div>
    <div class="size-control">
      <span style="font-size: 0.8rem; color: #666;" title="Textgröße">T</span>
      <input 
        type="range" 
        :value="textSizeMultiplier" 
        @input="$emit('update:textSizeMultiplier', Number($event.target.value))"
        min="0.1" 
        max="3.0" 
        step="0.1"
        title="Textgröße anpassen"
      >
      <span style="font-size: 1.2rem; color: #666;" title="Textgröße">T</span>
    </div>
    <div class="separator-v"></div>
    <div class="size-control">
      <span style="font-size: 0.8rem; color: #666; font-weight: bold;" title="Pfeilgröße">➔</span>
      <input 
        type="range" 
        :value="arrowSizeMultiplier" 
        @input="$emit('update:arrowSizeMultiplier', Number($event.target.value))"
        min="0.1" 
        max="3.0" 
        step="0.1"
        title="Pfeilgröße anpassen"
      >
      <span style="font-size: 1.2rem; color: #666; font-weight: bold;" title="Pfeilgröße">➔</span>
    </div>
    <div class="separator-v"></div>
    <button @click="$emit('reset-view')" title="Ansicht zurücksetzen">↺</button>
  </div>
</template>

<script setup>
const props = defineProps({
  mode: String,
  textSizeMultiplier: Number,
  arrowSizeMultiplier: Number,
  gridSize: {
    type: Number,
    default: 1
  }
});

const emit = defineEmits(['set-mode', 'update:textSizeMultiplier', 'update:arrowSizeMultiplier', 'update:gridSize', 'reset-view']);

const cycleGridSize = () => {
  // Cycle: 1 -> 10 -> 0 (Off) -> 1
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
  background: white;
  padding: 0.5rem;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 10;
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.mode-toggle {
  display: flex;
  gap: 0.25rem;
}

.size-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.5rem;
}

.grid-control {
  display: flex;
  align-items: center;
  padding: 0 0.5rem;
}

.grid-toggle-btn {
  display: flex !important;
  align-items: center;
  justify-content: center;
  width: auto !important;
  padding: 0 8px !important;
  min-width: 60px;
}

.size-control input[type="range"] {
  width: 80px;
  cursor: pointer;
}

.controls button {
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  width: 32px;
  height: 32px;
  cursor: pointer;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.controls button.active {
  background: #e3f2fd;
  border-color: #2196F3;
  color: #2196F3;
}

.separator-v {
  width: 1px;
  height: 24px;
  background: #eee;
}

.controls button:hover {
  background: #f0f0f0;
  transform: scale(1.05);
}
</style>
