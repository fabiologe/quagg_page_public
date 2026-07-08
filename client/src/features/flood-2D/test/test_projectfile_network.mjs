// Roundtrip-Test: Kanalnetz (useNetworkStore) wird in der .flood2d-Projektdatei
// mitgespeichert und beim Laden deterministisch wiederhergestellt — damit ein einmal
// gebautes gekoppeltes 1D/2D-Testszenario nicht jedes Mal neu aufgebaut werden muss.
//   node test_projectfile_network.mjs

import { createPinia, setActivePinia } from 'pinia';
import { useGeoStore } from '../stores/useGeoStore.js';
import { useNetworkStore } from '../stores/useNetworkStore.js';
import { saveProject, loadProject } from '../composables/useProjectFile.js';

setActivePinia(createPinia());
let fails = 0;
const ok = (c, m) => { if (c) console.log('  ✅ ' + m); else { console.error('  ❌ ' + m); fails++; } };

const geo = useGeoStore();
const net = useNetworkStore();

// Minimal-Terrain (Pflicht fürs Speichern)
geo.importTerrain({
    ncols: 4, nrows: 4, cellsize: 5, xllcorner: 0, yllcorner: 0,
    minZ: 10, maxZ: 10, gridData: new Float32Array(16).fill(10),
});

// Kanalnetz wie nach ISYBAU-Import + Editor-Anpassung
net.setArrays(
    [
        { id: 'MH1', role: 'manhole', x: 12.5, y: 7.5, rim: 10.0, invert: 8.0, attrs: { Cw: 1.5 } },
        { id: 'OUT1', role: 'outfall', x: 2.5, y: 2.5, rim: 10.0, invert: 7.5, attrs: {} },
    ],
    [
        { id: 'C1', role: 'conduit', conveyance: 'covered', fromNodeId: 'MH1', toNodeId: 'OUT1',
          points: [{ x: 12.5, y: 7.5, z: 8.0 }, { x: 2.5, y: 2.5, z: 7.5 }],
          profile: { shape: 'circular', height: 0.4, width: 0 }, attrs: { kSt: 80 } },
    ],
);
net.format = 'isybau-xml';

console.log('1) Speichern mit Netz');
const blob = await saveProject();
ok(blob && blob.size > 0, `Projekt gespeichert (${blob.size} B)`);
const buf = await blob.arrayBuffer();

console.log('2) Laden in leere Session');
net.clear();
ok(!net.hasNetwork, 'Store vor dem Laden leer');
await loadProject(buf);
ok(net.nodes.length === 2 && net.links.length === 1, 'Netz wiederhergestellt (2 Knoten, 1 Haltung)');
const mh = net.nodes.find(n => n.id === 'MH1');
ok(mh?.role === 'manhole' && mh?.rim === 10.0 && mh?.attrs?.Cw === 1.5, 'Knoten-Rolle/rim/attrs überleben');
const c1 = net.links[0];
ok(c1?.profile?.height === 0.4 && c1?.attrs?.kSt === 80 && c1?.points?.length === 2, 'Haltungs-Profil/attrs/points überleben');
ok(net.format === 'isybau-xml', 'Import-Format überlebt');
ok(net.toModel().linkList.length === 1, 'toModel() baut aus geladenen Arrays (Kopplungs-Export-Pfad)');

console.log('3) Projekt OHNE Netz leert den Store');
const blobLeer = await (async () => { net.clear(); return saveProject(); })();
net.setArrays([{ id: 'ALT', role: 'manhole', x: 0, y: 0, rim: 0, invert: 0, attrs: {} }], []);
await loadProject(await blobLeer.arrayBuffer());
ok(!net.hasNetwork, 'Store nach Laden eines netzlosen Projekts leer (kein Session-Leak)');

console.log(fails ? `\n❌ PROJEKTDATEI-NETZ: ${fails} Fehler` : '\n✅ PROJEKTDATEI-NETZ BESTANDEN');
process.exit(fails ? 1 : 0);
