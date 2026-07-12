// Node-Test für den puren Kern von useNetworkResults (Phase V der 1D-Ergebnis-Pipeline):
// buildNetworkSeries (Anzeige-Serien), timeIndexAt (Frame↔Report-Step-Sync) und
// networkStateAtTime (3D-Füllgrad-Zustand). Läuft ohne Vue-Reaktivität/three.js.
//
//   node src/features/flood-2D/test/test_network_results.mjs

import { buildNetworkSeries, timeIndexAt, networkStateAtTime }
    from '../composables/viewer/useNetworkResults.js';

let failed = 0;
const check = (cond, msg) => {
    console.log((cond ? '  ✅ ' : '  ❌ ') + msg);
    if (!cond) failed++;
};

// Beispiel-Payload wie aus handler.py read_swmm_out (gekürzter Roundtrip-Fall)
const NET = {
    reportStep: 60, times: [60, 120, 180, 240],
    nodes: {
        J1: { type: 'junction', invert: 9.0, maxDepth: 2.0,
              depth: [0.2, 1.0, 2.0, 0.5], head: [9.2, 10.0, 11.0, 9.5],
              volume: [1, 5, 10, 2], totalInflow: [0.1, 0.5, 0.8, 0.2],
              flooding: [0, 0, 0.3, 0] },
        OUT: { type: 'outfall', invert: 8.0, maxDepth: 0,
               depth: [0, 0, 0, 0], head: [8, 8, 8, 8], volume: [0, 0, 0, 0],
               totalInflow: [0.05, 0.4, 0.7, 0.3], flooding: [0, 0, 0, 0] },
    },
    links: {
        C1: { type: 'conduit', maxDepth: 0.4, length: 100,
              flow: [0.05, 0.4, 0.7, 0.3], depth: [0.1, 0.3, 0.4, 0.2],
              velocity: [0.5, 1.5, 2.2, 1.0], volume: [1, 6, 12, 4],
              capacity: [0.2, 0.7, 1.0, 0.45] },
    },
    system: { inflow: [0.1, 0.5, 0.8, 0.2], flooding: [0, 0, 0.3, 0],
              outflow: [0.05, 0.4, 0.7, 0.3], storedVolume: [2, 11, 22, 6] },
};

console.log('1) timeIndexAt (Treppen-Halten, letzte Stufe <= t)');
check(timeIndexAt(NET.times, 0) === 0, 't=0 → Index 0 (vor erster Stufe klemmen)');
check(timeIndexAt(NET.times, 60) === 0, 't=60 → Index 0');
check(timeIndexAt(NET.times, 119) === 0, 't=119 → Index 0 (hält letzten Wert)');
check(timeIndexAt(NET.times, 120) === 1, 't=120 → Index 1');
check(timeIndexAt(NET.times, 9999) === 3, 't≫Ende → letzter Index');
check(timeIndexAt([], 60) === -1, 'leere Zeitachse → -1');

console.log('2) buildNetworkSeries');
const s = buildNetworkSeries(NET);
check(s.nodes.length === 2 && s.links.length === 1, `${s.nodes.length} Knoten, ${s.links.length} Links`);
const j1 = s.nodes.find(n => n.id === 'J1');
check(j1.depthMax === 2.0 && j1.floodingMax === 0.3, `J1 Maxima: depth ${j1.depthMax}, flooding ${j1.floodingMax}`);
check(j1.surcharged === true, 'J1 als eingestaut markiert (depth erreicht maxDepth)');
const c1 = s.links[0];
check(c1.Qmax === 0.7 && c1.capacityMax === 1.0, `C1 Qmax ${c1.Qmax}, capacityMax ${c1.capacityMax}`);
check(s.system.storedMax === 22, `System-Volumen-Max ${s.system.storedMax} m³`);
check(buildNetworkSeries(null).nodes.length === 0, 'null-Payload → leere Serien');

console.log('3) networkStateAtTime (Zustand fürs 3D-Netz)');
const st = networkStateAtTime(NET, 180);
check(st.index === 2 && st.time === 180, `t=180 → Index ${st.index}`);
const j1s = st.nodes.get('J1');
check(Math.abs(j1s.fill - 1.0) < 1e-9 && j1s.flooded === true,
    `J1: fill ${j1s.fill}, überstaut ${j1s.flooded}`);
const c1s = st.links.get('C1');
check(c1s.surcharged === true && c1s.flow === 0.7,
    `C1: Vollfüllung ${c1s.surcharged}, Q ${c1s.flow}`);
const st1 = networkStateAtTime(NET, 60);
check(st1.links.get('C1').surcharged === false && Math.abs(st1.links.get('C1').fill - 0.2) < 1e-9,
    'C1 bei t=60: teilgefüllt (fill 0.2), kein Überdruck');
check(st1.nodes.get('OUT').fill === 0, 'OUT (maxDepth 0): fill 0 statt Division durch 0');
check(networkStateAtTime(null, 60) === null, 'null-Payload → null');

console.log('4) Interpolation zwischen Report-Steps (Frame-für-Frame-Anzeige)');
// t=90 liegt genau zwischen Step 0 (t=60) und Step 1 (t=120) → Mittelwerte
const stM = networkStateAtTime(NET, 90);
check(Math.abs(stM.nodes.get('J1').depth - 0.6) < 1e-9,
    `J1 bei t=90: depth ${stM.nodes.get('J1').depth} (linear 0.2→1.0)`);
check(Math.abs(stM.links.get('C1').fill - 0.45) < 1e-9 && stM.links.get('C1').surcharged === false,
    `C1 bei t=90: fill ${stM.links.get('C1').fill} (linear 0.2→0.7)`);
check(Math.abs(stM.links.get('C1').flow - 0.225) < 1e-9, `C1 bei t=90: Q ${stM.links.get('C1').flow}`);
// jenseits des letzten Steps: letzten Wert halten (kein Überschwingen)
const stE = networkStateAtTime(NET, 9999);
check(Math.abs(stE.nodes.get('J1').depth - 0.5) < 1e-9, 'J1 nach Ende: hält letzten Wert');
// vor dem ersten Step: ersten Wert halten
const st0 = networkStateAtTime(NET, 0);
check(Math.abs(st0.links.get('C1').fill - 0.2) < 1e-9, 'C1 bei t=0: klemmt auf ersten Report-Step');

console.log('');
if (failed) { console.log(`❌ NETWORK-RESULTS: ${failed} Checks fehlgeschlagen`); process.exit(1); }
console.log('✅ NETWORK-RESULTS BESTANDEN');
