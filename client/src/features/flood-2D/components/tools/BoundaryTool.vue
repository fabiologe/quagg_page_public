<template>
  <div
    class="tool-ui-panel boundary-panel"
    :class="{ 'review': isReview, collapsed: !panelVisible }"
    @mouseenter="onPanelEnter"
    @mouseleave="onPanelLeave"
  >
      <div class="panel-header">
        Boundary Tool
        <span v-if="!panelVisible" class="collapse-dots">···</span>
      </div>

      <div v-show="panelVisible">
        <!-- Zulauf/Ablauf-Modus — Ablauf schaltet intern auf den Randzellen-Picker um (nur
             echte Rand-/Geländekanten-Zellen anklickbar), Zulauf bleibt die Polylinie. -->
        <div class="mode-toggle-row">
            <button :class="{ active: mode === 'INFLOW' }" @click="toolInstance.setMode('INFLOW')">💧 Zulauf</button>
            <button :class="{ active: mode === 'OUTFLOW' }" @click="toolInstance.setMode('OUTFLOW')">↘️ Ablauf</button>
        </div>

        <!-- REVIEW: Bestätigen oder Verwerfen -->
        <div v-if="isReview" class="panel-content">
            <div class="hint">{{ isOutflow ? 'Randzellen übernehmen?' : 'Randlinie übernehmen?' }}</div>
            <div class="sub-hint" v-if="isOutflow">{{ pointCount }} Zelle(n) markiert</div>
            <div class="sub-hint" v-else>{{ pointCount }} Punkte · {{ segmentCount }} Segment(e)</div>
            <div class="btn-group">
                <button class="btn-confirm" @click="toolInstance.commit()">✔ Übernehmen</button>
                <button class="btn-cancel"  @click="toolInstance.cancel()">✖ Verwerfen</button>
            </div>
        </div>

        <!-- DRAWING: aktiv am Zeichnen/Klicken -->
        <div v-else-if="isDrawing" class="panel-content">
            <div class="hint">{{ pointCount }} {{ isOutflow ? 'Zelle(n) markiert' : 'Punkt(e)' }}</div>
            <div class="sub-hint" v-if="isOutflow">
              <strong>Doppelklick / Enter</strong> = fertig<br>
              <strong>Backspace</strong> letzte Zelle zurück · <strong>Esc</strong> abbrechen
            </div>
            <div class="sub-hint" v-else>
              <strong>Doppelklick / Enter</strong> zum Abschließen<br>
              <strong>Backspace</strong> letzter Punkt zurück · <strong>Esc</strong> abbrechen
            </div>
        </div>

        <!-- IDLE: bereit -->
        <div v-else class="panel-content">
            <div class="hint">{{ isOutflow ? 'Randzellen anklicken oder entlang ziehen' : 'Ersten Punkt klicken' }}</div>
            <div class="sub-hint">{{ isOutflow ? 'Nur echte Rand-/Geländekanten-Zellen sind wählbar (leuchten orange auf).' : 'Snappt auf Rasterzellen.' }}</div>
        </div>
      </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useCollapsiblePanel } from '../../composables/editor/useCollapsiblePanel.js';

const props = defineProps({
    toolInstance: { type: Object, required: true }
});

const state = computed(() => props.toolInstance?.state?.value ?? 'IDLE');
const isReview = computed(() => state.value === 'REVIEW');
const isDrawing = computed(() => state.value === 'DRAWING');

const mode = computed(() => props.toolInstance?.mode?.value ?? 'INFLOW');
const isOutflow = computed(() => mode.value === 'OUTFLOW'); // Ablauf = Randzellen-Picker statt Polylinie

// Panel per Hover einklappbar (analog ShovelTool); die Review-Bestätigung bleibt offen.
const { onPanelEnter, onPanelLeave, panelVisible } =
  useCollapsiblePanel({ forceOpen: isReview });

const pointCount = computed(() => {
    if (isOutflow.value) return props.toolInstance?.pointCount?.value ?? 0;
    return props.toolInstance && props.toolInstance.getPoints ? props.toolInstance.getPoints().length : 0;
});
const segmentCount = computed(() => Math.max(0, pointCount.value - 1));
</script>

<style scoped>
/* Chrome kommt GLOBAL aus styles/tool-panel.css (Vorlage WeirTool) —
   hier nur der Review-Akzent (Rahmen wechselt auf Lime wie die Vorschauzellen). */
.tool-ui-panel.review { border-color: var(--sv-lime, #a3e635); }

.btn-group { display: flex; gap: 8px; margin-top: 10px; }
.btn-confirm, .btn-cancel {
    flex: 1; padding: 8px; border: none; border-radius: 5px;
    font-size: 0.88rem; font-weight: 700; cursor: pointer;
    transition: all 0.2s; font-family: inherit;
}
.btn-confirm { background: var(--sv-lime, #a3e635); color: #12121a; }
.btn-confirm:hover { background: #b6f04d; }
.btn-cancel  { background: #3a2f5c; color: #fff; }
.btn-cancel:hover { background: #5d7a91; }

.mode-toggle-row { display: flex; gap: 6px; margin-bottom: 10px; }
.mode-toggle-row button {
    flex: 1; padding: 6px 4px; border: 1px solid #4a6278; border-radius: 5px;
    background: #1e3348; color: #bdc3c7; font-size: 0.78rem; font-weight: 600;
    cursor: pointer; transition: all 0.15s; font-family: inherit;
}
.mode-toggle-row button:hover { background: #2471a3; color: #fff; }
.mode-toggle-row button.active { background: #6d43d4; border-color: var(--sv-lime, #a3e635); color: #fff; }
</style>
