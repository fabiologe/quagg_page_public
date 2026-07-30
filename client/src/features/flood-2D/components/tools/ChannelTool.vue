<template>
  <div
    class="tool-ui-panel channel-panel"
    :class="{ collapsed: !panelVisible }"
    @mouseenter="onPanelEnter"
    @mouseleave="onPanelLeave"
  >
    <div class="panel-header">
      Channel / Gerinne
      <span v-if="panelVisible" class="sgc-badge" title="Erzeugt Sub-Grid-Channel-Kanäle für den High-End-Solver">SGC</span>
      <span v-if="!panelVisible" class="collapse-toggle">···</span>
    </div>

    <div class="panel-content" v-show="panelVisible">

      <!-- Weiterzeichnen: erster Punkt ist auf einem Kanal-/Gerinne-Endpunkt eingerastet -->
      <div v-if="snapInfo" class="snap-hint">
        Angeschlossen an {{ snapInfo.label }} — Querschnitt wird übernommen.
      </div>

      <div v-if="isDrawing" class="state-idle">
        <div class="hint drawing-hint" v-if="pointCount">
          <span class="step-badge">{{ pointCount }}</span>
          Punkte gesetzt — <strong>Enter</strong> schließt die Linie ab (≥ 2)
        </div>
        <div class="hint" v-else>
          <span class="step-badge">1</span>
          Channel-Punkte aufs Terrain klicken (Polylinie)
        </div>
        <div class="sub-hint">Backspace: letzter Punkt · Esc: abbrechen</div>
        <div class="actions">
          <button class="btn btn-save" :disabled="pointCount < 2" @click="toolInstance.finishDrawing()">Linie abschließen</button>
          <button class="btn btn-cancel" @click="toolInstance.cancel()">Abbrechen</button>
        </div>
      </div>

      <div v-else class="state-idle">
        <div class="hint"><span class="step-badge">＋</span> Neue Gerinne-Polylinie zeichnen</div>
      </div>

      <div v-if="channels.length > 0" class="existing-list">
        <div class="list-title">Kanäle (SGC)</div>
        <div v-for="c in channels" :key="c.id" class="channel-item">
          <span class="channel-label">
            {{ c.shape === 'trapezoid' ? '⏢ Trapez' : '▭ Rechteck' }}
          </span>
          <!-- Number(...): Store-Werte defensiv koerzieren — ein String würde .toFixed
               crashen und die ganze Komponente reißen (Muster ChannelSectionModal). -->
          <span class="channel-meta">{{ c.polyline.length }} Pkt · b={{ Number(c.bedWidth).toFixed(1) }}m · t={{ Number(c.bedDepth).toFixed(1) }}m</span>
          <button class="btn-remove" @click="geoStore.removeSgcChannel(c.id)" title="Löschen">✕</button>
        </div>
      </div>

      <details class="sgc-info">
        <summary>Was ist SGC?</summary>
        <p>
          <strong>Sub-Grid-Channel:</strong> Das Gerinne wird <em>nicht</em> ins DGM
          eingebrannt, sondern dem Solver als Kanal <em>unterhalb</em> der 2D-Rasterzellen
          übergeben (Sohlbreite, Tiefe, Manning n je gestempelter Zelle).
        </p>
        <p>
          Wasser fließt zuerst 1D im Gerinne; steigt es über die Böschungsoberkante
          (bankfull = Geländeniveau), tritt es in die 2D-Fläche über — und läuft bei
          sinkendem Stand wieder zurück. So bleiben auch Gerinne, die schmaler als eine
          Rasterzelle sind, hydraulisch voll wirksam, ohne das Raster zu verfeinern.
        </p>
        <p class="sgc-info-legend">
          Vorschau in der Szene: <span class="dot cyan"></span> Trogkörper eingebauter
          Kanäle · <span class="dot lime"></span> Live-Entwurf beim Einstellen ·
          die cyanfarbenen Zellquadrate zeigen, welche Rasterzellen der Export stempelt.
        </p>
      </details>

    </div>

    <ChannelSectionModal
      :isOpen="showModal"
      :initial="snapInfo?.section ?? null"
      @close="onModalClose"
      @apply="onModalApply"
      @update="s => toolInstance.updateDraftSection(s)"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useSimulationStore } from '../../stores/useSimulationStore';
import { useGeoStore } from '../../stores/useGeoStore';
import { useCollapsiblePanel } from '../../composables/editor/useCollapsiblePanel.js';
import ChannelSectionModal from './ChannelSectionModal.vue';

const props = defineProps({
  toolInstance: { type: Object, required: true },
});

const simStore = useSimulationStore();
const geoStore = useGeoStore();

const state = computed(() => props.toolInstance?.state?.value ?? 'IDLE');
const isDrawing = computed(() => state.value === 'DRAWING');
const showModal = computed(() => props.toolInstance?.showModal?.value ?? false);
const pointCount = computed(() => props.toolInstance?.pointCount ?? 0);
const channels = computed(() => geoStore.sgcChannels);
const snapInfo = computed(() => props.toolInstance?.snapInfo?.value ?? null);

// Panel bleibt offen, solange gezeichnet wird oder das Popup sichtbar ist (modale Momente).
const { onPanelEnter, onPanelLeave, panelVisible } = useCollapsiblePanel({
  forceOpen: () => isDrawing.value || showModal.value,
});

// Popup bestätigt: Kanal anlegen UND Werkzeug deaktivieren (Auto-Reset),
// analog WeirTool/BridgeTool „Fertig" — verhindert versehentliches Weiterzeichnen.
const onModalApply = (section) => {
  props.toolInstance.applyChannel(section);
  simStore.setActiveTool(null);
};

const onModalClose = () => {
  props.toolInstance.cancel();
};
</script>

<style scoped>
/* Chrome (Position/Surface/Header/Hints/Buttons/Listen) kommt GLOBAL aus
   styles/tool-panel.css — WeirTool ist die Vorlage. Hier nur Channel-Spezifisches. */
.channel-item { display: flex; align-items: center; gap: 6px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
.channel-label { font-size: 0.85rem; font-weight: 600; flex: 1; }
.channel-meta { font-size: 0.75rem; color: #7f8c8d; }

/* Weiterzeichnen-Status: erster Punkt auf Kanal-Endpunkt eingerastet */
.snap-hint {
  font-size: 0.76rem; color: var(--sv-lime, #a3e635);
  background: rgba(163, 230, 53, 0.08); border: 1px solid rgba(163, 230, 53, 0.35);
  border-radius: 5px; padding: 6px 9px; margin-bottom: 8px; line-height: 1.35;
}

/* „Was ist SGC?" — Kurz-Erklärung im Panel */
.sgc-info { margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 8px; }
.sgc-info summary { cursor: pointer; font-size: 0.8rem; color: var(--sv-lime, #a3e635); user-select: none; }
.sgc-info p { font-size: 0.74rem; color: var(--sv-text-dim, #95a5a6); line-height: 1.45; margin: 7px 0 0; }
.sgc-info-legend { display: block; }
.sgc-info .dot { display: inline-block; width: 9px; height: 9px; border-radius: 2px; vertical-align: baseline; }
.sgc-info .dot.cyan { background: #00bcd4; }
.sgc-info .dot.lime { background: #a3e635; }
</style>
