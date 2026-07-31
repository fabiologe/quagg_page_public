/**
 * Roundtrip-Test für geoTiffWriter.js: schreiben → mit eigenem Mini-Parser
 * (unabhängige Implementierung, node:zlib zum Entpacken) wieder lesen und
 * Pixelwerte + Georeferenz + NoData + Multi-Strip-Fall verifizieren.
 *
 * Aufruf:  node src/features/flood-2D/test/test_geotiff_writer.mjs
 */
import { inflateSync } from 'node:zlib';
import { writeGeoTiff } from '../utils/geoTiffWriter.js';

let failures = 0;
function check(name, cond, detail = '') {
    console.log(`  [${cond ? 'OK ' : 'FAIL'}] ${name}${cond || !detail ? '' : ' — ' + detail}`);
    if (!cond) failures++;
}

const TYPE_SIZE = { 2: 1, 3: 2, 4: 4, 12: 8 };

function parseTiff(buf) {
    const view = new DataView(buf);
    if (view.getUint16(0, true) !== 0x4949 || view.getUint16(2, true) !== 42) {
        throw new Error('kein little-endian TIFF');
    }
    const ifdOff = view.getUint32(4, true);
    const n = view.getUint16(ifdOff, true);
    const tags = {};
    for (let i = 0; i < n; i++) {
        const off = ifdOff + 2 + i * 12;
        const tag = view.getUint16(off, true);
        const type = view.getUint16(off + 2, true);
        const count = view.getUint32(off + 4, true);
        const byteLen = count * TYPE_SIZE[type];
        const valOff = byteLen <= 4 ? off + 8 : view.getUint32(off + 8, true);
        const vals = [];
        for (let k = 0; k < count; k++) {
            if (type === 3) vals.push(view.getUint16(valOff + k * 2, true));
            else if (type === 4) vals.push(view.getUint32(valOff + k * 4, true));
            else if (type === 12) vals.push(view.getFloat64(valOff + k * 8, true));
            else if (type === 2) vals.push(view.getUint8(valOff + k));
        }
        tags[tag] = { type, count, vals };
    }
    return tags;
}

function readPixels(buf, tags) {
    const offsets = tags[273].vals, counts = tags[279].vals;
    const chunks = offsets.map((o, i) => inflateSync(Buffer.from(buf, o, counts[i])));
    const raw = Buffer.concat(chunks);
    return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

// ── 1. Kleines Raster (1 Strip) mit bekannten Werten ────────────────────────
console.log('1. Roundtrip 4×3, ein Strip');
const data = new Float32Array([
    0.0, 0.1, 0.2, 0.3,
    1.0, 1.1, 1.2, 1.3,
    -9999, 2.1, 2.2, 2.3,
]);
const buf = await writeGeoTiff({ data, ncols: 4, nrows: 3, cellsize: 5,
                                 xllcorner: 500000, yllcorner: 5600000 });
const tags = parseTiff(buf);
check('Dimensionen', tags[256].vals[0] === 4 && tags[257].vals[0] === 3);
check('float32 + Deflate + SampleFormat=IEEE',
      tags[258].vals[0] === 32 && tags[259].vals[0] === 8 && tags[339].vals[0] === 3);
const px = readPixels(buf, tags);
check('Pixel bitgenau (inkl. NoData-Wert)',
      px.length === 12 && Math.abs(px[5] - 1.1) < 1e-7 && px[8] === -9999,
      `len=${px.length} px5=${px[5]} px8=${px[8]}`);
check('PixelScale', tags[33550].vals[0] === 5 && tags[33550].vals[1] === 5);
check('Tiepoint oben-links (yll + nrows·cs)',
      tags[33922].vals[3] === 500000 && tags[33922].vals[4] === 5600000 + 3 * 5);
const gk = tags[34735].vals;
check('GeoKeys: projected + PixelIsArea + EPSG 25832',
      gk[4] === 1024 && gk[7] === 1 && gk[8] === 1025 && gk[11] === 1
      && gk[12] === 3072 && gk[15] === 25832, JSON.stringify(gk));
check('GDAL_NODATA "-9999"',
      String.fromCharCode(...tags[42113].vals).startsWith('-9999'));

// ── 2. Großes Raster (mehrere Strips) ───────────────────────────────────────
console.log('2. Multi-Strip 600×500 (Gradient)');
const NC = 600, NR = 500;
const big = new Float32Array(NC * NR);
for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) big[r * NC + c] = r + c / 1000;
const buf2 = await writeGeoTiff({ data: big, ncols: NC, nrows: NR, cellsize: 1,
                                  xllcorner: 0, yllcorner: 0, epsg: 3857 });
const tags2 = parseTiff(buf2);
check('mehrere Strips', tags2[273].count > 1, `strips=${tags2[273].count}`);
const px2 = readPixels(buf2, tags2);
check('erster/letzter Pixel korrekt',
      px2[0] === 0 && Math.abs(px2[NC * NR - 1] - (499 + 599 / 1000)) < 1e-4,
      `last=${px2[NC * NR - 1]}`);
check('EPSG durchgereicht (3857)', tags2[34735].vals[15] === 3857);
// Gradient = unguenstigster Fall (lauter einmalige Mantissen) — trotzdem kleiner.
check('Deflate wirkt auch beim Gradienten', buf2.byteLength < NC * NR * 4 * 0.9,
      `${buf2.byteLength} vs roh ${NC * NR * 4}`);

// Realfall Ueberflutungsraster: ueberwiegend trocken (0) + NoData-Raender.
const wet = new Float32Array(NC * NR).fill(0);
for (let i = 0; i < NC; i++) wet[i] = -9999;
for (let r = 200; r < 260; r++) for (let c = 250; c < 350; c++) wet[r * NC + c] = 0.42;
const buf3 = await writeGeoTiff({ data: wet, ncols: NC, nrows: NR, cellsize: 1,
                                  xllcorner: 0, yllcorner: 0 });
check('nullenreiches Raster ≪ 10 % der Rohgröße', buf3.byteLength < NC * NR * 4 * 0.1,
      `${buf3.byteLength} vs roh ${NC * NR * 4}`);

// ── 3. Fehlerfall ───────────────────────────────────────────────────────────
console.log('3. Validierung');
let threw = false;
try { await writeGeoTiff({ data: new Float32Array(5), ncols: 4, nrows: 3, cellsize: 1, xllcorner: 0, yllcorner: 0 }); }
catch { threw = true; }
check('zu kurze Daten -> Fehler', threw);

console.log();
if (failures) { console.log(`FEHLGESCHLAGEN: ${failures}`); process.exit(1); }
console.log('Alle Tests bestanden.');
