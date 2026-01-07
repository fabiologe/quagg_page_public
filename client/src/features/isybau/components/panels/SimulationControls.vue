<template>
  <div class="sidebar-content">
    
    <!-- Project Card -->
    <div class="control-box project-card" v-if="store.network">
        <h3>📁 Projekt Details</h3>
        <div class="meta-item">
            <span class="label">Datei:</span>
            <span class="value" :title="store.metadata.fileName || 'Unbenannt'">
                {{ store.metadata.fileName || 'Projekt' }}
            </span>
        </div>
        <div class="meta-row">
             <div class="meta-item">
                <span class="label">Version:</span>
                <span class="value">{{ store.metadata.version || '-' }}</span>
             </div>
             <div class="meta-item">
                <span class="label">Datum:</span>
                <span class="value">{{ store.metadata.created || '-' }}</span>
             </div>
        </div>
    </div>

    <!-- Compact Stats -->
    <div class="control-box stats-compact">
         <div class="stats-row">
            <span><strong>{{ store.nodes.size }}</strong> Knoten</span>
            <span class="divider">•</span>
            <span><strong>{{ store.edges.size }}</strong> Haltungen</span>
            <span class="divider">•</span>
            <span><strong>{{ store.areas.length }}</strong> Flächen</span>
         </div>
    </div>


    <!-- Simulation Control -->
    <div class="control-box">
        <h3>Simulation</h3>
        
        <div class="control-group">
            <label>Regendaten</label>
            <div class="button-row">
                <button class="secondary-btn" @click="store.ui.showRainModal = true">Modellregen</button>
                <button class="secondary-btn" @click="store.ui.showKostraModal = true">KOSTRA</button>
            </div>
            
            <!-- Rain Status & Chart -->
            <div class="rain-status">
                <div v-if="store.rain.activeModelRain" class="rain-info">
                    <strong>Modellregen:</strong> {{ store.rain.activeModelRain.type }} 
                    ({{ store.rain.activeModelRain.series.length }} Stützstellen)
                </div>
                <div v-else class="rain-info">
                   <strong>KOSTRA:</strong> {{ store.rain.intensity }} l/(s·ha)
                </div>
            </div>

            <!-- Mini Chart -->
            <div v-if="store.rain.activeModelRain" class="mini-chart-container">
               <Bar :data="miniChartData" :options="miniChartOptions" />
            </div>

            <button class="secondary-btn" @click="store.ui.showPreprocessingModal = true" style="margin-top: 0.5rem; width: 100%;">
                Daten bearbeiten
            </button>
            
            <!-- Runoff Validation Button (Restored) -->
            <button class="secondary-btn" @click="store.ui.showValidationModal = true" style="margin-top: 0.5rem; width: 100%;">
               ✅ Abfluss validieren
            </button>
        </div>

        <div class="control-group">
            <label>Simulationsdauer (h)</label>
            <div class="input-with-action">
                <input type="number" v-model.number="store.rain.duration" min="1" max="48" step="1">
            </div>
        </div>
        
        <button @click="startSimulation" class="primary-btn" :disabled="loading">
            <span v-if="loading" class="spinner">⏳</span>
            {{ loading ? 'Simulation läuft...' : 'Berechnung starten' }}
        </button>
        <div v-if="loading" class="progress-bar-container">
            <div class="progress-bar-fill"></div>
        </div>
        
        <div v-if="error" class="error-msg">{{ error }}</div>
        <div v-if="success" class="success-msg">✓ Netz berechnet</div>

        <!-- Actions for results -->
        <div v-if="success" class="results-actions">
            <button class="action-btn" @click="store.ui.showResultsModal = true">
                📊 Ergebnisse anzeigen
            </button>
            <button class="action-btn" @click="store.ui.showDebugModal = true">
                🔍 Debug (.inp / .rpt)
            </button>
            <div class="button-row">
                <button class="secondary-btn" @click="downloadInput">
                    💾 Input (.inp)
                </button>
                <button class="secondary-btn" @click="downloadResults">
                    💾 Result (.json)
                </button>
            </div>
        </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useIsybauStore } from '../../store/index.js';
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const store = useIsybauStore();
const startSimulation = async () => {
    await store.runSimulation();
};

const loading = computed(() => store.simulation.status === 'running');
const error = computed(() => store.simulation.error);
const success = computed(() => store.simulation.status === 'success');

// Chart Logic
const miniChartData = computed(() => {
  if (!store.rain.activeModelRain) return null;
  const series = store.rain.activeModelRain.series;
  const interval = store.rain.activeModelRain.metadata?.interval || 5;
  
  return {
    labels: series.map(s => s.time),
    datasets: [{
      label: 'Regen',
      // Convert Intensity to Height (mm) if needed, or show raw
      data: series.map(s => s.height_mm !== undefined ? s.height_mm : (s.intensity * interval * 0.006)),
      backgroundColor: '#3498db',
      barThickness: 3
    }]
  };
});

const miniChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { enabled: true }
  },
  scales: {
    x: { display: false },
    y: { 
      display: true,
      ticks: { font: { size: 8 } }
    }
  }
};

// Download Helpers
const downloadFile = (filename, content) => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

const downloadInput = () => {
    if (store.simulation.results?.input) {
         const blob = new Blob([store.simulation.results.input], { type: 'text/plain' });
         const url = URL.createObjectURL(blob);
         const a = document.createElement('a');
         a.href = url;
         a.download = `simulation_input_${new Date().toISOString().slice(0,10)}.inp`;
         document.body.appendChild(a);
         a.click();
         document.body.removeChild(a); 
    }
};

const downloadResults = () => {
    if (store.simulation.results) {
        downloadFile(`simulation_results_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(store.simulation.results, null, 2));
    }
};
</script>

<style scoped>
.sidebar-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}
.control-box {
  background: white;
  padding: 1rem;
  border-radius: 6px;
  border: 1px solid #ddd;
}
.control-box h3 {
    margin-top: 0;
    margin-bottom: 0.75rem;
    font-size: 1rem;
    color: #2c3e50;
    border-bottom: 1px solid #eee;
    padding-bottom: 0.5rem;
}

/* Compact Stats */
.stats-compact {
    padding: 0.75rem 1rem;
    text-align: center;
    background: #f8f9fa; /* Slightly different bg to distinguish */
}
.stats-row {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: #555;
    align-items: center;
}
.stats-row strong {
    color: #2c3e50;
    font-weight: 600;
}
.divider {
    color: #ccc;
}


/* Meta Info */
.meta-item { display: flex; flex-direction: column; margin-bottom: 0.5rem; }
.meta-row { display: flex; justify-content: space-between; gap: 0.5rem; }
.label { font-size: 0.75rem; color: #7f8c8d; font-weight: bold; }
.value { font-size: 0.9rem; color: #34495e; overflow: hidden; text-overflow: ellipsis; }

/* Buttons & Inputs */
.primary-btn {
  width: 100%;
  padding: 0.75rem;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-top: 0.5rem;
}
.primary-btn:disabled { background: #95a5a6; }
.secondary-btn {
    flex: 1;
    padding: 0.5rem;
    background: #ecf0f1;
    border: 1px solid #bdc3c7;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
    text-align: center;
}
.secondary-btn:hover { background: #bdc3c7; }

.error-msg { color: red; margin-top: 0.5rem; }
.success-msg { color: green; margin-top: 0.5rem; font-weight: bold; }
.input-with-action input { width: 100%; padding: 0.5rem; border: 1px solid #bdc3c7; border-radius: 4px; }
.button-row { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }

/* Rain Chart */
.mini-chart-container {
    height: 80px;
    margin: 0.5rem 0;
    border: 1px solid #eee;
    background: #fcfcfc;
    border-radius: 4px;
    padding: 2px;
}
.rain-status {
    font-size: 0.8rem;
    color: #555;
    margin-bottom: 0.5rem; 
    padding: 0.25rem;
    background: #f8f9fa;
    border-radius: 4px;
}

.results-actions {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    border-top: 1px solid #eee;
    padding-top: 1rem;
}
.action-btn {
    width: 100%;
    padding: 0.6rem;
    background: #f39c12;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
.action-btn:hover { background: #e67e22; }

.progress-bar-container {
    width: 100%;
    height: 6px;
    background: #f0f0f0;
    margin-top: 4px;
    border-radius: 3px;
    overflow: hidden;
}
.progress-bar-fill {
    height: 100%;
    background: repeating-linear-gradient(
        45deg,
        #3498db,
        #3498db 10px,
        #2980b9 10px,
        #2980b9 20px
    );
    width: 100%;
    animation: progress-slide 1s linear infinite;
}
@keyframes progress-slide {
    0% { background-position: 0 0; }
    100% { background-position: 28px 0; } /* Matches roughly the pattern size */
}
.spinner {
    display: inline-block;
    animation: spin 2s linear infinite;
    margin-right: 5px;
}
@keyframes spin { 100% { transform: rotate(360deg); } }
</style>
