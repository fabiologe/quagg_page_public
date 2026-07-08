<template>
  <div class="tool-ui-panel netconduit-panel" v-show="isActive">
    <div class="panel-header"><SvEmoji emoji="🧵" :size="14" /> Haltung ziehen</div>
    <div class="panel-content">
      <div class="hint">
        <template v-if="!tool.state.fromId"><span class="step-badge">1</span> Anfangs-Schacht anklicken</template>
        <template v-else><span class="step-badge">2</span> Ziel-Schacht anklicken</template>
      </div>
      <div class="sub-hint">Verbindet zwei bestehende Schächte. Kette: der letzte Ziel-Schacht wird der nächste Anfang.</div>

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
import SvEmoji from '../common/SvEmoji.vue';
import { useSimulationStore } from '../../stores/useSimulationStore';
import { getNetworkConduitToolInstance } from '../../composables/editor/useNetworkConduitTool.js';

const simStore = useSimulationStore();
const tool = getNetworkConduitToolInstance();
const isActive = computed(() => simStore.activeTool === 'NET_CONDUIT');

function finish() { simStore.setActiveTool(null); }
</script>

<style scoped>
.tool-ui-panel.netconduit-panel {
    position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: rgba(30, 45, 58, 0.96); color: #ecf0f1; padding: 16px 20px; border-radius: 8px;
    backdrop-filter: blur(8px); pointer-events: auto; text-align: center; min-width: 280px;
    box-shadow: 0 8px 16px rgba(0,0,0,.25); border: 2px solid var(--sv-violet, #8b5cf6); z-index: 1000;
}
.panel-header {
    font-weight: 700; margin-bottom: 12px; color: var(--sv-violet, #8b5cf6);
    border-bottom: 1px solid rgba(255,255,255,.15); padding-bottom: 8px; text-transform: uppercase;
    letter-spacing: .5px; font-size: 0.95rem; display: flex; align-items: center; justify-content: center; gap: 6px;
}
.hint { font-size: 0.95rem; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 8px; }
.step-badge { background: var(--sv-violet, #8b5cf6); color: #fff; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: bold; }
.sub-hint { font-size: 0.78rem; color: #bdc3c7; line-height: 1.4; margin-bottom: 10px; }
.type-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 0.82rem; color: #bdc3c7; }
.seg { display: inline-flex; border: 1px solid #2e2740; border-radius: 5px; overflow: hidden; }
.seg button { background: #1a2635; color: #95a5a6; border: none; padding: 5px 12px; cursor: pointer; font-size: 0.76rem; }
.seg button.on { background: var(--sv-violet, #8b5cf6); color: #fff; }
.meta { font-size: 0.74rem; color: #7f8c8d; margin: 10px 0 4px; }
.actions { display: flex; gap: 10px; }
.btn { flex: 1; padding: 8px 0; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; }
.btn-save { background: var(--sv-lime, #a3e635); color: #12121a; }
.btn-save:hover { background: #b6f04d; }
.btn-cancel { background: #7f8c8d; color: #fff; }
.btn-cancel:disabled { opacity: .5; cursor: not-allowed; }
</style>
