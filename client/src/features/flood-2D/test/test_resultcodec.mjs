// Round-Trip-Test für services/solver/resultCodec.js
// Ausführen: node src/features/flood-2D/test/test_resultcodec.mjs (aus client/)
import { encodeFrame, decodeFrame } from '../services/solver/resultCodec.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) { console.log(`  ✅ ${msg}`); }
    else { console.error(`  ❌ ${msg}`); failures++; }
};

console.log('── resultCodec Round-Trip ──');

// 1. Frame mit depth + vx + vy
{
    const ncols = 7, nrows = 5, n = ncols * nrows;
    const depth = new Float32Array(n).map((_, i) => i * 0.01);
    const vx = new Float32Array(n).map((_, i) => Math.sin(i));
    const vy = new Float32Array(n).map((_, i) => Math.cos(i));
    depth[3] = -9999; // NoData muss unverändert durchlaufen

    const meta = {
        frame: 12, time: 720,
        ncols, nrows, cellsize: 1.5,
        xllcorner: 32500000.25, yllcorner: 5650000.75,
        min: 0, max: 1.84
    };
    const buf = encodeFrame(meta, { depth, vx, vy });
    assert(buf instanceof ArrayBuffer, 'encode liefert ArrayBuffer');
    assert(buf.byteLength >= n * 3 * 4, `Puffergröße plausibel (${buf.byteLength} B)`);

    const { meta: m, channels } = decodeFrame(buf);
    assert(m.frame === 12 && m.time === 720, 'Meta: frame/time erhalten');
    assert(m.ncols === ncols && m.nrows === nrows && m.cellsize === 1.5, 'Meta: Grid-Dimensionen erhalten');
    assert(m.xllcorner === 32500000.25 && m.yllcorner === 5650000.75, 'Meta: Koordinaten exakt (keine Float-Verluste im JSON)');
    assert(Array.isArray(m.channels) && m.channels.join() === 'depth,vx,vy', 'Meta: Kanal-Reihenfolge erhalten');

    const eq = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]) || v === b[i]);
    assert(eq([...channels.depth], [...depth]), 'depth bit-identisch (inkl. NoData -9999)');
    assert(eq([...channels.vx], [...vx]), 'vx bit-identisch');
    assert(eq([...channels.vy], [...vy]), 'vy bit-identisch');
}

// 2. Einzelkanal (Max-Grid) + Umlaute/Sonderzeichen im Header
{
    const ncols = 3, nrows = 2;
    const depth = new Float32Array([0, 0.5, 1, 1.5, 2, 2.5]);
    const buf = encodeFrame({ frame: -1, ncols, nrows, label: 'Max-Tiefe (über alles) ☂' }, { depth });
    const { meta, channels } = decodeFrame(buf);
    assert(meta.label === 'Max-Tiefe (über alles) ☂', 'UTF-8 im JSON-Header (Padding korrekt)');
    assert(channels.depth[5] === 2.5, 'Einzelkanal-Werte korrekt');
}

// 3. Korrupte Puffer werden abgelehnt
{
    let threw = false;
    try { decodeFrame(new ArrayBuffer(8)); } catch { threw = true; }
    assert(threw, 'korrupter Puffer (zu klein) wirft Fehler');

    const ncols = 4, nrows = 4;
    const good = encodeFrame({ frame: 0, ncols, nrows }, { depth: new Float32Array(16) });
    let threw2 = false;
    try { decodeFrame(good.slice(0, good.byteLength - 8)); } catch { threw2 = true; }
    assert(threw2, 'abgeschnittener Puffer wirft Fehler');
}

console.log(failures === 0 ? '\n✅ Alle Codec-Tests bestanden.' : `\n❌ ${failures} Test(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
