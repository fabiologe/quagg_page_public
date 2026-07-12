// Unified Geometry Engine — G0/G1-Test.
//   1) Adapter-Round-Trip: geoStore/Sewer-Form → NetworkModel → toSwmmStore → SwmmBuilder(coupled).
//   2) Kopplungs-Erkennung (der Kern): Senke ÜBER einem Knoten → sink=true; Rücken → Warnung.
//   3) End-to-End: DEM-Delle über Manhole → geometrischer Kopplungs-Export → echter Docker-Lauf.
//
//   node test_geometry_engine.mjs [IMAGE]     # default: lisflood-fp:coupling
// Ohne Docker: 1+2 laufen, 3 SKIP.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NetworkModel } from '../services/geometry/NetworkModel.js';
import { fromSewerNodesEdges } from '../services/geometry/adapters.js';
import { classifyCell, detectCouplingNodes, worldToCell } from '../services/geometry/couplingDetector.js';
import { buildCoupledInputsFromModel } from '../services/swmm/couplingExport.js';

const IMAGE = process.argv[2] || 'lisflood-fp:coupling';
let fails = 0;
const ok  = (c, m) => { if (c) console.log('  ✅ ' + m); else { console.error('  ❌ ' + m); fails++; } };

// ── 1) Adapter-Round-Trip (Sewer/ISYBAU-Form; der Legacy-geoStore-Adapter wurde entfernt) ──
console.log('1) Adapter → NetworkModel → SwmmBuilder(coupled)');
{
    const model = fromSewerNodesEdges(
        [{ id: 'S1', x: 10, y: 10, z: 8.0, coverZ: 10.0, isManhole: true },
         { id: 'S2', x: 60, y: 10, z: 7.5, coverZ: 9.0, is_sink: true }],   // → outfall
        [{ id: 'L1', fromNodeId: 'S1', toNodeId: 'S2', length: 50,
           roughness: 77, profile: { type: 0, height: 0.4 } }]);
    ok(model.nodeList.length === 2, 'zwei Knoten übernommen');
    ok(model.linkList.length === 1, 'ein Link übernommen');
    ok(model.nodes.get('S2').role === 'outfall', 'is_sink → outfall-Rolle');
    ok(model.neighbors('S1').includes('S2'), 'Topologie S1→S2 erkannt');

    const store = model.toSwmmStore();
    ok(store.getAllNodes.length === 2 && store.getAllEdges.length === 1, 'toSwmmStore liefert Knoten+Kanten');
    // conveyance=open darf NICHT nach SWMM
    const m2 = fromSewerNodesEdges(
        [{ id: 'A', x: 0, y: 0, z: 5, coverZ: 7, isManhole: true },
         { id: 'B', x: 10, y: 0, z: 4, coverZ: 6, is_sink: true }],
        [{ id: 'G', fromNodeId: 'A', toNodeId: 'B', length: 10, kantenTyp: 'Gerinne', profile: { type: 5, height: 0.5, width: 1 } }]);
    ok(m2.linkList[0].conveyance === 'open', 'kantenTyp Gerinne → conveyance open (2D, nicht SWMM)');
    ok(m2.toSwmmStore().getAllEdges.length === 0, 'offenes Gerinne NICHT im SWMM-Export');
}

// ── 2) Kopplungs-Erkennung: Senke über Knoten (der harte Fall) ──────────────────
console.log('2) Coupling-Detektor: Senke/Rücken');
const N = 11, CS = 5.0;
const header = { ncols: N, nrows: N, xllcorner: 0, yllcorner: 0, cellsize: CS, NODATA_value: -9999 };
// flaches Gelände @10, EINE Delle (Senke) in der Mitte (Zelle 5,5 → Welt x=27.5,y=27.5 bottom-up)
const grid = new Float32Array(N * N).fill(10.0);
const sinkCol = 5, sinkRow = 5;
grid[sinkRow * N + sinkCol] = 8.0;                    // Delle 2 m tief
// ein Rücken (Buckel) bei Zelle (2,2)
grid[2 * N + 2] = 12.0;
{
    ok(classifyCell(grid, sinkCol, sinkRow, header) === 'sink', 'Delle wird als sink klassifiziert');
    ok(classifyCell(grid, 2, 2, header) === 'ridge', 'Buckel wird als ridge klassifiziert');

    // Weltkoord der Senkenzelle: col→x, row(top-down)→y
    const sinkX = header.xllcorner + (sinkCol + 0.5) * CS;
    const sinkY = header.yllcorner + (header.nrows - 1 - sinkRow + 0.5) * CS;
    const ridgeX = header.xllcorner + (2 + 0.5) * CS;
    const ridgeY = header.yllcorner + (header.nrows - 1 - 2 + 0.5) * CS;

    const model = new NetworkModel();
    model.addNode({ id: 'MH_sink',  x: sinkX,  y: sinkY,  invert: 6, rim: 10, role: 'manhole' });
    model.addNode({ id: 'MH_ridge', x: ridgeX, y: ridgeY, invert: 9, rim: 12, role: 'manhole' });

    const { couplingNodes, warnings } = detectCouplingNodes(model, { grid, header });
    const sinkNode  = couplingNodes.find(c => c.id === 'MH_sink');
    const ridgeNode = couplingNodes.find(c => c.id === 'MH_ridge');
    ok(sinkNode && sinkNode.sink === true && sinkNode.quality === 'sink',
       'Knoten in der Delle → sink=true (bleibt gespeist/eingestaut)');
    ok(ridgeNode && ridgeNode.quality === 'ridge', 'Knoten auf dem Rücken → quality=ridge');
    ok(warnings.some(w => w.includes('MH_ridge') && w.includes('Geländerücken')),
       'Warnung: Rücken-Knoten fängt kein Oberflächenwasser');
}

// ── 3) End-to-End: Senke über Manhole → gekoppelter Docker-Lauf ─────────────────
console.log('3) End-to-End (Docker)');
let hasDocker = false;
try { execFileSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }); hasDocker = true; }
catch { console.log('  ℹ️  Image nicht gefunden — Docker-Teil übersprungen.'); }

if (hasDocker) {
    // DEM 20x20 @10 mit zentraler Delle; Manhole in der Delle + Auslauf am Rand.
    const M = 20;
    const g = new Float32Array(M * M).fill(10.0);
    const dc = 10, dr = 10;                       // Dellenzelle
    for (let r = dr - 1; r <= dr + 1; r++) for (let c = dc - 1; c <= dc + 1; c++) g[r * M + c] = 8.5;
    g[dr * M + dc] = 8.0;
    const hdr = { ncols: M, nrows: M, xllcorner: 0, yllcorner: 0, cellsize: CS, NODATA_value: -9999 };
    const mhX = (dc + 0.5) * CS, mhY = (M - 1 - dr + 0.5) * CS;

    const model = new NetworkModel();
    // MH mit Basiszufluss (DWF) → staut ein → Überstau in die Delle darüber (1D→2D über
    // den geometrisch erkannten Senken-Kopplungspunkt). Die Delle hält das Wasser (res.max nass).
    model.addNode({ id: 'MH', x: mhX, y: mhY, invert: 6.0, rim: 8.0, role: 'manhole',
                    attrs: { constantInflow: 1500 /* l/s */ } });
    model.addNode({ id: 'OUT', x: 97.5, y: mhY, invert: 5.5, rim: 6.5, role: 'outfall' });
    model.addLink({ id: 'C', fromNodeId: 'MH', toNodeId: 'OUT', length: 60,
                    profile: { shape: 'circular', height: 0.5 }, attrs: { kSt: 80 } });

    const { files, warnings, couplingNodes } = buildCoupledInputsFromModel(
        model, { grid: g, header: hdr }, { dtCouple: 2.0, swmm: { durationHours: 0.2 } });
    ok(couplingNodes.find(c => c.id === 'MH')?.sink === true, 'MH als Senken-Kopplung erkannt');

    const jobRoot = '/home/fabio/quagg_page/backend/app/api/flood2D/data/regression_geomengine';
    rmSync(jobRoot, { recursive: true, force: true });
    const inpDir = join(jobRoot, 'inputs'); mkdirSync(inpDir, { recursive: true }); mkdirSync(join(jobRoot, 'results'));
    // terrain.asc aus dem gleichen Grid
    let asc = `ncols ${M}\nnrows ${M}\nxllcorner 0\nyllcorner 0\ncellsize ${CS}\nNODATA_value -9999\n`;
    for (let r = 0; r < M; r++) asc += Array.from({ length: M }, (_, c) => g[r * M + c].toFixed(2)).join(' ') + '\n';
    writeFileSync(join(inpDir, 'terrain.asc'), asc);
    writeFileSync(join(inpDir, 'flow.bci'), 'N 0 100 FREE\nS 0 100 FREE\nE 0 100 FREE\nW 0 100 FREE\n');
    writeFileSync(join(inpDir, 'run.par'),
        'DEMfile terrain.asc\nresroot res\ndirroot results\nsim_time 400\ninitial_tstep 1\n'
        + 'saveint 60\nmassint 30\nfpfric 0.03\nbcifile flow.bci\n'
        + 'couplingfile flow.coupling\nacceleration\n');
    for (const [n, c] of Object.entries(files)) writeFileSync(join(inpDir, n), c);

    let out = '';
    try { out = execFileSync('docker', ['run', '--rm', '-v', `${jobRoot}:/job`, IMAGE, '--job', '/job', '--heartbeat', '5'],
        { encoding: 'utf8', timeout: 300000 }); } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
    const done = out.split('\n').some(l => { try { return JSON.parse(l).event === 'done'; } catch { return false; } });
    ok(done, 'gekoppelter Lauf (Modell→Detektor→Export→Solver) sauber beendet');
    const maxf = join(jobRoot, 'results', 'res.max');
    ok(existsSync(maxf), 'res.max erzeugt');
    rmSync(jobRoot, { recursive: true, force: true });
    void warnings;
}

console.log(fails === 0 ? '\n✅ GEOMETRY-ENGINE G0/G1 BESTANDEN' : `\n❌ ${fails} Fehler`);
process.exit(fails === 0 ? 0 : 1);
