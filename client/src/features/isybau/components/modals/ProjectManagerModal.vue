<template>
  <Transition name="modal-fade">
    <div v-if="isOpen" class="pm-backdrop" @click.self="$emit('close')">
      <div class="pm-modal">

        <!-- Header -->
        <div class="pm-header">
          <h3>Projekte</h3>
          <button class="close-btn" @click="$emit('close')">×</button>
        </div>

        <!-- Save current -->
        <div class="pm-save-bar">
          <input
            v-model="newName"
            class="pm-name-input"
            placeholder="Projektname …"
            maxlength="80"
            @keyup.enter="save"
          />
          <button class="btn-primary" :disabled="!newName.trim() || saving" @click="save">
            <img v-if="!saving" class="ic" src="/saintv1d/icons/Interface-Essential-Floppy-Disk--Streamline-Pixel.svg" />
            <span v-if="saving">⏳</span>
            <span>{{ saving ? 'Speichern...' : 'Speichern' }}</span>
          </button>
        </div>

        <!-- List -->
        <div class="pm-list-header">
          <span>Gespeicherte Projekte</span>
          <span class="pm-count">{{ projects.length }}</span>
        </div>

        <div class="pm-list" v-if="projects.length > 0">
          <div
            v-for="p in projects"
            :key="p.id"
            class="pm-item"
          >
            <div class="pm-item-info">
              <span class="pm-item-name">{{ p.name }}</span>
              <span class="pm-item-meta">
                {{ formatDate(p.savedAt) }} &nbsp;·&nbsp;
                {{ p.nodeCount }} Kn &nbsp;·&nbsp; {{ p.edgeCount }} Ha &nbsp;·&nbsp; {{ p.areaCount }} Fl
              </span>
            </div>
            <div class="pm-item-actions">
              <button class="btn-load" @click="load(p)" title="Laden">▶ Laden</button>
              <button class="btn-delete" @click="confirmDelete(p)" title="Löschen">🗑</button>
            </div>
          </div>
        </div>

        <div v-else class="pm-empty">
          Noch keine gespeicherten Projekte.
        </div>

        <!-- Error -->
        <div v-if="errorMsg" class="pm-error">{{ errorMsg }}</div>

        <!-- Load confirm -->
        <Transition name="modal-fade">
          <div v-if="loadTarget" class="pm-confirm">
            <span>„{{ loadTarget.name }}" laden? Der aktuelle Arbeitsstand wird ersetzt.</span>
            <div class="pm-confirm-btns">
              <button class="btn-load" @click="doLoad">Laden</button>
              <button class="btn-cancel" @click="loadTarget = null">Abbrechen</button>
            </div>
          </div>
        </Transition>

        <!-- Delete confirm -->
        <Transition name="modal-fade">
          <div v-if="deleteTarget" class="pm-confirm">
            <span>„{{ deleteTarget.name }}" wirklich löschen?</span>
            <div class="pm-confirm-btns">
              <button class="btn-delete" @click="doDelete">Löschen</button>
              <button class="btn-cancel" @click="deleteTarget = null">Abbrechen</button>
            </div>
          </div>
        </Transition>

      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, watch } from 'vue';
import { listProjects, saveProject, loadProject, deleteProject } from '../../services/ProjectService.js';

const props = defineProps({
  isOpen:    Boolean,
  snapshot:  Object,   // aktueller Store-Snapshot zum Speichern
});

const emit = defineEmits(['close', 'load']);

const projects     = ref([]);
const newName      = ref('');
const saving       = ref(false);
const deleteTarget = ref(null);
const errorMsg     = ref(null);
const loadTarget   = ref(null); // Laden bestätigen — überschreibt die aktuelle Arbeit

watch(() => props.isOpen, async (open) => {
  if (open) {
    newName.value = '';
    deleteTarget.value = null;
    await refresh();
  }
});

async function refresh() {
  projects.value = await listProjects();
}

async function save() {
  if (!newName.value.trim()) return;
  saving.value = true;
  errorMsg.value = null;
  try {
    await saveProject(newName.value.trim(), props.snapshot);
    newName.value = '';
    await refresh();
  } catch (e) {
    console.error('Projekt speichern fehlgeschlagen:', e);
    errorMsg.value = `Speichern fehlgeschlagen: ${e.message || e.name || 'IndexedDB-Fehler'}`;
  } finally {
    saving.value = false;
  }
}

// Laden überschreibt via clear() den aktuellen Stand — daher Bestätigung,
// sobald bereits Daten geladen sind.
function load(p) {
  loadTarget.value = p;
}

async function doLoad() {
  if (!loadTarget.value) return;
  errorMsg.value = null;
  try {
    const data = await loadProject(loadTarget.value.id);
    emit('load', data);
    emit('close');
  } catch (e) {
    console.error('Projekt laden fehlgeschlagen:', e);
    errorMsg.value = `Laden fehlgeschlagen: ${e.message || e.name || 'IndexedDB-Fehler'}`;
  } finally {
    loadTarget.value = null;
  }
}

function confirmDelete(p) {
  deleteTarget.value = p;
}

async function doDelete() {
  if (!deleteTarget.value) return;
  await deleteProject(deleteTarget.value.id);
  deleteTarget.value = null;
  await refresh();
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
       + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
</script>

<style scoped>
.pm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9000;
}

.pm-modal {
  background: #fff;
  border-radius: 10px;
  width: 520px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}

.pm-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1.1rem;
  border-bottom: 2px solid #594491;
  background: #040647;
  flex-shrink: 0;
}

.pm-header h3 {
  margin: 0;
  font-family: 'Press Start 2P', monospace;
  font-size: 0.55rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #aeadd2;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.3rem;
  line-height: 1;
  color: #8f8be1;
  cursor: pointer;
}
.close-btn:hover { color: #fff; }

/* Save bar */
.pm-save-bar {
  display: flex;
  gap: 0.5rem;
  padding: 0.8rem 1.1rem;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
}

.pm-name-input {
  flex: 1;
  padding: 0.45rem 0.7rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
}
.pm-name-input:focus { outline: none; border-color: #594491; box-shadow: 0 0 0 2px rgba(89,68,145,0.15); }

/* List */
.pm-list-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1.1rem 0.3rem;
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #888;
  flex-shrink: 0;
}

.pm-count {
  background: #aeadd2;
  color: #040647;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.1rem 0.45rem;
  border-radius: 10px;
}

.pm-list {
  overflow-y: auto;
  flex: 1;
  padding: 0.3rem 0;
  scrollbar-width: thin;
}

.pm-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 1.1rem;
  border-bottom: 1px solid #f4f4f4;
  gap: 1rem;
  transition: background 0.12s;
}
.pm-item:hover { background: #f3f2fb; }

.pm-item-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.pm-item-name {
  font-size: 0.92rem;
  font-weight: 700;
  color: #040647;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pm-item-meta {
  font-size: 0.75rem;
  color: #888;
}

.pm-item-actions {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
}

.pm-empty {
  padding: 2rem;
  text-align: center;
  color: #aaa;
  font-size: 0.88rem;
  font-style: italic;
}

.pm-error {
  padding: 0.65rem 1.1rem;
  background: #fff5f5;
  border-top: 1px solid #fca5a5;
  font-size: 0.85rem;
  color: #b91c1c;
  flex-shrink: 0;
}

/* Delete confirm bar */
.pm-confirm {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.65rem 1.1rem;
  background: #fff5f5;
  border-top: 1px solid #fca5a5;
  font-size: 0.88rem;
  color: #b91c1c;
  flex-shrink: 0;
}

.pm-confirm-btns {
  display: flex;
  gap: 0.4rem;
}

/* Buttons */
.btn-primary {
  background: #040647;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 0.9rem;
  font-family: 'Press Start 2P', monospace;
  font-size: 0.5rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}
.btn-primary:hover:not(:disabled) { background: #594491; }
.btn-primary:disabled { opacity: 0.45; cursor: default; }

.btn-load {
  background: #f3f2fb;
  color: #594491;
  border: 1px solid #aeadd2;
  border-radius: 5px;
  padding: 0.35rem 0.7rem;
  font-family: 'Press Start 2P', monospace;
  font-size: 0.46rem;
  cursor: pointer;
  transition: background 0.12s;
}
.btn-load:hover { background: #aeadd2; color: #040647; }

.btn-delete {
  background: none;
  border: 1px solid #fca5a5;
  color: #dc2626;
  border-radius: 5px;
  padding: 0.35rem 0.5rem;
  font-family: 'Press Start 2P', monospace;
  font-size: 0.46rem;
  cursor: pointer;
  transition: background 0.12s;
}
.btn-delete:hover { background: #fee2e2; }

.btn-cancel {
  background: none;
  border: 1px solid #aeadd2;
  border-radius: 5px;
  padding: 0.35rem 0.6rem;
  font-family: 'Press Start 2P', monospace;
  font-size: 0.46rem;
  color: #594491;
  cursor: pointer;
}
.btn-cancel:hover { background: #f3f2fb; }

/* Icons */
.ic {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
    image-rendering: pixelated;
    filter: invert(63%) sepia(36%) saturate(736%) hue-rotate(103deg) brightness(99%) contrast(96%);
    vertical-align: middle;
}
.btn-primary { display: flex; align-items: center; gap: 0.4rem; }

/* Transition */
.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity 0.18s ease; }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; }
</style>
