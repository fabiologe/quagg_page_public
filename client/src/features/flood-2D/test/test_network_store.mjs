// Test des Kanalnetz-Stores (G3-CRUD) + toModel-Roundtrip. Vue-Reaktivität + Pinia in Node.
//   node test_network_store.mjs

import { createPinia, setActivePinia } from 'pinia';
import { NetworkModel } from '../services/geometry/NetworkModel.js';
import { useNetworkStore } from '../stores/useNetworkStore.js';

setActivePinia(createPinia());
let fails = 0;
const ok = (c, m) => { if (c) console.log('  ✅ ' + m); else { console.error('  ❌ ' + m); fails++; } };

const net = useNetworkStore();

// setModel aus einem NetworkModel
const m = new NetworkModel();
m.addNode({ id: 'A', x: 0, y: 0, rim: 10, invert: 8, role: 'manhole' });
m.addNode({ id: 'B', x: 50, y: 0, rim: 9, invert: 7.5, role: 'outfall' });
m.addLink({ id: 'C', fromNodeId: 'A', toNodeId: 'B', conveyance: 'covered', profile: { shape: 'circular', height: 0.3 }, attrs: { kSt: 80 } });
net.setModel(m, { format: 'isybau-xml', warnings: ['w1'] });

console.log('1) setModel');
ok(net.nodes.length === 2 && net.links.length === 1, 'Knoten + Haltung übernommen');
ok(net.format === 'isybau-xml' && net.warnings[0] === 'w1', 'Format + Warnungen gesetzt');

console.log('2) CRUD');
net.select('A'); net.updateNode('A', { rim: 12, attrs: { diameter: 1.2 } });
ok(net.nodes.find(n => n.id === 'A').rim === 12, 'updateNode: rim');
ok(net.nodes.find(n => n.id === 'A').attrs.diameter === 1.2, 'updateNode: attrs.diameter (merge)');
net.updateLink('C', { conveyance: 'open', profile: { height: 0.5 } });
ok(net.links[0].conveyance === 'open' && net.links[0].profile.height === 0.5, 'updateLink: conveyance + profile merge');
ok(net.links[0].profile.shape === 'circular', 'updateLink: profile-merge behält shape');

console.log('3) toModel — Führung wirkt aufs SWMM-Kompilat');
ok(net.toModel().toSwmmStore().getAllEdges.length === 0, 'open-Haltung NICHT im SWMM-Export');
net.updateLink('C', { conveyance: 'covered' });
ok(net.toModel().toSwmmStore().getAllEdges.length === 1, 'covered-Haltung wieder im SWMM-Export');

console.log('4) add / delete');
const nid = net.addNode({ x: 25, y: 25, rim: 11, invert: 9, role: 'inlet' });
ok(net.nodes.some(n => n.id === nid && n.role === 'inlet'), 'addNode');
net.addLink({ id: 'C2', fromNodeId: nid, toNodeId: 'B' });
ok(net.links.some(l => l.id === 'C2'), 'addLink');
net.deleteNode('B');   // entfernt B + Haltungen C, C2
ok(!net.nodes.some(n => n.id === 'B'), 'deleteNode entfernt Knoten');
ok(!net.links.some(l => l.id === 'C' || l.id === 'C2'), 'deleteNode entfernt verbundene Haltungen');

console.log('5) toModel-Roundtrip');
const rt = net.toModel();
ok(rt.nodeList.length === net.nodes.length && rt.linkList.length === net.links.length, 'toModel spiegelt Store');
ok(rt.nodes.get(nid)?.role === 'inlet', 'toModel bewahrt Rolle');

console.log('6) cropOutside — Netz folgt dem Raster-Zuschnitt (2026-07-28)');
{
    net.setArrays([
        { id: 'IN1', role: 'manhole', x: 10, y: 10, rim: 10, invert: 8, attrs: {} },
        { id: 'IN2', role: 'manhole', x: 40, y: 40, rim: 10, invert: 8, attrs: {} },
        { id: 'OUTS', role: 'manhole', x: 500, y: 500, rim: 10, invert: 8, attrs: {} },
    ], [
        { id: 'LI',  fromNodeId: 'IN1', toNodeId: 'IN2',  conveyance: 'covered', points: null,
          profile: { shape: 'circular', height: 0.3, width: 0 }, attrs: {} },
        { id: 'LX',  fromNodeId: 'IN2', toNodeId: 'OUTS', conveyance: 'covered', points: null,
          profile: { shape: 'circular', height: 0.3, width: 0 }, attrs: {} },
    ]);
    net.select('OUTS');

    const inside = (x, y) => x >= 0 && x <= 100 && y >= 0 && y <= 100;
    const revBefore = net.revision;
    const removed = net.cropOutside(inside, 'Netz an Raster-Zuschnitt angepasst');
    ok(removed === 1, `1 Schacht außerhalb entfernt (${removed})`);
    ok(net.nodes.length === 2 && !net.nodes.some(n => n.id === 'OUTS'), 'OUTS gelöscht, Rest bleibt');
    ok(!net.links.some(l => l.id === 'LX'), 'hängende Haltung LX mit entfernt');
    ok(net.links.some(l => l.id === 'LI'), 'komplett innenliegende Haltung LI bleibt');
    ok(net.selectedId === null, 'Auswahl des gelöschten Schachts aufgehoben');
    ok(net.revision === revBefore + 1, 'genau EINE Revisions-Meldung (ein Renderer-Rebuild)');

    // Nichts außerhalb → No-Op ohne History-/Revisions-Eintrag
    const rev2 = net.revision;
    ok(net.cropOutside(inside) === 0, 'zweiter Zuschnitt findet nichts');
    ok(net.revision === rev2, 'No-Op meldet keine Revision');
}

console.log(fails === 0 ? '\n✅ NETWORK-STORE (G3-CRUD) BESTANDEN' : `\n❌ ${fails} Fehler`);
process.exit(fails === 0 ? 0 : 1);
