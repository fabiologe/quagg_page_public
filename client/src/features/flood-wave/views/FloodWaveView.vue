<template>
  <div class="fw">
    <!-- ------------------------------------------------------------ Karte -->
    <div class="fw-map">
      <BaseMap
        ref="mapRef"
        :draw-options="{ polygon: true, polyline: true, rectangle: false, circle: false, marker: false, circlemarker: false }"
        :polygon-styles="store.mapStyles"
        @update="handleMapUpdate"
        @delete="handleMapDelete"
      />

      <div v-if="store.riverLength > 0" class="fw-map-readout">
        <span class="fw-map-readout-key">L<sub>f</sub></span>
        <span class="fw-map-readout-val">{{ fmt(store.riverLength / 1000, 3) }}</span>
        <span class="fw-map-readout-unit">km</span>
      </div>

      <div v-if="store.notice" class="fw-notice" :class="store.notice.level">
        <FwIcon :name="store.notice.level === 'info' ? 'info' : 'alert'" :size="15" />
        <p>{{ store.notice.text }}</p>
        <button class="fw-notice-close" @click="store.setNotice(null)" aria-label="Hinweis schließen">
          <FwIcon name="close" :size="14" />
        </button>
      </div>
    </div>

    <!-- ------------------------------------------------------------ Panel -->
    <div class="fw-panel">
      <header class="fw-head">
        <p class="fw-overline">Hydrologischer Nachweis</p>
        <div class="fw-title-row">
          <h1>Hochwasserwelle HQ<span class="fw-sub">100</span></h1>
          <button class="fw-info-btn" :class="{ active: showInfo }"
                  @click="showInfo = !showInfo"
                  :aria-expanded="showInfo ? 'true' : 'false'"
                  aria-controls="fw-info-panel">
            <FwIcon :name="showInfo ? 'close' : 'info'" :size="14" />
            <span>{{ showInfo ? 'schließen' : 'Was wird hier gerechnet?' }}</span>
          </button>
        </div>
        <p class="fw-method">
          <span>SCS-Curve-Number</span>
          <i>/</i>
          <span>Lineare Speicherkaskade (Nash)</span>
        </p>

        <transition name="fw-pop">
          <aside v-if="showInfo" id="fw-info-panel" class="fw-info">
            <section>
              <h3>Ergebnis des Werkzeugs</h3>
              <p>
                Aus einem Bemessungsregen wird die Hochwasserwelle eines kleinen
                bis mittleren Einzugsgebiets ermittelt: der Scheitelabfluss
                Q<sub>max</sub> und das Rückhaltevolumen V<sub>erf</sub>, das
                hinter einer Drossel bereitgestellt werden muss.
              </p>
            </section>

            <section>
              <h3>Zwei Rechenschritte</h3>
              <div class="fw-info-step">
                <span class="fw-info-num">01</span>
                <div>
                  <strong>Abflussbildung — SCS-Curve-Number</strong>
                  <p>
                    Wie viel des Niederschlags wird überhaupt zu Abfluss? Der Rest
                    versickert, verdunstet oder bleibt in Mulden. Die Curve Number
                    bündelt Bodenart, Nutzung und Versiegelung in einer Kennzahl;
                    die Vorfeuchte kommt über die AMC-Klasse dazu.
                  </p>
                </div>
              </div>
              <div class="fw-info-step">
                <span class="fw-info-num">02</span>
                <div>
                  <strong>Abflusskonzentration — Nash-Kaskade</strong>
                  <p>
                    Wie verzögert und wie gedämpft erreicht dieser Abfluss den
                    Gebietsauslass? n hintereinandergeschaltete Linearspeicher mit
                    dem Koeffizienten k formen aus dem Regen die Welle — je größer
                    das Produkt aus n und k, desto flacher und später der Scheitel.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h3>Wofür man das braucht</h3>
              <ul>
                <li>Bemessung von Regenrückhaltebecken und deren Drosselorganen</li>
                <li>Nachweis für Durchlässe, Verrohrungen und kleine Brücken</li>
                <li>HQ<sub>100</sub>-Abschätzung an <em>unbepegelten</em> Gewässern —
                    ohne Messreihe gibt es keine Abflussstatistik, also muss ein
                    Niederschlag-Abfluss-Modell einspringen</li>
                <li>Zuflussganglinie als Randbedingung für eine 2D-Simulation</li>
              </ul>
            </section>

            <section class="fw-info-limits">
              <h3>Was es ausdrücklich nicht ist</h3>
              <ul>
                <li><strong>Keine Hydraulik.</strong> Es entsteht eine Ganglinie am
                    Auslass — keine Wasserspiegellage und keine Überflutungsfläche.
                    Dafür ist das 2D-Werkzeug da.</li>
                <li><strong>Kein statistischer Nachweis.</strong> Ein 100-jährlicher
                    Regen erzeugt nicht zwangsläufig einen 100-jährlichen Abfluss.</li>
                <li><strong>Kein Dauerbetrieb.</strong> Gerechnet wird ein
                    Einzelereignis, keine Langzeitreihe.</li>
              </ul>
            </section>

            <section>
              <h3>Grenzen &amp; Sorgfaltspflichten</h3>
              <ul>
                <li>SCS-CN ist für kleine bis mittlere Gebiete abgeleitet; ab etwa
                    25 km² ist zusätzlich der Punkt- auf Gebietsniederschlag
                    abzumindern.</li>
                <li>T<sub>c</sub> nach California Culverts Practice setzt ein
                    ausgeprägtes Gerinne und natürliches Gefälle voraus.</li>
                <li>k und n sind Kalibrierparameter. Ohne Pegel bleiben sie eine
                    begründete Annahme — hier vorbelegt mit k = T<sub>c</sub>/n.</li>
                <li>Die maßgebende Dauerstufe ist nicht bekannt, sondern zu suchen:
                    für V<sub>erf</sub> ist meist eine andere maßgebend als für
                    Q<sub>max</sub>.</li>
              </ul>
            </section>

            <p class="fw-info-foot">
              Alle Zwischengrößen (S, I<sub>a</sub>, P<sub>e</sub>, ψ, Zeitschritt,
              Rechenfenster, Massenbilanz) stehen im Ergebnisblock und im
              PDF-Bericht, damit der Nachweis nachrechenbar bleibt.
              Die Ergebnisse sind vom Aufsteller zu prüfen.
            </p>

            <!-- weicher Auslauf am unteren Rand: zeigt an, dass noch Text folgt,
                 und sitzt am Ende des Scrollwegs nur noch im Innenabstand -->
            <div class="fw-info-fade" aria-hidden="true"></div>
          </aside>
        </transition>
      </header>

      <transition name="fw-fade">
        <div v-if="showInfo" class="fw-info-backdrop" @click="showInfo = false"></div>
      </transition>

      <div class="fw-scroll">

        <!-- 01 ------------------------------------------------------------ -->
        <section class="fw-block">
          <div class="fw-block-head">
            <span class="fw-num">01</span>
            <h2>Einzugsgebiet &amp; Konzentrationszeit</h2>
          </div>

          <div class="fw-field">
            <div class="fw-field-head">
              <label>Fließlänge L<sub>f</sub></label>
              <span class="fw-unit">km</span>
            </div>
            <div class="fw-field-row">
              <input type="number" v-model.number="store.params.Lf" step="0.01" min="0" placeholder="zeichnen oder eingeben">
              <button class="fw-btn fw-btn-ghost" @click="startDrawRiver">
                <FwIcon name="polyline" />
                <span>Fließweg zeichnen</span>
              </button>
            </div>
            <p v-if="store.riverLength > 0" class="fw-note fw-note-ok">
              Aus der Karte übernommen: {{ fmt(store.riverLength / 1000, 3) }} km
            </p>
          </div>

          <div class="fw-field">
            <div class="fw-field-head">
              <label>Höhendifferenz &Delta;h</label>
              <span class="fw-unit">m</span>
            </div>
            <div class="fw-field-row">
              <input type="number" v-model.number="store.params.deltaH" step="0.1" min="0">
              <button class="fw-btn fw-btn-ghost fw-btn-square"
                      @click="fetchElevation"
                      :disabled="!store.riverCoords || store.isLoadingElevation"
                      title="Höhen entlang der Linie aus dem Höhendienst ermitteln">
                <FwIcon name="terrain" />
              </button>
            </div>
          </div>

          <div class="fw-readout">
            <span class="fw-readout-key">T<sub>c</sub> &nbsp;Konzentrationszeit</span>
            <span class="fw-readout-val">
              {{ store.tcResult > 0 ? fmt(store.tcResult, 2) : '—' }}
              <i v-if="store.tcResult > 0">h</i>
            </span>
          </div>

          <p class="fw-formula">
            T<sub>c</sub> = (0,868 · L<sub>f</sub><sup>3</sup> / &Delta;h)<sup>0,385</sup>
            <span>California Culverts Practice · L<sub>f</sub> in km, &Delta;h in m</span>
          </p>
          <p v-if="store.tcWarning" class="fw-inline-note warn">{{ store.tcWarning }}</p>
        </section>

        <!-- 02 ------------------------------------------------------------ -->
        <section class="fw-block">
          <div class="fw-block-head">
            <span class="fw-num">02</span>
            <h2>Teilflächen &amp; CN-Werte</h2>
          </div>

          <div v-if="store.areas.length === 0" class="fw-empty">
            <p>Noch keine Flächen erfasst. Auf der Karte zeichnen oder GeoJSON ablegen.</p>
            <button v-if="store.riverLength > 0" class="fw-btn fw-btn-ghost fw-btn-block" @click="estimateArea">
              <FwIcon name="region" />
              <span>Einzugsgebiet abschätzen</span>
            </button>
          </div>

          <div v-else class="fw-areas">
            <div v-for="a in store.areas" :key="a.id" class="fw-area">
              <div class="fw-area-id">
                <span class="fw-area-name">{{ a.name || 'Fläche' }}</span>
                <span class="fw-area-size">{{ fmt(a.area / 10000, 2) }} ha</span>
              </div>
              <div class="fw-area-cn">
                <label>CN</label>
                <input type="number" v-model.number="a.cn" min="1" max="100" step="1">
              </div>
            </div>

            <div class="fw-areas-sum">
              <span>Summe</span>
              <span>
                {{ fmt(store.totalArea / 10000, 2) }} ha
                <i>·</i> {{ fmt(store.totalArea / 1e6, 3) }} km²
                <i>·</i> Misch-CN {{ fmt(store.weightedCN, 1) }}
              </span>
            </div>

            <p class="fw-formula">
              Der Misch-CN dient nur der Übersicht. Gerechnet wird flächenweise —
              die SCS-Gleichung ist nichtlinear in CN, ein Mischwert unterschätzt
              heterogene Gebiete deutlich.
            </p>
          </div>

          <details class="fw-details">
            <summary>CN-Anhaltswerte · AMC II, Bodengruppe B</summary>
            <table class="fw-table">
              <tbody>
                <tr><td>Versiegelt (Dach, Asphalt)</td><td>98</td></tr>
                <tr><td>Wohngebiet, ca. 65 % versiegelt</td><td>85</td></tr>
                <tr><td>Acker, Reihenkultur</td><td>78</td></tr>
                <tr><td>Grünland / Weide, guter Zustand</td><td>61</td></tr>
                <tr><td>Wald, guter Zustand</td><td>55</td></tr>
              </tbody>
            </table>
            <p class="fw-formula">
              Nach USDA-SCS / NRCS TR-55. Für die Bodengruppen A (sandig) bis D
              (bindig) liegen die Werte deutlich darunter bzw. darüber.
            </p>
          </details>
        </section>

        <!-- 03 ------------------------------------------------------------ -->
        <section class="fw-block">
          <div class="fw-block-head">
            <span class="fw-num">03</span>
            <h2>Niederschlag<span class="fw-block-tag">T = 100 a</span></h2>
          </div>

          <button class="fw-btn fw-btn-ghost fw-btn-block" @click="fetchKostra" :disabled="store.isLoadingKostra">
            <FwIcon name="rain" />
            <span>{{ store.isLoadingKostra ? 'KOSTRA wird geladen …' : 'KOSTRA-Daten laden' }}</span>
          </button>
          <p v-if="store.kostraLocation" class="fw-note fw-note-ok">
            Abgefragt am Gebietsschwerpunkt
            {{ fmt(store.kostraLocation.lat, 4) }} / {{ fmt(store.kostraLocation.lng, 4) }}
          </p>

          <div class="fw-grid2">
            <div class="fw-field">
              <div class="fw-field-head"><label>Dauerstufe D</label><span class="fw-unit">min</span></div>
              <select v-model.number="store.params.D">
                <option v-for="d in store.availableDurations" :key="d" :value="d">{{ d }}</option>
              </select>
            </div>
            <div class="fw-field">
              <div class="fw-field-head"><label>Niederschlagshöhe P</label><span class="fw-unit">mm</span></div>
              <input type="number" v-model.number="store.params.P" step="0.1" min="0">
            </div>
            <div class="fw-field">
              <div class="fw-field-head"><label>Verteilung</label></div>
              <select v-model="store.params.rainType">
                <option value="block">Blockregen</option>
                <option value="euler2">Modellregen Euler Typ II</option>
              </select>
            </div>
            <div class="fw-field">
              <div class="fw-field-head"><label>Gebietsreduktion</label><span class="fw-unit">—</span></div>
              <input type="number" v-model.number="store.params.arf" step="0.01" min="0.1" max="1">
            </div>
          </div>

          <p class="fw-formula">
            KOSTRA liefert Punktniederschlag (Feld HN_100A in mm). Ab etwa 25 km²
            liegt der Gebietsmittelwert darunter — der Faktor ist bewusst zu setzen,
            es wird keine Formel unterstellt. 1,00 = keine Abminderung.
          </p>

          <button class="fw-btn fw-btn-ghost fw-btn-block" @click="sweepDurations" :disabled="!store.kostraData || store.isSweeping">
            <FwIcon name="search" />
            <span>Maßgebende Dauerstufe ermitteln</span>
          </button>
        </section>

        <!-- 04 ------------------------------------------------------------ -->
        <section class="fw-block">
          <div class="fw-block-head">
            <span class="fw-num">04</span>
            <h2>Abflussbildung</h2>
          </div>

          <div class="fw-grid2">
            <div class="fw-field">
              <div class="fw-field-head"><label>Vorfeuchte AMC</label></div>
              <select v-model="store.params.amc">
                <option value="I">I — trocken</option>
                <option value="II">II — mittel (Tabellenwert)</option>
                <option value="III">III — nass</option>
              </select>
            </div>
            <div class="fw-field">
              <div class="fw-field-head"><label>Anfangsverlust I<sub>a</sub>/S</label></div>
              <select v-model.number="store.params.iaRatio">
                <option :value="0.2">0,20 — SCS-Original</option>
                <option :value="0.05">0,05 — europäische Anpassung</option>
              </select>
            </div>
          </div>

          <p class="fw-formula">
            S = 25400/CN − 254 &nbsp;·&nbsp; I<sub>a</sub> = (I<sub>a</sub>/S) · S
            &nbsp;·&nbsp; P<sub>e</sub> = (P − I<sub>a</sub>)² / (P − I<sub>a</sub> + S)
            <span>
              Die eingegebenen CN sind AMC-II-Tabellenwerte und werden nach Chow (1988)
              umgerechnet. Für ein 100-jährliches Ereignis ist AMC III der übliche Ansatz.
            </span>
          </p>
        </section>

        <!-- 05 ------------------------------------------------------------ -->
        <section class="fw-block">
          <div class="fw-block-head">
            <span class="fw-num">05</span>
            <h2>Abflusskonzentration &amp; Drossel</h2>
          </div>

          <label class="fw-check">
            <input type="checkbox" v-model="store.params.autoK">
            <span>Speicherkoeffizient aus T<sub>c</sub> ableiten &nbsp;<i>k = T<sub>c</sub> / n</i></span>
          </label>

          <div class="fw-grid2">
            <div class="fw-field">
              <div class="fw-field-head"><label>Kaskaden n</label><span class="fw-unit">—</span></div>
              <input type="number" v-model.number="store.params.n" step="1" min="1" max="10">
            </div>
            <div class="fw-field">
              <div class="fw-field-head"><label>Speicherkoeffizient k</label><span class="fw-unit">h</span></div>
              <input v-if="!store.params.autoK" type="number" v-model.number="store.params.k" step="0.1" min="0.01">
              <div v-else class="fw-derived">
                {{ store.effectiveK > 0 ? fmt(store.effectiveK, 3) : '—' }}
                <i>abgeleitet</i>
              </div>
            </div>
            <div class="fw-field">
              <div class="fw-field-head"><label>Basisabfluss</label><span class="fw-unit">l/(s·km²)</span></div>
              <input type="number" v-model.number="store.params.qBase" step="1" min="0">
            </div>
            <div class="fw-field">
              <div class="fw-field-head"><label>Drosselabfluss Q<sub>Dr</sub></label><span class="fw-unit">l/s</span></div>
              <input type="number" v-model.number="store.params.qDr" step="0.1" min="0">
            </div>
          </div>

          <div class="fw-readout compact" :class="{ bad: store.baseFlowLs > 0 && store.params.qDr <= store.baseFlowLs }">
            <span class="fw-readout-key">Basisabfluss absolut</span>
            <span class="fw-readout-val">{{ fmt(store.baseFlowLs, 1) }} <i>l/s</i></span>
          </div>
          <p class="fw-formula">
            Q<sub>Dr</sub> muss größer als der Basisabfluss sein — sonst kann das Becken
            nie leerlaufen und V<sub>erf</sub> ist keine belastbare Größe.
          </p>
        </section>

        <!-- Prüfungen ------------------------------------------------------ -->
        <div v-if="store.inputIssues.length" class="fw-issues">
          <div v-for="(iss, i) in store.inputIssues" :key="i" class="fw-issue" :class="iss.level">
            <FwIcon :name="iss.level === 'error' ? 'alert' : 'info'" :size="15" />
            <p>{{ iss.text }}</p>
          </div>
        </div>

        <button class="fw-btn fw-btn-primary fw-btn-block fw-run" @click="calculate" :disabled="hasBlockingIssue">
          <FwIcon name="hydrograph" :size="18" />
          <span>Welle berechnen</span>
        </button>

        <div v-if="store.results.error" class="fw-issues">
          <div class="fw-issue error">
            <FwIcon name="alert" :size="15" />
            <p>{{ store.results.error }}</p>
          </div>
        </div>

        <!-- Dauerstufenvergleich ------------------------------------------- -->
        <section v-if="store.durationSweep" class="fw-block">
          <div class="fw-block-head">
            <span class="fw-num">—</span>
            <h2>Dauerstufenvergleich</h2>
          </div>

          <div class="fw-grid2 fw-gov">
            <div class="fw-gov-card">
              <span>Maßgebend für V<sub>erf</sub></span>
              <strong v-if="store.durationSweep.governingByVolume">
                {{ store.durationSweep.governingByVolume.D_min }} min
                <i>{{ fmt(store.durationSweep.governingByVolume.vReq, 0) }} m³</i>
              </strong>
              <strong v-else>—</strong>
            </div>
            <div class="fw-gov-card">
              <span>Maßgebend für Q<sub>max</sub></span>
              <strong v-if="store.durationSweep.governingByPeak">
                {{ store.durationSweep.governingByPeak.D_min }} min
                <i>{{ fmt(store.durationSweep.governingByPeak.qMax, 3) }} m³/s</i>
              </strong>
              <strong v-else>—</strong>
            </div>
          </div>

          <div class="fw-table-scroll">
            <table class="fw-table fw-table-data">
              <thead>
                <tr>
                  <th>D<i>min</i></th>
                  <th>P<i>mm</i></th>
                  <th>Q<sub>max</sub><i>m³/s</i></th>
                  <th>V<sub>erf</sub><i>m³</i></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in store.durationSweep.rows" :key="row.D_min"
                    :class="{ gov: isGoverning(row), active: row.D_min === store.params.D }">
                  <td>{{ row.D_min }}</td>
                  <td>{{ row.P_mm != null ? fmt(row.P_mm, 1) : '—' }}</td>
                  <td>{{ row.error ? '—' : fmt(row.qMax, 3) }}</td>
                  <td>{{ row.error ? '—' : fmt(row.vReq, 0) }}</td>
                  <td class="fw-td-act">
                    <button v-if="!row.error" class="fw-mini" @click="store.applyDuration(row.D_min)">setzen</button>
                    <span v-else class="fw-err-cell" :title="row.error">Fehler</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Ergebnis -------------------------------------------------------- -->
        <section v-if="detail" class="fw-block fw-result">
          <div class="fw-block-head">
            <span class="fw-num">—</span>
            <h2>Ergebnis</h2>
          </div>

          <div class="fw-kpis">
            <div class="fw-kpi">
              <span class="fw-kpi-key">Q<sub>max</sub></span>
              <span class="fw-kpi-val">{{ fmt(detail.qMax, 3) }}<i>m³/s</i></span>
              <span class="fw-kpi-sub">Scheitel bei t = {{ fmt(detail.tPeak, 2) }} h</span>
            </div>
            <div class="fw-kpi">
              <span class="fw-kpi-key">V<sub>erf</sub></span>
              <span class="fw-kpi-val">{{ fmt(detail.vReq, 0) }}<i>m³</i></span>
              <span class="fw-kpi-sub" v-if="detail.retention.tStart !== null">
                Füllphase {{ fmt(detail.retention.tStart, 2) }} – {{ fmt(detail.retention.tEnd, 2) }} h
              </span>
            </div>
          </div>

          <dl class="fw-kv">
            <div><dt>Wirksamer Niederschlag P<sub>e</sub></dt><dd>{{ fmt(detail.peTotal, 2) }} mm</dd></div>
            <div><dt>Angesetzte Regenhöhe</dt><dd>{{ fmt(detail.P_used, 1) }} mm</dd></div>
            <div><dt>Abflussbeiwert ψ</dt><dd>{{ fmt(detail.psi * 100, 1) }} %</dd></div>
            <div><dt>Direktabflussvolumen</dt><dd>{{ fmt(detail.directVolume, 0) }} m³</dd></div>
            <div><dt>Basisabfluss</dt><dd>{{ fmt(detail.qBase * 1000, 1) }} l/s</dd></div>
            <div><dt>k / n</dt><dd>{{ fmt(detail.k, 3) }} h / {{ detail.n }}</dd></div>
            <div><dt>Zeitschritt &Delta;t</dt><dd>{{ fmt(detail.dt * 60, 2) }} min</dd></div>
            <div><dt>Rechenfenster</dt><dd>{{ fmt(detail.window_h, 1) }} h</dd></div>
            <div><dt>Massenbilanz</dt><dd>{{ fmt(detail.massBalance * 100, 1) }} %</dd></div>
          </dl>

          <div v-if="detail.warnings.length" class="fw-issues tight">
            <div v-for="(w, i) in detail.warnings" :key="i" class="fw-issue" :class="w.level">
              <FwIcon :name="w.level === 'error' ? 'alert' : 'info'" :size="15" />
              <p>{{ w.text }}</p>
            </div>
          </div>

          <details class="fw-details" v-if="detail.perArea.length > 1">
            <summary>Abflussbildung je Teilfläche</summary>
            <div class="fw-table-scroll">
              <table class="fw-table fw-table-data">
                <thead>
                  <tr>
                    <th>Fläche</th><th>ha</th><th>CN<i>II</i></th>
                    <th>CN<i>{{ detail.amc }}</i></th><th>S<i>mm</i></th>
                    <th>I<sub>a</sub><i>mm</i></th><th>P<sub>e</sub><i>mm</i></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(p, i) in detail.perArea" :key="i">
                    <td class="fw-td-name">{{ p.name || 'Fläche' }}</td>
                    <td>{{ fmt(p.area / 10000, 2) }}</td>
                    <td>{{ fmt(p.cn2, 0) }}</td>
                    <td>{{ fmt(p.cn, 1) }}</td>
                    <td>{{ p.S === null ? '0,0' : fmt(p.S, 1) }}</td>
                    <td>{{ p.Ia === null ? '0,0' : fmt(p.Ia, 1) }}</td>
                    <td>{{ fmt(p.Pe, 2) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>

          <figure class="fw-chart">
            <figcaption>Ganglinie</figcaption>
            <div class="fw-chart-body">
              <HydrographChart
                :hydrograph="store.chartSeries"
                :rain-depths="detail.rainDepths"
                :dt="detail.dt"
                :q-allowed="detail.qAllowed"
              />
            </div>
          </figure>

          <button class="fw-btn fw-btn-ghost fw-btn-block" @click="exportReport">
            <FwIcon name="document" />
            <span>Nachweisbericht als PDF</span>
          </button>
        </section>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import BaseMap from '@/components/base/BaseMap.vue'
import HydrographChart from '../components/HydrographChart.vue'
import FwIcon from '../components/FwIcon.vue'
import { useFloodWaveStore } from '../stores/useFloodWaveStore'
import { FloodWaveReportService } from '../services/FloodWaveReportService'
import area from '@turf/area'
import length from '@turf/length'

const store = useFloodWaveStore()
const mapRef = ref(null)

const detail = computed(() => store.results.detail)
const hasBlockingIssue = computed(() => store.inputIssues.some(i => i.level === 'error'))

// Kurzerklärung zum Verfahren, aufklappbar neben dem Titel
const showInfo = ref(false)
function onKeydown(e) {
  if (e.key === 'Escape' && showInfo.value) showInfo.value = false
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

/** Zahlformat mit deutschem Dezimalkomma und fester Nachkommastellenzahl. */
function fmt(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return Number(value).toLocaleString('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })
}

function isGoverning(row) {
  const s = store.durationSweep
  return !!s && (row === s.governingByVolume || row === s.governingByPeak)
}

// Map Handlers
function handleMapUpdate(geoJSON) {
  if (geoJSON.geometry.type === 'LineString') {
    const len = length(geoJSON, { units: 'kilometers' }) * 1000 // m
    const coords = geoJSON.geometry.coordinates                 // [lng, lat]
    if (coords.length < 2) return

    const path = coords.map(c => [c[1], c[0]])                  // [lat, lng]
    const riverCoords = { start: path[0], end: path[path.length - 1] }
    store.updateRiver(len, riverCoords, geoJSON.id, path)

  } else if (geoJSON.geometry.type === 'Polygon') {
    const a = area(geoJSON)
    const name = geoJSON.properties?.name || `Fläche ${store.areas.length + 1}`
    const cn = geoJSON.properties?.cn ?? 60
    store.addOrUpdateArea(geoJSON.id, name, a, cn)
  }
}

/** Kann eine Fläche ODER den Fluss betreffen – der Store unterscheidet über die ID. */
function handleMapDelete(id) {
  store.removeFeature(id)
}

function startDrawRiver() {
  mapRef.value?.startDraw('polyline')
}

async function fetchKostra() {
  // Gebietsschwerpunkt bevorzugen, Kartenmitte nur als Rückfallebene
  let point = store.referencePoint
  if (!point) {
    const map = mapRef.value?.getMap()
    if (!map) return
    const c = map.getCenter()
    point = { lat: c.lat, lng: c.lng }
    store.setNotice('Kein Gebiet definiert – KOSTRA wurde für die Kartenmitte geladen.', 'warn')
  }
  try {
    await store.fetchKostra(point.lat, point.lng)
  } catch (e) {
    store.setNotice(e.message, 'error')
  }
}

async function fetchElevation() {
  try {
    const res = await store.fetchElevation()
    if (res && !store.notice) {
      store.setNotice(
        `Höhen aus ${res.points} Stützpunkten: ${fmt(res.h1, 1)} m auf ${fmt(res.h2, 1)} m, Δh = ${fmt(res.diff, 2)} m`,
        'info'
      )
    }
  } catch (e) {
    store.setNotice(e.message, 'error')
  }
}

function estimateArea() {
  try {
    const buffered = store.estimateCatchmentArea()
    if (buffered) mapRef.value?.addGeoJSON(buffered)
  } catch (e) {
    store.setNotice(e.message || 'Fehler bei der Schätzung', 'error')
  }
}

function calculate() {
  const r = store.calculate()
  if (r.error) store.setNotice(r.error, 'error')
}

function sweepDurations() {
  try {
    store.sweepDurations()
  } catch (e) {
    store.setNotice(e.message, 'error')
  }
}

function exportReport() {
  try {
    // Ganglinie als PNG mitgeben – im Bericht fehlte die Grafik bisher ganz
    let chartDataUrl = null
    const canvas = document.querySelector('.fw-chart-body canvas')
    if (canvas) {
      try { chartDataUrl = canvas.toDataURL('image/png') } catch { /* ignorieren */ }
    }
    FloodWaveReportService.generateFloodWaveReport(store, { chartDataUrl })
  } catch (e) {
    store.setNotice(e.message, 'error')
  }
}
</script>

<style scoped>
/* ==========================================================================
   Hochwasserwelle — technisches Datenblatt.
   Gestalterische Leitlinie: Ingenieurzeichnung statt App-Kacheln. Haarlinien
   statt Schlagschatten, Tabellenziffern, gedeckte Tinte mit einer einzigen
   Wasser-Akzentfarbe. Keine Emoji, keine Verläufe, keine Bewegung ohne Anlass.
   ========================================================================== */

.fw {
  --ink:        #0f1b2a;
  --ink-2:      #33465c;
  --ink-3:      #64788f;
  --ink-4:      #94a6b8;

  --paper:      #ffffff;
  --paper-2:    #f7f9fb;
  --paper-3:    #eef2f6;

  --rule:       #dde5ec;
  --rule-2:     #c3d0dc;

  --hydro:      #0d6e7d;
  --hydro-deep: #0a5461;
  --hydro-tint: #eef7f8;
  --hydro-line: #b9dde2;

  --warn:       #8a5a10;
  --warn-tint:  #fdf7ec;
  --warn-line:  #ecd9b0;
  --bad:        #9d2c2c;
  --bad-tint:   #fdf1f1;
  --bad-line:   #eec4c4;
  --ok:         #1d6b4a;

  --mono: ui-monospace, 'SFMono-Regular', 'JetBrains Mono', 'Roboto Mono', Menlo, Consolas, monospace;

  display: grid;
  grid-template-columns: minmax(0, 1fr) 460px;
  height: calc(100vh - 64px);
  overflow: hidden;
  background: var(--paper-2);
  color: var(--ink-2);
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}

/* ------------------------------------------------------------------ Karte */
.fw-map {
  position: relative;
  height: 100%;
  border-right: 1px solid var(--rule-2);
}

/* oben links neben dem Leaflet-Zoom (30 px breit ab 10 px) – oben rechts
   sitzt die Suchleiste der BaseMap, unten die Toast-Leiste */
.fw-map-readout {
  position: absolute;
  left: 56px;
  top: 14px;
  z-index: 1000;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 7px 12px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid var(--rule-2);
  border-radius: 3px;
  backdrop-filter: blur(6px);
}
.fw-map-readout-key  { font-size: 11px; letter-spacing: .06em; color: var(--ink-3); text-transform: uppercase; }
.fw-map-readout-val  { font-family: var(--mono); font-size: 15px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
.fw-map-readout-unit { font-size: 11px; color: var(--ink-3); }

.fw-notice {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 22px;
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 13px;
  border-radius: 3px;
  border: 1px solid;
  border-left-width: 3px;
  background: var(--paper);
  box-shadow: 0 6px 20px rgba(15, 27, 42, 0.10);
  font-size: 12.5px;
  line-height: 1.5;
}
.fw-notice p { margin: 0; flex: 1; }
.fw-notice.info  { border-color: var(--hydro-line); border-left-color: var(--hydro); color: var(--hydro-deep); background: var(--hydro-tint); }
.fw-notice.warn  { border-color: var(--warn-line);  border-left-color: #c08b2e; color: var(--warn);  background: var(--warn-tint); }
.fw-notice.error { border-color: var(--bad-line);   border-left-color: var(--bad); color: var(--bad); background: var(--bad-tint); }
.fw-notice-close {
  border: 0; background: none; cursor: pointer; padding: 0; color: inherit; opacity: .5;
  display: flex; align-items: center;
}
.fw-notice-close:hover { opacity: 1; }

/* ------------------------------------------------------------------ Panel */
.fw-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--paper);
}

.fw-head {
  padding: 26px 28px 20px;
  border-bottom: 1px solid var(--rule-2);
  /* feines Millimeterpapier als Anklang an die Ingenieurzeichnung */
  background-color: var(--paper);
  background-image:
    linear-gradient(var(--paper-3) 1px, transparent 1px),
    linear-gradient(90deg, var(--paper-3) 1px, transparent 1px);
  background-size: 22px 22px, 22px 22px;
  background-position: -1px -1px;
  position: relative;
  z-index: 20;   /* trägt das Info-Popover über den Inhalt */
}
.fw-head::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: -1px;
  height: 2px;
  background: linear-gradient(90deg, var(--hydro) 0%, var(--hydro) 38%, transparent 38%);
}
.fw-overline {
  margin: 0 0 8px;
  font-size: 10.5px;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--hydro);
  font-weight: 600;
}
.fw-head h1 {
  margin: 0;
  font-size: 25px;
  line-height: 1.15;
  font-weight: 650;
  letter-spacing: -0.015em;
  color: var(--ink);
}
.fw-head h1 .fw-sub { font-size: 0.62em; vertical-align: 0.1em; color: var(--ink-3); font-weight: 500; }
.fw-method {
  margin: 10px 0 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--ink-3);
}
.fw-method i { color: var(--rule-2); font-style: normal; }

/* ------------------------------------------------------ Info zum Verfahren */
.fw-title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
}

.fw-info-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 4px 9px;
  border: 1px solid var(--rule-2);
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.75);
  color: var(--ink-3);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: border-color .12s, color .12s, background .12s;
}
.fw-info-btn:hover { border-color: var(--hydro); color: var(--hydro); background: var(--hydro-tint); }
.fw-info-btn.active {
  border-color: var(--hydro);
  background: var(--hydro);
  color: #fff;
}

.fw-info-backdrop {
  position: absolute;
  inset: 0;
  z-index: 15;
  background: rgba(15, 27, 42, 0.06);
}

.fw-info {
  position: absolute;
  top: calc(100% - 1px);
  left: 0;
  right: 0;
  z-index: 21;
  max-height: min(72vh, 640px);
  overflow-y: auto;
  padding: 20px 28px 0;
  background: var(--paper);
  border-bottom: 1px solid var(--rule-2);
  box-shadow: 0 16px 34px -12px rgba(15, 27, 42, 0.22);
}
.fw-info::-webkit-scrollbar { width: 10px; }
.fw-info::-webkit-scrollbar-thumb { background: var(--rule-2); border: 3px solid var(--paper); border-radius: 5px; }

.fw-info section { margin-bottom: 18px; }
.fw-info section:last-of-type { margin-bottom: 14px; }

.fw-info h3 {
  margin: 0 0 8px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--hydro);
}
.fw-info p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.62;
  color: var(--ink-2);
}
.fw-info ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.fw-info li {
  position: relative;
  padding-left: 15px;
  margin-bottom: 7px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--ink-2);
}
.fw-info li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  width: 6px;
  height: 1px;
  background: var(--rule-2);
}
.fw-info li:last-child { margin-bottom: 0; }
.fw-info li strong { color: var(--ink); font-weight: 600; }
.fw-info em { font-style: normal; border-bottom: 1px solid var(--hydro-line); }

.fw-info-step {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}
.fw-info-step:last-child { margin-bottom: 0; }
.fw-info-num {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--hydro);
  padding-top: 2px;
  min-width: 20px;
}
.fw-info-step strong {
  display: block;
  margin-bottom: 3px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
}

.fw-info-limits {
  padding: 13px 15px;
  background: var(--warn-tint);
  border: 1px solid var(--warn-line);
  border-left: 3px solid #c08b2e;
  border-radius: 3px;
}
.fw-info-limits h3 { color: var(--warn); }
.fw-info-limits li, .fw-info-limits li strong { color: var(--warn); }
.fw-info-limits li::before { background: var(--warn-line); }

.fw-info-foot {
  margin: 0;
  padding-top: 13px;
  border-top: 1px solid var(--rule);
  font-size: 11.5px !important;
  line-height: 1.6;
  color: var(--ink-3) !important;
}

.fw-info-fade {
  position: sticky;
  bottom: 0;
  height: 26px;
  margin-top: 4px;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0), var(--paper) 78%);
  pointer-events: none;
}

.fw-pop-enter-active, .fw-pop-leave-active { transition: opacity .16s ease, transform .16s ease; }
.fw-pop-enter-from, .fw-pop-leave-to { opacity: 0; transform: translateY(-6px); }
.fw-fade-enter-active, .fw-fade-leave-active { transition: opacity .16s ease; }
.fw-fade-enter-from, .fw-fade-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .fw-pop-enter-active, .fw-pop-leave-active,
  .fw-fade-enter-active, .fw-fade-leave-active { transition: none; }
}

.fw-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 28px 72px;
}
.fw-scroll::-webkit-scrollbar { width: 10px; }
.fw-scroll::-webkit-scrollbar-track { background: transparent; }
.fw-scroll::-webkit-scrollbar-thumb { background: var(--rule-2); border: 3px solid var(--paper); border-radius: 5px; }
.fw-scroll::-webkit-scrollbar-thumb:hover { background: var(--ink-4); }

/* --------------------------------------------------------------- Abschnitt */
.fw-block {
  padding: 22px 0;
  border-bottom: 1px solid var(--rule);
}
.fw-block:last-child { border-bottom: 0; }

.fw-block-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 18px;
}
.fw-num {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--hydro);
  letter-spacing: .04em;
  min-width: 20px;
}
.fw-block-head h2 {
  margin: 0;
  font-size: 13.5px;
  font-weight: 650;
  letter-spacing: .01em;
  color: var(--ink);
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.fw-block-tag {
  font-family: var(--mono);
  font-size: 10.5px;
  font-weight: 500;
  color: var(--ink-3);
  border: 1px solid var(--rule-2);
  border-radius: 2px;
  padding: 1px 6px;
}

/* ------------------------------------------------------------------ Felder */
.fw-field { margin-bottom: 14px; }
.fw-field:last-child { margin-bottom: 0; }

.fw-field-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 5px;
}
.fw-field-head label {
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-2);
}
.fw-unit {
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--ink-4);
}

.fw input[type="number"],
.fw select {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--rule-2);
  border-radius: 3px;
  background: var(--paper);
  color: var(--ink);
  font-size: 13px;
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
  transition: border-color .12s, box-shadow .12s;
}
.fw select {
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, var(--ink-3) 50%),
                    linear-gradient(135deg, var(--ink-3) 50%, transparent 50%);
  background-position: calc(100% - 15px) 15px, calc(100% - 10px) 15px;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
  padding-right: 28px;
}
.fw input[type="number"]:focus,
.fw select:focus {
  outline: none;
  border-color: var(--hydro);
  box-shadow: 0 0 0 3px var(--hydro-tint);
}
.fw input::placeholder { color: var(--ink-4); font-family: inherit; font-size: 12px; }

.fw-field-row { display: flex; gap: 8px; }
.fw-field-row input { flex: 1; min-width: 0; }

.fw-derived {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  border: 1px dashed var(--rule-2);
  border-radius: 3px;
  background: var(--paper-2);
  font-family: var(--mono);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}
.fw-derived i { font-style: normal; font-family: inherit; font-size: 10px; color: var(--ink-4); }

.fw-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

.fw-check {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 16px;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--ink-2);
}
.fw-check input { width: 15px; height: 15px; accent-color: var(--hydro); cursor: pointer; }
.fw-check i { font-style: normal; font-family: var(--mono); font-size: 11.5px; color: var(--ink-3); }

/* ---------------------------------------------------------------- Ausgaben */
.fw-readout {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  padding: 12px 14px;
  background: var(--hydro-tint);
  border: 1px solid var(--hydro-line);
  border-left: 3px solid var(--hydro);
  border-radius: 3px;
}
.fw-readout.compact { padding: 9px 12px; margin-top: 14px; }
.fw-readout-key { font-size: 12px; color: var(--hydro-deep); }
.fw-readout-val {
  font-family: var(--mono);
  font-size: 17px;
  font-weight: 600;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.fw-readout.compact .fw-readout-val { font-size: 14px; }
.fw-readout-val i { font-style: normal; font-size: 0.68em; color: var(--ink-3); margin-left: 3px; }
.fw-readout.bad {
  background: var(--bad-tint);
  border-color: var(--bad-line);
  border-left-color: var(--bad);
}
.fw-readout.bad .fw-readout-key { color: var(--bad); }
.fw-readout.bad .fw-readout-val { color: var(--bad); }

.fw-formula {
  margin: 12px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--ink-3);
  padding-left: 11px;
  border-left: 1px solid var(--rule);
}
.fw-formula span { display: block; margin-top: 4px; color: var(--ink-4); }

.fw-note { margin: 6px 0 0; font-size: 11.5px; }
.fw-note-ok { color: var(--ok); }

.fw-inline-note {
  margin: 12px 0 0;
  padding: 9px 11px;
  border-radius: 3px;
  border: 1px solid;
  border-left-width: 3px;
  font-size: 11.5px;
  line-height: 1.55;
}
.fw-inline-note.warn { background: var(--warn-tint); border-color: var(--warn-line); border-left-color: #c08b2e; color: var(--warn); }

/* ----------------------------------------------------------------- Flächen */
.fw-empty {
  padding: 22px 18px;
  border: 1px dashed var(--rule-2);
  border-radius: 3px;
  background: var(--paper-2);
  text-align: center;
}
.fw-empty p { margin: 0 0 14px; font-size: 12.5px; color: var(--ink-3); }

.fw-areas { display: flex; flex-direction: column; }
.fw-area {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid var(--rule);
}
.fw-area:first-child { border-top: 1px solid var(--rule); }
.fw-area-id { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.fw-area-name {
  font-size: 12.5px; font-weight: 550; color: var(--ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.fw-area-size { font-family: var(--mono); font-size: 11px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.fw-area-cn { display: flex; align-items: center; gap: 7px; }
.fw-area-cn label { font-family: var(--mono); font-size: 10.5px; color: var(--ink-4); letter-spacing: .05em; }
.fw-area-cn input { width: 62px !important; height: 30px !important; text-align: center; }

.fw-areas-sum {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 0 0;
  font-size: 12px;
}
.fw-areas-sum > span:first-child { color: var(--ink-3); }
.fw-areas-sum > span:last-child {
  font-family: var(--mono); color: var(--ink); font-weight: 550;
  font-variant-numeric: tabular-nums; text-align: right;
}
.fw-areas-sum i { font-style: normal; color: var(--rule-2); margin: 0 3px; }

/* ----------------------------------------------------------------- Details */
.fw-details { margin-top: 16px; }
.fw-details summary {
  cursor: pointer;
  font-size: 11.5px;
  font-weight: 550;
  color: var(--ink-3);
  padding: 7px 0;
  border-top: 1px solid var(--rule);
  list-style: none;
  display: flex;
  align-items: center;
  gap: 7px;
}
.fw-details summary::-webkit-details-marker { display: none; }
.fw-details summary::before {
  content: '+';
  font-family: var(--mono);
  color: var(--hydro);
  font-size: 13px;
  line-height: 1;
}
.fw-details[open] summary::before { content: '−'; }
.fw-details summary:hover { color: var(--ink); }

/* ---------------------------------------------------------------- Tabellen */
.fw-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.fw-table td, .fw-table th { padding: 6px 8px; }
.fw-table td { border-bottom: 1px solid var(--rule); color: var(--ink-2); }
.fw-table td:last-child {
  text-align: right; font-family: var(--mono);
  font-variant-numeric: tabular-nums; color: var(--ink);
}

.fw-table-scroll { max-height: 330px; overflow: auto; margin-top: 4px; }
.fw-table-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.fw-table-scroll::-webkit-scrollbar-thumb { background: var(--rule-2); border-radius: 4px; }

.fw-table-data th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--paper);
  text-align: right;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: .04em;
  color: var(--ink-3);
  border-bottom: 1px solid var(--rule-2);
  white-space: nowrap;
}
.fw-table-data th:first-child { text-align: left; }
.fw-table-data th i {
  display: block; font-style: normal; font-family: var(--mono);
  font-size: 9.5px; font-weight: 400; color: var(--ink-4); letter-spacing: 0;
}
.fw-table-data td {
  text-align: right;
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  white-space: nowrap;
}
.fw-table-data td.fw-td-name, .fw-table-data td:first-child {
  text-align: left;
}
.fw-table-data td.fw-td-name { font-family: inherit; }
.fw-table-data td.fw-td-act { text-align: right; font-family: inherit; }
.fw-table-data tr.gov td { background: var(--hydro-tint); font-weight: 600; }
.fw-table-data tr.gov td:first-child { box-shadow: inset 2px 0 0 var(--hydro); }
.fw-table-data tr.active td:first-child { box-shadow: inset 2px 0 0 var(--ink); }
.fw-err-cell { color: var(--bad); font-size: 11px; cursor: help; }

.fw-mini {
  padding: 2px 8px;
  font-size: 10.5px;
  border: 1px solid var(--rule-2);
  background: var(--paper);
  border-radius: 2px;
  cursor: pointer;
  color: var(--ink-3);
  transition: all .12s;
}
.fw-mini:hover { border-color: var(--hydro); color: var(--hydro); }

/* ------------------------------------------------- maßgebende Dauerstufen */
.fw-gov { margin-bottom: 16px; }
.fw-gov-card {
  padding: 11px 13px;
  border: 1px solid var(--hydro-line);
  border-radius: 3px;
  background: var(--hydro-tint);
}
.fw-gov-card > span {
  display: block;
  font-size: 10.5px;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: var(--hydro-deep);
  margin-bottom: 5px;
}
.fw-gov-card strong {
  display: block;
  font-family: var(--mono);
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.fw-gov-card strong i {
  display: block; font-style: normal; font-size: 11px;
  font-weight: 400; color: var(--ink-3); margin-top: 2px;
}

/* ---------------------------------------------------------------- Hinweise */
.fw-issues { display: flex; flex-direction: column; gap: 8px; margin: 20px 0; }
.fw-issues.tight { margin: 18px 0 0; }
.fw-issue {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 12px;
  border: 1px solid;
  border-left-width: 3px;
  border-radius: 3px;
  font-size: 11.5px;
  line-height: 1.55;
}
.fw-issue p { margin: 0; }
.fw-issue.warn  { background: var(--warn-tint); border-color: var(--warn-line); border-left-color: #c08b2e; color: var(--warn); }
.fw-issue.error { background: var(--bad-tint);  border-color: var(--bad-line);  border-left-color: var(--bad); color: var(--bad); }

/* ---------------------------------------------------------------- Buttons */
.fw-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 34px;
  padding: 0 14px;
  border-radius: 3px;
  border: 1px solid var(--rule-2);
  background: var(--paper);
  color: var(--ink-2);
  font-size: 12.5px;
  font-weight: 550;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color .12s, background .12s, color .12s;
}
.fw-btn:hover:not(:disabled) { border-color: var(--hydro); color: var(--hydro); background: var(--hydro-tint); }
.fw-btn:disabled { opacity: .45; cursor: not-allowed; }
.fw-btn-square { width: 34px; padding: 0; }
.fw-btn-block { width: 100%; margin-top: 14px; }
.fw-empty .fw-btn-block { margin-top: 0; }

.fw-btn-primary {
  background: var(--ink);
  border-color: var(--ink);
  color: #fff;
  height: 42px;
  font-size: 13.5px;
  letter-spacing: .01em;
}
.fw-btn-primary:hover:not(:disabled) {
  background: var(--hydro-deep);
  border-color: var(--hydro-deep);
  color: #fff;
}
.fw-btn-primary:disabled { background: var(--paper-3); border-color: var(--rule-2); color: var(--ink-4); opacity: 1; }
.fw-run { margin: 22px 0 4px; }

/* ---------------------------------------------------------------- Ergebnis */
.fw-result { padding-top: 24px; }

.fw-kpis {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1px solid var(--rule-2);
  border-radius: 3px;
  overflow: hidden;
}
.fw-kpi { padding: 16px 16px 14px; background: var(--paper); }
.fw-kpi + .fw-kpi { border-left: 1px solid var(--rule); }
.fw-kpi-key {
  display: block;
  font-size: 11px;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--ink-3);
  margin-bottom: 7px;
}
.fw-kpi-val {
  display: block;
  font-family: var(--mono);
  font-size: 25px;
  font-weight: 600;
  line-height: 1.05;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.fw-kpi-val i {
  font-style: normal;
  font-size: 0.44em;
  font-weight: 500;
  color: var(--ink-3);
  margin-left: 5px;
  letter-spacing: 0;
}
.fw-kpi-sub { display: block; margin-top: 7px; font-size: 11px; color: var(--ink-4); }

.fw-kv { margin: 18px 0 0; display: flex; flex-direction: column; }
.fw-kv > div {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dotted var(--rule-2);
  font-size: 12px;
}
.fw-kv dt { color: var(--ink-3); }
.fw-kv dd {
  margin: 0 0 0 auto;
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  font-weight: 550;
}

.fw-chart {
  margin: 20px 0 0;
  border: 1px solid var(--rule-2);
  border-radius: 3px;
  overflow: hidden;
}
.fw-chart figcaption {
  padding: 9px 13px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: .09em;
  text-transform: uppercase;
  color: var(--ink-3);
  background: var(--paper-2);
  border-bottom: 1px solid var(--rule);
}
.fw-chart-body { height: 340px; padding: 14px 12px 10px; background: var(--paper); }

/* ------------------------------------------------------------------ Schmal */
@media (max-width: 1100px) {
  .fw { grid-template-columns: minmax(0, 1fr) 400px; }
  .fw-scroll { padding: 0 20px 60px; }
  .fw-head { padding: 22px 20px 18px; }
}

@media (max-width: 860px) {
  .fw {
    display: flex;
    flex-direction: column;
    height: auto;
    overflow: visible;
  }
  .fw-map { height: 380px; border-right: 0; border-bottom: 1px solid var(--rule-2); }
  .fw-panel { height: auto; overflow: visible; }
  .fw-scroll { overflow: visible; padding-bottom: 40px; }
  .fw-grid2, .fw-kpis { grid-template-columns: 1fr; }
  .fw-kpi + .fw-kpi { border-left: 0; border-top: 1px solid var(--rule); }
}
</style>
