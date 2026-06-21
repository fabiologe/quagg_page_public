/**
 * test_bridge_soffit_dem.mjs — Phase-4-Physik-Mitigation:
 * Brückenzellen, deren Soffit ≤ lokales Gelände+MIN_BRIDGE_OPENING liegt (Deck unter Grund,
 * z.B. Widerlager/ansteigendes Terrain), werden am Export verworfen. Sonst ist die Öffnung
 * Z=min(Soffit−z0,Soffit−z1) ≤ 0 und der Solver (weir_flow.cpp) rechnet sich in den
 * "Unexpected Bridge flow calc fail"-Zweig → numerische Instabilität.
 *
 * Außerdem: NaN/Inf-Koordinaten dürfen discretizeStructureAxis NICHT in eine Endlosschleife
 * schicken (getLineCells terminiert bei NaN sonst nie).
 */
import { InputGenerator } from '../middleware/InputGenerator.js';

let ok = true;
const chk = (c, m) => { ok = ok && c; console.log((c ? '  ✅ ' : '  ❌ ') + m); };

const gen = new InputGenerator();
const h = { ncols: 4, nrows: 1, cellsize: 1, xllcorner: 0, yllcorner: 0, xll: 0, yll: 0 };
const dem = Float32Array.from([240, 240, 250, 240]); // row 0 = Süd; col 2 = 250 m (ragt über Soffit)
const bridge = { id: 'b', axis: [{ x: 0, y: 0 }, { x: 3, y: 0 }], soffit: 245, width: 4, Cd: 1, Tz: 1.5 };

console.log('── Soffit-vs-DEM-Validierung ──');
const xs = gen.generateWeirFile([], [bridge], h, { engine: 'v8', demGrid: dem })
    .trim().split('\n').slice(1).map(l => parseFloat(l.split(/\s+/)[0]));
chk(!xs.includes(2), `Soffit 245 ≤ DEM 250 bei x=2 → verworfen (cells: ${xs.join(',')})`);
chk(xs.includes(0) && xs.includes(1) && xs.includes(3), 'Zellen mit positiver Öffnung bleiben');

console.log('── Rückwärtskompatibilität (ohne demGrid keine Filterung) ──');
const xs2 = gen.generateWeirFile([], [bridge], h, { engine: 'v8' })
    .trim().split('\n').slice(1).map(l => parseFloat(l.split(/\s+/)[0]));
chk(xs2.includes(2) && xs2.length === 4, 'ohne demGrid: alle 4 Zellen exportiert');

console.log('── Fix C: Nachbar-Bett quer zur Fließachse (Solver: Z=min(Soffit−z0,Soffit−z1)) ──');
{
    // 3×3, cellsize 1. Spalte 0 = HOCH (250), Spalte 1+2 = niedrig (240). Vertikale Brücke bei x=1
    // (Richtung E → Nachbar quer = x-Achse). Eigenes Bett (col1=240) < Soffit 245 → wäre OK,
    // ABER Nachbar col0=250 ≥ 245 → degeneriert → muss verworfen werden.
    const h3 = { ncols: 3, nrows: 3, cellsize: 1, xllcorner: 0, yllcorner: 0, xll: 0, yll: 0 };
    const dem3 = Float32Array.from([250, 240, 240, 250, 240, 240, 250, 240, 240]); // row 0 = Süd
    const vBridge = { id: 'v', axis: [{ x: 1, y: 0 }, { x: 1, y: 2 }], soffit: 245, width: 3, Cd: 1, Tz: 1.5 };
    const outC = gen.generateWeirFile([], [vBridge], h3, { engine: 'v8', demGrid: dem3 }).trim();
    const nC = outC === '' ? 0 : parseInt(outC.split('\n')[0], 10);
    chk(nC === 0, `Brückenzellen mit hohem Nachbar-Bett (250≥245) verworfen, obwohl eigenes Bett ok (got ${nC} Zeilen)`);
    // Gegenprobe: Soffit über BEIDEN (256) → bleibt
    const vBridge2 = { ...vBridge, soffit: 256 };
    const outC2 = gen.generateWeirFile([], [vBridge2], h3, { engine: 'v8', demGrid: dem3 }).trim();
    const nC2 = outC2 === '' ? 0 : parseInt(outC2.split('\n')[0], 10);
    chk(nC2 === 3, `Soffit 256 > Zelle UND Nachbar → 3 Zellen bleiben (got ${nC2})`);
}

console.log('── NaN-Koordinaten-Guard (kein Endlos-Loop) ──');
const bad = gen.discretizeStructureAxis([[undefined, undefined], [3, 0]], h);
chk(Array.isArray(bad) && bad.length === 0, `ungültige Achse → [] (got ${bad.length})`);

console.log('\n' + (ok ? '✅ Alle Bridge-Soffit/DEM-Tests bestanden.' : '❌ FEHLER'));
process.exit(ok ? 0 : 1);
