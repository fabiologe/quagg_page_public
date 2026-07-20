// Node-Test für utils/sectionNetwork.js — Kanalnetz-Durchstoßpunkte im Querschnitt
// (Haltungs-Kreuzungen mit interpolierter Sohlhöhe, Schacht-Projektion, DN-Normalisierung).
//
//   node src/features/flood-2D/test/test_section_network.mjs

import { findSectionNetworkCrossings, normalizeDiameter } from '../utils/sectionNetwork.js';

let failed = 0;
const check = (cond, msg) => {
    console.log((cond ? '  ✅ ' : '  ❌ ') + msg);
    if (!cond) failed++;
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const nodes = [
    { id: 'MH1', x: 0, y: 0, rim: 10.0, invert: 8.0, role: 'manhole', attrs: { diameter: 1.0 } },
    { id: 'MH2', x: 20, y: 0, rim: 9.5, invert: 7.5, role: 'manhole', attrs: { diameter: 1.0 } },
];
const links = [
    { id: 'C1', fromNodeId: 'MH1', toNodeId: 'MH2',
      profile: { shape: 'circular', height: 0.4 }, conveyance: 'covered', attrs: {} },
];

console.log('1) Haltungs-Kreuzung mit interpolierter Sohle');
{
    // Schnitt quer über das Rohr bei x=10 (Rohrmitte): Sohle 8.0→7.5 → 7.75 bei 50 %
    const out = findSectionNetworkCrossings(10, -5, 10, 5, nodes, links);
    const pipe = out.find(c => c.kind === 'pipe');
    check(!!pipe && pipe.id === 'C1', 'Rohr C1 gekreuzt');
    check(near(pipe.distance, 5), `Distanz auf dem Schnitt = 5 m (ist ${pipe.distance})`);
    check(near(pipe.invert, 7.75), `Sohle linear interpoliert 7.75 (ist ${pipe.invert})`);
    check(near(pipe.diameter, 0.4), 'Profilhöhe 0.4 m übernommen');
}

console.log('2) attrs.z1/z2 gewinnen vor node.invert');
{
    const l2 = [{ ...links[0], attrs: { z1: 9.0, z2: 8.0 } }];
    const out = findSectionNetworkCrossings(10, -5, 10, 5, nodes, l2);
    check(near(out.find(c => c.kind === 'pipe').invert, 8.5), 'Sohle aus z1/z2 (8.5 statt 7.75)');
}

console.log('3) Polylinien-Haltung (points mit z)');
{
    const l3 = [{ id: 'P1', fromNodeId: 'MH1', toNodeId: 'MH2', profile: { height: 0.3 },
        points: [{ x: 0, y: 0, z: 8.0 }, { x: 10, y: 10, z: 7.8 }, { x: 20, y: 0, z: 7.6 }] }];
    // Schnitt kreuzt das ZWEITE Segment (10,10)→(20,0) bei x=15,y=5 → u=0.5 → z=7.7
    const out = findSectionNetworkCrossings(15, -5, 15, 15, nodes, l3);
    const p = out.find(c => c.kind === 'pipe');
    check(!!p && near(p.invert, 7.7), `Polylinien-Segment interpoliert (z=7.7, ist ${p?.invert})`);
}

console.log('4) DN-Normalisierung (ISYBAU mm-Falle)');
check(near(normalizeDiameter(600), 0.6), 'DN600 (mm) → 0.6 m');
check(near(normalizeDiameter(0.3), 0.3), '0.3 m bleibt 0.3 m');
check(near(normalizeDiameter(0), 0.3), 'kaputt/0 → Default 0.3 m');

console.log('5) Schacht-Projektion');
{
    // MH2 liegt 0.4 m neben dem Schnitt (innerhalb Toleranz) → als manhole gelistet
    const out = findSectionNetworkCrossings(15, -5, 25, -5 + 0, nodes, links);
    check(out.every(c => c.kind !== 'manhole'), 'Schnitt weit weg → kein Schacht');
    const out2 = findSectionNetworkCrossings(15, 0.4, 25, 0.4, nodes, links);
    const mh = out2.find(c => c.kind === 'manhole');
    check(!!mh && mh.id === 'MH2' && mh.rim === 9.5, 'MH2 nahe am Schnitt → projiziert (rim 9.5)');
    check(near(mh.distance, 5), `Schacht-Distanz 5 m (ist ${mh?.distance})`);
}

console.log('6) Sonderfälle');
check(findSectionNetworkCrossings(0, 0, 0, 0, nodes, links).length === 0, 'degenerierter Schnitt → leer');
{
    // Schnitt PARALLEL zum Rohr (kein Schnittpunkt)
    const out = findSectionNetworkCrossings(0, 2, 20, 2, nodes, links);
    check(!out.some(c => c.kind === 'pipe'), 'parallele Linie kreuzt das Rohr nicht');
}
{
    // dangling Link (Zielknoten fehlt) → übersprungen statt Crash
    const out = findSectionNetworkCrossings(10, -5, 10, 5, nodes,
        [{ id: 'X', fromNodeId: 'MH1', toNodeId: 'FEHLT', profile: { height: 0.3 } }]);
    check(out.every(c => c.kind !== 'pipe'), 'dangling Link übersprungen');
}

console.log('');
if (failed) { console.log(`❌ SECTION-NETWORK: ${failed} Checks fehlgeschlagen`); process.exit(1); }
console.log('✅ SECTION-NETWORK BESTANDEN');
