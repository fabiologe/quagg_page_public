/**
 * Gemeinsame Helfer für die Tabs des Simulationsergebnis-Modals
 * (SimulationResultsModal → results/*Tab.vue).
 */
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

export { Line, Bar } from 'vue-chartjs';

import { Bauwerkstyp } from '../../../utils/mappings.js';

/** Map-/Objekt-agnostischer Zugriff auf Ergebnis-Sammlungen. */
export const safeGet = (source, key) => {
    if (!source) return undefined;
    return (source instanceof Map) ? source.get(key) : source[key];
};

export const formatVolume = (v) => v ? v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

export const fmtVol = (v) => (v == null ? '-' : v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export const formatTime = (seconds) => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
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
export const nodeTypeLabel = (type) => NODE_TYPE_LABELS[type] || type || '-';
export const edgeTypeLabel = (type) => EDGE_TYPE_LABELS[type] || type || '-';

/**
 * Zeigt Pumpwerk/Wehr/Drossel/... statt generisch "Schacht" für Bauwerksknoten.
 * `bwType` ist der ISYBAU-Bauwerkstyp (Integer aus dem Input-Netz), NICHT der
 * SWMM-Knotentyp aus dem Report (JUNCTION/STORAGE/OUTFALL) — beide heißen im
 * gemergten Ergebnis-Objekt `type`, deshalb muss bwType separat mitgeführt werden
 * (siehe ResultsNodesTab.vue filteredNodes), sonst überschreibt der SWMM-Typ
 * den ISYBAU-Bauwerkstyp beim Merge.
 */
export const structureTypeLabel = (bwType, swmmType) => Bauwerkstyp[bwType] || nodeTypeLabel(swmmType);

export const getRatioClass = (ratio) => {
    if ((ratio || 0) > 1.0) return 'text-red font-bold';
    if ((ratio || 0) > 0.8) return 'text-orange';
    return '';
};

export const getContinuityClass = (error) => {
    const absErr = Math.abs(error || 0);
    if (absErr > 5) return 'kpi-danger';
    if (absErr > 1) return 'kpi-warning';
    return 'kpi-success';
};

/** Basis-Optionen für die Ganglinien-Charts. */
export const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    elements: { point: { radius: 0 } }, // Optimize performance
    interaction: { mode: 'index', intersect: false }
};
