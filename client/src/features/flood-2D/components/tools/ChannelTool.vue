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
          <span class="channel-meta">{{ c.polyline.length }} Pkt · b={{ c.bedWidth.toFixed(1) }}m · t={{ c.bedDepth.toFixed(1) }}m</span>
          <button class="btn-remove" @click="geoStore.removeSgcChannel(c.id)" title="Löschen">✕</button>
        </div>
      </div>

    </div>

    <ChannelSectionModal
      :isOpen="showModal"
      @close="onModalClose"
      @apply="onModalApply"
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
</style>
