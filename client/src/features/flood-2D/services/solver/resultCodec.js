/**
 * resultCodec — Binärformat für Ergebnis-Frames (Remote-Pfad + Mock).
 *
 * Layout (Little-Endian):
 *   uint32  jsonLen            Länge des JSON-Headers in Bytes (auf 4 gepaddet)
 *   bytes   JSON-Header        { frame, time?, ncols, nrows, cellsize, xllcorner,
 *                                yllcorner, min?, max?, channels: ['depth','vx',...] }
 *   float32[] Kanal 1          ncols*nrows Werte, Reihenfolge wie channels[]
 *   float32[] Kanal 2 ...
 *
 * Läuft in Browser UND Node (TextEncoder/DataView sind in beiden vorhanden).
 */

/**
 * @param {Object} meta  Frame-Metadaten inkl. ncols/nrows; meta.channels wird
 *                       aus den Keys von channels abgeleitet, falls nicht gesetzt.
 * @param {Object<string, Float32Array>} channels  z. B. { depth, vx, vy }
 * @returns {ArrayBuffer}
 */
export function encodeFrame(meta, channels) {
    const names = meta.channels || Object.keys(channels);
    const header = { ...meta, channels: names };

    const enc = new TextEncoder();
    const jsonBytes = enc.encode(JSON.stringify(header));
    // Auf 4 Bytes padden, damit die Float32-Daten aligned liegen
    // (JSON.parse ignoriert trailing Whitespace).
    const jsonLen = Math.ceil(jsonBytes.length / 4) * 4;

    let dataFloats = 0;
    for (const name of names) {
        const arr = channels[name];
        if (!(arr instanceof Float32Array)) throw new Error(`Channel '${name}' is not a Float32Array`);
        dataFloats += arr.length;
    }

    const buffer = new ArrayBuffer(4 + jsonLen + dataFloats * 4);
    const view = new DataView(buffer);
    view.setUint32(0, jsonLen, true);

    const bytes = new Uint8Array(buffer);
    bytes.set(jsonBytes, 4);
    for (let i = jsonBytes.length; i < jsonLen; i++) bytes[4 + i] = 0x20; // Space-Padding

    let offset = 4 + jsonLen;
    for (const name of names) {
        new Float32Array(buffer, offset, channels[name].length).set(channels[name]);
        offset += channels[name].length * 4;
    }
    return buffer;
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {{ meta: Object, channels: Object<string, Float32Array> }}
 */
export function decodeFrame(buffer) {
    const view = new DataView(buffer);
    const jsonLen = view.getUint32(0, true);
    if (4 + jsonLen > buffer.byteLength) throw new Error('resultCodec: corrupt header (jsonLen out of range)');

    const dec = new TextDecoder();
    const meta = JSON.parse(dec.decode(new Uint8Array(buffer, 4, jsonLen)));

    const names = meta.channels || [];
    const cellCount = (meta.ncols ?? 0) * (meta.nrows ?? 0);
    const expected = 4 + jsonLen + names.length * cellCount * 4;
    if (buffer.byteLength < expected) {
        throw new Error(`resultCodec: buffer too small (${buffer.byteLength} < ${expected})`);
    }

    const channels = {};
    let offset = 4 + jsonLen;
    for (const name of names) {
        // Kopie statt View, damit der Quellpuffer freigegeben werden kann
        channels[name] = new Float32Array(buffer.slice(offset, offset + cellCount * 4));
        offset += cellCount * 4;
    }
    return { meta, channels };
}
