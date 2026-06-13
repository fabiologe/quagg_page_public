// Tests für SgcGenerator (Sub-Grid-Channel-Raster)
// Ausführen: node src/features/flood-2D/test/test_sgc.mjs (aus client/)
import { generateSgcRasters } from '../middleware/SgcGenerator.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};
const approx = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

console.log('── SgcGenerator ──');

// Flaches DEM z=10, 40×20 @1m, Zentren-Ursprung (0,0)
const header = { ncols: 40, nrows: 20, cellsize: 1, xllcorner: -0.5, yllcorner: -0.5, xll: 0, yll: 0 };
const dem = new Float32Array(40 * 20).fill(10);

// 1. Gerader E-W-Kanal, Breite 4 m, Sohltiefe 1.5 m
{
    const channel = {
        polyline: [{ x: 5, y: 10, terrainZ: 10 }, { x: 35, y: 10, terrainZ: 10 }],
        width: 4, bedMode: 'depth', bedDepth: 1.5, manningN: 0.03
    };
    const { width, bed, bank, cellCount } = generateSgcRasters(channel, dem, header);

    assert(cellCount > 0, `Zellen gestempelt (${cellCount})`);
    // Auf der Mittellinie: width=4, bed=8.5, bank=10
    const mid = 10 * 40 + 20;
    assert(width[mid] === 4, `Mittellinie: SGCwidth = 4 (got ${width[mid]})`);
    assert(approx(bed[mid], 8.5), `Mittellinie: SGCbed = 10−1.5 = 8.5 (got ${bed[mid]})`);
    assert(bank[mid] === 10, `Mittellinie: SGCbank = DEM = 10 (got ${bank[mid]})`);

    // Korridor: halfCorridor = max(4,1)/2 = 2 → Zeilen 8..12 bei x=20 gestempelt, Zeile 7/13 nicht
    assert(width[8 * 40 + 20] === 4 && width[12 * 40 + 20] === 4, 'Korridor ±2 m gestempelt');
    assert(width[6 * 40 + 20] === 0 && width[14 * 40 + 20] === 0, 'außerhalb Korridor: width = 0');
    assert(bed[6 * 40 + 20] === -9999 && bank[6 * 40 + 20] === -9999, 'außerhalb: bed/bank = NoData');
}

// 2. Schmaler Kanal (0.5 m < Zellweite) → Korridor mindestens 1 Zelle breit, lückenlos
{
    const channel = {
        polyline: [{ x: 2, y: 5, terrainZ: 10 }, { x: 38, y: 5, terrainZ: 10 }],
        width: 0.5, bedMode: 'depth', bedDepth: 1.0
    };
    const { width, cellCount } = generateSgcRasters(channel, dem, header);
    assert(cellCount >= 36, `Sub-Zellen-Kanal lückenlos (${cellCount} Zellen)`);
    let gapless = true;
    for (let c = 3; c <= 37; c++) if (width[5 * 40 + c] !== 0.5) gapless = false;
    assert(gapless, 'SGCwidth = 0.5 entlang der gesamten Linie (Gerinne schmaler als Zelle)');
}

// 3. Bogenlängen-Interpolation der Sohle (geneigter 2-Vertex-Kanal, bedMode depth)
{
    const channel = {
        polyline: [{ x: 5, y: 15, terrainZ: 12 }, { x: 35, y: 15, terrainZ: 9 }],
        width: 2, bedMode: 'depth', bedDepth: 1.0
    };
    const { bed } = generateSgcRasters(channel, dem, header);
    // Vertex-Sohlen: 11 (Start) und 8 (Ende); Mitte (x=20, t=0.5) → 9.5
    const midIdx = 15 * 40 + 20;
    assert(approx(bed[midIdx], 9.5, 0.06), `Sohle bogenlängen-interpoliert: Mitte ≈ 9.5 (got ${bed[midIdx].toFixed(3)})`);
    assert(approx(bed[15 * 40 + 5], 11, 0.06), `Start-Sohle ≈ 11 (got ${bed[15 * 40 + 5].toFixed(3)})`);
}

// 4. bedMode 'absolute'
{
    const channel = {
        polyline: [{ x: 5, y: 3, terrainZ: 10 }, { x: 35, y: 3, terrainZ: 10 }],
        width: 2, bedMode: 'absolute', bedZStart: 7, bedZEnd: 5
    };
    const { bed } = generateSgcRasters(channel, dem, header);
    assert(approx(bed[3 * 40 + 5], 7, 0.06) && approx(bed[3 * 40 + 20], 6, 0.06), 'absolute Sohle: 7 → 6 (Mitte) → 5');
}

// 5. NoData-DEM wird übersprungen
{
    const demHole = dem.slice();
    demHole[10 * 40 + 25] = -9999;
    const channel = {
        polyline: [{ x: 5, y: 10, terrainZ: 10 }, { x: 35, y: 10, terrainZ: 10 }],
        width: 1, bedMode: 'depth', bedDepth: 1
    };
    const { width, bank } = generateSgcRasters(channel, demHole, header);
    assert(width[10 * 40 + 25] === 0 && bank[10 * 40 + 25] === -9999, 'NoData-DEM-Zelle nicht gestempelt');
}

// 6. Degenerierte Eingabe
{
    const { cellCount } = generateSgcRasters({ polyline: [{ x: 1, y: 1, terrainZ: 10 }], width: 2 }, dem, header);
    assert(cellCount === 0, '1-Punkt-Polyline → 0 Zellen, kein Crash');
}

console.log(failures === 0 ? '\n✅ Alle SGC-Tests bestanden.' : `\n❌ ${failures} Test(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
