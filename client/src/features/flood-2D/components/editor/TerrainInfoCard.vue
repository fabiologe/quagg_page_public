<template>
  <div class="terrain-info-card" v-if="visible">
    <div class="card-header">
      <span class="icon">📍</span>
      <span class="title">Terrain Inspection</span>
      <button class="close-btn" @click="$emit('close')">×</button>
    </div>
    
    <div class="card-content">
      <div class="info-row">
        <label>X (East):</label>
        <span class="value">{{ x.toFixed(2) }}</span>
      </div>
      <div class="info-row">
        <label>Y (North):</label>
        <span class="value">{{ y.toFixed(2) }}</span>
      </div>
      
      <div class="h-divider"></div>
      
      <div class="info-row highlight">
        <label>Elevation (Z):</label>
        <span class="value">{{ z.toFixed(3) }} m</span>
      </div>
      
      <div class="info-row sub">
        <label>Grid Cell:</label>
        <span class="value">[{{ col }}, {{ row }}]</span>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  visible: Boolean,
  x: Number,
  y: Number,
  z: Number,
  col: Number,
  row: Number
});

defineEmits(['close']);
</script>

<style scoped>
.terrain-info-card {
  position: absolute;
  top: 80px; /* Below header */
  right: 20px;
  width: 240px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.15);
  font-family: sans-serif;
  z-index: 100;
  overflow: hidden;
  animation: slideIn 0.2s ease-out;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.card-header {
  background: #f8f9fa;
  padding: 10px 15px;
  border-bottom: 1px solid #eee;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-weight: 600;
  color: #333;
  font-size: 0.9rem;
  flex: 1;
  margin-left: 8px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  color: #999;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
.close-btn:hover { color: #555; }

.card-content {
  padding: 15px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 0.9rem;
  color: #555;
}

.info-row label {
  color: #888;
}

.info-row .value {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.h-divider {
  height: 1px;
  background: #eee;
  margin: 10px 0;
}

.highlight .value {
  color: #3498db;
  font-weight: 700;
  font-size: 1.1rem;
}

.sub {
  font-size: 0.8rem;
  margin-top: 10px;
}
</style>
