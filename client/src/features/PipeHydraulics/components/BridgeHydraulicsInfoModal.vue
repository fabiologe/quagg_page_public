<template>
  <div class="info-backdrop" @mousedown.self="$emit('close')">
    <div class="info-modal">

      <!-- Header -->
      <div class="info-header">
        <h3 class="info-title">Hydraulische Grundlagen &amp; Berechnungsprotokoll</h3>
        <button class="info-close" @click="$emit('close')" title="Schließen">&times;</button>
      </div>

      <!-- Tabs -->
      <div class="info-tabs">
        <button v-for="t in TABS" :key="t.id"
          :class="['info-tab', { active: activeTab === t.id }]"
          @click="activeTab = t.id">
          {{ t.label }}
        </button>
      </div>

      <!-- Tab content -->
      <div class="info-body">

        <!-- ══════════════════════ BEDIENUNG ══════════════════════ -->
        <div v-if="activeTab === 'usage'" class="tab-content">

          <!-- Profil zeichnen -->
          <section class="info-section">
            <h4>Profil zeichnen</h4>
            <div class="usage-grid">
              <div class="usage-card">
                <div class="usage-card-head">Layer wählen</div>
                <div class="usage-card-body">
                  Oben links wählst du den aktiven Layer:
                  <ul>
                    <li><span class="layer-chip terrain">Gelände</span> — Gerinnesohlprofil</li>
                    <li><span class="layer-chip buk">BUK</span> — Brückenunterkante</li>
                    <li><span class="layer-chip bok">BOK</span> — Brückenoberkante</li>
                  </ul>
                  Nur der aktive Layer ist klickbar. Die anderen werden transparent dargestellt.
                </div>
              </div>
              <div class="usage-card">
                <div class="usage-card-head">Punkte setzen &amp; bearbeiten</div>
                <div class="usage-card-body">
                  <div class="usage-row"><kbd>Klick</kbd> Neuen Punkt setzen (wird nach x sortiert)</div>
                  <div class="usage-row"><kbd>Ziehen</kbd> Vorhandenen Punkt verschieben</div>
                  <div class="usage-row"><kbd>Rechtsklick</kbd> Nächsten Punkt löschen</div>
                  <p class="usage-note">BUK-Punkte werden automatisch auf das Gelände-Niveau geklammert. BOK-Punkte können nicht unter die BUK fallen.</p>
                </div>
              </div>
            </div>
          </section>

          <!-- Ansicht -->
          <section class="info-section">
            <h4>Ansicht — Zoom &amp; Pan</h4>
            <div class="usage-grid">
              <div class="usage-card">
                <div class="usage-card-head">Navigation</div>
                <div class="usage-card-body">
                  <div class="usage-row"><kbd>Scroll</kbd> Hinein- / herauszoomen (unter dem Mauszeiger fixiert)</div>
                  <div class="usage-row"><kbd>Mitteltaste ziehen</kbd> Schwenken (Pan)</div>
                  <div class="usage-row"><kbd>Ctrl + Linksklick ziehen</kbd> Schwenken (Pan)</div>
                  <div class="usage-row"><kbd>Fit</kbd>-Schaltfläche in der Toolbar → Ansicht zurücksetzen</div>
                  <p class="usage-note">Der Zoomfaktor wird rechts neben der Fit-Schaltfläche angezeigt (z. B. 2,4×).</p>
                </div>
              </div>
              <div class="usage-card">
                <div class="usage-card-head">WSP verschieben</div>
                <div class="usage-card-body">
                  <div class="usage-row"><kbd>WSP-Linie ziehen</kbd> Wasserspiegel direkt im Profil verschieben</div>
                  <div class="usage-row"><kbd>Slider</kbd> im Eingabebereich links</div>
                  <p class="usage-note">Der Slider passt sich automatisch an den z-Bereich der Geländepunkte an — bei Hochlagen (z. B. 240–250 m NHN) bleibt er immer im sinnvollen Bereich.</p>
                </div>
              </div>
            </div>
          </section>

          <!-- kSt-Zonen -->
          <section class="info-section">
            <h4>kSt-Zonen — Rauheitsbereiche</h4>
            <div class="usage-grid">
              <div class="usage-card">
                <div class="usage-card-head">Zonen verwalten</div>
                <div class="usage-card-body">
                  Im Eingabebereich unter <strong>kSt-Zonen</strong>:
                  <div class="usage-row" style="margin-top:0.4rem"><kbd>+ Zone</kbd> Neue Zone anlegen</div>
                  <div class="usage-row">Bezeichnung, x-Grenzen und kSt-Wert pro Zone eintragen</div>
                  <div class="usage-row">Leere x-Grenzen = ±∞ (Zone gilt für den gesamten Querschnitt)</div>
                </div>
              </div>
              <div class="usage-card">
                <div class="usage-card-head">Grenzen im Profil verschieben</div>
                <div class="usage-card-body">
                  Sobald eine Zone eine explizite x-Grenze hat (nicht ±∞), erscheint ein
                  <strong>kleiner farbiger Griff</strong> auf der Trennlinie im Profilbereich.
                  <div class="usage-row" style="margin-top:0.4rem"><kbd>Griff ziehen</kbd> Zonengrenze direkt im Profil verschieben</div>
                  <p class="usage-note">Cursor wechselt zu ←→ beim Hovern über den Griff. Die x-Werte im Eingabebereich aktualisieren sich in Echtzeit.</p>
                </div>
              </div>
            </div>
          </section>

          <!-- Undo / Redo -->
          <section class="info-section">
            <h4>Rückgängig &amp; Wiederholen</h4>
            <div class="usage-grid">
              <div class="usage-card">
                <div class="usage-card-head">Tastaturkürzel</div>
                <div class="usage-card-body">
                  <div class="usage-row"><kbd>Strg + Z</kbd> Letzten Schritt rückgängig machen</div>
                  <div class="usage-row"><kbd>Strg + Y</kbd> Rückgängig-Schritt wiederholen</div>
                  <div class="usage-row"><kbd>Strg + Umschalt + Z</kbd> Wiederholen (alternativ)</div>
                </div>
              </div>
              <div class="usage-card">
                <div class="usage-card-head">Schaltflächen in der Toolbar</div>
                <div class="usage-card-body">
                  Die Pfeiltasten ↩ ↪ ganz links in der Toolbar. Sie sind ausgegraut, wenn keine weiteren Schritte verfügbar sind.
                  <p class="usage-note">Jede Änderung — Punkt setzen, verschieben, löschen, WSP-Drag, kSt-Grenze ziehen, Eingabefelder — wird nach kurzer Pause als eigener Schritt gespeichert. Bis zu 60 Schritte werden vorgehalten.</p>
                </div>
              </div>
            </div>
          </section>

          <!-- Projekt speichern / laden -->
          <section class="info-section">
            <h4>Projekt speichern &amp; laden</h4>
            <div class="usage-grid">
              <div class="usage-card">
                <div class="usage-card-head">Speichern</div>
                <div class="usage-card-body">
                  Im Tabellen-Import-Fenster (Schaltfläche <strong>Tabelle</strong> in der Toolbar) ganz unten unter <strong>Projekt → Speichern (.json)</strong>.
                  <p class="usage-note">Die Datei enthält alle Geländepunkte, BUK, BOK, kSt-Zonen sowie Gefälle, WSP und Ratingkurven-Einstellungen. Der Dateiname enthält das aktuelle Datum.</p>
                </div>
              </div>
              <div class="usage-card">
                <div class="usage-card-head">Laden</div>
                <div class="usage-card-body">
                  Im gleichen Fenster unter <strong>Projekt → Laden</strong>. Wähle eine zuvor gespeicherte <code>.json</code>-Datei.
                  <p class="usage-note">Nur Dateien im Format <em>BrueckenHydraulik</em> (d. h. mit diesem Werkzeug gespeichert) werden erkannt. GeoJSON-Dateien werden über den separaten GeoJSON-Import eingelesen.</p>
                </div>
              </div>
            </div>
          </section>

          <!-- Import -->
          <section class="info-section">
            <h4>Daten importieren</h4>
            <div class="usage-grid">
              <div class="usage-card">
                <div class="usage-card-head">Tabellen-Editor</div>
                <div class="usage-card-body">
                  Schaltfläche <strong>Tabelle</strong> in der Toolbar öffnet ein Excel-artiges Eingabefenster mit drei Reitern (Gelände / BUK / BOK).
                  <div class="usage-row" style="margin-top:0.4rem"><kbd>Strg + V</kbd> Spalten aus Excel einfügen (x, z oder Rw, Hw, Höhe)</div>
                  <div class="usage-row">Bei 3 Spalten (Rw, Hw, Höhe) wird die Distanz automatisch berechnet</div>
                </div>
              </div>
              <div class="usage-card">
                <div class="usage-card-head">GeoJSON-Import</div>
                <div class="usage-card-body">
                  Im gleichen Fenster unter <strong>GeoJSON → Datei wählen</strong>.
                  <p class="usage-note">Das GeoJSON muss eine <code>FeatureCollection</code> mit einer <code>"layer"</code>-Eigenschaft (<code>"terrain"</code>, <code>"buk"</code>, <code>"bok"</code>) pro Feature enthalten.</p>
                </div>
              </div>
            </div>
          </section>

          <!-- Ausdruck -->
          <section class="info-section">
            <h4>Ausdruck &amp; Export</h4>
            <div class="usage-card" style="max-width:none">
              <div class="usage-card-head">Drucken / SVG-Export</div>
              <div class="usage-card-body">
                Schaltfläche <strong>Drucken</strong> in der Toolbar öffnet eine Druckvorschau.
                <div class="usage-row" style="margin-top:0.4rem">Format: A4 quer / A3 quer / A4 hoch</div>
                <div class="usage-row">Maßstab manuell eingeben oder <kbd>Auto</kbd> verwenden (passt automatisch an das Blatt an)</div>
                <div class="usage-row">Überhöhung (VE) separat einstellbar</div>
                <div class="usage-row"><strong>Drucken</strong> → öffnet Systemdialog · <strong>SVG speichern</strong> → Vektorgrafik herunterladen</div>
                <p class="usage-note">Das Schriftkopf-Titelfeld und der Projekttitel können direkt im Druckdialog eingetragen werden.</p>
              </div>
            </div>
          </section>

        </div>

        <!-- ══════════════════════ METHODE ══════════════════════ -->
        <div v-if="activeTab === 'method'" class="tab-content">

          <section class="info-section">
            <h4>Zwei-Zonen-Modell nach Composite Manning-Strickler</h4>
            <p>
              Der Gesamtabfluss <em>Q</em> wird in zwei physikalisch getrennte Bereiche aufgeteilt,
              die unabhängig berechnet und anschließend summiert werden:
            </p>
            <div class="zone-cards">
              <div class="zone-card z1">
                <div class="zone-card-head">Zone 1 — Gerinneabfluss</div>
                <div class="zone-card-body">
                  Gesamter Querschnitt <strong>unterhalb der BOK-Referenzlinie</strong>.
                  Bei freiem Abfluss: Deckel = WSP.<br>
                  Bei Druckabfluss (WSP ≥ BUK): Deckel = BUK, die BUK-Linie wird zum
                  <em>benetzten Umfang</em> addiert → höherer Reibungsverlust.
                </div>
              </div>
              <div class="zone-card z2">
                <div class="zone-card-head">Zone 2 — Überflutungsabfluss</div>
                <div class="zone-card-body">
                  Querschnitt <strong>oberhalb der BOK-Referenzlinie</strong>, erstreckt sich lateral
                  über den gesamten Querschnitt (Vorland + Brückendeck). Nur aktiv wenn WSP > BOK.
                </div>
              </div>
            </div>
          </section>

          <section class="info-section">
            <h4>Berechnungsformel (Einstein-Verfahren)</h4>
            <p>Für jede kSt-Zone <em>i</em> werden Fläche <em>A</em> und Umfang <em>P</em>
               separat integriert:</p>
            <div class="formula-box">
              <div class="formula">Q = Σ kSt<sub>i</sub> · A<sub>i</sub> · R<sub>i</sub><sup>2/3</sup> · I<sup>1/2</sup></div>
              <div class="formula-sub">mit  R<sub>i</sub> = A<sub>i</sub> / P<sub>i</sub>  (hydraulischer Radius)</div>
            </div>
            <p class="hint-text">
              Der Einstein-Ansatz verhindert, dass unterschiedlich raue Teilbereiche
              sich gegenseitig „herausmitteln". Jede Zone bekommt ihren eigenen R und v.
            </p>
          </section>

          <section class="info-section">
            <h4>Streifenintegration</h4>
            <p>
              Das Profil wird intern in schmale vertikale Streifen zerlegt. Die Grenzen liegen
              an allen Stützpunkten von Gelände, BUK, BOK und kSt-Zonengrenzen.
              Für jeden Streifen gilt Trapezregel:
            </p>
            <div class="formula-box compact">
              <div class="formula small">dA = ½ · (h<sub>links</sub> + h<sub>rechts</sub>) · dx</div>
              <div class="formula small">dP = √(dx² + Δz²)</div>
            </div>
            <p class="hint-text">
              Durch die Verwendung aller Profilpunkte als Streifengrenzen ist die Integration
              für stückweise lineare Profile exakt — ohne numerischen Diskretisierungsfehler.
            </p>
          </section>

          <section class="info-section">
            <h4>Druckabfluss</h4>
            <p>
              Sobald der Wasserspiegel die BUK erreicht oder überschreitet, wechselt Zone 1 in den
              <strong>Druckabfluss</strong>. Die BUK-Linie wird dann zum benetzten Umfang <em>P</em>
              addiert, was den hydraulischen Radius <em>R</em> verkleinert und die Fließgeschwindigkeit
              reduziert. Das Modell folgt damit der klassischen Fülllinie-Methodik.
            </p>
          </section>

          <!-- Schematic diagram -->
          <section class="info-section">
            <h4>Schematische Darstellung</h4>
            <div class="schematic">
              <svg viewBox="0 0 420 160" class="schema-svg">
                <!-- Terrain fill -->
                <polygon points="10,140 80,80 160,60 260,60 340,80 410,140"
                  fill="#d1d5db" stroke="#374151" stroke-width="1.5" stroke-linejoin="round"/>
                <!-- Zone 1 water -->
                <polygon points="80,80 160,60 260,60 340,80 340,100 260,100 160,100 80,100"
                  fill="#3b82f6" fill-opacity="0.3" stroke="#2563eb" stroke-width="0.8"/>
                <!-- WSP line -->
                <line x1="10" y1="100" x2="410" y2="100" stroke="#1d4ed8" stroke-width="1.5" stroke-dasharray="6,4"/>
                <!-- BUK -->
                <line x1="160" y1="60" x2="260" y2="60" stroke="#d97706" stroke-width="2" stroke-dasharray="6,4"/>
                <!-- BOK -->
                <line x1="140" y1="40" x2="280" y2="40" stroke="#7c3aed" stroke-width="2.5"/>
                <!-- Bridge fill -->
                <rect x="140" y="40" width="140" height="20" fill="#64748b" opacity="0.7"/>
                <!-- Zone 2 -->
                <polygon points="10,100 80,100 160,100 260,100 340,100 410,100 410,70 10,70"
                  fill="#14b8a6" fill-opacity="0.25" stroke="#0d9488" stroke-width="0.8"/>
                <!-- Labels -->
                <text x="210" y="85" text-anchor="middle" font-size="10" fill="#1e40af" font-weight="bold">Zone 1</text>
                <text x="50" y="88" text-anchor="middle" font-size="10" fill="#0d9488" font-weight="bold">Zone 2</text>
                <text x="375" y="88" text-anchor="middle" font-size="10" fill="#0d9488" font-weight="bold">Zone 2</text>
                <text x="418" y="103" font-size="9" fill="#1d4ed8">WSP</text>
                <text x="210" y="57" text-anchor="middle" font-size="9" fill="#d97706">BUK</text>
                <text x="210" y="37" text-anchor="middle" font-size="9" fill="#7c3aed">BOK</text>
                <!-- P arrows for Zone 1 -->
                <line x1="80" y1="80" x2="80" y2="100" stroke="#dc2626" stroke-width="1" marker-end="url(#arr)"/>
                <text x="70" y="93" font-size="8" fill="#dc2626">P₁</text>
              </svg>
            </div>
          </section>

        </div>

        <!-- ══════════════════════ PROTOKOLL ══════════════════════ -->
        <div v-if="activeTab === 'protocol'" class="tab-content">

          <!-- Eingangswerte -->
          <section class="proto-section">
            <div class="proto-head">Eingangswerte</div>
            <div class="proto-grid">
              <span class="pkey">WSP</span>
              <span class="pval">{{ store.wsp.toFixed(3) }} m</span>
              <span class="pkey">Sohlgefälle I</span>
              <span class="pval">{{ (store.slope * 1000).toFixed(4) }} ‰ = {{ store.slope.toExponential(3) }}</span>
              <span class="pkey">√I</span>
              <span class="pval">{{ sqrtI.toFixed(6) }}</span>
              <span class="pkey">Brücke</span>
              <span class="pval">
                <span v-if="res.hasBridge">
                  vorhanden ·
                  <span :class="res.isSubmerged ? 'badge-warn' : 'badge-ok'">
                    {{ res.isSubmerged ? 'Druckabfluss' : 'Freispiegelabfluss' }}
                  </span>
                </span>
                <span v-else class="badge-gray">kein Brückenprofil</span>
              </span>
              <span v-if="res.hasOverflow" class="pkey">Überströmung</span>
              <span v-if="res.hasOverflow" class="pval"><span class="badge-blue">aktiv</span></span>
            </div>
          </section>

          <!-- Zone 1 Zonen-Details -->
          <section class="proto-section">
            <div class="proto-head">
              <span class="zone-dot z1dot"></span>
              Zone 1 — Gerinneabfluss  (unterhalb BOK-Referenz)
            </div>

            <div v-if="res.A1_total < 1e-6" class="proto-empty">
              Kein benetzter Querschnitt in Zone 1 bei aktuellem WSP.
            </div>

            <div v-for="z in res.zoneResults.filter(z => z.A1 > 1e-6)" :key="'z1-'+z.kst" class="zone-block">
              <div class="zone-block-title">
                kSt-Zone: <strong>{{ z.kst }} m<sup>⅓</sup>/s</strong>
              </div>
              <div class="calc-steps">
                <div class="calc-row">
                  <span class="calc-sym">A₁</span>
                  <span class="calc-eq">= {{ n(z.A1, 4) }} m²</span>
                  <span class="calc-note">Benetzter Querschnitt</span>
                </div>
                <div class="calc-row">
                  <span class="calc-sym">P₁</span>
                  <span class="calc-eq">= {{ n(z.P1, 4) }} m</span>
                  <span class="calc-note">Benetzter Umfang{{ res.isSubmerged ? ' (inkl. BUK-Anteil)' : '' }}</span>
                </div>
                <div class="calc-row highlight">
                  <span class="calc-sym">R₁</span>
                  <span class="calc-eq">= A₁ / P₁ = {{ n(z.A1,4) }} / {{ n(z.P1,4) }} = <strong>{{ n(z.R1, 4) }} m</strong></span>
                  <span class="calc-note">Hydraulischer Radius</span>
                </div>
                <div class="calc-row">
                  <span class="calc-sym">R₁<sup>2/3</sup></span>
                  <span class="calc-eq">= {{ n(z.R1, 4) }}<sup>2/3</sup> = {{ n(Math.pow(z.R1, 2/3), 5) }}</span>
                  <span class="calc-note"></span>
                </div>
                <div class="calc-row highlight">
                  <span class="calc-sym">v₁</span>
                  <span class="calc-eq">= {{ z.kst }} · {{ n(Math.pow(z.R1, 2/3), 5) }} · {{ n(sqrtI, 6) }} = <strong>{{ n(z.v1, 4) }} m/s</strong></span>
                  <span class="calc-note">Manning-Strickler</span>
                </div>
                <div class="calc-row result">
                  <span class="calc-sym">Q₁</span>
                  <span class="calc-eq">= v₁ · A₁ = {{ n(z.v1,4) }} · {{ n(z.A1,4) }} = <strong>{{ n(z.Q1, 4) }} m³/s</strong></span>
                  <span class="calc-note"></span>
                </div>
              </div>
            </div>

            <div v-if="res.zoneResults.filter(z=>z.A1>1e-6).length > 1" class="proto-total z1-total">
              Σ Zone 1:
              Q₁ = {{ n(res.Q1_total, 4) }} m³/s ·
              A₁ = {{ n(res.A1_total, 4) }} m² ·
              v̄₁ = {{ n(res.v1_mean, 4) }} m/s ·
              R̄₁ = {{ n(res.R1_mean, 4) }} m
            </div>
          </section>

          <!-- Zone 2 -->
          <section class="proto-section">
            <div class="proto-head">
              <span class="zone-dot z2dot"></span>
              Zone 2 — Überflutungsabfluss  (oberhalb BOK-Referenz)
            </div>

            <div v-if="!res.hasOverflow" class="proto-empty">
              WSP = {{ store.wsp.toFixed(3) }} m liegt unterhalb der BOK — kein Überflutungsabfluss.
            </div>

            <div v-for="z in res.zoneResults.filter(z => z.A2 > 1e-6)" :key="'z2-'+z.kst" class="zone-block">
              <div class="zone-block-title">
                kSt-Zone: <strong>{{ z.kst }} m<sup>⅓</sup>/s</strong>
              </div>
              <div class="calc-steps">
                <div class="calc-row">
                  <span class="calc-sym">A₂</span>
                  <span class="calc-eq">= {{ n(z.A2, 4) }} m²</span>
                  <span class="calc-note">Benetzter Querschnitt Zone 2</span>
                </div>
                <div class="calc-row">
                  <span class="calc-sym">P₂</span>
                  <span class="calc-eq">= {{ n(z.P2, 4) }} m</span>
                  <span class="calc-note">Benetzter Umfang Zone 2</span>
                </div>
                <div class="calc-row highlight">
                  <span class="calc-sym">R₂</span>
                  <span class="calc-eq">= {{ n(z.A2,4) }} / {{ n(z.P2,4) }} = <strong>{{ n(z.R2, 4) }} m</strong></span>
                  <span class="calc-note">Hydraulischer Radius</span>
                </div>
                <div class="calc-row highlight">
                  <span class="calc-sym">v₂</span>
                  <span class="calc-eq">= {{ z.kst }} · {{ n(Math.pow(z.R2, 2/3), 5) }} · {{ n(sqrtI, 6) }} = <strong>{{ n(z.v2, 4) }} m/s</strong></span>
                  <span class="calc-note">Manning-Strickler</span>
                </div>
                <div class="calc-row result">
                  <span class="calc-sym">Q₂</span>
                  <span class="calc-eq">= {{ n(z.v2,4) }} · {{ n(z.A2,4) }} = <strong>{{ n(z.Q2, 4) }} m³/s</strong></span>
                  <span class="calc-note"></span>
                </div>
              </div>
            </div>
          </section>

          <!-- Gesamtergebnis -->
          <section class="proto-section">
            <div class="proto-head">Gesamtergebnis</div>
            <div class="total-box">
              <div class="total-row">
                <span>Q<sub>Gesamt</sub></span>
                <span class="total-formula">= Q₁ + Q₂</span>
                <span class="total-val">= {{ n(res.Q1_total,4) }} + {{ n(res.Q2_total,4) }}</span>
                <span class="total-result">= {{ n(res.Q_total, 4) }} m³/s</span>
              </div>
              <div class="total-row minor">
                <span>A<sub>1</sub> = {{ n(res.A1_total, 3) }} m²</span>
                <span>v̄<sub>1</sub> = {{ n(res.v1_mean, 3) }} m/s</span>
                <span v-if="res.hasOverflow">A<sub>2</sub> = {{ n(res.A2_total, 3) }} m²</span>
                <span v-if="res.hasOverflow">v̄<sub>2</sub> = {{ n(res.v2_mean, 3) }} m/s</span>
              </div>
            </div>
          </section>

        </div>

        <!-- ══════════════════════ GLOSSAR ══════════════════════ -->
        <div v-if="activeTab === 'glossar'" class="tab-content">

          <div class="glossar-list">
            <div v-for="g in GLOSSAR" :key="g.term" class="glossar-item">
              <div class="glossar-term">
                <span class="gterm">{{ g.term }}</span>
                <span v-if="g.unit" class="gunit">[{{ g.unit }}]</span>
              </div>
              <div class="glossar-def">{{ g.def }}</div>
              <div v-if="g.detail" class="glossar-detail">{{ g.detail }}</div>
              <div v-if="g.formula" class="gformula">{{ g.formula }}</div>
            </div>
          </div>

        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useBridgeStore } from '../stores/useBridgeStore.js'

const emit = defineEmits(['close'])
const store = useBridgeStore()

const TABS = [
  { id: 'usage',    label: 'Bedienung' },
  { id: 'method',   label: 'Methode' },
  { id: 'protocol', label: 'Berechnungsprotokoll' },
  { id: 'glossar',  label: 'Glossar' },
]
const activeTab = ref('usage')

const res     = computed(() => store.currentResult)
const sqrtI   = computed(() => Math.sqrt(Math.max(store.slope, 0)))

/** Zahl formatieren: n Nachkommastellen, kein unnötiges Trailing-Zero-Chaos */
function n(val, digits = 4) {
  if (!isFinite(val) || val === 0) return '0'
  return val.toFixed(digits)
}

// ── Glossar-Einträge ─────────────────────────────────────────────────────────
const GLOSSAR = [
  {
    term: 'BUK — Brückenunterkante',
    unit: 'm ü. NHN',
    def:  'Untere Kante des Brückenbauwerks (Konstruktionsunterkante / Soffit). Definiert die Höhe der Durchströmöffnung.',
    detail: 'Im Modell: Deckel für Zone 1 bei Freispiegelabfluss. Bei WSP ≥ BUK wechselt Zone 1 in Druckabfluss, und die BUK-Linie wird zum benetzten Umfang addiert.',
  },
  {
    term: 'BOK — Brückenoberkante',
    unit: 'm ü. NHN',
    def:  'Obere Kante des Brückenbauwerks (Fahrbahn-Oberkante). Trennt Zone 1 und Zone 2.',
    detail: 'Die BOK-Referenzlinie wird horizontal über den gesamten Querschnitt fortgesetzt. Alles oberhalb dieser Linie gehört zu Zone 2 (Überflutungsabfluss).',
  },
  {
    term: 'kSt — Strickler-Beiwert',
    unit: 'm¹/³/s',
    def:  'Rauheitsbeiwert nach Strickler (Kehrwert des Manning-Beiwertes n: kSt = 1/n). Höherer Wert = glattere Sohle = höhere Fließgeschwindigkeit.',
    detail: 'Typische Werte: Naturgerinne 25–40, Betongerinne 70–90, Asphalt 90–100, Brückendeck/Vorland 20–35.',
    formula: 'v = kSt · R^(2/3) · I^(1/2)',
  },
  {
    term: 'R — Hydraulischer Radius',
    unit: 'm',
    def:  'Verhältnis von benetzter Fläche zu benetztem Umfang: R = A / P.',
    detail: 'Maß für die hydraulische Effizienz eines Querschnitts. Beim Kreisrohr voll gefüllt: R = d/4. Breites Rechteckgerinne: R ≈ h (Wassertiefe).',
    formula: 'R = A / P',
  },
  {
    term: 'I — Sohlgefälle (Energieliniengefälle)',
    unit: 'm/m (‰)',
    def:  'Neigung der Energielinie (bei gleichförmigem Abfluss = Sohlneigung).',
    detail: 'Geht als Wurzel in die Manning-Strickler-Formel ein. Bei I = 0 ist Q = 0. Wird in ‰ eingegeben, intern als m/m gespeichert.',
    formula: 'v = kSt · R^(2/3) · √I',
  },
  {
    term: 'WSP — Wasserspiegel',
    unit: 'm ü. NHN',
    def:  'Höhe des freien Wasserspiegels über dem Bezugsniveau.',
    detail: 'Steuert welche Querschnittsanteile benetzt sind. Bei WSP ≥ BUK: Druckabfluss. Bei WSP > BOK: Überflutungsabfluss (Zone 2 aktiv).',
  },
  {
    term: 'Freispiegelabfluss',
    def:  'Abfluss mit freier Wasseroberfläche — Wasserspiegel liegt unterhalb der BUK.',
    detail: 'Zone 1: Deckel = WSP. Benetzter Umfang enthält nur die Gerinnesohle und -böschungen.',
  },
  {
    term: 'Druckabfluss',
    def:  'Abfluss unter Druck — Wasserspiegel ≥ BUK, der Querschnitt ist vollständig gefüllt.',
    detail: 'Zone 1: Deckel = BUK. Die BUK-Linie wird zum benetzten Umfang P addiert, was R verkleinert und v reduziert. Entspricht dem Übergang in die Druckleitung.',
  },
  {
    term: 'Composite Manning-Strickler (Einstein-Verfahren)',
    def:  'Methode für Querschnitte mit unterschiedlich rauen Teilbereichen.',
    detail: 'Für jeden kSt-Bereich werden A und P separat integriert und daraus eine eigene Fließgeschwindigkeit berechnet. Die Teilabflüsse werden summiert. Vermeidet den Fehler des gewichteten Mittels.',
    formula: 'Q = Σ kStᵢ · Aᵢ · Rᵢ^(2/3) · √I',
  },
  {
    term: 'Widerlager',
    def:  'Bereich des Brückenquerschnitts, der innerhalb des BOK-Fußabdrucks, aber außerhalb des BUK-Fußabdrucks liegt.',
    detail: 'Im Modell: kein Durchfluss (h₁ = 0), da das Widerlager massiv ist. Die Fläche zwischen BOK-Rand und BUK-Rand ist Baukörper, kein Strömungsraum.',
  },
  {
    term: 'BOK-Referenzlinie',
    def:  'Horizontale Fortführung der BOK-Endpunkte über den gesamten Querschnitt.',
    detail: 'Teilt den Querschnitt in Zone 1 (darunter) und Zone 2 (darüber). Außerhalb des BOK-Fußabdrucks wird das BOK-Endpunkt-z konstant fortgeführt, sodass Zone 2 als zusammenhängender Bereich über Brückendeck und Vorland berechnet wird.',
  },
]
</script>

<style scoped>
/* ── Backdrop & Modal ──────────────────────────────────────────────────────── */
.info-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9998;
  padding: 1rem;
}
.info-modal {
  background: white;
  border-radius: 14px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.28);
  display: flex;
  flex-direction: column;
  width: min(96vw, 780px);
  max-height: 90vh;
  overflow: hidden;
}

/* ── Header ────────────────────────────────────────────────────────────────── */
.info-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.3rem 0.75rem;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}
.info-title { font-size: 0.95rem; font-weight: 700; color: #1e293b; margin: 0; }
.info-close {
  border: 1px solid #e2e8f0;
  background: white;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  color: #64748b;
  padding: 0.2rem 0.55rem;
  border-radius: 5px;
  flex-shrink: 0;
}
.info-close:hover { background: #f1f5f9; border-color: #94a3b8; }

/* ── Tabs ──────────────────────────────────────────────────────────────────── */
.info-tabs {
  display: flex;
  gap: 0;
  border-bottom: 2px solid #e2e8f0;
  padding: 0 1.3rem;
  flex-shrink: 0;
}
.info-tab {
  padding: 0.55rem 1.1rem;
  border: none;
  background: none;
  font-size: 0.85rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
  transition: color 0.15s, border-color 0.15s;
}
.info-tab:hover { color: #1e293b; }
.info-tab.active { color: #1d4ed8; border-bottom-color: #1d4ed8; }

/* ── Body ──────────────────────────────────────────────────────────────────── */
.info-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.2rem 1.3rem;
}
.tab-content { display: flex; flex-direction: column; gap: 1.2rem; }

/* ── Methode tab ───────────────────────────────────────────────────────────── */
.info-section { display: flex; flex-direction: column; gap: 0.45rem; }
.info-section h4 {
  font-size: 0.88rem;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
  padding-bottom: 0.3rem;
  border-bottom: 1.5px solid #e2e8f0;
}
.info-section p { font-size: 0.83rem; color: #374151; line-height: 1.55; margin: 0; }
.hint-text { font-size: 0.78rem; color: #64748b; font-style: italic; line-height: 1.5; }

.zone-cards { display: flex; gap: 0.75rem; flex-wrap: wrap; }
.zone-card {
  flex: 1;
  min-width: 200px;
  border-radius: 8px;
  overflow: hidden;
  border: 1.5px solid;
  font-size: 0.8rem;
}
.zone-card.z1 { border-color: #93c5fd; }
.zone-card.z2 { border-color: #99f6e4; }
.zone-card-head {
  padding: 0.4rem 0.7rem;
  font-weight: 700;
  font-size: 0.8rem;
}
.z1 .zone-card-head { background: #dbeafe; color: #1e40af; }
.z2 .zone-card-head { background: #ccfbf1; color: #065f46; }
.zone-card-body { padding: 0.55rem 0.7rem; line-height: 1.5; color: #374151; }

.formula-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 3px solid #3b82f6;
  border-radius: 6px;
  padding: 0.6rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.formula-box.compact { padding: 0.45rem 0.8rem; }
.formula {
  font-family: 'Courier New', monospace;
  font-size: 0.92rem;
  color: #1e293b;
  font-weight: 600;
}
.formula.small { font-size: 0.82rem; }
.formula-sub { font-size: 0.78rem; color: #475569; font-family: monospace; }

.schematic { background: #f8fafc; border-radius: 8px; padding: 0.5rem; border: 1px solid #e2e8f0; }
.schema-svg { width: 100%; height: auto; }

/* ── Protokoll tab ─────────────────────────────────────────────────────────── */
.proto-section {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}
.proto-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.9rem;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
  font-size: 0.82rem;
  font-weight: 700;
  color: #1e293b;
}
.zone-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.z1dot { background: #3b82f6; }
.z2dot { background: #14b8a6; }

.proto-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.18rem 1rem;
  padding: 0.65rem 0.9rem;
  align-items: baseline;
}
.pkey { font-size: 0.78rem; color: #64748b; font-weight: 600; white-space: nowrap; }
.pval { font-size: 0.82rem; color: #1e293b; font-family: 'Courier New', monospace; }

.proto-empty {
  padding: 0.7rem 0.9rem;
  font-size: 0.8rem;
  color: #94a3b8;
  font-style: italic;
}
.proto-total {
  margin: 0 0.9rem 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.79rem;
  font-weight: 600;
  font-family: monospace;
}
.z1-total { background: #dbeafe; color: #1e40af; }
.z2-total { background: #ccfbf1; color: #065f46; }

.zone-block {
  margin: 0.6rem 0.9rem;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  overflow: hidden;
  background: white;
}
.zone-block-title {
  padding: 0.35rem 0.7rem;
  background: #f8fafc;
  font-size: 0.79rem;
  color: #475569;
  border-bottom: 1px solid #f1f5f9;
}

.calc-steps { padding: 0.4rem 0; }
.calc-row {
  display: grid;
  grid-template-columns: 56px 1fr auto;
  align-items: baseline;
  gap: 0 0.5rem;
  padding: 0.18rem 0.7rem;
  font-size: 0.79rem;
  font-family: 'Courier New', monospace;
}
.calc-row.highlight { background: #f0f9ff; }
.calc-row.result    { background: #eff6ff; font-weight: 700; }
.calc-sym  { color: #1d4ed8; font-weight: 700; }
.calc-eq   { color: #1e293b; }
.calc-note { font-size: 0.72rem; color: #94a3b8; font-family: sans-serif; white-space: nowrap; }

.total-box {
  margin: 0.6rem 0.9rem 0.75rem;
  background: white;
  border: 1.5px solid #bfdbfe;
  border-radius: 8px;
  padding: 0.65rem 0.9rem;
}
.total-row {
  display: flex;
  gap: 1rem;
  align-items: baseline;
  font-size: 0.85rem;
  flex-wrap: wrap;
}
.total-formula { color: #475569; }
.total-val     { color: #475569; font-family: monospace; }
.total-result  { font-size: 1.05rem; font-weight: 800; color: #1d4ed8; font-family: monospace; }
.total-row.minor { margin-top: 0.4rem; font-size: 0.78rem; color: #64748b; font-family: monospace; gap: 1.2rem; }

/* Badges */
.badge-ok   { background:#dcfce7; color:#15803d; font-size:0.74rem; font-weight:700; padding:0.1rem 0.4rem; border-radius:12px; }
.badge-warn { background:#fef3c7; color:#92400e; font-size:0.74rem; font-weight:700; padding:0.1rem 0.4rem; border-radius:12px; }
.badge-blue { background:#dbeafe; color:#1e40af; font-size:0.74rem; font-weight:700; padding:0.1rem 0.4rem; border-radius:12px; }
.badge-gray { background:#f1f5f9; color:#64748b; font-size:0.74rem; font-weight:700; padding:0.1rem 0.4rem; border-radius:12px; }

/* ── Bedienung tab ─────────────────────────────────────────────────────────── */
.usage-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
}
@media (max-width: 560px) { .usage-grid { grid-template-columns: 1fr; } }

.usage-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  font-size: 0.81rem;
}
.usage-card-head {
  padding: 0.4rem 0.75rem;
  background: #f1f5f9;
  font-weight: 700;
  font-size: 0.79rem;
  color: #334155;
  border-bottom: 1px solid #e2e8f0;
}
.usage-card-body {
  padding: 0.6rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  color: #374151;
  line-height: 1.5;
}
.usage-card-body ul {
  margin: 0.25rem 0 0;
  padding-left: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.usage-row {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: #334155;
}

.usage-note {
  margin-top: 0.3rem;
  font-size: 0.74rem;
  color: #64748b;
  font-style: italic;
  line-height: 1.45;
}

kbd {
  display: inline-block;
  padding: 0.08rem 0.4rem;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-bottom-width: 2px;
  border-radius: 4px;
  font-size: 0.73rem;
  font-family: 'Courier New', monospace;
  color: #1e293b;
  white-space: nowrap;
  flex-shrink: 0;
}

.layer-chip {
  display: inline-block;
  padding: 0.08rem 0.45rem;
  border-radius: 4px;
  font-size: 0.74rem;
  font-weight: 700;
}
.layer-chip.terrain { background: #f1f5f9; color: #374151; }
.layer-chip.buk     { background: #fef3c7; color: #92400e; }
.layer-chip.bok     { background: #ede9fe; color: #5b21b6; }

/* ── Glossar tab ───────────────────────────────────────────────────────────── */
.glossar-list { display: flex; flex-direction: column; gap: 0; }
.glossar-item {
  padding: 0.75rem 0.5rem;
  border-bottom: 1px solid #f1f5f9;
}
.glossar-item:last-child { border-bottom: none; }
.glossar-term {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}
.gterm { font-size: 0.87rem; font-weight: 700; color: #1e293b; }
.gunit { font-size: 0.75rem; color: #64748b; font-family: monospace; }
.glossar-def    { font-size: 0.81rem; color: #374151; line-height: 1.5; }
.glossar-detail { font-size: 0.77rem; color: #64748b; line-height: 1.45; margin-top: 0.2rem; font-style: italic; }
.gformula {
  display: inline-block;
  margin-top: 0.3rem;
  font-family: 'Courier New', monospace;
  font-size: 0.79rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 3px solid #3b82f6;
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  color: #1e293b;
}
</style>
