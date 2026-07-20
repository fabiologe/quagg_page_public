// Pure Spec-Builder für die ausklinkbaren Ganglinien-Fenster im Result-Viewer:
// aus den Anzeige-Serien (useNetworkResults/useWeirResults) wird eine deklarative
// Chart-Beschreibung gebaut, die GanglinieWindow.vue 1:1 in Chart.js übersetzt.
// Kein Vue, kein Chart.js — node-testbar. Farben/Datensätze spiegeln die Panels
// (NetworkResultsPanel/WeirResultsPanel), damit Panel und Fenster gleich lesen.

export const SYSTEM_ID = '__system__';

const NET_ACCENT = '#38bdf8';
const WEIR_ACCENT = '#4fc3f7';

const ds = (label, axis, data, color, unit, extra = {}) => ({
    label, axis, data, color, unit, ...extra,
});
const pts = (times, arr) => times.map((x, i) => ({ x, y: arr?.[i] ?? null }));
const line = (times, y) => times.map((x) => ({ x, y }));

/**
 * Ganglinien-Spec fürs 1D-Netz (System / Schacht / Haltung).
 * @param {string} sel  SYSTEM_ID oder Element-ID
 * @param {{nodeSeries:Array, linkSeries:Array, system:object|null}} s
 * @returns {object|null} Fenster-Spec { key,title,accent,yL,yR,times,datasets } oder null
 */
export function buildNetworkChartSpec(sel, { nodeSeries = [], linkSeries = [], system = null }) {
    if (sel === SYSTEM_ID) {
        if (!system || !Array.isArray(system.times) || system.times.length === 0) return null;
        const t = system.times;
        return {
            key: `net:${SYSTEM_ID}`, title: 'Kanalnetz — Systembilanz', accent: NET_ACCENT,
            yL: 'Volumen (m³)', yR: 'Q (m³/s)', times: t,
            datasets: [
                ds('Volumen im Netz', 'yL', pts(t, system.storedVolume), NET_ACCENT, ' m³', { fill: true }),
                ds('Zufluss', 'yR', pts(t, system.inflow), '#66bb6a', ' m³/s'),
                ds('Auslass', 'yR', pts(t, system.outflow), '#ffb74d', ' m³/s'),
                ds('Überstau', 'yR', pts(t, system.flooding), '#ef5350', ' m³/s'),
            ],
        };
    }
    const n = nodeSeries.find((x) => x.id === sel);
    if (n) {
        const t = n.times;
        return {
            key: `net:${n.id}`, title: `Schacht ${n.label} — Ganglinie`, accent: NET_ACCENT,
            yL: 'Wasserstand (m)', yR: 'Q (m³/s)', times: t,
            datasets: [
                ds('Wasserstand', 'yL', pts(t, n.depth), NET_ACCENT, ' m', { fill: true }),
                ds('Deckel', 'yL', n.maxDepth > 0 ? line(t, n.maxDepth) : [], '#ef5350', ' m', { dash: [2, 2] }),
                ds('Zufluss', 'yR', pts(t, n.totalInflow), '#66bb6a', ' m³/s'),
                ds('Überstau', 'yR', pts(t, n.flooding), '#ef5350', ' m³/s'),
            ],
        };
    }
    const l = linkSeries.find((x) => x.id === sel);
    if (l) {
        const t = l.times;
        return {
            key: `net:${l.id}`, title: `Haltung ${l.label} — Ganglinie`, accent: NET_ACCENT,
            yL: 'Q (m³/s)', yR: 'h (m) / v (m/s)', times: t,
            datasets: [
                ds('Durchfluss Q', 'yL', pts(t, l.flow), NET_ACCENT, ' m³/s', { fill: true }),
                ds('Fließtiefe', 'yR', pts(t, l.depth), '#ffb74d', ' m'),
                ds('Vollfüllung', 'yR', l.maxDepth > 0 ? line(t, l.maxDepth) : [], '#ef5350', ' m', { dash: [2, 2] }),
                ds('Geschwindigkeit', 'yR', pts(t, l.velocity), '#ce93d8', ' m/s', { dash: [5, 3] }),
            ],
        };
    }
    return null;
}

/**
 * Ganglinien-Spec für ein 2D-Wehr (useWeirResults-Serie).
 * @param {string} id  Wehr-ID
 * @param {Array} weirSeries  [{ id,label,hc,times[],Q[],HW[],TW[],… }]
 */
export function buildWeirChartSpec(id, weirSeries = []) {
    const w = weirSeries.find((x) => x.id === id);
    if (!w || !Array.isArray(w.times) || w.times.length === 0) return null;
    const t = w.times;
    return {
        key: `weir:${w.id}`, title: `Wehr ${w.label} — Ganglinie`, accent: WEIR_ACCENT,
        yL: 'Q (m³/s)', yR: 'Höhe (m)', times: t,
        datasets: [
            ds('Q', 'yL', pts(t, w.Q), WEIR_ACCENT, ' m³/s', { fill: true }),
            ds('Oberwasser', 'yR', pts(t, w.HW), '#ffb74d', ' m', { spanGaps: true }),
            ds('Unterwasser', 'yR', pts(t, w.TW), '#90caf9', ' m', { dash: [5, 3], spanGaps: true }),
            ds('Krone', 'yR', w.hc != null ? line(t, w.hc) : [], '#ef5350', ' m', { dash: [2, 2] }),
        ],
    };
}
