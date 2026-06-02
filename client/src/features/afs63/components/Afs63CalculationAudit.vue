<template>
  <div class="audit-modal-overlay" @click.self="$emit('close')">
    <div class="audit-modal">
      <header class="modal-header">
        <h2>Berechnungsgrundlage (DWA-A 102-2:2020)</h2>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </header>

      <div class="modal-tabs">
        <button :class="{ active: activeTab === 'grundlagen' }" @click="activeTab = 'grundlagen'">Berechnungsgrundlage</button>
        <button :class="{ active: activeTab === 'definitionen' }" @click="activeTab = 'definitionen'">Variablen &amp; Parameter</button>
      </div>

      <div class="modal-content">
        <div v-show="activeTab === 'grundlagen'">
        <p class="intro">
          Ermittlung des <strong>Behandlungsbedarfs</strong> für AFS63 (abfiltrierbare Stoffe &lt; 63 µm)
          über den emissionsbezogenen Stoffrückhalt nach DWA-A 102-2/BWK-A 3-2:2020, Abschnitt 5.2.3.
          Bezugsgröße ist die angeschlossene befestigte Fläche A<sub>b,a</sub>.
        </p>

        <section>
          <h3>1. Eingangsgröße: Fläche A<sub>b,a</sub></h3>
          <p>
            Jedes gezeichnete Polygon liefert seine Fläche (über <code>@turf/area</code> in m²).
            Für die Stoffbilanz wird sie in Hektar umgerechnet:
          </p>
          <div class="formula-box">
            <p>A<sub>b,a,i</sub> [ha] = Polygonfläche [m²] / 10.000</p>
          </div>
          <p class="where">→ angezeigt als „A<sub>b,a</sub>“ je Fläche und als „Gesamtfläche“ im Ergebnisblock.</p>
        </section>

        <section>
          <h3>2. Klassifizierung: Flächengruppe → Belastungskategorie (Tabelle A.1)</h3>
          <p>Jede Fläche wird manuell einer Flächengruppe zugeordnet; daraus folgt die Belastungskategorie:</p>
          <table class="ref-table">
            <thead><tr><th>Kategorie</th><th>Flächengruppen (Auswahl)</th></tr></thead>
            <tbody>
              <tr><td><span class="cat cat-I">I</span> gering</td><td>D, VW1, V1, BG1, BF, BL</td></tr>
              <tr><td><span class="cat cat-II">II</span> mäßig</td><td>VW2, V2, BG2, SD1</td></tr>
              <tr><td><span class="cat cat-III">III</span> stark</td><td>V3, SV/SVW, SD2, SF, SL, BG3, SG, SA</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h3>3. Flächenspezifischer Stoffabtrag b<sub>R,a,AFS63</sub> (Tabelle 4)</h3>
          <table class="ref-table">
            <thead><tr><th>Kategorie</th><th>Konzentration</th><th>b<sub>R,a,AFS63</sub></th></tr></thead>
            <tbody>
              <tr><td><span class="cat cat-I">I</span></td><td>50 mg/l</td><td><strong>280</strong> kg/(ha·a)</td></tr>
              <tr><td><span class="cat cat-II">II</span></td><td>95 mg/l</td><td><strong>530</strong> kg/(ha·a)</td></tr>
              <tr><td><span class="cat cat-III">III</span></td><td>136 mg/l</td><td><strong>760</strong> kg/(ha·a)</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h3>4. Stoffbilanz (Gl. 3–5)</h3>
          <div class="formula-box">
            <p><strong>(3)</strong> B<sub>R,a,i</sub> = A<sub>b,a,i</sub> · b<sub>R,a,AFS63,i</sub> &nbsp; [kg/a]</p>
            <p><strong>(4)</strong> B<sub>R,a</sub> = Σ B<sub>R,a,i</sub> &nbsp; [kg/a]</p>
            <p><strong>(5)</strong> b<sub>R,a</sub> = B<sub>R,a</sub> / A<sub>b,a</sub> &nbsp; [kg/(ha·a)]</p>
          </div>
          <p class="where">→ (3) je Fläche als „B<sub>R,a,i</sub>“, (4) als „Stoffabtrag gesamt“, (5) als „spez. Stoffabtrag“.</p>
        </section>

        <section>
          <h3>5. Bewertung des Behandlungsbedarfs (Gl. 6)</h3>
          <p>
            Zulässiger flächenspezifischer Stoffaustrag b<sub>R,e,zul,AFS63</sub> = <strong>280 kg/(ha·a)</strong>
            (Abschnitt 5.2.2.4). Liegt b<sub>R,a</sub> darüber, ist eine Behandlung erforderlich:
          </p>
          <div class="formula-box">
            <p><strong>(6)</strong> η<sub>erf</sub> = max(0; 1 − b<sub>R,e,zul,AFS63</sub> / b<sub>R,a</sub>) · 100 &nbsp; [%]</p>
          </div>
          <p class="where">→ „Behandlung erforderlich?“ (Ampel) und „erforderlicher Wirkungsgrad“ je Kategorie.</p>
        </section>

        <section>
          <h3>6. Reststofffracht nach Behandlung (Gl. 7/8)</h3>
          <div class="formula-box">
            <p><strong>(7)</strong> dezentral: B<sub>R,e,i</sub> = A<sub>b,a,i</sub> · (1 − η<sub>i</sub>) · b<sub>R,a,AFS63,i</sub></p>
            <p><strong>(8)</strong> zentral: B<sub>R,e</sub> = (1 − η<sub>ges</sub>) · B<sub>R,a</sub></p>
          </div>
          <p class="note">
            Ziel erreicht, wenn der resultierende spez. Stoffaustrag ≤ 280 kg/(ha·a) bleibt.
          </p>
        </section>

        <section>
          <h3>Sonderfall: Außerortsstraßen (REwS, Tabelle 7)</h3>
          <p>
            Niederschlagswasser außerörtlicher Straßen ist nicht Gegenstand der DWA-A 102
            (A 102-2, Abschnitt 1). Wird eine Fläche als <strong>Außerortsstraße</strong> markiert,
            werden Kategorie und Fracht stattdessen DTV-abhängig nach REwS, Tabelle 7 bestimmt:
          </p>
          <table class="ref-table">
            <thead><tr><th>Kategorie</th><th>DTV [Kfz/24 h]</th><th>AFS63-Abtragsfracht</th></tr></thead>
            <tbody>
              <tr><td><span class="cat cat-I">I</span></td><td>&lt; 2.000</td><td>≤ <strong>280</strong> kg/(ha·a)</td></tr>
              <tr><td><span class="cat cat-II">II</span></td><td>2.000 – 15.000</td><td><strong>360</strong> kg/(ha·a) *</td></tr>
              <tr><td><span class="cat cat-III">III</span></td><td>&gt; 15.000</td><td><strong>550</strong> kg/(ha·a) **</td></tr>
            </tbody>
          </table>
          <p class="note" v-for="(text, marker) in footnotes" :key="marker">
            <strong>{{ marker }})</strong> {{ text }}
          </p>
        </section>

        <section>
          <h3>Anlagenbemessung Regenklärbecken (Abschnitt 6.2)</h3>
          <p>
            Ist eine Behandlung erforderlich, kann ein <strong>Regenklärbecken (RKB)</strong> bemessen
            werden. Bezugsgrößen: gebietsbezogener spez. Stoffabtrag b<sub>a</sub> und Fläche A<sub>b,a</sub>.
          </p>
          <div class="formula-box">
            <p>b<sub>BÜ</sub> = b<sub>a</sub> · a<sub>BÜ</sub> &nbsp;(Beckenüberlauf-Anteil, ≈ 0,10 bei r<sub>krit</sub>=15)</p>
            <p>η<sub>ges</sub> = 1 − (280 − b<sub>BÜ</sub>) / (b<sub>a</sub> − b<sub>BÜ</sub>)</p>
            <p>q<sub>A,Bem</sub> = −8,333 · ln(η<sub>ges</sub>) − 1,6629 &nbsp;[m/h] &nbsp;(Bild 4)</p>
            <p>Q<sub>Bem,Tr</sub> = r<sub>krit</sub> · A<sub>b,a</sub> · f<sub>D</sub> + Q<sub>F</sub> &nbsp;[l/s]</p>
            <p><strong>A<sub>RKB</sub></strong> = 3,6 · Q<sub>Bem,Tr</sub> / q<sub>A,Bem</sub> &nbsp;[m²] &nbsp;(Gl. 10)</p>
            <p><strong>V<sub>RKB</sub></strong> = A<sub>RKB</sub> · h<sub>RKB</sub> &nbsp;[m³] &nbsp;(Gl. 11, h<sub>RKB</sub> ≥ 2,0 m)</p>
          </div>
          <p class="note">
            Die Regression gilt nur für η<sub>ges</sub> &lt; ~0,82; darüber ist ein RKB nicht darstellbar
            (q<sub>A,Bem</sub> ≤ 0) → Retentionsbodenfilter nach DWA-A 178. Validiert am Anwendungsbeispiel
            (Tab. 7): 8/8/4 ha → η<sub>ges</sub>=0,458 · q<sub>A,Bem</sub>=4,85 → A<sub>RKB</sub>=222,5 m² · V<sub>RKB</sub>=445 m³.
          </p>
        </section>

        <section>
          <h3>Anlagenvorschlag (Algorithmus)</h3>
          <p>
            Übersteigt der spez. Stoffabtrag den zulässigen Wert, schlägt das Tool aus der
            <strong>Anlagenbibliothek</strong> passende Behandlungsanlagen vor. Je behandlungsbedürftiger
            Kategorie wird der erreichbare AFS63-Wirkungsgrad einer Anlage mit dem erforderlichen
            η<sub>erf</sub> verglichen:
          </p>
          <ul>
            <li><strong>✓ geeignet</strong> – erreichbarer Wirkungsgrad ≥ η<sub>erf</sub></li>
            <li><strong>≈ grenzwertig</strong> – bis 5 %-Punkte unter η<sub>erf</sub></li>
            <li><strong>✗ unzureichend</strong> – mehr als 5 %-Punkte darunter</li>
          </ul>
          <p class="note">
            Geeignete Anlagen werden nach geringster Überdimensionierung („wirtschaftlichste zuerst")
            sortiert. Bei zentraler Behandlung werden nur Anlagen mit Rückhaltung vorgeschlagen.
          </p>
        </section>

        <section>
          <h3>Rechenbeispiel (Anwendungsbeispiel, Abschnitt 2.3)</h3>
          <p class="note">
            8 ha Kat. I + 8 ha Kat. II + 4 ha Kat. III →
            B<sub>R,a</sub> = 8·280 + 8·530 + 4·760 = <strong>9.520 kg/a</strong>;
            spez. Austrag 476 kg/(ha·a) &gt; 280 → Behandlung erforderlich;
            η<sub>erf</sub> Kat. II ≈ 47 %, Kat. III ≈ 63 %.
          </p>
        </section>
        </div><!-- /grundlagen -->

        <!-- TAB 2: Variablen & Parameter -->
        <div v-show="activeTab === 'definitionen'">
          <p class="intro">
            Definitionen aller im Tool verwendeten Berechnungsvariablen und Parameter
            (Symbol, Bedeutung, Einheit) nach DWA-A 102-2:2020 (Trennverfahren) bzw. REwS.
          </p>

          <section v-for="grp in glossary" :key="grp.title">
            <h3>{{ grp.title }}</h3>
            <table class="def-table">
              <thead><tr><th>Symbol</th><th>Bedeutung</th><th>Einheit</th></tr></thead>
              <tbody>
                <tr v-for="row in grp.rows" :key="row.sym">
                  <td class="sym" v-html="row.sym"></td>
                  <td v-html="row.def"></td>
                  <td class="unit">{{ row.unit }}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { RURAL_ROAD_FOOTNOTES } from '../data/dwaA102Categories'

defineEmits(['close'])

const activeTab = ref('grundlagen')

// Vollständiges Variablen-/Parameterverzeichnis (Symbol, Bedeutung, Einheit).
const glossary = [
  {
    title: 'Flächen & Klassifizierung',
    rows: [
      { sym: 'A<sub>b,a</sub>', def: 'Angeschlossene befestigte Fläche (Bezugsgröße der Bilanz)', unit: 'ha' },
      { sym: 'A<sub>b,a,i</sub>', def: 'Angeschlossene befestigte Teilfläche i', unit: 'ha' },
      { sym: 'AFS63', def: 'Abfiltrierbare Stoffe < 63 µm (Leitparameter Feinstoffe)', unit: '–' },
      { sym: 'Flächengruppe', def: 'Kurzzeichen der Herkunftsfläche nach Tabelle A.1 (z. B. D, V2, SD2)', unit: '–' },
      { sym: 'Kat. I / II / III', def: 'Belastungskategorie: gering / mäßig / stark belastet', unit: '–' },
      { sym: 'DTV', def: 'Durchschnittliche tägliche Verkehrsstärke (Außerortsstraßen, REwS)', unit: 'Kfz/24 h' }
    ]
  },
  {
    title: 'Stoffbilanz (Emissionsnachweis, Abschnitt 5.2.3)',
    rows: [
      { sym: 'b<sub>R,a,AFS63</sub> (b<sub>a</sub>)', def: 'Flächenspezifischer jährlicher Stoffabtrag AFS63 (Tab. 4: 280/530/760)', unit: 'kg/(ha·a)' },
      { sym: 'b<sub>R,a,AFS63,i</sub>', def: 'Flächenspezifischer Stoffabtrag der Teilfläche i', unit: 'kg/(ha·a)' },
      { sym: 'b<sub>R,e,zul,AFS63</sub>', def: 'Zulässiger flächenspezifischer Stoffaustrag (= 280)', unit: 'kg/(ha·a)' },
      { sym: 'B<sub>R,a,AFS63</sub> (B<sub>R,a</sub>)', def: 'Jährlicher Stoffabtrag des Gebiets (Gl. 4)', unit: 'kg/a' },
      { sym: 'B<sub>R,a,i</sub>', def: 'Stoffabtrag der Teilfläche i (Gl. 3)', unit: 'kg/a' },
      { sym: 'B<sub>R,e,AFS63</sub> (B<sub>R,e</sub>)', def: 'Resultierender Stoffaustrag nach Behandlung (Gl. 7/8)', unit: 'kg/a' }
    ]
  },
  {
    title: 'Behandlung & Wirkungsgrade',
    rows: [
      { sym: 'η<sub>erf</sub>', def: 'Erforderlicher Wirkungsgrad der Behandlungsmaßnahme (Gl. 6)', unit: '% bzw. –' },
      { sym: 'η<sub>i</sub>', def: 'Wirksamkeit des Stoffrückhalts der dezentralen Anlage i', unit: '–' },
      { sym: 'η<sub>ges</sub>', def: 'Gesamtwirkungsgrad der zentralen Behandlungsanlage', unit: '–' }
    ]
  },
  {
    title: 'Bemessung Regenklärbecken (Abschnitt 6.2 + Anhang B)',
    rows: [
      { sym: 'a<sub>BÜ</sub>', def: 'Abfluss-/Frachtanteil über den Beckenüberlauf (≈ 0,10 bei r<sub>krit</sub>=15)', unit: '–' },
      { sym: 'b<sub>BÜ</sub>', def: 'Über den Beckenüberlauf unbehandelt abgeführte spez. Fracht', unit: 'kg/(ha·a)' },
      { sym: 'r<sub>krit</sub>', def: 'Kritische Regenspende (hydraulische Auslegung; Standard 15)', unit: 'l/(s·ha)' },
      { sym: 'Q<sub>R,krit</sub>', def: 'Kritischer Regenabfluss = r<sub>krit</sub> · A<sub>b,a</sub> · f<sub>D</sub>', unit: 'l/s' },
      { sym: 'Q<sub>F</sub>', def: 'Maßgebender Fremdwasserabfluss', unit: 'l/s' },
      { sym: 'Q<sub>Bem,Tr</sub>', def: 'Bemessungszufluss im Trennverfahren = Q<sub>R,krit</sub> + Q<sub>F</sub> (Gl. B.2)', unit: 'l/s' },
      { sym: 'f<sub>D</sub>', def: 'Abminderungsfaktor undurchlässige Teilflächen', unit: '–' },
      { sym: 'q<sub>A,Bem</sub>', def: 'Bemessungswert der Oberflächenbeschickung (Bild 4)', unit: 'm/h' },
      { sym: 'q<sub>A,max</sub>', def: 'Maximale Oberflächenbeschickung (Schrägklärer)', unit: 'm/h' },
      { sym: 'A<sub>RKB</sub>', def: 'Sedimentationswirksame Beckenoberfläche Regenklärbecken (Gl. 10)', unit: 'm²' },
      { sym: 'A<sub>eff</sub>', def: 'Sedimentationswirksame Oberfläche Schrägklärer (Gl. 12)', unit: 'm²' },
      { sym: 'h<sub>RKB</sub>', def: 'Beckentiefe (Mindesttiefe 2,0 m)', unit: 'm' },
      { sym: 'V<sub>RKB</sub>', def: 'Erforderliches Beckenvolumen = A<sub>RKB</sub> · h<sub>RKB</sub> (Gl. 11)', unit: 'm³' },
      { sym: 'L, B', def: 'Länge / Breite des Beckens (Hinweis, L:B ≈ 3…4,5 nach DWA-A 166)', unit: 'm' }
    ]
  },
  {
    title: 'Konstanten / Standardwerte',
    rows: [
      { sym: 'b<sub>R,e,zul,AFS63</sub>', def: 'Zulässiger Stoffaustrag (Wert der Kategorie I)', unit: '280 kg/(ha·a)' },
      { sym: 'c<sub>KA,AFS63</sub>', def: 'AFS63-Restkonzentration im Kläranlagenablauf (Standardwert)', unit: '15 mg/l' },
      { sym: 'h<sub>Na,eff</sub>', def: 'Abflusswirksame Jahresniederschlagshöhe (Referenz)', unit: '560 mm/a' }
    ]
  }
]

const footnotes = RURAL_ROAD_FOOTNOTES
</script>

<style scoped>
.audit-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.audit-modal {
  background: white;
  width: 90%;
  max-width: 720px;
  max-height: 85vh;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
}

.modal-header {
  padding: 1.5rem;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.3rem;
  color: #2c3e50;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #7f8c8d;
}

.modal-tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0 1.5rem;
  border-bottom: 1px solid #eee;
}

.modal-tabs button {
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  padding: 0.75rem 1rem;
  font-size: 0.92rem;
  font-weight: 600;
  color: #7f8c8d;
  cursor: pointer;
  margin-bottom: -1px;
}

.modal-tabs button:hover { color: #2c3e50; }

.modal-tabs button.active {
  color: #2980b9;
  border-bottom-color: #2980b9;
}

.modal-content {
  padding: 1.5rem;
  overflow-y: auto;
  line-height: 1.6;
}

.def-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.def-table th, .def-table td {
  border: 1px solid #ecf0f1;
  padding: 0.4rem 0.6rem;
  text-align: left;
  vertical-align: top;
}

.def-table th {
  background: #f8f9fa;
  color: #2c3e50;
}

.def-table .sym {
  white-space: nowrap;
  font-weight: 600;
  color: #2c3e50;
}

.def-table .unit {
  white-space: nowrap;
  color: #718096;
}

.intro {
  background: #ebf8ff;
  border-left: 4px solid #3498db;
  padding: 0.75rem 1rem;
  border-radius: 4px;
  color: #2c3e50;
  margin-bottom: 1.5rem;
}

section {
  margin-bottom: 1.75rem;
}

h3 {
  color: #2980b9;
  border-bottom: 2px solid #f0f0f0;
  padding-bottom: 0.5rem;
  margin-bottom: 1rem;
  font-size: 1.05rem;
}

.formula-box {
  background: #f8f9fa;
  padding: 1rem;
  border-left: 4px solid #3498db;
  border-radius: 4px;
  margin: 1rem 0;
  font-family: 'Courier New', monospace;
  color: #2c3e50;
}

.formula-box p {
  margin: 0.5rem 0;
}

.where {
  font-size: 0.85rem;
  color: #16a085;
  margin-top: 0.5rem;
}

.note {
  font-size: 0.9rem;
  color: #7f8c8d;
  background: #fff8e1;
  padding: 0.6rem 0.75rem;
  border-radius: 4px;
}

.ref-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}

.ref-table th, .ref-table td {
  border: 1px solid #ecf0f1;
  padding: 0.5rem 0.6rem;
  text-align: left;
}

.ref-table th {
  background: #f8f9fa;
  color: #2c3e50;
}

.cat {
  display: inline-block;
  color: white;
  font-weight: 700;
  border-radius: 4px;
  padding: 1px 7px;
  margin-right: 4px;
  font-size: 0.78rem;
}
.cat-I { background: #2ecc71; }
.cat-II { background: #f39c12; }
.cat-III { background: #e74c3c; }
</style>
