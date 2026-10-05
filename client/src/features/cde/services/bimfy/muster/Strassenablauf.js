/**
 * MUSTER · Straßenablauf — der Gully als Kette von Teilen (BIMFY I12).
 *
 * Aufbau nach REwS 2021, 5.6.3: „Das Unterteil eines Straßenablaufes besteht
 * aus Auflagering, Schaft und Boden. Bei Unterteilen für Trockenschlamm werden
 * Schlammeimer eingehängt. Unterteile für Nassschlamm erhalten einen
 * Schlammfang." Der Eimer ist 600 mm hoch, in der niedrigen Bauform 250 mm
 * (5.6.3.2). Darüber der Aufsatz.
 *
 * Die Masse der Betonteile stehen in DIN 4052 — nicht im Bestand: Durchmesser,
 * Wand, Boden, Aufsatz und Schlammfang sind ANNAHMEN, je mit Satz.
 *
 * Gemessene Höhen gelten: die Sohle ist die Sohle des Ablaufs, oben die
 * Oberkante des Aufsatzes. Der Schaft nimmt den Rest auf.
 *
 * Rein: Zahlen hinein, Zahlen heraus. Meter.
 */
import { B } from './Normwerte.js';
import { herleitung as H } from './Herleitung.js';

const _fin = Number.isFinite;
const _r3 = (v) => Math.round(v * 1000) / 1000;

/** Die Annahmen des Straßenablaufs (DIN 4052 nicht im Bestand) — je Mass ein Satz. */
export const ABLAUF_ANNAHMEN = Object.freeze({
    di: Object.freeze({ wert: 0.45, text: 'Schaft innen 450 mm (übliche Betonteile; DIN 4052 nicht im Bestand)' }),
    wand: Object.freeze({ wert: 0.075, text: 'Wand 75 mm (Faustwert Betonteile)' }),
    boden: Object.freeze({ wert: 0.1, text: 'Boden 100 mm (Faustwert)' }),
    bodenteil: Object.freeze({ wert: 0.35, text: 'Bodenteil mit Ablauf reicht 350 mm über die Ablaufsohle (Faustwert)' }),
    unterAblaufTrocken: Object.freeze({ wert: 0.05, text: 'Trockenschlamm: Boden 50 mm unter der Ablaufsohle (Faustwert)' }),
    schlammfang: Object.freeze({ wert: 0.5, text: 'Nassschlamm: Schlammfang 500 mm unter der Ablaufsohle (Faustwert)' }),
    aufsatz: Object.freeze({ laenge: 0.5, breite: 0.5, hoehe: 0.16, rahmen: 0.04,
                             text: 'Aufsatz 500 × 500 mm, 160 mm hoch (quadratischer Aufsatz nach REwS-Bildern; Masse angenommen)' }),
    auflagering: Object.freeze({ wert: 0.06, text: 'Auflagering 60 mm (Faustwert)' }),
    ablaufDn: Object.freeze({ wert: 0.15, text: 'Ablauf DN 150 — der Eimer endet darüber' }),
});

/** Eimerhöhen nach REwS 2021, 5.6.3.2: normale Bauform 600 mm, niedrige 250 mm. */
export const EIMER = Object.freeze({ normal: 0.6, niedrig: 0.25 });

/**
 * @param {object} s  `{name, ort, sohle, deckel, schlamm: 'trocken'|'nass', herkunft: {deckel}}`
 * @param {object} [o]  `quelle`: 'isybau' | 'vorlage'
 * @returns {{teile: object[], befunde: object[], kopf: object|null}}
 */
export function strassenablauf(s, { quelle = 'isybau' } = {}) {
    const befunde = [];
    const befund = (regel, text, schwere = 'hinweis') => befunde.push({ regel, schwere, text });
    const A = ABLAUF_ANNAHMEN;
    const zSohle = s.sohle, zOben = s.deckel;
    if (!_fin(zSohle) || !_fin(zOben) || zOben <= zSohle) {
        befund('ohne_hoehen', 'Straßenablauf ohne Sohle oder Oberkante.', 'warnung');
        return { teile: [], befunde, kopf: null };
    }
    const nass = s.schlamm === 'nass';
    const di = A.di.wert, wand = A.wand.wert, dA = _r3(di + 2 * wand);
    const hDi = H('annahme', A.di.text), hWand = H('annahme', A.wand.text);

    // Oben: Aufsatz, Auflagering.
    const ufA = zOben - A.aufsatz.hoehe;
    const ufR = ufA - A.auflagering.wert;
    // Unten: Boden mit Ablauf.
    const u = zSohle - (nass ? A.schlammfang.wert : A.unterAblaufTrocken.wert) - A.boden.wert;
    let obenBoden = zSohle + A.bodenteil.wert;
    if (obenBoden > ufR) obenBoden = ufR;                         // flach: kein Schaft, der Boden reicht bis zum Ring
    if (obenBoden - (u + A.boden.wert) < A.ablaufDn.wert) {
        befund('zu_flach', `Zu flach für einen Straßenablauf: ${Math.round((zOben - zSohle) * 1000)} mm.`, 'warnung');
        return { teile: [], befunde, kopf: null };
    }
    const teile = [];
    teile.push({ rolle: 'boden', name: nass ? 'Ablaufboden mit Schlammfang' : 'Ablaufboden mit Ablauf',
                 unten: _r3(u), oben: _r3(obenBoden), dInnen: di, dAussen: dA, boden: A.boden.wert,
                 herleitung: { dInnen: hDi, wanddicke: hWand, boden: H('annahme', A.boden.text),
                               hoehe: H('annahme', nass ? A.schlammfang.text : A.unterAblaufTrocken.text), aufbau: H('norm', 'Auflagering, Schaft und Boden', B.strassenablauf) } });
    if (ufR - obenBoden > 0.01) {
        teile.push({ rolle: 'schaft', name: `Ablaufschaft DI ${Math.round(di * 1000)}`, unten: _r3(obenBoden), oben: _r3(ufR), dInnen: di, dAussen: dA,
                     herleitung: { hoehe: H(quelle, 'Rest zwischen Boden und Auflagering — die gemessenen Höhen gelten'), dInnen: hDi, wanddicke: hWand } });
    }
    teile.push({ rolle: 'auflagering', name: 'Auflagering 60 mm', unten: _r3(ufR), oben: _r3(ufA), dInnen: di, dAussen: dA,
                 herleitung: { hoehe: H('annahme', A.auflagering.text) } });
    teile.push({ rolle: 'aufsatz', name: 'Aufsatz 500 × 500', unten: _r3(ufA), oben: _r3(zOben),
                 laenge: A.aufsatz.laenge - 2 * A.aufsatz.rahmen, breite: A.aufsatz.breite - 2 * A.aufsatz.rahmen, wand: A.aufsatz.rahmen,
                 herleitung: { masse: H('annahme', A.aufsatz.text), oberkante: s.herkunft?.deckel ?? H(quelle, 'Oberkante gegeben') } });

    // Der Eimer (Trockenschlamm): hängt unter dem Aufsatz, endet über dem Ablauf.
    let bauform = null;
    if (!nass) {
        const platz = ufA - (zSohle + A.ablaufDn.wert);
        const h = platz >= EIMER.normal - 1e-9 ? EIMER.normal : platz >= EIMER.niedrig - 1e-9 ? EIMER.niedrig : null;
        if (h) {
            bauform = h === EIMER.normal ? 'normal' : 'niedrig';
            teile.push({ rolle: 'eimer', name: `Schlammeimer ${Math.round(h * 1000)} mm`, unten: _r3(ufA - h), oben: _r3(ufA),
                         dInnen: _r3(di - 0.06), dAussen: _r3(di - 0.04), boden: 0.005,
                         herleitung: { hoehe: H('norm', `Eimer ${Math.round(h * 1000)} mm (${bauform === 'normal' ? 'normale' : 'niedrige'} Bauform)`, B.strassenablauf) } });
            if (bauform === 'niedrig') befund('niedrige_bauform', 'Geringe Bautiefe — niedrige Bauform mit 250-mm-Eimer (REwS 5.6.3.2).');
        } else {
            befund('ohne_eimer', 'Kein Platz für einen Schlammeimer über dem Ablauf.', 'warnung');
        }
    }
    befund('ablauf_annahmen', 'Straßenablauf: Masse der Betonteile angenommen (DIN 4052 nicht im Bestand).');
    return {
        teile, befunde,
        kopf: { vorlage: 'strassenablauf', name: s.name, ort: s.ort, sohle: zSohle, deckel: zOben, tiefe: _r3(zOben - zSohle),
                di, wand, schlamm: nass ? 'nass' : 'trocken', bauform },
    };
}
