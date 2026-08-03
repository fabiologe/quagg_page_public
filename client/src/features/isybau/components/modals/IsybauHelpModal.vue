<template>
  <DraggableModal 
    :is-open="isOpen" 
    initial-width="1000px" 
    initial-height="800px"
    @close="$emit('close')"
  >
    <div class="help-container">
      <div class="modal-header">
        <h3>ℹ️ SaintV – 1D · Bedienungsanleitung & System-Audit V.1.03</h3>
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
            <span class="group-title">Technical</span>
            <button
                v-for="tab in techTabs"
                :key="tab.id"
                :class="['tab-btn', 'tech-btn', { active: activeTab === tab.id }]"
                @click="activeTab = tab.id"
            >
                {{ tab.label }}
            </button>
          </div>

          <div class="sidebar-group">
            <button class="tab-btn tutorial-btn" @click="restartTutorial">
                🐀 Tutorial starten
            </button>
          </div>
        </div>

        <!-- Content Area -->
        <div class="help-content">

          <!-- ALLGEMEIN -->
          <div v-if="activeTab === 'general'" class="content-section">
            <h4>Allgemein</h4>
            <p>
              <strong>SaintV – 1D</strong> ist eine browserbasierte Oberfläche für die hydraulische Simulation von Entwässerungsnetzen.
              Als Rechenkern dient der Industriestandard <strong>SWMM 5 (Storm Water Management Model)</strong>, kompiliert zu WebAssembly für die vollständig lokale Ausführung im Browser — ohne Cloud-Upload.
            </p>
            <div class="info-grid">
              <div class="info-card">
                <div class="info-card-title">Dateneingabe</div>
                Import von ISYBAU XML (Stammdaten) oder manuelle Netzwerkerstellung im 2D-Editor.
              </div>
              <div class="info-card">
                <div class="info-card-title">Simulation</div>
                Dynamic Wave (vollständige St.-Venant-Gleichungen): Rückstau, Druckabfluss, Speichereffekte.
              </div>
              <div class="info-card">
                <div class="info-card-title">Datenschutz</div>
                Alle Netzdaten bleiben auf Ihrem Gerät. Keine Server-Übertragung von Eingabe- oder Ergebnisdaten.
              </div>
              <div class="info-card">
                <div class="info-card-title">Visualisierung</div>
                2D-Kartenansicht, interaktive 3D-Szene mit Ergebnisüberlagerung und Wasserstandsmarker.
              </div>
            </div>
          </div>

          <!-- WORKFLOW -->
          <div v-if="activeTab === 'workflow'" class="content-section">
            <h4>Typischer Workflow</h4>
            <ol class="workflow-list">
              <li>
                <strong>Netz laden</strong>
                ISYBAU XML importieren oder manuell im Editor aufbauen. Der Importstatus wird im oberen Banner angezeigt.
              </li>
              <li>
                <strong>Daten prüfen & ergänzen</strong>
                <em>"Daten bearbeiten"</em> öffnet den Preprocessing-Dialog. Dort können fehlende Sohlhöhen, Schachtdurchmesser, Profiltypen und Sonderbauwerke (Pumpwerke, Wehre, Becken) gesetzt werden. Direkte Bearbeitung in der Tabelle, Massenänderungen via Bulk-Edit.
              </li>
              <li>
                <strong>Regenereignis wählen</strong>
                Synthetischer Modellregen (Euler Typ II) oder KOSTRA-DWD-Daten über die entsprechenden Buttons in der Seitenleiste. Intensität und Dauer sind frei wählbar.
              </li>
              <li>
                <strong>Abfluss validieren</strong>
                <em>"Abfluss validieren"</em> prüft vor der Simulation auf typische Fehlerquellen: fehlende Sohlhöhen, negative Gefälle, unverknüpfte Flächen. Warnungen erscheinen als Liste — keine blockierenden Fehler, nur Hinweise.
              </li>
              <li>
                <strong>Simulation starten</strong>
                SWMM-Solver läuft lokal (WebAssembly). Typische Rechenzeit: 1–10 s für kleine bis mittlere Netze (&lt; 500 Elemente).
              </li>
              <li>
                <strong>Ergebnisse analysieren</strong>
                Tabellen (Überstau, Auslastung, Ganglinien) in der 2D-Ansicht. Für räumliche Interpretation: <em>"Ergebnis 3D"</em> öffnet die 3D-Szene mit Ergebnis-Overlay direkt aktiviert.
              </li>
            </ol>
          </div>

          <!-- EDITOR -->
          <div v-if="activeTab === 'editor'" class="content-section">
            <h4>2D-Editor</h4>
            <div class="audit-block">
                <h5>🗺️ Navigation</h5>
                <ul>
                    <li><strong>Pan:</strong> Klicken + Ziehen auf leere Fläche.</li>
                    <li><strong>Zoom:</strong> Mausrad oder Trackpad-Pinch.</li>
                    <li><strong>Selektion:</strong> Einzelklick auf Element (wird blau). Klick ins Leere deselektiert.</li>
                    <li><strong>Details:</strong> Doppelklick öffnet das Eigenschaften-Fenster.</li>
                    <li><strong>Snapping:</strong> Beim Zeichnen von Haltungen werden Knoten automatisch gefangen (&lt; 10 px Radius).</li>
                </ul>

                <h5>🛠️ Werkzeuge</h5>
                <ul>
                    <li><strong>Schacht:</strong> Erstellt einen Standard-Kontrollschacht. Sohlhöhe (Z) initial 0 — bitte anpassen.</li>
                    <li><strong>Haltung:</strong> Verbindet zwei Knoten. Klick-Reihenfolge = Fließrichtung (Anfang → Ende). Negatives Gefälle möglich, erzeugt Warnung.</li>
                    <li><strong>Fläche:</strong> Polygon-Tool. Eckpunkte per Klick, Abschluss per Doppelklick oder Enter. Fläche (ha) wird automatisch berechnet. <strong>Wichtig:</strong> Fläche muss einem Knoten zugewiesen werden, sonst fließt kein Regen ins Netz.</li>
                    <li><strong>Löschen:</strong> Kaskadenlöschung — ein Knoten löscht alle angeschlossenen Haltungen mit.</li>
                </ul>

                <h5>🗺️ EZG-Karte (Einzugsgebiete kartieren)</h5>
                <ul>
                    <li><strong>Aktivieren:</strong> Schaltfläche "EZG-Karte" unten links im 2D-Editor. Legt ein echtes Luftbild und Höhenlinien als Hintergrund unter das Netz.</li>
                    <li><strong>Koordinatensystem:</strong> Beim ersten Aktivieren wird das Bezugssystem der Netzkoordinaten (z.B. GK2–GK5, UTM32N/33N) automatisch geschätzt — bitte in der Abfrage prüfen und ggf. korrigieren, sonst liegt das Luftbild an der falschen Stelle.</li>
                    <li><strong>Höhenlinien-Intervall:</strong> Zweite Schaltfläche daneben (z.B. "2m") schaltet den Linienabstand durch (1 m → 2 m → 5 m → aus) — hilfreich, um Wasserscheiden/Kämme für die Einzugsgebietsgrenze zu erkennen.</li>
                    <li>Einzugsgebiete werden weiterhin ganz normal mit dem <strong>Fläche</strong>-Werkzeug über dem Hintergrund nachgezeichnet.</li>
                </ul>

                <h5>📋 Daten bearbeiten (Preprocessing)</h5>
                <ul>
                    <li>Tabellarische Bearbeitung aller Knoten, Haltungen und Flächen.</li>
                    <li><strong>Bulk-Edit:</strong> Mehrere Elemente markieren → Massenänderung in einem Schritt.</li>
                    <li><strong>Sonderbauwerke:</strong> Pumpwerk, Wehr, Becken, Drossel etc. über den "Bauwerke"-Tab konfigurieren.</li>
                    <li>Änderungen werden erst mit <em>"Übernehmen"</em> in das Netz geschrieben.</li>
                </ul>
            </div>
          </div>

          <!-- 3D VIEWER -->
          <div v-if="activeTab === '3d'" class="content-section">
            <h4>3D-Ansicht</h4>
            <p>Die 3D-Szene rendert das Entwässerungsnetz maßstabsgetreu mit echten Sohlhöhen und Profilen — und zeigt nach einer Simulation die hydraulischen Ergebnisse direkt im Raum.</p>

            <h5>🖱️ Navigation</h5>
            <ul>
                <li><strong>Drehen:</strong> Linke Maustaste + Ziehen.</li>
                <li><strong>Zoomen:</strong> Mausrad.</li>
                <li><strong>Verschieben:</strong> Rechte Maustaste + Ziehen (oder Mitteltaste).</li>
                <li><strong>Fokus:</strong> Doppelklick auf ein Element — Kamera zentriert sich darauf.</li>
                <li><strong>Ansicht zurücksetzen:</strong> ↺ Schaltfläche links unten.</li>
            </ul>

            <h5>🎛️ Layer-Steuerung (links unten)</h5>
            <table class="tech-table">
                <tr><th>Schalter</th><th>Funktion</th></tr>
                <tr><td><strong>Schächte</strong></td><td>Schacht- und Bauwerk-Zylinder ein-/ausblenden.</td></tr>
                <tr><td><strong>Haltungen</strong></td><td>Rohre und Gerinne ein-/ausblenden.</td></tr>
                <tr><td><strong>Flächen</strong></td><td>Einzugsflächen als halbtransparente Polygone.</td></tr>
                <tr><td><strong>Z ×n</strong></td><td>Vertikale Überhöhung (1–20×) — für flache Netze empfohlen.</td></tr>
                <tr><td><strong>Ergebnisse</strong></td><td>Ergebnis-Overlay aktivieren (erscheint nach Simulation).</td></tr>
                <tr><td><strong>↳ Wasserstand</strong></td><td>Blaue Wasserstandsmarker in Schächten und Rohren.</td></tr>
            </table>

            <h5>📐 Dargestellte Geometrien</h5>
            <table class="tech-table">
                <tr><th>Element</th><th>3D-Form</th><th>Farbe</th></tr>
                <tr><td>Schacht (Standard)</td><td>Zylinder, Deckel-Scheibe oben</td><td>Grau</td></tr>
                <tr><td>Pumpwerk / Pumpe</td><td>Zylinder + Torus-Ring</td><td>Orange</td></tr>
                <tr><td>Wehr / Überlauf</td><td>Vertikale Platte (Wehrlänge × Tiefe)</td><td>Gelb-Bernstein</td></tr>
                <tr><td>Becken / Speicher</td><td>Quaderförmiger Block</td><td>Türkis</td></tr>
                <tr><td>Drossel / Schieber</td><td>Sechseckiger Zylinder</td><td>Lila</td></tr>
                <tr><td>Auslass</td><td>Kegelform</td><td>Grün</td></tr>
                <tr><td>Fiktiver Knoten</td><td>Kleine Kugel</td><td>Rot</td></tr>
                <tr><td>Kreisprofil</td><td>Tube-Geometrie</td><td>Blau</td></tr>
                <tr><td>Trapez / offenes Gerinne</td><td>Offenes Trapezprofil (ohne Deckel)</td><td>Hellgrau</td></tr>
                <tr><td>Rechteck (geschl.)</td><td>Geschlossenes Rechteckrohr</td><td>Lila</td></tr>
                <tr><td>Maulprofil</td><td>Hufeisen-Querschnitt</td><td>Stahlblau</td></tr>
            </table>

            <h5>🎨 Ergebnis-Overlay (nach Simulation)</h5>
            <div class="audit-block">
                <p>Aktivierbar über <em>"Ergebnis 3D"</em> in der Navigation oder den <em>"Ergebnisse"</em>-Toggle im Kontrollpanel.</p>
                <table class="tech-table">
                    <tr><th>Farbe</th><th>Bedeutung (Knoten)</th></tr>
                    <tr><td><span class="color-dot" style="background:#c0392b"></span> Rot</td><td>Überstau / Einstau — Wasser tritt an Oberfläche aus</td></tr>
                    <tr><td><span class="color-dot" style="background:#e67e22"></span> Orange</td><td>Druckabfluss — Rohr / Schacht unter vollem Druck</td></tr>
                    <tr><th>Farbe</th><th>Bedeutung (Haltungen — Auslastung)</th></tr>
                    <tr><td><span class="color-dot" style="background:#c0392b"></span> Rot</td><td>&gt; 90 % Kapazität</td></tr>
                    <tr><td><span class="color-dot" style="background:#e67e22"></span> Orange</td><td>&gt; 75 % Kapazität</td></tr>
                    <tr><td><span class="color-dot" style="background:#f1c40f"></span> Gelb</td><td>&gt; 50 % Kapazität</td></tr>
                    <tr><td><span class="color-dot" style="background:#2980b9"></span> Blau</td><td>≤ 50 % — unkritisch</td></tr>
                    <tr><th>Symbol</th><th>Bedeutung (Wasserstand)</th></tr>
                    <tr><td><span class="color-dot" style="background:#3498db;opacity:0.75"></span> Blau (transparent)</td><td>Scheibe im Schacht = maximaler Wasserstand. Ribbon in Haltung = max. Füllstand.</td></tr>
                </table>
            </div>

            <h5>ℹ️ Info-Panel (Klick auf Element)</h5>
            <p>Ein Klick auf jeden Schacht oder jede Haltung öffnet das Info-Panel (oben rechts). Es zeigt Geometrie-Daten und — wenn Ergebnisse vorhanden — die hydraulischen Kenngrößen: Überstau-Status, max. Wasserstand, max. Zufluss, Auslastung und Geschwindigkeit.</p>
          </div>

          <!-- RESULTS / ANALYSIS -->
          <div v-if="activeTab === 'results'" class="content-section">
            <h4>Ergebnisse & Analyse</h4>

            <h5>📊 Ergebnistabellen</h5>
            <table class="tech-table">
                <tr><th>Metrik</th><th>Bedeutung</th><th>Grenzwert</th></tr>
                <tr><td><strong>Auslastung (d/D)</strong></td><td>Max. Wasserspiegelhöhe im Verhältnis zum Profilhöhe. Wert &gt; 1.0 = Druckabfluss.</td><td><span class="tag q-warn">&gt; 100 %</span></td></tr>
                <tr><td><strong>Überstauvolumen</strong></td><td>Wasser, das den Schacht verlässt und "oberirdisch steht". Wird als Ponded Volume modelliert.</td><td>&gt; 0 m³</td></tr>
                <tr><td><strong>v_max</strong></td><td>Maximale Fließgeschwindigkeit in der Haltung.</td><td>&gt; 5 m/s (Erosion)</td></tr>
                <tr><td><strong>Massenbilanz-Fehler</strong></td><td>Kontinuitätsfehler des gesamten Systems. Gütekriterium für die Modellstabilität.</td><td>&lt; 2 % = gut</td></tr>
            </table>

            <h5>📈 Ganglinien (Zeitreihen)</h5>
            <p>Im Ergebnisfenster → Reiter "Zeitreihen": zeitlicher Verlauf von Zufluss, Abfluss und Wasserstand an jedem Element. Auswahl über Dropdown oder Klick in die Tabelle.</p>

            <h5>🗺️ Räumliche Analyse in 3D</h5>
            <p>Der Button <strong>"Ergebnis 3D"</strong> (erscheint nach Simulation) öffnet direkt die 3D-Szene mit aktiviertem Ergebnis-Overlay. Kritische Bereiche (rot/orange) sind sofort räumlich erkennbar. Klick auf einen Knoten oder eine Haltung zeigt die Detailwerte im Info-Panel.</p>
          </div>

          <!-- SIMULATION DEEP DIVE -->
          <div v-if="activeTab === 'simulation'" class="content-section">
            <h4>Simulation Internals</h4>
            <div class="audit-block">
                <h5>🌊 Hydraulisches Modell</h5>
                <ul>
                    <li><strong>Solver:</strong> SWMM 5 Dynamic Wave — vollständige St.-Venant-Gleichungen (Kontinuität + Impuls). Berücksichtigt Rückstau, Druckabfluss und Speichereffekte.</li>
                    <li><strong>Zeitschrittsteuerung:</strong> Adaptiv via Courant-Kriterium (typisch 0.5–30 s).</li>
                    <li><strong>Ausführungsumgebung:</strong> WebAssembly (Wasm) im Browser-Hauptthread via Worker — kein Server, vollständig lokal.</li>
                </ul>

                <h5>🔩 Sonderbauwerke (Mapping)</h5>
                <table class="tech-table">
                    <tr><th>Bauwerkstyp</th><th>SWMM-Äquivalent</th><th>Parameter</th></tr>
                    <tr><td>Pumpwerk (1/6)</td><td>PUMP mit On/Off-Kurve</td><td>Förderleistung, Ein-/Austiefe</td></tr>
                    <tr><td>Wehr / Überlauf (7)</td><td>WEIR (Transverse)</td><td>Höhe, Länge, Cw-Beiwert</td></tr>
                    <tr><td>Becken / Speicher (2–4, 12–13)</td><td>STORAGE</td><td>Volumen, max. Tiefe, Funktionskurve</td></tr>
                    <tr><td>Drossel (8)</td><td>ORIFICE</td><td>Max. Abfluss</td></tr>
                    <tr><td>Schieber (9)</td><td>ORIFICE mit Öffnungsgrad</td><td>Anfangsöffnung</td></tr>
                    <tr><td>Auslass (5)</td><td>OUTFALL (free)</td><td>—</td></tr>
                </table>

                <h5>🌧️ Profil-Geometrien (3D + Solver)</h5>
                <table class="tech-table">
                    <tr><th>Typ</th><th>3D-Form</th><th>SWMM-Profil</th></tr>
                    <tr><td>Kreis (0)</td><td>TubeGeometry</td><td>CIRCULAR</td></tr>
                    <tr><td>Ei (1)</td><td>Ellipsen-Extrusion</td><td>EGG (H:B ≈ 3:2)</td></tr>
                    <tr><td>Maulprofil (2)</td><td>Hufeisen-Extrusion</td><td>BASKETHANDLE</td></tr>
                    <tr><td>Rechteck geschl. (3)</td><td>Rechteck-Extrusion</td><td>RECT_CLOSED</td></tr>
                    <tr><td>Trapez / Gerinne (4/8)</td><td>Offene Trapez-Extrusion</td><td>TRAPEZOIDAL</td></tr>
                    <tr><td>Rechteck offen (5)</td><td>Offene Rechteck-Extrusion</td><td>RECT_OPEN</td></tr>
                </table>
            </div>
          </div>

          <!-- FILE FORMATS -->
          <div v-if="activeTab === 'files'" class="content-section">
            <h4>Datenformate</h4>
            <p>Über <em>"Debug"</em> in der Seitenleiste können die internen Simulationsdateien eingesehen und exportiert werden.</p>

            <h5>📥 ISYBAU XML (Eingabe)</h5>
            <p>ISYBAU XML ist das deutsche Standardformat für Kanalnetzdaten (DIN EN 13508-2). SaintV liest: Haltungsgeometrie, Schachtkoten, Profildaten, Bauwerkstypen, Flächenzuordnungen.</p>

            <h5>📝 .inp (SWMM Input)</h5>
            <div class="code-block">
[JUNCTIONS]
;;Name   Elev   MaxDepth   InitDepth
Node1    45.50  3.00       0

[CONDUITS]
;;Name   From    To      Length   Manning   InOffset
Pipe1    Node1   Node2   50.00    0.013     0

[WEIRS]
;;Name   From   To    Type        CrestHt   Cd
Wehr1    S1     S2    TRANSVERSE  1.20      1.84</div>
            <p>Enthält die vollständige Topologie und Parametrierung. Kompatibel mit EPA SWMM, PCSWMM und SWMM-Live.</p>

            <h5>📄 .rpt (SWMM Report)</h5>
            <div class="code-block">
  Link Flow Summary
  -----------------
  Link      Max Q    Time     Max |V|   Max d/D
  Pipe1     45.2     02:15    0.85      0.45
  Pipe2    132.8     02:30    1.20      0.91  *</div>
            <p>Dieser Textbericht ist die Basis für alle Tabellen und Ganglinien im UI. * = Druckabfluss.</p>
          </div>

          <!-- SYSTEM LIMITS -->
          <div v-if="activeTab === 'limits'" class="content-section">
            <h4>Grenzen & bekannte Einschränkungen</h4>
            <div class="warning-block">
                <p>Was SaintV – 1D aktuell <strong>nicht</strong> kann:</p>
                <ul>
                    <li>❌ <strong>2D-Oberflächenabfluss:</strong> Überflutetes Wasser wird als Ponded Volume protokolliert, fließt aber nicht oberirdisch ab.</li>
                    <li>❌ <strong>Stofftransport:</strong> Reine Hydraulik — keine Schmutzfracht oder Qualitätssimulation.</li>
                    <li>❌ <strong>Zeitabhängige Steuerung:</strong> Pumpen und Schieber werden mit konstantem Betrieb parametriert — keine Rule-Based-Controls.</li>
                    <li>❌ <strong>Volumen-Kurven für Becken:</strong> Speicherknoten erhalten eine vereinfachte Flächenfunktion (konstant) statt echter Kurve.</li>
                    <li>❌ <strong>Große Netze (&gt; 2000 Elemente):</strong> 3D-Darstellung ohne LOD/Culling — Performance-Einbußen möglich.</li>
                </ul>
            </div>
            <div class="audit-block" style="margin-top:1.5rem">
                <p style="font-weight:600;margin-bottom:0.75rem">Produktionsreife (Stand V.1.03)</p>
                <table class="tech-table">
                    <tr><th>Modul</th><th>Status</th><th>Hinweis</th></tr>
                    <tr><td>ISYBAU-Import</td><td><span class="tag" style="background:#dcfce7;color:#166534">✓ Stabil</span></td><td>Alle gängigen ISYBAU-Strukturen</td></tr>
                    <tr><td>SWMM-Solver</td><td><span class="tag" style="background:#dcfce7;color:#166534">✓ Stabil</span></td><td>SWMM 5.1, WebAssembly</td></tr>
                    <tr><td>2D-Editor</td><td><span class="tag" style="background:#dcfce7;color:#166534">✓ Stabil</span></td><td>—</td></tr>
                    <tr><td>Ergebnistabellen</td><td><span class="tag" style="background:#dcfce7;color:#166534">✓ Stabil</span></td><td>—</td></tr>
                    <tr><td>3D-Ansicht (Geometrie)</td><td><span class="tag" style="background:#fef9c3;color:#713f12">⚠ Beta</span></td><td>Profil-Extrusion, Sonderbauwerke</td></tr>
                    <tr><td>3D Ergebnis-Overlay</td><td><span class="tag" style="background:#fef9c3;color:#713f12">⚠ Beta</span></td><td>Farben, Wasserstand-Marker</td></tr>
                    <tr><td>Sonderbauwerke (Modell)</td><td><span class="tag" style="background:#fef9c3;color:#713f12">⚠ Beta</span></td><td>Pumpen, Wehre — grundlegend funktionsfähig</td></tr>
                </table>
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
import { useTutorialGuide } from '../../tutorial/useTutorialGuide.js';

defineProps({
  isOpen: Boolean
});

const emit = defineEmits(['close']);

const { resetAndStartTour } = useTutorialGuide();

function restartTutorial() {
  emit('close'); // Modal zu, damit die Ratte freie Sicht hat
  resetAndStartTour();
}

const userTabs = [
  { id: 'general', label: 'Allgemein' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'editor', label: 'Editor & Tools' },
  { id: '3d', label: '3D Ansicht' },
  { id: 'results', label: 'Ergebnisse & Analyse' },
];

const techTabs = [
  { id: 'simulation', label: 'Simulation Deep Dive' },
  { id: 'files', label: 'Datenformate (.inp/.rpt)' },
  { id: 'limits', label: 'Grenzen des Systems' }
];

const activeTab = ref('general');
</script>

<style scoped src="./shared/modalBase.css"></style>
<style scoped>
/* Reuse styles from previous step */
.help-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: 'Inter', sans-serif;
  color: var(--isy-pixel-bg, #040647);
  background: var(--isy-pixel-text, #fff);
}

.modal-header {
  padding: 1rem;
  background: var(--isy-pixel-bg, #040647);
}

.modal-header h3 {
  font-family: var(--isy-pixel-font);
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0;
  color: var(--isy-pixel-text-dim, #4a4a4a);
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
    font-family: var(--isy-pixel-font);
    font-size: 0.42rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--isy-pixel-border-hover, #65625c);
    margin-bottom: 0.4rem;
    padding-left: 0.5rem;
}

/* Vertikale Sidebar-Nav — bewusst kein boxed Pixel-Button (siehe Design Schema
   unten): text-align:left + volle Breite passen nicht zu einer Button-Reihe. */
.tab-btn {
  text-align: left;
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  border-left: 3px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  color: var(--isy-pixel-border, #4a4844);
  font-weight: 500;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.tutorial-btn {
  color: var(--isy-pixel-green-active, #00994d);
  border-left-color: var(--isy-pixel-green-glow, #128040);
}
.tutorial-btn:hover {
  background: rgba(0, 232, 85, 0.08);
  color: #007a3d;
}

.tab-btn:hover {
  background: var(--isy-pixel-content-bg, #f3f2fb);
  color: var(--isy-pixel-green, #219653);
}

.tab-btn.active {
  background: var(--isy-pixel-content-bg, #f3f2fb);
  color: var(--isy-pixel-green, #219653);
  border-left-color: var(--isy-pixel-green, #219653);
  font-weight: 700;
}

.tab-btn.tech-btn.active {
    color: var(--isy-pixel-green, #219653);
    border-left-color: var(--isy-pixel-border-hover, #65625c);
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
  font-family: var(--isy-pixel-font);
  font-size: 0.52rem;
  letter-spacing: -0.02em;
  color: #1e293b;
  border-bottom: 2px solid #f1f5f9;
  padding-bottom: 0.75rem;
}

.content-section h5 {
  margin-top: 2rem;
  margin-bottom: 1rem;
  font-family: var(--isy-pixel-font);
  font-size: 0.6rem;
  color: #475569;
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

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin: 1rem 0;
}

.info-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1rem;
  font-size: 0.9rem;
  color: #475569;
  line-height: 1.5;
}

.info-card-title {
  font-family: var(--isy-pixel-font);
  font-size: 0.44rem;
  color: #1e293b;
  margin-bottom: 0.5rem;
}

.color-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 0.4rem;
  vertical-align: middle;
  flex-shrink: 0;
}

.workflow-list {
  padding-left: 1.5rem;
}

.workflow-list li {
  margin-bottom: 1rem;
  line-height: 1.6;
  color: #475569;
}

</style>
