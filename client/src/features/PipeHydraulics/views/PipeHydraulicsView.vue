<template>
  <div class="hydraulics-view">

    <div class="view-header">
      <h1>Hydraulik Rechner</h1>
      <div class="view-actions">
        <button class="btn btn-secondary" @click="$router.push('/tools')">Schließen</button>
      </div>
    </div>

    <!-- Tab Navigation -->
    <div class="tab-nav">
      <button :class="['tab-btn', { active: activeTab === 'pipe' }]" @click="activeTab = 'pipe'">
        Rohr &amp; Kanal
      </button>
      <button :class="['tab-btn', { active: activeTab === 'bridge' }]" @click="activeTab = 'bridge'">
        Brückenhydraulik
      </button>
    </div>

    <!-- Rohrhydraulik -->
    <div v-show="activeTab === 'pipe'" class="content-container">
      <section class="section-inputs">
        <InputPanel />
      </section>
      <section class="section-results">
        <div class="results-left">
          <ResultsPanel />
        </div>
        <div class="results-right">
          <HydraulicCurves />
        </div>
      </section>
    </div>

    <!-- Brückenhydraulik (Zwei-Zonen-Modell) -->
    <div v-show="activeTab === 'bridge'" class="content-container bridge-layout">
      <section class="bridge-inputs">
        <BridgeInputPanel />
      </section>
      <section class="bridge-main">
        <div class="bridge-editor">
          <BridgeProfileEditor />
        </div>
        <div class="bridge-results">
          <BridgeResultsPanel />
        </div>
      </section>
    </div>

  </div>
</template>

<script setup>
import { ref } from 'vue'
import InputPanel from '../components/InputPanel.vue'
import ResultsPanel from '../components/ResultsPanel.vue'
import HydraulicCurves from '../components/HydraulicCurves.vue'
import BridgeInputPanel from '../components/BridgeInputPanel.vue'
import BridgeProfileEditor from '../components/BridgeProfileEditor.vue'
import BridgeResultsPanel from '../components/BridgeResultsPanel.vue'

const activeTab = ref('pipe')
</script>

<style scoped>
.hydraulics-view {
  max-width: 1600px;
  margin: 0 auto;
  padding: 2rem;
  font-family: 'Inter', sans-serif;
  color: #2c3e50;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.2rem;
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

/* Tab Navigation */
.tab-nav {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 0;
}

.tab-btn {
  padding: 0.5rem 1.2rem;
  border: none;
  background: none;
  font-size: 0.92rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  border-radius: 8px 8px 0 0;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
  transition: all 0.15s;
}
.tab-btn:hover { color: #1e293b; background: #f8fafc; }
.tab-btn.active {
  color: #1d4ed8;
  border-bottom-color: #1d4ed8;
  background: #f0f7ff;
}

/* Rohrhydraulik Layout */
.section-inputs { margin-bottom: 2rem; }

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

/* Brückenhydraulik Layout */
.bridge-layout {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.bridge-inputs {
  width: 100%;
}

.bridge-main {
  display: flex;
  gap: 1.4rem;
  align-items: flex-start;
}

.bridge-editor {
  flex: 3;
  min-width: 420px;
}

.bridge-results {
  flex: 2;
  min-width: 380px;
}

/* Responsive */
@media (max-width: 1100px) {
  .section-results,
  .bridge-main {
    flex-direction: column;
  }
  .results-left,
  .results-right,
  .bridge-editor,
  .bridge-results {
    width: 100%;
    max-width: none;
    min-width: unset;
  }
}
</style>
