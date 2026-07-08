// End-to-End-Test der Client-Kopplungs-Pipeline:
//   Sewer-Netz -> SwmmBuilder(coupled) -> network.inp + flow.coupling
//   -> im ECHTEN Docker-Image (lisflood-fp:coupling) laufen lassen
//   -> prüfen, dass der SWMM-Überstau im 2D ankommt.
//
// Schliesst die Schleife Client -> Backend: die im Browser generierten Dateien treiben
// einen gekoppelten High-End-Lauf.
//
//   node test_coupling_export.mjs [IMAGE]     # default: lisflood-fp:coupling
//
// Braucht Docker + das gebaute Image. Ohne Docker: SKIP (Exit 0) nach Datei-Sanity-Check.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCoupledInputs, selectCouplingNodes } from '../services/swmm/couplingExport.js';

const IMAGE = process.argv[2] || 'lisflood-fp:coupling';

// ── kleines Kanalnetz: J1 (Schacht, Basiszufluss) -> C1 -> OUT (Auslauf) ─────────
const NODE_X = 52.5, NODE_Y = 52.5, GROUND = 10.0;
const nodes = [
    { id: 'J1', x: NODE_X, y: NODE_Y, z: 8.0, depth: 2.0, coverZ: GROUND,
      isManhole: true, type: 'Schacht', constantInflow: 2000 /* l/s -> überlastet C1 */,
      coupling: true },
    { id: 'OUT', x: 57.5, y: NODE_Y, z: 7.5, depth: 1.0, coverZ: 8.5,
      isManhole: false, type: 'Auslaufbauwerk', is_sink: true },
];
const edges = [
    { id: 'C1', fromNodeId: 'J1', toNodeId: 'OUT', length: 50, roughness: 80 /* kSt */,
      profile: { type: 0, height: 0.3, width: 0 } },
];
const store = { getAllNodes: nodes, getAllEdges: edges, edges, areas: [] };

const couplingNodes = selectCouplingNodes(nodes);
const { files, warnings } = buildCoupledInputs(store, couplingNodes, { dtCouple: 2.0, swmm: { durationHours: 0.2 } });

// ── Sanity-Checks der generierten Dateien ───────────────────────────────────────
function assert(cond, msg) { if (!cond) { console.error('❌ ' + msg); process.exitCode = 1; throw new Error(msg); } }
const inp = files['network.inp'];
assert(inp.includes('FLOW_ROUTING         DYNWAVE'), 'network.inp: DYNWAVE fehlt');
assert(inp.includes('ALLOW_PONDING        NO'), 'coupled: ALLOW_PONDING muss NO sein (sonst kein Überstau ins 2D)');
assert(!inp.includes('[SUBCATCHMENTS]'), 'coupled: [SUBCATCHMENTS] darf NICHT vorkommen (Abfluss kommt aus 2D)');
assert(inp.includes('[JUNCTIONS]') && inp.includes('J1'), 'network.inp: J1 fehlt');
assert(inp.includes('[OUTFALLS]') && inp.includes('OUT'), 'network.inp: Auslauf fehlt');
assert(inp.includes('[CONDUITS]') && inp.includes('C1'), 'network.inp: Conduit fehlt');
const coup = files['flow.coupling'];
assert(/^network\.inp 2\b/.test(coup.split('\n')[0]), 'flow.coupling Kopfzeile falsch: ' + coup.split('\n')[0]);
assert(coup.includes('J1'), 'flow.coupling: Kopplungsschacht J1 fehlt');
console.log('✅ Datei-Sanity-Checks bestanden (network.inp coupled + flow.coupling).');
if (warnings.length) console.log('   SwmmBuilder-Warnungen:', warnings.length);

// ── Docker vorhanden? ───────────────────────────────────────────────────────────
let hasDocker = false;
try { execFileSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }); hasDocker = true; }
catch { console.log(`ℹ️  Image ${IMAGE} nicht gefunden — überspringe Docker-Lauf (Datei-Checks ok).`); }

if (hasDocker) {
    // Job-Dir unter backend/data (Snap-Docker mountet keine /tmp-Host-Pfade zuverlässig).
    const jobRoot = '/home/fabio/quagg_page/backend/app/api/flood2D/data/regression_coupling_export';
    rmSync(jobRoot, { recursive: true, force: true });
    const inpDir = join(jobRoot, 'inputs');
    mkdirSync(inpDir, { recursive: true });
    mkdirSync(join(jobRoot, 'results'), { recursive: true });

    // flaches 2D-Raster 20x20 @ 10 m, freie Ränder
    const N = 20, CS = 5.0;
    const row = Array(N).fill(GROUND.toFixed(2)).join(' ');
    writeFileSync(join(inpDir, 'terrain.asc'),
        `ncols ${N}\nnrows ${N}\nxllcorner 0\nyllcorner 0\ncellsize ${CS}\nNODATA_value -9999\n`
        + Array(N).fill(row).join('\n') + '\n');
    writeFileSync(join(inpDir, 'flow.bci'), 'N 0 100 FREE\nS 0 100 FREE\nE 0 100 FREE\nW 0 100 FREE\n');
    writeFileSync(join(inpDir, 'run.par'),
        'DEMfile terrain.asc\nresroot res\ndirroot results\n'
        + 'sim_time 600\ninitial_tstep 1\nsaveint 60\nmassint 30\n'
        + 'fpfric 0.03\nbcifile flow.bci\ncouplingfile flow.coupling\nacceleration\n');
    for (const [name, content] of Object.entries(files)) writeFileSync(join(inpDir, name), content);

    console.log(`▶  docker run ${IMAGE} (gekoppelter Lauf aus Client-Dateien) …`);
    let out = '';
    try {
        out = execFileSync('docker', ['run', '--rm', '-v', `${jobRoot}:/job`, IMAGE,
            '--job', '/job', '--heartbeat', '5'], { encoding: 'utf8', timeout: 300000 });
    } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }

    const done = out.split('\n').some(l => { try { return JSON.parse(l).event === 'done'; } catch { return false; } });
    assert(done, "kein 'done'-Event — gekoppelter Lauf nicht sauber beendet:\n" + out.slice(-800));

    const maxf = join(jobRoot, 'results', 'res.max');
    assert(existsSync(maxf), 'res.max nicht erzeugt');
    const vals = readFileSync(maxf, 'utf8').split('\n')
        .filter(l => !(l.trim().split(/\s+/).length === 2 && /[a-zA-Z]/.test(l.trim()[0])))
        .join(' ').split(/\s+/).map(Number).filter(Number.isFinite);
    const wet = vals.filter(v => v > 0.001);
    assert(wet.length > 0, 'res.max komplett trocken — Client-Kopplung wirkungslos (Überstau kam nicht im 2D an)');
    console.log(`✅ Gekoppelter Lauf aus Client-Dateien: ${wet.length} nasse 2D-Zellen, max ${Math.max(...wet).toFixed(3)} m.`);
    rmSync(jobRoot, { recursive: true, force: true });
}

console.log('\n✅ TEST BESTANDEN: Client-Kopplungs-Pipeline (SwmmBuilder→network.inp+flow.coupling→Docker).');
