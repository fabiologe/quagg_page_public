// Node-Test für die erweiterte Netz-Validierung (E4): NetworkModel.validate() meldet
// Topologie- UND Hydraulik-Probleme (Sohle>Deckel, Gegengefälle, Nullänge, isolierte
// Knoten, Teilnetz ohne Auslass, Sonderbauwerk ohne abgehende Haltung).
//
//   node src/features/flood-2D/test/test_network_validate.mjs

import { NetworkModel } from '../services/geometry/NetworkModel.js';

let failed = 0;
const check = (cond, msg) => {
    console.log((cond ? '  ✅ ' : '  ❌ ') + msg);
    if (!cond) failed++;
};
const has = (issues, level, idPart, msgPart = '') =>
    issues.some(i => i.level === level && String(i.id).includes(idPart) && i.msg.includes(msgPart));

console.log('1) Sauberes Netz → keine Meldungen');
{
    const m = new NetworkModel();
    m.addNode({ id: 'J1', x: 0, y: 0, rim: 10, invert: 8 });
    m.addNode({ id: 'OUT', x: 100, y: 0, rim: 9, invert: 7, role: 'outfall' });
    m.addLink({ id: 'C1', fromNodeId: 'J1', toNodeId: 'OUT' });
    const iss = m.validate();
    check(iss.length === 0, `0 Meldungen (${iss.map(i => i.msg).join('; ') || 'ok'})`);
}

console.log('2) Fehler-Fälle');
{
    const m = new NetworkModel();
    m.addNode({ id: 'BAD', x: 0, y: 0, rim: 8, invert: 10 });          // Sohle über Deckel
    m.addNode({ id: 'P1', x: 50, y: 0, rim: 10, invert: 8, role: 'pump' }); // Pumpe ohne Abgang
    m.addLink({ id: 'DANGL', fromNodeId: 'BAD', toNodeId: 'GIBTSNICHT' });
    const iss = m.validate();
    check(has(iss, 'error', 'BAD', 'über dem Deckel'), 'Sohle über Deckel → error');
    check(has(iss, 'error', 'DANGL', 'Endknoten fehlt'), 'baumelnde Haltung → error');
    check(has(iss, 'error', 'P1', 'abgehende Haltung'), 'Pumpe ohne abgehende Haltung → error');
}

console.log('3) Warn-Fälle');
{
    const m = new NetworkModel();
    // Gegengefälle: invert 8 → 9 (bergauf), Kette ohne Outfall, plus isolierter Knoten
    m.addNode({ id: 'A', x: 0, y: 0, rim: 10, invert: 8 });
    m.addNode({ id: 'B', x: 60, y: 0, rim: 11, invert: 9 });
    m.addNode({ id: 'ISO', x: 500, y: 500, rim: 10, invert: 8 });
    m.addNode({ id: 'Z1', x: 0, y: 200, rim: 10, invert: 8 });
    m.addNode({ id: 'Z2', x: 0.1, y: 200, rim: 10, invert: 7.9 });
    m.addLink({ id: 'UP', fromNodeId: 'A', toNodeId: 'B' });
    m.addLink({ id: 'ZERO', fromNodeId: 'Z1', toNodeId: 'Z2' });
    const iss = m.validate();
    check(has(iss, 'warning', 'UP', 'Gegengefälle'), 'Gegengefälle → warning');
    check(has(iss, 'warning', 'ZERO', 'Nulllänge'), 'Nulllängen-Haltung → warning');
    check(has(iss, 'warning', 'ISO', 'isoliert'), 'isolierter Schacht → warning');
    check(iss.some(i => i.level === 'warning' && i.msg.includes('kein Auslass')),
        'Teilnetz ohne Outfall → warning');
}

console.log('4) z1/z2-Offsets überstimmen Knoten-Sohlen');
{
    const m = new NetworkModel();
    m.addNode({ id: 'A', x: 0, y: 0, rim: 10, invert: 8 });
    m.addNode({ id: 'OUT', x: 100, y: 0, rim: 9, invert: 8.5, role: 'outfall' }); // Knoten-invert bergauf…
    m.addLink({ id: 'C1', fromNodeId: 'A', toNodeId: 'OUT', attrs: { z1: 8.0, z2: 7.5 } }); // …aber Rohr fällt
    const iss = m.validate();
    check(!has(iss, 'warning', 'C1', 'Gegengefälle'), 'kein Gegengefälle-Fehlalarm bei fallenden z1/z2');
}

console.log('5) offene Gerinne (SGC) ohne Gegengefälle-Check');
{
    const m = new NetworkModel();
    m.addNode({ id: 'A', x: 0, y: 0, rim: 10, invert: 8 });
    m.addNode({ id: 'OUT', x: 100, y: 0, rim: 11, invert: 9, role: 'outfall' });
    m.addLink({ id: 'G1', fromNodeId: 'A', toNodeId: 'OUT', conveyance: 'open' });
    const iss = m.validate();
    check(!has(iss, 'warning', 'G1', 'Gegengefälle'), 'Gerinne (open) wird nicht als Gegengefälle gemeldet');
}

console.log('');
if (failed) { console.log(`❌ NETZ-VALIDIERUNG: ${failed} Checks fehlgeschlagen`); process.exit(1); }
console.log('✅ NETZ-VALIDIERUNG BESTANDEN');
