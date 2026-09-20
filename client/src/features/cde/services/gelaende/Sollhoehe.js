/**
 * DIE SOLLHÖHE AM ORT — wohin eine Geländeoperation formt (Teil XXIV-4).
 *
 * Eine Grube hebt bis zu ihrer Sohle aus, ein Planum stellt seine Höhe her,
 * eine Schüttung füllt bis zu einer Höhe, bis zum Ur-Gelände oder bis zur
 * FLÄCHE einer anderen Operation (Durchstich 2). Das ist dreimal dieselbe
 * Frage — „welche Höhe soll hier herauskommen?" —, und sie stand dreimal
 * anders im Code: der Zweig „bis zur Fläche" lag allein in `schuettung()`,
 * und jede weitere Operation hätte ihn noch einmal gebraucht.
 *
 * Hier steht die Antwort EINMAL. Eine Operation fragt
 *
 *     const soll = sollhoeheVon(parameter, { art: 'grube', feld: 'sohle' }, ctx);
 *     if (soll.grund) return { raster, warnungen: [soll.grund] };
 *     … const ziel = soll.an(x, z, i);
 *
 * und weiss danach nicht, welche Zielart gewählt war. WIE sie mit der Zielhöhe
 * umgeht, bleibt ihre Sache: die Grube schneidet, die Schüttung füllt, die
 * Böschung läuft aussen aus. Der Auflöser sagt nur, welche Höhe gilt, ob der
 * Rand mitläuft (`mitBoeschung`) und was fehlt (`grund`).
 *
 * BLATT: dieses Modul kennt weder die Registry noch eine einzelne Operation —
 * die Fläche einer anderen Operation reicht der Aufrufer als `flaecheAn`
 * herein (`formeNach`). Sonst wäre es ein Kreis, und ein Griff nach oben
 * (Schicht L1, Wächter W1).
 */
import { gleicherBezug } from '../geometrie/hilfen.js';

/** Ohne Angabe gilt die eigene Höhe — so rechnen alle Operationen seit je (Alt-Journale). */
export const ZIEL_VORGABE = 'hoehe';

/**
 * Die Zielarten. Mehr als diese drei gibt es nicht; wer eine vierte braucht,
 * schreibt hier eine Zeile und rührt keine Operation an.
 *
 *   mitBoeschung    läuft der Rand der Operation zur Zielhöhe aus? („bis GOK"
 *                   endet am Ur-Gelände, dort gibt es keine Böschung)
 *   rueckverfuellung  füllt sie wieder auf, was war? (IFC: BACKFILL)
 *   eigenesFeld     steht die Zielhöhe im Parameter der Operation selbst?
 */
export const ZIELARTEN = Object.freeze({
    hoehe:   Object.freeze({ titel: 'Höhe',                   eigenesFeld: true,  mitBoeschung: true,  rueckverfuellung: false }),
    ur:      Object.freeze({ titel: 'Ur-Gelände',             eigenesFeld: false, mitBoeschung: false, rueckverfuellung: true }),
    flaeche: Object.freeze({ titel: 'Fläche einer Operation', eigenesFeld: false, mitBoeschung: true,  rueckverfuellung: false }),
});

/**
 * Was die RECHNUNG nimmt: fehlt die Angabe oder ist sie unbekannt, gilt die
 * Vorgabe — so rechnet jedes `wende` seit je, und ein Journal mit einem
 * Tippfehler formt weiter, statt stehenzubleiben.
 */
export function zielart(p) {
    const z = p?.ziel;
    return ZIELARTEN[z] ? z : ZIEL_VORGABE;
}

/** Die Merkmale der geltenden Zielart — für `fillTyp`, Vorschau und alles, was fragt, statt zu vergleichen. */
export function zielMerkmale(p) {
    return ZIELARTEN[zielart(p)];
}

/**
 * Trägt die Operation ihre Zielhöhe im EIGENEN Feld?
 *
 * Das fragen die Leser, die eine feste Höhe brauchen: die ebene Krone
 * (`kennhoehen`), der innere Ring (`innen`), eine Vorbelegung. Eine unbekannte
 * Zielart zählt hier NICHT als „Höhe" — anders als in der Rechnung oben. Der
 * Unterschied ist alt und bewusst erhalten: `wende` formt lieber mit der
 * Vorgabe weiter, während ein Leser, der eine Zahl braucht, im Zweifel lieber
 * nichts behauptet.
 */
export function eigeneHoehe(p) {
    const z = p?.ziel ?? ZIEL_VORGABE;
    return !!ZIELARTEN[z]?.eigenesFeld;
}

/**
 * Die Sollhöhe am Ort — oder der Grund, warum es keine gibt.
 *
 * @param {object} p                   die Parameter der Operation
 * @param {{art: string, feld: string}} wer   Name der Operation (für die Warnung)
 *                                     und ihr eigenes Höhenfeld (`hoehe`, `sohle`)
 * @param {object} [ctx]               `{raster, ur, flaecheAn(id) → {gefunden, an}}`;
 *                                     `flaecheAn` baut `formeNach` aus der Registry
 * @returns {{an: (x: number, z: number, i: number) => number, grund: string|null, mitBoeschung: boolean}}
 */
export function sollhoeheVon(p, { art, feld }, { raster = null, ur = null, flaecheAn = null } = {}) {
    const z = zielart(p);
    const merkmale = ZIELARTEN[z];
    const aus = (an, grund = null) => ({ an, grund, mitBoeschung: merkmale.mitBoeschung });

    if (z === 'ur') {
        if (!gleicherBezug(ur, raster)) return aus(() => NaN, `${art}_ohne_ur: das Ur-Gelände liegt nicht auf diesem Raster`);
        return aus((x, zz, i) => ur.heights[i]);
    }
    if (z === 'flaeche') {
        const id = p?.flaeche ?? null;
        const treffer = flaecheAn?.(id) ?? { gefunden: false, an: null };
        if (!treffer.gefunden) return aus(() => NaN, `${art}_ziel_fehlt: die Operation ${id ?? '—'} liegt im Stapel nicht vor dieser ${BEZEICHNUNG[art] ?? 'Operation'}`);
        if (!treffer.an) return aus(() => NaN, `${art}_ziel_ohne_flaeche: die Operation ${id} stellt keine Fläche her`);
        return aus((x, zz) => treffer.an(x, zz));
    }
    const wert = p?.[feld];
    if (!Number.isFinite(wert)) return aus(() => NaN, `${art}_ohne_${feld}`);
    return aus(() => wert);
}

/**
 * Wie eine Operation in ihrer eigenen Warnung heisst. Nur Text — der Satz
 * „… liegt im Stapel nicht vor dieser Auffüllung" stand so schon da, und eine
 * Warnung, die sich ändert, wäre eine Änderung am Verhalten.
 */
const BEZEICHNUNG = Object.freeze({ schuettung: 'Auffüllung', grube: 'Grube', planum: 'Planum', boeschung: 'Böschung', baugrube: 'Baugrube' });
