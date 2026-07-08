<template>
  <div
    v-if="stats"
    class="overlay-stats"
    :class="{ collapsed: !panelVisible }"
    @mouseenter="onPanelEnter"
    @mouseleave="onPanelLeave"
  >
    <div class="stats-title-row">
      <div class="stats-title">Terrain Statistics</div>
      <span v-if="!panelVisible" class="collapse-dots">···</span>
    </div>

    <div v-show="panelVisible">
      <div class="stat-row"><span>Grid:</span> <span>{{ stats.cols }} x {{ stats.rows }}</span></div>
      <div class="stat-row"><span>Resolution:</span> <span>~{{ stats.cellsize.toFixed(2) }}m</span></div>
      <div class="stat-row"><span>Min Z:</span> <span class="val-min">{{ stats.minZ.toFixed(2) }}m</span></div>
      <div class="stat-row"><span>Max Z:</span> <span class="val-max">{{ stats.maxZ.toFixed(2) }}m</span></div>
    </div>
  </div>
</template>

<script setup>
import { useCollapsiblePanel } from '../../composables/editor/useCollapsiblePanel.js';

defineProps({
  stats: { type: Object, default: null },
});

// Reines Info-Panel → per Hover einklappbar (analog ShovelTool), kein forceOpen.
const { onPanelEnter, onPanelLeave, panelVisible } = useCollapsiblePanel();
</script>

<style scoped>
.overlay-stats {
    position: absolute;
    bottom: 1.5rem;
    left: 1.5rem;
    background: var(--sv-surface);
    color: var(--sv-text);
    font-family: var(--sv-font);
    padding: 15px;
    border-radius: 8px;
    border: 1px solid var(--sv-border);
    font-size: 0.85rem;
    pointer-events: auto;
    backdrop-filter: blur(8px);
    width: 250px;
    box-shadow: var(--sv-glow-violet);
    z-index: 100;
}
.stats-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    border-bottom: 1px solid var(--sv-border);
    padding-bottom: 5px;
    cursor: default;
    user-select: none;
}
.stats-title { font-weight: bold; color: var(--sv-text-violet); text-shadow: var(--sv-glow-violet); }
.collapse-dots { margin-left: auto; opacity: 0.45; letter-spacing: 2px; font-size: 0.8rem; }

/* Eingeklappt: kompakte Pille, nur der Titel bleibt sichtbar (Hover klappt aus). */
.overlay-stats.collapsed { width: auto; padding: 8px 14px; }
.overlay-stats.collapsed .stats-title-row { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }

.stat-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
.val-min { color: var(--sv-text-violet); font-weight: bold; }
.val-max { color: var(--sv-text-lime); font-weight: bold; }
</style>
