<template>
  <div class="sidebar-content">
    
    <!-- Project Card -->
    <div class="control-box project-card" v-if="store.network">
        <h3><img class="ic" src="/saintv1d/icons/Content-Files-Folder-Open--Streamline-Pixel.svg" /> Projekt Details</h3>
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
            <span class="stat-item"><strong>{{ store.nodes.size }}</strong><span class="stat-label">Knoten</span></span>
            <span class="divider">•</span>
            <span class="stat-item"><strong>{{ store.edges.size }}</strong><span class="stat-label">Haltungen</span></span>
            <span class="divider">•</span>
            <span class="stat-item"><strong>{{ store.areas.length }}</strong><span class="stat-label">Flächen</span></span>
         </div>
    </div>


    <!-- Simulation Control -->
    <div class="control-box">
        <h3>Simulation</h3>
        
        <div class="control-group">
            <label>Regendaten</label>
            <div class="button-row" data-tutorial="rain-config">
                <button class="secondary-btn" @click="store.ui.showRainModal = true">
                    <img class="ic" src="/saintv1d/icons/Weather-Umbrella--Streamline-Pixel.svg" />
                    Modellregen
                </button>
                <button class="secondary-btn" @click="store.ui.showKostraModal = true">
                    <img class="ic" src="/saintv1d/icons/Map-Navigation-Compass-Direction--Streamline-Pixel.svg" />
                    KOSTRA
                </button>
            </div>

            <!-- Rain Status & Chart -->
            <div class="rain-status">
                <div v-if="store.rain.activeModelRain" class="rain-info">
                    <strong>Modellregen:</strong> {{ store.rain.activeModelRain.type }}
                    ({{ store.rain.activeModelRain.series.length }} Stützstellen)
                </div>
                <div v-else-if="store.rain.intensity > 0" class="rain-info">
                    <strong>KOSTRA:</strong> {{ store.rain.intensity }} l/(s·ha)
                </div>
                <div v-else class="rain-info rain-info-empty">
                    Kein Regen konfiguriert — Modellregen oder KOSTRA wählen.
                </div>
            </div>

            <!-- Mini Chart -->
            <div v-if="store.rain.activeModelRain" class="mini-chart-container">
                <Bar :data="miniChartData" :options="miniChartOptions" />
            </div>

            <button class="secondary-btn full" @click="store.ui.showPreprocessingModal = true">
                <img class="ic" src="/saintv1d/icons/Interface-Essential-Setting-Slide--Streamline-Pixel.svg" />
                Daten bearbeiten
            </button>

            <button class="secondary-btn full" @click="store.ui.showValidationModal = true">
                <img class="ic" src="/saintv1d/icons/Health-Brain-1--Streamline-Pixel.svg" />
                Abfluss validieren
            </button>
        </div>

        <div class="control-group">
            <label>Simulationsdauer (h)</label>
            <div class="input-with-action">
                <input type="number" v-model.number="store.rain.duration" min="1" max="48" step="1">
            </div>
        </div>

        <button @click="startSimulation" class="primary-btn" :disabled="loading" data-tutorial="run-simulation">
            <img v-if="!loading" class="ic" src="/saintv1d/icons/Computers-Devices-Electronics-Chipset--Streamline-Pixel.svg" />
            <img v-if="loading" class="ic spin" src="/saintv1d/icons/Interface-Essential-Synchronize-Arrows-Square-2--Streamline-Pixel.svg" />
            {{ loading ? 'Simulation läuft...' : 'Berechnung starten' }}
        </button>
        <div v-if="loading" class="progress-bar-container">
            <div class="progress-bar-fill"></div>
        </div>

        <div v-if="error" class="error-msg">
            {{ error }}
            <button v-if="invalidElementId" class="error-link" @click="jumpToInvalidElement">
                → Element öffnen
            </button>
        </div>
        <div v-if="preSolveWarnings.length" class="warning-list">
            <div v-for="w in preSolveWarnings" :key="w.id + w.text" class="warning-msg">
                {{ w.text }}
                <button class="warning-link" @click="store.openPreprocessingFor(w.id, w.elementType)">
                    → Element öffnen
                </button>
            </div>
        </div>
        <div v-if="success" class="success-msg">Netz berechnet</div>

        <!-- Actions for results -->
        <div v-if="success" class="results-actions">
            <button class="action-btn" @click="store.ui.showResultsModal = true">
                <img class="ic" src="/saintv1d/icons/Interface-Essential-Expand-3--Streamline-Pixel.svg" />
                Ergebnisse anzeigen
            </button>
            <button class="action-btn" @click="store.ui.showDebugModal = true">
                <img class="ic" src="/saintv1d/icons/Computers-Devices-Electronics-Board--Streamline-Pixel.svg" />
                Debug (.inp / .rpt)
            </button>
            <div class="button-row">
                <button class="secondary-btn" @click="downloadInput">
                    <img class="ic" src="/saintv1d/icons/Interface-Essential-Floppy-Disk--Streamline-Pixel.svg" />
                    Input (.inp)
                </button>
                <button class="secondary-btn" @click="downloadResults">
                    <img class="ic" src="/saintv1d/icons/Interface-Essential-Share-1--Streamline-Pixel.svg" />
                    Result (.json)
                </button>
            </div>
        </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
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
const invalidElementId = computed(() => store.simulation.invalidElementId);
const preSolveWarnings = computed(() => store.simulation.preSolveWarnings);

const jumpToInvalidElement = () => {
    store.openPreprocessingFor(store.simulation.invalidElementId, store.simulation.invalidElementType);
};

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
  border-radius: 8px;
  border: 1px solid var(--isy-pixel-text-dim, #4a4a4a);
}
.control-box h3 {
    margin-top: 0;
    margin-bottom: 0.75rem;
    font-family: var(--isy-pixel-font);
    font-size: 0.5rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--isy-pixel-border, #4a4844);
    border-bottom: 2px solid var(--isy-pixel-text-dim, #4a4a4a);
    padding-bottom: 0.5rem;
}

.control-group + .control-group {
    margin-top: 1.1rem;
}

.control-group > label {
    display: block;
    margin-bottom: 0.4rem;
    font-family: var(--isy-pixel-font);
    font-size: 0.44rem;
    letter-spacing: 0.05em;
    color: var(--isy-pixel-border, #4a4844);
}

/* Compact Stats */
.stats-compact {
    padding: 0.6rem 1rem;
    text-align: center;
    background: var(--isy-pixel-bg, #040647);
}
.stats-row {
    display: flex;
    justify-content: center;
    gap: 0.8rem;
    font-family: var(--isy-pixel-font);
    font-size: 0.42rem;
    color: var(--isy-pixel-text-dim, #4a4a4a);
    align-items: center;
}
.stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
}
.stat-item strong {
    color: var(--isy-pixel-text, #fff);
    font-size: 0.58rem;
}
.divider {
    color: var(--isy-pixel-border, #4a4844);
}


/* Meta Info */
.meta-item { display: flex; flex-direction: column; margin-bottom: 0.5rem; }
.meta-row { display: flex; justify-content: space-between; gap: 0.5rem; }
.label { font-size: 0.75rem; color: var(--isy-pixel-border, #4a4844); font-weight: 700; }
.value { font-size: 0.88rem; color: var(--isy-pixel-border, #4a4844); overflow: hidden; text-overflow: ellipsis; }

/* Buttons & Inputs */
.primary-btn {
  width: 100%;
  padding: 0.75rem;
  background: var(--isy-pixel-bg, #040647);
  color: var(--isy-pixel-green, #219653);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  margin-top: 0.5rem;
  font-family: var(--isy-pixel-font);
  font-size: 0.54rem;
  transition: background 0.15s;
}
.primary-btn:hover:not(:disabled) { background: var(--isy-pixel-border, #4a4844); }
.primary-btn:disabled { background: var(--isy-pixel-text-dim, #4a4a4a); cursor: default; }
.secondary-btn {
    flex: 1;
    padding: 0.5rem;
    background: transparent;
    border: 1px solid var(--isy-pixel-border, #4a4844);
    border-radius: 6px;
    cursor: pointer;
    font-family: var(--isy-pixel-font);
    font-size: 0.46rem;
    text-align: center;
    color: var(--isy-pixel-text-dim, #4a4a4a);
    transition: background 0.12s, border-color 0.12s;
}
.secondary-btn:hover { background: var(--isy-pixel-text-dim, #4a4a4a); border-color: var(--isy-pixel-border-hover, #65625c); }

.error-msg { color: #b91c1c; margin-top: 0.5rem; font-size: 0.82rem; }
.error-link {
    display: block;
    margin-top: 0.3rem;
    background: none;
    border: none;
    padding: 0;
    color: #b91c1c;
    font-family: var(--isy-pixel-font);
    font-size: 0.44rem;
    line-height: 1.6;
    text-decoration: underline;
    cursor: pointer;
}
.error-link:hover { color: #7f1616; }
.warning-list { margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.3rem; }
.warning-msg {
    color: #92590a;
    background: #fef6e7;
    border-left: 3px solid #e0a020;
    border-radius: 4px;
    padding: 0.35rem 0.5rem;
    font-size: 0.78rem;
}
.warning-link {
    display: block;
    margin-top: 0.2rem;
    background: none;
    border: none;
    padding: 0;
    color: #92590a;
    font-family: var(--isy-pixel-font);
    font-size: 0.42rem;
    line-height: 1.6;
    text-decoration: underline;
    cursor: pointer;
}
.warning-link:hover { color: #6b4107; }
.success-msg { color: var(--isy-pixel-border, #4a4844); margin-top: 0.5rem; font-weight: 700; font-size: 0.85rem; }
.input-with-action input { width: 100%; padding: 0.5rem; border: 1px solid var(--isy-pixel-text-dim, #4a4a4a); border-radius: 6px; box-sizing: border-box; color: var(--isy-pixel-border, #4a4844); }
.input-with-action input:focus { outline: none; border-color: var(--isy-pixel-border, #4a4844); }
.button-row { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
.secondary-btn.full { margin-top: 0.4rem; width: 100%; }

/* Pixel art icons — gefärbt wie das Raster (var(--isy-pixel-green, #219653)) */
.ic {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    image-rendering: pixelated;
    filter: invert(63%) sepia(36%) saturate(736%) hue-rotate(103deg) brightness(99%) contrast(96%);
    vertical-align: middle;
}

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
    font-size: 0.78rem;
    color: var(--isy-pixel-border, #4a4844);
    margin-bottom: 0.5rem;
    padding: 0.35rem 0.5rem;
    background: var(--isy-pixel-border, #4a4844); color: var(--isy-pixel-green-bright, #18a34a);
    border-radius: 6px;
    border-left: 3px solid var(--isy-pixel-border-hover, #65625c);
}

.rain-info-empty {
    color: #8a8a9e;
    font-style: italic;
}

.results-actions {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    border-top: 2px solid var(--isy-pixel-text-dim, #4a4a4a);
    padding-top: 1rem;
}
.action-btn {
    width: 100%;
    padding: 0.65rem 0.75rem;
    background: var(--isy-pixel-border, #4a4844);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-family: var(--isy-pixel-font);
    font-size: 0.46rem;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: background 0.15s;
}
.action-btn:hover { background: var(--isy-pixel-bg, #040647); }

.progress-bar-container {
    width: 100%;
    height: 5px;
    background: var(--isy-pixel-text-dim, #4a4a4a);
    margin-top: 4px;
    border-radius: 3px;
    overflow: hidden;
}
.progress-bar-fill {
    height: 100%;
    background: repeating-linear-gradient(
        45deg,
        var(--isy-pixel-border, #4a4844),
        var(--isy-pixel-border, #4a4844) 10px,
        var(--isy-pixel-border-hover, #65625c) 10px,
        var(--isy-pixel-border-hover, #65625c) 20px
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
.ic.spin { animation: spin 1s linear infinite; }

</style>
