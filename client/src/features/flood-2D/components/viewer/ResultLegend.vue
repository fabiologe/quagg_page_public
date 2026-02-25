<template>
  <div class="result-legend">
    <div class="legend-title">Wassertiefe (m)</div>
    <div class="legend-gradient"></div>
    <div class="legend-ticks">
      <span>0</span>
      <span>{{ (maxDepth * 0.25).toFixed(2) }}</span>
      <span>{{ (maxDepth * 0.5).toFixed(2) }}</span>
      <span>{{ (maxDepth * 0.75).toFixed(2) }}</span>
      <span>{{ maxDepth.toFixed(2) }}</span>
    </div>
  </div>
</template>

<script setup>
defineProps({
  maxDepth: { type: Number, default: 1.0 }
});
</script>

<style scoped>
.result-legend {
  background: rgba(15, 15, 30, 0.88);
  backdrop-filter: blur(12px);
  border-radius: 10px;
  padding: 12px 14px;
  min-width: 48px;
  border: 1px solid rgba(79, 195, 247, 0.15);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.legend-title {
  font-size: 0.7rem;
  color: #90a4ae;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  text-align: center;
}

.legend-gradient {
  width: 20px;
  height: 160px;
  margin: 0 auto;
  border-radius: 4px;
  background: linear-gradient(
    to top,
    rgba(0, 255, 255, 0.3),    /* 0.0 — transparent cyan (shallow) */
    rgba(0, 200, 255, 0.6),    /* 0.25 */
    rgba(0, 120, 215, 0.75),   /* 0.50 — medium blue */
    rgba(0, 60, 180, 0.85),    /* 0.75 */
    rgba(0, 0, 139, 0.95)      /* 1.0 — deep navy (deep) */
  );
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.legend-ticks {
  display: flex;
  flex-direction: column-reverse;
  justify-content: space-between;
  height: 160px;
  margin-top: -160px;
  margin-left: 30px;
  pointer-events: none;
}

.legend-ticks span {
  font-size: 0.65rem;
  color: #b0bec5;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
</style>
