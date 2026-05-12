<template>
  <DraggableModal
    :isOpen="isOpen"
    @close="close"
    initialWidth="1000"
    initialHeight="800"
  >
    <div class="simulation-results-content">
      
      <!-- New Header with Close Button -->
      <div class="modal-header">
          <h2>Simulationsergebnisse (Hydraulik)</h2>
          <div class="header-actions">
            <SimulationReportExport
              :nodes="nodes"
              :edges="edges"
              :areas="areas"
              :edge-results="edgeResults"
              :node-results="nodeResults"
              :area-results="areaResults"
              :system-stats="systemStats"
              :rain="rain"
              :total-catchment-area-ha="totalCatchmentAreaHa"
            />
            <button class="close-btn" @click="close" title="Schließen">✕</button>
          </div>
      </div>

      <!-- Top Navigation Tabs (Modern Pill Design) -->
      <div class="tabs-nav">
        <button 
          v-for="tab in tabs" 
          :key="tab.id"
          class="tab-btn"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          {{ tab.id === 'areas' ? 'Teilflächen' : tab.label }}
        </button>
      </div>

      <!-- Main Content Area -->
      <div class="tab-content">
        
        <div v-if="activeTab === 'general'" class="tab-pane">
            
            <!-- System Health Header -->
            <div class="health-header" :class="getHealthClass(healthScore)">
                <div class="score-circle">
                    <span class="score-val">{{ healthScore }}</span>
                    <span class="score-label">Health</span>
                </div>
                <div class="health-text">
                    <h3>{{ getHealthTitle(healthScore) }}</h3>
                    <p>{{ getHealthDescription(healthScore) }}</p>
                </div>
                <div class="health-metrics">
                    <div class="metric">
                         <span>Kontinuität</span>
                         <strong>{{ (systemStats?.flow?.error || 0).toFixed(2) }} %</strong>
                    </div>
                     <div class="metric">
                         <span>Instabilität</span>
                         <strong>{{ (systemStats?.routingTimeStep?.notConverging || 0).toFixed(2) }} %</strong>
                    </div>
                </div>
            </div>

            <!-- System Stats Grid -->
            <div class="kpi-grid">
                <div class="kpi-card">
                    <div class="label">Niederschlag (Gesamthöhe)</div>
                    <div class="value">{{ runoffBilanz.precipMm.toFixed(1) }} mm</div>
                    <div class="kpi-sub">≙ {{ formatVolume((systemStats?.runoff?.precip || 0) * 10000) }} m³ · {{ totalCatchmentAreaHa.toFixed(2) }} ha</div>
                </div>
                <div class="kpi-card">
                    <div class="label">Oberflächenabfluss</div>
                    <div class="value">{{ runoffBilanz.runoffMm.toFixed(1) }} mm</div>
                    <div class="kpi-sub">Ψ = {{ runoffBilanz.psi.toFixed(3) }}</div>
                </div>
                 <div class="kpi-card">
                    <div class="label">Zufluss Netz (Regen+Trocken)</div>
                    <div class="value">{{ formatVolume(((systemStats?.flow?.dryWeatherInflow || 0) + (systemStats?.flow?.wetWeatherInflow || 0)) * 10000) }} m³</div>
                    <div class="kpi-sub">Auslauf: {{ formatVolume((systemStats?.flow?.externalOutflow || 0) * 10000) }} m³</div>
                </div>
                <!-- Continuity Errors -->
                <div class="kpi-card" :class="getContinuityClass(systemStats?.flow?.error)">
                     <div class="label">Kontinuitätsfehler (Flow)</div>
                     <div class="value">{{ (systemStats?.flow?.error || 0).toFixed(2) }} %</div>
                </div>
            </div>

            <div class="grid-layout">
                
                <!-- 1. Simulations-Parameter (Analysis Options) -->
                <div class="panel">
                    <h3>⚙️ Simulations-Parameter</h3>
                    <table class="simple-table">
                        <tr><td>Einheiten:</td><td>{{ systemStats.analysisOptions?.flowUnits }}</td></tr>
                        <tr><td>Infiltration:</td><td>{{ systemStats.analysisOptions?.infiltrationMethod }}</td></tr>
                        <tr><td>Berechnungsverfahren:</td><td>{{ systemStats.analysisOptions?.flowRoutingMethod }}</td></tr>
                        <tr><td>Startdatum:</td><td>{{ systemStats.analysisOptions?.startDate }}</td></tr>
                        <tr><td>Enddatum:</td><td>{{ systemStats.analysisOptions?.endDate }}</td></tr>
                        <tr><td>Zeitschritt:</td><td>{{ systemStats.analysisOptions?.routingTimeStep }}</td></tr>
                    </table>
                </div>

                <!-- 2. Niederschlagsbilanz (Runoff Continuity) -->
                <div class="panel">
                    <h3>🌧️ Niederschlagsbilanz (Runoff)</h3>

                    <!-- Flächenbasis — prominent, weil alle mm-Werte darauf beruhen -->
                    <div class="area-badge" :class="totalCatchmentAreaHa > 0 ? 'area-ok' : 'area-warn'">
                        <span class="area-badge-label">Bezugsfläche</span>
                        <span class="area-badge-val">
                            {{ totalCatchmentAreaHa > 0 ? totalCatchmentAreaHa.toFixed(4) + ' ha' : '— (keine Flächen vorhanden)' }}
                        </span>
                        <span class="area-badge-sub" v-if="totalCatchmentAreaHa > 0">
                            = {{ (totalCatchmentAreaHa * 10000).toLocaleString('de-DE') }} m²
                        </span>
                    </div>

                    <table class="simple-table bilanz-table">
                        <thead>
                            <tr class="bilanz-header">
                                <th>Posten</th>
                                <th title="Regenhöhe bezogen auf Gesamtfläche">mm</th>
                                <th title="Absolutes Volumen (1 ha·m = 10 000 m³)">m³</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Niederschlag</td>
                                <td class="val-right">{{ runoffBilanz.precipMm.toFixed(2) }}</td>
                                <td class="val-right">{{ formatVolume((systemStats?.runoff?.precip||0)*10000) }}</td>
                            </tr>
                            <tr>
                                <td>Verdunstung</td>
                                <td class="val-right">{{ runoffBilanz.evapMm.toFixed(2) }}</td>
                                <td class="val-right">{{ formatVolume((systemStats?.runoff?.evap||0)*10000) }}</td>
                            </tr>
                            <tr>
                                <td>Infiltration</td>
                                <td class="val-right">{{ runoffBilanz.infilMm.toFixed(2) }}</td>
                                <td class="val-right">{{ formatVolume((systemStats?.runoff?.infil||0)*10000) }}</td>
                            </tr>
                            <tr class="highlight-row">
                                <td><strong>Oberflächenabfluss</strong></td>
                                <td class="val-right"><strong>{{ runoffBilanz.runoffMm.toFixed(2) }}</strong></td>
                                <td class="val-right"><strong>{{ formatVolume((systemStats?.runoff?.runoff||0)*10000) }}</strong></td>
                            </tr>
                            <tr>
                                <td>Endspeicherung</td>
                                <td class="val-right">{{ runoffBilanz.finalStorageMm.toFixed(3) }}</td>
                                <td class="val-right">{{ formatVolume((systemStats?.runoff?.finalStorage||0)*10000) }}</td>
                            </tr>
                            <tr class="highlight-row">
                                <td><strong>Abflussbeiwert Ψ</strong></td>
                                <td class="val-right" colspan="2">
                                    <strong>{{ runoffBilanz.psi.toFixed(3) }}</strong>
                                    <span class="bilanz-note">({{ runoffBilanz.runoffMm.toFixed(1) }} mm / {{ runoffBilanz.precipMm.toFixed(1) }} mm)</span>
                                </td>
                            </tr>
                            <tr>
                                <td>Kontinuitätsfehler (Runoff)</td>
                                <td class="val-right" colspan="2">
                                    <span :class="{'text-red': Math.abs(systemStats?.runoff?.error||0) > 2}">
                                        {{ (systemStats?.runoff?.error||0).toFixed(3) }} %
                                    </span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <p class="bilanz-footnote">
                        mm = ha·m × 1000 ÷ {{ totalCatchmentAreaHa > 0 ? totalCatchmentAreaHa.toFixed(4) + ' ha' : '? ha (Flächen fehlen)' }} Gesamtfläche
                    </p>
                </div>
                
                <!-- Stability Report -->
                <div class="panel warning-panel" v-if="hasStabilityIssues">
                    <h3>⚠️ Stabilitätsbericht</h3>
                    <div class="detail-row">
                        <span>Min. Zeitschritt:</span> <strong>{{ systemStats.routingTimeStep?.min?.toFixed(4) }} s</strong>
                    </div>
                    <div class="detail-row">
                        <span>Nicht konvergierend:</span> <strong :class="{'text-red': (systemStats.routingTimeStep?.notConverging || 0) > 0}">{{ systemStats.routingTimeStep?.notConverging?.toFixed(2) }} %</strong>
                    </div>
                    
                    <div v-if="systemStats?.nonConvergingNodes?.length" class="mt-2">
                        <strong>Kritische Knoten ({{ systemStats.nonConvergingNodes.length }} gesamt):</strong>
                        <ul class="mini-list stability-scroll">
                            <li v-for="node in systemStats.nonConvergingNodes.slice(0, 10)" :key="node.id">
                                {{ node.id }} ({{ node.value }}%)
                            </li>
                        </ul>
                        <p v-if="systemStats.nonConvergingNodes.length > 10" class="stability-more">
                            + {{ systemStats.nonConvergingNodes.length - 10 }} weitere Knoten nicht gezeigt
                        </p>
                    </div>
                </div>

                <!-- Outfall Summary -->
                <div class="panel">
                    <h3>
                        Ausleitungen (Outfalls)
                        <span class="panel-count" v-if="systemStats.outfallLoading?.length">
                            {{ systemStats.outfallLoading.length }}
                        </span>
                    </h3>
                    <div class="outfall-scroll">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Häufigkeit (%)</th>
                                    <th>Mittel (L/s)</th>
                                    <th>Max (L/s)</th>
                                    <th>Vol (m³)</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="out in systemStats.outfallLoading || []" :key="out.id">
                                    <td>{{ out.id }}</td>
                                    <td>{{ out.freq?.toFixed(1) }}</td>
                                    <td>{{ (out.avgFlow * 1000).toFixed(1) }}</td>
                                    <td>{{ (out.maxFlow * 1000).toFixed(1) }}</td>
                                    <td>{{ (out.totalVol * 1000).toFixed(1) }}</td>
                                </tr>
                                <tr v-if="!systemStats.outfallLoading?.length">
                                    <td colspan="5" class="text-center text-muted">Keine Ausleitungen gefunden.</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Modellregen — ganz unten -->
            <div v-if="rainChartData" class="panel rain-panel">
                <div class="rain-panel-header">
                    <div class="rain-title">
                        <span class="rain-icon">🌧</span>
                        <div>
                            <strong>Simulierter Niederschlag</strong>
                            <span class="rain-method-badge">{{ rainChartData.meta.method === 'euler2' ? 'Euler Typ II' : 'Blockregen' }}</span>
                        </div>
                    </div>
                    <div class="rain-meta">
                        <div class="rain-kpi">
                            <span>Gesamthöhe</span>
                            <strong>{{ rainChartData.meta.totalMm.toFixed(1) }} mm</strong>
                        </div>
                        <div class="rain-kpi">
                            <span>Spitzenintensität</span>
                            <strong>{{ rainChartData.meta.peakIntensity.toFixed(1) }} l/s·ha</strong>
                        </div>
                        <div class="rain-kpi">
                            <span>Zeitschritt</span>
                            <strong>{{ rainChartData.meta.interval }} min</strong>
                        </div>
                        <div class="rain-kpi">
                            <span>Dauer</span>
                            <strong>{{ rainChartData.meta.steps * rainChartData.meta.interval }} min</strong>
                        </div>
                    </div>
                </div>
                <div class="rain-chart-box">
                    <Bar :data="rainChartData.chart" :options="rainChartData.options" />
                </div>
            </div>

        </div>

        <!-- === TAB: HALTUNGEN (Links) === -->
        <div v-if="activeTab === 'edges'" class="tab-pane">
            
             <!-- SPECIAL: Pumps Summary -->
             <div v-if="systemStats?.pumpingSummary?.length > 0" class="panel mb-4">
                 <h3>⛽ Pumpwerke</h3>
                  <table class="data-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Nutzung (%)</th>
                                <th>Starts</th>
                                <th>Max. Fluss (L/s)</th>
                                <th>Energie (kWh)</th>
                            </tr>
                        </thead>
                        <tbody>
                             <tr v-for="pump in systemStats.pumpingSummary" :key="pump.id">
                                <td>{{ pump.id }}</td>
                                <td>{{ pump.percentUtilized?.toFixed(1) }} %</td>
                                <td>{{ pump.startUps }}</td>
                                <td>{{ (pump.maxFlow * 1000).toFixed(1) }}</td>
                                <td>{{ pump.totalEnergy?.toFixed(2) }}</td>
                             </tr>
                        </tbody>
                  </table>
            </div>

            <div class="toolbar">
                <input v-model="searchQuery" placeholder="Suche Haltung..." class="search-input" />
                <div class="filters">
                    <label><input type="checkbox" v-model="filterSurcharged" /> Nur Überlastung</label>
                </div>
            </div>

            <div class="table-scroll">
                <table class="data-table sticky-header">
                    <thead>
                        <tr>
                            <th @click="sortBy='id'">ID</th>
                            <th>Typ</th>
                            <th @click="sortBy='maxFlow'" title="Max. Durchfluss (Betrag)">Max. Durchfluss (l/s)</th>
                            <th @click="sortBy='capacity'">Kapazität (l/s)</th>
                            <th @click="sortBy='ratio'" title="Max. Auslastungsgrad">Max. Q/Qvoll</th>
                            <th @click="sortBy='depth'" title="Max. Füllungsgrad">Max. h/hvoll</th>
                            <th @click="sortBy='maxVelocity'" title="Max. Fließgeschwindigkeit (Betrag)">Max. v (m/s)</th>
                            <th>t_max</th>
                            <th>Status</th>
                            <th>Aktion</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="edge in filteredEdges" :key="edge.id" :class="{'row-danger': (edge.depthRatio || 0) > 0.9, 'row-warning': (edge.depthRatio || 0) > 0.7 && (edge.depthRatio || 0) <= 0.9}">
                            <td>{{ edge.id }}</td>
                            <td>{{ edgeTypeLabel(edge.type) }}</td>
                            <td>{{ edge.maxFlow?.toLocaleString('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1}) }}</td>
                            <td>{{ edge.capacity?.toLocaleString('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1}) }}</td>
                            <td>
                                <span :class="getRatioClass(edge.flowCapacityRatio)">
                                    {{ edge.flowCapacityRatio?.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2}) }}
                                </span>
                            </td>
                            <td>{{ edge.utilization?.toFixed(0) }} %</td>
                            <td>{{ edge.maxVelocity?.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2}) }}</td>
                            <td>{{ edge.timeOfMaxFlow }}</td>
                            <td>
                                <span v-if="(edge.depthRatio || 0) > 0.9" class="badge badge-red">Überlastet</span>
                                <span v-else-if="(edge.depthRatio || 0) > 0.7" class="badge badge-orange">Belastet</span>
                                <span v-else class="badge badge-green">OK</span>
                            </td>
                            <td>
                                <button class="btn-icon" @click="selectEdge(edge.id)">Details</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <!-- Detail Panel Overlay for Edges -->
             <div v-if="selectedEdgeId" class="detail-overlay">
                <div class="detail-card">
                    <div class="detail-header">
                        <h3>Haltung {{ selectedEdgeId }}</h3>
                        <button @click="selectedEdgeId = null">✕</button>
                    </div>
                    <div class="detail-body">
                         <div class="engineer-inspector">
                            <div class="col">
                                <strong>Hydraulik</strong>
                                <div>Max. Durchfluss: {{ edgeResults.get(selectedEdgeId)?.maxFlow?.toLocaleString('de-DE', {minimumFractionDigits: 2}) }} l/s</div>
                                <div>Max. Fließgeschwindigkeit: {{ edgeResults.get(selectedEdgeId)?.maxVelocity?.toLocaleString('de-DE', {minimumFractionDigits: 2}) }} m/s</div>
                                <div>Zeitpunkt Max.: <strong>{{ edgeResults.get(selectedEdgeId)?.timeOfMaxFlow || '-' }}</strong></div>
                                <div>Strömungsart: {{ getFlowClass(selectedEdgeId) }}</div>
                            </div>
                            <div class="col">
                                <strong>Kapazität & Auslastung</strong>
                                <div>Kapazität: {{ edgeResults.get(selectedEdgeId)?.capacity?.toLocaleString('de-DE', {minimumFractionDigits: 2}) }} l/s</div>
                                <div>Max. Q/Qvoll: {{ edgeResults.get(selectedEdgeId)?.flowCapacityRatio?.toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</div>
                                <div>Max. h/hvoll: {{ (edgeResults.get(selectedEdgeId)?.depthRatio)?.toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</div>
                                <div v-if="(edgeResults.get(selectedEdgeId)?.flowCapacityRatio || 0) > 1.0" class="text-red">
                                    ⚠️ System unter Druck
                                </div>
                            </div>
                         </div>
                         <div class="surcharge-info" v-if="edgeResults.get(selectedEdgeId)?.surcharge">
                             <strong>Einstau-Diagnose</strong>
                             <ul>
                                 <li>Dauer Vollfüllung (beidseitig): {{ edgeResults.get(selectedEdgeId)?.surcharge?.hoursFullBoth?.toFixed(2) }} h</li>
                                 <li>Dauer Vollfüllung (oben): {{ edgeResults.get(selectedEdgeId)?.surcharge?.hoursFullUp?.toFixed(2) }} h</li>
                                 <li>Dauer Vollfüllung (unten): {{ edgeResults.get(selectedEdgeId)?.surcharge?.hoursFullDown?.toFixed(2) }} h</li>
                                 <li>Dauer über Vollfüllung: {{ edgeResults.get(selectedEdgeId)?.surcharge?.hoursAboveFull?.toFixed(2) }} h</li>
                             </ul>
                         </div>
                         <div class="chart-box">
                             <Line v-if="chartData" :data="chartData" :options="chartOptions" />
                             <div v-else class="loading-chart">Lade Diagramm...</div>
                         </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- === TAB: SCHÄCHTE (Nodes) === -->
        <div v-if="activeTab === 'nodes'" class="tab-pane">
            
            <div class="toolbar">
                <input v-model="searchQuery" placeholder="Suche Schacht..." class="search-input" />
                <div class="filters">
                    <label><input type="checkbox" v-model="filterFlooded" /> Nur Überstau</label>
                </div>
            </div>
             <div class="table-scroll">
                <table class="data-table sticky-header">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Typ</th>
                            <th>Sohlhöhe (m)</th>
                            <th title="Max. Wassertiefe">Max. Wassertiefe (m)</th>
                            <th title="Max. Wasserspiegelhöhe (absolut, m ü. NHN)">Max. HGL (m ü. NHN)</th>
                            <th title="Max. Gespeichertes Volumen">Max. Speichervol. (m³)</th>
                            <th title="Max. Füllgrad des Speichers">Füllgrad (%)</th>
                            <th title="Gesamtvolumen der Überflutung">Überflutungsvolumen (m³)</th>
                            <th title="Zeitpunkt des Maximums">t_max</th>
                            <th>Status</th>
                            <th>Aktion</th>
                        </tr>
                    </thead>
                    <tbody>
                         <tr v-for="node in filteredNodes" :key="node.id"
                             :class="{
                               'row-danger': (node.floodingVolume || 0) > 0.001,
                               'row-warning': node.surcharged && !((node.floodingVolume || 0) > 0.001)
                             }">
                            <td>{{ node.id }}</td>
                            <td>{{ nodeTypeLabel(node.type) }}</td>
                            <td>{{ node.z?.toFixed(2) ?? '-' }}</td>
                            <td>{{ node.maxDepth?.toFixed(2) ?? '-' }}</td>
                            <td>{{ node.maxHGL?.toFixed(2) ?? '-' }}</td>
                            <td>{{ systemStats?.storageSummary && systemStats.storageSummary.find(s => s.id === node.id) ? systemStats.storageSummary.find(s => s.id === node.id).maxVol?.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-' }}</td>
                            <td>{{ systemStats?.storageSummary && systemStats.storageSummary.find(s => s.id === node.id) ? systemStats.storageSummary.find(s => s.id === node.id).maxPcntFull?.toFixed(1) : '-' }}</td>
                            <td>{{ (node.floodingVolume || 0).toLocaleString('de-DE', {minimumFractionDigits: 3}) }}</td>
                             <td>{{ node.timeOfMaxDepth || '-' }}</td>
                            <td>
                                <span v-if="(node.floodingVolume || 0) > 0.001" class="badge badge-red">ÜBERFLUTET</span>
                                <span v-else-if="node.surcharged" class="badge badge-yellow">Eingestaut</span>
                                <span v-else class="badge badge-green">OK</span>
                            </td>
                             <td>
                                <button class="btn-icon" @click="selectNode(node.id)">Details</button>
                            </td>
                         </tr>
                    </tbody>
                </table>
            </div>
            
            <!-- Node Details Overlay -->
            <div v-if="selectedNodeId" class="detail-overlay">
                <div class="detail-card">
                    <div class="detail-header">
                        <h3>{{ nodeTypeLabel(safeGet(props.nodeResults, selectedNodeId)?.type) }} {{ selectedNodeId }}</h3>
                        <button @click="selectedNodeId = null">✕</button>
                    </div>
                    <div class="detail-body">
                        <div class="engineer-inspector">
                            <div class="col">
                                <strong>Wassertiefen-Auswertung</strong>
                                <div>Mittlere Wassertiefe: {{ nodeResults.get(selectedNodeId)?.avgDepth?.toFixed(2) }} m</div>
                                <div>Max. Wassertiefe: {{ nodeResults.get(selectedNodeId)?.maxDepth?.toFixed(2) }} m</div>
                                <div>Max. Wasserspiegel (HGL): {{ nodeResults.get(selectedNodeId)?.maxHGL?.toFixed(2) }} m</div>
                                <div>Max. Einstautiefe (gemeldet): <strong>{{ nodeResults.get(selectedNodeId)?.reportedMaxDepth?.toFixed(2) }} m</strong></div>
                            </div>
                            <div class="col">
                                <strong>Zufluss & Überflutung</strong>
                                <div>Max. seitl. Zufluss: {{ nodeResults.get(selectedNodeId)?.maxLatInflow?.toFixed(2) }} l/s</div>
                                <div>Max. Gesamtzufluss: {{ nodeResults.get(selectedNodeId)?.maxTotalInflow?.toFixed(2) }} l/s</div>
                                <div>Gesamtvol. Überflutung: {{ (nodeResults.get(selectedNodeId)?.floodingVolume || 0).toFixed(3) }} m³</div>
                                <div v-if="(nodeResults.get(selectedNodeId)?.floodingVolume || 0) > 0.001" class="text-red">⚠️ Überflutung gemeldet</div>
                            </div>
                            <div class="col" v-if="systemStats?.storageSummary && systemStats.storageSummary.find(s => s.id === selectedNodeId)">
                                <strong>Speicher-Ergebnisse</strong>
                                <div>Max. Volumen: {{ systemStats.storageSummary.find(s => s.id === selectedNodeId)?.maxVol?.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2}) }} m³</div>
                                <div>Durchschnittl. Füllgrad: {{ systemStats.storageSummary.find(s => s.id === selectedNodeId)?.avgPcntFull?.toFixed(1) }} %</div>
                                <div>Maximaler Füllgrad: <strong>{{ systemStats.storageSummary.find(s => s.id === selectedNodeId)?.maxPcntFull?.toFixed(1) }} %</strong></div>
                                <div>Max. Abfluss: {{ (systemStats.storageSummary.find(s => s.id === selectedNodeId)?.maxOutflow * 1000)?.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2}) }} l/s</div>
                            </div>
                        </div>
                         <div class="chart-box">
                             <Line v-if="nodeChartData" :data="nodeChartData" :options="nodeChartData.options || chartOptions" />
                             <div v-else class="loading-chart">Lade Diagramm...</div>
                         </div>
                    </div>
                </div>
            </div>
        </div>


        <!-- === TAB: FLÄCHEN (Catchments) === -->
        <div v-if="activeTab === 'areas'" class="tab-pane">
              <div class="table-scroll">
                <table class="data-table sticky-header">
                    <thead>
                        <tr>
                            <th>Teilfläche ID</th>
                            <th>Fläche (ha)</th>
                            <th title="Breite (m) - Rechnerisch aus Fläche">Breite (m)</th>
                            <th title="Gefälle (%) - Aus Eingabe">Gefälle (%)</th>
                            <th title="Versiegelungsgrad (%) - Input">Versiegelungsgrad (%)</th>
                            <th title="Abflussbeiwert (Ergebnis)">Abflussbeiwert</th>
                            <th title="Niederschlagshöhe (mm)">Niederschlag (mm)</th>
                            <th title="Zufluss von extern (mm)">Zufluss extern (mm)</th>
                            <th title="Verdunstung (mm)">Verdunstung (mm)</th>
                            <th title="Infiltration (mm)">Infiltration (mm)</th>
                            <th title="Abfluss Versiegelt (mm)">Abfluss Vers. (mm)</th>
                            <th title="Abfluss Unversiegelt (mm)">Abfluss Unvers. (mm)</th>
                            <th title="Gesamtabflusshöhe (mm)">Gesamtabflusshöhe (mm)</th>
                            <th title="Gesamtabflussvolumen (Mio. Liter)">Volumen (Mio. L)</th>
                            <th title="Spitzenabfluss (CMS)">Spitzenabfluss (m³/s)</th>
                            <th>Aktion</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="sub in sortedSubcatchments" :key="sub.id">
                            <td>{{ sub.id }}</td>
                            <td>{{ sub.size?.toLocaleString('de-DE', {minimumFractionDigits: 4}) }}</td>
                            <td>{{ (sub.inputWidth || 0).toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</td>
                            <td>{{ (sub.inputSlope || 0).toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</td>
                            <td>{{ (sub.inputImperv || 0).toLocaleString('de-DE', {minimumFractionDigits: 1}) }}</td>
                            
                            <!-- Raw Value for Coeff -->
                            <td>{{ (sub.runoffCoeff || 0).toLocaleString('de-DE', {minimumFractionDigits: 3}) }}</td>
                            <td>{{ (sub.precip || 0).toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</td>
                            <td>{{ (sub.totalRunon || 0).toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</td>
                            <td>{{ (sub.totalEvap || 0).toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</td>
                            <td>{{ (sub.totalInfil || 0).toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</td>
                            <td>{{ (sub.impervRunoffMm || 0).toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</td>
                            <td>{{ (sub.pervRunoffMm || 0).toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</td>
                            <td>{{ (sub.totalRunoffMm || 0).toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</td>
                            
                             <!-- Volume (Mio. Liter) - Raw -->
                            <td>{{ (sub.totalRunoffVol || 0).toLocaleString('de-DE', {minimumFractionDigits: 3}) }}</td>
                            
                            <!-- Peak: CMS (Raw) -> divide by 1000 because parser stored it as L/s * 1000?? No parser line 174: subcatchments[id].peakRunoff = parseFloat(parts[9]) * 1000; (CMS -> L/s). 
                                 Wait, if parser converted to L/s, then for CMS display we divide by 1000. 
                                 Let's check parser again.
                                 Line 174: subcatchments[id].peakRunoff = parseFloat(parts[9]) * 1000;
                                 So parser stores L/s. 
                                 User wants CMS (m3/s).
                                 So we divide by 1000. Correct.
                            -->
                            <td><strong>{{ ((sub.peakRunoff || 0) / 1000).toLocaleString('de-DE', {minimumFractionDigits: 3}) }}</strong></td>
                            
                            <td>
                                <button class="btn-icon" @click="selectArea(sub.id)">Details</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
              </div>
        </div>

      </div>
        
         <!-- Detail Panel Overlay for Areas -->
             <div v-if="selectedAreaId" class="detail-overlay">
                <div class="detail-card">
                    <div class="detail-header">
                        <h3>Fläche {{ selectedAreaId }}</h3>
                        <button @click="selectedAreaId = null">✕</button>
                    </div>
                    <div class="detail-body">
                         <Line v-if="areaChartData" :data="areaChartData" :options="chartOptions" />
                    </div>
                </div>
             </div>

    </div>
  </DraggableModal>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import DraggableModal from '../common/DraggableModal.vue';
import SimulationReportExport from './SimulationReportExport.vue';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line, Bar } from 'vue-chartjs';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

const props = defineProps({
  isOpen: Boolean,
  resultsText: String,
  nodes: Map,
  edges: Map,
  areas: [Map, Array],
  edgeResults: Map,
  nodeResults: Map,
  areaResults: Map,
  timeSeries: Array,
  systemStats: Object,
  rain: Object, // store.rain — enthält activeModelRain.series, method, intensity, duration
});

const emit = defineEmits(['close', 'zoomTo']);

// State
const activeTab = ref('general');
const selectedEdgeId = ref(null);
const selectedNodeId = ref(null);
const selectedAreaId = ref(null);
const searchQuery = ref('');
const filterSurcharged = ref(false);
const filterFlooded = ref(false);
const sortBy = ref('id');

// Tabs Config
const tabs = [
    { id: 'general', label: 'Allgemein & Diagnose' },
    { id: 'edges', label: 'Haltungen (Kanal)' },
    { id: 'nodes', label: 'Schächte & Bauwerke' },
    { id: 'areas', label: 'Teilflächen' }
];

// --- Helpers ---
const close = () => emit('close');
const formatVolume = (v) => v ? v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

const getContinuityClass = (error) => {
    const absErr = Math.abs(error || 0);
    if (absErr > 5) return 'kpi-danger';
    if (absErr > 1) return 'kpi-warning';
    return 'kpi-success';
};

const getRatioClass = (ratio) => {
    if ((ratio || 0) > 1.0) return 'text-red font-bold';
    if ((ratio || 0) > 0.8) return 'text-orange';
    return '';
};

const hasStabilityIssues = computed(() => {
    return (props.systemStats?.routingTimeStep?.notConverging > 0) || 
           (props.systemStats?.nonConvergingNodes?.length > 0);
});

// Health Score Logic
const healthScore = computed(() => {
    let score = 100;
    // Deduct for Continuity Error
    const contErr = Math.abs(props.systemStats?.flow?.error || 0);
    if (contErr > 1) score -= (contErr * 5); // -5 points per 1% error
    
    // Deduct for Instability
    const instab = props.systemStats?.routingTimeStep?.notConverging || 0;
    if (instab > 0) score -= (instab * 2);

    // Clamp
    return Math.max(0, Math.min(100, Math.round(score)));
});

const getHealthClass = (score) => {
    if (score >= 90) return 'health-excellent';
    if (score >= 70) return 'health-good';
    if (score >= 50) return 'health-warning';
    return 'health-critical';
};

const getHealthTitle = (score) => {
    if (score >= 90) return 'Exzellent';
    if (score >= 70) return 'Gut';
    if (score >= 50) return 'Warnung';
    return 'Kritisch';
};

const getHealthDescription = (score) => {
    if (score >= 90) return 'Das Modell ist hydraulisch stabil und massenkonsistent.';
    if (score >= 70) return 'Gute Ergebnisse, leichte Fehler in der Massenbilanz.';
    if (score >= 50) return 'Signifikante Modellfehler. Bitte prüfen Sie die Warnungen.';
    return 'Modell instabil (hoher Fehler). Ergebnisse nicht vertrauenswürdig.';
};

// --- Computed Data ---

// Gesamtfläche des Einzugsgebiets aus den Input-Areas (in ha)
const totalCatchmentAreaHa = computed(() => {
    if (!props.areas) return 0;
    let total = 0;
    if (props.areas instanceof Map) {
        for (const a of props.areas.values()) total += parseFloat(a.size || 0);
    } else if (Array.isArray(props.areas)) {
        for (const a of props.areas) total += parseFloat(a.size || 0);
    } else {
        for (const a of Object.values(props.areas)) total += parseFloat(a.size || 0);
    }
    return total;
});

// mm-Werte aus ha·m rückrechnen, bezogen auf UNSERE Gesamtfläche (nicht SWMMs interne)
// So stellen wir sicher dass die Flächenbasis stimmt, auch wenn SWMM intern abweicht.
const runoffBilanz = computed(() => {
    const areaHa = totalCatchmentAreaHa.value;
    const r = props.systemStats?.runoff || {};

    const toMm = (volHaM) => areaHa > 0 ? (volHaM / areaHa) * 1000 : (r.precipMm > 0 ? volHaM / r.precip * r.precipMm : 0);

    return {
        precipMm:      areaHa > 0 ? toMm(r.precip)       : (r.precipMm       || 0),
        evapMm:        areaHa > 0 ? toMm(r.evap)         : (r.evapMm         || 0),
        infilMm:       areaHa > 0 ? toMm(r.infil)        : (r.infilMm        || 0),
        runoffMm:      areaHa > 0 ? toMm(r.runoff)       : (r.runoffMm       || 0),
        finalStorageMm:areaHa > 0 ? toMm(r.finalStorage) : (r.finalStorageMm || 0),
        // Abflussbeiwert Ψ = Abflusshöhe / Niederschlagshöhe
        psi: (r.precip > 0) ? (r.runoff / r.precip) : 0,
    };
});

// Rain chart — rekonstruiert aus store.rain.activeModelRain.series
const rainChartData = computed(() => {
    const series = props.rain?.activeModelRain?.series;
    if (!series || series.length === 0) return null;

    const interval = series.length > 1 ? (series[1].time - series[0].time) : 5;

    // Kumulierte Regenhöhe aufbauen
    let cumMm = 0;
    const cumulative = series.map(s => {
        const h = s.height_mm !== undefined ? s.height_mm : (s.intensity * interval * 0.006);
        cumMm += h;
        return parseFloat(cumMm.toFixed(3));
    });

    const totalMm = cumulative[cumulative.length - 1] || 0;
    const peakIntensity = Math.max(...series.map(s => s.intensity || 0));
    const method = props.rain?.activeModelRain?.type || props.rain?.method || '';

    return {
        meta: { totalMm, peakIntensity, interval, method, steps: series.length },
        chart: {
            labels: series.map(s => s.time + ' min'),
            datasets: [
                {
                    type: 'bar',
                    label: 'Intensität (l/s·ha)',
                    data: series.map(s => parseFloat((s.intensity || 0).toFixed(2))),
                    backgroundColor: 'rgba(52, 152, 219, 0.7)',
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderWidth: 1,
                    yAxisID: 'yIntensity',
                    order: 2,
                },
                {
                    type: 'line',
                    label: 'Kumuliert (mm)',
                    data: cumulative,
                    borderColor: '#e74c3c',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    yAxisID: 'yCumulative',
                    order: 1,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top', labels: { font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            if (ctx.dataset.yAxisID === 'yIntensity')
                                return `Intensität: ${ctx.raw} l/s·ha`;
                            return `Kumuliert: ${ctx.raw} mm`;
                        }
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: 'Zeit (min)', font: { size: 10 } } },
                yIntensity: {
                    type: 'linear', position: 'left',
                    title: { display: true, text: 'Intensität (l/s·ha)', font: { size: 10 } },
                    beginAtZero: true,
                },
                yCumulative: {
                    type: 'linear', position: 'right',
                    title: { display: true, text: 'Regenhöhe (mm)', font: { size: 10 } },
                    beginAtZero: true,
                    grid: { drawOnChartArea: false },
                }
            }
        }
    };
});

// Helper for Map/Object Agnostic Access
const safeGet = (source, key) => {
    if (!source) return undefined;
    return (source instanceof Map) ? source.get(key) : source[key];
};

const NODE_TYPE_LABELS = {
    'JUNCTION': 'Schacht', 'Junction': 'Schacht',
    'OUTFALL': 'Auslauf', 'Outfall': 'Auslauf',
    'STORAGE': 'Speicher', 'Storage': 'Speicher',
    'DIVIDER': 'Teiler', 'Divider': 'Teiler'
};
const EDGE_TYPE_LABELS = {
    'CONDUIT': 'Kanal', 'Conduit': 'Kanal',
    'PUMP': 'Pumpe', 'Pump': 'Pumpe',
    'WEIR': 'Wehr', 'Weir': 'Wehr',
    'ORIFICE': 'Blende', 'Orifice': 'Blende'
};
const nodeTypeLabel = (type) => NODE_TYPE_LABELS[type] || type || '-';
const edgeTypeLabel = (type) => EDGE_TYPE_LABELS[type] || type || '-';

// 1. Edges
const filteredEdges = computed(() => {
     if (!props.edges || !props.edgeResults) return [];
     let list = Array.from(props.edges.values()).map(e => {
         const res = safeGet(props.edgeResults, e.id) || {};
         return { ...e, ...res }; // Merge Geometry + Results
     });

     if (searchQuery.value) {
         const q = searchQuery.value.toLowerCase();
         list = list.filter(e => e.id.toLowerCase().includes(q));
     }
     if (filterSurcharged.value) {
         list = list.filter(e => (e.depthRatio || 0) > 0.9);
     }
     
     // Sorting
     list.sort((a, b) => {
         if (sortBy.value === 'maxFlow') return (b.maxFlow || 0) - (a.maxFlow || 0);
         if (sortBy.value === 'capacity') return (b.capacity || 0) - (a.capacity || 0);
         if (sortBy.value === 'ratio') return (b.flowCapacityRatio || 0) - (a.flowCapacityRatio || 0);
         if (sortBy.value === 'depth') return (b.depthRatio || 0) - (a.depthRatio || 0);
         if (sortBy.value === 'maxVelocity') return (b.maxVelocity || 0) - (a.maxVelocity || 0);
         return a.id.localeCompare(b.id);
     });
     
     return list;
});

// 2. Nodes
const filteredNodes = computed(() => {
    if (!props.nodes || !props.nodeResults) return [];
    let list = Array.from(props.nodes.values()).map(n => {
         const res = safeGet(props.nodeResults, n.id) || {};
         return { ...n, ...res };
    });

     if (searchQuery.value) {
         const q = searchQuery.value.toLowerCase();
         list = list.filter(n => n.id.toLowerCase().includes(q));
     }
     if (filterFlooded.value) {
         list = list.filter(n => (n.floodingVolume || 0) > 0.001);
     }
     return list;
});

// 3. Areas (Subcatchments)
const sortedSubcatchments = computed(() => {
     // Drive from Results (detailed), enrich with Geometry (parent)
     const results = props.areaResults;
     
     // Handle empty case
     if (!results) return [];
     if (results instanceof Map && results.size === 0) return [];
     if (!(results instanceof Map) && Object.keys(results).length === 0) return [];
     
     let entries = [];
     if (results instanceof Map) {
         entries = Array.from(results.entries());
     } else {
         entries = Object.entries(results);
     }
     
     // Helper for Lookup
     const findParent = (baseId) => {
         if (props.areas instanceof Map) return props.areas.get(baseId);
         if (Array.isArray(props.areas)) return props.areas.find(a => a.id === baseId);
         return null;
     };

     // Map to objects with ID included and Geometry merged
     let list = entries.map(([id, data]) => {
         // 1. Resolve Parent ID
         let baseId = id;
         const isPart2 = id.endsWith('_2');
         
         if (isPart2) {
             baseId = baseId.replace(/_2$/, '');
         }
         
         // 2. Try Find Parent (prop.areas) - Exact Match first (e.g. if Area ID is "RW34.1")
         let parentArea = findParent(baseId);
         
         // 3. Fallback: Strip .1 suffix (e.g. if Result is "RW34.1" but Input Area is "RW34")
         if (!parentArea && baseId.endsWith('.1')) {
             const stripped = baseId.substring(0, baseId.length - 2);
             parentArea = findParent(stripped);
         }
         
         // 4. Calculate Derived Properties
         let sizeVal = 0;
         let inputSlope = 0;
         let inputImperv = 0;
         let inputWidth = 0;

         if (parentArea) {
             const totalSize = parentArea.size || 0;
             inputSlope = parentArea.slope || 0; 
             inputImperv = (parentArea.runoffCoeff || 0) * 100;
             
             let ratio = 1.0;
             if (parentArea.nodeId2) {
                 const userRatio = (parentArea.splitRatio !== undefined) ? parseFloat(parentArea.splitRatio) : 50;
                 ratio = userRatio / 100.0;
             }
             
             if (isPart2) {
                 sizeVal = totalSize * (1 - ratio);
             } else {
                 sizeVal = totalSize * ratio;
             }
             
             // Dynamic Width Calculation (consistent with builder)
             const sizeM2 = sizeVal * 10000;
             inputWidth = Math.sqrt(sizeM2); 
         }
         
         return { 
             id, 
             size: sizeVal,
             inputSlope,
             inputImperv,
             inputWidth,
             ...data 
         };
     });
     
     // Sort by ID
     list.sort((a, b) => a.id.localeCompare(b.id));
     return list;
});

const getFlowClass = (id) => {
    // try find flow class
    const cls = props.systemStats?.flowClassification?.find(c => c.id === id);
    if (!cls) return 'N.V.';
    if (cls.fractions.supCrit > 0.1) return 'Überkritisch';
    if (cls.fractions.normLtd > 0.1) return 'Normal-Limitiert';
    return 'Unterkritisch';
};


// Selection Logic (Placeholder for Chart Data - requires logic from old component)
// For now, simple stubs.
// Selection Logic & Chart Data
const chartOptions = { 
    responsive: true, 
    maintainAspectRatio: false,
    elements: { point: { radius: 0 } }, // Optimize performance
    interaction: { mode: 'index', intersect: false }
};

const chartData = ref(null);
const nodeChartData = ref(null);
const areaChartData = ref(null);

const formatTime = (seconds) => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
};

const updateCharts = (type, id) => {
    if (!props.timeSeries || props.timeSeries.length === 0) return;

    const labels = props.timeSeries.map(step => formatTime(step.time));

    if (type === 'edge') {
        chartData.value = {
            labels,
            datasets: [
                {
                    label: 'Abfluss (L/s)',
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    data: props.timeSeries.map(step => step.edges[id]?.q || 0),
                    fill: true
                },
                {
                    label: 'Kapazität (L/s)', // Approximation based on utilization? Or flat line?
                    // Flat line of capacity?
                    borderColor: '#94a3b8',
                    borderDash: [5, 5],
                    data: props.timeSeries.map(() => props.edgeResults.get(id)?.capacity || 0)
                }
            ]
        };
    } else if (type === 'node') {
         // Get Node Geometry
         const nodeGeom = props.nodes instanceof Map ? props.nodes.get(id) : props.nodes[id];
         // Max Depth = (CoverZ - InvertZ) or just 'depth' prop (mapped to Max Depth in SWMM)
         const maxPhysicalDepth = nodeGeom ? parseFloat(nodeGeom.depth) : 0;
         
         const datasets = [
                {
                    label: 'Tiefe (m)',
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.2)',
                    data: props.timeSeries.map(step => step.nodes[id]?.depth || 0),
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: 'Zufluss (L/s)',
                    borderColor: '#10b981',
                    data: props.timeSeries.map(step => step.nodes[id]?.inflow || 0),
                    yAxisID: 'y1'
                }
            ];

         // If Storage Node, add Volume to a new axis
         // Typical storage types: 2 (Becken), 3, 4, 12, 13 or explicit volume
         const isStorage = nodeGeom && (
             [2, 3, 4, 12, 13].includes(parseInt(nodeGeom.type)) || 
             parseFloat(nodeGeom.volume) > 0
         );

         if (isStorage) {
             datasets.push({
                 label: 'Volumen (m³)',
                 borderColor: '#f59e0b', // amber
                 backgroundColor: 'rgba(245, 158, 11, 0.2)',
                 data: props.timeSeries.map(step => step.nodes[id]?.vol || 0),
                 fill: true,
                 yAxisID: 'y2'
             });
         }

         // Add Reference Line for Rim Elevation (Max Depth)
         if (maxPhysicalDepth > 0) {
             datasets.push({
                 label: 'Deckelhöhe',
                 borderColor: '#ef4444',
                 borderDash: [5, 5],
                 borderWidth: 1,
                 pointRadius: 0,
                 data: labels.map(() => maxPhysicalDepth),
                 yAxisID: 'y'
             });
         }

         // Dynamic chart options for nodes to support multiple axes
         const nodeOptions = JSON.parse(JSON.stringify(chartOptions));
         nodeOptions.scales = {
             x: { display: true },
             y: { 
                 type: 'linear', 
                 display: true, 
                 position: 'left',
                 title: { display: true, text: 'Tiefe (m)' }
             },
             y1: { 
                 type: 'linear', 
                 display: true, 
                 position: 'right',
                 title: { display: true, text: 'Zufluss (L/s)' },
                 grid: { drawOnChartArea: false } 
             }
         };

         if (isStorage) {
             nodeOptions.scales.y2 = {
                 type: 'linear',
                 display: true,
                 position: 'right',
                 title: { display: true, text: 'Volumen (m³)' },
                 grid: { drawOnChartArea: false }
             };
         }

         nodeChartData.value = {
            labels,
            datasets: datasets,
            options: nodeOptions
        };
        // Add dual axis options if needed, for now sharing scale or just depth
    } else if (type === 'area') {
        areaChartData.value = {
            labels,
            datasets: [
                {
                    label: 'Abfluss (L/s)', // Runoff value (assuming parser returns normalized unit or raw? Parser has float32. usually CMS or LPS depending on flowUnits)
                    // Wait, SwmmOutParser just reads float. SWMM outputs runoff in flow units usually.
                    // If flowUnits is LPS, its LPS. 
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.2)',
                    data: props.timeSeries.map(step => step.subcatchments[id]?.runoff * (props.systemStats?.analysisOptions?.flowUnits === 'LPS' ? 1 : 1000) || 0),
                    fill: true
                }
            ]
        };
    }
};

const selectEdge = (id) => { selectedEdgeId.value = id; updateCharts('edge', id); };
const selectNode = (id) => { selectedNodeId.value = id; updateCharts('node', id); };
const selectArea = (id) => { selectedAreaId.value = id; updateCharts('area', id); };

// Watch for external/focus open
watch(selectedEdgeId, (newId) => { if(newId) updateCharts('edge', newId); });
watch(selectedNodeId, (newId) => { if(newId) updateCharts('node', newId); });
// Area?

</script>

<style scoped>
/* Modern Isybau Styling (Clean, Flat, functional) */
.simulation-results-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #fdfdfd;
    font-family: 'Inter', sans-serif;
}

/* Modal Header */
.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1.5rem;
    background: #040647;
    border-bottom: 2px solid #594491;
}
.header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.modal-header h2 {
    margin: 0;
    font-family: 'Press Start 2P', monospace;
    font-size: 0.65rem;
    font-weight: 700;
    color: #2ecc71;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: #6b7280;
    cursor: pointer;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}

.close-btn:hover {
    background: #f3f4f6;
    color: #2ecc71;
}

/* Tabs */
.tabs-nav {
    display: flex;
    gap: 1rem;
    padding: 1rem 1.5rem;
    background: #fff;
    border-bottom: 1px solid #aeadd2;
}

.tab-btn {
    padding: 0.5rem 1.2rem;
    border-radius: 20px;
    background: #f3f4f6;
    border: none;
    color: #666;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}

.tab-btn:hover { background: #594491; }
.tab-btn.active {
    background: #3b82f6;
    color: white;
    box-shadow: 0 2px 5px rgba(59, 130, 246, 0.3);
}

/* Tab Content */
.tab-content {
    flex: 1;
    overflow: hidden; /* For scrolling inside tabs */
    position: relative;
    padding: 0;
}

.tab-pane {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 1rem;
    overflow-y: auto;
}

/* KPI Grid */
.kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
}

.kpi-card {
    background: white;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    border: 1px solid #f0f0f0;
    text-align: center;
}
.kpi-card .label { color: #888; font-size: 0.9rem; margin-bottom: 0.5rem; }
.kpi-card .value { font-size: 1.5rem; font-weight: 700; color: #333; }
.kpi-card .kpi-sub { font-size: 0.75rem; color: #aaa; margin-top: 0.25rem; }
.kpi-danger .value { color: #2ecc71; }
.kpi-warning .value { color: #f59e0b; }
.kpi-success .value { color: #10b981; }

.grid-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
}

.panel {
    background: white;
    border-radius: 8px;
    border: 1px solid #aeadd2;
    padding: 1.5rem;
}
.panel h3 { margin-top: 0; font-size: 1.1rem; border-bottom: 1px solid #aeadd2; padding-bottom: 0.5rem; margin-bottom: 1rem;}
.warning-panel { border-left: 4px solid #f59e0b; }

.detail-row { display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.95rem; }
.simple-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.simple-table td { padding: 0.25rem 0; border-bottom: 1px solid #f5f5f5; }
.simple-table tr:last-child td { border-bottom: none; }
.simple-table .highlight-row td { background: #fdfdfd; font-weight: bold; border-top: 2px solid #eee; padding-top: 0.5rem; }

/* Bilanz-Tabelle */
.bilanz-table th { text-align: left; color: #888; font-size: 0.75rem; padding: 0.2rem 0; border-bottom: 2px solid #eee; }
.bilanz-table .bilanz-header th:not(:first-child) { text-align: right; }
.bilanz-table .val-right { text-align: right; font-variant-numeric: tabular-nums; }
.bilanz-note { font-size: 0.72rem; color: #aaa; margin-left: 0.5rem; }
.bilanz-footnote { font-size: 0.75rem; color: #aaa; margin: 0.75rem 0 0; font-style: italic; }

/* Outfall-Scroll — begrenzt Höhe bei vielen Auslässen, scrollt intern */
.outfall-scroll {
    max-height: 220px;
    overflow-y: auto;
}

/* Stabilitätsbericht — Knotenliste scrollbar bei vielen */
.stability-scroll {
    max-height: 160px;
    overflow-y: auto;
    margin: 0.4rem 0 0.25rem;
    padding-left: 1.2rem;
}
.stability-more {
    font-size: 0.75rem;
    color: #f59e0b;
    margin: 0;
    font-style: italic;
}

/* Zähler-Badge neben Panel-Titel */
.panel-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.4rem;
    height: 1.4rem;
    background: #ede9fe;
    color: #594491;
    border-radius: 999px;
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0 0.35rem;
    margin-left: 0.4rem;
    vertical-align: middle;
    font-family: sans-serif;
}

/* Regen-Panel */
.rain-panel {
    margin-top: 1.5rem;
    margin-bottom: 1.5rem;
    border-left: 4px solid #3498db;
    padding: 1rem 1.25rem;
}
.rain-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
    gap: 0.75rem;
}
.rain-title {
    display: flex;
    align-items: center;
    gap: 0.6rem;
}
.rain-icon { font-size: 1.4rem; }
.rain-title strong { display: block; font-size: 0.9rem; color: #1e3a5f; }
.rain-method-badge {
    display: inline-block;
    font-size: 0.68rem;
    background: #dbeafe;
    color: #1d4ed8;
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    font-weight: 600;
    margin-top: 0.15rem;
}
.rain-meta {
    display: flex;
    gap: 1.25rem;
    flex-wrap: wrap;
}
.rain-kpi {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
}
.rain-kpi span { font-size: 0.7rem; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.03em; }
.rain-kpi strong { font-size: 1rem; color: #1e3a5f; }
.rain-chart-box {
    height: 180px;
    position: relative;
}

/* Bezugsflächen-Badge */
.area-badge {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    margin-bottom: 0.75rem;
    font-size: 0.82rem;
}
.area-ok   { background: #f0fdf4; border: 1px solid #bbf7d0; }
.area-warn { background: #fff7ed; border: 1px solid #fed7aa; }
.area-badge-label { color: #6b7280; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; }
.area-badge-val   { font-weight: 700; color: #15803d; }
.area-warn .area-badge-val { color: #c2410c; }
.area-badge-sub   { color: #9ca3af; font-size: 0.72rem; margin-left: auto; }

/* Tables */
.table-scroll { flex: 1; overflow-y: auto; background: white; border: 1px solid #aeadd2; border-radius: 6px; }
.data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.data-table th, .data-table td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #aeadd2; }
.data-table th { background: #f9fafb; font-weight: 600; color: #4b5563; position: sticky; top: 0; z-index: 1; cursor: pointer; }
.data-table tr:hover { background: #f8fafc; }
.row-warning { background: #fff7ed; }
.row-danger { background: #fef2f2; }

/* Badges */
.badge { padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
.badge-red { background: #fee2e2; color: #b91c1c; }
.badge-orange { background: #ffedd5; color: #c2410c; }
.badge-yellow { background: #fef3c7; color: #b45309; }
.badge-green { background: #d1fae5; color: #047857; }

/* Toolbar */
.toolbar { display: flex; justify-content: space-between; margin-bottom: 1rem; }
.search-input { padding: 0.5rem; border: 1px solid #aeadd2; border-radius: 4px; width: 250px; }

/* Overlays */
.detail-overlay {
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(255,255,255,0.95);
    z-index: 20;
    padding: 2rem;
    display: flex;
    justify-content: center;
}
.detail-card {
    background: white;
    width: 100%;
    max-width: 800px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    border-radius: 8px;
    border: 1px solid #aeadd2;
    display: flex; 
    flex-direction: column;
}
.detail-header { display: flex; justify-content: space-between; padding: 1rem; border-bottom: 1px solid #aeadd2; background: #fafafa; }
.detail-body { padding: 1.5rem; flex: 1; overflow-y: auto; }
.engineer-inspector { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem; background: #f8fbff; padding: 1rem; border-radius: 6px; border: 1px solid #e0f0ff;}
.text-red { color: #dc2626; font-weight: bold; }
.btn-icon { background: none; border: 1px solid #aeadd2; padding: 0.2rem 0.6rem; border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
.btn-icon:hover { background: #f3f4f6; }

.mb-4 { margin-bottom: 1rem; }
.progress-bar-bg { width: 100px; height: 8px; background: #eee; border-radius: 4px; display: inline-block; margin-right: 5px; }
.progress-bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }

/* Health Header */
.health-header {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 1.5rem;
    background: white;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    box-shadow: 0 2px 5px rgba(0,0,0,0.05);
    border: 1px solid #aeadd2;
}
.score-circle {
    width: 60px; height: 60px; border-radius: 50%;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: white; font-weight: bold;
}
.score-val { font-size: 1.2rem; line-height: 1; }
.score-label { font-size: 0.6rem; text-transform: uppercase; }
.health-text { flex: 1; }
.health-text h3 { margin: 0 0 0.25rem 0; font-size: 1.2rem; }
.health-text p { margin: 0; color: #666; font-size: 0.9rem; }
.health-metrics { display: flex; gap: 1.5rem; border-left: 1px solid #eee; padding-left: 1.5rem; }
.metric { display: flex; flex-direction: column; }
.metric span { font-size: 0.75rem; color: #888; text-transform: uppercase; }
.metric strong { font-size: 1.1rem; color: #333; }

.health-excellent .score-circle { background: #10b981; }
.health-excellent h3 { color: #2ecc71; }
.health-good .score-circle { background: #3b82f6; } /* Blue */
.health-good h3 { color: #8f8be1; }
.health-warning .score-circle { background: #f59e0b; }
.health-warning h3 { color: #aeadd2; }
.health-critical .score-circle { background: #ef4444; }
.health-critical h3 { color: #e74c3c; }


/* ── Design Schema ────────────────────────────── */
.tab-btn {
  font-family: "Press Start 2P", monospace !important;
  font-size: 0.5rem !important;
  letter-spacing: 0.06em;
  background: transparent !important;
  border: 1px solid #594491 !important;
  color: #aeadd2 !important;
  border-radius: 5px !important;
  padding: 0.45rem 0.75rem !important;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.tab-btn:hover { background: #594491 !important; color: #fff !important; }
.tab-btn.active { background: #594491 !important; color: #fff !important; border-color: #8f8be1 !important; }

.primary-btn {
  background: #040647 !important;
  color: #fff !important;
  border: none !important;
  border-radius: 6px !important;
  font-weight: 700 !important;
  transition: background 0.15s;
}
.primary-btn:hover:not(:disabled) { background: #594491 !important; }
.primary-btn:disabled { background: #aeadd2 !important; cursor: default; }

.secondary-btn {
  background: #fff !important;
  border: 1px solid #aeadd2 !important;
  color: #040647 !important;
  border-radius: 6px !important;
  font-weight: 600 !important;
  transition: background 0.12s;
}
.secondary-btn:hover { background: #f3f2fb !important; }

.modal-body h3, .panel h3 {
  font-family: "Press Start 2P", monospace !important;
  font-size: 0.55rem !important;
  color: #594491 !important;
  letter-spacing: 0.06em;
  border-bottom: 1px solid #aeadd2 !important;
  padding-bottom: 0.4rem !important;
  margin-bottom: 0.75rem !important;
}

</style>
