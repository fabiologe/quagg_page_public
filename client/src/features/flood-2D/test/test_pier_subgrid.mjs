// Tests: Pfeiler wirken SUB-GRID über die Öffnungsbreite w (statt Ganzzellen-Drop).
// Kernaussage: ein Pfeiler schmaler als eine Zelle entfernt in JEDER Lage ≈ seine echte
// Breite aus der Gesamtöffnung — egal ob er auf einem Zellzentrum (früher: ganze Zelle weg,
// 100 %) oder dazwischen liegt (früher: 0 % Wirkung). Plus pierShapeCd-Vorschlagswerte.
// Ausführen: node src/features/flood-2D/test/test_pier_subgrid.mjs   (aus client/)
import { createLattice, addPier } from '../utils/BridgeMeshLattice.js';
import { InputGenerator } from '../middleware/InputGenerator.js';
import { pierShapeCd } from '../middleware/structureFiles.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};

const mkHeader = (cs, ncols = 60, nrows = 60) => ({
    ncols, nrows, cellsize: cs, xllcorner: 0, yllcorner: 0, xll: 0, yll: 0,
});

// O-W-Brücke (Spannweite entlang x → Fluss N-S → direction 'S'); Ränder bewusst neben
// den Zellzentren (4.6 / 15.4), damit die Spann-Cols 5..15 sauber drin liegen.
const fp = [{ x: 4.6, y: 9.0 }, { x: 15.4, y: 9.0 }, { x: 15.4, y: 13.0 }, { x: 4.6, y: 13.0 }];
const SPAN_X0 = 5, SPAN_X1 = 15, SPAN = SPAN_X1 - SPAN_X0; // u=0→1 entlang x 5..15

// Summe der offenen Breite w über alle Brücken-Zeilen (dir endet auf 'B').
function sumBridgeW(files) {
    const txt = files['flow.weir'] || '';
    const lines = txt.split('\n').slice(1); // erste Zeile = Anzahl
    let sum = 0, n = 0;
    for (const ln of lines) {
        const t = ln.trim().split(/\s+/);
        if (t.length < 7) continue;
        if (!/B$/.test(t[2])) continue;
        sum += parseFloat(t[6]);
        n++;
    }
    return { sum, n };
}

function runScenario(piers) {
    const gen = new InputGenerator();
    const h = mkHeader(1);
    let lat = createLattice(fp, { soffit: 12, deck: 14 });
    for (const p of piers) lat = addPier(lat, p.uCenter, p.halfU);
    const bridge = {
        id: 'b', kind: 'mesh3d', footprint: fp, poly: fp, lattice: lat,
        vsoffit: fp.map(() => 12), vdeck: fp.map(() => 14),
        directionMode: 'AUTO', Cd: 0.8, Tz: 1.5,
    };
    const data = new Float32Array(60 * 60).fill(7);
    return gen.processScenario({
        engine: 'v8', grid: { header: h, data }, bridges: [bridge], weirs: [], sgc: null,
        bcis: [], boundaries: [], config: { simDuration: 100 },
    });
}

const PIER_W = 0.6;                 // Welt-Breite des Pfeilers [m] (< Zelle = 1 m)
const halfU = (PIER_W / 2) / SPAN;  // halbe Breite in u-Einheiten

console.log('── Pfeiler-Subgrid: w-Reduktion statt Ganzzellen-Drop ──');
const base = sumBridgeW(runScenario([]));
assert(base.n > 0, `Basis (ohne Pfeiler): ${base.n} Orifice-Zeile(n), Σw=${base.sum.toFixed(2)} m`);

// on-center: Pfeilermitte auf x=10 (Zellzentrum) → u=0.5
const onC = sumBridgeW(runScenario([{ uCenter: (10 - SPAN_X0) / SPAN, halfU }]));
// off-center: Pfeilermitte auf x=10.5 (zwischen Zellzentren 10 und 11) → u=0.55
const offC = sumBridgeW(runScenario([{ uCenter: (10.5 - SPAN_X0) / SPAN, halfU }]));

const removedOn = base.sum - onC.sum;
const removedOff = base.sum - offC.sum;
console.log(`  on-center entfernt:  ${removedOn.toFixed(2)} m`);
console.log(`  off-center entfernt: ${removedOff.toFixed(2)} m`);

assert(Math.abs(removedOn - PIER_W) < 0.2, `on-center entfernt ≈ Pfeilerbreite (${removedOn.toFixed(2)} ≈ ${PIER_W}, nicht ganze Zelle 1.0)`);
assert(Math.abs(removedOff - PIER_W) < 0.2, `off-center entfernt ≈ Pfeilerbreite (${removedOff.toFixed(2)} ≈ ${PIER_W}, nicht 0)`);
assert(Math.abs(removedOn - removedOff) < 0.2, `Wirkung positionsunabhängig (|on−off|=${Math.abs(removedOn - removedOff).toFixed(2)} m)`);

console.log('── pierShapeCd: Vorschlagswerte ──');
assert(pierShapeCd('eckig') === 0.75, 'eckig → 0.75');
assert(pierShapeCd('abgerundet') === 0.85, 'abgerundet → 0.85');
assert(pierShapeCd('stromlinienförmig') === 0.95, 'stromlinienförmig → 0.95');
assert(pierShapeCd('stromlinienfoermig') === 0.95, 'stromlinienfoermig (ASCII) → 0.95');
assert(pierShapeCd('unbekannt') === 0.80, 'unbekannt → 0.80 (Default)');

console.log(failures === 0 ? '\n✅ Alle Pfeiler-Subgrid-Tests bestanden.' : `\n❌ ${failures} Test(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
