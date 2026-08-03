"""
Binär-Codec für Ergebnis-Frames — Python-Gegenstück zu
client/src/features/flood-2D/services/solver/resultCodec.js.

Layout (Little-Endian):
    uint32    jsonLen          Länge des JSON-Headers in Bytes (auf 4 gepaddet)
    bytes     JSON-Header      { frame, time?, ncols, nrows, cellsize, xllcorner,
                                 yllcorner, min?, max?, channels: ['depth', ...] }
    float32[] Kanal 1          ncols*nrows Werte, Reihenfolge wie channels[]
    float32[] Kanal 2 ...

Das Padding ist Space (0x20) — JSON.parse im Browser ignoriert trailing
Whitespace. Float32-Daten liegen dadurch 4-Byte-aligned.
"""
import json
import struct
import sys
from array import array


def encode_frame(meta: dict, channels: dict) -> bytes:
    """
    @param meta      Frame-Metadaten inkl. ncols/nrows; meta['channels'] wird
                     aus den Keys von channels abgeleitet, falls nicht gesetzt.
    @param channels  z.B. { 'depth': array('f', ...) } — array('f') oder Liste.
    """
    names = meta.get("channels") or list(channels.keys())
    header = {**meta, "channels": names}

    json_bytes = json.dumps(header, separators=(",", ":")).encode("utf-8")
    json_len = (len(json_bytes) + 3) // 4 * 4  # auf 4 Bytes padden

    parts = [struct.pack("<I", json_len), json_bytes, b" " * (json_len - len(json_bytes))]
    for name in names:
        ch = channels[name]
        if not isinstance(ch, array) or ch.typecode != "f":
            ch = array("f", ch)
        if sys.byteorder == "big":  # array('f') ist native-endian
            ch = array("f", ch)
            ch.byteswap()
        parts.append(ch.tobytes())
    return b"".join(parts)


def decode_frame(buffer: bytes) -> tuple:
    """Gegenstück für Tests: → (meta, {name: array('f')})."""
    (json_len,) = struct.unpack_from("<I", buffer, 0)
    meta = json.loads(buffer[4:4 + json_len].decode("utf-8"))
    names = meta.get("channels") or []
    cell_count = (meta.get("ncols") or 0) * (meta.get("nrows") or 0)

    channels = {}
    offset = 4 + json_len
    for name in names:
        ch = array("f")
        ch.frombytes(buffer[offset:offset + cell_count * 4])
        if sys.byteorder == "big":
            ch.byteswap()
        channels[name] = ch
        offset += cell_count * 4
    return meta, channels
