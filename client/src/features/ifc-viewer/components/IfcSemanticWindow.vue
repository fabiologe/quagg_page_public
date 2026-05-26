<template>
  <DraggableModal
    :isOpen="true"
    initialWidth="320px"
    initialHeight="600px"
    initialTop="80px"
    initialLeft="calc(50% + 520px)"
    @close="emit('close')"
  >
    <div class="props-window">
      <div class="props-header viewer-header">
        <span class="props-title">📋 IFC Eigenschaften</span>
        <button class="hdr-close" @click="emit('close')">&times;</button>
      </div>

      <div class="props-body">
        <!-- Kein Element gewählt -->
        <div v-if="!ifc.selectedElement" class="empty-state">
          <div class="empty-icon">🖱️</div>
          <div class="empty-text">Element im Viewer anklicken</div>
        </div>

        <!-- Element geladen -->
        <template v-else>
          
          <IfcSidebar
            :element="ifc.selectedElement"
            :psetError="ifc.psetError"
            @close="clearSelection"
            @add-pset="onAddPset"
          />
        </template>
      </div>
    </div>
  </DraggableModal>
</template>

<script setup>
import DraggableModal from '@/features/isyifc/components/common/DraggableModal.vue';
import IfcSidebar from './IfcSidebar.vue';
import { useIfcStore } from '../stores/useIfcStore.js';

const emit = defineEmits(['close']);
const ifc  = useIfcStore();

async function clearSelection() {
  ifc.clearElement();
}

async function onAddPset({ psetName, props }) {
  await ifc.addPset(psetName, props);
}
</script>

<style scoped>
.props-window {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.props-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.7rem 1rem;
  background: #1e2530;
  color: #90caf9;
  flex-shrink: 0;
  cursor: grab;
  user-select: none;
}
.props-header:active { cursor: grabbing; }

.props-title {
  font-weight: 600;
  font-size: 0.9rem;
}

.hdr-close {
  background: none;
  border: none;
  color: #90a4ae;
  font-size: 1.3rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 0.2rem;
  border-radius: 4px;
  transition: color 0.15s;
}
.hdr-close:hover { color: #ef5350; }

.props-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  background: rgba(20, 22, 30, 0.95);
}

.empty-icon { font-size: 2rem; opacity: 0.4; }

.empty-text {
  font-size: 0.8rem;
  color: #546e7a;
  text-align: center;
}
</style>
