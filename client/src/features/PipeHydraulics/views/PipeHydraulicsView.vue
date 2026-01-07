<template>
  <div class="hydraulics-view">
    
    <div class="view-header">
       <h1>Hydraulik Rechner</h1>
       <div class="view-actions">
          <button class="btn btn-secondary" @click="$router.push('/tools')">Schließen</button>
       </div>
    </div>

    <div class="content-container">
      
      <!-- Top Input Section -->
      <section class="section-inputs">
         <InputPanel />
      </section>

      <!-- Bottom Split Section -->
      <section class="section-results">
         <div class="results-left">
            <ResultsPanel />
         </div>
         <div class="results-right">
            <HydraulicCurves />
         </div>
      </section>

    </div>

  </div>
</template>

<script setup>
import InputPanel from '../components/InputPanel.vue'
import ResultsPanel from '../components/ResultsPanel.vue'
import HydraulicCurves from '../components/HydraulicCurves.vue'
</script>

<style scoped>
.hydraulics-view {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
  font-family: 'Inter', sans-serif;
  color: #2c3e50;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.view-header h1 {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 0;
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  background: #eee;
  color: #555;
}
.btn:hover { background: #e0e0e0; }

.section-inputs {
  margin-bottom: 2rem;
}

.section-results {
  display: flex;
  gap: 2rem;
  align-items: stretch;
}

.results-left {
  flex: 1;
  min-width: 350px;
  max-width: 450px;
}

.results-right {
  flex: 2;
  min-width: 400px;
}

/* Response Layout */
@media (max-width: 1024px) {
  .section-results {
    flex-direction: column;
  }
  .results-left, .results-right {
    width: 100%;
    max-width: none;
  }
}
</style>
