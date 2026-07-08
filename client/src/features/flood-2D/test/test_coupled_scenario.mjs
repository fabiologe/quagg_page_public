// Test des Runner-Bausteins coupledScenario.buildCoupledFiles (Vue-frei):
//   - reichert einen fertigen Datei-Satz um network.inp + flow.coupling + couplingfile an,
//   - respektiert die Guards (kein acceleration / SGC / fv1 → deaktiviert),
//   - der angereicherte Satz läuft im echten Docker-Image.
//
//   node test_coupled_scenario.mjs [IMAGE]     # default: lisflood-fp:coupling

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { NetworkModel } from '../services/geometry/NetworkModel.js';
import { buildCoupledFiles, parseAscGrid } from '../services/swmm/coupledScenario.js';

const IMAGE = process.argv[2] || 'lisflood-fp:coupling';
let fails = 0;
const ok = (c, m) => { if (c) console.log('  ✅ ' + m); else { console.error('  ❌ ' + m); fails++; } };

// flaches DEM 20x20 @10 mit zentraler Delle über MH
const M = 20, CS = 5.0, dc = 10, dr = 10;
const g = new Float32Array(M * M).fill(10.0);
for (let r = dr - 1; r <= dr + 1; r++) for (let c = dc - 1; c <= dc + 1; c++) g[r * M + c] = 8.5;
g[dr * M + dc] = 8.0;
let asc = `ncols ${M}\nnrows ${M}\nxllcorner 0\nyllcorner 0\ncellsize ${CS}\nNODATA_value -9999\n`;
for (let r = 0; r < M; r++) asc += Array.from({ length: M }, (_, c) => g[r * M + c].toFixed(2)).join(' ') + '\n';

// parseAscGrid round-trip
{
    const dem = parseAscGrid(asc);
    ok(dem.header.ncols === M && dem.header.nrows === M && dem.header.cellsize === CS, 'parseAscGrid: Header korrekt');
    ok(dem.grid.length === M * M && Math.abs(dem.grid[dr * M + dc] - 8.0) < 1e-6, 'parseAscGrid: Grid + Dellenwert korrekt');
}

function makeModel() {
    const mhX = (dc + 0.5) * CS, mhY = (M - 1 - dr + 0.5) * CS;
    const m = new NetworkModel();
    m.addNode({ id: 'MH', x: mhX, y: mhY, invert: 6.0, rim: 8.0, role: 'manhole', attrs: { constantInflow: 1500 } });
    m.addNode({ id: 'OUT', x: 97.5, y: mhY, invert: 5.5, rim: 6.5, role: 'outfall' });
    m.addLink({ id: 'C', fromNodeId: 'MH', toNodeId: 'OUT', length: 60, profile: { shape: 'circular', height: 0.5 }, attrs: { kSt: 80 } });
    return m;
}
const basePar = 'DEMfile terrain.asc\nresroot res\ndirroot results\nsim_time 400\ninitial_tstep 1\n'
    + 'saveint 60\nmassint 30\nfpfric 0.03\nbcifile flow.bci\nacceleration\n';
const baseFiles = () => ({ 'terrain.asc': asc, 'run.par': basePar, 'flow.bci': 'N 0 100 FREE\nS 0 100 FREE\nE 0 100 FREE\nW 0 100 FREE\n' });

console.log('1) Anreicherung');
const res = buildCoupledFiles(baseFiles(), makeModel(), { dtCouple: 2.0, swmm: { durationHours: 0.2 } });
ok(res.active === true, 'Kopplung aktiv');
ok('network.inp' in res.files && 'flow.coupling' in res.files, 'network.inp + flow.coupling ergänzt');
ok(/\bcouplingfile flow\.coupling\b/.test(res.files['run.par']), 'couplingfile in run.par');
ok(res.couplingNodes.some(c => c.id === 'MH' && c.sink), 'MH als Senken-Kopplung');

console.log('2) Guards');
ok(buildCoupledFiles({ ...baseFiles(), 'run.par': basePar.replace('acceleration', 'fv1') }, makeModel()).active === false, 'fv1 → deaktiviert');
ok(buildCoupledFiles({ ...baseFiles(), 'run.par': basePar + 'SGCwidth sgc.width.asc\n' }, makeModel()).active === false, 'SGC → deaktiviert');
ok(buildCoupledFiles({ 'run.par': basePar }, makeModel()).active === false, 'kein terrain.asc → deaktiviert');
ok(buildCoupledFiles(baseFiles(), new NetworkModel()).active === false, 'leeres Netz → deaktiviert');

console.log('3) End-to-End (Docker)');
let hasDocker = false;
try { execFileSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }); hasDocker = true; }
catch { console.log('  ℹ️  Image nicht gefunden — Docker-Teil übersprungen.'); }
if (hasDocker) {
    const jobRoot = '/home/fabio/quagg_page/backend/app/api/flood2D/data/regression_coupled_scenario';
    rmSync(jobRoot, { recursive: true, force: true });
    const inpDir = join(jobRoot, 'inputs'); mkdirSync(inpDir, { recursive: true }); mkdirSync(join(jobRoot, 'results'));
    for (const [n, c] of Object.entries(res.files)) writeFileSync(join(inpDir, n), c);
    let out = '';
    try { out = execFileSync('docker', ['run', '--rm', '-v', `${jobRoot}:/job`, IMAGE, '--job', '/job', '--heartbeat', '5'], { encoding: 'utf8', timeout: 300000 }); }
    catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
    const done = out.split('\n').some(l => { try { return JSON.parse(l).event === 'done'; } catch { return false; } });
    ok(done, 'angereicherter Datei-Satz läuft gekoppelt durch');
    ok(existsSync(join(jobRoot, 'results', 'res.max')), 'res.max erzeugt');
    rmSync(jobRoot, { recursive: true, force: true });
}

console.log(fails === 0 ? '\n✅ COUPLED-SCENARIO BESTANDEN' : `\n❌ ${fails} Fehler`);
process.exit(fails === 0 ? 0 : 1);
