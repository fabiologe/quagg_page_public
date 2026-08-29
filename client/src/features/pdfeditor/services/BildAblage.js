/**
 * BildAblage — eingefügte Bilder in der Repo (Stufe 16).
 *
 * Der Blob liegt AUSSERHALB der Annotationen unter `doc:<dokId>:bild:<key>`
 * (Key = Inhalts-Hash → derselbe Screenshot zweimal = ein Blob); die
 * Annotation trägt nur den Key. Hier laufen alle Wege zusammen:
 *   - Import (normalisieren → hashen → ablegen → Cache vorwärmen)
 *   - Bitmap fürs Canvas (gebündelt über BildCache.ladeEinmal)
 *   - Object-URLs für die SVG-Vorschau der Auswahl (EINE je Blob, dokument-
 *     weit; Revoke nur in verwirfDokument — Komponenten erzeugen nie eigene)
 *   - Bytes für den Export (der Exporter bleibt DOM-/Repo-frei)
 *   - Aufräumen beim Löschen des Dokuments
 */

import { repo } from './PdfRepo';
import * as cache from './BildCache';
import { normalisiereBild, bildKeyAus } from './BildImport';

export function bildBlobKey(dokId, bildKey) {
    return `doc:${dokId}:bild:${bildKey}`;
}

const _urls = new Map();   // blobKey → Object-URL

function _merkeUrl(blobKey, blob) {
    if (_urls.has(blobKey)) return _urls.get(blobKey);
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    const url = URL.createObjectURL(blob);
    _urls.set(blobKey, url);
    return url;
}

/**
 * Bild übernehmen. `normalisiere` ist injizierbar (Tests ohne DOM).
 * @returns {Promise<{bildKey: string, mime: string, natBreite: number, natHoehe: number}>}
 */
export async function legeBildAb(dokId, datei, { normalisiere = normalisiereBild } = {}) {
    const n = await normalisiere(datei);
    const bytes = new Uint8Array(await n.blob.arrayBuffer());
    const bildKey = await bildKeyAus(bytes);
    const blobKey = bildBlobKey(dokId, bildKey);

    const vorhanden = await repo.getBlob(blobKey);
    if (!vorhanden?.blob) {
        const ok = await repo.setBlob(blobKey, n.blob, {
            mime: n.mime, natBreite: n.natBreite, natHoehe: n.natHoehe,
            groesse: n.blob.size, addedAt: Date.now(),
        });
        if (!ok) throw new Error('Das Bild konnte nicht lokal gespeichert werden (Speicherplatz?).');
    }
    if (n.bitmap) cache.lege(dokId, bildKey, n.bitmap);
    _merkeUrl(blobKey, n.blob);
    return { bildKey, mime: n.mime, natBreite: n.natBreite, natHoehe: n.natHoehe };
}

async function _dekodiere(blob) {
    if (typeof createImageBitmap === 'function') {
        try { return await createImageBitmap(blob); } catch { /* Fallback unten */ }
    }
    if (typeof Image === 'undefined' || typeof URL?.createObjectURL !== 'function') return null;
    const url = URL.createObjectURL(blob);
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return img;   // width/height = natürliche Maße, drawImage-tauglich
    } catch {
        return null;
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** Bitmap fürs Canvas — gebündelt, gecacht, Fehlschlag gemerkt. */
export function ladeBildBitmap(dokId, bildKey) {
    return cache.ladeEinmal(dokId, bildKey, async () => {
        const eintrag = await repo.getBlob(bildBlobKey(dokId, bildKey));
        if (!eintrag?.blob) return null;
        _merkeUrl(bildBlobKey(dokId, bildKey), eintrag.blob);
        return _dekodiere(eintrag.blob);
    });
}

/** Object-URL, falls schon bekannt (synchron — für die SVG-Vorschau). */
export function holeBildUrl(dokId, bildKey) {
    return _urls.get(bildBlobKey(dokId, bildKey)) ?? null;
}

export async function ladeBildUrl(dokId, bildKey) {
    const blobKey = bildBlobKey(dokId, bildKey);
    const bekannt = _urls.get(blobKey);
    if (bekannt) return bekannt;
    const eintrag = await repo.getBlob(blobKey);
    if (!eintrag?.blob) return null;
    return _merkeUrl(blobKey, eintrag.blob);
}

/**
 * Bytes für den Export (einmal je Key).
 * @returns {Promise<Map<string, {bytes: Uint8Array, mime: string}>>}
 */
export async function ladeBildBytes(dokId, bildKeys) {
    const ergebnis = new Map();
    for (const key of new Set(bildKeys ?? [])) {
        const eintrag = await repo.getBlob(bildBlobKey(dokId, key));
        if (!eintrag?.blob) continue;
        ergebnis.set(key, {
            bytes: new Uint8Array(await eintrag.blob.arrayBuffer()),
            mime: eintrag.meta?.mime ?? eintrag.blob.type ?? 'image/png',
        });
    }
    return ergebnis;
}

/** Beim Schließen: Bitmaps freigeben, Object-URLs zurückziehen. */
export function verwirfDokument(dokId) {
    cache.verwirfDokument(dokId);
    const praefix = bildBlobKey(dokId, '');
    for (const [key, url] of [..._urls]) {
        if (!key.startsWith(praefix)) continue;
        try { URL.revokeObjectURL(url); } catch { /* */ }
        _urls.delete(key);
    }
}

/** Beim Löschen des Dokuments: alle Bild-Blobs des Präfixes entfernen. */
export async function loescheBilder(dokId) {
    const praefix = bildBlobKey(dokId, '');
    const liste = await repo.listBlobs(praefix);
    for (const { key } of liste) await repo.deleteBlob(key);
    verwirfDokument(dokId);
}
