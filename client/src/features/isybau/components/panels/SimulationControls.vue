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
    <div class="control-box stats-compact" data-tutorial="netz-stats">
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
                <button class="secondary-btn" data-tutorial="kostra-oeffnen" @click="store.ui.showKostraModal = true">
                    <img class="ic" src="/saintv1d/icons/Map-Navigation-Compass-Direction--Streamline-Pixel.svg" />
                    KOSTRA
                </button>
            </div>

            <!-- Rain Status & Chart -->
            <div class="rain-status">
                <div v-if="store.rain.activeModelRain" class="rain-info">
                    <span class="rain-label"><strong>Modellregen:</strong> {{ store.rain.activeModelRain.type }}</span>
                    <button class="rain-clear plain-btn" type="button" title="Regen entfernen"
                            aria-label="Regen entfernen" @click="store.clearRain()">x</button>
                </div>
                <div v-else-if="store.rain.intensity > 0" class="rain-info">
                    <span class="rain-label"><strong>KOSTRA:</strong> {{ store.rain.intensity }} l/(s·ha)</span>
                    <button class="rain-clear plain-btn" type="button" title="Regen entfernen"
                            aria-label="Regen entfernen" @click="store.clearRain()">x</button>
                </div>
                <div v-else class="rain-info rain-info-empty">
                    Kein Regen konfiguriert — Modellregen oder KOSTRA wählen.
                </div>
            </div>

            <!-- Mini Chart -->
            <div v-if="store.rain.activeModelRain" class="mini-chart-container">
                <Bar :data="miniChartData" :options="miniChartOptions" />
            </div>

            <button class="secondary-btn full" data-tutorial="daten-bearbeiten" @click="store.ui.showPreprocessingModal = true">
                <img class="ic" src="/saintv1d/icons/Interface-Essential-Setting-Slide--Streamline-Pixel.svg" />
                Daten bearbeiten
            </button>

            <button class="secondary-btn full" data-tutorial="abfluss-validieren" @click="openPedantPopup">
                <img class="ic" src="/saintv1d/icons/Health-Brain-1--Streamline-Pixel.svg" />
                Abfluss validieren
            </button>

            <!-- Der Gag lebt davon, dass der Knopf eine Pruefung verspricht und
                 stattdessen zurueckfragt. Vorher sass hier ein Fenster mit einer
                 Handrechnung (Q = ψ·i·A je Flaeche); die hat nie geprueft, was
                 die Beschriftung ankuendigt, und ist entfallen. -->
            <Transition name="pedant-pop">
              <div v-if="showPedant" class="pedant-popup">
                <div class="pedant-header">
                  <img class="pedant-ic" src="/saintv1d/icons/Interface-Essential-Information-Circle-2--Streamline-Pixel.svg" alt="" />
                  <span>Validierung</span>
                  <button class="pedant-close plain-btn" title="Schließen" aria-label="Schließen" @click="closePedantPopup">×</button>
                </div>
                <p class="pedant-msg">
                  Schau dir die .inp und .rpt Dateien an, du Pedant.
                </p>
                <p class="pedant-msg pedant-hint">
                  Nach der Berechnung liegen sie unten in dieser Leiste:
                  „Debug (.inp / .rpt)" zeigt beide im Fenster, „Input (.inp)"
                  laedt die Eingabedatei herunter. Die .inp ist das, was der
                  Rechner wirklich zu sehen bekommt — jede Zahl aus deinem Netz
                  steht da als Zeile drin.
                </p>
              </div>
            </Transition>
        </div>

        <div class="control-group" data-tutorial="sim-dauer">
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
import { computed, ref, onBeforeUnmount } from 'vue';
import { useIsybauStore } from '../../store/index.js';
import { buildResultsExport } from '../../utils/resultsExport.js';
import { Bauwerkstyp, getEffectiveBauwerkstyp } from '../../utils/mappings.js';
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

// „Abfluss validieren": Popup samt Pixel-Melodie. Die Datei wird bewusst ERST
// beim Klick geholt (5 MB) — vorgeladen haette sie jeden Aufruf des Moduls
// verteuert, obwohl der Knopf ein Osterei ist.
const PEDANT_MELODIE = '/saintv1d/yoshiyuki_tatsuya-pixel-melody-430745.mp3';
const showPedant = ref(false);
let pedantAudio = null;

const stopPedantAudio = () => {
    if (!pedantAudio) return;
    pedantAudio.pause();
    pedantAudio.currentTime = 0;
    pedantAudio = null;
};

const openPedantPopup = () => {
    showPedant.value = true;
    stopPedantAudio();
    pedantAudio = new Audio(PEDANT_MELODIE);
    pedantAudio.volume = 0.6;
    // Ohne Nutzergeste verweigern Browser das Abspielen — hier ist eine da
    // (der Klick), der catch faengt nur die Faelle mit stummgeschaltetem Tab.
    pedantAudio.play().catch(() => {});
};

const closePedantPopup = () => {
    showPedant.value = false;
    stopPedantAudio();
};

// Ohne das spielt die Melodie weiter, wenn man das Modul verlaesst, ohne das
// Popup zu schliessen — die alte Fassung hatte genau diese Luecke.
onBeforeUnmount(stopPedantAudio);

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
    if (!store.simulation.results) return;
    // Angereichert exportieren: SWMM-Ergebnisse PLUS die Eingangsdaten, aus denen
    // sie entstanden sind. Ohne die Quellflächen ist z.B. nicht erkennbar, dass
    // "FK001.1" und "FK001.1_2" die zwei Hälften EINER Fläche sind (siehe
    // utils/resultsExport.js).
    const payload = buildResultsExport({
        results: store.simulation.results,
        areas: store.areaArray ?? store.areas,
        nodes: store.nodes,
        edges: store.edges,
        metadata: store.metadata,
        rain: store.rain,
        bauwerkLabel: (n) => Bauwerkstyp[getEffectiveBauwerkstyp(n)] ?? null,
    });
    downloadFile(`simulation_results_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload, null, 2));
};
</script>

<style scoped>
.sidebar-content {
    display: flex;
    flex-direction: column;
    gap: var(--isy-space-4);
}
.control-box {
  background: var(--isy-pixel-content-bg);
  padding: var(--isy-space-4);
  border-radius: var(--isy-radius-lg);
  border: 1px solid var(--isy-pixel-text-dim);
}
.control-box h3 {
    margin-top: 0;
    margin-bottom: var(--isy-space-3);
    font-family: var(--isy-pixel-font);
    font-size: var(--isy-fs-pixel-md);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--isy-pixel-border);
    border-bottom: 2px solid var(--isy-pixel-text-dim);
    padding-bottom: var(--isy-space-2);
}

.control-group + .control-group {
    margin-top: var(--isy-space-4);
}

.control-group > label {
    display: block;
    margin-bottom: var(--isy-space-2);
    font-family: var(--isy-pixel-font);
    font-size: var(--isy-fs-pixel-sm);
    letter-spacing: 0.05em;
    color: var(--isy-pixel-border);
}

/* Compact Stats */
.stats-compact {
    padding: var(--isy-space-2) var(--isy-space-4);
    text-align: center;
    background: var(--isy-pixel-bg);
}
.stats-row {
    display: flex;
    justify-content: center;
    gap: var(--isy-space-3);
    font-family: var(--isy-pixel-font);
    font-size: var(--isy-fs-pixel-sm);
    /* Diese Zeile steht auf --isy-pixel-bg (im Dunkelmodus Navy), nicht auf
       Papier — also das Modus-Token. Umgekehrt war es 2,1:1. */
    color: var(--isy-pixel-text-dim);
    align-items: center;
}
.stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--isy-space-1);
}
.stat-item strong {
    color: var(--isy-pixel-text);
    font-size: var(--isy-fs-pixel-md);
}
.divider {
    /* wie .stats-row: Navy-Untergrund im Dunkelmodus */
    color: var(--isy-pixel-text-dim);
}


/* Meta Info */
.meta-item { display: flex; flex-direction: column; margin-bottom: var(--isy-space-2); }
.meta-row { display: flex; justify-content: space-between; gap: var(--isy-space-2); }
.label { font-size: var(--isy-fs-sm); color: var(--isy-pixel-border); font-weight: 700; }
.value { font-size: var(--isy-fs-lg); color: var(--isy-pixel-border); overflow: hidden; text-overflow: ellipsis; }

/* Buttons & Inputs */
.primary-btn {
  width: 100%;
  padding: var(--isy-space-3);
  background: var(--isy-pixel-bg);
  color: var(--isy-pixel-green);
  border: none;
  border-radius: var(--isy-radius-md);
  cursor: var(--isy-cursor-hand);
  margin-top: var(--isy-space-2);
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  transition: background 0.15s;
}
.primary-btn:hover:not(:disabled) { background: var(--isy-pixel-border); }
.primary-btn:disabled { background: var(--isy-pixel-text-dim); cursor: var(--isy-cursor-zeiger); }
.secondary-btn {
    flex: 1;
    padding: var(--isy-space-2);
    background: transparent;
    border: 1px solid var(--isy-pixel-border);
    border-radius: var(--isy-radius-md);
    cursor: var(--isy-cursor-hand);
    font-family: var(--isy-pixel-font);
    font-size: var(--isy-fs-pixel-sm);
    text-align: center;
    /* Die Knopfflaeche ist Papier (--isy-pixel-content-bg, in beiden Modi
       hell) — also die Papier-Textfarbe. Mit dem Modus-Token stand hier im
       Dunkelmodus Hellgrau auf Papier: 1,9:1. */
    color: var(--isy-pixel-content-text-dim);
    transition: background 0.12s, border-color 0.12s;
}
/* Hover-Flaeche aus der Papier-Familie: --isy-pixel-text-dim ist eine
   TEXT-Farbe und im Dunkelmodus hellgrau — der Knopf verschwand beim
   Ueberfahren hinter seiner eigenen Schriftfarbe. */
.secondary-btn:hover { background: var(--isy-pixel-content-hover); border-color: var(--isy-pixel-border-hover); }

.error-msg { color: var(--isy-pixel-danger-soft-text); margin-top: var(--isy-space-2); font-size: var(--isy-fs-md); }
.error-link {
    display: block;
    margin-top: var(--isy-space-1);
    background: none;
    border: none;
    padding: 0;
    color: var(--isy-pixel-danger-soft-text);
    font-family: var(--isy-pixel-font);
    font-size: var(--isy-fs-pixel-sm);
    line-height: 1.6;
    text-decoration: underline;
    cursor: var(--isy-cursor-hand);
}
.error-link:hover { color: var(--isy-pixel-text); }
.warning-list { margin-top: var(--isy-space-2); display: flex; flex-direction: column; gap: var(--isy-space-1); }
.warning-msg {
    color: var(--isy-pixel-warning-soft-text);
    background: var(--isy-pixel-warning-soft);
    border-left: 3px solid #e0a020;
    border-radius: var(--isy-radius-sm);
    padding: var(--isy-space-1) var(--isy-space-2);
    font-size: var(--isy-fs-sm);
}
.warning-link {
    display: block;
    margin-top: var(--isy-space-1);
    background: none;
    border: none;
    padding: 0;
    color: var(--isy-pixel-warning-soft-text);
    font-family: var(--isy-pixel-font);
    font-size: var(--isy-fs-pixel-sm);
    line-height: 1.6;
    text-decoration: underline;
    cursor: var(--isy-cursor-hand);
}
.warning-link:hover { color: var(--isy-pixel-text); }
.success-msg { color: var(--isy-pixel-border); margin-top: var(--isy-space-2); font-weight: 700; font-size: var(--isy-fs-md); }
.input-with-action input { width: 100%; padding: var(--isy-space-2); border: 1px solid var(--isy-pixel-text-dim); border-radius: var(--isy-radius-md); box-sizing: border-box; color: var(--isy-pixel-border); }
.input-with-action input:focus { outline: none; border-color: var(--isy-pixel-border); }
.button-row { display: flex; gap: var(--isy-space-2); margin-bottom: var(--isy-space-2); }
.secondary-btn.full { margin-top: var(--isy-space-2); width: 100%; }

/* Pixel art icons — gefärbt wie das Raster (var(--isy-pixel-green)) */
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
    margin: var(--isy-space-2) 0;
    border: 1px solid var(--isy-pixel-divider);
    background: var(--isy-pixel-content-bg);
    border-radius: var(--isy-radius-sm);
    padding: var(--isy-space-1);
}
.rain-status {
    font-size: var(--isy-fs-sm);
    color: var(--isy-pixel-border);
    margin-bottom: var(--isy-space-2);
    padding: var(--isy-space-1) var(--isy-space-2);
    background: var(--isy-pixel-border); color: var(--isy-pixel-green-bright);
    border-radius: var(--isy-radius-md);
    border-left: 3px solid var(--isy-pixel-border-hover);
}

.rain-info-empty {
    /* Der Regen-Streifen ist eine dunkle Akzentflaeche in BEIDEN Modi. Mit dem
       Modus-Token stand hier im Hellmodus Dunkelgrau auf Dunkelgrau: 1,03:1 —
       der Satz war schlicht unsichtbar. */
    color: var(--isy-pixel-accent-text);
    font-style: italic;
}

/* "x" zum Regen-Entfernen. Traegt `.plain-btn`, damit die globale
   Pixel-Button-Regel (Bevel + Schlagschatten) hier NICHT greift — der Knopf
   sitzt inline in einer Textzeile, eine erhabene 3D-Fassung wuerde die Zeile
   sprengen. Pixel-Optik kommt stattdessen aus der Pixel-Schrift und der
   quadratischen Grundflaeche. */
.rain-info {
    display: flex;
    align-items: center;
    gap: var(--isy-space-2);
}

/* Der Text darf schrumpfen, das "x" nicht — sonst wandert es bei langen
   Regennamen aus der Zeile. Frueher stand hier `float: right`, was genau das
   nicht garantiert. */
.rain-label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.rain-clear {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    padding: 0;
    background: transparent;
    border: 2px solid transparent;
    color: var(--isy-pixel-green-bright);
    font-family: var(--isy-pixel-font);
    font-size: var(--isy-fs-pixel-md);
    line-height: 1;
    cursor: var(--isy-cursor-hand);
    /* Kanten hart lassen — ein weichgezeichnetes x passt nicht zum Rest. */
    image-rendering: pixelated;
}

.rain-clear:hover {
    border-color: var(--isy-pixel-green-bright);
    color: var(--isy-pixel-green-hover);
}

.rain-clear:active {
    /* Eingedrueckt: Kante nach innen versetzt statt Farbwechsel — dieselbe
       Sprache wie die grossen Pixel-Buttons, nur eine Nummer kleiner. */
    transform: translate(1px, 1px);
}

.results-actions {
    margin-top: var(--isy-space-4);
    display: flex;
    flex-direction: column;
    gap: var(--isy-space-2);
    border-top: 2px solid var(--isy-pixel-text-dim);
    padding-top: var(--isy-space-4);
}
.action-btn {
    width: 100%;
    padding: var(--isy-space-3) var(--isy-space-3);
    background: var(--isy-pixel-border);
    color: white;
    border: none;
    border-radius: var(--isy-radius-md);
    cursor: var(--isy-cursor-hand);
    font-family: var(--isy-pixel-font);
    font-size: var(--isy-fs-pixel-sm);
    text-align: left;
    display: flex;
    align-items: center;
    gap: var(--isy-space-2);
    transition: background 0.15s;
}
.action-btn:hover { background: var(--isy-pixel-bg); }

.progress-bar-container {
    width: 100%;
    height: 5px;
    background: var(--isy-pixel-text-dim);
    margin-top: var(--isy-space-1);
    border-radius: var(--isy-radius-sm);
    overflow: hidden;
}
.progress-bar-fill {
    height: 100%;
    background: repeating-linear-gradient(
        45deg,
        var(--isy-pixel-border),
        var(--isy-pixel-border) 10px,
        var(--isy-pixel-border-hover) 10px,
        var(--isy-pixel-border-hover) 20px
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
    margin-right: var(--isy-space-1);
}
@keyframes spin { 100% { transform: rotate(360deg); } }
.ic.spin { animation: spin 1s linear infinite; }

/* „Abfluss validieren"-Popup. Die alte Fassung stand mit festen Farben im
   Code (#040647, #2ecc71, 'Press Start 2P', rem-Werte) — hier auf die Tokens
   gelegt, sonst waere sie im Hellmodus dunkelgruen auf dunkelblau. */
.pedant-popup {
    position: relative;
    margin-top: var(--isy-space-2);
    background: var(--isy-pixel-bg);
    border: 2px solid var(--isy-pixel-green-glow);
    border-radius: var(--isy-radius-sm);
    overflow: hidden;
    box-shadow: var(--isy-elev-3);
}

/* Dunkle Akzentflaeche in BEIDEN Modi mit ihrem konstanten hellen Text —
   auf --isy-pixel-bg-deep stand die Kopfzeile im Hellmodus bei 4,0:1. */
.pedant-header {
    display: flex;
    align-items: center;
    gap: var(--isy-space-1);
    padding: var(--isy-space-1) var(--isy-space-2);
    background: var(--isy-pixel-border);
    border-bottom: 1px solid var(--isy-pixel-green-glow);
}

.pedant-header span {
    flex: 1;
    font-family: var(--isy-pixel-font);
    font-size: var(--isy-fs-pixel-md);
    color: var(--isy-pixel-accent-text);
}

.pedant-ic {
    width: 14px;
    height: 14px;
    image-rendering: pixelated;
}

.pedant-close {
    /* .plain-btn nimmt den Knopf von der globalen Pixel-Fassung aus — dann
       muss er seine Flaeche selbst abschalten, sonst zeichnet der Browser
       seinen grauen Standardknopf. */
    background: none;
    border: none;
    color: var(--isy-pixel-accent-text);
    font-size: var(--isy-fs-lg);
    line-height: 1;
    padding: 0;
    cursor: var(--isy-cursor-hand);
}
.pedant-close:hover { color: var(--isy-pixel-green-bright); }

.pedant-msg {
    margin: 0;
    padding: var(--isy-space-2);
    font-family: var(--isy-pixel-font);
    font-size: var(--isy-fs-pixel-md);
    color: var(--isy-pixel-green-text);
    line-height: 1.8;
}

/* Der Hinweis auf die Dateien ist Fliesstext, keine Pointe — deshalb die
   normale Schrift und die gedaempfte Textfarbe. */
.pedant-hint {
    padding-top: 0;
    font-family: inherit;
    font-size: var(--isy-fs-sm);
    color: var(--isy-pixel-text-dim);
    line-height: 1.5;
}

.pedant-pop-enter-active { transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1); }
.pedant-pop-leave-active { transition: all 0.15s ease-in; }
.pedant-pop-enter-from  { opacity: 0; transform: scale(0.85); }
.pedant-pop-leave-to    { opacity: 0; transform: scale(0.9); }

</style>
