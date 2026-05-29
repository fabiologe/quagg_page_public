<template>
  <div class="ann-panel">
    <div class="ann-header">
      <span class="ann-title">💬 Notizen</span>
      <div class="ann-header-actions">
        <button
          class="ann-mode-btn"
          :class="{ active: annotationActive }"
          @click="$emit('toggle-mode')"
          :title="annotationActive ? 'Pin-Modus beenden' : 'Pin setzen — klick aufs Modell'"
        >
          {{ annotationActive ? '✓ Aktiv' : '＋ Neu' }}
        </button>
        <button
          v-if="ifc.annotations.length"
          class="ann-export-btn"
          @click="onExport"
          title="Als JSON exportieren"
        >⬇</button>
        <label class="ann-import-btn" title="JSON importieren">
          ⬆
          <input type="file" accept="application/json,.json" @change="onImport" class="sr-only" />
        </label>
        <button
          v-if="ifc.annotations.length"
          class="ann-clear-btn"
          @click="onClearAll"
          title="Alle löschen"
        >🗑</button>
      </div>
    </div>

    <div class="ann-body">
      <div v-if="!ifc.annotations.length" class="ann-empty">
        Keine Notizen<br>
        <small>„＋ Neu“ aktivieren, dann auf eine Stelle im Modell klicken.</small>
      </div>

      <div
        v-for="a in ifc.annotations"
        :key="a.id"
        class="ann-row"
      >
        <span
          class="ann-idx"
          :style="{ background: a.color || '#e91e63' }"
          @click="onZoom(a)"
          title="Zur Notiz zoomen"
        >#{{ a.idx }}</span>

        <div class="ann-row-body">
          <textarea
            class="ann-text"
            :value="a.text"
            @blur="onTextBlur(a, $event)"
            rows="2"
            placeholder="Notiz hier eingeben..."
          ></textarea>
          <div class="ann-color-picker">
            <button
              v-for="c in COLOR_PRESETS"
              :key="c"
              class="ann-color-swatch"
              :class="{ active: (a.color || '#e91e63') === c }"
              :style="{ background: c }"
              :title="c"
              @click="onColorPick(a, c)"
            ></button>
          </div>
        </div>

        <button class="ann-del" @click="onDelete(a)" title="Löschen">✕</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useIfcStore } from '../stores/useIfcStore.js';

const props = defineProps({
  annotationActive: { type: Boolean, default: false },
  zoomToPoint:      { type: Function, default: null }, // ([x,y,z]) => void
});
defineEmits(['toggle-mode']);

const ifc = useIfcStore();

// 6 distinct, print-friendly colors
const COLOR_PRESETS = [
  '#e91e63', // pink (default)
  '#ef5350', // red
  '#fb8c00', // orange
  '#fdd835', // yellow
  '#43a047', // green
  '#1e88e5', // blue
  '#8e24aa', // purple
];

function onZoom(a)          { props.zoomToPoint?.(a.position); }
function onColorPick(a, c)  { ifc.updateAnnotationColor(a.id, c); }
function onTextBlur(a, e) {
  const newText = e.target.value;
  if (newText !== a.text) ifc.updateAnnotationText(a.id, newText);
}
function onDelete(a)        { ifc.removeAnnotation(a.id); }
function onClearAll() {
  if (confirm(`Alle ${ifc.annotations.length} Notizen löschen?`)) {
    ifc.clearAnnotations();
  }
}

function onExport() {
  const blob = ifc.exportAnnotationsJSON();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `notizen-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function onImport(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const ok = ifc.importAnnotationsJSON(reader.result);
    if (!ok) alert('Import fehlgeschlagen — ungültige JSON-Datei.');
  };
  reader.readAsText(file);
  e.target.value = '';
}
</script>

<style scoped>
.ann-panel {
  width: 100%;
  display: flex; flex-direction: column;
  background: rgb(18, 20, 30);
}

.ann-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.55rem 0.75rem;
  background: rgba(30, 35, 50, 0.95);
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.ann-title { font-size: 0.78rem; font-weight: 600; color: #f48fb1; }
.ann-header-actions { display: flex; gap: 0.3rem; }
.ann-mode-btn {
  background: rgba(233,30,99,0.15);
  border: 1px solid rgba(233,30,99,0.4);
  color: #f48fb1;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.7rem; cursor: pointer;
  transition: background 0.15s;
}
.ann-mode-btn:hover  { background: rgba(233,30,99,0.25); }
.ann-mode-btn.active {
  background: #e91e63; color: #fff;
  border-color: #e91e63;
}
.ann-clear-btn {
  background: none; border: 1px solid rgba(255,255,255,0.1);
  color: #78909c; padding: 0.2rem 0.4rem;
  border-radius: 4px; cursor: pointer; font-size: 0.7rem;
}
.ann-clear-btn:hover { background: rgba(239,83,80,0.15); color: #ef5350; border-color: rgba(239,83,80,0.4); }

.ann-body {
  flex: 1; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent;
}

.ann-empty {
  padding: 1.2rem 0.8rem;
  color: #546e7a; font-size: 0.72rem; text-align: center;
  line-height: 1.6;
}
.ann-empty small { color: #37474f; font-size: 0.65rem; }

.ann-row {
  display: grid;
  grid-template-columns: 30px 1fr 20px;
  gap: 0.4rem; align-items: flex-start;
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.ann-idx {
  display: inline-flex; justify-content: center; align-items: center;
  width: 26px; height: 26px;
  border-radius: 50%;
  background: #e91e63; color: #fff;
  font-size: 0.7rem; font-weight: 700; font-variant-numeric: tabular-nums;
  cursor: pointer; flex-shrink: 0;
  transition: transform 0.1s;
}
.ann-idx:hover { transform: scale(1.1); }

.ann-row-body { display: flex; flex-direction: column; gap: 0.25rem; }
.ann-text {
  font-family: inherit;
  font-size: 0.74rem; color: #cfd8dc;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  padding: 0.3rem 0.4rem;
  resize: vertical;
  min-height: 36px;
  width: 100%; box-sizing: border-box;
}
.ann-text:focus { outline: none; border-color: rgba(233,30,99,0.4); }

.ann-color-picker { display: flex; gap: 0.2rem; }
.ann-color-swatch {
  width: 14px; height: 14px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.18);
  cursor: pointer;
  padding: 0;
  transition: transform 0.1s, border-color 0.1s;
}
.ann-color-swatch:hover { transform: scale(1.2); }
.ann-color-swatch.active {
  border-color: #fff;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.35);
}

.ann-del {
  background: none; border: none; color: #78909c;
  font-size: 0.9rem; cursor: pointer; padding: 0 0.3rem; line-height: 1;
}
.ann-del:hover { color: #ef5350; }

.ann-export-btn,
.ann-import-btn {
  background: none; border: 1px solid rgba(255,255,255,0.1);
  color: #78909c; padding: 0.2rem 0.45rem;
  border-radius: 4px; cursor: pointer; font-size: 0.78rem;
  display: inline-flex; align-items: center;
}
.ann-export-btn:hover,
.ann-import-btn:hover { background: rgba(255,255,255,0.06); color: #cfd8dc; }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}
</style>
