<template>
  <div class="tab-pane">

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
            <h3><img class="emoji-icon" src="/saintv1d/icons/Interface-Essential-Cog-Double--Streamline-Pixel.svg" alt="" /> Simulations-Parameter</h3>
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
            <h3><img class="emoji-icon" src="/saintv1d/icons/Weather-Umbrella--Streamline-Pixel.svg" alt="" /> Niederschlagsbilanz (Runoff)</h3>

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
            <h3><img class="emoji-icon" src="/saintv1d/icons/Interface-Essential-Alert-Triangle-1--Streamline-Pixel.svg" alt="" /> Stabilitätsbericht</h3>
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

        <!-- Modellqualität: Kontinuitätsfehler / Instabilitäten aus dem Report -->
        <div class="panel warning-panel" v-if="modelQualityIssues.length">
            <h3><img class="emoji-icon" src="/saintv1d/icons/Interface-Essential-Alert-Triangle-1--Streamline-Pixel.svg" alt="" /> Modellqualität ({{ modelQualityIssues.length }})</h3>
            <p class="bilanz-footnote">
                Elemente mit hohem Kontinuitätsfehler oder Instabilität — Ergebnisse dort sind unzuverlässig.
            </p>
            <div class="table-scroll" style="max-height: 220px;">
                <table class="data-table">
                    <thead>
                        <tr><th>Element</th><th>Problem</th><th>Wert</th></tr>
                    </thead>
                    <tbody>
                        <tr v-for="issue in modelQualityIssues" :key="issue.key"
                            :class="{ 'row-danger': issue.severe }">
                            <td>{{ issue.id }}</td>
                            <td>{{ issue.label }}</td>
                            <td class="val-right">{{ issue.value }}</td>
                        </tr>
                    </tbody>
                </table>
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
                <img class="rain-icon" src="/saintv1d/icons/Weather-Umbrella--Streamline-Pixel.svg" alt="" />
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
</template>

<script setup>
import { computed } from 'vue';
import { Bar, formatVolume, getContinuityClass } from './resultsShared.js';

const props = defineProps({
  systemStats: Object,
  rain: Object, // store.rain — enthält activeModelRain.series, method, intensity, duration
  totalCatchmentAreaHa: { type: Number, default: 0 },
});

const hasStabilityIssues = computed(() => {
    return (props.systemStats?.routingTimeStep?.notConverging > 0) ||
           (props.systemStats?.nonConvergingNodes?.length > 0);
});

// Modellqualität: vom RptParser gelieferte Diagnose-Listen
// (continuityErrors, instabilityIndexes, criticalElements) in eine Tabelle bündeln.
const modelQualityIssues = computed(() => {
    const issues = [];
    for (const e of props.systemStats?.continuityErrors || []) {
        issues.push({
            key: `ce-${e.id}`, id: e.id,
            label: 'Kontinuitätsfehler (Knoten)',
            value: `${e.error.toFixed(2)} %`,
            severe: Math.abs(e.error) >= 10
        });
    }
    for (const i of props.systemStats?.instabilityIndexes || []) {
        issues.push({
            key: `ii-${i.id}`, id: i.id,
            label: 'Fluss-Instabilität (Haltung)',
            value: `Index ${i.index}`,
            severe: i.index >= 5
        });
    }
    for (const c of props.systemStats?.criticalElements || []) {
        issues.push({
            key: `crit-${c.type}-${c.id}`, id: c.id,
            label: `Zeitschritt-kritisch (${c.type === 'Link' ? 'Haltung' : 'Knoten'})`,
            value: `${c.value.toFixed(1)} %`,
            severe: c.value >= 50
        });
    }
    issues.sort((a, b) => (b.severe ? 1 : 0) - (a.severe ? 1 : 0));
    return issues;
});

// Health Score Logic
const healthScore = computed(() => {
    let score = 100;
    const contErr = Math.abs(props.systemStats?.flow?.error || 0);
    if (contErr > 1) score -= (contErr * 5); // -5 points per 1% error
    const instab = props.systemStats?.routingTimeStep?.notConverging || 0;
    if (instab > 0) score -= (instab * 2);
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

// mm-Werte aus ha·m rückrechnen, bezogen auf UNSERE Gesamtfläche (nicht SWMMs interne)
const runoffBilanz = computed(() => {
    const areaHa = props.totalCatchmentAreaHa;
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
</script>

<style scoped src="./results-shared.css"></style>
