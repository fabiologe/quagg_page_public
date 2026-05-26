<template>
  <div class="pset-browser">
    <div class="browser-header">
      <button class="back-btn" @click="$emit('close')" title="Zurück">← Zurück</button>
      <span class="browser-title">Pset hinzufügen</span>
    </div>

    <div class="browser-search">
      <input
        ref="searchInput"
        v-model="query"
        class="search-input"
        placeholder="Pset suchen..."
        @keydown.esc="$emit('close')"
      />
    </div>

    <!-- Applicable for current entity -->
    <div v-if="applicablePsets.length && !query" class="pset-section">
      <div class="section-label">Passend für {{ entityType }}</div>
      <div
        v-for="[name, tpl] in applicablePsets"
        :key="name"
        class="pset-item"
        :class="{ selected: selected === name }"
        @click="select(name, tpl)"
      >
        <div class="pset-item-top">
          <span class="pset-name">{{ name }}</span>
          <span class="pset-count">{{ tpl.props.length }} Props</span>
        </div>
        <div class="pset-desc">{{ tpl.description }}</div>
      </div>
    </div>

    <!-- All / search results -->
    <div class="pset-section" :class="{ 'has-top-section': applicablePsets.length && !query }">
      <div class="section-label">{{ query ? 'Suchergebnisse' : 'Alle Psets' }}</div>
      <div v-if="filteredAll.length === 0" class="no-results">Keine Treffer</div>
      <div
        v-for="[name, tpl] in filteredAll"
        :key="name"
        class="pset-item"
        :class="{ selected: selected === name }"
        @click="select(name, tpl)"
      >
        <div class="pset-item-top">
          <span class="pset-name">{{ name }}</span>
          <span class="pset-count">{{ tpl.props.length }} Props</span>
        </div>
        <div class="pset-desc">{{ tpl.description }}</div>
        <div class="pset-applies" v-if="tpl.applicableTo[0] !== '*'">
          {{ tpl.applicableTo.map(t => t.replace('IFC', 'Ifc')).join(', ') }}
        </div>
      </div>
    </div>

    <!-- Preview + confirm panel -->
    <Transition name="preview-slide">
      <div v-if="selected" class="preview-panel">
        <div class="preview-header">
          <span class="preview-name">{{ selected }}</span>
        </div>
        <div class="preview-props">
          <div v-for="prop in editedProps" :key="prop.name" class="preview-prop-row">
            <label class="preview-prop-label" :title="prop.description">
              {{ prop.name }}
              <span class="prop-type">{{ prop.type }}</span>
            </label>
            <input
              v-model="prop.value"
              class="preview-prop-input"
              :placeholder="prop.description"
            />
          </div>
        </div>
        <div class="preview-actions">
          <button class="cancel-btn" @click="selected = null">Abbrechen</button>
          <button class="add-btn" :disabled="isAdding" @click="confirmAdd">
            <span v-if="isAdding">Wird hinzugefügt...</span>
            <span v-else>+ Pset hinzufügen</span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { getPsetsForType, getAllPsets } from '../data/pset-templates.js';

const props = defineProps({
  entityType: { type: String, default: '' },
  initQuery:  { type: String, default: '' },
});
const emit = defineEmits(['close', 'add']);

const query = ref(props.initQuery);
const selected = ref(null);
const editedProps = ref([]);
const isAdding = ref(false);
const searchInput = ref(null);

onMounted(() => {
  searchInput.value?.focus();
  if (props.initQuery) {
    const match = getAllPsets().find(([name]) => name === props.initQuery);
    if (match) select(match[0], match[1]);
  }
});

const applicablePsets = computed(() =>
  getPsetsForType(props.entityType).filter(([, t]) => t.applicableTo[0] !== '*')
);

const filteredAll = computed(() => {
  const q = query.value.toLowerCase();
  return getAllPsets().filter(([name, tpl]) => {
    if (!q) return true;
    return name.toLowerCase().includes(q) || tpl.description.toLowerCase().includes(q);
  });
});

function select(name, tpl) {
  selected.value = name;
  editedProps.value = tpl.props.map(p => ({ ...p, value: '' }));
}

async function confirmAdd() {
  if (!selected.value || isAdding.value) return;
  isAdding.value = true;
  try {
    emit('add', {
      psetName: selected.value,
      props: editedProps.value.map(p => ({ name: p.name, value: p.value })),
    });
  } finally {
    isAdding.value = false;
  }
}
</script>

<style scoped>
.pset-browser {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: rgba(20, 22, 30, 0.96);
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.1);
  overflow: hidden;
}

.browser-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.75rem;
  background: rgba(52, 152, 219, 0.2);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}

.back-btn {
  background: none;
  border: none;
  color: #90caf9;
  font-size: 0.72rem;
  cursor: pointer;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  transition: background 0.15s;
}
.back-btn:hover { background: rgba(255,255,255,0.08); }

.browser-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: #90caf9;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.browser-search {
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}

.search-input {
  width: 100%;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 0.75rem;
  padding: 0.35rem 0.6rem;
  outline: none;
  box-sizing: border-box;
}
.search-input:focus { border-color: rgba(52,152,219,0.6); }
.search-input::placeholder { color: #546e7a; }

.pset-section {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.15) transparent;
}
.has-top-section { border-top: 1px solid rgba(255,255,255,0.07); }

.section-label {
  padding: 0.3rem 0.75rem 0.2rem;
  font-size: 0.65rem;
  font-weight: 700;
  color: #546e7a;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.no-results {
  padding: 0.5rem 0.75rem;
  font-size: 0.72rem;
  color: #546e7a;
}

.pset-item {
  padding: 0.4rem 0.75rem;
  cursor: pointer;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  transition: background 0.15s;
}
.pset-item:hover { background: rgba(255,255,255,0.05); }
.pset-item.selected { background: rgba(52,152,219,0.15); }

.pset-item-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
}

.pset-name {
  font-size: 0.72rem;
  font-weight: 600;
  color: #cfd8dc;
}

.pset-count {
  font-size: 0.62rem;
  color: #546e7a;
  flex-shrink: 0;
}

.pset-desc {
  font-size: 0.65rem;
  color: #78909c;
  margin-top: 0.1rem;
}

.pset-applies {
  font-size: 0.6rem;
  color: #80cbc4;
  margin-top: 0.1rem;
  font-style: italic;
}

/* Preview panel at bottom */
.preview-panel {
  flex-shrink: 0;
  background: rgba(10, 12, 18, 0.95);
  border-top: 1px solid rgba(52,152,219,0.3);
  max-height: 55%;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.12) transparent;
}

.preview-header {
  padding: 0.45rem 0.75rem;
  background: rgba(52,152,219,0.12);
  border-bottom: 1px solid rgba(255,255,255,0.07);
}

.preview-name {
  font-size: 0.72rem;
  font-weight: 700;
  color: #90caf9;
}

.preview-props {
  padding: 0.35rem 0.6rem;
}

.preview-prop-row {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  margin-bottom: 0.4rem;
}

.preview-prop-label {
  font-size: 0.65rem;
  color: #78909c;
  display: flex;
  justify-content: space-between;
}

.prop-type {
  font-size: 0.58rem;
  color: #546e7a;
  font-style: italic;
}

.preview-prop-input {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 0.72rem;
  padding: 0.25rem 0.45rem;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.preview-prop-input:focus { border-color: rgba(52,152,219,0.5); }
.preview-prop-input::placeholder { color: #37474f; }

.preview-actions {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 0.6rem;
  border-top: 1px solid rgba(255,255,255,0.06);
}

.cancel-btn {
  flex: 1;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  color: #90a4ae;
  font-size: 0.72rem;
  padding: 0.4rem;
  cursor: pointer;
  transition: background 0.15s;
}
.cancel-btn:hover { background: rgba(255,255,255,0.1); }

.add-btn {
  flex: 2;
  background: rgba(52, 152, 219, 0.8);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.4rem;
  cursor: pointer;
  transition: background 0.15s;
}
.add-btn:hover:not(:disabled) { background: rgba(52,152,219,1); }
.add-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.preview-slide-enter-active,
.preview-slide-leave-active {
  transition: max-height 0.2s ease, opacity 0.2s ease;
}
.preview-slide-enter-from,
.preview-slide-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
