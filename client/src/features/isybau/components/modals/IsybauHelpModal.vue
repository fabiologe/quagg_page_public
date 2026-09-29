<template>
  <DraggableModal name="Bedienungsanleitung" 
    :is-open="isOpen" 
    initial-width="1000px" 
    initial-height="800px"
    @close="$emit('close')"
  >
    <div class="help-container">
      <div class="modal-header">
        <h3>ℹ️ SaintV – 1D · Bedienungsanleitung (Stand 26.09.2026)</h3>
        <button title="Schließen" aria-label="Schließen" class="close-btn" @click="$emit('close')">×</button>
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
              <strong>SaintV – 1D</strong> ist eine browserbasierte Oberfläche für die hydraulische Berechnung von Entwässerungsnetzen.
              Rechenkern ist <strong>EPA SWMM 5.2.4</strong> (Storm Water Management Model), als WebAssembly im Browser ausgeführt.
            </p>
            <div class="info-grid">
              <div class="info-card">
                <div class="info-card-title">Dateneingabe</div>
                ISYBAU-XML (Stammdaten, Austauschformat 2017-07) importieren oder das Netz im 2D-Editor zeichnen („Neu starten“ mit Standort).
              </div>
              <div class="info-card">
                <div class="info-card-title">Berechnung</div>
                Dynamic Wave (vollständige Saint-Venant-Gleichungen): Rückstau, Einstau, Druckabfluss, Speicher und Sonderbauwerke.
              </div>
              <div class="info-card">
                <div class="info-card-title">Datenschutz</div>
                Netz, Rechnung und Ergebnisse bleiben im Browser. Nur ein Punkt (Koordinate) verlässt ihn: für KOSTRA-Regen, Geländehöhen und Luftbild (über Server-Proxys bzw. Esri) und für die Adresssuche.
              </div>
              <div class="info-card">
                <div class="info-card-title">Darstellung</div>
                2D-Karte mit Ergebnisfärbung, 3D-Szene mit Wasserständen, Ergebnisfenster mit Ganglinien, PDF-Bericht.
              </div>
            </div>
          </div>

          <!-- WORKFLOW -->
          <div v-if="activeTab === 'workflow'" class="content-section">
            <h4>Typischer Ablauf</h4>
            <ol class="workflow-list">
              <li>
                <strong>Netz laden</strong>
                „XML importieren“ (Kodierung laut Dateikopf, z. B. ISO-8859-1) oder „Neu starten“ und zeichnen. Fehlende oder ersetzte Werte nennt der Import-Bericht (z. B. „Profilhöhe fehlt“).
              </li>
              <li>
                <strong>Daten prüfen und ergänzen</strong>
                „Daten bearbeiten“ öffnet die Tabellen (Schächte, Bauwerke, Haltungen, Flächen). Mehrere Zeilen anhaken → „Bearbeiten“ für Sammeländerungen. Erst „Übernehmen“ schreibt ins Netz; beim Schließen ohne Übernehmen wird nachgefragt.
              </li>
              <li>
                <strong>Gelände (optional)</strong>
                „Gelände (DGM) laden“ (XYZ-Raster) — für 3D, Höhenlinien und den Vorschlag der Neigungsklasse von Flächen.
              </li>
              <li>
                <strong>Regen festlegen</strong>
                „KOSTRA“ ruft die Regenspenden rN(D, T) für den Netzstandort ab; „Übernehmen“ setzt einen Blockregen. „Modellregen“ baut einen Euler-Typ-II-Regen nach DWA-A 118 aus den KOSTRA-Werten oder einen Blockregen mit eigener Intensität.
              </li>
              <li>
                <strong>Berechnen</strong>
                Simulationsdauer (1–48 h) und Überstauverfahren wählen („Automatisch“ rechnet SLOT und EXTRAN und nimmt das plausiblere). „Berechnung starten“ prüft das Netz vorab (z. B. Profil 0, Auslass mit zwei Haltungen, doppelte Namen) und springt mit „→ Element öffnen“ zum Fehler. „Abbrechen“ beendet eine laufende Rechnung.
              </li>
              <li>
                <strong>Ergebnisse auswerten</strong>
                Ergebnisfenster (Allgemein, Haltungen, Schächte, Teilflächen), „Ergebnisse“ als 2D-Karte, „Ergebnis 3D“, PDF-Bericht und JSON-Export. Nach einer Änderung am Netz oder Regen gilt das Ergebnis als „veraltet“.
              </li>
              <li>
                <strong>Sichern und weitergeben</strong>
                „Projekte“ speichert im Browser (IndexedDB). „XML exportieren“ schreibt ISYBAU-XML; Felder ohne ISYBAU-Element (druckdicht, Aufteilung, Pumpensteuerung, Wasserverbrauch …) stehen als Kommentar am Dateiende und werden von SaintV wieder eingelesen.
              </li>
            </ol>
          </div>

          <!-- EDITOR -->
          <div v-if="activeTab === 'editor'" class="content-section">
            <h4>2D-Editor</h4>
            <div class="audit-block">
                <h5>🗺️ Navigation</h5>
                <ul>
                    <li><strong>Verschieben:</strong> Ziehen auf leerer Fläche. <strong>Zoom:</strong> Mausrad oder Zwei-Finger-Geste.</li>
                    <li><strong>Auswahl:</strong> Klick auf ein Element öffnet das Info-Fenster (Eigenschaften, im Ergebnismodus die Ergebnisse).</li>
                    <li><strong>Textgröße:</strong> Regler „T“ unten — gilt für Editor- und Ergebniskarte gemeinsam und wird im Browser gemerkt.</li>
                    <li><strong>Beschriftungen</strong> weichen einander aus; wo kein Platz ist, werden sie ausgeblendet. Schachtnamen lassen sich verschieben.</li>
                </ul>

                <h5>🛠️ Werkzeuge (Leiste oben)</h5>
                <ul>
                    <li><strong>Schacht, Haltung, Fläche:</strong> anlegen; Haltungen in Fließrichtung (erst oberer, dann unterer Schacht); Flächen per Klick je Eckpunkt, Abschluss mit Doppelklick oder Enter. Profilmaße in mm. Rauheit: leer = automatisch nach DWA-A 110 (betriebliche Rauheit kb 0,75 mm, Mauerwerk/Ortbeton 1,50, Druckleitung 0,25 mm; offene Gerinne kSt aus dem Material); eine Zahl im Feld ist ein fester kSt. Bestandshaltungen (ISYBAU-Status „vorhanden“) rechnen mit 95 % der Nennweite.</li>
                    <li><strong>Haltung teilen:</strong> Knoten in eine bestehende Haltung einbauen.</li>
                    <li><strong>Rechteckauswahl:</strong> Rahmen aufziehen (Shift = hinzufügen), dann gemeinsam löschen oder bearbeiten.</li>
                    <li><strong>Eckpunkte einer Fläche:</strong> ausgewählte Fläche — Punkte ziehen, Doppelklick auf eine Kante fügt einen Punkt ein.</li>
                    <li><strong>Rückgängig / Wiederholen</strong> (reicht nicht über einen Import oder Projektwechsel zurück). <strong>Entf</strong> löscht das gewählte Element; ein Schacht nimmt seine Haltungen mit.</li>
                    <li><strong>Escape</strong> beendet das aktive Werkzeug bzw. schließt das oberste Fenster.</li>
                </ul>

                <h5>🗺️ EZG-Karte</h5>
                <ul>
                    <li>„EZG-Karte“ legt Luftbild und Höhenlinien unter das Netz. Beim ersten Einschalten das geschätzte Koordinatensystem bestätigen.</li>
                    <li>Der Knopf daneben schaltet den Höhenlinienabstand durch (1 m → 2 m → 5 m → aus). Mit geladenem DGM kommen die Höhenlinien aus dem eigenen Gelände.</li>
                </ul>

                <h5>📋 Daten bearbeiten</h5>
                <ul>
                    <li>Knoten: Sohle, Deckel, Durchmesser, „druckdicht“ (Deckel verschlossen), konstanter Zufluss, Bauwerkstyp.</li>
                    <li>Bauwerke: Pumpe (Förderstrom, Förderhöhe, Ein-/Ausschalttiefe, Kennlinie), Wehr, Drossel, Schieber, Becken (vier Formen inkl. Tabelle), Verteiler, Auslauf.</li>
                    <li>Flächen: Größe, Abflussbeiwert ψ, Neigungsklasse (Vorschlag aus dem DGM), Anschluss an Knoten oder Haltung mit Aufteilung, Schmutzfracht (Einwohner, Wasserverbrauch, Tagesspitzenfaktor → Trockenwetterzufluss).</li>
                    <li>„Excel“ exportiert alle Tabellen.</li>
                </ul>
            </div>
          </div>

          <!-- 3D VIEWER -->
          <div v-if="activeTab === '3d'" class="content-section">
            <h4>3D-Ansicht</h4>
            <p>Die 3D-Szene zeigt das Netz mit echten Sohl- und Deckelhöhen und Profilen, auf Wunsch mit Gelände — nach einer Rechnung mit den Ergebnissen.</p>

            <h5>🖱️ Navigation</h5>
            <ul>
                <li><strong>Drehen:</strong> linke Maustaste + Ziehen. <strong>Zoomen:</strong> Mausrad. <strong>Verschieben:</strong> rechte Maustaste + Ziehen.</li>
                <li><strong>Ansicht zurücksetzen:</strong> ↺ links unten.</li>
            </ul>

            <h5>🎛️ Schalter (links unten)</h5>
            <table class="tech-table">
                <tr><th>Schalter</th><th>Funktion</th></tr>
                <tr><td><strong>Schächte / Haltungen / Flächen</strong></td><td>ein- und ausblenden; Flächen liegen auf der Deckelhöhe ihrer Anschlussknoten.</td></tr>
                <tr><td><strong>Gelände</strong></td><td>DGM (oder ~30-m-Höhendaten aus dem Netz, wenn kein eigenes geladen ist).</td></tr>
                <tr><td><strong>Drahtkörper</strong></td><td>Rohre und Schächte als Gitter — macht Wasserstände im Inneren sichtbar.</td></tr>
                <tr><td><strong>Z ×n</strong></td><td>Überhöhung 1–20×.</td></tr>
                <tr><td><strong>Ergebnisse / ↳ Wasserstand</strong></td><td>Ergebnisfärbung und maximale Wasserstände (nach einer Rechnung).</td></tr>
            </table>

            <h5>📐 Formen</h5>
            <table class="tech-table">
                <tr><th>Element</th><th>Form</th></tr>
                <tr><td>Schacht</td><td>Zylinder, Farbe nach Kanaltyp (Regen-, Schmutz-, Mischwasser)</td></tr>
                <tr><td>Bauwerke</td><td>eine Farbe (graubeige), der Typ steckt in der Form: Kegel = Auslass, Zylinder = Pumpwerk, Quader = Becken, Platte = Wehr</td></tr>
                <tr><td>Vom Import erzeugter Knoten</td><td><span class="color-dot" :style="{ background: DATENQUALITAET.fiktiv }"></span> kleine türkise Kugel</td></tr>
                <tr><td>Haltungen</td><td>Rohr bzw. offenes Rechteck-/Trapezprofil</td></tr>
            </table>

            <h5>🎨 Ergebnisfärbung</h5>
            <div class="audit-block">
                <table class="tech-table">
                    <tr><th>Farbe</th><th>Bedeutung (Knoten)</th></tr>
                    <tr><td><span class="color-dot" :style="{ background: UEBERSTAU_HELL }"></span> Weinrot + Marker</td><td>Schacht überstaut — Wasser tritt über den Deckel aus (Marker in fester Bildschirmgröße)</td></tr>
                    <tr><td><span class="color-dot" :style="{ background: KNOTEN_ZUSTAND.druckabfluss }"></span> Orange</td><td>Schacht eingestaut — Wasserspiegel über dem Rohrscheitel</td></tr>
                    <tr><th>Farbe</th><th>Bedeutung (Haltungen — Auslastung Q/Qvoll)</th></tr>
                    <tr v-for="st in AUSLASTUNG_STUFEN" :key="st.text"><td><span class="color-dot" :style="{ background: st.farbe }"></span></td><td>{{ st.text }}</td></tr>
                    <tr><th>Symbol</th><th>Bedeutung (Wasserstand)</th></tr>
                    <tr><td><span class="color-dot" :style="{ background: KNOTEN_ZUSTAND.wasserstand, opacity: 0.75 }"></span> Blau</td><td>Scheibe im Schacht = maximaler Wasserstand, Band in der Haltung = maximale Füllung</td></tr>
                </table>
            </div>
          </div>

          <!-- RESULTS / ANALYSIS -->
          <div v-if="activeTab === 'results'" class="content-section">
            <h4>Ergebnisse & Auswertung</h4>

            <h5>📊 Kenngrößen</h5>
            <table class="tech-table">
                <tr><th>Größe</th><th>Bedeutung</th><th>Markierung</th></tr>
                <tr><td><strong>Auslastung Q/Qvoll</strong></td><td>Max. Abfluss durch Vollfüllungsabfluss (Qvoll exakt aus dem Rechenkern). Nach ihr sind Karte, 3D, Tabellen und PDF gefärbt.</td><td><span class="tag q-warn">&gt; 100 % = überlastet</span></td></tr>
                <tr><td><strong>Füllungsgrad h/hvoll</strong></td><td>Max. Wasserstand durch Profilhöhe. Ab 0,99 (oder beidseitig voll) ist die Haltung eingestaut — auch bei kleinem Abfluss, etwa im Rückstau.</td><td>eingestaut, Karte gestrichelt</td></tr>
                <tr><td><strong>Überstau (Schacht)</strong></td><td>Wasser tritt über den Deckel aus (SWMM „Node Flooding“ oder Wasserspiegel über Deckel); Volumen in m³.</td><td>weinrot</td></tr>
                <tr><td><strong>Einstau (Schacht)</strong></td><td>Wasserspiegel über dem Scheitel der höchsten Haltung, unter dem Deckel.</td><td>orange</td></tr>
                <tr><td><strong>Modellgüte</strong></td><td>Stufe aus Systembilanz (&gt; 1 % prüfen, &gt; 5 % kritisch), Knoten mit ≥ 10 % Kontinuitätsfehler und nicht konvergierten Zeitschritten — mit Begründung.</td><td>gut / prüfen / kritisch</td></tr>
            </table>

            <h5>📈 Ganglinien</h5>
            <p>In den Reitern „Haltungen“, „Schächte“ und „Teilflächen“ öffnet „Details“ die Ganglinie des Elements (aus der Binärausgabe .out, Zeit ab Simulationsbeginn). Teilflächen: Spitzenabfluss in l/s aus der Ganglinie, Volumen = Abflusshöhe × Fläche.</p>

            <h5>📄 Bericht und Export</h5>
            <p>„PDF“ erzeugt den Simulationsbericht (Kennzahlen, Bilanz, Karte, Tabellen der Haltungen, Pumpen/Sonderbauwerke, Schächte und Teilflächen). „Result (.json)“ in der Seitenleiste enthält zusätzlich die Eingangsdaten, den gerechneten Regen und je Haltung Q/Qvoll und Einstau.</p>
          </div>

          <!-- SIMULATION DEEP DIVE -->
          <div v-if="activeTab === 'simulation'" class="content-section">
            <h4>Rechenkern</h4>
            <div class="audit-block">
                <h5>🌊 Hydraulisches Modell</h5>
                <ul>
                    <li><strong>Solver:</strong> SWMM 5.2.4, Dynamic Wave (Kontinuität + Impuls), Knoten-Haltungs-Modell.</li>
                    <li><strong>Zeitschritt:</strong> Rechenschritt höchstens 1 s, variabel (Courant-Faktor 0,75); Ausgabe je Minute.</li>
                    <li><strong>Überstauverfahren:</strong> SLOT (Preissmann-Schlitz) oder EXTRAN; „Automatisch“ rechnet beide und nimmt das plausiblere (Bilanz ≤ 5 %, Wasserspiegel nicht über dem höchsten Deckel).</li>
                    <li><strong>Ausführung:</strong> WebAssembly in einem Web Worker — die Oberfläche bleibt bedienbar.</li>
                </ul>

                <h5>🔩 Bauwerke → SWMM</h5>
                <table class="tech-table">
                    <tr><th>Bauwerkstyp</th><th>SWMM</th><th>Parameter</th></tr>
                    <tr><td>Pumpe (6)</td><td>PUMP (Kennlinie Typ 3)</td><td>Förderstrom, Förderhöhe, Ein-/Ausschalttiefe</td></tr>
                    <tr><td>Pumpwerk (1), Becken (2, 12, 13)</td><td>STORAGE</td><td>Volumen, Tiefe, Form (4 Formen inkl. Tabelle)</td></tr>
                    <tr><td>Typ 3, 4 mit Volumen</td><td>STORAGE</td><td>sonst Auslass</td></tr>
                    <tr><td>Wehr / Überlauf (7)</td><td>WEIR (transverse)</td><td>Schwellenhöhe, Länge, Cw 1,89</td></tr>
                    <tr><td>Drossel (8), Schieber (9)</td><td>ORIFICE</td><td>Abfluss bzw. Öffnung</td></tr>
                    <tr><td>Auslauf (5)</td><td>OUTFALL (frei)</td><td>—</td></tr>
                    <tr><td>Verteiler</td><td>DIVIDER</td><td>Overflow/Cutoff, abgezweigte Haltung</td></tr>
                </table>

                <h5>🌧️ Profile</h5>
                <table class="tech-table">
                    <tr><th>Profil (ISYBAU)</th><th>SWMM</th></tr>
                    <tr><td>Kreis (0), Kreis doppelwandig (4)</td><td>CIRCULAR</td></tr>
                    <tr><td>Ei (1)</td><td>EGG</td></tr>
                    <tr><td>Ei H/B ≠ 3/2 (6)</td><td>EGG — Näherung, Breite unberücksichtigt</td></tr>
                    <tr><td>Maul (2, 7)</td><td>ARCH — Näherung, Form weicht von DIN 4263 ab</td></tr>
                    <tr><td>Rechteck geschlossen (3)</td><td>RECT_CLOSED</td></tr>
                    <tr><td>Rechteck offen (5)</td><td>RECT_OPEN</td></tr>
                    <tr><td>Trapez (8)</td><td>TRAPEZOIDAL</td></tr>
                    <tr><td>Doppeltrapez, U-förmig, bogenförmig, oval, andere (9–13)</td><td>CIRCULAR — Näherung (Höhe = Durchmesser); jede Näherung wird im Ergebnis gemeldet</td></tr>
                </table>
            </div>
          </div>

          <!-- FILE FORMATS -->
          <div v-if="activeTab === 'files'" class="content-section">
            <h4>Datenformate</h4>
            <p>„Debug“ in der Seitenleiste zeigt Eingabe (.inp) und Bericht (.rpt) des letzten Laufs zum Ansehen und Herunterladen.</p>

            <h5>📥 ISYBAU-XML</h5>
            <p>Austauschformat Abwasser der Arbeitshilfen Abwasser (Version 2017-07). SaintV liest Stammdaten (Schächte, Bauwerke, Haltungen mit Geometrie) und Hydraulikdaten (Flächen, Gebiete). Inspektionsdaten werden gelesen, aber nicht wieder exportiert.</p>

            <h5>📝 .inp (SWMM-Eingabe)</h5>
            <div class="code-block">
[JUNCTIONS]
;;Name   Elev   MaxDepth   InitDepth
Node1    45.50  3.00       0

[CONDUITS]
;;Name   From    To      Length   Manning   InOffset
Pipe1    Node1   Node2   50.00    0.013     0

[WEIRS]
;;Name   From   To    Type        CrestHt   Cd
Wehr1    S1     S2    TRANSVERSE  1.20      1.89</div>
            <p>Vollständige Topologie und Parameter; in EPA SWMM direkt lesbar.</p>

            <h5>📄 .rpt und .out</h5>
            <p>Der Textbericht (.rpt) liefert die Summentabellen (Maxima, Bilanzen, Überstau, Pumpen). Die Ganglinien stammen aus der Binärausgabe (.out).</p>
          </div>

          <!-- SYSTEM LIMITS -->
          <div v-if="activeTab === 'limits'" class="content-section">
            <h4>Grenzen</h4>
            <div class="warning-block">
                <p>Was SaintV – 1D <strong>nicht</strong> kann:</p>
                <ul>
                    <li>❌ <strong>Oberflächenabfluss in 2D:</strong> Überstauwasser wird als Volumen am Schacht geführt, fließt aber nicht oberirdisch weiter.</li>
                    <li>❌ <strong>Stofftransport:</strong> reine Hydraulik — keine Schmutzfracht-Konzentrationen, keine Qualitätsrechnung.</li>
                    <li>❌ <strong>Steuerregeln:</strong> Pumpen schalten nur nach Wasserstand (Ein-/Ausschalttiefe), keine zeit- oder regelbasierte Steuerung.</li>
                    <li>❌ <strong>Langzeitsimulation / Überstauhäufigkeit:</strong> ein Regenereignis je Lauf.</li>
                    <li>⚠️ <strong>Verteiler</strong> wirken im Dynamic-Wave-Verfahren nicht wie im kinematischen Verfahren (SWMM-Eigenschaft).</li>
                    <li>⚠️ <strong>Pumpwerk (Typ 1)</strong> wird nur als Speicher gerechnet.</li>
                    <li>⚠️ <strong>Große Netze (&gt; 2000 Elemente):</strong> die 3D-Szene kann langsam werden.</li>
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
import { AUSLASTUNG_STUFEN, KNOTEN_ZUSTAND, UEBERSTAU_HELL, DATENQUALITAET } from '../../utils/typPalette.js';
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
  color: var(--isy-pixel-bg);
  background: var(--isy-pixel-text);
}

.modal-header {
  padding: var(--isy-space-4);
  background: var(--isy-pixel-bg);
}

.modal-header h3 {
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0;
  /* Steht auf --isy-pixel-bg (im Dunkelmodus Navy), nicht auf Papier —
     also das Modus-Token. Umgekehrt waren es 2,1:1. */
  color: var(--isy-pixel-text-dim);
}

.modal-body {
  display: flex;
  flex: 1;
  overflow: hidden; 
}

.help-sidebar {
  width: 240px;
  background: var(--isy-pixel-content-raised);
  padding: var(--isy-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--isy-space-6);
  border-right: 1px solid var(--isy-pixel-divider);
  flex-shrink: 0;
}

.sidebar-group {
    display: flex;
    flex-direction: column;
    gap: var(--isy-space-2);
}

.group-title {
    font-family: var(--isy-pixel-font);
    font-size: var(--isy-fs-pixel-sm);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--isy-pixel-border-hover);
    margin-bottom: var(--isy-space-2);
    padding-left: var(--isy-space-2);
}

/* Vertikale Sidebar-Nav — bewusst kein boxed Pixel-Button (siehe Design Schema
   unten): text-align:left + volle Breite passen nicht zu einer Button-Reihe. */
.tab-btn {
  text-align: left;
  padding: var(--isy-space-3) var(--isy-space-4);
  background: transparent;
  border: none;
  border-left: 3px solid transparent;
  border-radius: var(--isy-radius-md);
  cursor: var(--isy-cursor-hand);
  color: var(--isy-pixel-border);
  font-weight: 500;
  font-size: var(--isy-fs-lg);
  transition: all 0.2s;
}

.tutorial-btn {
  color: var(--isy-pixel-green-active);
  border-left-color: var(--isy-pixel-green-glow);
}
.tutorial-btn:hover {
  background: rgba(0, 232, 85, 0.08);
  color: var(--isy-pixel-green-text);
}

.tab-btn:hover {
  background: var(--isy-pixel-content-bg);
  color: var(--isy-pixel-green);
}

.tab-btn.active {
  background: var(--isy-pixel-content-bg);
  color: var(--isy-pixel-green);
  border-left-color: var(--isy-pixel-green);
  font-weight: 700;
}

.tab-btn.tech-btn.active {
    color: var(--isy-pixel-green);
    border-left-color: var(--isy-pixel-border-hover);
}

.help-content {
  flex: 1;
  padding: var(--isy-space-7);
  overflow-y: auto;
  background: var(--isy-pixel-content-bg);
}

/* Typography & Content Styling */
.content-section h4 {
  margin-top: 0;
  margin-bottom: var(--isy-space-6);
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  letter-spacing: -0.02em;
  color: var(--isy-pixel-content-text);
  border-bottom: 2px solid var(--isy-pixel-divider);
  padding-bottom: var(--isy-space-3);
}

.content-section h5 {
  margin-top: var(--isy-space-7);
  margin-bottom: var(--isy-space-4);
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  color: var(--isy-pixel-content-text-dim);
}

.content-section p, .content-section li {
  line-height: 1.6;
  color: var(--isy-pixel-content-text-dim);
  font-size: var(--isy-fs-lg);
}

.audit-block {
    background: var(--isy-pixel-content-raised);
    padding: var(--isy-space-6);
    border-radius: var(--isy-radius-lg);
    border: 1px solid var(--isy-pixel-divider);
}

.warning-block {
    background: var(--isy-pixel-danger-soft);
    padding: var(--isy-space-6);
    border-radius: var(--isy-radius-lg);
    border: 1px solid var(--isy-pixel-danger-soft-border);
    color: var(--isy-pixel-danger-soft-text);
}

.warning-block p { color: var(--isy-pixel-danger-soft-text); font-weight: 600; }
.warning-block li { color: var(--isy-pixel-danger-soft-text); }

.tech-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: var(--isy-space-4);
    background: var(--isy-pixel-content-bg);
    font-size: var(--isy-fs-lg);
}

.tech-table th, .tech-table td {
    border: 1px solid var(--isy-pixel-divider);
    padding: var(--isy-space-3);
    text-align: left;
}

.tech-table th {
    background: var(--isy-pixel-content-raised);
    font-weight: 600;
    color: var(--isy-pixel-content-text-dim);
}

.tag {
    display: inline-block;
    padding: var(--isy-space-1) var(--isy-space-2);
    border-radius: var(--isy-radius-sm);
    font-size: var(--isy-fs-md);
    font-weight: 600;
}
.q-warn { background-color: var(--isy-pixel-danger-soft); color: var(--isy-pixel-danger-soft-text); }

.code-block {
    background: #1e1e1e;
    color: #d4d4d4;
    padding: var(--isy-space-4);
    border-radius: var(--isy-radius-md);
    font-family: monospace;
    font-size: var(--isy-fs-md);
    white-space: pre-wrap;
    margin: var(--isy-space-4) 0;
    max-height: 300px;
    overflow-y: auto;
}

/* Scrollbar bewusst ohne eigene Regel: die globale in theme-saintv.css liest
   --scroll-*, die isybau/styles/theme.css auf Grün setzt. Hier stand vorher
   hartcodiertes Hellgrau (#f1f1f1/#cbd5e1) aus der Zeit vor dem Theme — es
   ueberstimmte das Theme und blieb grau. */

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--isy-space-4);
  margin: var(--isy-space-4) 0;
}

.info-card {
  background: var(--isy-pixel-content-raised);
  border: 1px solid var(--isy-pixel-divider);
  border-radius: var(--isy-radius-lg);
  padding: var(--isy-space-4);
  font-size: var(--isy-fs-lg);
  color: var(--isy-pixel-content-text-dim);
  line-height: 1.5;
}

.info-card-title {
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-sm);
  color: var(--isy-pixel-content-text);
  margin-bottom: var(--isy-space-2);
}

.color-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: var(--isy-space-2);
  vertical-align: middle;
  flex-shrink: 0;
}

.workflow-list {
  padding-left: var(--isy-space-6);
}

.workflow-list li {
  margin-bottom: var(--isy-space-4);
  line-height: 1.6;
  color: var(--isy-pixel-text-dim);
}

</style>
