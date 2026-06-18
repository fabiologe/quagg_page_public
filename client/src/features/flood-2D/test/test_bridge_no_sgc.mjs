// Tests: reine Brücke (mesh3d) OHNE SGC → Floodplain-Brücke (gepatchter Solver).
// LISFLOOD-FP 8.0.3 + quagg-Patch lässt EWeir_Bridge ohne Sub-Grid laufen
// (test_bridge_no_sgc.py). Würde die Pipeline SGC für Brücken erzeugen, triggerte das
// die fragile SGC-Wehr-Validierung → "Invalid bridge cell" → Absturz. Deshalb: KEIN SGC
// für Brücken, aber trotzdem auf 1 Zelle Tiefe kollabieren (saubere Öffnung).
// Ausführen: node src/features/flood-2D/test/test_bridge_no_sgc.mjs  (aus client/)
import { createLattice, addPier, latticeToCells } from '../utils/BridgeMeshLattice.js';
import { InputGenerator } from '../middleware/InputGenerator.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};

const mkHeader = (cs, ncols = 100, nrows = 100) => ({
    ncols, nrows, cellsize: cs, xllcorner: -cs / 2, yllcorner: -cs / 2, xll: 0, yll: 0,
});
// O-W-Brücke (Spannweite O-W → direction 'S'), 7 Reihen tief
const fp = [{ x: 1.5, y: 9.5 }, { x: 38.5, y: 9.5 }, { x: 38.5, y: 16.5 }, { x: 1.5, y: 16.5 }];

console.log('── Pipeline erzeugt KEIN SGC für eine reine Brücke ──');
{
    // generateInputFiles-Pfad: scenario ohne sgc → keine sgc.*.asc, keine SGC-Keywords.
    const gen = new InputGenerator();
    const h = mkHeader(1, 60, 60);
    const lat = createLattice(fp, { soffit: 12, deck: 14 });
    const bridge = { id: 'b', kind: 'mesh3d', footprint: fp, lattice: lat, directionMode: 'AUTO', Cd: 0.8, Tz: 1.5, z_sohle: 5, soffit: 12, deck: 14, width: 4 };
    const data = new Float32Array(60 * 60).fill(7);
    const files = gen.processScenario({
        engine: 'v8', grid: { header: h, data }, bridges: [bridge], weirs: [], sgc: null,
        bcis: [], boundaries: [], config: { simDuration: 100 },
    });
    const names = Object.keys(files);
    assert(!names.some(n => n.startsWith('sgc.')), 'keine sgc.*.asc-Dateien (Brücke ohne SGC)');
    assert(!!files['flow.weir'], 'flow.weir wird geschrieben');
    assert(!/SGCwidth|SGCbed|SGCbank/.test(files['run.par'] || ''), 'run.par OHNE SGC-Keywords');
    assert(/acceleration/.test(files['run.par'] || ''), 'run.par mit acceleration-Schema');
}

console.log('── Brücke kollabiert auch OHNE SGC auf 1 Zelle/Spannposition ──');
{
    const gen = new InputGenerator();
    const h = mkHeader(1, 60, 60);
    const lat = createLattice(fp, { soffit: 12, deck: 14 });
    const bridge = { id: 'b', kind: 'mesh3d', footprint: fp, lattice: lat, directionMode: 'AUTO', Cd: 0.8, Tz: 1.5, z_sohle: 5 };
    const allCells = latticeToCells(bridge, h, null);
    assert(allCells.length > 31, `Footprint ist mehrreihig (${allCells.length} Zellen)`);

    // generateWeirFile OHNE sgcWidthGrid → geometrischer Collapse (1 je Spalte).
    const out = gen.generateWeirFile([], [bridge], h, { engine: 'v8' /* kein sgcWidthGrid */ });
    const lines = out.trim().split('\n').slice(1);
    assert(lines.every(l => / SB /.test(l)), 'alle Zeilen mit SB-Tag (Orifice)');
    const cols = lines.map(l => Math.round(+l.trim().split(/\s+/)[0]));
    assert(new Set(cols).size === cols.length, 'genau eine Orifice-Zeile je Spalte (1 Zelle tief)');
    assert(lines.length < allCells.length, `kollabiert: ${lines.length} < ${allCells.length} Footprint-Zellen`);
}

console.log('── Pfeiler liefern weiterhin kein Orifice (ohne SGC) ──');
{
    const gen = new InputGenerator();
    const h = mkHeader(1, 60, 60);
    const lat = addPier(createLattice(fp, { soffit: 12, deck: 14 }), 0.5, 0.04);
    const bridge = { id: 'b', kind: 'mesh3d', footprint: fp, lattice: lat, directionMode: 'AUTO', Cd: 0.8, Tz: 1.5, z_sohle: 5 };
    const pierKeys = gen.collectBridgePierCells([bridge], h);
    assert(pierKeys.size > 0, `Pfeilerzellen vorhanden (${pierKeys.size})`);
    const out = gen.generateWeirFile([], [bridge], h, { engine: 'v8' });
    const cols = new Set(out.trim().split('\n').slice(1).map(l => Math.round(+l.trim().split(/\s+/)[0])));
    const pierCols = new Set([...pierKeys].map(k => +k.split(',')[0]));
    assert([...pierCols].every(c => !cols.has(c)), 'Pfeilerspalten liefern kein Orifice');
}

console.log(failures === 0 ? '\n✅ Alle No-SGC-Brücken-Tests bestanden.' : `\n❌ ${failures} Test(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
