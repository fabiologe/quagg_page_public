<template>
  <div class="sv-panel">
    <div class="sv-header">
      <span class="sv-title">📌 Gespeicherte Ansichten</span>
      <button class="sv-save-btn" @click="onSaveClick" title="Aktuelle Ansicht speichern">
        💾 Speichern
      </button>
    </div>

    <div class="sv-body">
      <div v-if="!ifc.savedViews.length" class="sv-empty">
        Noch keine Ansichten<br>
        <small>Tipp: Kamera positionieren, Layer setzen, Schnitt platzieren — dann „Speichern“.</small>
      </div>

      <div
        v-for="v in ifc.savedViews"
        :key="v.id"
        class="sv-row"
        @click="onLoad(v)"
      >
        <span class="sv-name" :title="v.name">{{ v.name }}</span>
        <span class="sv-meta">{{ _formatDate(v.createdAt) }}</span>
        <div class="sv-actions" @click.stop>
          <button class="sv-act" title="Umbenennen" @click="onRename(v)">✎</button>
          <button class="sv-act sv-act--danger" title="Löschen" @click="onDelete(v)">✕</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useIfcStore } from '../stores/useIfcStore.js';

const props = defineProps({
  captureView: { type: Function, default: null }, // () => stateObject | null
  applyView:   { type: Function, default: null }, // (state) => Promise<void>
});

const ifc = useIfcStore();

function onSaveClick() {
  const state = props.captureView?.();
  if (!state) return;
  const name = prompt('Name für die Ansicht:', `Ansicht ${ifc.savedViews.length + 1}`);
  if (!name?.trim()) return;
  ifc.saveView(name, state);
}

async function onLoad(v) {
  await props.applyView?.(v.state);
}

function onRename(v) {
  const newName = prompt('Neuer Name:', v.name);
  if (newName?.trim()) ifc.renameSavedView(v.id, newName);
}

function onDelete(v) {
  if (confirm(`Ansicht „${v.name}“ löschen?`)) ifc.deleteSavedView(v.id);
}

function _formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) +
         ' ' +
         d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
</script>

<style scoped>
.sv-panel {
  width: 100%;
  display: flex; flex-direction: column;
  background: rgb(18, 20, 30);
}
.sv-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.55rem 0.75rem;
  background: rgba(30,35,50,0.95);
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.sv-title { font-size: 0.78rem; font-weight: 600; color: #ffd54f; }
.sv-save-btn {
  background: rgba(255,213,79,0.15);
  border: 1px solid rgba(255,213,79,0.4);
  color: #ffd54f;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.7rem; cursor: pointer;
  transition: background 0.15s;
}
.sv-save-btn:hover { background: rgba(255,213,79,0.25); }

.sv-body {
  flex: 1; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent;
}

.sv-empty {
  padding: 1.2rem 0.8rem;
  color: #546e7a; font-size: 0.72rem; text-align: center;
  line-height: 1.6;
}
.sv-empty small { color: #37474f; font-size: 0.65rem; }

.sv-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 0.4rem; align-items: center;
  padding: 0.4rem 0.7rem;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  cursor: pointer; transition: background 0.12s;
}
.sv-row:hover { background: rgba(255,213,79,0.08); }
.sv-name {
  font-size: 0.78rem; color: #cfd8dc;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sv-meta {
  font-size: 0.62rem; color: #607d8b;
  font-variant-numeric: tabular-nums;
}
.sv-actions { display: flex; gap: 0.15rem; }
.sv-act {
  background: none; border: none; color: #78909c;
  font-size: 0.75rem; padding: 0.15rem 0.3rem; cursor: pointer;
  border-radius: 3px; transition: background 0.12s, color 0.12s;
}
.sv-act:hover { background: rgba(255,255,255,0.06); color: #cfd8dc; }
.sv-act--danger:hover { color: #ef5350; }
</style>
