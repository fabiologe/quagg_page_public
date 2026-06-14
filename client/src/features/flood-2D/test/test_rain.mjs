// Regressions-Gate für generateRainFile (LISFLOOD .rain).
// Hintergrund: der Solver hält den LETZTEN Zeitreihenwert bis sim_time konstant
// (InterpolateTimeSeries). Endet die Reihe ≠ 0 → Dauerregen ("Sintflut"); endet
// sie mit 0 mm/h → Regen stoppt sauber. Ausserdem MUSS das Format exakt stimmen:
//   Zeile 1: Kommentar (vom Solver übersprungen)
//   Zeile 2: <N> <Zeiteinheit>
//   N×:      <Rate_mm_h>\t<Zeit_s>   (Spalte1=Rate, Spalte2=Zeit, strikt steigend)
// Ausführen: node src/features/flood-2D/test/test_rain.mjs  (aus client/)
import { InputGenerator } from '../middleware/InputGenerator.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};

const ig = new InputGenerator();

// KOSTRA-artige Euler-Reihe: value_mm = Niederschlagshöhe je 300-s-Block.
const series = [
    { time_sec: 0,    value_mm: 15.3 },   // Peak 183.6 mm/h
    { time_sec: 300,  value_mm: 3.3 },    //      39.6  mm/h
    { time_sec: 600,  value_mm: 2.298 },  //      27.576 mm/h
];
const expectedDepth = series.reduce((a, b) => a + b.value_mm, 0);

const out = ig.generateRainFile(series);
const lines = out.trim().split('\n');
const [countStr, unit] = lines[1].split(/\s+/);
const rows = lines.slice(2).map(l => l.split(/\s+/).map(Number));

console.log('generateRainFile — Format & Physik:');
assert(lines[0] === 'KOSTRA_Euler_Rain_Profile', 'Zeile 1 ist der Kommentar-Header');
assert(unit === 'seconds', 'Zeiteinheit = seconds');
assert(Number(countStr) === rows.length, `Header-Anzahl (${countStr}) == Datenzeilen (${rows.length})`);

let increasing = true, prev = -Infinity;
for (const [, t] of rows) { if (!(t > prev)) increasing = false; prev = t; }
assert(increasing, 'Zeiten strikt steigend (sonst exit(-1) im Solver)');

assert(rows[rows.length - 1][0] === 0, 'Reihe endet mit 0 mm/h (kein Dauerregen-Tail)');
assert(rows[0][1] === 0, 'erste Stützstelle bei t=0 s');

// Massenerhalt: ∫ Rate(mm/h) dt(s) → mm (Trapez = wie der Solver linear interpoliert)
let mm = 0;
for (let i = 1; i < rows.length; i++) mm += (rows[i][0] + rows[i - 1][0]) / 2 * (rows[i][1] - rows[i - 1][1]) / 3600;
assert(Math.abs(mm - expectedDepth) < 0.05,
    `gelieferte Tiefe ${mm.toFixed(3)} mm ≈ erwartet ${expectedDepth.toFixed(3)} mm`);

// Peak-Rate stimmt (Block 0: 15.3 mm in 300 s = 183.6 mm/h)
assert(Math.abs(rows[0][0] - 183.6) < 0.01, 'Peak-Rate = 183.6 mm/h');

// Degenerierter Input → definiertes "kein Regen" statt Crash
const empty = ig.generateRainFile([]).trim().split('\n');
assert(empty.slice(2).every(l => Number(l.split(/\s+/)[0]) === 0), 'leere Reihe → 0 mm/h (kein Crash)');

console.log(failures === 0 ? '\n✅ alle Regen-Tests bestanden' : `\n❌ ${failures} Fehler`);
process.exit(failures === 0 ? 0 : 1);
