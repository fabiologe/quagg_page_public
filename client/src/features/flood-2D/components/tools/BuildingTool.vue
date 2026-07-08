<template>
  <div
    class="tool-ui-panel building-panel"
    :class="{ collapsed: !panelVisible }"
    @mouseenter="onPanelEnter"
    @mouseleave="onPanelLeave"
  >
      <div class="panel-header">
        Building Tool
        <span v-if="!panelVisible" class="collapse-dots">···</span>
      </div>
      <div class="panel-content" v-show="panelVisible">
          <div class="hint" v-if="pointCount === 0">Click to start drawing building footprint</div>
          <div class="hint" v-else>Points: {{ pointCount }}</div>

          <div class="sub-hint">
             Double-click or click start to close.<br>
             Right-click to cancel.
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

const pointCount = computed(() => {
    return props.toolInstance && props.toolInstance.getPoints ? props.toolInstance.getPoints().length : 0;
});

// Panel per Hover einklappbar (analog ShovelTool).
const { onPanelEnter, onPanelLeave, panelVisible } = useCollapsiblePanel();
</script>

<style scoped>
.tool-ui-panel {
    position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: rgba(44, 62, 80, 0.95); color: white;
    padding: 12px 18px; border-radius: 8px;
    backdrop-filter: blur(4px); pointer-events: auto;
    text-align: center;
    min-width: 220px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}
.panel-header {
    font-weight: 700; margin-bottom: 8px; color: #fff;
    border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 6px;
    text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.85rem;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    cursor: default; user-select: none;
}
.collapse-dots { margin-left: auto; opacity: 0.45; letter-spacing: 2px; font-size: 0.8rem; }

/* Eingeklappt: kompakte Pille, nur der Header bleibt sichtbar (Hover klappt aus). */
.tool-ui-panel.building-panel.collapsed { min-width: unset; padding: 8px 16px; }
.building-panel.collapsed .panel-header { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
.hint { font-size: 0.9rem; font-weight: 500; margin-bottom: 4px; }
.sub-hint { font-size: 0.75rem; color: #bdc3c7; line-height: 1.4; }
</style>
