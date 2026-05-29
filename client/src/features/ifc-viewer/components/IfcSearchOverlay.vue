<template>
  <div v-if="open" class="search-overlay" @mousedown.self="close">
    <div class="search-box">
      <div class="search-input-row">
        <span class="search-icon">🔍</span>
        <input
          ref="inputRef"
          v-model="query"
          class="search-input"
          placeholder="Element suchen (Name, GlobalId, Kategorie)…"
          @keydown.escape="close"
          @keydown.down.prevent="moveSelection(1)"
          @keydown.up.prevent="moveSelection(-1)"
          @keydown.enter.prevent="confirmSelection"
        />
        <button class="search-close" @click="close">✕</button>
      </div>

      <div class="search-meta">
        <span v-if="query">{{ results.length }} Treffer{{ results.length === 50 ? ' (max 50 angezeigt)' : '' }}</span>
        <span v-else>{{ index.length }} Elemente indexiert</span>
      </div>

      <div ref="listRef" class="search-results">
        <div
          v-for="(r, i) in results"
          :key="`${r.modelId}-${r.localId}`"
          class="result-row"
          :class="{ active: i === selectedIdx }"
          @mousedown.prevent="pickResult(r)"
          @mouseenter="selectedIdx = i"
        >
          <span class="result-cat">{{ r.category.replace(/^IFC/, '') }}</span>
          <span class="result-name">{{ r.name || '(unbenannt)' }}</span>
          <span class="result-id" :title="r.globalId">{{ r.globalId.slice(0, 8) }}</span>
        </div>
        <div v-if="query && !results.length" class="no-results">Keine Treffer</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { useIfcStore } from '../stores/useIfcStore.js';

const props = defineProps({
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

const ifc      = useIfcStore();
const query    = ref('');
const inputRef = ref(null);
const listRef  = ref(null);
const selectedIdx = ref(0);

const index = computed(() => ifc.getSearchIndex());

const results = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return [];
  const arr = index.value;
  const hits = [];
  for (let i = 0; i < arr.length && hits.length < 50; i++) {
    const e = arr[i];
    if (
      e.name.toLowerCase().includes(q) ||
      e.globalId.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q)
    ) hits.push(e);
  }
  return hits;
});

watch(() => props.open, async (val) => {
  if (val) {
    query.value = '';
    selectedIdx.value = 0;
    await nextTick();
    inputRef.value?.focus();
  }
});

watch(results, () => { selectedIdx.value = 0; });

function moveSelection(delta) {
  if (!results.value.length) return;
  selectedIdx.value = (selectedIdx.value + delta + results.value.length) % results.value.length;
  // Scroll selected row into view
  nextTick(() => {
    listRef.value?.querySelector('.result-row.active')?.scrollIntoView({ block: 'nearest' });
  });
}

function confirmSelection() {
  const r = results.value[selectedIdx.value];
  if (r) pickResult(r);
}

async function pickResult(r) {
  await ifc.zoomToElement(r.localId, r.modelId);
  close();
}

function close() { emit('close'); }
</script>

<style scoped>
.search-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  z-index: 200;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
}

.search-box {
  width: 520px;
  max-width: 90vw;
  background: #1a1e2e;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.6);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.search-input-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 0.8rem;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.search-icon  { color: #78909c; }
.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #cfd8dc;
  font-size: 0.95rem;
}
.search-close {
  background: none; border: none; color: #78909c;
  font-size: 1.1rem; cursor: pointer; padding: 0 0.2rem;
}
.search-close:hover { color: #ef5350; }

.search-meta {
  padding: 0.3rem 0.8rem;
  font-size: 0.68rem;
  color: #546e7a;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.search-results {
  max-height: 360px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.15) transparent;
}

.result-row {
  display: grid;
  grid-template-columns: 110px 1fr 70px;
  gap: 0.6rem;
  padding: 0.4rem 0.8rem;
  align-items: center;
  cursor: pointer;
  font-size: 0.78rem;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}
.result-row:hover,
.result-row.active { background: rgba(33,150,243,0.15); }

.result-cat  { color: #90caf9; font-weight: 600; font-size: 0.7rem; }
.result-name { color: #cfd8dc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.result-id   {
  color: #546e7a;
  font-family: monospace;
  font-size: 0.7rem;
  text-align: right;
}

.no-results { padding: 2rem; text-align: center; color: #546e7a; font-size: 0.8rem; }
</style>
