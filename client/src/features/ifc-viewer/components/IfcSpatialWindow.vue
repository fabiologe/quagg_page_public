<template>
  <DraggableModal
    :isOpen="true"
    initialWidth="300px"
    initialHeight="580px"
    initialTop="80px"
    initialLeft="calc(50% - 680px)"
    @close="emit('close')"
  >
    <div class="spatial-window">

      <!-- Header -->
      <div class="sw-header">
        <div class="sw-title">
          <span class="sw-icon">🌳</span>
          <span>Gebäudestruktur</span>
        </div>
        <div class="sw-actions">
          <button class="sw-btn" title="Alle aufklappen"   @click="expandAll">⊞</button>
          <button class="sw-btn" title="Alle zuklappen"    @click="collapseAll">⊟</button>
          <button class="sw-btn close" @click="emit('close')">&times;</button>
        </div>
      </div>

      <!-- Search -->
      <div class="sw-search">
        <span class="search-icon">🔍</span>
        <input
          v-model="filterText"
          class="search-input"
          placeholder="Filtern…"
          spellcheck="false"
        />
        <button v-if="filterText" class="search-clear" @click="filterText = ''">✕</button>
      </div>

      <!-- Tree content -->
      <div class="sw-body" ref="bodyRef">
        <div v-if="!ifc.spatialTree" class="empty-state">
          <div class="empty-icon">🏗️</div>
          <div class="empty-text">IFC-Modell laden um die<br>Gebäudestruktur anzuzeigen</div>
        </div>

        <IfcSpatialTree
          v-else
          :tree="ifc.spatialTree"
          :bare="true"
          :filter="filterText"
          @toggle-storey="onToggleStorey"
        />
      </div>

      <!-- Footer stats -->
      <div v-if="ifc.spatialTree" class="sw-footer">
        <span class="footer-info">{{ ifc.modelList.length }} Modell{{ ifc.modelList.length !== 1 ? 'e' : '' }}</span>
      </div>

    </div>
  </DraggableModal>
</template>

<script setup>
import { ref } from 'vue';
import DraggableModal from '@/features/isyifc/components/common/DraggableModal.vue';
import IfcSpatialTree from './IfcSpatialTree.vue';
import { useIfcStore } from '../stores/useIfcStore.js';

const emit = defineEmits(['close']);
const ifc  = useIfcStore();

const filterText = ref('');
const bodyRef    = ref(null);

async function onToggleStorey({ localId, visible }) {
  await ifc.setStoreyVisible(localId, visible);
}

function expandAll()   { bodyRef.value?.querySelectorAll('.caret[data-open="false"]').forEach(el => el.click()); }
function collapseAll() { bodyRef.value?.querySelectorAll('.caret[data-open="true"]').forEach(el => el.click()); }
</script>

<style scoped>
.spatial-window {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: rgba(14, 16, 26, 0.98);
}

/* ── Header ── */
.sw-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.7rem 0.9rem;
  background: #1a1e2e;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
  cursor: grab;
  user-select: none;
}
.sw-header:active { cursor: grabbing; }

.sw-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.88rem;
  font-weight: 600;
  color: #90caf9;
}
.sw-icon { font-size: 1rem; }

.sw-actions {
  display: flex;
  align-items: center;
  gap: 0.15rem;
}
.sw-btn {
  background: none;
  border: none;
  color: #78909c;
  font-size: 1rem;
  cursor: pointer;
  padding: 0.2rem 0.35rem;
  border-radius: 4px;
  line-height: 1;
  transition: background 0.12s, color 0.12s;
}
.sw-btn:hover         { background: rgba(255,255,255,0.08); color: #cfd8dc; }
.sw-btn.close:hover   { color: #ef5350; }

/* ── Search ── */
.sw-search {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.75rem;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  background: rgba(20,22,35,0.6);
  flex-shrink: 0;
}
.search-icon { font-size: 0.78rem; opacity: 0.5; }
.search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: #cfd8dc;
  font-size: 0.78rem;
  caret-color: #4fc3f7;
}
.search-input::placeholder { color: #37474f; }
.search-clear {
  background: none; border: none; cursor: pointer;
  color: #546e7a; font-size: 0.7rem; padding: 0; line-height: 1;
  transition: color 0.12s;
}
.search-clear:hover { color: #ef5350; }

/* ── Body ── */
.sw-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.12) transparent;
}

/* ── Empty state ── */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  padding: 3rem 1rem;
}
.empty-icon { font-size: 2.5rem; opacity: 0.3; }
.empty-text {
  font-size: 0.78rem;
  color: #37474f;
  text-align: center;
  line-height: 1.5;
}

/* ── Footer ── */
.sw-footer {
  flex-shrink: 0;
  padding: 0.35rem 0.9rem;
  border-top: 1px solid rgba(255,255,255,0.06);
  background: rgba(20,22,35,0.5);
}
.footer-info {
  font-size: 0.65rem;
  color: #37474f;
}
</style>
