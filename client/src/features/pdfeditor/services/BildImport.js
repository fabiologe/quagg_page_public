/**
 * BildImport — Regeln und Normalisierung für eingefügte Bilder (Stufe 16).
 *
 * EINE Normalisierungsregel: jedes Bild wird über ein Canvas neu kodiert.
 * Quell-MIME png/gif/bmp/svg → PNG (Screenshots: scharfe Textkanten, Alpha
 * bleibt), alles andere (jpeg/webp/heic/avif) → JPEG 0,85. Lange Kante
 * höchstens MAX_KANTE_PX. Warum immer neu kodieren:
 *   1. EXIF-Orientierung wird EINGEBACKEN — sonst zeigt der Bildschirm ein
 *      aufrechtes Kamerafoto und der PDF-Viewer (ignoriert EXIF) ein gekipptes.
 *   2. pdf-lib bekommt garantiert Baseline-JPEG / Standard-PNG — nie CMYK,
 *      16 Bit, Interlace oder HEIC.
 *   3. Metadaten (GPS!) fallen weg, 12-MP-Fotos schrumpfen auf ~0,5 MB.
 *
 * Die Regeln (Format, Maße, Platzierung, Picker, Hash) sind pur und in Node
 * testbar; nur `normalisiereBild` braucht das DOM.
 */

import { TAB_DRAG_TYP } from './TabTransfer';

export const MAX_KANTE_PX = 2000;
export const JPEG_QUALITAET = 0.85;
export const MIN_BREITE_PT = 24;
export const START_ANTEIL = 0.4;          // Startbreite = 40 % der Seitenbreite
export const MAX_DATEI_BYTES = 40 * 1024 * 1024;

const PX_ZU_PT = 72 / 96;                 // 96-dpi-Pixel → PDF-Punkte
const PNG_QUELLEN = new Set(['image/png', 'image/gif', 'image/bmp', 'image/svg+xml']);

/** Zielformat nach der Normalisierung — nur diese zwei existieren danach. */
export function zielFormat(mime) {
    return PNG_QUELLEN.has(String(mime || '').toLowerCase()) ? 'image/png' : 'image/jpeg';
}

/** Lange Kante auf maxKante begrenzen, proportional, gerundet, nie < 1. */
export function zielMasse(breite, hoehe, maxKante = MAX_KANTE_PX) {
    const lang = Math.max(breite, hoehe);
    if (!(lang > maxKante)) return { breite, hoehe, faktor: 1 };
    const faktor = maxKante / lang;
    return {
        breite: Math.max(1, Math.round(breite * faktor)),
        hoehe: Math.max(1, Math.round(hoehe * faktor)),
        faktor,
    };
}

/**
 * Startmaße beim Platzieren (Seitenpunkte): 40 % der Seitenbreite, aber
 * nie größer als die natürliche Größe (96 dpi), nie schmaler als
 * MIN_BREITE_PT; Höhe ebenfalls auf 40 % der Seitenhöhe gedeckelt.
 * Das Seitenverhältnis bleibt immer erhalten.
 */
export function platzierMasse(natBreite, natHoehe, seiteBreitePt, seiteHoehePt) {
    const verhaeltnis = natHoehe / natBreite;
    let w = Math.min(seiteBreitePt * START_ANTEIL, natBreite * PX_ZU_PT);
    w = Math.max(MIN_BREITE_PT, w);
    let h = w * verhaeltnis;
    const maxH = seiteHoehePt * START_ANTEIL;
    if (h > maxH) { h = maxH; w = h / verhaeltnis; }
    // Sicherheitsnetz: nie über die Seite hinaus
    if (w > seiteBreitePt) { w = seiteBreitePt; h = w * verhaeltnis; }
    if (h > seiteHoehePt) { h = seiteHoehePt; w = h / verhaeltnis; }
    return { w, h };
}

function _istBild(f) {
    return !!f && typeof f.type === 'string' && f.type.startsWith('image/');
}

/** Erste Bilddatei aus einer FileList/Array — oder null. */
export function bildAusDateien(dateien) {
    for (const f of Array.from(dateien ?? [])) {
        if (_istBild(f)) return f;
    }
    return null;
}

/** Bild aus der Zwischenablage (Strg+V) — Screenshots kommen als kind 'file'. */
export function bildAusZwischenablage(clipboardData) {
    const items = clipboardData?.items;
    if (!items) return null;
    for (const it of Array.from(items)) {
        if (it.kind === 'file' && typeof it.type === 'string' && it.type.startsWith('image/')) {
            const f = it.getAsFile?.();
            if (f) return f;
        }
    }
    return null;
}

/** Bild aus einem Drop — Tab-Drags (eigener Typ) sind bewusst KEIN Treffer. */
export function bildAusDrop(dataTransfer) {
    if (!dataTransfer) return null;
    if (Array.from(dataTransfer.types ?? []).includes(TAB_DRAG_TYP)) return null;
    return bildAusDateien(dataTransfer.files ?? []);
}

/**
 * Inhalts-Hash als Ablage-Key (32 Hex-Zeichen = erste 16 Byte SHA-256):
 * derselbe Screenshot zweimal eingefügt ist EIN Blob. Ohne WebCrypto
 * (sehr alte Browser) fällt es auf eine Zufalls-ID zurück — dann ohne Dedup.
 */
export async function bildKeyAus(bytes) {
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
        const hash = await subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(hash)).slice(0, 16)
            .map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, '');
}

/**
 * DOM-Teil: dekodieren, verkleinern, neu kodieren.
 * @param {Blob} blob
 * @returns {Promise<{blob: Blob, mime: string, natBreite: number, natHoehe: number, bitmap: ImageBitmap|HTMLCanvasElement}>}
 */
export async function normalisiereBild(blob) {
    if (!blob || !(blob.size > 0)) throw new Error('Die Bilddatei ist leer.');
    if (blob.size > MAX_DATEI_BYTES) throw new Error('Das Bild ist größer als 40 MB.');

    // <img> + decode(): portabelster Weg, der EXIF beim Zeichnen respektiert
    // (Chromium, Safari, Firefox) und HEIC auf Safari mitnimmt.
    const url = URL.createObjectURL(blob);
    const img = new Image();
    try {
        img.src = url;
        try { await img.decode(); }
        catch { throw new Error('Dieses Bildformat kann der Browser nicht lesen.'); }
        const natB = img.naturalWidth, natH = img.naturalHeight;
        if (!(natB > 0 && natH > 0)) throw new Error('Dieses Bildformat kann der Browser nicht lesen.');

        const { breite, hoehe } = zielMasse(natB, natH);
        const mime = zielFormat(blob.type);
        const canvas = document.createElement('canvas');
        canvas.width = breite;
        canvas.height = hoehe;
        const ctx = canvas.getContext('2d');
        // JPEG kennt kein Alpha: Transparenz würde schwarz — auf Weiß legen.
        if (mime === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, breite, hoehe); }
        ctx.drawImage(img, 0, 0, breite, hoehe);

        const ausgabe = await new Promise((res, rej) => canvas.toBlob(
            (b) => (b ? res(b) : rej(new Error('Das Bild konnte nicht kodiert werden.'))),
            mime,
            mime === 'image/jpeg' ? JPEG_QUALITAET : undefined,
        ));
        // Fertig dekodiertes Bitmap fürs Canvas-Zeichnen — Fallback: das
        // Canvas selbst (ctx.drawImage nimmt beides).
        let bitmap;
        try { bitmap = await createImageBitmap(canvas); } catch { bitmap = canvas; }
        return { blob: ausgabe, mime, natBreite: breite, natHoehe: hoehe, bitmap };
    } finally {
        URL.revokeObjectURL(url);
    }
}
