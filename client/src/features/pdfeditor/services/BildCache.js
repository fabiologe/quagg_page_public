/**
 * BildCache — dekodierte Bitmaps eingefügter Bilder (Stufe 16).
 *
 * Der Painter zeichnet SYNCHRON; Bilder müssen deshalb fertig dekodiert
 * bereitliegen. Muster SeitenBitmapCache: LRU mit Pixel-Budget, `close()`
 * beim Verdrängen. `ladeEinmal` bündelt parallele Ladeaufrufe (sechs
 * lebendige Seiten fragen sonst sechsmal dasselbe Bild an) und merkt sich
 * Fehlschläge — ein kaputter Blob löst kein Dauerfeuer aus.
 *
 * Pur gehalten: „Bitmap" ist alles mit { width, height, close?() }.
 */

export const PIXEL_BUDGET = 24e6;

const _eintraege = new Map();      // key → { bitmap, pixel } — Map = LRU-Ordnung
let _pixelSumme = 0;
const _laufend = new Map();        // key → Promise<bitmap|null>
const _fehlgeschlagen = new Set();

function _key(dokId, bildKey) {
    return `${dokId}:${bildKey}`;
}

function _entferne(key) {
    const e = _eintraege.get(key);
    if (!e) return;
    _eintraege.delete(key);
    _pixelSumme -= e.pixel;
    try { e.bitmap.close?.(); } catch { /* schon geschlossen */ }
}

/** Treffer erneuert die LRU-Position. @returns bitmap | null */
export function hole(dokId, bildKey) {
    const key = _key(dokId, bildKey);
    const e = _eintraege.get(key);
    if (!e) return null;
    _eintraege.delete(key);
    _eintraege.set(key, e);
    return e.bitmap;
}

/** @returns {boolean} aufgenommen? (false: zu groß fürs Budget) */
export function lege(dokId, bildKey, bitmap) {
    const key = _key(dokId, bildKey);
    _entferne(key);
    _fehlgeschlagen.delete(key);   // frisch importiert → ein alter Fehlschlag gilt nicht mehr
    const pixel = (bitmap.width ?? 0) * (bitmap.height ?? 0);
    if (pixel > PIXEL_BUDGET) { try { bitmap.close?.(); } catch { /* */ } return false; }
    while (_pixelSumme + pixel > PIXEL_BUDGET && _eintraege.size) {
        _entferne(_eintraege.keys().next().value);
    }
    _eintraege.set(key, { bitmap, pixel });
    _pixelSumme += pixel;
    return true;
}

/**
 * Lädt ein Bild höchstens EINMAL, egal wie viele Seiten gleichzeitig fragen.
 * @param {() => Promise<object|null>} lader liefert das Bitmap (oder null)
 * @returns {Promise<object|null>}
 */
export function ladeEinmal(dokId, bildKey, lader) {
    const key = _key(dokId, bildKey);
    const vorhanden = _eintraege.get(key);
    if (vorhanden) return Promise.resolve(vorhanden.bitmap);
    if (_fehlgeschlagen.has(key)) return Promise.resolve(null);
    const laufend = _laufend.get(key);
    if (laufend) return laufend;

    const p = Promise.resolve()
        .then(() => lader())
        .then((bm) => {
            _laufend.delete(key);
            if (!bm) { _fehlgeschlagen.add(key); return null; }
            lege(dokId, bildKey, bm);
            return bm;
        }, () => {
            _laufend.delete(key);
            _fehlgeschlagen.add(key);
            return null;
        });
    _laufend.set(key, p);
    return p;
}

/** Alles eines Dokuments vergessen (Bitmaps schließen). */
export function verwirfDokument(dokId) {
    const praefix = `${dokId}:`;
    for (const key of [..._eintraege.keys()]) {
        if (key.startsWith(praefix)) _entferne(key);
    }
    for (const key of [..._laufend.keys()]) if (key.startsWith(praefix)) _laufend.delete(key);
    for (const key of [..._fehlgeschlagen]) if (key.startsWith(praefix)) _fehlgeschlagen.delete(key);
}

export function _statistik() {
    return { eintraege: _eintraege.size, pixel: _pixelSumme, laufend: _laufend.size, fehlgeschlagen: _fehlgeschlagen.size };
}

export function _leereAlles() {
    for (const key of [..._eintraege.keys()]) _entferne(key);
    _laufend.clear();
    _fehlgeschlagen.clear();
}
