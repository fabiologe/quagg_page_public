// Test: SGC-Mehrfachkanal-Pipeline (Channel-Tool) — generateMultiSgcRasters,
// buildSgcChanPramsFile, mergeSgcChannels (middleware/SgcGenerator.js).
// Ausführen: node src/features/flood-2D/test/test_sgc_channels.mjs   (aus client/)
import { generateMultiSgcRasters, buildSgcChanPramsFile, mergeSgcChannels, generateSgcRasters } from '../middleware/SgcGenerator.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const mkHeader = (ncols = 20, nrows = 20, cellsize = 1) => ({
    ncols, nrows, cellsize, xllcorner: 0, yllcorner: 0,
});
const mkFlatDem = (ncols, nrows, z = 10) => new Float32Array(ncols * nrows).fill(z);
const idxAt = (header, x, y) => Math.round(y / header.cellsize) * header.ncols + Math.round(x / header.cellsize);

console.log('── generateMultiSgcRasters: zwei getrennte Kanäle → beide gestempelt, eigene Gruppen-Indizes ──');
{
    const header = mkHeader(20, 20, 1);
    const dem = mkFlatDem(20, 20, 10);
    const channelA = { polyline: [{ x: 2, y: 5, terrainZ: 10 }, { x: 8, y: 5, terrainZ: 10 }], shape: 'rect', bedWidth: 2, bedMode: 'depth', bedDepth: 1 };
    const channelB = { polyline: [{ x: 2, y: 15, terrainZ: 10 }, { x: 8, y: 15, terrainZ: 10 }], shape: 'rect', bedWidth: 2, bedMode: 'depth', bedDepth: 1 };
    const result = generateMultiSgcRasters([channelA, channelB], dem, header);

    const idxA = idxAt(header, 5, 5);
    const idxB = idxAt(header, 5, 15);
    assert(result.width[idxA] > 0, 'Kanal A gestempelt (width>0)');
    assert(result.width[idxB] > 0, 'Kanal B gestempelt (width>0)');
    assert(result.group[idxA] === 0, `Kanal-A-Zelle bekommt Gruppen-Index 0 (war ${result.group[idxA]})`);
    assert(result.group[idxB] === 1, `Kanal-B-Zelle bekommt Gruppen-Index 1 (war ${result.group[idxB]})`);
    assert(close(result.bed[idxA], 9), 'Sohlhöhe Kanal A = terrainZ - bedDepth = 9');

    // Referenz: Ergebnis muss dem Einzelkanal-Generator für denselben Kanal entsprechen
    // (generateSgcRasters erwartet channel.width, nicht bedWidth — hier normalisiert).
    const single = generateSgcRasters({ ...channelA, width: channelA.bedWidth }, dem, header);
    assert(close(result.width[idxA], single.width[idxA]), 'Breite an Kanal-A-Zelle deckt sich mit generateSgcRasters (Einzelkanal)');
}

console.log('── generateMultiSgcRasters: überlappende Kanäle → erster in der Liste gewinnt ──');
{
    const header = mkHeader(20, 20, 1);
    const dem = mkFlatDem(20, 20, 10);
    // Beide Linien liegen auf derselben Zeile y=10 — Korridore überlappen vollständig.
    const first  = { polyline: [{ x: 2, y: 10, terrainZ: 10 }, { x: 10, y: 10, terrainZ: 10 }], shape: 'rect', bedWidth: 3, bedMode: 'depth', bedDepth: 1 };
    const second = { polyline: [{ x: 2, y: 10, terrainZ: 10 }, { x: 10, y: 10, terrainZ: 10 }], shape: 'trapezoid', bedWidth: 3, bedMode: 'depth', bedDepth: 2, sideSlope: 1 };
    const result = generateMultiSgcRasters([first, second], dem, header);

    const idx = idxAt(header, 5, 10);
    assert(result.group[idx] === 0, 'überlappende Zelle gehört dem ZUERST gelisteten Kanal (Gruppe 0)');
    assert(close(result.bed[idx], 9), 'Sohlhöhe entspricht dem ersten Kanal (Tiefe 1, nicht 2 vom zweiten)');
}

console.log('── generateMultiSgcRasters: leere Liste → 0 Zellen ──');
{
    const header = mkHeader(20, 20, 1);
    const dem = mkFlatDem(20, 20, 10);
    const result = generateMultiSgcRasters([], dem, header);
    assert(result.cellCount === 0, 'leere Kanal-Liste ergibt cellCount 0');
    assert(result.width.every(w => w === 0), 'alle Breiten-Zellen bleiben 0');
}

console.log('── buildSgcChanPramsFile: Textformat (LoadSGCChanPrams-kompatibel) ──');
{
    const channels = [
        { shape: 'rect', manningN: 0.03 },
        { shape: 'rect', manningN: 0.035 },
    ];
    const text = buildSgcChanPramsFile(channels);
    const lines = text.trim().split('\n');
    assert(lines.length === 3, `3 Zeilen (Anzahl + 2 Kanäle), war ${lines.length}`);
    assert(lines[0] === '2', `erste Zeile ist die Kanalzahl "2" (war "${lines[0]}")`);
    const fields0 = lines[1].split(' ');
    assert(fields0[0] === '0' && fields0[1] === '1', `Kanal 0: Index 0, Typ 1 (Rechteck) — Zeile "${lines[1]}"`);
    assert(fields0[4] === '0', 'Neigung-Feld 0');
    const fields1 = lines[2].split(' ');
    assert(fields1[0] === '1' && fields1[1] === '1', `Kanal 1: Index 1, Typ 1 (Rechteck) — Zeile "${lines[2]}"`);
    assert(fields1[5] === '0.035', `Manning n übernommen (war ${fields1[5]})`);
}

console.log('── buildSgcChanPramsFile: Trapez exportiert als Typ 7 mit Böschungsneigung ──');
{
    // Seit quagg-sgc-trapezoid.patch + quagg-sgc-bridge-blowup.patch (2026-07-25) ist
    // SGCchan_type 7 im Solver vollständig und sicher nutzbar (auch mit Brücke darüber).
    const channels = [{ shape: 'trapezoid', sideSlope: 1.5, manningN: 0.035 }];
    const text = buildSgcChanPramsFile(channels);
    const fields = text.trim().split('\n')[1].split(' ');
    assert(fields[1] === '7', `Trapez-Kanal exportiert als Typ 7 (war Typ ${fields[1]})`);
    assert(fields[4] === '1.5', `Böschungsneigung übernommen (Neigung-Feld war "${fields[4]}", muss 1.5 sein)`);
}

console.log('── buildSgcChanPramsFile: Rechteck-Kanal ohne sideSlope exportiert Neigung 0 ──');
{
    const channels = [{ shape: 'rect', manningN: 0.03 }];
    const text = buildSgcChanPramsFile(channels);
    const fields = text.trim().split('\n')[1].split(' ');
    assert(fields[1] === '1', `Rechteck-Kanal exportiert als Typ 1 (war Typ ${fields[1]})`);
    assert(fields[4] === '0', `Neigung-Feld bleibt 0 für Rechteck (war "${fields[4]}")`);
}

console.log('── buildSgcChanPramsFile: leere Liste → nur die "0"-Kopfzeile ──');
{
    assert(buildSgcChanPramsFile([]) === '0\n', 'leere Liste ergibt genau "0\\n"');
}

console.log('── mergeSgcChannels: Legacy-Einzelkanal + neue Liste, Reihenfolge & Normalisierung ──');
{
    const legacy = { polyline: [{ x: 0, y: 0, terrainZ: 10 }, { x: 5, y: 0, terrainZ: 10 }], width: 4, bedMode: 'depth', bedDepth: 1.2, manningN: 0.028 };
    const list = [{ id: 'c1', polyline: [{ x: 0, y: 5 }, { x: 5, y: 5 }], shape: 'trapezoid', bedWidth: 2, sideSlope: 2 }];
    const merged = mergeSgcChannels(legacy, list);
    assert(merged.length === 2, 'Legacy-Kanal + 1 Listen-Kanal = 2 Einträge');
    assert(merged[0].shape === 'rect', 'Legacy-Kanal wird als shape:"rect" normalisiert');
    assert(merged[0].bedWidth === 4, 'Legacy width → bedWidth übernommen');
    assert(merged[1] === list[0], 'Listen-Kanal wird unverändert übernommen (Referenz)');
}

console.log('── mergeSgcChannels: Legacy mit < 2 Punkten wird ausgeschlossen ──');
{
    const legacyTooShort = { polyline: [{ x: 0, y: 0, terrainZ: 10 }], width: 4, bedDepth: 1 };
    const merged = mergeSgcChannels(legacyTooShort, []);
    assert(merged.length === 0, 'Legacy-Kanal mit nur 1 Punkt wird nicht aufgenommen');
}

console.log('── mergeSgcChannels: kein Legacy-Kanal (null) + leere Liste → [] ──');
{
    assert(mergeSgcChannels(null, []).length === 0, 'null-Legacy + leere Liste ergibt []');
    assert(mergeSgcChannels(null, undefined).length === 0, 'undefined-Liste wird wie leere Liste behandelt');
}

console.log(failures === 0 ? '\n✅ Alle SGC-Mehrfachkanal-Tests bestanden.' : `\n❌ ${failures} Test(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
