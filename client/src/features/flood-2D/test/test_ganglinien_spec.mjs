// Node-Test für ganglinienSpec.js — die deklarativen Chart-Beschreibungen der
// ausklinkbaren Ganglinien-Fenster (Result-Viewer, ⧉-Button in Netz-/Wehr-Panel).
//
//   node src/features/flood-2D/test/test_ganglinien_spec.mjs

import { buildNetworkChartSpec, buildWeirChartSpec, SYSTEM_ID }
    from '../components/viewer/ganglinienSpec.js';

let failed = 0;
const check = (cond, msg) => {
    console.log((cond ? '  ✅ ' : '  ❌ ') + msg);
    if (!cond) failed++;
};

const times = [60, 120, 180];
const series = {
    nodeSeries: [{ id: 'J1', label: 'J1', maxDepth: 2.0, times,
        depth: [0.2, 1.0, 0.5], totalInflow: [0.1, 0.5, 0.2], flooding: [0, 0.3, 0] }],
    linkSeries: [{ id: 'C1', label: 'C1', maxDepth: 0.4, times,
        flow: [0.05, 0.4, 0.3], depth: [0.1, 0.3, 0.2], velocity: [0.5, 2.2, 1.0] }],
    system: { times, inflow: [0.1, 0.5, 0.2], flooding: [0, 0.3, 0],
        outflow: [0.05, 0.4, 0.3], storedVolume: [2, 22, 6] },
};

console.log('1) Netz: System / Schacht / Haltung');
const sys = buildNetworkChartSpec(SYSTEM_ID, series);
check(sys?.key === `net:${SYSTEM_ID}` && sys.datasets.length === 4, 'System-Spec: 4 Datensätze');
check(sys.datasets[0].data[1].y === 22, 'Volumen-Serie korrekt gemappt (t=120 → 22 m³)');

const node = buildNetworkChartSpec('J1', series);
check(node?.title.includes('Schacht J1') && node.datasets.length === 4, 'Schacht-Spec mit 4 Datensätzen');
check(node.datasets[1].data.every(p => p.y === 2.0), 'Deckel-Linie konstant auf maxDepth');
check(node.datasets[0].fill === true, 'Wasserstand als Flächen-Serie');

const link = buildNetworkChartSpec('C1', series);
check(link?.title.includes('Haltung C1') && link.datasets[3].dash?.length === 2, 'Haltungs-Spec, v gestrichelt');
check(link.datasets[0].data[1].y === 0.4, 'Q-Serie korrekt (t=120 → 0.4 m³/s)');

check(buildNetworkChartSpec('GIBTS_NICHT', series) === null, 'unbekannte ID → null (Fenster fällt weg)');
check(buildNetworkChartSpec(SYSTEM_ID, { system: null }) === null, 'ohne System-Serie → null');

console.log('2) Wehr');
const weirs = [{ id: 'W1', label: 'Wehr 1', hc: 9.5, times,
    Q: [0, 1.2, 0.8], HW: [9.2, 9.8, 9.6], TW: [9.0, 9.3, 9.2] }];
const w = buildWeirChartSpec('W1', weirs);
check(w?.key === 'weir:W1' && w.datasets.length === 4, 'Wehr-Spec mit 4 Datensätzen');
check(w.datasets[3].data.every(p => p.y === 9.5), 'Kronen-Linie konstant auf hc');
check(w.datasets[1].spanGaps === true, 'Oberwasser mit spanGaps (trockene Frames)');
check(buildWeirChartSpec('W2', weirs) === null, 'unbekanntes Wehr → null');

console.log('');
if (failed) { console.log(`❌ GANGLINIEN-SPEC: ${failed} Checks fehlgeschlagen`); process.exit(1); }
console.log('✅ GANGLINIEN-SPEC BESTANDEN');
