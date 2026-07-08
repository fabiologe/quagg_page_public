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

console.log(fails === 0 ? '\n✅ NETWORK-STORE (G3-CRUD) BESTANDEN' : `\n❌ ${fails} Fehler`);
process.exit(fails === 0 ? 0 : 1);
