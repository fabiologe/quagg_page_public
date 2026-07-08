// Tests für den robusten XYZ-Import (irregulär & sehr groß).
// Ausführen: node src/features/flood-2D/test/test_xyz_import.mjs (aus client/)
import {
    parseXyzPoints,
    analyzeGeometry,
    buildHeader,
    buildRegularDem,
    makeTerrainObject,
    importXyzTerrain,
    MAX_CELLS,
    NODATA,
} from '../middleware/importers/xyzTerrainImporter.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};
const approx = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

// ── 1. Reguläres 2 m-Gitter wird als regulär erkannt ──────────────────────────
console.log('── 1. Reguläres Gitter ──');
{
    let txt = '';
    for (let r = 0; r < 6; r++)
        for (let c = 0; c < 8; c++)
            txt += `${100 + c * 2} ${200 + r * 2} ${c + r}\n`;
    const pts = parseXyzPoints(txt);
    const a = analyzeGeometry(pts);
    assert(a.count === 48, 'alle 48 Punkte geparst');
    assert(a.isRegular === true, 'isRegular=true');
    assert(approx(a.suggestedCellsize, 2), `cellsize ≈ 2 (${a.suggestedCellsize})`);
    assert(a.estCols === 8 && a.estRows === 6, `Dims 8×6 (${a.estCols}×${a.estRows})`);
}

// ── 2. Irreguläre, riesige Wolke → KEIN Overflow, Gitter unter Budget ─────────
console.log('── 2. Irregulär & riesig (Regression „Invalid length") ──');
{
    // Ausdehnung 10 km × 10 km, aber zwei Punkte stehen nur 0.01 m auseinander.
    // Alt-Logik: cellsize=0.01 → 1e6×1e6 = 1e12 Zellen → RangeError.
    let txt = '0 0 5\n0.01 0 5\n';
    for (let i = 0; i < 2000; i++) {
        const x = Math.random() * 10000;
        const y = Math.random() * 10000;
        txt += `${x.toFixed(2)} ${y.toFixed(2)} ${(x * 0.001).toFixed(3)}\n`;
    }
    let a, terrain;
    let threw = false;
    try {
        const pts = parseXyzPoints(txt);
        a = analyzeGeometry(pts);
        const header = buildHeader(a.extent, a.suggestedCellsize);
        const built = buildRegularDem(pts, header, { method: 'tin' });
        terrain = makeTerrainObject(built.data, header);
    } catch (e) {
        threw = true;
        console.error('    threw:', e.message);
    }
    assert(!threw, 'kein Throw bei irregulärer Riesen-Wolke');
    assert(a.isRegular === false, 'isRegular=false (scattered)');
    assert(terrain.ncols * terrain.nrows <= MAX_CELLS, `Zellzahl ≤ Budget (${terrain.ncols}×${terrain.nrows})`);
    assert(terrain.gridData.length === terrain.ncols * terrain.nrows, 'gridData-Länge = ncols*nrows');
}

// ── 3. TIN interpoliert eine bekannte Ebene exakt ─────────────────────────────
console.log('── 3. TIN-Ebene z = a·x + b·y + c ──');
{
    const fa = 0.3, fb = -0.2, fc = 10;
    const plane = (x, y) => fa * x + fb * y + fc;
    // Streupunkte über [0,100]²
    let txt = '';
    const P = [
        [0, 0], [100, 0], [0, 100], [100, 100],
        [50, 50], [25, 75], [75, 25], [10, 40], [60, 90], [90, 10],
    ];
    for (const [x, y] of P) txt += `${x} ${y} ${plane(x, y)}\n`;

    const { terrain } = importXyzTerrain(txt, { cellsize: 5, method: 'tin' });
    // Zelle nahe der Mitte (innerhalb der Konvexhülle) muss die Ebene treffen.
    const col = Math.round((50 - terrain.xll) / terrain.cellsize);
    const row = Math.round((50 - terrain.yll) / terrain.cellsize);
    const v = terrain.gridData[row * terrain.ncols + col];
    assert(v > -9000, 'Mittelzelle ist gefüllt');
    assert(approx(v, plane(terrain.xll + col * terrain.cellsize, terrain.yll + row * terrain.cellsize), 0.05),
        `TIN linear exakt (got ${v.toFixed(3)})`);
}

// ── 4. IDW-Fallback füllt Zellen am Hüllenrand ────────────────────────────────
console.log('── 4. IDW-Fallback am Rand ──');
{
    // Dreieck → große Teile der Bounding-Box liegen außerhalb der Hülle.
    const txt = '0 0 1\n100 0 1\n50 100 5\n0 100 3\n';
    const { terrain } = importXyzTerrain(txt, { cellsize: 10, method: 'tin' });
    let nodata = 0;
    for (let i = 0; i < terrain.gridData.length; i++)
        if (terrain.gridData[i] <= -9000) nodata++;
    assert(nodata === 0, `alle Randzellen per IDW gefüllt (übrig NODATA=${nodata})`);
    assert(terrain.minZ >= 1 - 1e-6 && terrain.maxZ <= 5 + 1e-6, 'Z bleibt im Quell-Wertebereich (zClamp)');
}

// ── 5. Header/Terrain-Invarianten ─────────────────────────────────────────────
console.log('── 5. Kanonische Terrain-Form ──');
{
    const txt = '10 20 1\n14 20 2\n10 24 3\n14 24 4\n';
    const { terrain } = importXyzTerrain(txt, { cellsize: 2, method: 'tin' });
    assert(approx(terrain.xll, terrain.xllcorner + terrain.cellsize / 2), 'xll = xllcorner + cs/2');
    assert(approx(terrain.bounds.width, (terrain.ncols - 1) * terrain.cellsize), 'bounds.width = (ncols-1)*cs');
    assert(terrain.stats.cols === terrain.ncols && terrain.stats.rows === terrain.nrows, 'stats spiegeln Dims');
    assert(NODATA === -9999, 'NODATA = -9999');
}

console.log(failures === 0 ? '\n✅ Alle Tests bestanden' : `\n❌ ${failures} Fehler`);
process.exit(failures === 0 ? 0 : 1);
