<template>
  <DraggableModal 
    :is-open="isOpen" 
    initial-width="1000px" 
    initial-height="800px"
    @close="$emit('close')"
  >
    <div class="help-container">
      <div class="modal-header">
        <h3>ℹ️ Isybau Bedienungsanleitung & System-Audit</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
      
      <div class="modal-body">
        <!-- Sidebar Navigation -->
        <div class="help-sidebar">
          <div class="sidebar-group">
            <span class="group-title">Benutzer</span>
            <button 
                v-for="tab in userTabs" 
                :key="tab.id"
                :class="['tab-btn', { active: activeTab === tab.id }]"
                @click="activeTab = tab.id"
            >
                {{ tab.label }}
            </button>
          </div>
          
          <div class="sidebar-group">
            <span class="group-title">Technical Audit</span>
            <button 
                v-for="tab in techTabs" 
                :key="tab.id"
                :class="['tab-btn', 'tech-btn', { active: activeTab === tab.id }]"
                @click="activeTab = tab.id"
            >
                {{ tab.label }}
            </button>
          </div>
        </div>

        <!-- Content Area -->
        <div class="help-content">
          
          <!-- ALLGEMEIN -->
          <div v-if="activeTab === 'general'" class="content-section">
            <h4>Allgemein</h4>
            <p>
              Das <strong>Isybau-Modul</strong> ist eine webbasierte Oberfläche für die hydraulische Simulation von Entwässerungsnetzen.
              Es nutzt den Industriestandard <a href="https://www.epa.gov/water-research/storm-water-management-model-swmm" target="_blank" rel="noopener noreferrer"><strong>SWMM 5 (Storm Water Management Model)</strong></a> als Rechenkern, kompiliert zu WebAssembly (Wasm) für die lokale Ausführung im Browser.
            </p>
            <ul>
              <li><strong>Eingabedaten:</strong> Import von ISYBAU XML-Dateien (Stammdaten) oder manuelle Netzwerkerstellung.</li>
              <li><strong>Simulation:</strong> Hydrodynamische Wellensimulation (Dynamic Wave) zur Berechnung von instationären Abflüssen.</li>
              <li><strong>Datenschutz:</strong> Alle Berechnungen finden lokal auf Ihrem Gerät statt. Keine Cloud-Verarbeitung der Netzdaten.</li>
            </ul>
          </div>

          <!-- WORKFLOW -->
          <div v-if="activeTab === 'workflow'" class="content-section">
            <h4>Workflow</h4>
            <ol>
              <li>
                <strong>Daten laden & Prüfen:</strong> 
                Importieren Sie Ihre ISYBAU-XML. Nutzen Sie <em>"Daten bearbeiten"</em>, um fehlende Höhen oder Oberflächen zu ergänzen.
              </li>
              <li>
                <strong>Regenereignis definieren:</strong> 
                Wählen Sie zwischen synthetischen Modellregen (Euler Typ II) oder KOSTRA-DWD Starkregendaten.
              </li>
              <li>
                <strong>Abfluss validieren:</strong> 
                Die Funktion <em>"✅ Abfluss validieren"</em> prüft vor der Simulation auf kritische Fehler (z.B. fehlende Schachtsohlen, negative Gefälle).
              </li>
              <li>
                <strong>Simulation starten:</strong> 
                Der SWMM-Solver berechnet das Netz. Dies kann je nach Netzgröße und Regendauer einige Sekunden dauern.
              </li>
              <li>
                <strong>Analyse:</strong> 
                Prüfen Sie Überstau und Überflutungen in der Ergebnistabelle oder der Kartenansicht.
              </li>
            </ol>
          </div>

          <!-- EDITOR -->
          <div v-if="activeTab === 'editor'" class="content-section">
            <h4>Editor & Tools (Audit)</h4>
            <div class="audit-block">
                <p>Der Editor ermöglicht die topologische Bearbeitung des Netzes. Nachfolgend eine Auflistung der exakten Funktionalitäten und Grenzen.</p>
                
                <h5>🗺️ Karten-Interaktion</h5>
                <ul>
                    <li><strong>Navigation:</strong> Pan (Ziehen) und Zoom (Mausrad).</li>
                    <li><strong>Selektion:</strong> Einzelklick selektiert (Blau). Klick ins Leere deselektiert.</li>
                    <li><strong>Details:</strong> Doppelklick öffnet das Eigenschaften-Fenster. Alternativ "📝"-Button in der Toolbox.</li>
                    <li><strong>Snapping (Fangmodus):</strong> Beim Zeichnen von Haltungen werden Knoten automatisch gefangen, wenn der Mauszeiger in der Nähe ist (< 10px Radius).</li>
                </ul>

                <h5>🛠️ Toolbox Funktionen</h5>
                <ul>
                    <li><strong>Schacht (Node):</strong> Erstellt standardmäßig einen Kontrollschacht (Typ 0). Sohlehöhe (Z) wird initial auf 0 gesetzt und muss angepasst werden.</li>
                    <li><strong>Haltung (Edge):</strong> Verbindet zwei existierende Schächte. 
                        <strong>Achtung:</strong> Die Flussrichtung wird durch die Klick-Reihenfolge bestimmt (Start -> Ende). 
                        Ein negatives Gefälle ist möglich, führt aber zu Warnungen.
                    </li>
                    <li><strong>Fläche (Area):</strong> Polygon-Zeichentool. 
                        <ul>
                            <li>Klicken für Eckpunkte.</li>
                            <li>Doppelklick oder Enter zum Abschließen.</li>
                            <li><strong>Automatismus:</strong> Die Fläche (ha) wird automatisch aus der Geometrie berechnet.</li>
                            <li><strong>Limitierung:</strong> Flächen müssen manuell einem Knoten zugewiesen werden (Feld "Knoten" in Eigenschaften), sonst fließt der Regen nicht ins Netz.</li>
                        </ul>
                    </li>
                    <li><strong>Löschen (🗑️):</strong> Entfernt Elemente. 
                        <strong>Kaskade:</strong> Löschen eines Knotens löscht automatisch alle angeschlossenen Haltungen.
                    </li>
                </ul>
            </div>
          </div>

          <!-- RESULTS / ANALYSIS -->
          <div v-if="activeTab === 'results'" class="content-section">
            <h4>Ergebnisse & Analyse</h4>
            <p>Die Simulation bietet verschiedene Werkzeuge zur Auswertung der Hydraulik.</p>
            
            <h5>📊 Ergebnistabellen</h5>
            <p>Die Detailansicht bietet Filter für Haltungen, Schächte und Flächen.</p>
            <table class="tech-table">
                <tr><th>Metrik</th><th>Bedeutung</th><th>Grenzwert / Farbe</th></tr>
                <tr><td><strong>Auslastung</strong></td><td>Verhältnis von maximalem Abfluss (Qmax) zu Vollfüllleistung (Qvoll).</td><td><span class="tag q-warn">> 100%</span> (Kritisch)</td></tr>
                <tr><td><strong>Überstauvolumen</strong></td><td>Volumen an Wasser, das nicht mehr im Schacht/Rohr Platz hat und an der Oberfläche "steht".</td><td>> 0 m³ (Rot blinkend in Karte)</td></tr>
                <tr><td><strong>v_max</strong></td><td>Maximale Fließgeschwindigkeit.</td><td>> 5-6 m/s (Erosionsgefahr, nicht farblich markiert)</td></tr>
            </table>

            <h5>📈 Ganglinien (Zeitreihen)</h5>
            <p>Durch Klick auf "Details" oder Selektion in der Karte können Sie den zeitlichen Verlauf an jedem Element betrachten. Verfügbar sind Hydrographen für Zufluss, Abfluss und Wasserstand.</p>

            <h5>⚠️ Validierung</h5>
            <p>Im Reiter "Allgemeine Daten" finden Sie die Massenbilanz (Kontinuitätsfehler). Ein Fehler < 2% gilt als sehr gut, bis 5% ist akzeptabel. Hohe Fehler deuten auf instabile Modelle (kurze Rohre, extrem steile Gefälle) hin.</p>
          </div>

          <!-- SIMULATION DEEP DIVE -->
          <div v-if="activeTab === 'simulation'" class="content-section">
            <h4>Simulation Internals (Deep Dive)</h4>
            <div class="audit-block">
                <p>Hier wird exakt beschrieben, wie die Simulation parametrisiert und ausgeführt wird.</p>
                
                <h5>🌊 Hydraulisches Modell (SWMM 5)</h5>
                <ul>
                    <li><strong>Solver:</strong> Dynamic Wave (Vollständige St. Venant Gleichungen). Berücksichtigt Rückstau, Druckabfluss und Speichereffekte.</li>
                    <li><strong>Schrittweite:</strong> Variabel, gesteuert durch Courant-Kriterium (typisch 0.5 - 30s).</li>
                </ul>

                <h5>🌧️ Profil-Geometrien</h5>
                <p>Der Solver unterstützt folgende Profile (Mapping aus ISYBAU-Kürzeln):</p>
                <table class="tech-table">
                    <tr><th>Typ</th><th>Verarbeitung</th><th>Fallback (bei Fehler)</th></tr>
                    <tr><td>Kreis (0)</td><td>Standard DN (Durchmesser)</td><td>DN 1000</td></tr>
                    <tr><td>Ei (1)</td><td>Standard Ei-Profil (H:B ~ 3:2)</td><td>DN 1000 (äquiv.)</td></tr>
                    <tr><td>Rechteck (3)</td><td>Breite x Höhe</td><td>DN 1000</td></tr>
                    <tr><td>Trapez (8)</td><td>Offenes Gerinne, Böschung 1:1.5</td><td>DN 1000</td></tr>
                </table>
            </div>
          </div>

          <!-- FILE FORMATS -->
          <div v-if="activeTab === 'files'" class="content-section">
            <h4>Dateiformate (.inp / .rpt)</h4>
            <p>Für Experten und Prüfzwecke können die internen Simulationsdateien über "🔍 Debug" eingesehen und exportiert werden.</p>

            <h5>📝 .inp (SWMM Input)</h5>
            <div class="code-block">
[TITLE]
Project Title/Notes

[OPTIONS]
FLOW_ROUTING   DYNWAVE
INFILTRATION   CURVE_NUMBER
...

[JUNCTIONS]
;;Name   Elev   MaxDepth   InitDepth   SurDepth   Aponded
Node1    45.5   3.0        0           0          0

[CONDUITS]
;;Name   FromNode   ToNode   Length   Roughness   InOffset   OutOffset
Pipe1    Node1      Node2    50.0     0.013       0          0
            </div>
            <p>Diese Datei enthält die vollständige Topologie und Parametrierung. Sie kann in jeder SWMM-kompatiblen Software (EPA SWMM, PCSWMM) geöffnet werden.</p>

            <h5>📄 .rpt (SWMM Report)</h5>
            <div class="code-block">
  **************************
  Link Flow Summary
  **************************
  Link      Type      Max   Time    Max    Max    
  Name                Q     of Max  |V|    d/D    
  -----------------------------------------------
  Pipe1     CONDUIT   45.2  02:15   0.85   0.45
            </div>
            <p>Dieser Textbericht wird vom Solver generiert und dient als Basis für die Tabellen im UI. Er enthält Zusammenfassungen für alle Elemente sowie detaillierte Massenbilanzen.</p>
          </div>

          <!-- SYSTEM LIMITS -->
          <div v-if="activeTab === 'limits'" class="content-section">
            <h4>Grenzen des Systems</h4>
            <div class="warning-block">
                <p>Was Isybau <strong>NICHT</strong> kann (Out of Scope):</p>
                <ul>
                    <li>❌ <strong>Keine 2D-Oberflächenabfluss-Simulation:</strong> Überflutetes Wasser wird als "Ponded Volume" protokolliert, fließt aber nicht oberirdisch weiter.</li>
                    <li>❌ <strong>Pumpen & Wehre:</strong> Aktuell werden keine Sonderbauwerke unterstützt.</li>
                    <li>❌ <strong>Schmutzfracht:</strong> Reine Hydraulik. Keine Stofftransportberechnung.</li>
                </ul>
            </div>
        </div>

        </div>
      </div>
    </div>
  </DraggableModal>
</template>

<script setup>
import { ref } from 'vue';
import DraggableModal from '../common/DraggableModal.vue';

defineProps({
  isOpen: Boolean
});

defineEmits(['close']);

const userTabs = [
  { id: 'general', label: 'Allgemein' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'editor', label: 'Editor & Tools' },
  { id: 'results', label: 'Ergebnisse & Analyse' } 
];

const techTabs = [
  { id: 'simulation', label: 'Simulation Deep Dive' },
  { id: 'files', label: 'Datenformate (.inp/.rpt)' },
  { id: 'limits', label: 'Grenzen des Systems' }
];

const activeTab = ref('general');
</script>

<style scoped>
/* Reuse styles from previous step */
.help-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: 'Inter', sans-serif;
  color: #2c3e50;
  background: #fff;
}

.modal-header {
  padding: 1rem;
  border-bottom: 1px solid #dce4e8;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f1f5f9;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #334155;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: #94a3b8; /* Slate 400 */
  transition: color 0.2s;
  padding: 0 0.5rem;
}

.close-btn:hover {
  color: #ef4444; /* Red 500 */
}

.modal-body {
  display: flex;
  flex: 1;
  overflow: hidden; 
}

.help-sidebar {
  width: 240px;
  background: #f8fafc;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  border-right: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.sidebar-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.group-title {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #94a3b8;
    font-weight: 700;
    margin-bottom: 0.25rem;
    padding-left: 0.5rem;
}

.tab-btn {
  text-align: left;
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: #64748b;
  font-weight: 500;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: #e2e8f0;
  color: #334155;
}

.tab-btn.active {
  background: #fff;
  color: #0ea5e9;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  font-weight: 600;
}

.tab-btn.tech-btn.active {
    color: #8b5cf6; /* Purple for tech tabs */
    border-left: 3px solid #8b5cf6;
}

.help-content {
  flex: 1;
  padding: 2.5rem;
  overflow-y: auto;
  background: white;
}

/* Typography & Content Styling */
.content-section h4 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  font-size: 1.5rem;
  letter-spacing: -0.02em;
  color: #1e293b;
  border-bottom: 2px solid #f1f5f9;
  padding-bottom: 0.75rem;
}

.content-section h5 {
  margin-top: 2rem;
  margin-bottom: 1rem;
  font-size: 1.1rem;
  color: #475569;
  font-weight: 700;
}

.content-section p, .content-section li {
  line-height: 1.6;
  color: #475569;
  font-size: 1rem;
}

.audit-block {
    background: #f8fafc;
    padding: 1.5rem;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
}

.warning-block {
    background: #fff5f5;
    padding: 1.5rem;
    border-radius: 8px;
    border: 1px solid #fecaca;
    color: #991b1b;
}

.warning-block p { color: #991b1b; font-weight: 600; }
.warning-block li { color: #7f1d1d; }

.tech-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1rem;
    background: white;
    font-size: 0.9rem;
}

.tech-table th, .tech-table td {
    border: 1px solid #e2e8f0;
    padding: 0.75rem;
    text-align: left;
}

.tech-table th {
    background: #f1f5f9;
    font-weight: 600;
    color: #475569;
}

.tag {
    display: inline-block;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    font-size: 0.8em;
    font-weight: 600;
}
.q-warn { background-color: #fee2e2; color: #991b1b; }

.code-block {
    background: #1e1e1e;
    color: #d4d4d4;
    padding: 1rem;
    border-radius: 6px;
    font-family: monospace;
    font-size: 0.85rem;
    white-space: pre-wrap;
    margin: 1rem 0;
    max-height: 300px;
    overflow-y: auto;
}

/* Custom Scrollbar */
.help-content::-webkit-scrollbar { width: 8px; }
.help-content::-webkit-scrollbar-track { background: #f1f1f1; }
.help-content::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
.help-content::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
</style>
