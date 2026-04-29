<template>
  <div class="compass-rose" :style="{ transform: `rotate(${angle}deg)` }" title="North">
    <div class="compass-arrow"></div>
    <div class="compass-label">N</div>
  </div>
</template>

<script setup>
defineProps({
  angle: {
    type: Number,
    default: 0
  }
});
</script>

<style scoped>
.compass-rose {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  position: relative;
  /* Will-change helps with smooth transform animations */
  will-change: transform;
  border: 1px solid #e2e8f0;
}

.compass-arrow {
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 10px solid #ef4444; /* App red for North */
  margin-top: 5px;
}

.compass-label {
  font-size: 11px;
  font-weight: 800;
  color: #334155;
  margin-top: 1px;
  font-family: inherit;
}
</style>
