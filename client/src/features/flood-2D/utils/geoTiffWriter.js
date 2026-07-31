/**
 * geoTiffWriter — GeoTIFF-Export ohne Abhängigkeiten (GIS-Export, Phase 2).
 *
 * Schreibt ein einbändiges float32-GeoTIFF mit Adobe-Deflate-Kompression
 * (TIFF-Compression 8 = zlib pro Strip, via Browser-CompressionStream — auch
 * in Node ≥18 verfügbar), Georeferenzierung (ModelPixelScale + ModelTiepoint +
 * GeoKeys mit EPSG-Code) und GDAL_NODATA-Tag. QGIS/GDAL lesen das direkt mit
 * korrekter Lage und NoData-Maskierung.
 *
 * Datenordnung wie unsere ASC/codec-Raster: Zeile 0 = OBERSTE Zeile (Nord) —
 * identisch zur TIFF-Konvention, daher 1:1-Kopie ohne Spiegelung.
 * Der Tiepoint verankert Rasterecke (0,0) oben links auf
 * (xllcorner, yllcorner + nrows·cellsize).
 */

const TAG = {
    ImageWidth: 256, ImageLength: 257, BitsPerSample: 258, Compression: 259,
    Photometric: 262, StripOffsets: 273, SamplesPerPixel: 277, RowsPerStrip: 278,
    StripByteCounts: 279, PlanarConfig: 284, SampleFormat: 339,
    ModelPixelScale: 33550, ModelTiepoint: 33922, GeoKeyDirectory: 34735,
    GdalNodata: 42113,
};
const TYPE = { SHORT: 3, LONG: 4, ASCII: 2, DOUBLE: 12 };
const TYPE_SIZE = { [TYPE.SHORT]: 2, [TYPE.LONG]: 4, [TYPE.ASCII]: 1, [TYPE.DOUBLE]: 8 };

async function deflate(bytes) {
    const cs = new CompressionStream('deflate'); // zlib-Format = TIFF-Compression 8
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * @param {Object} o
 * @param {Float32Array|number[]} o.data  Zeile 0 = oberste Zeile, row-major
 * @param {number} o.ncols
 * @param {number} o.nrows
 * @param {number} o.cellsize             Meter pro Zelle
 * @param {number} o.xllcorner           linker Rand (Ecke, nicht Zellmitte)
 * @param {number} o.yllcorner           unterer Rand
 * @param {number} [o.epsg=25832]         ETRS89 / UTM 32N (Deutschland-Default)
 * @param {number} [o.nodata=-9999]
 * @returns {Promise<ArrayBuffer>}
 */
export async function writeGeoTiff({ data, ncols, nrows, cellsize,
                                     xllcorner, yllcorner,
                                     epsg = 25832, nodata = -9999 }) {
    if (!ncols || !nrows || data.length < ncols * nrows) {
        throw new Error(`GeoTIFF: Daten (${data.length}) passen nicht zu ${ncols}×${nrows}`);
    }

    // ── Strips komprimieren (~1 MB unkomprimiert pro Strip) ──────────────────
    const rowsPerStrip = Math.max(1, Math.min(nrows, Math.floor(262144 / ncols)));
    const nStrips = Math.ceil(nrows / rowsPerStrip);
    const strips = [];
    for (let s = 0; s < nStrips; s++) {
        const r0 = s * rowsPerStrip;
        const rN = Math.min(nrows, r0 + rowsPerStrip);
        const slice = new Float32Array((rN - r0) * ncols);
        for (let i = 0; i < slice.length; i++) slice[i] = data[r0 * ncols + i];
        strips.push(await deflate(new Uint8Array(slice.buffer)));
    }

    // ── Tag-Werte ────────────────────────────────────────────────────────────
    // GeoKeys: [Version=1,Rev=1,Minor=0,Anzahl] + je Key [id, tagLoc, count, value]
    const geoKeys = new Uint16Array([
        1, 1, 0, 3,
        1024, 0, 1, 1,      // GTModelType: projected
        1025, 0, 1, 1,      // GTRasterType: PixelIsArea
        3072, 0, 1, epsg,   // ProjectedCSType
    ]);
    const pixelScale = new Float64Array([cellsize, cellsize, 0]);
    const tiepoint = new Float64Array([0, 0, 0, xllcorner, yllcorner + nrows * cellsize, 0]);
    const nodataAscii = `${nodata}\0`;

    // entries: [tag, type, count, Wert (Zahl) ODER {ext: Uint8Array/TypedArray}]
    const entries = [
        [TAG.ImageWidth, TYPE.LONG, 1, ncols],
        [TAG.ImageLength, TYPE.LONG, 1, nrows],
        [TAG.BitsPerSample, TYPE.SHORT, 1, 32],
        [TAG.Compression, TYPE.SHORT, 1, 8],
        [TAG.Photometric, TYPE.SHORT, 1, 1],
        [TAG.StripOffsets, TYPE.LONG, nStrips, { placeholderStrips: true }],
        [TAG.SamplesPerPixel, TYPE.SHORT, 1, 1],
        [TAG.RowsPerStrip, TYPE.LONG, 1, rowsPerStrip],
        [TAG.StripByteCounts, TYPE.LONG, nStrips,
            { ext: new Uint32Array(strips.map(st => st.length)) }],
        [TAG.PlanarConfig, TYPE.SHORT, 1, 1],
        [TAG.SampleFormat, TYPE.SHORT, 1, 3],
        [TAG.ModelPixelScale, TYPE.DOUBLE, 3, { ext: pixelScale }],
        [TAG.ModelTiepoint, TYPE.DOUBLE, 6, { ext: tiepoint }],
        [TAG.GeoKeyDirectory, TYPE.SHORT, geoKeys.length, { ext: geoKeys }],
        [TAG.GdalNodata, TYPE.ASCII, nodataAscii.length,
            { ext: new TextEncoder().encode(nodataAscii) }],
    ];

    // ── Layout: Header(8) | IFD | externe Tag-Daten | Strips ────────────────
    const ifdSize = 2 + entries.length * 12 + 4;
    let cursor = 8 + ifdSize;
    const extOffsets = new Map();
    for (const e of entries) {
        const [, type, count, val] = e;
        const byteLen = count * TYPE_SIZE[type];
        if (typeof val === 'object' && byteLen > 4) {
            cursor = (cursor + 1) & ~1;              // TIFF: Werte auf gerade Offsets
            extOffsets.set(e, cursor);
            cursor += byteLen;
        }
    }
    cursor = (cursor + 1) & ~1;
    const stripOffsets = new Uint32Array(nStrips);
    for (let s = 0; s < nStrips; s++) {
        stripOffsets[s] = cursor;
        cursor += strips[s].length;
    }

    const buf = new ArrayBuffer(cursor);
    const view = new DataView(buf);
    const out = new Uint8Array(buf);

    // Header: little-endian "II", Magic 42, IFD-Offset 8
    view.setUint16(0, 0x4949, true);
    view.setUint16(2, 42, true);
    view.setUint32(4, 8, true);

    // IFD
    view.setUint16(8, entries.length, true);
    entries.forEach(([tag, type, count, val], i) => {
        const off = 10 + i * 12;
        view.setUint16(off, tag, true);
        view.setUint16(off + 2, type, true);
        view.setUint32(off + 4, count, true);
        const byteLen = count * TYPE_SIZE[type];
        if (typeof val !== 'object') {
            if (type === TYPE.SHORT) view.setUint16(off + 8, val, true);
            else view.setUint32(off + 8, val, true);
        } else if (byteLen <= 4) {
            // (kommt bei unseren Tags nicht vor — der Vollständigkeit halber)
            const src = val.placeholderStrips ? stripOffsets : val.ext;
            if (type === TYPE.SHORT) view.setUint16(off + 8, src[0], true);
            else view.setUint32(off + 8, src[0], true);
        } else {
            const entry = entries[i];
            view.setUint32(off + 8, extOffsets.get(entry), true);
        }
    });
    view.setUint32(8 + 2 + entries.length * 12, 0, true); // kein weiteres IFD

    // Externe Tag-Daten
    for (const e of entries) {
        if (!extOffsets.has(e)) continue;
        const [, type, , val] = e;
        const src = val.placeholderStrips ? stripOffsets : val.ext;
        let o = extOffsets.get(e);
        if (src instanceof Uint8Array) {
            out.set(src, o);
        } else if (src instanceof Uint16Array) {
            for (const v of src) { view.setUint16(o, v, true); o += 2; }
        } else if (src instanceof Uint32Array) {
            for (const v of src) { view.setUint32(o, v, true); o += 4; }
        } else if (src instanceof Float64Array) {
            for (const v of src) { view.setFloat64(o, v, true); o += 8; }
        } else {
            throw new Error(`GeoTIFF: unbekannter Ext-Typ für Tag ${e[0]}`);
        }
    }

    // Strips
    for (let s = 0; s < nStrips; s++) out.set(strips[s], stripOffsets[s]);
    return buf;
}
