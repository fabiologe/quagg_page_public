<template>
  <div class="tool-ui-panel boundary-panel" :class="{ 'review': isReview }">
      <div class="panel-header">Boundary Tool</div>

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
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    toolInstance: { type: Object, required: true }
});

const state = computed(() => props.toolInstance?.state?.value ?? 'IDLE');
const isReview = computed(() => state.value === 'REVIEW');
const isDrawing = computed(() => state.value === 'DRAWING');

const pointCount = computed(() => {
    return props.toolInstance && props.toolInstance.getPoints ? props.toolInstance.getPoints().length : 0;
});
const segmentCount = computed(() => Math.max(0, pointCount.value - 1));
</script>

<style scoped>
.tool-ui-panel {
    position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: rgba(46, 204, 113, 0.95); /* Green for Boundary */
    color: white;
    padding: 12px 18px; border-radius: 8px;
    backdrop-filter: blur(4px); pointer-events: auto;
    text-align: center;
    min-width: 220px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}
.tool-ui-panel.review {
    background: rgba(155, 89, 182, 0.96); /* Lila für Review (passt zu den Vorschauzellen) */
}
.panel-header {
    font-weight: 700; margin-bottom: 8px; color: #fff;
    border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 6px;
    text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.85rem;
}
.hint { font-size: 0.9rem; font-weight: 500; margin-bottom: 4px; }
.sub-hint { font-size: 0.75rem; color: #e8f8f5; line-height: 1.4; }

.btn-group { display: flex; gap: 8px; margin-top: 10px; }
.btn-confirm, .btn-cancel {
    flex: 1; padding: 7px 10px; border: none; border-radius: 5px;
    font-size: 0.82rem; font-weight: 700; cursor: pointer; color: #fff;
    transition: filter 0.15s;
}
.btn-confirm { background: #27ae60; }
.btn-cancel  { background: #c0392b; }
.btn-confirm:hover, .btn-cancel:hover { filter: brightness(1.12); }
</style>
