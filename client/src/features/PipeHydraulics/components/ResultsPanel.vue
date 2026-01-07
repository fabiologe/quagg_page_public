<template>
  <div class="results-panel">
    
    <div class="panel-header">
       Resultate
    </div>

    <div class="results-content" v-if="results">
        
        <!-- Key Metrics Cards -->
        <div class="metric-row">
            <div class="metric-card primary">
                <span class="metric-label">Durchfluss (Q)</span>
                <span class="metric-value">{{ formatNumber(results.Q, 1) }} <small>l/s</small></span>
                <span class="metric-sub">Qvoll: {{ formatNumber(results.Q_full, 1) }}</span>
            </div>
            <div class="metric-card secondary">
                <span class="metric-label">Geschwindigkeit (v)</span>
                <span class="metric-value">{{ formatNumber(results.v, 2) }} <small>m/s</small></span>
                 <span class="metric-sub">vvoll: {{ formatNumber(results.v_full, 2) }}</span>
            </div>
        </div>

        <div class="details-list">
            <div class="detail-item">
                <span>Füllgrad</span>
                <strong>{{ (results.fillingRatio * 100).toFixed(1) }} %</strong>
            </div>
             <div class="detail-item">
                <span>Hydraulischer Radius</span>
                <strong>{{ formatNumber(results.rh, 3) }} m</strong>
            </div>
             <div class="detail-item">
                <span>Froude-Zahl</span>
                <strong :class="getFrClass(results.Fr)">{{ formatNumber(results.Fr, 2) }}</strong>
            </div>
        </div>

        <!-- Embedded Profile -->
        <div class="profile-embed">
             <PipeProfile 
                 :profileType="store.profileType"
                 :diameter="store.diameter"
                 :width="store.width"
                 :height="store.height"
                 :fillingHeight="store.fillingHeight"
               />
               <div class="profile-caption">Querschnittsansicht</div>
        </div>

    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { usePipeHydraulicsStore } from '../stores/usePipeHydraulicsStore'
import PipeProfile from './PipeProfile.vue'

const store = usePipeHydraulicsStore()
const results = computed(() => store.results)

const formatNumber = (val, digits) => {
    if (val === undefined || val === null) return '-'
    return val.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

const getFrClass = (fr) => {
    if (fr > 1) return 'text-danger'
    if (fr < 1) return 'text-success'
    return 'text-warning'
}
</script>

<style scoped>
.results-panel {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  display: flex;
  flex-direction: column;
  height: 100%;
}

.results-content {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.panel-header {
  font-weight: 700;
  color: #2c3e50;
  text-transform: uppercase;
  font-size: 0.85rem;
  border-bottom: 2px solid #f1f1f1;
  padding-bottom: 0.5rem;
  margin-bottom: 1.5rem;
}

.metric-row {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
}

.metric-card {
    flex: 1;
    background: #f8f9fa;
    padding: 1rem;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    text-align: center;
}

.metric-card.primary {
    background: #e3f2fd;
    color: #1565c0;
}

.metric-card.secondary {
    background: #e0f2f1;
    color: #00695c;
}

.metric-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    opacity: 0.8;
    margin-bottom: 0.25rem;
}

.metric-value {
    font-size: 1.4rem;
    font-weight: 800;
}

.metric-sub {
    font-size: 0.7rem;
    opacity: 0.6;
    margin-top: 0.25rem;
}

.details-list {
    font-size: 0.9rem;
    color: #34495e;
    border-top: 1px solid #f1f1f1;
    padding-top: 1rem;
    margin-bottom: 1rem;
}

.detail-item {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
}

.profile-embed {
    margin-top: auto;
    border: 1px dashed #ddd; /* Match user screenshot dashed border */
    border-radius: 8px;
    background: #fafafa;
    min-height: 250px; /* Force defined height */
    flex: 1; /* Fill remaining space */
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 1rem;
}

.profile-caption {
    position: absolute;
    bottom: 5px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.7rem;
    color: #999;
}

.text-success { color: #27ae60; }
.text-danger { color: #c0392b; }
.text-warning { color: #f39c12; }
</style>
