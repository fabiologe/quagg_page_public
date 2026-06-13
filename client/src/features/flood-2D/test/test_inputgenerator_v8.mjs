// End-to-End-Test: processScenario mit Genauigkeits-Features (v8/RUNPOD)
// + Regressions-Gate für den v5-Pfad (WASM).
// Ausführen: node src/features/flood-2D/test/test_inputgenerator_v8.mjs (aus client/)
import { InputGenerator } from '../middleware/InputGenerator.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};

// Synthetisches Szenario: 20×20 @5m Rampe, Editor-Stil-Header (xllcorner = Zentren)
function makeScenario(extra = {}) {
    const ncols = 20, nrows = 20, cellsize = 5;
    const gridData = new Float32Array(ncols * nrows);
    for (let r = 0; r < nrows; r++)
        for (let c = 0; c < ncols; c++)
            gridData[r * ncols + c] = 10 + 0.05 * c * cellsize;
    return {
        grid: { ncols, nrows, cellsize, xllcorner: 0, yllcorner: 0, gridData, data: gridData },
        boundaries: [], manholes: [], assignments: {}, ganglinien: {},
        globalRoughness: 0.04,
        globalBoundaryType: 'FREE',
        config: { sim_time: '600.0', initial_tstep: '1.0', saveint: '60.0', massint: '60.0', acceleration: '' },
        weirs: [
            { x: 20, y: 50, direction: 'S', Cd: 1.7, hc: 11, m: 0.667, w: 5, lineId: 'W1' },
            { x: 40, y: 50, direction: 'S', Cd: 1.7, hc: 11, m: 0.667, w: 5, lineId: 'W1' }
        ],
        bridges: [{
            id: 'B1', axis: [{ x: 20, y: 25 }, { x: 50, y: 25 }],
            z_sohle: 10.5, soffit: 13, deck: 14, width: 6, Cd: 1.2, Tz: 1.5,
            cells: [{ x: 20, y: 25, z: 10.5, direction: 'S' }, { x: 25, y: 25, z: 10.5, direction: 'S' }]
        }],
        ...extra
    };
}

const parLines = (files) => files['run.par'].split('\n').map(l => l.trim());
const hasKw = (files, kw) => parLines(files).some(l => l.startsWith(kw));
const ascHeader = (asc) => Object.fromEntries(
    asc.split('\n').slice(0, 6).map(l => l.trim().split(/\s+/)).map(([k, v]) => [k, parseFloat(v)]));

console.log('── v5-Regressions-Gate (WASM-Pfad unverändert) ──');
{
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario());
    assert(files['terrain.asc'] && files['run.par'] && files['flow.weir'], 'Standard-Dateien erzeugt');

    const h = ascHeader(files['terrain.asc']);
    assert(h.ncols === 20 && h.nrows === 20 && h.cellsize === 5, 'terrain.asc unverändert bei nativer Auflösung');

    for (const kw of ['fv1', 'SGCwidth', 'SGCbed', 'SGCbank', 'SGCn', 'SGCchan']) {
        assert(!hasKw(files, kw), `run.par v5: kein '${kw}'-Keyword`);
    }
    assert(hasKw(files, 'acceleration'), 'run.par v5: acceleration aus configOverride erhalten');

    // Brücke: Legacy 2-Zeilen-Format (2 Zellen × 2) + 2 Wehre = 6
    const weirLines = files['flow.weir'].trim().split('\n');
    assert(weirLines[0] === '6', `flow.weir v5: 6 Einträge (2 Wehr + 4 Brücke) (got ${weirLines[0]})`);
    assert(!files['flow.weir'].includes('SB') && !files['flow.weir'].includes('EB'), 'flow.weir v5: keine <dir>B-Tags');
}

console.log('── v8: Export-Resampling 5m → 1m ──');
{
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({ engine: 'v8', exportCellsize: 1 }));
    const h = ascHeader(files['terrain.asc']);
    assert(h.ncols === 100 && h.nrows === 100 && h.cellsize === 1, `terrain.asc resampelt auf 100×100@1m (got ${h.ncols}×${h.nrows}@${h.cellsize})`);
    assert(h.xllcorner === -2.5 && h.yllcorner === -2.5, `xllcorner = Ecke (−2.5) erhalten (got ${h.xllcorner})`);

    // Brücke @1m: 30m-Achse → 31 <dir>B-Zeilen; Wehr-Linie 20m → 21 Zellen
    const wl = files['flow.weir'].trim().split('\n');
    const bridgeCount = wl.filter(l => / SB /.test(l)).length;
    assert(bridgeCount === 31, `Brücke re-diskretisiert @1m: 31 SB-Zeilen (got ${bridgeCount})`);
    assert(wl[0] === String(31 + 21), `Gesamtzahl 52 (31 Brücke + 21 Wehr) (got ${wl[0]})`);
}

console.log('── v8: SGC + Schema-Erzwingung ──');
{
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({
        engine: 'v8',
        numericalScheme: 'fv1', // wird durch SGC überschrieben
        sgc: {
            polyline: [{ x: 10, y: 50, terrainZ: 10.5 }, { x: 90, y: 50, terrainZ: 10.5 }],
            width: 3, bedMode: 'depth', bedDepth: 1.2, manningN: 0.025
        }
    }));
    assert(files['sgc.width.asc'] && files['sgc.bed.asc'] && files['sgc.bank.asc'], 'SGC-Raster geschrieben');
    for (const [kw, val] of [['SGCwidth', 'sgc.width.asc'], ['SGCbed', 'sgc.bed.asc'], ['SGCbank', 'sgc.bank.asc'], ['SGCn', '0.0250'], ['SGCchan', '1']]) {
        assert(parLines(files).some(l => l.startsWith(kw) && l.includes(val)), `run.par: ${kw} → ${val}`);
    }
    assert(hasKw(files, 'acceleration') && !hasKw(files, 'fv1'), 'SGC erzwingt acceleration (fv1 verworfen)');
    assert(gen.warnings.some(w => w.includes('inkompatibel')), 'Warnung über Schema-Konflikt vorhanden');
}

console.log('── v8: fv1 ohne SGC ──');
{
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({ engine: 'v8', numericalScheme: 'fv1' }));
    assert(hasKw(files, 'fv1') && !hasKw(files, 'acceleration'), 'fv1-Keyword gesetzt, acceleration entfernt');
}

console.log('── Warnungen (Resampling-Plausibilität) ──');
{
    const gen = new InputGenerator();
    gen.processScenario(makeScenario({ engine: 'v8', exportCellsize: 0.5 })); // 5/0.5 = 10 > 8
    assert(gen.warnings.some(w => w.includes('1/8')), 'Warnung: feiner als 1/8 der Datengrundlage');
}

console.log(failures === 0 ? '\n✅ Alle InputGenerator-v8-Tests bestanden.' : `\n❌ ${failures} Test(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
