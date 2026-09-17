/**
 * Eingaben — die Situationen des Bearbeitens, geschlossen (Teil XVI, S3).
 *
 * Zwei Ebenen, und die Trennung ist der Kern:
 *
 *   SCHLITZE   was `anwenden(el, werte, {zug})` STRUKTURELL bekommt:
 *              subjekt (1 | n bei mehrfach) · zug (min/max Punkte) · umriss
 *   GESTEN     WIE ein FELD befüllt wird: tippen (Formular) · punkt (Ort auf
 *              dem Subjekt — Station auf der Achse, Ort auf der Fläche) ·
 *              auswahl (ein Bauteil mit Filter) · griff (gebundenes Ziehen, S4)
 *
 * `punkt` und `griff` sind KEINE Eingabearten neben `zug`: die Station bei
 * „Haltung teilen" ist im Katalog ausdrücklich ein Feld, `ost/nord` beim
 * Schacht sind Felder, die der Plan-Griff per `setzeWert` füllt. Eine Geste
 * ist der ANDERE WEG in dasselbe Feld — ein zweiter Weg zu derselben Sache
 * wäre genau der Auseinanderläufer, den dieses Feature schon dreimal hatte.
 *
 * Abgeleitet, nicht abgeschrieben: `eingabenFuer(b)` liest `eingabe`,
 * `mindestPunkte`, `mehrfach`, `gruppe`, `felder[].aus` und `eingaben` des
 * Katalogeintrags. Rein, ohne Vue.
 */

import { eingabeArt } from './Bearbeitungen.js';

export const SCHLITZE = Object.freeze({
    subjekt: 'das gewählte Bauteil (oder mehrere)',
    zug:     'ein offener Linienzug — im Lageplan oder im Raum',
    umriss:  'ein geschlossener Umriss',
});

export const GESTEN = Object.freeze({
    tippen:  'ein Wert im Formular',
    punkt:   'ein Ort AUF dem Subjekt: Station auf der Achse, Ort auf der Fläche',
    auswahl: 'ein anderes Bauteil, gefiltert nach Bauform oder Herkunft',
    griff:   'gebundenes Ziehen mit Zwang (XZ | Y) — der Wert entsteht beim Loslassen',
});

/** Gesten, für die ein Verbraucher gebaut ist — `griff` kommt mit S4. */
export const GESTEN_GEBAUT = Object.freeze(['tippen', 'punkt', 'auswahl', 'griff']);

export const PHASEN = Object.freeze(['aus', 'sammeln', 'pruefen']);

/**
 * @param {object} b  Katalogeintrag
 * @returns {{ schlitze: Array<{schlitz, anzahl:{min,max}, fang?:string}>,
 *             felderMitGeste: Array<{name, geste, auf?, bauform?, herkunft?, liefert?}> }}
 */
export function eingabenFuer(b) {
    if (!b) return { schlitze: [], felderMitGeste: [] };
    const schlitze = [];
    if (b.gruppe !== 'erzeugen') {
        schlitze.push({ schlitz: 'subjekt', anzahl: { min: 1, max: b.mehrfach ? Infinity : 1 } });
    }
    const art = eingabeArt(b);
    if (art === 'zug' || art === 'umriss') {
        const erklaert = (b.eingaben ?? []).find(e => e?.schlitz === art) ?? {};
        schlitze.push({
            schlitz: art,
            anzahl: {
                min: Number.isFinite(erklaert.anzahl?.min) ? erklaert.anzahl.min : (b.mindestPunkte ?? (art === 'umriss' ? 3 : 2)),
                max: Number.isFinite(erklaert.anzahl?.max) ? erklaert.anzahl.max : Infinity,
            },
            ...(erklaert.fang ? { fang: erklaert.fang } : {}),
        });
    }
    const felderMitGeste = (b.felder ?? [])
        .filter(f => f?.aus?.geste && f.aus.geste !== 'tippen')
        .map(f => ({ name: f.name, ...f.aus }));
    return { schlitze, felderMitGeste };
}

/** Was fehlt zuerst? — für die Statuszeile und den Übernehmen-Knopf. */
export function naechsterSchritt(eingaben, { punkte = 0, zugGeschlossen = false, bereit = false, geste = null } = {}) {
    if (geste) {
        return { art: 'geste', name: geste.feld, hinweis: geste.art === 'auswahl'
            ? 'Bauteil antippen — Esc bricht die Geste ab'
            : 'Ort auf dem Bauteil antippen — Esc bricht die Geste ab' };
    }
    const zugSchlitz = (eingaben?.schlitze ?? []).find(s => s.schlitz === 'zug' || s.schlitz === 'umriss');
    if (zugSchlitz && !zugGeschlossen) {
        const fehlt = zugSchlitz.anzahl.min - punkte;
        if (fehlt > 0) {
            return { art: 'zug', name: zugSchlitz.schlitz,
                     hinweis: `noch ${fehlt} ${fehlt === 1 ? 'Punkt' : 'Punkte'}` };
        }
        if (punkte >= zugSchlitz.anzahl.max) {
            return { art: 'bereit', name: zugSchlitz.schlitz, hinweis: 'Zug vollständig — Enter übernimmt' };
        }
        return { art: 'zug', name: zugSchlitz.schlitz, hinweis: zugSchlitz.schlitz === 'umriss'
            ? `${punkte} Punkte — ersten Punkt antippen schliesst den Umriss`
            // Gezeichnet wird im Raum, und dort schliesst Enter ab — einen
            // Doppelklick gibt es seit `c8ce9c4` nur noch im Lageplan, wo er
            // das Blatt einpasst.
            : `${punkte} Punkte — Enter schliesst ab` };
    }
    if (!bereit) return { art: 'feld', name: null, hinweis: 'Werte im Formular vervollständigen' };
    return { art: 'bereit', name: null, hinweis: 'Enter übernimmt' };
}

/**
 * Die Enter-Regel — EIN Weg:
 *   SAMMELN, Zug vollständig, Formular gültig  → anwenden
 *   SAMMELN, Zug vollständig, Formular offen   → prüfen (Zug schliessen, Formular zeigen)
 *   PRÜFEN,  Formular gültig                   → anwenden
 *   sonst                                      → nichts
 */
export function enterRegel({ phase = 'aus', genug = false, bereit = false } = {}) {
    if (phase === 'sammeln') {
        if (!genug) return 'nichts';
        return bereit ? 'anwenden' : 'pruefen';
    }
    if (phase === 'pruefen') return bereit ? 'anwenden' : 'nichts';
    return 'nichts';
}

/**
 * DER SCHLIESSFANG (Teil XX, Fabio 2026-09-10): ein Tipp nahe dem ERSTEN
 * Punkt schliesst einen Umriss, statt einen weiteren Punkt zu setzen — auf
 * dem Tablet der einzige Weg ohne Tastatur, im Raum gibt es keinen
 * Doppelklick. Er SCHREIBT NICHTS (Tablet-Regel 4: ein Tipp schreibt nicht):
 * der Zug geht auf „prüfen", übernommen wird mit dem Knopf. Die NÄHE misst
 * der Aufrufer — der Lageplan im Weltabstand, der Raum in Bildschirmpixeln;
 * die Regel ist für beide dieselbe.
 */
export function schliesstUmriss({ schlitz = null, punkte = 0, mindest = 3, nahe = false } = {}) {
    return schlitz === 'umriss' && punkte >= mindest && !!nahe;
}

/** Wie nah ist nah, am Bildschirm? Der Finger ist ungenauer als die Maus (T4-Regel). */
export const SCHLIESS_RADIUS_PX = Object.freeze({ touch: 22, pen: 16, mouse: 14 });
