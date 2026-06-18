// Tests für useWeirResults (Wehr-Durchfluss aus .Qx/.Qy → qFluxFrames)
// Ausführen: node src/features/flood-2D/test/test_weir_results.mjs  (aus client/)
import { computeWeirSeries, Q_UNIT_FACTOR } from '../composables/viewer/useWeirResults.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const NC = 50, NR = 50;
const header = { ncols: NC, nrows: NR, cellsize: 1, xll: 0, yll: 0 };

// Hilfen: Index ins Result-Raster (top-down) aus Welt-/Süd-Reihe (bottom-up).
const topIdx = (col, southRow) => (NR - 1 - southRow) * NC + col;

console.log('── Q-Summation einer O-W-Wehrlinie (Richtung S → qy) ──');
{
    // Wehr quer über row 10 (Süd-Konvention), Spalten 2..8 → 7 Zellen, alle 'S'.
    const weirLines = [{ id: 'w1', label: 'Wehr A', hc: 11.5, points: [{ x: 2, y: 10 }, { x: 8, y: 10 }] }];

    const qx = new Float32Array(NC * NR); // soll IGNORIERT werden (Richtung S → qy)
    const qy = new Float32Array(NC * NR);
    for (let col = 2; col <= 8; col++) {
        qy[topIdx(col, 10)] = 0.5;      // 7 × 0.5 = 3.5 m³/s
        qx[topIdx(col, 10)] = 99.0;     // Falle: darf nicht in Q eingehen
    }
    const qFluxFrames = new Map([[0, { qx, qy }]]);

    const elev = new Float32Array(NC * NR);
    for (let col = 2; col <= 8; col++) {
        elev[topIdx(col, 11)] = 12.0;   // Nordnachbar (Süd-row 11) = Oberwasser
        elev[topIdx(col, 9)] = 11.0;    // Südnachbar  (Süd-row 9)  = Unterwasser
    }
    const elevFrames = new Map([[0, elev]]);

    const series = computeWeirSeries({ weirLines, header, qFluxFrames, elevFrames, saveInterval: 60 });
    assert(series.length === 1, 'eine Wehr-Zeitreihe');
    const w = series[0];
    assert(w.cellCount === 7, `7 Wehrzellen (got ${w.cellCount})`);
    assert(near(w.Q[0], 3.5 * Q_UNIT_FACTOR), `Q = 3.5 m³/s aus qy-Summe (got ${w.Q[0]})`);
    assert(near(w.Qmax, 3.5 * Q_UNIT_FACTOR), 'Qmax = 3.5');
    assert(near(w.HW[0], 12.0) && near(w.TW[0], 11.0), `HW/TW = 12/11 (got ${w.HW[0]}/${w.TW[0]})`);
    assert(near(w.overtop[0], 0.5), `Überstau = HW - Krone = 0.5 (got ${w.overtop[0]})`);
    assert(w.overtopFrames === 1, 'overtopFrames = 1');
    assert(near(w.times[0], 0), 'Zeit Frame 0 = 0 s');
}

console.log('── Richtung E (N-S-Wand) nutzt qx ──');
{
    // Vertikale Linie (col const, row wechselt) → Richtung 'E' → Normalkomponente qx.
    const weirLines = [{ id: 'w2', label: 'Wehr B', hc: 5, points: [{ x: 20, y: 5 }, { x: 20, y: 11 }] }];
    const qx = new Float32Array(NC * NR);
    const qy = new Float32Array(NC * NR);
    for (let sr = 5; sr <= 11; sr++) {
        qx[topIdx(20, sr)] = 1.0;       // je Zelle 1.0 → erwartet 7.0
        qy[topIdx(20, sr)] = 50.0;      // darf nicht zählen
    }
    const qFluxFrames = new Map([[0, { qx, qy }]]);
    const series = computeWeirSeries({ weirLines, header, qFluxFrames });
    const w = series[0];
    assert(w.cellCount === 7, `7 vertikale Wehrzellen (got ${w.cellCount})`);
    assert(near(w.Q[0], 7.0 * Q_UNIT_FACTOR), `Q = 7.0 m³/s aus qx-Summe (got ${w.Q[0]})`);
}

console.log('── Vorzeichen: gegenläufige Flüsse heben sich NICHT durch abs() auf ──');
{
    // Reine Summe vor abs(): zwei +1 und zwei -1 → netto 0.
    const weirLines = [{ id: 'w3', label: 'Wehr C', points: [{ x: 2, y: 20 }, { x: 5, y: 20 }] }];
    const qy = new Float32Array(NC * NR);
    qy[topIdx(2, 20)] = 1.0; qy[topIdx(3, 20)] = 1.0;
    qy[topIdx(4, 20)] = -1.0; qy[topIdx(5, 20)] = -1.0;
    const qFluxFrames = new Map([[0, { qx: new Float32Array(NC * NR), qy }]]);
    const w = computeWeirSeries({ weirLines, header, qFluxFrames })[0];
    assert(near(w.Q[0], 0), `netto-Q ≈ 0 bei symmetrischem Gegenfluss (got ${w.Q[0]})`);
}

console.log('── Graceful: keine qFluxFrames → leere Reihe ──');
{
    const weirLines = [{ id: 'w4', points: [{ x: 2, y: 10 }, { x: 8, y: 10 }] }];
    assert(computeWeirSeries({ weirLines, header, qFluxFrames: new Map() }).length === 0, 'keine Frames → []');
    assert(computeWeirSeries({ weirLines: [], header, qFluxFrames: new Map([[0, {}]]) }).length === 0, 'keine Wehre → []');
}

console.log(failures === 0 ? '\n✅ alle Wehr-Ergebnis-Tests bestanden' : `\n❌ ${failures} Test(s) fehlgeschlagen`);
process.exit(failures === 0 ? 0 : 1);
