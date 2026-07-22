// Tests: Maskierung auf volle Brückenfläche + Wehrkrone ausgeweitet (Durchlässe
// bewusst ausgenommen, die bekommen stattdessen die Jet-Überlagerung, s. weirJetFlow.js).
// Ausführen: node src/features/flood-2D/test/test_bridge_weir_mask.mjs   (aus client/)
import { createLattice, addPier, collectPierCells, collectBridgeCells } from '../utils/BridgeMeshLattice.js';
import { collectWeirCrestCells } from '../utils/weirGeometry.js';
import { buildJetGeometry } from '../utils/weirJetFlow.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};

const mkHeader = (cs, ncols = 60, nrows = 60) => ({
    ncols, nrows, cellsize: cs, xllcorner: 0, yllcorner: 0, xll: 0, yll: 0,
});

// gleiche Logik wie weirCacheKey() in ResultMap3D.vue — hier dupliziert, um sie
// isoliert (ohne Vue) gegen die Stale-Cache-Falle zu testen.
const weirCacheKey = (weirs) => weirs.map(w => `${w.id}${w.orifice ? '1' : '0'}`).join(',');

console.log('── collectBridgeCells: pfeilerlose Brücke (Regressionsfall) ──');
{
    const fp = [{ x: 4.6, y: 9.0 }, { x: 15.4, y: 9.0 }, { x: 15.4, y: 13.0 }, { x: 4.6, y: 13.0 }];
    const h = mkHeader(1);
    const lattice = createLattice(fp, { soffit: 12, deck: 14 });
    const bridge = { id: 'b0', kind: 'mesh3d', poly: fp, lattice, directionMode: 'AUTO', Cd: 0.8, Tz: 1.5 };

    const piers = collectPierCells([bridge], h);
    const full = collectBridgeCells([bridge], h);
    assert(piers.size === 0, `collectPierCells liefert heute fälschlich leere Menge für pfeilerlose Brücke (${piers.size})`);
    assert(full.size > 0, `collectBridgeCells deckt die volle Deck-Fläche ab (${full.size} Zellen)`);
    assert(full.size >= 40, `Plausible Zellzahl für ~10.8×4m-Footprint bei cs=1 (${full.size})`);
}

console.log('── collectBridgeCells ⊇ collectPierCells bei Brücke MIT Pfeilern ──');
{
    const fp = [{ x: 4.6, y: 9.0 }, { x: 15.4, y: 9.0 }, { x: 15.4, y: 13.0 }, { x: 4.6, y: 13.0 }];
    const h = mkHeader(1);
    let lattice = createLattice(fp, { soffit: 12, deck: 14 });
    lattice = addPier(lattice, 0.3, 0.03);
    lattice = addPier(lattice, 0.7, 0.03);
    const bridge = { id: 'b1', kind: 'mesh3d', poly: fp, lattice, directionMode: 'AUTO', Cd: 0.8, Tz: 1.5 };

    const piers = collectPierCells([bridge], h);
    const full = collectBridgeCells([bridge], h);
    assert(piers.size > 0, `Pfeilerzellen vorhanden (${piers.size})`);
    let allContained = true;
    for (const k of piers) if (!full.has(k)) allContained = false;
    assert(allContained, 'jede Pfeilerzelle ist auch in collectBridgeCells enthalten (Obermenge)');
    assert(full.size > piers.size, `Brückenfläche > reine Pfeilerfläche (${full.size} > ${piers.size})`);
}

console.log('── collectWeirCrestCells: Durchlass ausgeschlossen, Krone drin ──');
{
    const h = mkHeader(1, 20, 20);
    const weirs = [
        { id: 'w_l1_5_5_S', lineId: 'l1', x: 5, y: 5, direction: 'S', Cd: 1.704, hc: 3, m: 0.667, w: 1, orifice: null },
        { id: 'w_l1_6_5_S', lineId: 'l1', x: 6, y: 5, direction: 'S', Cd: 1.704, hc: 3, m: 0.667, w: 1, orifice: null },
        { id: 'w_l1_7_5_S', lineId: 'l1', x: 7, y: 5, direction: 'S', Cd: 1.704, hc: 3, m: 0.667, w: 1, orifice: { soffit: 2, width: 1, height: 1, type: 'round' } },
    ];
    const crest = collectWeirCrestCells(weirs, h);
    assert(crest.size === 2, `2 Kronenzellen erkannt (${crest.size})`);
    assert(crest.has('5,5') && crest.has('6,5'), 'beide Kronenzellen (5,5)/(6,5) enthalten');
    assert(!crest.has('7,5'), 'Durchlass-Zelle (7,5) NICHT in der Kronen-Maske');
}

console.log('── Cache-Key: orifice-Änderung an gleicher Zellen-id erzeugt anderen Key ──');
{
    const weirsA = [{ id: 'w_l1_5_5_S', orifice: null }];
    const weirsB = [{ id: 'w_l1_5_5_S', orifice: { soffit: 2, width: 1, height: 1, type: 'round' } }];
    assert(weirCacheKey(weirsA) !== weirCacheKey(weirsB), 'gleiche id, unterschiedliche orifice-Belegung → unterschiedlicher Cache-Key');
}

console.log('── Out-of-Bounds-Zelle wird still verworfen ──');
{
    const h = mkHeader(1, 20, 20);
    const weirs = [{ id: 'w_oob', x: 1000, y: 1000, direction: 'S', orifice: null }];
    const crest = collectWeirCrestCells(weirs, h);
    assert(crest.size === 0, 'außerhalb des Rasters liegende Wehrzelle wird verworfen, kein Crash');
}

console.log('── Komplementarität: Kronen-Maske und Durchlass-Jet-Geometrie sind disjunkt und vollständig ──');
{
    const h = mkHeader(1, 20, 20);
    const weirs = [
        { id: 'w_l1_5_5_S', lineId: 'l1', x: 5, y: 5, direction: 'S', Cd: 1.704, hc: 3, m: 0.667, w: 1, orifice: null },
        { id: 'w_l1_6_5_S', lineId: 'l1', x: 6, y: 5, direction: 'S', Cd: 1.704, hc: 3, m: 0.667, w: 1, orifice: null },
        { id: 'w_l1_7_5_S', lineId: 'l1', x: 7, y: 5, direction: 'S', Cd: 1.704, hc: 3, m: 0.667, w: 1, orifice: { soffit: 2, width: 1, height: 1, type: 'round' } },
    ];
    const crest = collectWeirCrestCells(weirs, h);
    const jets = buildJetGeometry(weirs, h);
    assert(jets.length === 1, `genau 1 Durchlass-Geometrie erzeugt (${jets.length})`);
    assert(crest.size + jets.length === weirs.length, `Krone (${crest.size}) + Durchlässe (${jets.length}) decken alle ${weirs.length} Wehrzellen ab, ohne Überlappung`);
}

console.log(failures === 0 ? '\n✅ Alle Brücke/Wehr-Maskierungs-Tests bestanden.' : `\n❌ ${failures} Test(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
