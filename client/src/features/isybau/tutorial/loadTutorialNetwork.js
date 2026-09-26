/**
 * Lädt das Übungsnetz für die interaktive Tutorial-Tour.
 *
 * Die XML liegt bewusst unter public/ und wird zur Laufzeit geholt statt
 * importiert: sie ist ~750 KB und hat im JS-Bundle nichts verloren (der
 * Tutorial-Start ist ein seltener Einzelfall, kein Startpfad).
 */
import { parseIsybauXML } from '../utils/xmlParser.js';

export const TUTORIAL_NETWORK_URL = '/saintv1d/tutorial/Beispiel_Tutorial.xml';

/**
 * Holt das Übungsnetz und lädt es in den Store.
 *
 * @param {object} store    Isybau-Store (Pinia)
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetchImpl]  injizierbar für Tests
 * @param {string} [opts.url]
 * @returns {Promise<{ok: true, nodes: number, edges: number, areas: number}
 *                  | {ok: false, error: string}>}
 */
export async function loadTutorialNetwork(store, { fetchImpl, url = TUTORIAL_NETWORK_URL } = {}) {
    const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!doFetch) return { ok: false, error: 'Kein fetch verfügbar.' };

    let xml;
    try {
        const res = await doFetch(url);
        if (!res?.ok) {
            return { ok: false, error: `Übungsnetz nicht ladbar (HTTP ${res?.status ?? '?'}).` };
        }
        xml = await res.text();
    } catch (e) {
        return { ok: false, error: `Übungsnetz nicht ladbar: ${e?.message || e}` };
    }

    try {
        const parsed = parseIsybauXML(xml);
        store.loadParsedData(parsed);
        if (store.metadata) store.metadata.fileName = 'Beispiel_Tutorial.xml';
        // Die Übung beginnt ohne Regen: ein Regen oder KOSTRA-Abruf aus der vorigen
        // Sitzung (anderer Standort!) hakte sonst die Regen-Schritte ungefragt ab.
        store.clearRain?.();
        if (store.rain) store.rain.kostraData = null;
        return {
            ok: true,
            nodes: store.nodes?.size ?? 0,
            edges: store.edges?.size ?? 0,
            areas: store.areas?.length ?? 0,
        };
    } catch (e) {
        return { ok: false, error: `Übungsnetz konnte nicht gelesen werden: ${e?.message || e}` };
    }
}
