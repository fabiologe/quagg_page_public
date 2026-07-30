// Node-Test für den Revisions-Vertrag des geoStore (Performance-Audit 2026-07-27).
//
// Die Renderer hängen nicht mehr an deep-Watchern über die Daten-Arrays (Vues
// Deep-Traversal kostete bei 2000 Gebäuden ~228 ms pro Änderung), sondern an
// geoStore.revisions. Damit steht und fällt alles mit EINER Regel:
//
//     Jede Aktion, die eine Sammlung ändert, MUSS touch(<gruppe>) rufen.
//
// Wird das bei einer neuen Aktion vergessen, aktualisiert sich die 3D-Ansicht still
// nicht mehr — ein Fehler, den man leicht übersieht. Dieser Test prüft deshalb jeden
// Mutator einzeln. Er deckt zusätzlich den Fall ab, an dem die SGC-Zellvorschau vorher
// scheiterte: push() ohne Ersetzen des Arrays (Array-Identität bleibt gleich, ein
// flacher Watcher feuert nicht).
//
//   node src/features/flood-2D/test/test_geostore_revisions.mjs

import { createPinia, setActivePinia } from 'pinia';
import { useGeoStore } from '../stores/useGeoStore.js';

let failed = 0;
const check = (cond, msg) => {
    console.log((cond ? '  ✅ ' : '  ❌ ') + msg);
    if (!cond) failed++;
};

setActivePinia(createPinia());
const geo = useGeoStore();

const snap = () => ({ ...geo.revisions });
/** Führt `fn` aus und prüft, dass GENAU die erwartete Gruppe hochgezählt wurde. */
function expectBump(label, kind, fn) {
    const before = snap();
    fn();
    const after = snap();
    const bumped = Object.keys(after).filter(k => after[k] !== before[k]);
    const ok = bumped.includes(kind);
    check(ok, `${label} → meldet '${kind}'${ok ? '' : ` (gemeldet: ${bumped.join(',') || 'NICHTS'})`}`);
}

const poly = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };

console.log('1) Gebäude / Modifikationen');
{
    expectBump('addModification', 'mod', () => geo.addModification('BUILDING', poly, { height: 8 }));
    expectBump('addBuilding (Legacy-Wrapper)', 'mod',
        () => geo.addBuilding({ geometry: poly, properties: { height: 5 } }));

    const id = geo.modifications[0].id;
    expectBump('updateFeatureProperty (In-Place!)', 'mod',
        () => geo.updateFeatureProperty(id, 'height', 42));
    check(geo.getFeatureById(id).properties.height === 42, 'Eigenschaft tatsächlich geändert');

    expectBump('clearModifications', 'mod', () => geo.clearModifications());
}

console.log('2) Grenzen');
{
    expectBump('addBoundary', 'boundary',
        () => geo.addBoundary({ type: 'Feature', id: 'BD1', properties: {}, geometry: poly }));
    expectBump('removeBoundary', 'boundary', () => geo.removeBoundary('BD1'));

    // Kein Treffer → keine Änderung → auch kein Zähler-Sprung (sonst würde jeder
    // Fehlversuch unnötige Rebuilds auslösen).
    const before = snap();
    geo.removeBoundary('gibt-es-nicht');
    check(snap().boundary === before.boundary, 'removeBoundary ohne Treffer meldet NICHT');
}

console.log('3) Wehre');
{
    const line = { id: 'W1', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] };
    expectBump('addWeirLine', 'weir', () => geo.addWeirLine(line, []));
    expectBump('updateWeirLine', 'weir', () => geo.updateWeirLine('W1', { crest: 2 }, []));
    expectBump('removeWeirLine', 'weir', () => geo.removeWeirLine('W1'));
}

console.log('4) Brücken');
{
    expectBump('addBridge3D', 'bridge', () => geo.addBridge3D({
        id: 'BR1', kind: 'mesh3d', footprint: [{ x: 0, y: 0 }], lattice: null, cells: [],
    }));
    expectBump('updateBridge3D', 'bridge', () => geo.updateBridge3D('BR1', { Cd: 0.9 }));
    expectBump('addBridgeBatch', 'bridge', () => geo.addBridgeBatch([
        { lineId: 'BR2', x: 0, y: 0, col: 0, row: 0, z: 1, direction: 'N' },
    ]));
    expectBump('removeBridge', 'bridge', () => geo.removeBridge('BR1'));

    // Leerer Batch ändert nichts → darf nicht melden
    const before = snap();
    geo.addBridgeBatch([]);
    check(snap().bridge === before.bridge, 'addBridgeBatch([]) meldet NICHT');
}

console.log('5) SGC-Kanäle — der Fall, an dem die Zellvorschau vorher scheiterte');
{
    const ch = { id: 'C1', polyline: [{ x: 0, y: 0, terrainZ: 0 }, { x: 9, y: 0, terrainZ: 0 }],
                 shape: 'rect', bedWidth: 2, bedMode: 'depth', bedDepth: 1, sideSlope: 0, manningN: 0.03 };

    // addSgcChannel PUSHT nur — die Array-Identität bleibt gleich. Genau daran hat ein
    // flacher Watcher vorher nicht gefeuert; der Zähler ist davon unabhängig.
    const vorher = geo.sgcChannels;
    expectBump('addSgcChannel (push, gleiche Array-Identität)', 'sgc', () => geo.addSgcChannel(ch));
    check(geo.sgcChannels === vorher, 'Array-Identität ist tatsächlich unverändert (Push, kein Ersetzen)');

    expectBump('updateSgcChannel', 'sgc', () => geo.updateSgcChannel('C1', { bedWidth: 4 }));
    check(geo.sgcChannels[0].bedWidth === 4, 'Kanal tatsächlich geändert');
    expectBump('removeSgcChannel', 'sgc', () => geo.removeSgcChannel('C1'));
}

console.log('6) touch() ohne Argument meldet ALLES (Undo-Restore)');
{
    const before = snap();
    geo.touch();
    const after = snap();
    const alle = Object.keys(before).every(k => after[k] === before[k] + 1);
    check(alle, 'jede Gruppe genau einmal hochgezählt');
}

console.log('7) revisions ist als Ganzes beobachtbar (neue Referenz je Meldung)');
{
    const ref1 = geo.revisions;
    geo.touch('mod');
    check(geo.revisions !== ref1, 'Objekt-Referenz wechselt → auch flache Watcher feuern');
}

console.log(failed === 0 ? '\n✅ GEOSTORE-REVISIONEN BESTANDEN' : `\n❌ ${failed} FEHLER`);
process.exit(failed === 0 ? 0 : 1);
