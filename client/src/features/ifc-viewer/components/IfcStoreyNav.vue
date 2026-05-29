<template>
  <Transition name="slide">
    <div v-if="storeys.length" class="storey-nav">
      <div class="sn-header">
        <span class="sn-title">🏢 Geschosse</span>
        <label class="sn-section-toggle" :title="autoSection ? 'Auto-Schnitt an' : 'Auto-Schnitt aus'">
          <input type="checkbox" v-model="autoSection" />
          <span>Schnitt</span>
        </label>
      </div>
      <div class="sn-body">
        <button
          v-for="s in storeys"
          :key="s.modelId + ':' + s.localId"
          class="sn-row"
          :class="{ active: active && active.localId === s.localId && active.modelId === s.modelId }"
          @click="onClick(s)"
          :title="`${s.name}${s.elevation != null ? ' — ' + s.elevation.toFixed(2) + ' m' : ''}`"
        >
          <span class="sn-name">{{ s.name }}</span>
          <span v-if="s.elevation != null" class="sn-elev">{{ s.elevation.toFixed(2) }} m</span>
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
  storeys: { type: Array, default: () => [] }, // [{modelId, localId, name, elevation, box}]
});
const emit = defineEmits(['goto']);

const autoSection = ref(false);
const active = ref(null);

function onClick(s) {
  active.value = { modelId: s.modelId, localId: s.localId };
  emit('goto', { modelId: s.modelId, localId: s.localId, withSection: autoSection.value });
}
</script>

<style scoped>
.storey-nav {
  position: absolute; left: 70px; top: 5rem; z-index: 24;
  width: 168px;
  background: rgb(18, 20, 30);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  overflow: hidden;
  display: flex; flex-direction: column;
}

.sn-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.55rem 0.7rem;
  background: rgba(30,35,50,0.95);
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.sn-title { font-size: 0.78rem; font-weight: 600; color: #90caf9; }
.sn-section-toggle {
  display: flex; align-items: center; gap: 0.25rem;
  font-size: 0.62rem; color: #78909c; cursor: pointer;
}
.sn-section-toggle input { accent-color: #66bb6a; }

.sn-body {
  max-height: 360px; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent;
}

.sn-row {
  display: flex; justify-content: space-between; align-items: center;
  width: 100%;
  background: none; border: none;
  padding: 0.4rem 0.7rem;
  color: #cfd8dc; font-size: 0.74rem;
  cursor: pointer;
  text-align: left;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  transition: background 0.12s, color 0.12s;
}
.sn-row:hover { background: rgba(33,150,243,0.12); color: #e3f2fd; }
.sn-row.active {
  background: rgba(33,150,243,0.22);
  color: #90caf9; font-weight: 600;
  border-left: 3px solid #42a5f5;
  padding-left: calc(0.7rem - 3px);
}

.sn-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex: 1;
}
.sn-elev {
  font-size: 0.66rem;
  color: #607d8b;
  font-variant-numeric: tabular-nums;
  margin-left: 0.5rem;
  flex-shrink: 0;
}

.slide-enter-active, .slide-leave-active { transition: transform 0.2s ease, opacity 0.2s ease; }
.slide-enter-from, .slide-leave-to { transform: translateX(-20px); opacity: 0; }
</style>
