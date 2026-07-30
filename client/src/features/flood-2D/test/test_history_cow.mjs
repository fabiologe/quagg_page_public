// Node-Test für useHistoryManager nach der Performance-Überarbeitung (2026-07-27):
//   - deepClean klont jetzt rekursiv statt per JSON-Roundtrip (~4,8× schneller)
//   - geo/net-Klone werden zwischen Snapshots GETEILT, solange der jeweilige Store
//     seit dem letzten Klon nicht als mutierend gemeldet wurde (Copy-on-Write)
// Genau dort lauert die Gefahr: geteilte Teilbäume dürfen sich beim Wiederherstellen
// nicht gegenseitig überschreiben. Der Test nagelt die Undo-/Redo-Semantik fest.
//
// Die Store-Actions melden ihre Mutationen SELBST an die History (notifyPreMutate) —
// der Test mutiert deshalb wie die Anwendung und ruft saveState nicht von Hand.
//
//   node src/features/flood-2D/test/test_history_cow.mjs

import { createPinia, setActivePinia } from 'pinia';
import { useHistoryManager } from '../composables/useHistoryManager.js';
import { useGeoStore } from '../stores/useGeoStore.js';
import { useNetworkStore } from '../stores/useNetworkStore.js';

let failed = 0;
const check = (cond, msg) => {
    console.log((cond ? '  ✅ ' : '  ❌ ') + msg);
    if (!cond) failed++;
};

setActivePinia(createPinia());
const geo = useGeoStore();
const net = useNetworkStore();
const hist = useHistoryManager();

// geoStore.buildings ist ein computed über `modifications` (Kompatibilitäts-Layer) —
// der echte, wiederherstellbare Zustand ist `modifications`.
const mkBuilding = (id) => ({ id, type: 'BUILDING', timestamp: 0, properties: { height: 8 },
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } });
const reset = () => { hist.clearHistory(); geo.modifications = []; net.setArrays([], []); };

console.log('1) Rekursiver Klon ersetzt den JSON-Roundtrip verlustfrei');
{
    reset();
    net.setArrays([{ id: 'S1', role: 'manhole', x: 1, y: 2, rim: 10, invert: 8,
                     attrs: { diameter: 1.2, verschachtelt: { tief: ['a', 1, true, null] } } }], []);
    net.updateNode('S1', { rim: 99 });     // legt selbst den Snapshot an
    hist.undo();
    const n = net.nodes[0];
    check(n.rim === 10, 'Zahlenwert korrekt zurückgesetzt');
    check(n.attrs.diameter === 1.2, 'verschachtelte Zahl erhalten');
    check(JSON.stringify(n.attrs.verschachtelt.tief) === '["a",1,true,null]',
        'gemischtes Array (String/Zahl/Bool/null) erhalten');
}

console.log('2) Klon ist entkoppelt — In-Place-Mutation trifft den Snapshot nicht');
{
    reset();
    net.setArrays([{ id: 'A', role: 'manhole', x: 0, y: 0, rim: 5, invert: 3, attrs: {} }], []);
    net.updateNode('A', { x: 777 });        // Object.assign mutiert das Knotenobjekt in place
    hist.undo();
    check(net.nodes[0].x === 0, 'x korrekt auf 0 zurückgesetzt');
}

console.log('3) Copy-on-Write: geteilte geo-Klone überstehen mehrfaches Undo');
{
    reset();
    geo.modifications = [mkBuilding('B1')];
    net.setArrays([{ id: 'N1', role: 'manhole', x: 0, y: 0, rim: 5, invert: 3, attrs: {} }], []);

    // Zwei aufeinanderfolgende NETZ-Mutationen: geo ändert sich dazwischen nicht → beide
    // Snapshots teilen sich denselben geo-Klon. Genau der Fall, den restoreShared absichert.
    net.updateNode('N1', { rim: 6 });   // Snapshot A (rim=5, geo=[B1])
    net.updateNode('N1', { rim: 7 });   // Snapshot B (rim=6, geo=[B1] — GETEILT mit A)
    check(net.nodes[0].rim === 7, 'Ausgangslage: rim=7');

    hist.undo();
    check(net.nodes[0].rim === 6, '1. Undo → rim=6');
    check(geo.modifications.length === 1, 'Gebäude nach 1. Undo unverändert vorhanden');

    // Der Store besitzt jetzt den wiederhergestellten geo-Teilbaum. In-place mutieren und
    // prüfen, dass der ANDERE Snapshot (der sich den Klon teilte) unversehrt bleibt.
    geo.modifications.push(mkBuilding('B_MUELL'));
    check(geo.modifications.length === 2, 'Zwischenstand: 2 Gebäude im Store');

    hist.undo();
    check(net.nodes[0].rim === 5, '2. Undo → rim=5');
    check(geo.modifications.length === 1,
        'geteilter geo-Snapshot war NICHT korrumpiert (Store-Mutation schlug nicht durch)');
    check(geo.modifications[0]?.id === 'B1', 'ursprüngliches Gebäude wiederhergestellt');
}

console.log('4) Redo stellt den Stand vor dem Undo wieder her');
{
    reset();
    net.setArrays([{ id: 'R', role: 'manhole', x: 0, y: 0, rim: 1, invert: 0, attrs: {} }], []);
    net.updateNode('R', { rim: 42 });
    hist.undo();
    check(net.nodes[0].rim === 1, 'Undo → 1');
    hist.redo();
    check(net.nodes[0].rim === 42, 'Redo → 42');
}

console.log('5) Store-übergreifend: geo-Edit nach net-Edit trennt sauber');
{
    reset();
    net.setArrays([{ id: 'X', role: 'manhole', x: 0, y: 0, rim: 1, invert: 0, attrs: {} }], []);
    net.updateNode('X', { rim: 2 });               // net-Snapshot
    geo.addModification('BUILDING', { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
                        { height: 8 });            // geo-Snapshot (eigener scope)

    check(geo.modifications.length === 1, 'Ausgangslage: 1 Gebäude');
    hist.undo();                                   // geo-Edit zurück
    check(geo.modifications.length === 0, 'Undo entfernt das Gebäude');
    check(net.nodes[0].rim === 2, 'Netz-Änderung bleibt (eigener Schritt)');

    hist.undo();                                   // net-Edit zurück
    check(net.nodes[0].rim === 1, '2. Undo nimmt die Netz-Änderung zurück');
}

console.log('6) Löschen/Anlegen von Netzelementen bleibt umkehrbar');
{
    reset();
    net.setArrays([
        { id: 'D1', role: 'manhole', x: 0, y: 0, rim: 1, invert: 0, attrs: {} },
        { id: 'D2', role: 'manhole', x: 9, y: 0, rim: 1, invert: 0, attrs: {} },
    ], [
        { id: 'DL', role: 'conduit', conveyance: 'covered', fromNodeId: 'D1', toNodeId: 'D2',
          points: null, profile: { shape: 'circular', height: 0.3, width: 0 }, attrs: {} },
    ]);
    net.deleteNode('D2');
    check(net.nodes.length === 1 && net.links.length === 0, 'Schacht + hängende Haltung entfernt');
    hist.undo();
    check(net.nodes.length === 2, 'Undo bringt den Schacht zurück');
    check(net.links.length === 1, 'Undo bringt auch die Haltung zurück');
    check(net.links[0].fromNodeId === 'D1' && net.links[0].toNodeId === 'D2',
        'Haltungs-Verknüpfungen intakt');
}

console.log(failed === 0 ? '\n✅ HISTORY (COW + Klon) BESTANDEN' : `\n❌ ${failed} FEHLER`);
process.exit(failed === 0 ? 0 : 1);
