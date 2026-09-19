/**
 * DIE SICHT AUF DEN QUERSCHNITT (Teil XX, Stufe D — 2026-09-19).
 *
 * Die Oberfläche fragt hier, nicht bei der Geländeschicht (sie greift nicht
 * in `gelaende/`): hat dieser Vorgang einen Schnitt, und wie sieht er an
 * Station s aus — in m NN, fertig zum Zeichnen. Welche Achse, welche Sohle,
 * welche Breite, sagt das REZEPT (`querschnitt`); gerechnet wird in
 * `gelaende/Querschnitt.js`. Dieselbe Arbeitsteilung wie beim Längsschnitt
 * (`LaengsschnittSicht.js`).
 */

import { rezeptNach } from './Bauteilrezepte.js';
import { nnAusWelt, weltAusNn } from './Hoehenbezug.js';
import { querlinie, querschnittBei } from './gelaende/Querschnitt.js';

/** Die Achse des Schnitts für einen Bauplan — oder null (kein Gerinne, kein Graben). */
export function schnittachseVon(bauplan, { lauf = null, hoehenversatz = 0 } = {}) {
    const rz = bauplan ? rezeptNach(bauplan.rezept) : null;
    if (typeof rz?.querschnitt !== 'function') return null;
    return rz.querschnitt(bauplan.parameter, { lauf, welt: (nn) => weltAusNn(nn, hoehenversatz) }) ?? null;
}

/**
 * Der Schnitt an Station s — alle Höhen in m NN, die Querlinie in Welt.
 * @returns {object|null}  {station, laenge, sohle, tiefe, sohlbreite, obenBreite, neigung, ur, ist, soll, linie, offen}
 */
export function schnittSicht(achse, station, { urAn, istAn = null, hoehenversatz = 0 } = {}) {
    const s = querschnittBei(achse, station, { urAn, istAn });
    if (!s) return null;
    const nn = (y) => nnAusWelt(y, hoehenversatz);
    const zuNn = (l) => l.map(p => ({ d: p.d, y: nn(p.y) }));
    return {
        station: s.station, laenge: s.laenge, sohle: nn(s.sohle), tiefe: s.tiefe, sohlbreite: s.sohlbreite,
        obenBreite: s.obenBreite, neigung: s.neigung, halb: s.halb, offen: s.offen,
        ur: zuNn(s.ur), ist: zuNn(s.ist), soll: zuNn(s.soll),
        linie: querlinie(s),
    };
}
