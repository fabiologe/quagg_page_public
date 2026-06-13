// Diagnose: erzeugt flow.weir für ein realistisches Wehr-Szenario (engine v8, RunPod)
// und prüft die drei Verdachtspunkte:
//   (1) Kommen Wehr-Zeilen an?  (2) hc > DEM an jeder Wehr-Zelle?  (3) Tags = N/S/E/W (KEIN B)?
// Ausführen aus client/:  node src/features/flood-2D/test/diag_weir_realcase.mjs
import { InputGenerator } from '../middleware/InputGenerator.js';

const gen = new InputGenerator();

// DEM 20x20 @1m, flaches Gelände auf Höhe 10.0 m NHN
const ncols = 20, nrows = 20, cs = 1;
const header = { ncols, nrows, cellsize: cs, xllcorner: -cs / 2, yllcorner: -cs / 2, xll: 0, yll: 0 };
const data = new Float32Array(ncols * nrows).fill(10.0);

// Wehr-Linie quer (W→E) bei y=10 m, Krone hc = 15.0 (= Gelände + 5), wie WeirTool-Default.
// So wie der Editor es liefert: mehrere Segment-Objekte mit gemeinsamer lineId.
const lineId = 'weir-diag-1';
const weirs = [];
for (let xm = 4; xm <= 15; xm++) {
    weirs.push({ x: xm, y: 10, direction: 'S', Cd: 1.704, hc: 15.0, m: 0.667, w: 1.0, lineId });
}

const content = gen.generateWeirFile(weirs, [], header, { engine: 'v8' });

console.log('=== flow.weir (engine v8) ===');
console.log(content);

const lines = content.trim().split('\n');
const n = parseInt(lines[0], 10);
const rows = lines.slice(1).map(l => l.trim().split(/\s+/));

console.log(`\n── Check 1: Wehr-Zeilen vorhanden? n=${n} (Eingabe: ${weirs.length} Segmente)`);

console.log('\n── Check 3: Tags = Wehr (N/S/E/W) vs. Brücke (B)?');
const bridgeTags = rows.filter(r => /B$/.test(r[2]));
const weirTags = rows.filter(r => /^[NSEW]F?$/.test(r[2]));
console.log(`   Wehr-Tags: ${weirTags.length}, Brücken-Tags (…B): ${bridgeTags.length}`);
console.log(bridgeTags.length === 0 ? '   ✅ keine B-Tags → echtes Wehr, kein Orifice-Durchfluss'
                                    : '   ❌ B-Tags vorhanden → würde wie Brücke durchströmt!');

console.log('\n── Check 1b: hc > DEM an jeder Wehr-Zelle?');
let leak = 0;
for (const r of rows) {
    const x = parseFloat(r[0]), y = parseFloat(r[1]), hc = parseFloat(r[4]);
    const { col, row } = gen.getGridIndex(x, y, header);
    // data ist bottom-up (row 0 = Süden); getGridIndex liefert top-down row → zurückrechnen
    const rowBU = (header.nrows - 1) - row;
    const z = (rowBU >= 0 && rowBU < nrows && col >= 0 && col < ncols) ? data[rowBU * ncols + col] : NaN;
    const ok = hc > z;
    if (!ok) leak++;
    if (!ok) console.log(`   ❌ Zelle (${col},${row}) hc=${hc} <= DEM=${z} → Wehr begraben/wirkungslos`);
}
console.log(leak === 0 ? `   ✅ alle ${rows.length} Wehr-Zellen: hc > DEM (Wehr wirkt als Barriere)`
                       : `   ❌ ${leak} Zellen mit hc <= DEM`);
