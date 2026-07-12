<template>
  <div
    class="tool-ui-panel netconduit-panel"
    :class="{ collapsed: !panelVisible }"
    v-show="isActive"
    @mouseenter="onPanelEnter"
    @mouseleave="onPanelLeave"
  >
    <div class="panel-header">
      <SvIcon name="Haltung.png" :size="14" color="currentColor" /> Haltung ziehen
      <span v-if="!panelVisible" class="collapse-dots">···</span>
    </div>
    <div class="panel-content" v-show="panelVisible">
      <div class="hint">
        <template v-if="!tool.state.fromId"><span class="step-badge">1</span> Anfangs-Schacht anklicken</template>
        <template v-else><span class="step-badge">2</span> Ziel anklicken (Schacht oder Gelände)</template>
      </div>
      <div class="sub-hint">Klick auf leeres Gelände legt automatisch einen neuen Schacht an (Tiefe 2&nbsp;m).
        Kette: der letzte Ziel-Schacht wird der nächste Anfang.</div>

      <label class="type-row"><span>Führung</span>
        <div class="seg">
          <button :class="{ on: tool.state.conveyance !== 'open' }" @click="tool.state.conveyance = 'covered'">Rohr</button>
          <button :class="{ on: tool.state.conveyance === 'open' }" @click="tool.state.conveyance = 'open'">Gerinne</button>
        </div>
      </label>

      <div class="meta">{{ tool.state.count }} Haltung(en) gesetzt</div>
      <div class="actions">
        <button class="btn btn-cancel" @click="tool.reset()" :disabled="!tool.state.fromId">Kette lösen</button>
        <button class="btn btn-save" @click="finish">Fertig</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import SvIcon from '../common/SvIcon.vue';
import { useSimulationStore } from '../../stores/useSimulationStore';
import { getNetworkConduitToolInstance } from '../../composables/editor/useNetworkConduitTool.js';
import { useCollapsiblePanel } from '../../composables/editor/useCollapsiblePanel.js';

const simStore = useSimulationStore();
const tool = getNetworkConduitToolInstance();
const isActive = computed(() => simStore.activeTool === 'NET_CONDUIT');
// Einheitliches Hover-Einklappen (Muster NetNodeTool); während einer aktiven Kette
// (fromId gesetzt) bleibt das Panel offen — das ist der „modale" Zeichen-Moment.
const { onPanelEnter, onPanelLeave, panelVisible } = useCollapsiblePanel({ forceOpen: () => !!tool.state.fromId });

function finish() { simStore.setActiveTool(null); }
</script>

<style scoped>
/* Chrome kommt GLOBAL aus styles/tool-panel.css (Vorlage WeirTool). */
.type-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 0.82rem; color: #bdc3c7; }
.seg { display: inline-flex; border: 1px solid #2e2740; border-radius: 5px; overflow: hidden; }
.seg button { background: #1a2635; color: #95a5a6; border: none; padding: 5px 12px; cursor: pointer; font-size: 0.76rem; }
.seg button.on { background: var(--sv-violet, #8b5cf6); color: #fff; }
.meta { font-size: 0.74rem; color: #7f8c8d; margin: 10px 0 4px; }
.btn-cancel:disabled { opacity: .5; cursor: not-allowed; }
</style>
