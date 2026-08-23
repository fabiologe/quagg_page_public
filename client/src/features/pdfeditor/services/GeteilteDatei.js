/**
 * GeteilteDatei — Übergabepunkt des Android-Share-Targets.
 *
 * „Teilen → Quagg PDF" schickt die PDF als POST an /pdf-editor/teilen;
 * der Service Worker legt sie in den Cache 'pdfed-geteilt' und leitet auf
 * /pdf-editor?geteilt=1 um. Diese Seite holt die Datei hier wieder ab
 * (einmalig — der Eintrag wird sofort gelöscht).
 *
 * cacheStorage ist injizierbar → in jsdom mit einem Fake testbar.
 */

export const GETEILT_CACHE = 'pdfed-geteilt';
export const GETEILT_KEY = '/geteilte-datei';
export const GETEILT_NAME_HEADER = 'X-Datei-Name';

/**
 * @returns {Promise<File|null>} die geteilte PDF oder null
 */
export async function holeGeteilteDatei(cacheStorage = globalThis.caches) {
    if (!cacheStorage) return null;
    try {
        const cache = await cacheStorage.open(GETEILT_CACHE);
        const antwort = await cache.match(GETEILT_KEY);
        if (!antwort) return null;
        await cache.delete(GETEILT_KEY);
        const blob = await antwort.blob();
        const name = antwort.headers?.get?.(GETEILT_NAME_HEADER) || 'Geteilt.pdf';
        return new File([blob], name, { type: 'application/pdf' });
    } catch {
        return null;
    }
}
