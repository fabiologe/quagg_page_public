<template>
  <div class="sv-panel">
    <div class="sv-header">
      <span class="sv-title"><CdeIcon name="views" :size="14" /> Gespeicherte Ansichten</span>
      <button class="sv-save-btn" @click="onSaveClick" title="Aktuelle Ansicht speichern">
        <CdeIcon name="save" :size="12" /> Speichern
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
          <button class="sv-act" title="Umbenennen" aria-label="Umbenennen" @click="onRename(v)">
            <CdeIcon name="edit" :size="12" />
          </button>
          <button class="sv-act sv-act--danger" title="Löschen" aria-label="Ansicht löschen" @click="onDelete(v)">
            <CdeIcon name="close" :size="12" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useIfcStore } from '../stores/useIfcStore.js';
import CdeIcon from './ui/CdeIcon.vue';

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
  background: var(--cde-surface);
}
.sv-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.55rem 0.75rem;
  background: var(--cde-float);
  border-bottom: 1px solid var(--cde-tint);
  flex-shrink: 0;
}
/* Gold gehört zur Bernstein-Familie der Tokens — die Ansichten teilen sie
   mit Kosten und Pauschalen (vorher ein eigener Handwert var(--cde-amber-soft)). */
.sv-title {
  display: flex; align-items: center; gap: 0.35rem;
  font-size: 0.78rem; font-weight: 600; color: var(--cde-amber-soft);
}
.sv-save-btn {
  display: inline-flex; align-items: center; gap: 0.3rem;
  background: color-mix(in srgb, var(--cde-amber) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--cde-amber) 40%, transparent);
  color: var(--cde-amber-soft);
  padding: 0.2rem 0.5rem;
  border-radius: var(--cde-radius-sm);
  font-size: 0.7rem; cursor: pointer;
  transition: background 0.15s;
}
.sv-save-btn:hover { background: color-mix(in srgb, var(--cde-amber) 26%, transparent); }

.sv-body {
  flex: 1; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: var(--cde-tint-max) transparent;
}

.sv-empty {
  padding: 1.2rem 0.8rem;
  color: var(--cde-text-dimmer); font-size: 0.72rem; text-align: center;
  line-height: 1.6;
}
.sv-empty small { color: var(--cde-text-dimmer); font-size: 0.65rem; }

.sv-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 0.4rem; align-items: center;
  padding: 0.4rem 0.7rem;
  border-bottom: 1px solid var(--cde-tint-weak);
  cursor: pointer; transition: background 0.12s;
}
.sv-row:hover { background: color-mix(in srgb, var(--cde-amber) 8%, transparent); }
.sv-name {
  font-size: 0.78rem; color: var(--cde-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sv-meta {
  font-size: 0.62rem; color: var(--cde-text-faint);
  font-variant-numeric: tabular-nums;
}
.sv-actions { display: flex; gap: 0.15rem; }
.sv-act {
  display: inline-flex; align-items: center; justify-content: center;
  background: none; border: none; color: var(--cde-text-mute);
  padding: 0.2rem 0.3rem; cursor: pointer;
  border-radius: 3px; transition: background 0.12s, color 0.12s;
}
.sv-act:hover { background: var(--cde-fill); color: var(--cde-text); }
.sv-act--danger:hover { color: var(--cde-danger); }
</style>
