/**
 * MUSTER · Kastenschacht — ein rechteckiger Schacht (ISYBAU Aufbauform E oder Q)
 * als Kette von Teilen, von unten nach oben (BIMFY I9).
 *
 * ISYBAU nennt für ihn die lichte Länge und Breite (`LaengeAufbau`,
 * `BreiteAufbau`), die Tiefe und manchmal den Werkstoff — sonst nichts. Eine
 * Norm für rechteckige Schachtfertigteile (DIN EN 1917) ist nicht im Bestand.
 * Die Masse der Wand, des Bodens und der Abdeckung sind deshalb ANNAHMEN,
 * angelehnt an den runden Schacht, und heissen so.
 *
 *   klein (lichte Seite < 0,8 m)   Kasten mit rechteckiger Abdeckung — ein Kontrollschacht
 *   begehbar (≥ 0,8 m)             Kasten, Abdeckplatte mit runder Öffnung, Auflagering,
 *                                  runde Abdeckung, Steigeisen ab 1 m Tiefe
 *
 * Gemessene Höhen gelten: die Sohle ist die Oberkante des Bodens, der Deckel
 * die Oberkante der Abdeckung. Was dazwischen nicht aufgeht, ist ein Befund.
 *
 * Rein: Zahlen hinein, Zahlen heraus. Meter.
 */
import { ABDECKPLATTE, ABDECKUNGSKLASSEN, AUFLAGERINGE, B, HALS } from './Normwerte.js';
import { ANNAHMEN, steigeisenHoehen } from './Normschacht.js';
import { herleitung as H } from './Herleitung.js';

const _fin = Number.isFinite;
const _r3 = (v) => Math.round(v * 1000) / 1000;

/** Ab dieser lichten Seite ist ein Kasten begehbar (DWA-A 157: Einstieg ab 0,8 m — wie der runde Schacht). */
export const KASTEN_BEGEHBAR_M = 0.8;

/** Die Annahmen des Kastens — je Mass ein Satz, warum. */
export const KASTEN_ANNAHMEN = Object.freeze({
    wandMauerwerk: Object.freeze({ wert: 0.24, text: 'Mauerwerk: Wand 24 cm (ein Stein)' }),
    wandBegehbar: Object.freeze({ wert: 0.15, text: 'Beton: Wand 15 cm, angelehnt an die Ringwand DN 1500 (DIN 4034-1, Tab. 10)' }),
    wandKlein: Object.freeze({ wert: 0.08, text: 'Kontrollschacht: Wand 8 cm (Faustwert Beton/Kunststoff)' }),
    bodenBegehbar: Object.freeze({ wert: 0.2, text: 'Boden 20 cm, angelehnt an das Unterteil ab DN 1500 (DIN 4034-1, Tab. 4)' }),
    bodenKlein: Object.freeze({ wert: 0.1, text: 'Boden 10 cm (Faustwert)' }),
    abdeckungKlein: Object.freeze({ wert: 0.1, text: 'Rechteckige Abdeckung 10 cm hoch, Rahmen 8 cm breit (DIN 19584 fehlt im Bestand)' }),
});

/**
 * @param {object} s           ein ISYBAU-Schacht (`isybau/Isybauleser`) oder die Werte einer Vorlage in derselben Form
 * @param {object} [o]
 * @param {{richtung, art}[]} [o.anschluesse]  die Längsachse folgt dem Ablauf
 * @param {string} [o.quelle]  'isybau' | 'vorlage'
 * @returns {{teile: object[], befunde: object[], kopf: object|null}}
 */
export function kastenschacht(s, { anschluesse = [], quelle = 'isybau' } = {}) {
    const Q = quelle;
    const befunde = [];
    const befund = (regel, text, schwere = 'hinweis') => befunde.push({ regel, schwere, text });
    const au = s.aufbau ?? {};
    const L = au.laenge, Bt = au.breite ?? au.laenge;
    if (!(L > 0) || !(Bt > 0)) {
        befund('ohne_masse', 'Rechteckschacht ohne lichte Länge und Breite — kein Kasten.', 'warnung');
        return { teile: [], befunde, kopf: null };
    }
    const zDeckel = s.deckelHoehe, zSohle = s.sohle?.hoehe;
    if (!_fin(zDeckel) || !_fin(zSohle) || zDeckel - zSohle <= 0) {
        befund('ohne_hoehen', 'Deckel- oder Sohlhöhe fehlt — kein Kasten.', 'warnung');
        return { teile: [], befunde, kopf: null };
    }
    const tiefe = zDeckel - zSohle;
    const begehbar = Math.min(L, Bt) >= KASTEN_BEGEHBAR_M - 1e-9;
    const hMasse = H(Q, 'Lichte Länge und Breite (LaengeAufbau, BreiteAufbau)');

    // ── Wand und Boden (Annahmen, ein gegebener Wert gilt) ──
    const mauerwerk = String(au.material ?? '').toUpperCase() === 'MA';
    const wA = _fin(s.wand) && s.wand > 0 ? null : (mauerwerk ? KASTEN_ANNAHMEN.wandMauerwerk : begehbar ? KASTEN_ANNAHMEN.wandBegehbar : KASTEN_ANNAHMEN.wandKlein);
    const wand = wA ? wA.wert : s.wand;
    const hWand = wA ? H('annahme', wA.text) : H(Q, 'Wanddicke gegeben');
    const bA = begehbar ? KASTEN_ANNAHMEN.bodenBegehbar : KASTEN_ANNAHMEN.bodenKlein;
    const boden = bA.wert;

    // ── Richtung: die Längsachse folgt dem Ablauf, sonst Ost ──
    const ablauf = anschluesse.find(a => a.art === 'ablauf' && _fin(a.richtung));
    const richtung = _fin(s.richtung) ? s.richtung : (ablauf?.richtung ?? 0);
    const hRichtung = _fin(s.richtung) ? H(Q, 'Richtung gegeben')
        : ablauf ? H('annahme', 'Längsachse in Richtung des Ablaufs') : H('annahme', 'Längsachse nach Osten (keine Angabe)');

    // ── Oben: Abdeckung, bei begehbaren dazu Auflagering und Abdeckplatte ──
    const teile = [];
    const kopfOben = [];
    let zOben = zDeckel;
    const oberteil = s.oberteil ?? (begehbar ? 'platte' : 'abdeckung');
    if (oberteil === 'platte') {
        const klasse = s.abdeckung?.klasse ?? null;
        const schwer = !klasse || (ABDECKUNGSKLASSEN[klasse]?.gruppe ?? 4) >= 4;
        const hRahmen = schwer ? ANNAHMEN.rahmenhoehe.schwer : ANNAHMEN.rahmenhoehe.leicht;
        const oeffnung = s.abdeckung?.laenge > 0 ? s.abdeckung.laenge : HALS.oeffnungen[0];
        const dAbd = oeffnung + 2 * ANNAHMEN.rahmenbreite.wert;
        kopfOben.push({
            rolle: 'abdeckung', name: `Schachtabdeckung ${klasse ? ABDECKUNGSKLASSEN[klasse]?.titel ?? klasse : ''}`.trim(),
            unten: _r3(zOben - hRahmen), oben: _r3(zOben), dAussen: _r3(dAbd), lichteWeite: oeffnung, deckeldicke: ANNAHMEN.deckeldicke?.wert ?? 0.06,
            klasse, herleitung: { hoehe: H('annahme', ANNAHMEN.rahmenhoehe.text), aussen: H('annahme', ANNAHMEN.rahmenbreite.text) },
        });
        zOben -= hRahmen;
        const hAr = Math.min(...AUFLAGERINGE.hoehen);
        kopfOben.push({
            rolle: 'auflagering', name: `Auflagering ${Math.round(hAr * 1000)} mm`, unten: _r3(zOben - hAr), oben: _r3(zOben),
            dInnen: oeffnung, dAussen: _r3(dAbd + 0.01),
            herleitung: { hoehe: H('norm', 'Auflagering, mindestens einer', B.auflagering) },
        });
        zOben -= hAr;
        kopfOben.push({
            rolle: 'kastenplatte', name: 'Abdeckplatte rechteckig', unten: _r3(zOben - ABDECKPLATTE.hoehe), oben: _r3(zOben),
            laenge: L, breite: Bt, wand, oeffnung,
            herleitung: { hoehe: H('annahme', 'Abdeckplatte 200 mm wie beim runden Schacht (DIN 4034-1, 4.3.3.8.7)'), oeffnung: H('norm', 'Öffnung 625 mm', B.hals) },
        });
        zOben -= ABDECKPLATTE.hoehe;
    } else {
        const a = KASTEN_ANNAHMEN.abdeckungKlein;
        kopfOben.push({
            rolle: 'kastenabdeckung', name: 'Abdeckung rechteckig', unten: _r3(zOben - a.wert), oben: _r3(zOben),
            laenge: L, breite: Bt, wand: ANNAHMEN.rahmenbreite.wert, herleitung: { hoehe: H('annahme', a.text) },
        });
        zOben -= a.wert;
    }

    // ── Unten: der Kasten, von der Unterkante des Bodens bis unter das Oberteil ──
    const wandHoehe = zOben - zSohle;
    if (wandHoehe < 0.05) {
        befund('zu_flach', `Zu flach für Boden, Wand und Abdeckung: ${Math.round(tiefe * 1000)} mm.`, 'warnung');
        return { teile: [], befunde, kopf: null };
    }
    teile.push({
        rolle: 'kastenunterteil', name: `Schachtunterteil ${Math.round(L * 1000)} × ${Math.round(Bt * 1000)}`,
        unten: _r3(zSohle - boden), oben: _r3(zOben), laenge: L, breite: Bt, wand, boden, material: au.material ?? null,
        herleitung: { masse: hMasse, wanddicke: hWand, boden: H('annahme', bA.text), richtung: hRichtung },
    });
    teile.push(...kopfOben.reverse());

    // ── Steigeisen: begehbar und tiefer als 1 m, an der Wand quer zur Längsachse ──
    if (begehbar && tiefe > 1.0 && s.einstieghilfe !== false) {
        const { hoehen } = steigeisenHoehen(zSohle, zOben);
        if (hoehen.length) {
            teile.push({ rolle: 'steigeisen', name: 'Steigeisengang einläufig', hoehen, richtung: richtung + Math.PI / 2, abstand: Bt / 2,
                         herleitung: { hoehen: H('norm', 'Steigmass 250–333 mm, erster Auftritt 250–500 mm', B.steig),
                                       lage: H('annahme', 'an der Längswand links der Fliessrichtung') } });
        }
    }
    if (mauerwerk) befund('mauerwerk', 'Gemauerter Schacht — als Kasten mit 24 cm Wand gebaut.');
    befund('kasten_annahmen', 'Rechteckschacht: Wand, Boden und Abdeckung sind Annahmen (DIN EN 1917 nicht im Bestand).');

    return {
        teile, befunde,
        kopf: {
            vorlage: 'kastenschacht', name: s.name, ort: s.ort, deckel: zDeckel, sohle: zSohle, tiefe: _r3(tiefe),
            laenge: L, breite: Bt, wand, boden, richtung, oberteil, begehbar,
        },
    };
}
