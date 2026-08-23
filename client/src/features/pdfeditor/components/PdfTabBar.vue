<template>
  <nav
    class="pdfed-tabs"
    @dragover.prevent="aufLeisteDragOver"
    @drop.prevent="aufDrop($event, docStore.tabs.length)"
    @dragleave="zielIndex = null"
  >
    <div
      v-for="(t, i) in docStore.tabs"
      :key="t.dokId"
      class="pdfed-tab"
      :class="{
        'ist-aktiv': t.dokId === docStore.dokId,
        'ist-drop-vor': zielIndex === i,
      }"
      role="button"
      :title="t.name"
      draggable="true"
      @click="docStore.wechsleTab(t.dokId)"
      @dragstart="aufDragStart($event, t)"
      @dragend="zielIndex = null"
      @dragover.prevent.stop="aufTabDragOver($event, i)"
      @drop.prevent.stop="aufDrop($event, dropIndexFuer($event, i))"
    >
      <PdfIcon name="dokument" :size="14" class="pdfed-tab-icon" />
      <span class="pdfed-tab-name">{{ t.name }}</span>
      <button
        class="pdfed-tab-zu"
        :title="`„${t.name}“ schließen`"
        @click.stop="docStore.schliesseTab(t.dokId)"
      >
        <PdfIcon name="schliessen" :size="13" />
      </button>
    </div>
    <button
      class="pdfed-btn pdfed-tab-plus"
      title="Neues Dokument öffnen (Startseite)"
      @click="docStore.zeigeStartseite()"
    >
      <PdfIcon name="plus" :size="16" />
    </button>
    <button
      class="pdfed-btn pdfed-tab-plus"
      title="Neues Editor-Fenster öffnen (Tabs lassen sich zwischen Fenstern ziehen)"
      @click="oeffneNeuesFenster"
    >
      <PdfIcon name="neues-fenster" :size="16" />
    </button>
  </nav>
</template>

<script setup>
/**
 * PdfTabBar — mehrere PDFs wie Browser-Tabs in einem Fenster.
 * Klick wechselt (das Dokument lädt aus der IndexedDB nach, die gemerkte
 * Ansicht wird wiederhergestellt), × schließt den Tab, + führt zur
 * Startseite — offene Tabs bleiben dabei erhalten.
 *
 * Tabs sind zieh-bar: innerhalb der Leiste zum Umsortieren, und ZWISCHEN
 * zwei Editor-Fenstern zum Verschieben (die Fenster teilen die IndexedDB;
 * das Zielfenster öffnet die dokId und meldet die Übernahme per
 * BroadcastChannel, das Quellfenster schließt seinen Tab — TabTransfer).
 */
import { ref } from 'vue';
import PdfIcon from './PdfIcon.vue';
import { useDocStore } from '../stores/useDocStore';
import { TAB_DRAG_TYP, holeTabTransfer } from '../services/TabTransfer';

const docStore = useDocStore();
const zielIndex = ref(null);   // Einfügeposition während eines Drags

function aufDragStart(ev, tab) {
  ev.dataTransfer.setData(TAB_DRAG_TYP, tab.dokId);
  ev.dataTransfer.effectAllowed = 'move';
}

function _istTabDrag(ev) {
  return [...(ev.dataTransfer?.types ?? [])].includes(TAB_DRAG_TYP);
}

/** Vor oder nach dem überfahrenen Tab einfügen? Entscheidet die Tab-Mitte. */
function dropIndexFuer(ev, i) {
  const r = ev.currentTarget.getBoundingClientRect();
  return ev.clientX < r.left + r.width / 2 ? i : i + 1;
}

function aufTabDragOver(ev, i) {
  if (!_istTabDrag(ev)) return;
  ev.dataTransfer.dropEffect = 'move';
  zielIndex.value = dropIndexFuer(ev, i);
}

function aufLeisteDragOver(ev) {
  if (!_istTabDrag(ev)) return;
  ev.dataTransfer.dropEffect = 'move';
  zielIndex.value = docStore.tabs.length;
}

async function aufDrop(ev, index) {
  zielIndex.value = null;
  const dokId = ev.dataTransfer?.getData(TAB_DRAG_TYP);
  if (!dokId) return;
  if (docStore.tabs.some(t => t.dokId === dokId)) {
    // Gleiches Fenster → nur umsortieren.
    await docStore.verschiebeTab(dokId, index);
    return;
  }
  // Aus einem anderen Fenster: Dokument hier öffnen, dann dem Quellfenster
  // die Übernahme melden — es schließt daraufhin seinen Tab.
  const ok = await docStore.oeffneDokument(dokId);
  if (!ok) return;
  await docStore.verschiebeTab(dokId, index);
  holeTabTransfer().meldeUebernahme(dokId);
}

function oeffneNeuesFenster() {
  window.open('/pdf-editor', '_blank', 'noopener');
}
</script>

<style scoped>
.pdfed-tabs {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  padding: 6px 8px 0;
  background: var(--pdf-flaeche-2);
  border-bottom: 1px solid var(--pdf-rand);
  overflow-x: auto;
  overflow-y: hidden;
  flex-shrink: 0;
  -webkit-user-select: none;
  user-select: none;
}
.pdfed-tabs::-webkit-scrollbar { height: 6px; }
/* Ohne eigene Regel wäre der Daumen hier unsichtbar: die globale Regel
   setzt 2px transparenten Rand — bei 6px Leiste bliebe fast nichts übrig. */
.pdfed-tabs::-webkit-scrollbar-thumb {
  border: none;
  border-radius: 3px;
  background: var(--scroll-thumb);
}
.pdfed-tabs::-webkit-scrollbar-thumb:hover { background: var(--scroll-thumb-hover); }

.pdfed-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 110px;
  max-width: 200px;
  min-height: 36px;
  padding: 0 4px 0 10px;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  color: var(--pdf-text-dim);
  cursor: pointer;
  touch-action: manipulation;
}
.pdfed-tab:hover { background: var(--pdf-flaeche-3); }
.pdfed-tab.ist-aktiv {
  background: var(--pdf-flaeche);
  border-color: var(--pdf-rand);
  color: var(--pdf-text);
  /* verschmilzt optisch mit der Toolbar darunter */
  margin-bottom: -1px;
  padding-bottom: 1px;
}
.pdfed-tab.ist-drop-vor {
  box-shadow: -3px 0 0 0 var(--pdf-akzent);
}
.pdfed-tab-icon { flex-shrink: 0; color: var(--pdf-akzent); }
.pdfed-tab-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pdfed-tab-zu {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--pdf-text-dim);
  cursor: pointer;
  flex-shrink: 0;
}
.pdfed-tab-zu:hover {
  background: var(--pdf-flaeche-3);
  color: var(--pdf-fehler);
}
.pdfed-tab-plus {
  min-height: 34px;
  min-width: 34px;
  margin-bottom: 2px;
  padding: 0;
  flex-shrink: 0;
}
</style>
