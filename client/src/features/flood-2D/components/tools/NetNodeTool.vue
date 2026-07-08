<template>
  <div
    class="tool-ui-panel netnode-panel"
    :class="{ collapsed: !panelVisible }"
    v-show="isActive"
    @mouseenter="onPanelEnter"
    @mouseleave="onPanelLeave"
  >
    <div class="panel-header">
      <SvEmoji emoji="🕳️" :size="14" /> Schacht setzen
      <span v-if="!panelVisible" class="collapse-dots">···</span>
    </div>

    <div class="panel-content" v-show="panelVisible">
      <div v-if="!pending" class="state-idle">
        <div class="hint"><span class="step-badge">1</span> Klicke auf das Terrain</div>
        <div class="sub-hint">Setzt einen Kanalnetz-Schacht (Deckel = Gelände).</div>
        <label class="type-row"><span>Rolle</span>
          <select v-model="role" class="type-select">
            <option value="manhole">Schacht (manhole)</option>
            <option value="inlet">Einlauf (inlet)</option>
            <option value="outfall">Auslauf (outfall)</option>
            <option value="storage">Speicher (storage)</option>
          </select>
        </label>
        <label class="type-row"><span>Tiefe [m]</span>
          <input type="number" step="0.1" min="0.1" v-model.number="depth" class="type-select" />
        </label>
      </div>

      <div v-else class="state-popup">
        <div class="hint">Schacht bestätigen</div>
        <div class="coord-display">
          <div class="coord-row"><span>x:</span> <strong>{{ pending.x.toFixed(2) }}</strong></div>
          <div class="coord-row"><span>y:</span> <strong>{{ pending.y.toFixed(2) }}</strong></div>
          <div class="coord-row"><span>Deckel (rim):</span> <strong>{{ pending.z.toFixed(2) }}</strong></div>
          <div class="coord-row"><span>Sohle (invert):</span> <strong>{{ (pending.z - depth).toFixed(2) }}</strong></div>
        </div>
        <label class="type-row"><span>Rolle</span>
          <select v-model="role" class="type-select">
            <option value="manhole">Schacht</option>
            <option value="inlet">Einlauf</option>
            <option value="outfall">Auslauf</option>
            <option value="storage">Speicher</option>
          </select>
        </label>
        <div class="actions">
          <button class="btn btn-save" @click="save">Schacht setzen</button>
          <button class="btn btn-cancel" @click="pending = null">Abbrechen</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import SvEmoji from '../common/SvEmoji.vue';
import { useSimulationStore } from '../../stores/useSimulationStore';
import { useNetworkStore } from '../../stores/useNetworkStore.js';
import { useCollapsiblePanel } from '../../composables/editor/useCollapsiblePanel.js';

const simStore = useSimulationStore();
const net = useNetworkStore();

const isActive = computed(() => simStore.activeTool === 'NET_NODE');
const { onPanelEnter, onPanelLeave, panelVisible } = useCollapsiblePanel({ forceOpen: () => !!pending.value });

const pending = ref(null);
const role = ref('manhole');
const depth = ref(2.0);

watch(isActive, (a) => { if (!a) pending.value = null; });

const handleWindowMapClick = (event) => {
    if (!isActive.value || pending.value) return;
    const c = event.detail;
    if (!c || typeof c.x !== 'number') return;
    pending.value = { x: c.x, y: c.y, z: c.z };
};
onMounted(() => window.addEventListener('map-click', handleWindowMapClick));
onUnmounted(() => window.removeEventListener('map-click', handleWindowMapClick));

function save() {
    if (!pending.value) return;
    const z = pending.value.z;
    // net.addNode feuert 'flood2d-object-placed' → MapEditor3D setzt das Werkzeug zurück.
    net.addNode({ role: role.value, x: pending.value.x, y: pending.value.y, rim: z, invert: z - depth.value });
    pending.value = null;
}
</script>

<style scoped>
.tool-ui-panel.netnode-panel {
    position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: rgba(30, 45, 58, 0.96); color: #ecf0f1; padding: 16px 20px; border-radius: 8px;
    backdrop-filter: blur(8px); pointer-events: auto; text-align: center; min-width: 260px;
    box-shadow: 0 8px 16px rgba(0,0,0,.25); border: 2px solid var(--sv-violet, #8b5cf6); z-index: 1000;
}
.panel-header {
    font-weight: 700; margin-bottom: 12px; color: var(--sv-violet, #8b5cf6);
    border-bottom: 1px solid rgba(255,255,255,.15); padding-bottom: 8px; text-transform: uppercase;
    letter-spacing: .5px; font-size: 0.95rem; display: flex; align-items: center; justify-content: center; gap: 6px; user-select: none;
}
.collapse-dots { margin-left: auto; opacity: .4; letter-spacing: 2px; font-size: 0.8rem; }
.tool-ui-panel.netnode-panel.collapsed { min-width: unset; padding: 8px 16px; }
.netnode-panel.collapsed .panel-header { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
.hint { font-size: 0.95rem; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 8px; }
.step-badge { background: var(--sv-violet, #8b5cf6); color: #fff; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: bold; }
.sub-hint { font-size: 0.8rem; color: #bdc3c7; line-height: 1.4; margin-bottom: 8px; }
.state-popup { display: flex; flex-direction: column; gap: 12px; margin-top: 4px; }
.coord-display { background: #1a2635; border-radius: 6px; padding: 10px; border: 1px solid #2e2740; display: flex; flex-direction: column; gap: 4px; text-align: left; }
.coord-row { display: flex; justify-content: space-between; font-size: 0.82rem; color: #ecf0f1; }
.coord-row span { color: #bdc3c7; }
.type-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 0.82rem; color: #bdc3c7; margin-top: 8px; }
.type-select { flex: 1; background: #1a2635; color: #ecf0f1; border: 1px solid #2e2740; border-radius: 4px; padding: 6px 8px; font-size: 0.82rem; }
.actions { display: flex; gap: 10px; margin-top: 4px; }
.btn { flex: 1; padding: 8px 0; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; transition: all .2s; }
.btn-save { background: var(--sv-lime, #a3e635); color: #12121a; }
.btn-save:hover { background: #b6f04d; }
.btn-cancel { background: #7f8c8d; color: #fff; }
.btn-cancel:hover { background: #95a5a6; }
.btn:active { transform: scale(.96); }
</style>
