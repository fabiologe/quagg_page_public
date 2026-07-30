<template>
  <div class="net-table">
    <!-- SCHÄCHTE -->
    <div class="nt-section-head">
      <SvIcon name="Schacht.png" :size="13" color="currentColor" /> Schächte <span class="nt-count">{{ net.nodes.length }}</span>
    </div>
    <div class="nt-rows">
      <div
        v-for="n in net.nodes" :key="n.id"
        class="nt-row" :class="{ selected: net.selectedId === n.id }"
        @click="net.select(n.id)"
      >
        <span class="nt-dot" :style="{ background: roleColor(n.role) }"></span>
        <span class="nt-id">{{ n.id }}</span>
        <span class="nt-role">{{ n.role }}</span>
        <span class="nt-info">▽{{ fmt(n.rim) }} / ⌄{{ fmt(n.invert) }}</span>
        <button class="nt-del" @click.stop="net.deleteNode(n.id)" title="Schacht löschen">×</button>
      </div>
      <div v-if="net.nodes.length === 0" class="nt-empty">Keine Schächte.</div>
    </div>

    <!-- HALTUNGEN -->
    <div class="nt-section-head">
      <SvIcon name="Haltung.png" :size="13" color="currentColor" /> Haltungen <span class="nt-count">{{ net.links.length }}</span>
    </div>
    <div class="nt-rows">
      <div
        v-for="l in net.links" :key="l.id"
        class="nt-row" :class="{ selected: net.selectedId === l.id }"
        @click="net.select(l.id)"
      >
        <span class="nt-dot" :style="{ background: l.conveyance === 'open' ? '#06b6d4' : '#94a3b8' }"></span>
        <span class="nt-id">{{ l.id }}</span>
        <span class="nt-role">{{ l.conveyance === 'open' ? 'Gerinne' : 'Rohr' }}</span>
        <span class="nt-info">{{ l.fromNodeId || '–' }}→<wbr>{{ l.toNodeId || '–' }}</span>
        <button class="nt-del" @click.stop="net.deleteLink(l.id)" title="Haltung löschen">×</button>
      </div>
      <div v-if="net.links.length === 0" class="nt-empty">Keine Haltungen.</div>
    </div>

    <!-- VORFÜLLUNG: ein Wert, keine Tagesganglinien — Übersetzung in SWMM-Basisabfluss/
         Teilfüllung passiert beim Kopplungs-Export unter der Haube (prefill.js). -->
    <template v-if="net.hasNetwork">
      <div class="nt-section-head">
        <SvEmoji emoji="💧" :size="13" /> Vorfüllung
        <span class="nt-count">{{ net.prefillPercent }} %</span>
      </div>
      <div class="nt-prefill">
        <input type="range" min="0" max="80" step="5" :value="net.prefillPercent"
               @input="net.prefillPercent = Number($event.target.value)" />
        <div class="nt-prefill-hint">
          Netz-Auslastung vor dem Regen (Trockenwetter). 0 % = leeres Netz —
          Basisabfluss &amp; Anfangsfüllung werden automatisch berechnet.
        </div>
      </div>
    </template>

    <!-- NETZ-PRÜFUNG (NetworkModel.validate: Topologie + Hydraulik-Plausibilität) -->
    <template v-if="net.hasNetwork">
      <div class="nt-section-head">
        Prüfung
        <span class="nt-count" :style="issues.length ? 'color:#ff7043' : ''">{{ issues.length }}</span>
      </div>
      <IssueList :issues="issues" dense showCounts clickable maxHeight="22vh"
                 emptyText="Netz plausibel ✓" @select="onIssueClick" />
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import SvEmoji from '../common/SvEmoji.vue';
import SvIcon from '../common/SvIcon.vue';
import IssueList from '../common/IssueList.vue';
import { useNetworkStore } from '@/features/flood-2D/stores/useNetworkStore.js';

const net = useNetworkStore();

// Live-Validierung: baut bei jeder Netz-Änderung das Modell und prüft es
// (Sohle>Deckel, Gegengefälle, Nullängen, isolierte Knoten, Teilnetz ohne Auslass,
// Sonderbauwerk ohne abgehende Haltung). IssueList erwartet {severity, message}.
const issues = computed(() => {
  void net.nodes.length; void net.links.length; // Reaktivitäts-Anker
  try {
    return net.toModel().validate().map(i => ({ severity: i.level, message: i.msg, code: i.id, hint: i.hint }));
  } catch { return []; }
});

// Klick auf eine Prüfungs-Meldung springt zum Verursacher: Element selektieren →
// Lime-Highlight in 3D + Tabelle, NetworkPropertyPanel öffnet sich darunter (dort ist
// die Lösung umsetzbar, z. B. Rolle=outfall beim Teilnetz ohne Auslass).
const onIssueClick = (it) => { if (it.code) net.select(it.code); };
const ROLE_COLOR = { manhole: '#3b82f6', inlet: '#22c55e', outfall: '#ef4444', storage: '#a855f7', junction: '#38bdf8' };
const roleColor = (r) => ROLE_COLOR[r] || '#64748b';
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
/* IDs ausgeschrieben (kein „…"): lange ISYBAU-Namen brechen um statt abzuschneiden. */
.nt-id { font-family: monospace; color: #bdc3c7; overflow-wrap: anywhere; }
.nt-role { color: #8b5cf6; font-size: 0.72rem; }
/* from→to der Haltungen: volle Schacht-Namen, Umbruch bevorzugt am <wbr> hinterm Pfeil. */
.nt-info { color: #7f8c8d; font-size: 0.72rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; max-width: 24ch; }
.nt-del { background: none; border: none; color: #e74c3c; font-size: 0.95rem; line-height: 1; cursor: pointer; opacity: 0; }
.nt-row:hover .nt-del { opacity: 1; }
.nt-empty { padding: 8px; color: #5d7f99; font-style: italic; text-align: center; }
.nt-prefill { padding: 2px 10px 6px; display: flex; flex-direction: column; gap: 4px; }
.nt-prefill input[type=range] { width: 100%; accent-color: var(--sv-lime, #a3e635); }
.nt-prefill-hint { color: #5d7f99; font-size: 0.68rem; line-height: 1.35; }
</style>
