/**
 * WAS EIN KLICK WÄHLT (Teil XXII, 2026-09-18).
 *
 * Fabio nach dem Test von Teil XXI: „niemand will das editierbare Gelände
 * anklicken — man will die EarthCuts und Fills, die Haltungen und andere
 * Dinge anklicken." Bis hierher gewann der NÄCHSTE Treffer. Seit „Gelände
 * gewinnt" (Teil XXI, E2) liegt die Geländeanzeige deckend obenauf, und jeder
 * Erdkörper 2 cm darunter — ein Klick traf fast immer das Gelände.
 *
 * Jetzt zählt zuerst, WAS getroffen wurde, dann wie nah:
 *   Bauteil (Haltung, Schacht, Wand, …) vor Erdkörper (Cut/Fill) vor Gelände.
 * Das Gelände bleibt wählbar: allein unter dem Zeiger, oder durch Nochmal-
 * Tippen an derselben Stelle (der nächste Kandidat — ohne Taste, auch auf
 * dem Finger).
 *
 * UNTER DEM GELÄNDE zählt nur, was nahe darunter liegt (`DURCHGRIFF_M` entlang
 * des Strahls). Ein schräger Blick trifft sonst eine Haltung hundert Meter
 * weiter hinten, und der Klick wählte etwas, das niemand dort vermutet.
 *
 * Rein: keine Engine, kein three.
 */

/** Rang je Art — kleiner gewinnt. */
export const AUSWAHL_RANG = Object.freeze({ bauteil: 0, erdkoerper: 1, gelaende: 2 });

/** Wie weit hinter dem ersten Geländetreffer (entlang des Strahls, m) ein Treffer noch zählt. */
export const DURCHGRIFF_M = 15;

/** Wie nah (px) ein zweiter Tipp am ersten liegen muss, um zum nächsten Kandidaten zu gehen. */
export const DURCHTIPP_PX = 8;

/** Wie ein Treffer heisst, wenn die Auswahl ihn nennt. */
export const AUSWAHL_ARTNAME = Object.freeze({ bauteil: 'Bauteil', erdkoerper: 'Erdkörper', gelaende: 'Gelände' });

/**
 * Die Kandidaten eines Klicks, geordnet.
 *
 * @param {Array<{key: string, distance: number, strahl?: number}>} treffer
 *        alle Treffer aller Strahlen (Mittelstrahl mit `strahl: 0`)
 * @param {(t) => 'bauteil'|'erdkoerper'|'gelaende'} artVon
 * @returns {Array} je Schlüssel der beste Treffer, mit `art` und `rang`, nach
 *          (Rang, Abstand) sortiert
 */
export function rangiereTreffer(treffer = [], artVon = () => 'bauteil', { durchgriff = DURCHGRIFF_M } = {}) {
    const mitArt = treffer
        .filter(t => t && t.key && Number.isFinite(t.distance))
        .map(t => {
            const art = artVon(t) ?? 'bauteil';
            return { ...t, art, rang: AUSWAHL_RANG[art] ?? 0 };
        });
    // Der erste Geländetreffer des MITTELSTRAHLS begrenzt, was darunter zählt.
    const gelaendeAb = mitArt
        .filter(t => t.art === 'gelaende' && (t.strahl ?? 0) === 0)
        .reduce((m, t) => Math.min(m, t.distance), Infinity);
    const grenze = gelaendeAb + durchgriff;
    const bester = new Map();
    for (const t of mitArt) {
        if (t.art !== 'gelaende' && t.distance > grenze) continue;
        const b = bester.get(t.key);
        if (!b || t.rang < b.rang || (t.rang === b.rang && t.distance < b.distance)) bester.set(t.key, t);
    }
    return [...bester.values()].sort((a, b) => (a.rang - b.rang) || (a.distance - b.distance));
}

/**
 * Welcher Kandidat gilt? Der erste — ausser der Klick wiederholt den letzten
 * an derselben Stelle und das Gewählte steht in der Liste: dann der nächste
 * (am Ende wieder der erste).
 *
 * @returns {{kandidat: object, nr: number}|null}  nr ab 1
 */
export function waehleKandidat(kandidaten = [], { gewaehlt = null, wiederholt = false } = {}) {
    if (!kandidaten.length) return null;
    if (wiederholt && gewaehlt && kandidaten.length > 1) {
        const i = kandidaten.findIndex(k => k.key === gewaehlt);
        if (i >= 0) {
            const j = (i + 1) % kandidaten.length;
            return { kandidat: kandidaten[j], nr: j + 1 };
        }
    }
    return { kandidat: kandidaten[0], nr: 1 };
}
