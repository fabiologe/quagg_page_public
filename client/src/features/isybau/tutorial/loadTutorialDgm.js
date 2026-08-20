/**
 * Bietet im Tutorial das passende Geländemodell zum Übungsnetz an
 * (Geoportal RLP, ~4250 Punkte auf 5-m-Raster über demselben Ausschnitt).
 *
 * Der eigentliche Import läuft BEWUSST nicht hier: Sidebar.vue besitzt den
 * Terrain-Worker (analysieren → Auflösung → rastern) samt Fortschritts-
 * anzeige und Fehlerbehandlung. Dieses Modul holt nur den Text und legt ihn
 * als `store.ui.pendingDemImportText` ab; Sidebar.vue nimmt ihn auf und
 * schickt ihn durch denselben Pfad wie eine per Hand gewählte Datei.
 * So gibt es weiterhin nur EINEN DGM-Importweg.
 */

export const TUTORIAL_DGM_URL = '/saintv1d/tutorial/Beispiel_Tutorial_DGM.xyz';

/**
 * @param {object} store    Isybau-Store (Pinia)
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetchImpl]  injizierbar für Tests
 * @param {string} [opts.url]
 * @returns {Promise<{ok: true, points: number} | {ok: false, error: string}>}
 */
export async function loadTutorialDgm(store, { fetchImpl, url = TUTORIAL_DGM_URL } = {}) {
    const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!doFetch) return { ok: false, error: 'Kein fetch verfügbar.' };

    let text;
    try {
        const res = await doFetch(url);
        if (!res?.ok) {
            return { ok: false, error: `Übungs-DGM nicht ladbar (HTTP ${res?.status ?? '?'}).` };
        }
        text = await res.text();
    } catch (e) {
        return { ok: false, error: `Übungs-DGM nicht ladbar: ${e?.message || e}` };
    }

    if (!text || !text.trim()) {
        return { ok: false, error: 'Übungs-DGM ist leer.' };
    }

    if (!store?.ui) return { ok: false, error: 'Store nicht bereit.' };
    store.ui.pendingDemImportText = text;

    // Nur zur Rückmeldung an den Nutzer — der echte Zellzähler kommt später
    // aus dem Worker.
    const points = text.split('\n').filter(l => l.trim()).length;
    return { ok: true, points };
}
