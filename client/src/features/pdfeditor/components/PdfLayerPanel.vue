<template>
  <div ref="panelEl" class="pdfed-layer-panel">
    <div class="pdfed-layer-kopf">
      <PdfIcon name="ebenen" :size="16" />
      <span>PDF-Layer</span>
      <button class="pdfed-btn pdfed-layer-btn" title="Alle Layer einblenden" @click="alle(true)">
        <PdfIcon name="visible" :size="15" />
      </button>
      <button class="pdfed-btn pdfed-layer-btn" title="Alle Layer ausblenden" @click="alle(false)">
        <PdfIcon name="hidden" :size="15" />
      </button>
    </div>
    <ul class="pdfed-layer-liste">
      <li v-for="l in docStore.pdfLayer" :key="l.id">
        <label class="pdfed-layer-eintrag">
          <input
            type="checkbox"
            :checked="l.sichtbar"
            @change="docStore.setzeLayerSichtbar(l.id, $event.target.checked)"
          >
          <span class="pdfed-layer-name" :title="l.name">{{ l.name }}</span>
        </label>
      </li>
    </ul>
    <p class="pdfed-layer-hinweis">
      Wirkt nur auf die Anzeige — der Export enthält immer alle Layer.
      Ausgeblendete Layer beschleunigen das Rendern.
    </p>
  </div>
</template>

<script setup>
/**
 * PdfLayerPanel — die im PDF eingebetteten Layer (Optional Content Groups,
 * z. B. AutoCAD-Layer) ein-/ausblenden. Ausgeblendete Gruppen überspringt
 * pdf.js bei der Operator-Ausführung — bei CAD-Plänen ist das Feature
 * gleichzeitig ein Performance-Regler.
 */
import { ref, onMounted, onBeforeUnmount } from 'vue';
import PdfIcon from './PdfIcon.vue';
import { useDocStore } from '../stores/useDocStore';

const emit = defineEmits(['schliessen']);
const docStore = useDocStore();
const panelEl = ref(null);

function alle(sichtbar) {
  for (const l of docStore.pdfLayer) {
    if (l.sichtbar !== sichtbar) docStore.setzeLayerSichtbar(l.id, sichtbar);
  }
}

function aufAussenKlick(ev) {
  if (!panelEl.value?.contains(ev.target)) emit('schliessen');
}
onMounted(() => {
  setTimeout(() => window.addEventListener('pointerdown', aufAussenKlick, true), 0);
});
onBeforeUnmount(() => window.removeEventListener('pointerdown', aufAussenKlick, true));
</script>

<style scoped>
.pdfed-layer-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  width: 260px;
  display: flex;
  flex-direction: column;
  padding: 8px;
  background: var(--pdf-flaeche);
  border: 1px solid var(--pdf-rand);
  border-radius: var(--pdf-radius);
  box-shadow: var(--pdf-schatten);
  z-index: 30;
}
.pdfed-layer-kopf {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px 8px;
  font-weight: 600;
}
.pdfed-layer-kopf > span { flex: 1; }
.pdfed-layer-btn {
  min-height: 30px;
  min-width: 30px;
  padding: 0;
}
.pdfed-layer-liste {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 320px;
  overflow-y: auto;
  border-top: 1px solid var(--pdf-rand);
}
.pdfed-layer-eintrag {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 4px;
  cursor: pointer;
}
.pdfed-layer-eintrag:hover { background: var(--pdf-flaeche-2); }
.pdfed-layer-eintrag input { flex-shrink: 0; }
.pdfed-layer-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pdfed-layer-hinweis {
  margin: 8px 4px 2px;
  color: var(--pdf-text-dim);
  font-size: 11.5px;
}
</style>
