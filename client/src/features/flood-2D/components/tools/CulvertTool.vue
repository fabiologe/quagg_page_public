<template>
  <div class="tool-ui-panel culvert-panel">
      <div class="panel-header">Culvert Tool</div>
      <div class="panel-content">
          <div class="hint" v-if="pointCount === 0">Draw Culvert footprint</div>
          <div class="hint" v-else>Points: {{ pointCount }}</div>
          
          <div class="sub-hint">
             Double-click or snap to start.<br>
             Defines flow passage geometry.
          </div>
      </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    toolInstance: { type: Object, required: true }
});

const pointCount = computed(() => {
    return props.toolInstance && props.toolInstance.getPoints ? props.toolInstance.getPoints().length : 0;
});
</script>

<style scoped>
.tool-ui-panel {
    position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: rgba(230, 126, 34, 0.95); /* Orange to distinguish from Blue/Gray */
    color: white;
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
}
.hint { font-size: 0.9rem; font-weight: 500; margin-bottom: 4px; }
.sub-hint { font-size: 0.75rem; color: #fcece4; line-height: 1.4; }
</style>
