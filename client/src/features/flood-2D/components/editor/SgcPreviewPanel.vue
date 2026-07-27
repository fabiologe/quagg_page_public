<template>
  <div
    v-if="channelCount > 0"
    class="sgc-preview-panel"
    :class="{ collapsed: !panelVisible }"
    @mouseenter="onPanelEnter"
    @mouseleave="onPanelLeave"
  >
    <div class="sgc-title-row">
      <div class="sgc-title">SGC-Vorschau</div>
      <span v-if="!panelVisible" class="collapse-dots">···</span>
    </div>

    <div v-show="panelVisible">
      <label class="sgc-toggle-row">
        <input type="checkbox" :checked="visible" @change="$emit('update:visible', $event.target.checked)" />
        Im Terrain anzeigen
      </label>

      <div class="sgc-stat-row"><span>Kanäle:</span> <span>{{ channelCount }}</span></div>
      <div class="sgc-stat-row"><span>Gerinnezellen:</span> <span>{{ cellCount }}</span></div>

      <div class="sgc-legend">
        <div class="legend-row"><span class="swatch open"></span> offene Gerinnezelle</div>
        <div class="legend-row"><span class="swatch blocked"></span> Pfeiler-Sperre (Breite 0)</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useCollapsiblePanel } from '../../composables/editor/useCollapsiblePanel.js';

defineProps({
  visible: { type: Boolean, default: true },
  channelCount: { type: Number, default: 0 },
  cellCount: { type: Number, default: 0 },
});
defineEmits(['update:visible']);

// Reines Info-/Steuer-Panel → per Hover einklappbar (analog TerrainStatics), kein forceOpen.
const { onPanelEnter, onPanelLeave, panelVisible } = useCollapsiblePanel();
</script>

<style scoped>
.sgc-preview-panel {
    position: absolute;
    top: 6rem;
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
    width: 220px;
    box-shadow: var(--sv-glow-violet);
    z-index: 100;
}
.sgc-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--sv-border);
    padding-bottom: 5px;
    cursor: default;
    user-select: none;
}
.sgc-title { font-weight: bold; color: var(--sv-text-lime); text-shadow: var(--sv-glow-lime); }
.collapse-dots { margin-left: auto; opacity: 0.45; letter-spacing: 2px; font-size: 0.8rem; }

.sgc-preview-panel.collapsed { width: auto; padding: 8px 14px; }
.sgc-preview-panel.collapsed .sgc-title-row { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }

.sgc-toggle-row {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 10px;
    cursor: pointer;
}
.sgc-toggle-row input { accent-color: var(--sv-violet); cursor: pointer; }

.sgc-stat-row { display: flex; justify-content: space-between; margin-bottom: 6px; }

.sgc-legend { margin-top: 10px; border-top: 1px solid var(--sv-border); padding-top: 8px; }
.legend-row { display: flex; align-items: center; gap: 7px; font-size: 0.76rem; color: var(--sv-text-dim); margin-bottom: 5px; }
.swatch { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
.swatch.open { background: #00bcd4; }
.swatch.blocked { background: #ff3b30; }
</style>
