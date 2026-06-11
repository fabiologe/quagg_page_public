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

          <!-- Brückenkoeffizienten -->
          <section class="info-section">
            <h4>Brückenkoeffizienten</h4>
            <div class="usage-grid">
              <div class="usage-card">
                <div class="usage-card-head">&mu; — Orifice-Beiwert (Druckabfluss)</div>
                <div class="usage-card-body">
                  Wird aktiv sobald WSP &ge; BUK (Zustand 2 und 3).<br>
                  Formel: <code>Q = &mu; &middot; A_öffn. &middot; &radic;(2g &middot; &Delta;h) / &radic;(1+&mu;²&zeta;)</code>
                  <div class="usage-row" style="margin-top:0.4rem">Scharfkantiger Einlauf: <strong>0.60–0.70</strong></div>
                  <div class="usage-row">Abgerundeter Einlauf: <strong>0.80–0.90</strong></div>
                  <p class="usage-note">Eingabe im Bereich <strong>Brückenkoeffizienten</strong> im linken Panel (erscheint nur wenn ein BUK-Profil definiert ist).</p>
                </div>
              </div>
              <div class="usage-card">
                <div class="usage-card-head">&mu;<sub>D</sub> — Poleni-Beiwert (Überströmung)</div>
                <div class="usage-card-body">
                  Wird aktiv sobald WSP &gt; BOK (Zustand 3).<br>
                  Formel: <code>Q₂ = &frac23; &middot; &mu;D &middot; &radic;(2g) &middot; &int; h_ü(x)^1.5 dx</code>
                  <div class="usage-row" style="margin-top:0.4rem">Scharfkantig (BOK-Kante): <strong>0.35–0.40</strong></div>
                  <div class="usage-row">Abgerundet / Fahrbahn: <strong>0.45–0.50</strong></div>
                  <p class="usage-note">Die Streifenintegration über den BOK-Fußabdruck erfasst auch eine geneigte Brückendecke automatisch korrekt.</p>
                </div>
              </div>
              <div class="usage-card">
                <div class="usage-card-head">&zeta; — Formwiderstand &amp; Pfeiler-Geometrie</div>
                <div class="usage-card-body">
                  <strong>&zeta; — Formwiderstandsbeiwert</strong><br>
                  Beschreibt den hydrodynamischen Einlaufverlust (Pfeilerform).<br>
                  <code>&mu;<sub>eff</sub> = &mu; / &radic;(1 + &mu;² &middot; &zeta;)</code>
                  <div class="usage-row" style="margin-top:0.3rem">Kein Pfeiler: <strong>0.0</strong></div>
                  <div class="usage-row">Tropfenförmig: <strong>0.1–0.3</strong></div>
                  <div class="usage-row">Rechteckig: <strong>0.7–1.2</strong></div>
                  <hr style="border:none;border-top:1px solid #e2e8f0;margin:0.5rem 0">
                  <strong>&phi; — Pfeiler-Geometrie (Versperrungsgrad)</strong><br>
                  Anzahl <em>n</em> und Breite <em>b<sub>P</sub></em> der Pfeiler eingeben → Nettofläche wird automatisch berechnet:<br>
                  <code>&phi; = n &middot; b<sub>P</sub> / L<sub>BUK</sub></code><br>
                  <code>A<sub>netto</sub> = A<sub>öffn.</sub> &middot; (1 &minus; &phi;)</code><br>
                  <code>Q = &mu; &middot; A<sub>netto</sub> &middot; &radic;(2g &middot; &Delta;h) / &radic;(1 + &mu;² &middot; &zeta;)</code>
                  <p class="usage-note">Bei n = 0 gilt A<sub>netto</sub> = A<sub>öffn.</sub> (volle Bruttofläche). Beide Effekte überlagern sich multiplikativ.</p>
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
            <h4>Hydraulische Zustände — Vier-Zustands-Modell</h4>
            <p>
              Je nach Verhältnis WSP zu BUK und BOK wechselt das Modell die Berechnungsformel.
              Der aktuelle Zustand wird im Ergebnisbereich als farbiges Banner angezeigt.
            </p>
            <div class="state-table">
              <div class="state-row state-free">
                <div class="state-num">Z 1</div>
                <div class="state-name">Freispiegel</div>
                <div class="state-cond">WSP &lt; BUK</div>
                <div class="state-formula-cell">Q = Σ kSt &middot; A &middot; R<sup>2/3</sup> &middot; I<sup>1/2</sup></div>
              </div>
              <div class="state-row state-pressure">
                <div class="state-num">Z 2</div>
                <div class="state-name">Druckabfluss</div>
                <div class="state-cond">WSP &ge; BUK</div>
                <div class="state-formula-cell">Q₁ = &mu; &middot; A<sub>netto</sub> &middot; &radic;(2g &middot; &Delta;h) / &radic;(1+&mu;²&zeta;)</div>
              </div>
              <div class="state-row state-overflow">
                <div class="state-num">Z 3</div>
                <div class="state-name">Druck + Überströmung</div>
                <div class="state-cond">WSP &gt; BOK</div>
                <div class="state-formula-cell">Z 2-Formel + Q₂ = &frac23;&mu;<sub>D</sub>&radic;(2g)&int;h_ü<sup>3/2</sup>dx</div>
              </div>
            </div>
          </section>

          <section class="info-section">
            <h4>Zone 1 — Freispiegel: Composite Manning-Strickler (Einstein)</h4>
            <p>Für jede kSt-Zone <em>i</em> werden Fläche und Umfang separat integriert:</p>
            <div class="formula-box">
              <div class="formula">Q₁ = Σ kSt<sub>i</sub> · A<sub>i</sub> · R<sub>i</sub><sup>2/3</sup> · I<sup>1/2</sup></div>
              <div class="formula-sub">mit  R<sub>i</sub> = A<sub>i</sub> / P<sub>i</sub>  (hydraulischer Radius)</div>
            </div>
            <p class="hint-text">
              Der Einstein-Ansatz verhindert, dass unterschiedlich raue Teilbereiche
              sich gegenseitig herausmitteln. Vorlandstreifen außerhalb des BOK-Fußabdrucks
              nutzen Manning auch in Zustand 2 und 3.
            </p>
          </section>

          <section class="info-section">
            <h4>Zone 1 — Druckabfluss: Orifice-Formel</h4>
            <p>
              Sobald WSP &ge; BUK (Soffit), ist die Brückenöffnung vollständig gefüllt.
              Die Durchströmung wird mit der Orifice-Formel berechnet:
            </p>
            <div class="formula-box">
              <div class="formula">Q₁ = &mu; · A<sub>netto</sub> · &radic;(2g · &Delta;h) / &radic;(1 + &mu;² · &zeta;)</div>
              <div class="formula-sub">&Delta;h = WSP &minus; z̄<sub>BUK</sub>  (Aufstau über flächengewichteter BUK-Mittelhöhe)</div>
              <div class="formula-sub">A<sub>netto</sub> = A<sub>öffn.</sub> · (1 &minus; &phi;)  mit  &phi; = n · b<sub>P</sub> / L<sub>BUK</sub>  (Versperrungsgrad)</div>
              <div class="formula-sub">A<sub>öffn.</sub> = Bruttofläche zwischen Gelände und BUK  (bei n = 0: A<sub>netto</sub> = A<sub>öffn.</sub>)</div>
              <div class="formula-sub">&zeta; = Formwiderstandsbeiwert (Einlaufverlust, 0 = kein Pfeiler)</div>
            </div>
            <p class="hint-text">
              Äquivalent: Q₁ = &mu;<sub>eff</sub> · A<sub>netto</sub> · &radic;(2g · &Delta;h)  mit  &mu;<sub>eff</sub> = &mu; / &radic;(1 + &mu;² · &zeta;).
              Pfeileranzahl und -breite im Panel <strong>Brückenkoeffizienten → Pfeiler-Geometrie</strong> eingeben.
            </p>
          </section>

          <section class="info-section">
            <h4>Zone 2 — Überströmung: Poleni-Formel (Streifenintegration)</h4>
            <p>
              Sobald WSP &gt; BOK fließt Wasser über das Brückendeck. Der Abfluss folgt der
              verallgemeinerten Poleni-Wehrformel, streifenweise über den BOK-Fußabdruck integriert:
            </p>
            <div class="formula-box">
              <div class="formula">Q₂ = &frac23; · &mu;<sub>D</sub> · &radic;(2g) · &int; &sigma;(x) · max(0, WSP &minus; z<sub>BOK</sub>(x))<sup>3/2</sup> dx</div>
              <div class="formula-sub">h_ü(x) = WSP &minus; BOK-Höhe an Stelle x  (Überströmungshöhe)</div>
              <div class="formula-sub">&sigma;(x) = (1 &minus; (h_uw/h_ü)<sup>1.5</sup>)<sup>0.385</sup>  bei UW-WSP &gt; BOK (Villemonte), sonst 1</div>
            </div>
            <p class="hint-text">
              Die Streifenintegration gilt auch für geneigte oder gewölbte Brückendecken korrekt.
              Vorlandabfluss außerhalb des BOK-Fußabdrucks (überströmtes Vorland) benutzt weiterhin Manning.
              Liegt der eingegebene UW-WSP über der BOK, wird der Überfall streifenweise als
              <em>unvollkommen</em> (rückgestaut) abgemindert.
            </p>
          </section>

          <section class="info-section">
            <h4>Hinweis: Zustandsübergang rein geometrisch</h4>
            <div class="notice-box">
              <p>
                Der Wechsel zwischen Freispiegel und Druckabfluss erfolgt aktuell rein geometrisch:
                Sobald WSP &ge; niedrigstes z<sub>BUK</sub> irgendwo im Querschnitt, schaltet das Modell
                vollständig auf Orifice um. Bei asymmetrischen Öffnungen (z.B. Gewölbe, einseitig
                tiefer Scheitel) kann das zu früh passieren — physikalisch korrekt wäre eine
                <em>partielle Druckströmung</em>, bei der einzelne Streifen bereits im Druckabfluss
                sind während andere noch Freispiegel führen.
              </p>
              <p>
                <strong>Workaround:</strong> Den Toggle <em>Hydraulischer Zustand</em> im Eingabefeld nutzen,
                um manuell Freispiegel oder Druckabfluss zu erzwingen und beide Ergebnisse zu vergleichen.
                Eine streifen-weise partielle Druckströmung ist als zukünftige Erweiterung vorgesehen.
              </p>
            </div>
          </section>

          <section class="info-section">
            <h4>Modellgrenzen (1D-Einzelquerschnitt)</h4>
            <div class="notice-box">
              <p>
                Das Modell ist eine <strong>stationäre Einzelquerschnitts-Berechnung</strong>
                (Rating Curve am Bauwerk), <em>keine Spiegellinienberechnung</em>: Es gibt keine
                Energiegleichung zwischen Oberwasser- und Unterwasserquerschnitt. Der Aufstau
                oberstrom wird nur implizit über die Q-WSP-Beziehung am Bauwerksquerschnitt
                erfasst — im Freispiegel zusätzlich als Pfeilerstau-Abschätzung
                &Delta;h<sub>P</sub> = &zeta; · v<sub>öffn.</sub>²/2g.
              </p>
              <p>
                Weitere bewusste Vereinfachungen:
              </p>
              <ul>
                <li>Die Anström-Geschwindigkeitshöhe v²/2g wird in der Orifice-Triebhöhe
                  vernachlässigt (konservativ: Q wird eher unter-, der WSP eher überschätzt).</li>
                <li>Kontraktions-/Expansionsverluste zwischen Querschnitten existieren nicht —
                  μ deckt die Strahlkontraktion am Bauwerk ab.</li>
                <li>Schräganströmung der Pfeiler wird nicht abgebildet (1D-üblich).</li>
                <li>Treibgut/Verklausung nur näherungsweise über erhöhte Pfeilerbreite b<sub>P</sub>.</li>
                <li>Bei Fr<sub>öffn.</sub> ≥ 1 (Choking-Warnung) ist die Manning-Annahme
                  verletzt — Ergebnis als untere Grenze des Aufstaus interpretieren.</li>
              </ul>
            </div>
          </section>

          <section class="info-section">
            <h4>Streifenintegration (alle Zustände)</h4>
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

            <!-- Freispiegel: Manning-Strickler je kSt-Zone -->
            <template v-if="!res.isSubmerged">
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
                    <span class="calc-note">Benetzter Umfang</span>
                  </div>
                  <div class="calc-row highlight">
                    <span class="calc-sym">R₁</span>
                    <span class="calc-eq">= {{ n(z.A1,4) }} / {{ n(z.P1,4) }} = <strong>{{ n(z.R1, 4) }} m</strong></span>
                    <span class="calc-note">Hydraulischer Radius</span>
                  </div>
                  <div class="calc-row">
                    <span class="calc-sym">R₁<sup>2/3</sup></span>
                    <span class="calc-eq">= {{ n(z.R1,4) }}<sup>2/3</sup> = {{ n(Math.pow(z.R1,2/3),5) }}</span>
                    <span class="calc-note"></span>
                  </div>
                  <div class="calc-row highlight">
                    <span class="calc-sym">v₁</span>
                    <span class="calc-eq">= {{ z.kst }} · {{ n(Math.pow(z.R1,2/3),5) }} · {{ n(sqrtI,6) }} = <strong>{{ n(z.v1,4) }} m/s</strong></span>
                    <span class="calc-note">Manning-Strickler</span>
                  </div>
                  <div class="calc-row result">
                    <span class="calc-sym">Q₁</span>
                    <span class="calc-eq">= {{ n(z.v1,4) }} · {{ n(z.A1,4) }} = <strong>{{ n(z.Q1,4) }} m³/s</strong></span>
                    <span class="calc-note"></span>
                  </div>
                </div>
              </div>
              <div v-if="res.zoneResults.filter(z=>z.A1>1e-6).length > 1" class="proto-total z1-total">
                Σ Zone 1:
                Q₁ = {{ n(res.Q1_total,4) }} m³/s ·
                A₁ = {{ n(res.A1_total,4) }} m² ·
                v̄₁ = {{ n(res.v1_mean,4) }} m/s ·
                R̄₁ = {{ n(res.R1_mean,4) }} m
              </div>
            </template>

            <!-- Druckabfluss: Orifice-Formel -->
            <template v-if="res.isSubmerged">
              <div class="zone-block">
                <div class="zone-block-title">Zustand 2 — Druckabfluss (Orifice)</div>
                <div class="calc-steps">
                  <div class="calc-row">
                    <span class="calc-sym">A<sub>öffn.</sub></span>
                    <span class="calc-eq">= {{ n(res.A_bridge, 4) }} m²</span>
                    <span class="calc-note">Öffnungsfläche (Gelände bis BUK)</span>
                  </div>
                  <div class="calc-row">
                    <span class="calc-sym">z̄<sub>BUK</sub></span>
                    <span class="calc-eq">= {{ n(store.wsp - res.h_drive, 3) }} m  (flächengewichtet)</span>
                    <span class="calc-note">Mittelhöhe BUK-Öffnung</span>
                  </div>
                  <div class="calc-row highlight">
                    <span class="calc-sym">&Delta;h</span>
                    <span class="calc-eq">= {{ n(store.wsp, 3) }} &minus; {{ n(store.wsp - res.h_drive, 3) }} = <strong>{{ n(res.h_drive, 4) }} m</strong></span>
                    <span class="calc-note">Antriebshöhe</span>
                  </div>
                  <div class="calc-row" v-if="store.zeta > 0">
                    <span class="calc-sym">&zeta;</span>
                    <span class="calc-eq">= {{ n(store.zeta, 2) }}</span>
                    <span class="calc-note">Pfeiler-Verlustbeiwert</span>
                  </div>
                  <div class="calc-row highlight" v-if="store.zeta > 0">
                    <span class="calc-sym">&mu;<sub>eff</sub></span>
                    <span class="calc-eq">= {{ n(store.mu, 2) }} / &radic;(1 + {{ n(store.mu, 2) }}² &middot; {{ n(store.zeta, 2) }}) = <strong>{{ n(res.mu_eff, 4) }}</strong></span>
                    <span class="calc-note">Eff. Beiwert mit Pfeiler</span>
                  </div>
                  <div class="calc-row highlight">
                    <span class="calc-sym">v<sub>orifice</sub></span>
                    <span class="calc-eq">= &radic;(2g · &Delta;h) = <strong>{{ n(res.v1_mean, 4) }} m/s</strong></span>
                    <span class="calc-note">Mittlere Geschwindigkeit</span>
                  </div>
                  <div class="calc-row result">
                    <span class="calc-sym">Q₁</span>
                    <span class="calc-eq">= {{ n(res.mu_eff, store.zeta > 0 ? 4 : 2) }} · {{ n(res.A_bridge, 4) }} · {{ n(res.v1_mean, 4) }} = <strong>{{ n(res.Q_orifice, 4) }} m³/s</strong></span>
                    <span class="calc-note">{{ store.zeta > 0 ? 'μ_eff' : 'μ' }} = {{ n(res.mu_eff, store.zeta > 0 ? 4 : 2) }}</span>
                  </div>
                </div>
              </div>
              <div class="proto-total z1-total">
                Zone 1 gesamt:
                Q₁ = {{ n(res.Q1_total,4) }} m³/s ·
                A<sub>öffn.</sub> = {{ n(res.A_bridge,4) }} m² ·
                v̄₁ = {{ n(res.v1_mean,4) }} m/s
              </div>
            </template>
          </section>

          <!-- Zone 2 -->
          <section class="proto-section">
            <div class="proto-head">
              <span class="zone-dot z2dot"></span>
              Zone 2 — Überströmung  (oberhalb BOK-Referenz)
            </div>

            <div v-if="!res.hasOverflow" class="proto-empty">
              WSP = {{ store.wsp.toFixed(3) }} m liegt unterhalb der BOK — keine Überströmung.
            </div>

            <!-- Überströmung: Poleni -->
            <template v-if="res.hasOverflow">
              <div class="zone-block">
                <div class="zone-block-title">Zustand 3 — Überströmung (Poleni, Streifenintegration)</div>
                <div class="calc-steps">
                  <div class="calc-row">
                    <span class="calc-sym">A₂</span>
                    <span class="calc-eq">= {{ n(res.A2_total, 4) }} m²</span>
                    <span class="calc-note">Überströmungsfläche über BOK</span>
                  </div>
                  <div class="calc-row highlight">
                    <span class="calc-sym">Q<sub>Poleni</sub></span>
                    <span class="calc-eq">= ²⁄₃ · {{ n(store.muDeck,2) }} · √(2g) · ∫ h_ü<sup>3/2</sup> dx = <strong>{{ n(res.Q_poleni, 4) }} m³/s</strong></span>
                    <span class="calc-note">μ<sub>D</sub> = {{ store.muDeck.toFixed(2) }}</span>
                  </div>
                  <div class="calc-row result">
                    <span class="calc-sym">Q₂</span>
                    <span class="calc-eq">= Q<sub>Poleni</sub> + Q<sub>Vorland</sub> = <strong>{{ n(res.Q2_total, 4) }} m³/s</strong></span>
                    <span class="calc-note">inkl. Manning-Vorland außerhalb BOK</span>
                  </div>
                </div>
              </div>
              <div class="proto-total z2-total">
                Zone 2 gesamt:
                Q₂ = {{ n(res.Q2_total,4) }} m³/s ·
                A₂ = {{ n(res.A2_total,4) }} m² ·
                v̄₂ = {{ n(res.v2_mean,4) }} m/s
              </div>
            </template>
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
    detail: 'Im Modell: Deckel für Zone 1 bei Freispiegelabfluss. Bei WSP ≥ BUK wechselt Zone 1 in Druckabfluss (Orifice-Formel). Die Öffnungsfläche A_öffn. = Fläche zwischen Gelände und BUK.',
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
    term: 'Druckabfluss (Zustand 2)',
    def:  'Abfluss unter Druck — WSP ≥ BUK, die Brückenöffnung ist vollständig gefüllt.',
    detail: 'Berechnung mit Orifice-Formel: Q = μ · A_öffn. · √(2g · Δh), Δh = WSP − z̄_BUK. Vorlandstreifen außerhalb des BOK-Fußabdrucks benutzen weiterhin Manning.',
    formula: 'Q₁ = μ · A_öffn. · √(2g · Δh)',
  },
  {
    term: 'μ — Orifice-Beiwert',
    unit: '–  (0.60–0.90)',
    def:  'Verlustbeiwert für den Durchströmungsquerschnitt im Druckabfluss (Zustand 2 und 3).',
    detail: 'Berücksichtigt Einlaufverluste und Strahlkontraktion. Scharfkantig: 0.60–0.70. Abgerundet: 0.80–0.90. Einstellbar im Panel Brückenkoeffizienten.',
    formula: 'Q = μ · A · √(2g · Δh)',
  },
  {
    term: 'μD — Poleni-Beiwert',
    unit: '–  (0.35–0.55)',
    def:  'Überfallbeiwert für die Überströmung des Brückendecks (Zustand 3, Poleni-Formel).',
    detail: 'Typisch 0.35–0.50. Scharfkantige BOK-Kante eher 0.35–0.40. Abgerundete Fahrbahn 0.45–0.50. Einstellbar im Panel Brückenkoeffizienten.',
    formula: 'Q₂ = ⅔ · μD · √(2g) · ∫ h_ü^1.5 dx',
  },
  {
    term: 'ζ — Pfeiler-Verlustbeiwert',
    unit: '–  (0.0–2.0)',
    def:  'Formwiderstandsbeiwert des Brückenpfeilers — wirkt in allen Zuständen.',
    detail: 'Druckabfluss: analytisch in die Orifice-Formel eingebunden (μ_eff = μ / √(1+μ²·ζ)). Freispiegel: Pfeilerstau-Abschätzung Δh_P = ζ · v_öffn.²/2g (vereinfachter Widerstandsbeiwert-Ansatz, wie in 1D-Modellen üblich). Kein Pfeiler: ζ = 0. Geometrischer Querschnittsverlust durch Pfeiler im Geländeprofil ist davon unabhängig.',
    formula: 'μ_eff = μ / √(1 + μ² · ζ)   ·   Δh_P = ζ · v_öffn.² / 2g',
  },
  {
    term: 'φ — Pfeiler-Versperrungsgrad',
    unit: '–  (0–0.95)',
    def:  'Anteil der Brückenöffnung, der durch Pfeiler versperrt ist: φ = n · b_P / L_BUK.',
    detail: 'Reduziert die wirksame Öffnungsfläche in allen Zuständen: A_netto = A_öffn. · (1−φ). Im Freispiegel werden die Streifen im BUK-Fußabdruck mit (1−φ) multipliziert. Verklausung durch Treibgut kann näherungsweise über eine erhöhte Pfeilerbreite b_P abgebildet werden.',
    formula: 'A_netto = A_öffn. · (1 − φ)',
  },
  {
    term: 'σ — Rückstaubeiwert (Überfall)',
    unit: '–  (0–1)',
    def:  'Abminderung des Poleni-Überfalls bei eingestautem Brückendeck (unvollkommener Überfall).',
    detail: 'Wenn der UW-WSP über der BOK liegt, wird jeder Poleni-Streifen nach Villemonte abgemindert. σ = 1: vollkommener Überfall (UW unterhalb BOK). σ → 0: vollständig eingestaut, kein Überfallabfluss.',
    formula: 'σ = (1 − (h_uw/h_ü)^1.5)^0.385',
  },
  {
    term: 'Totwasserzone (Ineffective Flow Area)',
    def:  'kSt-Zone mit Markierung „Totwasser": Bereich mit stehendem Wasser, der nicht am Abfluss teilnimmt (z.B. hinter Widerlagern).',
    detail: 'Streifen in Totwasserzonen tragen weder Fläche noch Abfluss bei — sie wirken nur als Retentionsraum. Falsch angenommene mitwirkende Vorlandbreiten sind eine Hauptfehlerquelle in 1D-Modellen; Totwasserzonen müssen vom Ingenieur manuell definiert werden.',
  },
  {
    term: 'Fr_öffn. — Froude-Zahl der Brückenöffnung',
    unit: '–',
    def:  'Froude-Zahl im verengten Querschnitt unter der Brücke (Freispiegelzustand).',
    detail: 'Der Regimewechsel (strömend → schießend) findet zuerst in der Verengung statt. Fr_öffn. ≥ 1 bedeutet, dass die Öffnung als kritischer Kontrollquerschnitt wirkt (Choking) — die Manning-Annahme gleichförmigen Abflusses ist dann nicht mehr gültig, der tatsächliche Aufstau wird unterschätzt.',
    formula: 'Fr = v_öffn. / √(g · A_öffn./T_öffn.)',
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
.notice-box {
  background: #fefce8;
  border: 1px solid #fde047;
  border-left: 4px solid #eab308;
  border-radius: 7px;
  padding: 0.65rem 0.85rem;
  font-size: 0.8rem;
  color: #713f12;
  line-height: 1.55;
}
.notice-box p { margin: 0 0 0.4rem; }
.notice-box p:last-child { margin: 0; }

/* State table in Methode tab */
.state-table { display: flex; flex-direction: column; gap: 0.4rem; margin: 0.5rem 0; }
.state-row {
  display: grid;
  grid-template-columns: 2.5rem 7rem 6rem 1fr;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.7rem;
  border-radius: 6px;
  border: 1px solid;
  font-size: 0.8rem;
}
.state-num { font-weight: 800; font-size: 0.75rem; }
.state-name { font-weight: 700; }
.state-cond { font-size: 0.73rem; opacity: 0.85; }
.state-formula-cell { font-family: 'Courier New', monospace; font-size: 0.72rem; }
.state-free     { background: #f0fdf4; border-color: #86efac; color: #15803d; }
.state-pressure { background: #fffbeb; border-color: #fcd34d; color: #92400e; }
.state-overflow { background: #eff6ff; border-color: #93c5fd; color: #1e40af; }

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
