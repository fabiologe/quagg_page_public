<template>
  <Transition name="modal-fade">
    <div v-if="isOpen" class="pm-backdrop" @click.self="$emit('close')">
      <div class="pm-modal">

        <!-- Header -->
        <div class="pm-header">
          <h3>Projekte</h3>
          <button title="Schließen" aria-label="Schließen" class="close-btn" @click="$emit('close')">×</button>
        </div>

        <!-- Save current -->
        <div class="pm-save-bar">
          <input v-fokus
            v-model="newName"
            class="pm-name-input"
            placeholder="Projektname …"
            maxlength="80"
            @keyup.enter="save"
          />
          <button class="btn-primary" :disabled="!newName.trim() || saving"
          :title="!newName.trim() ? 'Zuerst einen Projektnamen eingeben' : ''" @click="save">
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
import { vFokus } from '../../composables/vFokus.js';
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
  z-index: var(--isy-z-modal);
}

.pm-modal {
  background: var(--isy-pixel-text);
  border-radius: var(--isy-radius-lg);
  width: 520px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--isy-elev-4);
  overflow: hidden;
}

.pm-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--isy-space-3) var(--isy-space-4);
  border-bottom: 2px solid var(--isy-pixel-border);
  background: var(--isy-pixel-bg);
  flex-shrink: 0;
}

.pm-header h3 {
  margin: 0;
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--isy-pixel-text-dim);
}

.close-btn {
  background: none;
  border: none;
  font-size: var(--isy-fs-xl);
  line-height: 1;
  color: var(--isy-pixel-border-hover);
  cursor: var(--isy-cursor-hand);
}
.close-btn:hover { color: var(--isy-pixel-text); }

/* Save bar */
.pm-save-bar {
  display: flex;
  gap: var(--isy-space-2);
  padding: var(--isy-space-3) var(--isy-space-4);
  border-bottom: 1px solid var(--isy-pixel-divider);
  flex-shrink: 0;
}

.pm-name-input {
  flex: 1;
  padding: var(--isy-space-2) var(--isy-space-3);
  border: 1px solid var(--isy-pixel-divider);
  border-radius: var(--isy-radius-md);
  font-size: var(--isy-fs-lg);
}
.pm-name-input:focus { outline: none; border-color: var(--isy-pixel-border); box-shadow: 0 0 0 2px rgba(89,68,145,0.15); }

/* List */
.pm-list-header {
  display: flex;
  align-items: center;
  gap: var(--isy-space-2);
  padding: var(--isy-space-2) var(--isy-space-4) var(--isy-space-1);
  font-size: var(--isy-fs-sm);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--isy-pixel-text-dim);
  flex-shrink: 0;
}

.pm-count {
  background: var(--isy-pixel-text-dim);
  color: var(--isy-pixel-bg);
  font-size: var(--isy-fs-sm);
  font-weight: 700;
  padding: var(--isy-space-1) var(--isy-space-2);
  border-radius: var(--isy-radius-lg);
}

.pm-list {
  overflow-y: auto;
  flex: 1;
  padding: var(--isy-space-1) 0;
  scrollbar-width: thin;
}

.pm-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--isy-space-2) var(--isy-space-4);
  border-bottom: 1px solid var(--isy-pixel-divider);
  gap: var(--isy-space-4);
  transition: background 0.12s;
}
.pm-item:hover { background: var(--isy-pixel-content-bg); }

.pm-item-info {
  display: flex;
  flex-direction: column;
  gap: var(--isy-space-1);
  min-width: 0;
}

.pm-item-name {
  font-size: var(--isy-fs-lg);
  font-weight: 700;
  color: var(--isy-pixel-border);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pm-item-meta {
  font-size: var(--isy-fs-sm);
  color: var(--isy-pixel-text-dim);
}

.pm-item-actions {
  display: flex;
  gap: var(--isy-space-2);
  flex-shrink: 0;
}

.pm-empty {
  padding: var(--isy-space-7);
  text-align: center;
  color: var(--isy-pixel-text-dim);
  font-size: var(--isy-fs-lg);
  font-style: italic;
}

.pm-error {
  padding: var(--isy-space-3) var(--isy-space-4);
  background: var(--isy-pixel-danger-soft);
  border-top: 1px solid var(--isy-pixel-danger-soft-border);
  font-size: var(--isy-fs-md);
  color: var(--isy-pixel-danger-soft-text);
  flex-shrink: 0;
}

/* Delete confirm bar */
.pm-confirm {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--isy-space-4);
  padding: var(--isy-space-3) var(--isy-space-4);
  background: var(--isy-pixel-danger-soft);
  border-top: 1px solid var(--isy-pixel-danger-soft-border);
  font-size: var(--isy-fs-lg);
  color: var(--isy-pixel-danger-soft-text);
  flex-shrink: 0;
}

.pm-confirm-btns {
  display: flex;
  gap: var(--isy-space-2);
}

/* Buttons */
.btn-primary {
  background: var(--isy-pixel-bg);
  color: var(--isy-pixel-text);
  border: none;
  border-radius: var(--isy-radius-md);
  padding: var(--isy-space-2) var(--isy-space-4);
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  cursor: var(--isy-cursor-hand);
  white-space: nowrap;
  transition: background 0.15s;
  display: flex;
  align-items: center;
  gap: var(--isy-space-2);
}
.btn-primary:hover:not(:disabled) { background: var(--isy-pixel-border); }
.btn-primary:disabled { opacity: 0.45; cursor: var(--isy-cursor-zeiger); }

.btn-load {
  background: var(--isy-pixel-content-bg);
  color: var(--isy-pixel-border);
  border: 1px solid var(--isy-pixel-text-dim);
  border-radius: var(--isy-radius-sm);
  padding: var(--isy-space-1) var(--isy-space-3);
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-sm);
  cursor: var(--isy-cursor-hand);
  transition: background 0.12s;
}
.btn-load:hover { background: var(--isy-pixel-text-dim); color: var(--isy-pixel-bg); }

.btn-delete {
  background: none;
  border: 1px solid var(--isy-pixel-danger-soft-border);
  color: var(--isy-pixel-danger);
  border-radius: var(--isy-radius-sm);
  padding: var(--isy-space-1) var(--isy-space-2);
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-sm);
  cursor: var(--isy-cursor-hand);
  transition: background 0.12s;
}
.btn-delete:hover { background: var(--isy-pixel-danger-soft); }

.btn-cancel {
  background: none;
  border: 1px solid var(--isy-pixel-text-dim);
  border-radius: var(--isy-radius-sm);
  padding: var(--isy-space-1) var(--isy-space-2);
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-sm);
  color: var(--isy-pixel-border);
  cursor: var(--isy-cursor-hand);
}
.btn-cancel:hover { background: var(--isy-pixel-content-bg); }

/* Icons */
.ic {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
    image-rendering: pixelated;
    filter: invert(63%) sepia(36%) saturate(736%) hue-rotate(103deg) brightness(99%) contrast(96%);
    vertical-align: middle;
}
/* Transition */
.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity 0.18s ease; }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; }
</style>
