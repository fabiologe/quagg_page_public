<template>
  <!-- Teleport nach <body>: entkommt dem z-index:15-Stacking-Context des rechten Panels
       (sonst liegen Canvas-Overlays wie LayerControl ÜBER dem Modal, s. NetworkRasterCheck). -->
  <Teleport to="body">
  <div class="ndt-overlay" @click.self="$emit('close')">
    <div class="ndt-modal">
      <div class="ndt-head">
        <span><SvEmoji emoji="📋" :size="15" /> Kanalnetz — Daten bearbeiten</span>
        <button class="ndt-x" @click="$emit('close')">×</button>
      </div>

      <!-- Bulk-Leiste -->
      <div v-if="selCount" class="ndt-bulk">
        <strong>{{ selCount }} ausgewählt</strong>
        <template v-if="tab === 'nodes'">
          <label>Rolle
            <select v-model="bulk.nodeRole"><option value="">—</option>
              <option v-for="r in NODE_ROLES" :key="r" :value="r">{{ r }}</option></select>
          </label>
          <button class="ndt-btn" :disabled="!bulk.nodeRole" @click="applyBulkNode('role', bulk.nodeRole)">setzen</button>
        </template>
        <template v-else>
          <label>Führung
            <select v-model="bulk.conveyance"><option value="">—</option>
              <option value="covered">Rohr</option><option value="open">Gerinne</option></select>
          </label>
          <button class="ndt-btn" :disabled="!bulk.conveyance" @click="applyBulkLink('conveyance', bulk.conveyance)">setzen</button>
        </template>
        <button class="ndt-btn danger" @click="deleteSelected">🗑 Löschen</button>
        <button class="ndt-btn" @click="clearSel">Auswahl leeren</button>
      </div>

      <!-- Tabs -->
      <div class="ndt-tabs">
        <button :class="{ on: tab==='nodes' }" @click="tab='nodes'">Schächte ({{ net.nodes.length }})</button>
        <button :class="{ on: tab==='links' }" @click="tab='links'">Haltungen ({{ net.links.length }})</button>
        <span class="spacer"></span>
        <button class="ndt-btn" @click="addNode">＋ Schacht</button>
        <button class="ndt-btn" :disabled="net.nodes.length < 2" @click="addLink" title="verbindet die ersten beiden ausgewählten Schächte (oder die ersten beiden)">＋ Haltung</button>
      </div>

      <div class="ndt-body">
        <!-- SCHÄCHTE -->
        <table v-if="tab==='nodes'" class="ndt-table">
          <thead><tr>
            <th><input type="checkbox" :checked="allNodesSel" @change="toggleAllNodes" /></th>
            <th>ID</th><th>Rolle</th><th>x</th><th>y</th><th>Deckel</th><th>Sohle</th><th>⌀</th><th></th>
          </tr></thead>
          <tbody>
            <tr v-for="n in net.nodes" :key="n.id" :class="{ sel: selN.has(n.id) }">
              <td><input type="checkbox" :checked="selN.has(n.id)" @change="toggle(selN, n.id)" /></td>
              <td class="mono" :title="n.id">{{ n.id }}</td>
              <td><select :value="n.role" @change="net.updateNode(n.id, { role: $event.target.value })">
                <option v-for="r in NODE_ROLES" :key="r" :value="r">{{ r }}</option></select></td>
              <td><input type="number" step="0.1" :value="n.x" @change="net.updateNode(n.id, { x: num($event) })" /></td>
              <td><input type="number" step="0.1" :value="n.y" @change="net.updateNode(n.id, { y: num($event) })" /></td>
              <td><input type="number" step="0.01" :value="n.rim" @change="net.updateNode(n.id, { rim: num($event) })" /></td>
              <td><input type="number" step="0.01" :value="n.invert" @change="net.updateNode(n.id, { invert: num($event) })" /></td>
              <td><input type="number" step="0.05" :value="n.attrs?.diameter ?? ''" @change="net.updateNode(n.id, { attrs: { diameter: num($event) } })" /></td>
              <td><button class="del" @click="net.deleteNode(n.id)">×</button></td>
            </tr>
          </tbody>
        </table>

        <!-- HALTUNGEN -->
        <table v-else class="ndt-table">
          <thead><tr>
            <th><input type="checkbox" :checked="allLinksSel" @change="toggleAllLinks" /></th>
            <th>ID</th><th>von</th><th>nach</th><th>Führung</th><th>Höhe</th><th>Breite</th><th>kSt</th><th></th>
          </tr></thead>
          <tbody>
            <tr v-for="l in net.links" :key="l.id" :class="{ sel: selL.has(l.id) }">
              <td><input type="checkbox" :checked="selL.has(l.id)" @change="toggle(selL, l.id)" /></td>
              <td class="mono" :title="l.id">{{ l.id }}</td>
              <td class="mono">{{ l.fromNodeId }}</td>
              <td class="mono">{{ l.toNodeId }}</td>
              <td><select :value="l.conveyance" @change="net.updateLink(l.id, { conveyance: $event.target.value })">
                <option value="covered">Rohr</option><option value="open">Gerinne</option></select></td>
              <td><input type="number" step="0.05" :value="l.profile?.height ?? ''" @change="net.updateLink(l.id, { profile: { height: num($event) } })" /></td>
              <td><input type="number" step="0.05" :value="l.profile?.width ?? ''" @change="net.updateLink(l.id, { profile: { width: num($event) } })" /></td>
              <td><input type="number" step="1" :value="l.attrs?.kSt ?? ''" @change="net.updateLink(l.id, { attrs: { kSt: num($event) } })" /></td>
              <td><button class="del" @click="net.deleteLink(l.id)">×</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import SvEmoji from '../common/SvEmoji.vue';
import { useNetworkStore } from '@/features/flood-2D/stores/useNetworkStore.js';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore.js';
import { makeTerrainSampler } from '@/features/flood-2D/services/geometry/terrainSample.js';

defineEmits(['close']);
const net = useNetworkStore();
const geoStore = useGeoStore();
const NODE_ROLES = ['manhole', 'inlet', 'outfall', 'storage', 'junction', 'weir', 'orifice', 'pump'];

const tab = ref('nodes');
const selN = reactive(new Set());
const selL = reactive(new Set());
const bulk = reactive({ nodeRole: '', conveyance: '' });

const num = (e) => { const v = Number(e.target.value); return Number.isFinite(v) ? v : 0; };
const selCount = computed(() => (tab.value === 'nodes' ? selN.size : selL.size));
const allNodesSel = computed(() => net.nodes.length > 0 && selN.size === net.nodes.length);
const allLinksSel = computed(() => net.links.length > 0 && selL.size === net.links.length);

function toggle(set, id) { set.has(id) ? set.delete(id) : set.add(id); }
function toggleAllNodes(e) { selN.clear(); if (e.target.checked) net.nodes.forEach(n => selN.add(n.id)); }
function toggleAllLinks(e) { selL.clear(); if (e.target.checked) net.links.forEach(l => selL.add(l.id)); }
function clearSel() { selN.clear(); selL.clear(); }
function applyBulkNode(field, val) { selN.forEach(id => net.updateNode(id, { [field]: val })); }
function applyBulkLink(field, val) { selL.forEach(id => net.updateLink(id, { [field]: val })); }
function deleteSelected() {
    if (tab.value === 'nodes') { [...selN].forEach(id => net.deleteNode(id)); selN.clear(); }
    else { [...selL].forEach(id => net.deleteLink(id)); selL.clear(); }
}
function addNode() {
    const s = makeTerrainSampler(geoStore.terrain);
    const c = s ? s.center : { x: 0, y: 0, z: 0 };
    const z = s ? (s.sampleZ(c.x, c.y) ?? c.z) : 0;
    const id = net.addNode({ role: 'manhole', x: c.x, y: c.y, rim: z, invert: z - 2 });
    net.select(id);
}
function addLink() {
    const ids = selN.size >= 2 ? [...selN] : net.nodes.slice(0, 2).map(n => n.id);
    if (ids.length < 2) return;
    net.addLink({ fromNodeId: ids[0], toNodeId: ids[1], conveyance: 'covered' });
}
</script>

<style scoped>
.ndt-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); backdrop-filter: blur(3px); z-index: 3000; display: flex; align-items: center; justify-content: center; }
.ndt-modal { width: min(920px, 94vw); max-height: 88vh; display: flex; flex-direction: column; background: var(--sv-surface, #1e2d3a); color: var(--sv-text, #ecf0f1); border: 1px solid var(--sv-violet, #8b5cf6); border-radius: 10px; font-family: var(--sv-font, sans-serif); box-shadow: 0 20px 50px rgba(0,0,0,.5); }
.ndt-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #2e2740; font-weight: 700; }
.ndt-x { background: none; border: none; color: #95a5a6; font-size: 1.4rem; cursor: pointer; line-height: 1; }
.ndt-bulk { display: flex; align-items: center; gap: 10px; padding: 8px 16px; background: rgba(163,230,53,.08); border-bottom: 1px solid #2e2740; font-size: 0.8rem; flex-wrap: wrap; }
.ndt-tabs { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-bottom: 1px solid #2e2740; }
.ndt-tabs > button { background: #1a2635; color: #95a5a6; border: 1px solid #2e2740; border-radius: 5px; padding: 5px 12px; cursor: pointer; font-size: 0.8rem; }
.ndt-tabs > button.on { background: var(--sv-violet, #8b5cf6); color: #fff; }
.ndt-tabs .spacer { flex: 1; }
.ndt-body { overflow: auto; padding: 4px 8px 12px; }
.ndt-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
.ndt-table th { text-align: left; color: #5d7f99; font-weight: 600; padding: 6px 6px; position: sticky; top: 0; background: var(--sv-surface, #1e2d3a); border-bottom: 1px solid #2e2740; }
.ndt-table td { padding: 3px 6px; border-bottom: 1px solid #ffffff08; }
.ndt-table tr.sel { background: rgba(163,230,53,.10); }
.ndt-table .mono { font-family: monospace; color: #bdc3c7; max-width: 130px; overflow: hidden; text-overflow: ellipsis; }
.ndt-table input[type=number], .ndt-table select { width: 84px; background: var(--sv-bg, #12121a); color: #ecf0f1; border: 1px solid #2e2740; border-radius: 3px; padding: 3px 5px; font-size: 0.76rem; }
.ndt-table .del { background: none; border: none; color: #e74c3c; cursor: pointer; font-size: 1rem; }
.ndt-btn { background: #1a2635; color: #ecf0f1; border: 1px solid var(--sv-violet, #8b5cf6); border-radius: 5px; padding: 5px 10px; cursor: pointer; font-size: 0.78rem; }
.ndt-btn:disabled { opacity: .5; cursor: not-allowed; }
.ndt-btn.danger { border-color: #e74c3c; color: #e74c3c; }
.ndt-bulk label, .ndt-bulk select { font-size: 0.78rem; }
.ndt-bulk select { background: var(--sv-bg, #12121a); color: #ecf0f1; border: 1px solid #2e2740; border-radius: 3px; padding: 2px 4px; }
</style>
