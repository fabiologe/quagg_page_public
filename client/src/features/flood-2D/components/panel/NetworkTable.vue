<template>
  <div class="net-table">
    <!-- SCHÄCHTE -->
    <div class="nt-section-head">
      <SvEmoji emoji="🕳️" :size="13" /> Schächte <span class="nt-count">{{ net.nodes.length }}</span>
    </div>
    <div class="nt-rows">
      <div
        v-for="n in net.nodes" :key="n.id"
        class="nt-row" :class="{ selected: net.selectedId === n.id }"
        @click="net.select(n.id)"
      >
        <span class="nt-dot" :style="{ background: roleColor(n.role) }"></span>
        <span class="nt-id" :title="n.id">{{ short(n.id) }}</span>
        <span class="nt-role">{{ n.role }}</span>
        <span class="nt-info">▽{{ fmt(n.rim) }} / ⌄{{ fmt(n.invert) }}</span>
        <button class="nt-del" @click.stop="net.deleteNode(n.id)" title="Schacht löschen">×</button>
      </div>
      <div v-if="net.nodes.length === 0" class="nt-empty">Keine Schächte.</div>
    </div>

    <!-- HALTUNGEN -->
    <div class="nt-section-head">
      <SvEmoji emoji="🧵" :size="13" /> Haltungen <span class="nt-count">{{ net.links.length }}</span>
    </div>
    <div class="nt-rows">
      <div
        v-for="l in net.links" :key="l.id"
        class="nt-row" :class="{ selected: net.selectedId === l.id }"
        @click="net.select(l.id)"
      >
        <span class="nt-dot" :style="{ background: l.conveyance === 'open' ? '#06b6d4' : '#94a3b8' }"></span>
        <span class="nt-id" :title="l.id">{{ short(l.id) }}</span>
        <span class="nt-role">{{ l.conveyance === 'open' ? 'Gerinne' : 'Rohr' }}</span>
        <span class="nt-info">{{ short(l.fromNodeId, 6) }}→{{ short(l.toNodeId, 6) }}</span>
        <button class="nt-del" @click.stop="net.deleteLink(l.id)" title="Haltung löschen">×</button>
      </div>
      <div v-if="net.links.length === 0" class="nt-empty">Keine Haltungen.</div>
    </div>
  </div>
</template>

<script setup>
import SvEmoji from '../common/SvEmoji.vue';
import { useNetworkStore } from '@/features/flood-2D/stores/useNetworkStore.js';

const net = useNetworkStore();
const ROLE_COLOR = { manhole: '#3b82f6', inlet: '#22c55e', outfall: '#ef4444', storage: '#a855f7', junction: '#38bdf8' };
const roleColor = (r) => ROLE_COLOR[r] || '#64748b';
const short = (id, n = 10) => (id ? (String(id).length > n ? String(id).slice(0, n) + '…' : String(id)) : '–');
const fmt = (v) => (Number.isFinite(v) ? v.toFixed(2) : '–');
</script>

<style scoped>
.net-table { display: flex; flex-direction: column; gap: 2px; font-family: var(--sv-font, sans-serif); font-size: 0.78rem; }
.nt-section-head {
    display: flex; align-items: center; gap: 6px; padding: 6px 8px 4px;
    color: #5d7f99; text-transform: uppercase; font-size: 0.7rem; letter-spacing: .6px; font-weight: 600;
}
.nt-count { background: #1e1e2c; color: #a3e635; border-radius: 9px; padding: 0 6px; font-size: 0.68rem; }
.nt-rows { display: flex; flex-direction: column; }
.nt-row {
    display: grid; grid-template-columns: 10px 1fr auto auto 20px; align-items: center; gap: 7px;
    padding: 5px 8px; cursor: pointer; border-bottom: 1px solid #ffffff08;
}
.nt-row:hover { background: #ffffff0a; }
.nt-row.selected { background: rgba(163,230,53,.12); box-shadow: inset 2px 0 0 #a3e635; }
.nt-dot { width: 9px; height: 9px; border-radius: 50%; }
.nt-id { font-family: monospace; color: #bdc3c7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nt-role { color: #8b5cf6; font-size: 0.72rem; }
.nt-info { color: #7f8c8d; font-size: 0.72rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
.nt-del { background: none; border: none; color: #e74c3c; font-size: 0.95rem; line-height: 1; cursor: pointer; opacity: 0; }
.nt-row:hover .nt-del { opacity: 1; }
.nt-empty { padding: 8px; color: #5d7f99; font-style: italic; text-align: center; }
</style>
