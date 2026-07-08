<template>
  <div v-if="sel" class="np-panel sv-theme">
    <div class="np-head">
      <span class="np-kind"><SvEmoji :emoji="isLink ? '🧵' : '🕳️'" :size="14" /> {{ isLink ? 'Haltung' : 'Schacht' }}</span>
      <code class="np-id">{{ sel.id }}</code>
      <button class="np-close" @click="net.select(null)" title="Auswahl aufheben">×</button>
    </div>

    <!-- SCHACHT -->
    <template v-if="!isLink">
      <label class="np-row">Rolle
        <select :value="sel.role" @change="upd({ role: $event.target.value })">
          <option v-for="r in NODE_ROLES" :key="r" :value="r">{{ r }}</option>
        </select>
      </label>
      <label class="np-row">Deckel (rim) [m]
        <input type="number" step="0.01" :value="sel.rim" @change="upd({ rim: num($event) })" />
      </label>
      <label class="np-row">Sohle (invert) [m]
        <input type="number" step="0.01" :value="sel.invert" @change="upd({ invert: num($event) })" />
      </label>
      <label class="np-row">Durchmesser [m]
        <input type="number" step="0.05" :value="sel.attrs?.diameter ?? ''" @change="upd({ attrs: { diameter: num($event) } })" />
      </label>
      <label class="np-row">Rechtswert x
        <input type="number" step="0.1" :value="sel.x" @change="upd({ x: num($event) })" />
      </label>
      <label class="np-row">Hochwert y
        <input type="number" step="0.1" :value="sel.y" @change="upd({ y: num($event) })" />
      </label>
    </template>

    <!-- HALTUNG -->
    <template v-else>
      <p class="np-pos">{{ sel.fromNodeId }} → {{ sel.toNodeId }}</p>
      <div class="np-row np-toggle">
        <span>Führung</span>
        <div class="seg">
          <button :class="{ on: sel.conveyance !== 'open' }" @click="upd({ conveyance: 'covered' })" title="Rohr (1D/SWMM)">Rohr</button>
          <button :class="{ on: sel.conveyance === 'open' }" @click="upd({ conveyance: 'open' })" title="Offenes Gerinne (2D/SGC)">Gerinne</button>
        </div>
      </div>
      <label class="np-row">Profilhöhe [m]
        <input type="number" step="0.05" :value="sel.profile?.height ?? ''" @change="upd({ profile: { height: num($event) } })" />
      </label>
      <label class="np-row">Profilbreite [m]
        <input type="number" step="0.05" :value="sel.profile?.width ?? ''" @change="upd({ profile: { width: num($event) } })" />
      </label>
      <label class="np-row">Rauheit kSt
        <input type="number" step="1" :value="sel.attrs?.kSt ?? ''" @change="upd({ attrs: { kSt: num($event) } })" />
      </label>
    </template>

    <button class="np-del" @click="remove"><SvEmoji emoji="🗑" :size="13" /> Löschen</button>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import SvEmoji from '../common/SvEmoji.vue';
import { useNetworkStore } from '@/features/flood-2D/stores/useNetworkStore.js';

const NODE_ROLES = ['manhole', 'inlet', 'outfall', 'storage', 'junction', 'weir', 'orifice', 'pump'];
const net = useNetworkStore();
const sel = computed(() => net.selected);
const isLink = computed(() => !!(sel.value && 'fromNodeId' in sel.value));

const num = (e) => { const v = Number(e.target.value); return Number.isFinite(v) ? v : 0; };

function upd(patch) {
    if (!sel.value) return;
    if (isLink.value) net.updateLink(sel.value.id, patch);
    else net.updateNode(sel.value.id, patch);
}
function remove() {
    if (!sel.value) return;
    if (isLink.value) net.deleteLink(sel.value.id);
    else net.deleteNode(sel.value.id);
}
</script>

<style scoped>
.np-panel {
    width: 240px; background: var(--sv-surface, #253547); color: var(--sv-text, #ecf0f1);
    border: 1px solid var(--sv-violet, #8b5cf6); border-radius: 8px; padding: 10px 12px;
    font-family: var(--sv-font, sans-serif); font-size: 0.8rem;
    box-shadow: 0 10px 28px rgba(0,0,0,.45); display: flex; flex-direction: column; gap: 7px;
}
.np-head { display: flex; align-items: center; gap: 6px; }
.np-kind { font-weight: 600; }
.np-id { margin-left: 2px; font-size: 0.72rem; color: #a3e635; overflow: hidden; text-overflow: ellipsis; }
.np-close { margin-left: auto; background: none; border: none; color: #95a5a6; font-size: 1.1rem; cursor: pointer; line-height: 1; }
.np-close:hover { color: #ecf0f1; }
.np-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 0.76rem; color: #bdc3c7; }
.np-row select, .np-row input {
    width: 110px; background: var(--sv-bg, #12121a); color: #ecf0f1;
    border: 1px solid #2e2740; border-radius: 4px; padding: 4px 6px; font-size: 0.78rem;
}
.np-row select:focus, .np-row input:focus { border-color: var(--sv-lime, #a3e635); outline: none; }
.np-pos { margin: 0; font-size: 0.72rem; color: #7f8c8d; font-family: monospace; }
.np-toggle .seg { display: inline-flex; border: 1px solid #2e2740; border-radius: 5px; overflow: hidden; }
.np-toggle .seg button { background: var(--sv-bg, #12121a); color: #95a5a6; border: none; padding: 4px 10px; cursor: pointer; font-size: 0.74rem; }
.np-toggle .seg button.on { background: var(--sv-violet, #8b5cf6); color: #fff; }
.np-del {
    margin-top: 3px; display: flex; align-items: center; justify-content: center; gap: 6px;
    background: transparent; color: #e74c3c; border: 1px solid #e74c3c55; border-radius: 5px;
    padding: 6px; cursor: pointer; font-size: 0.78rem;
}
.np-del:hover { background: rgba(231,76,60,.15); border-color: #e74c3c; }
</style>
