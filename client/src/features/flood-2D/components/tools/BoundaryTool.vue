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
        <!-- REVIEW: Bestätigen oder Verwerfen -->
        <div v-if="isReview" class="panel-content">
            <div class="hint">Randlinie übernehmen?</div>
            <div class="sub-hint">{{ pointCount }} Punkte · {{ segmentCount }} Segment(e)</div>
            <div class="btn-group">
                <button class="btn-confirm" @click="toolInstance.commit()">✔ Übernehmen</button>
                <button class="btn-cancel"  @click="toolInstance.cancel()">✖ Verwerfen</button>
            </div>
        </div>

        <!-- DRAWING: aktiv am Zeichnen -->
        <div v-else-if="isDrawing" class="panel-content">
            <div class="hint">{{ pointCount }} Punkt(e)</div>
            <div class="sub-hint">
              <strong>Doppelklick / Enter</strong> zum Abschließen<br>
              <strong>Backspace</strong> letzter Punkt zurück · <strong>Esc</strong> abbrechen
            </div>
        </div>

        <!-- IDLE: bereit -->
        <div v-else class="panel-content">
            <div class="hint">Ersten Punkt klicken</div>
            <div class="sub-hint">Snappt auf Rasterzellen.</div>
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

// Panel per Hover einklappbar (analog ShovelTool); die Review-Bestätigung bleibt offen.
const { onPanelEnter, onPanelLeave, panelVisible } =
  useCollapsiblePanel({ forceOpen: isReview });

const pointCount = computed(() => {
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
</style>
