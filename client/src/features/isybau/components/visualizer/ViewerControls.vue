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
    <div class="separator-v"></div>
    <div class="size-control">
      <span style="font-size: 0.8rem; color: #666;">A</span>
      <input 
        type="range" 
        :value="sizeMultiplier" 
        @input="$emit('update:sizeMultiplier', Number($event.target.value))"
        min="0.1" 
        max="2.0" 
        step="0.1"
        title="Größe anpassen"
      >
      <span style="font-size: 1.2rem; color: #666;">A</span>
    </div>
    <div class="separator-v"></div>
    <button @click="$emit('reset-view')" title="Ansicht zurücksetzen">↺</button>
  </div>
</template>

<script setup>
defineProps({
  mode: String,
  sizeMultiplier: Number
});

defineEmits(['set-mode', 'update:sizeMultiplier', 'reset-view']);
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
