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

    for (const kw of ['fv1', 'SGCwidth', 'SGCbed', 'SGCbank', 'SGCn', 'SGCchangroup', 'SGCchanprams']) {
        assert(!hasKw(files, kw), `run.par v5: kein '${kw}'-Keyword`);
    }
    assert(hasKw(files, 'acceleration'), 'run.par v5: acceleration aus configOverride erhalten');

    // Brücke: Legacy 2-Zeilen-Format (2 Zellen × 2) + 2 Wehre = 6
    const weirLines = files['flow.weir'].trim().split('\n');
    assert(weirLines[0] === '6', `flow.weir v5: 6 Einträge (2 Wehr + 4 Brücke) (got ${weirLines[0]})`);
    assert(!files['flow.weir'].includes('SB') && !files['flow.weir'].includes('EB'), 'flow.weir v5: keine <dir>B-Tags');
}

console.log('── v8: Struktur-Diskretisierung @ nativ (Export-Resampling entfernt) ──');
{
    // Solver rechnet immer in nativer Auflösung — kein exportCellsize mehr. Die detaillierten
    // Diskretisierungs-Counts deckt test_structure_discretize.mjs ab; hier nur ein Smoke-Check.
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({ engine: 'v8' }));
    const h = ascHeader(files['terrain.asc']);
    assert(h.ncols === 20 && h.nrows === 20 && h.cellsize === 5, 'terrain.asc bleibt nativ (20×20@5m)');
    const wl = files['flow.weir'].trim().split('\n');
    assert(wl.some(l => / SB /.test(l)), 'v8: Brücke als <dir>B (SB) re-diskretisiert');
    assert(parseInt(wl[0], 10) === wl.length - 1, 'flow.weir: Zähler == tatsächliche Zeilenzahl');
}

console.log('── v8: SGC (Mehrfachkanal) + Schema-Erzwingung ──');
{
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({
        engine: 'v8',
        numericalScheme: 'fv1', // wird durch SGC überschrieben
        sgcChannels: [{
            shape: 'rect',
            polyline: [{ x: 10, y: 50, terrainZ: 10.5 }, { x: 90, y: 50, terrainZ: 10.5 }],
            bedWidth: 3, bedMode: 'depth', bedDepth: 1.2, manningN: 0.025
        }]
    }));
    assert(files['sgc.width.asc'] && files['sgc.bed.asc'] && files['sgc.bank.asc'] && files['sgc.group.asc'], 'SGC-Raster geschrieben (inkl. Gruppen-Raster)');
    assert(!!files['sgc.chanprams.txt'], 'sgc.chanprams.txt geschrieben');
    assert(files['sgc.chanprams.txt'].trim() === '1\n0 1 0.78 0.12 0 0.025 1 -1', `chanprams: 1 Rechteck-Kanal, Typ 1 (Inhalt: ${JSON.stringify(files['sgc.chanprams.txt'])})`);
    for (const [kw, val] of [['SGCwidth', 'sgc.width.asc'], ['SGCbed', 'sgc.bed.asc'], ['SGCbank', 'sgc.bank.asc'], ['SGCn', '0.0250'], ['SGCchangroup', 'sgc.group.asc'], ['SGCchanprams', 'sgc.chanprams.txt']]) {
        assert(parLines(files).some(l => l.startsWith(kw) && l.includes(val)), `run.par: ${kw} → ${val}`);
    }
    assert(!hasKw(files, 'SGCchan '), 'run.par: kein globales SGCchan-Skalar mehr (durch SGCchangroup/-prams ersetzt)');
    assert(hasKw(files, 'acceleration') && !hasKw(files, 'fv1'), 'SGC erzwingt acceleration (fv1 verworfen)');
    assert(gen.warnings.some(w => w.includes('inkompatibel')), 'Warnung über Schema-Konflikt vorhanden');
}

console.log('── v8: SGC Mehrfachkanal (Rechteck + Trapez) — Trapez exportiert als echter Typ 7 ──');
{
    // Seit quagg-sgc-trapezoid.patch + quagg-sgc-bridge-blowup.patch (beide 2026-07-25)
    // ist SGCchan_type 7 im Solver vollständig und sicher nutzbar (auch mit Brücke darüber).
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({
        engine: 'v8',
        sgcChannels: [
            { shape: 'rect', polyline: [{ x: 10, y: 30, terrainZ: 10.5 }, { x: 90, y: 30, terrainZ: 10.5 }], bedWidth: 3, bedMode: 'depth', bedDepth: 1.0, manningN: 0.03 },
            { shape: 'trapezoid', polyline: [{ x: 10, y: 70, terrainZ: 11 }, { x: 90, y: 70, terrainZ: 11 }], bedWidth: 2, bedMode: 'depth', bedDepth: 1.5, sideSlope: 1.5, manningN: 0.035 },
        ],
    }));
    const chanprams = files['sgc.chanprams.txt'].trim().split('\n');
    assert(chanprams[0] === '2', `chanprams: 2 Kanäle (war ${chanprams[0]})`);
    assert(chanprams[1].startsWith('0 1 '), `Kanal 0 = Rechteck (Typ 1): "${chanprams[1]}"`);
    assert(chanprams[2].startsWith('1 7 '), `Kanal 1 (shape:trapezoid) exportiert als Typ 7 (war "${chanprams[2]}")`);
    assert(chanprams[2].includes(' 1.5 '), `Böschungsneigung übernommen (Zeile: "${chanprams[2]}")`);
}

console.log('── v8: fv1 ohne SGC ──');
{
    const gen = new InputGenerator();
    const files = gen.processScenario(makeScenario({ engine: 'v8', numericalScheme: 'fv1' }));
    assert(hasKw(files, 'fv1') && !hasKw(files, 'acceleration'), 'fv1-Keyword gesetzt, acceleration entfernt');
}


console.log(failures === 0 ? '\n✅ Alle InputGenerator-v8-Tests bestanden.' : `\n❌ ${failures} Test(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
