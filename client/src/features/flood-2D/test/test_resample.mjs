// Tests für Rasterizer.resampleGrid (Export-Resampling)
// Ausführen: node src/features/flood-2D/test/test_resample.mjs (aus client/)
import { resampleGrid } from '../middleware/Rasterizer.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};
const approx = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

console.log('── resampleGrid ──');

// Hilfsfunktion: lineare Rampe z = a·x + b·y (Welt-Koordinaten), bottom-up
function makeRamp(ncols, nrows, cellsize, xll, yll, a, b) {
    const data = new Float32Array(ncols * nrows);
    for (let r = 0; r < nrows; r++) {
        for (let c = 0; c < ncols; c++) {
            const x = xll + c * cellsize;
            const y = yll + r * cellsize;
            data[r * ncols + c] = a * x + b * y;
        }
    }
    return data;
}

// 1. Header-Invarianten (createDemFromXYZ-Stil: xllcorner = Ecke, xll = Zentrum)
{
    const header = { ncols: 10, nrows: 8, cellsize: 5, xllcorner: 100, yllcorner: 200, xll: 102.5, yll: 202.5 };
    const data = makeRamp(10, 8, 5, 102.5, 202.5, 0.1, 0.2);
    const res = resampleGrid(data, header, 1);
    assert(res.header.xllcorner === 100 && res.header.yllcorner === 200, 'Ecke bleibt fix (xllcorner/yllcorner)');
    assert(approx(res.header.xll, 100.5) && approx(res.header.yll, 200.5), 'xll = xllcorner + ziel/2 (Zentren-Konvention)');
    assert(res.header.ncols === 50 && res.header.nrows === 40, 'Dimension: 10×8@5m → 50×40@1m');
    assert(res.header.NODATA_value === -9999, 'NODATA_value gesetzt');
}

// 2. Editor-Stil-Header (nur xllcorner mit ZENTREN-Semantik, kein xll)
{
    const header = { ncols: 10, nrows: 8, cellsize: 5, xllcorner: 102.5, yllcorner: 202.5 };
    const data = makeRamp(10, 8, 5, 102.5, 202.5, 0.1, 0.2);
    const res = resampleGrid(data, header, 2.5);
    // Zentren-Ursprung = 102.5 → Ecke = 100 → neuer xll = 101.25
    assert(approx(res.header.xllcorner, 100) && approx(res.header.xll, 101.25), 'Editor-Header: Zentren-Fallback korrekt aufgelöst');
}

// 3. Bilineare Exaktheit auf linearer Rampe (2× und 5× Verfeinerung)
for (const target of [2.5, 1]) {
    const cs = 5, ncols = 12, nrows = 10, xll = 102.5, yll = 202.5;
    const header = { ncols, nrows, cellsize: cs, xllcorner: 100, yllcorner: 200, xll, yll };
    const a = 0.3, b = -0.15;
    const data = makeRamp(ncols, nrows, cs, xll, yll, a, b);
    const { data: out, header: h } = resampleGrid(data, header, target);

    let maxErr = 0;
    for (let r = 0; r < h.nrows; r++) {
        for (let c = 0; c < h.ncols; c++) {
            const x = h.xll + c * h.cellsize;
            const y = h.yll + r * h.cellsize;
            // Am Rand klemmt bilinear (Extrapolation vermieden) → nur Innenbereich exakt prüfen
            if (x < xll || x > xll + (ncols - 1) * cs || y < yll || y > yll + (nrows - 1) * cs) continue;
            const expected = a * x + b * y;
            maxErr = Math.max(maxErr, Math.abs(out[r * h.ncols + c] - expected));
        }
    }
    assert(maxErr < 1e-3, `Rampe bei ${cs}m→${target}m exakt (maxErr=${maxErr.toExponential(2)})`);
}

// 4. NoData: Insel bleibt NoData, kein Bleeding in Mittelwerte
{
    const cs = 2, ncols = 8, nrows = 8;
    const header = { ncols, nrows, cellsize: cs, xllcorner: 0, yllcorner: 0, xll: 1, yll: 1 };
    const data = new Float32Array(ncols * nrows).fill(10);
    // 2×2-NoData-Insel in der Mitte
    for (const [c, r] of [[3, 3], [4, 3], [3, 4], [4, 4]]) data[r * ncols + c] = -9999;

    const { data: out, header: h } = resampleGrid(data, header, 1);
    let bleeding = false, islandPreserved = false;
    for (let r = 0; r < h.nrows; r++) {
        for (let c = 0; c < h.ncols; c++) {
            const v = out[r * h.ncols + c];
            if (v <= -9990) islandPreserved = true;
            else if (Math.abs(v - 10) > 1e-4) bleeding = true; // Renormalisierung muss exakt 10 liefern
        }
    }
    assert(islandPreserved, 'NoData-Insel im Zielraster vorhanden');
    assert(!bleeding, 'kein NoData-Bleeding: alle gültigen Zellen exakt 10');
}

// 5. Nearest-Methode + Vergröberung
{
    const header = { ncols: 4, nrows: 4, cellsize: 1, xllcorner: 0, yllcorner: 0, xll: 0.5, yll: 0.5 };
    const data = new Float32Array(16).map((_, i) => i);
    const res = resampleGrid(data, header, 2, 'nearest');
    assert(res.header.ncols === 2 && res.header.nrows === 2, 'Vergröberung 4×4@1 → 2×2@2');
    // Ziel-Zelle (0,0)-Zentrum bei Welt (1,1) → fraktional (0.5,0.5) → round = Quelle (1,1) → Wert 5
    assert(res.data[0] === 5, `nearest wählt erwartete Quellzelle (got ${res.data[0]})`);
}

// 6. Kein hartes Limit mehr — große Zielraster müssen berechenbar sein (Anforderung #3a).
{
    let threw = false;
    let res = null;
    const header = { ncols: 200, nrows: 200, cellsize: 10, xllcorner: 0, yllcorner: 0, xll: 5, yll: 5 };
    try { res = resampleGrid(new Float32Array(200 * 200), header, 1); } catch { threw = true; }
    assert(!threw, 'kein Throw mehr bei großem Zielraster (Hard-Limit entfernt)');
    assert(res && res.header.ncols === 2000 && res.header.nrows === 2000, 'großes Zielraster wird erzeugt (2000×2000)');
}

console.log(failures === 0 ? '\n✅ Alle Resample-Tests bestanden.' : `\n❌ ${failures} Test(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
