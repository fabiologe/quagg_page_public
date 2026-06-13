// Tests für Struktur-Re-Diskretisierung + engine-bewusste flow.weir-Generierung
// Ausführen: node src/features/flood-2D/test/test_structure_discretize.mjs (aus client/)
import { InputGenerator } from '../middleware/InputGenerator.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};

const gen = new InputGenerator();
const mkHeader = (cs, ncols = 100, nrows = 100) => ({
    ncols, nrows, cellsize: cs,
    xllcorner: -cs / 2, yllcorner: -cs / 2, xll: 0, yll: 0
});

console.log('── discretizeStructureAxis ──');

// 1. Achsparallele Achse (W→E), 20 m lang
{
    const h5 = mkHeader(5);
    const h1 = mkHeader(1);
    const axis = [[0, 0], [20, 0]];
    const c5 = gen.discretizeStructureAxis(axis, h5);
    const c1 = gen.discretizeStructureAxis(axis, h1);
    assert(c5.length === 5, `E-W-Achse @5m → 5 Zellen (got ${c5.length})`);
    assert(c1.length === 21, `E-W-Achse @1m → 21 Zellen (got ${c1.length})`);
    assert(c5.every(c => c.direction === 'S'), 'E-W-Linie → alle Richtungen S (blockt N-S-Fluss)');
    // Lückenlosigkeit bei 1m: aufeinanderfolgende Spalten
    const cols = c1.map(c => c.col).sort((a, b) => a - b);
    const gapless = cols.every((c, i) => i === 0 || c - cols[i - 1] <= 1);
    assert(gapless, 'E-W-Achse @1m lückenlos (kein Durchfluss zwischen Zellen)');
}

// 2. N-S-Achse → Richtung E
{
    const h1 = mkHeader(1);
    const cells = gen.discretizeStructureAxis([[10, 0], [10, 8]], h1);
    assert(cells.length === 9, `N-S-Achse @1m → 9 Zellen (got ${cells.length})`);
    assert(cells.every(c => c.direction === 'E'), 'N-S-Linie → alle Richtungen E (blockt E-W-Fluss)');
}

// 3. Diagonale: Welt-Koordinaten = Zellzentren, Richtungs-Mix
{
    const h2 = mkHeader(2);
    const cells = gen.discretizeStructureAxis([[0, 0], [10, 10]], h2);
    assert(cells.length >= 6, `Diagonale @2m → ≥6 Zellen (got ${cells.length})`);
    const hasE = cells.some(c => c.direction === 'E');
    const hasS = cells.some(c => c.direction === 'S');
    assert(hasE && hasS, 'Diagonale → Mix aus E- und S-Richtungen');
    // Zellzentren liegen auf dem Raster (xll=0, cs=2 → gerade Koordinaten)
    assert(cells.every(c => c.x % 2 === 0 && c.y % 2 === 0), 'Welt-Koordinaten = Zellzentren');
}

console.log('── generateWeirFile: v5 (Legacy, byte-identisch) ──');

const bridgeFixture = {
    id: 'br-test-1',
    axis: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
    z_sohle: 10, soffit: 12.5, deck: 13.5, width: 8, Cd: 1.2, Tz: 1.5,
    cells: [
        { x: 0,  y: 0, z: 10.0, direction: 'S' },
        { x: 5,  y: 0, z: 10.1, direction: 'S' },
        { x: 10, y: 0, z: 10.2, direction: 'S' }
    ]
};
const weirFixture = [
    { x: 0, y: 5, direction: 'S', Cd: 1.7, hc: 11, m: 0.667, w: 5, lineId: 'L1' },
    { x: 5, y: 5, direction: 'S', Cd: 1.7, hc: 11, m: 0.667, w: 5, lineId: 'L1' }
];

{
    const out = gen.generateWeirFile(weirFixture, [bridgeFixture]); // default engine v5, kein header
    const lines = out.trim().split('\n');
    assert(lines[0] === '8', `v5: 2 Wehr- + 6 Brücken-Zeilen (2/Zelle) (got n=${lines[0]})`);
    // Legacy-Golden-Strings: per-Zelle z als Soffit-Linie, bridge.width wiederholt
    assert(lines[3] === '0.00 0.00  S  1.2000  10.0000  0.6670  8.0000', 'v5 Soffit-Zeile byte-identisch zum Legacy-Format');
    assert(lines[4] === '0.00 0.00  S  1.2000  12.5000  0.6670  8.0000', 'v5 Deck-Zeile byte-identisch zum Legacy-Format');
    assert(!out.includes('SB') && !out.includes('EB'), 'v5: keine Brücken-Tags');
}

console.log('── generateWeirFile: v8 (Re-Diskretisierung + Orifice-Tags) ──');

{
    const h1 = mkHeader(1);
    const out = gen.generateWeirFile(weirFixture, [bridgeFixture], h1, { engine: 'v8' });
    const lines = out.trim().split('\n');
    const bridgeLines = lines.filter(l => / [SE]B /.test(l));
    const weirLines = lines.filter(l => / [SE] {2}/.test(l));

    // Brücke: 20m-Achse @1m → 21 Zellen, je EINE <dir>B-Zeile
    assert(bridgeLines.length === 21, `v8: 21 Brücken-Zellen mit <dir>B-Tag (got ${bridgeLines.length})`);
    assert(bridgeLines.every(l => l.includes(' SB ')), 'v8: E-W-Brücke → SB-Tag');
    // hc = Soffit (12.5), m = Tz (1.5)
    assert(bridgeLines.every(l => l.includes('12.5000') && l.includes('1.5000')), 'v8: hc=Soffit, m=Tz');
    // Öffnungsbreite aufgeteilt: min(1, 8/21) ≈ 0.381 — Summe ≈ bridge.width
    const wSum = bridgeLines.reduce((s, l) => s + parseFloat(l.trim().split(/\s+/).pop()), 0);
    assert(Math.abs(wSum - 8) < 0.05, `v8: Summe der Öffnungsbreiten ≈ 8 m (got ${wSum.toFixed(2)})`);

    // Wehr-Linie L1 (0,5)→(5,5) @1m → 6 Zellen, lückenlos, w = cellsize
    assert(weirLines.length === 6, `v8: Wehr-Linie re-diskretisiert auf 6 Zellen @1m (got ${weirLines.length})`);
    assert(weirLines.every(l => l.trim().endsWith('1.0000')), 'v8: Wehr w = Zellweite (vollflächig)');
}

// v8: Wehr ohne lineId bleibt unverändert (Legacy-Einzelzellen)
{
    const h1 = mkHeader(1);
    const legacyWeir = [{ x: 3, y: 3, direction: 'E', Cd: 1.7, hc: 9, m: 0.667, w: 5, lineId: null }];
    const out = gen.generateWeirFile(legacyWeir, [], h1, { engine: 'v8' });
    const lines = out.trim().split('\n');
    assert(lines[0] === '1' && lines[1].startsWith('3.00 3.00  E'), 'v8: Alt-Zelle ohne lineId unverändert');
}

console.log(failures === 0 ? '\n✅ Alle Struktur-Tests bestanden.' : `\n❌ ${failures} Test(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
