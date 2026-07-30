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

// SGC-Breitenraster (gleiche Dimensionen/Ausrichtung wie terrain.asc): `activeCells` markiert
// die Zellen, die eine echte SGC-Kanalzelle sind (Breite > 0), alle anderen bleiben 0.
function makeSgcAsc(activeCells) {
    const w = new Float32Array(M * M).fill(0);
    for (const { col, row } of activeCells) w[row * M + col] = 2.0;
    let a = `ncols ${M}\nnrows ${M}\nxllcorner 0\nyllcorner 0\ncellsize ${CS}\nNODATA_value -9999\n`;
    for (let r = 0; r < M; r++) a += Array.from({ length: M }, (_, c) => w[r * M + c].toFixed(2)).join(' ') + '\n';
    return a;
}

console.log('1) Anreicherung');
const res = buildCoupledFiles(baseFiles(), makeModel(), { dtCouple: 2.0, swmm: { durationHours: 0.2 } });
ok(res.active === true, 'Kopplung aktiv');
ok('network.inp' in res.files && 'flow.coupling' in res.files, 'network.inp + flow.coupling ergänzt');
ok(/\bcouplingfile flow\.coupling\b/.test(res.files['run.par']), 'couplingfile in run.par');
ok(res.couplingNodes.some(c => c.id === 'MH' && c.sink), 'MH als Senken-Kopplung');

console.log('2) Zeit-Synchronisation 1D↔2D (unter der Haube)');
{
    // ohne explizite swmm-Optionen: SWMM-Dauer folgt sim_time (400 s + 300 s Puffer
    // = 700 s → END_TIME 00:11:40), REPORT_STEP folgt saveint (60 s).
    const auto = buildCoupledFiles(baseFiles(), makeModel(), { dtCouple: 2.0 });
    const inp = auto.files['network.inp'];
    ok(/END_TIME\s+00:11:40/.test(inp), 'END_TIME automatisch aus sim_time (+5 min Puffer)');
    ok(/REPORT_STEP\s+00:01:00/.test(inp), 'REPORT_STEP automatisch aus saveint');
    // langer 2D-Lauf (12 h): der alte 6-h-Default darf NICHT mehr greifen
    const long = buildCoupledFiles({ ...baseFiles(), 'run.par': basePar.replace('sim_time 400', 'sim_time 43200') }, makeModel(), { dtCouple: 2.0 });
    ok(/END_TIME\s+12:05:00/.test(long.files['network.inp']), '12-h-2D-Lauf → SWMM 12:05 h (Default 6 h überstimmt)');
    // feineres 2D-Ausgabeintervall taktet auch die 1D-Ergebnisse
    const fine = buildCoupledFiles({ ...baseFiles(), 'run.par': basePar.replace('saveint 60', 'saveint 30') }, makeModel(), { dtCouple: 2.0 });
    ok(/REPORT_STEP\s+00:00:30/.test(fine.files['network.inp']), 'saveint 30 s → REPORT_STEP 00:00:30');
    // explizite Option gewinnt (res oben: durationHours 0.2 = 720 s)
    ok(/END_TIME\s+00:12:00/.test(res.files['network.inp']), 'explizite durationHours überstimmt die Automatik');
}

console.log('3) Guards');
ok(buildCoupledFiles({ ...baseFiles(), 'run.par': basePar.replace('acceleration', 'fv1') }, makeModel()).active === false, 'fv1 → deaktiviert');
ok(buildCoupledFiles({ 'run.par': basePar }, makeModel()).active === false, 'kein terrain.asc → deaktiviert');
ok(buildCoupledFiles(baseFiles(), new NetworkModel()).active === false, 'leeres Netz → deaktiviert');

console.log('3b) Knoten AUF SGC-Gerinnezellen koppeln (seit quagg-coupling-sgc-hook, 2026-07-28)');
{
    // Historie in zwei Stufen: (1) früher deaktivierte JEDES SGCwidth die GESAMTE Kopplung
    // (modellweit); (2) danach wurden nur die betroffenen Zellen übersprungen, weil der
    // Solver-Fast-Pfad keinen Kopplungs-Hook hatte. Seit dem Hook-Patch koppeln Knoten
    // auf Gerinnezellen VOLLWERTIG — der Solver bucht dort über volume_grid mit Sohl-Datum
    // (verifiziert: engines/docker/test_coupling_sgc.py). Der Detector nutzt die SGC-Lage
    // nur noch für die Deckel-Klemmung (zRef = Kanalsohle statt Bankoberkante).
    const parWithSgc = basePar + 'SGCwidth sgc.width.asc\n';
    // Sohlraster für (c): Kanalsohle 7.0 m auf MHs Zelle, sonst = DEM (8.0 in der Delle, 10 außen).
    const bedAsc = (() => {
        let a = `ncols ${M}\nnrows ${M}\nxllcorner 0\nyllcorner 0\ncellsize ${CS}\nNODATA_value -9999\n`;
        for (let r = 0; r < M; r++) a += Array.from({ length: M }, (_, c) =>
            (r === dr && c === dc ? 7.0 : g[r * M + c]).toFixed(2)).join(' ') + '\n';
        return a;
    })();

    // (a) SGC-Kanal fern der Schächte → alles koppelt (wie immer)
    const far = buildCoupledFiles(
        { ...baseFiles(), 'run.par': parWithSgc, 'sgc.width.asc': makeSgcAsc([{ col: 3, row: 3 }]) },
        makeModel(), { dtCouple: 2.0 });
    ok(far.active === true, 'SGC-Kanal fern der Schächte → Kopplung aktiv');
    ok(far.couplingNodes.some(c => c.id === 'MH') && far.couplingNodes.some(c => c.id === 'OUT'),
        'beide Schächte gekoppelt');

    // (b) SGC-Kanal GENAU auf MHs Zelle → MH bleibt jetzt GEKOPPELT (kein Ausschluss mehr)
    const onMh = buildCoupledFiles(
        { ...baseFiles(), 'run.par': parWithSgc, 'sgc.width.asc': makeSgcAsc([{ col: 10, row: 10 }]) },
        makeModel(), { dtCouple: 2.0 });
    ok(onMh.active === true, 'Kopplung aktiv');
    ok(onMh.couplingNodes.some(c => c.id === 'MH'),
        'MH auf SGC-Zelle IST gekoppelt (Solver-Hook vorhanden, kein Ausschluss mehr)');
    ok(onMh.couplingNodes.some(c => c.id === 'OUT'), 'OUT ebenfalls gekoppelt');
    ok(!onMh.warnings.some(w => w.includes('SGC-Kanalzelle')),
        'keine Ausschluss-Warnung mehr für SGC-Zellen');

    // (c) Deckel-Klemmung auf Gerinnezellen: gegen die KANALSOHLE (sgc.bed.asc), nicht
    // gegen die Bankoberkante — ein Rohr-Auslauf am Gerinne darf unter Bankniveau abgeben.
    const model = makeModel();
    for (const n of model.nodeList) if (n.id === 'MH') n.geom.rim = 7.2;   // unter DEM (8.0), über Sohle (7.0)
    const clamped = buildCoupledFiles(
        { ...baseFiles(), 'run.par': parWithSgc,
          'sgc.width.asc': makeSgcAsc([{ col: 10, row: 10 }]), 'sgc.bed.asc': bedAsc },
        model, { dtCouple: 2.0 });
    const mh = clamped.couplingNodes.find(c => c.id === 'MH');
    ok(!!mh && Math.abs(mh.rim - 7.2) < 1e-6,
        `Deckel 7.2 m (unter Bank 8.0, über Sohle 7.0) bleibt UNGEKLEMMT (rim=${mh?.rim})`);
}

console.log('3c) Schacht mit ausschließlich offenem Gerinne (kein Rohr ins SWMM-Netz) wird übersprungen');
{
    const mhX = (dc + 0.5) * CS, mhY = (M - 1 - dr + 0.5) * CS;
    const m = new NetworkModel();
    m.addNode({ id: 'MH', x: mhX, y: mhY, invert: 6.0, rim: 8.0, role: 'manhole' });
    m.addNode({ id: 'G1', x: mhX + 20, y: mhY, invert: 5.8, rim: 7.8, role: 'manhole' });
    m.addLink({ id: 'RI1', fromNodeId: 'MH', toNodeId: 'G1', conveyance: 'open',
        length: 20, profile: { shape: 'rect', width: 1.0 } });
    const res = buildCoupledFiles(baseFiles(), m, { dtCouple: 2.0 });
    ok(!res.couplingNodes.some(c => c.id === 'MH') && !res.couplingNodes.some(c => c.id === 'G1'),
        'Knoten ohne jeden Rohr-Anschluss (nur offenes Gerinne) werden übersprungen');
    ok(res.warnings.some(w => w.includes('nur offene Gerinne')), 'Warnung erklärt den Ausschluss');
    ok(res.active === false, 'kein Kopplungsschacht übrig → deaktiviert');
}

console.log('4) End-to-End (Docker)');
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
