/**
 * SeitenBitmapCache — fertige Render-Bitmaps TEURER Seiten überleben das
 * Sichtfenster (und den Tab-Wechsel): Zurückscrollen blittet das Bitmap
 * statt hunderttausende Operatoren neu auszuführen.
 *
 * LRU mit PIXEL-Budget (RGBA ≈ 4 Byte/px): 24 Mio px ≈ 96 MB — bewusst
 * konservativ fürs Tablet. Aufgenommen werden nur Seiten, deren Render
 * die SCHWER_MS-Schwelle riss; beim Verdrängen wird `bitmap.close()`
 * gerufen (ImageBitmap gibt GPU-/RAM-Speicher sonst erst mit dem GC frei).
 *
 * Pur gehalten: „Bitmap" ist alles mit { width, height, close() } —
 * in Tests einfache Fakes, im Browser echte ImageBitmaps.
 */

export const PIXEL_BUDGET = 24e6;

const _eintraege = new Map();   // Key → { bitmap, skala, kostenMs, pixel } — Map = LRU-Ordnung
let _pixelSumme = 0;

function _key(dokId, seite) {
    return `${dokId}:${seite}`;
}

function _entferne(key) {
    const e = _eintraege.get(key);
    if (!e) return;
    _eintraege.delete(key);
    _pixelSumme -= e.pixel;
    try { e.bitmap.close?.(); } catch { /* schon geschlossen */ }
}

/**
 * @param {{width:number, height:number, close?:Function}} bitmap
 * @returns {boolean} aufgenommen? (false: zu groß fürs Budget)
 */
export function lege(dokId, seite, bitmap, skala, kostenMs) {
    const key = _key(dokId, seite);
    _entferne(key);
    const pixel = bitmap.width * bitmap.height;
    if (pixel > PIXEL_BUDGET) { try { bitmap.close?.(); } catch { /* */ } return false; }
    // LRU: älteste Einträge verdrängen, bis das Budget reicht
    while (_pixelSumme + pixel > PIXEL_BUDGET && _eintraege.size) {
        _entferne(_eintraege.keys().next().value);
    }
    _eintraege.set(key, { bitmap, skala, kostenMs, pixel });
    _pixelSumme += pixel;
    return true;
}

/**
 * Treffer erneuert die LRU-Position.
 * @returns {{bitmap, skala, kostenMs}|null}
 */
export function hole(dokId, seite) {
    const key = _key(dokId, seite);
    const e = _eintraege.get(key);
    if (!e) return null;
    _eintraege.delete(key);
    _eintraege.set(key, e);
    return e;
}

/** Passt die gecachte Skala „gut genug" (±15 %)? Dann kein Neu-Render nötig. */
export function skalaPasst(eintrag, zielSkala, toleranz = 0.15) {
    if (!eintrag) return false;
    return Math.abs(eintrag.skala - zielSkala) / zielSkala <= toleranz;
}

/** Alle Einträge eines Dokuments verwerfen (Löschen, +Seite, Layer-Wechsel). */
export function verwirfDokument(dokId) {
    const praefix = `${dokId}:`;
    for (const key of [..._eintraege.keys()]) {
        if (key.startsWith(praefix)) _entferne(key);
    }
}

export function _statistik() {
    return { eintraege: _eintraege.size, pixel: _pixelSumme };
}

export function _leereAlles() {
    for (const key of [..._eintraege.keys()]) _entferne(key);
}
