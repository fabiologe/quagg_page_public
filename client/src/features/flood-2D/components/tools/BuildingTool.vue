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
/* Chrome kommt GLOBAL aus styles/tool-panel.css (Vorlage WeirTool). */
</style>
