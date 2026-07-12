<template>
  <div
    class="tool-ui-panel netnode-panel"
    :class="{ collapsed: !panelVisible }"
    v-show="isActive"
    @mouseenter="onPanelEnter"
    @mouseleave="onPanelLeave"
  >
    <div class="panel-header">
      <SvIcon name="Schacht.png" :size="14" color="currentColor" /> Schacht setzen
      <span v-if="!panelVisible" class="collapse-dots">···</span>
    </div>

    <div class="panel-content" v-show="panelVisible">
      <div v-if="!pending" class="state-idle">
        <div class="hint"><span class="step-badge">1</span> Klicke auf das Terrain</div>
        <div class="sub-hint">Setzt einen Kanalnetz-Schacht (Deckel = Gelände). Der Ring zeigt den
          Klickpunkt (Lime = trifft Schacht). Bestehender Schacht: <b>1. Klick wählt aus</b>,
          den <b>ausgewählten</b> Schacht ziehen = verschieben.</div>
        <label class="type-row"><span>Rolle</span>
          <select v-model="role" class="type-select">
            <option value="manhole">Schacht (manhole)</option>
            <option value="inlet">Einlauf (inlet)</option>
            <option value="outfall">Auslauf (outfall)</option>
            <option value="storage">Speicher (storage)</option>
            <option value="pump">Pumpe (pump)</option>
            <option value="weir">Wehr (weir)</option>
            <option value="orifice">Drossel (orifice)</option>
          </select>
        </label>
        <label class="type-row"><span>Tiefe [m]</span>
          <input type="number" step="0.1" min="0.1" v-model.number="depth" class="type-select" />
        </label>
        <div v-if="isSpecial" class="sub-hint special-hint">
          <SvEmoji emoji="⚡" :size="12" /> Sonderbauwerk: braucht eine <b>abgehende Haltung</b>
          (wird sonst als einfacher Schacht exportiert). Parameter im Eigenschaften-Panel.
        </div>
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
            <option value="pump">Pumpe</option>
            <option value="weir">Wehr</option>
            <option value="orifice">Drossel</option>
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
import SvIcon from '../common/SvIcon.vue';
import { useSimulationStore } from '../../stores/useSimulationStore';
import { useNetworkStore } from '../../stores/useNetworkStore.js';
import { useCollapsiblePanel } from '../../composables/editor/useCollapsiblePanel.js';
import { getNetworkNodeToolInstance } from '../../composables/editor/useNetworkNodeTool.js';

const simStore = useSimulationStore();
const net = useNetworkStore();
const nodeTool = getNetworkNodeToolInstance();

const isActive = computed(() => simStore.activeTool === 'NET_NODE');
const { onPanelEnter, onPanelLeave, panelVisible } = useCollapsiblePanel({ forceOpen: () => !!pending.value });

const pending = ref(null);
const role = ref('manhole');
const depth = ref(2.0);
const isSpecial = computed(() => ['pump', 'weir', 'orifice'].includes(role.value));

watch(isActive, (a) => { if (!a) pending.value = null; });

const handleWindowMapClick = (event) => {
    if (!isActive.value || pending.value) return;
    // Klick/Drag auf einen BESTEHENDEN Schacht = Auswahl/Verschieben (useNetworkNodeTool),
    // darf kein Platzierungs-Popup öffnen.
    if (nodeTool.consumeSuppressedClick()) return;
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
/* Chrome kommt GLOBAL aus styles/tool-panel.css (Vorlage WeirTool). */
.special-hint { margin-top: 8px; color: #f59e0b; text-align: left; }
.state-popup { display: flex; flex-direction: column; gap: 12px; margin-top: 4px; }
.coord-display { background: #1a2635; border-radius: 6px; padding: 10px; border: 1px solid #2e2740; display: flex; flex-direction: column; gap: 4px; text-align: left; }
.coord-row { display: flex; justify-content: space-between; font-size: 0.82rem; color: #ecf0f1; }
.coord-row span { color: #bdc3c7; }
.type-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 0.82rem; color: #bdc3c7; margin-top: 8px; }
.type-select { flex: 1; background: #1a2635; color: #ecf0f1; border: 1px solid #2e2740; border-radius: 4px; padding: 6px 8px; font-size: 0.82rem; }
</style>
