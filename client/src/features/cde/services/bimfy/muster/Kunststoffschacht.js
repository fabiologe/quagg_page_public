/**
 * MUSTER · Kunststoffschacht — ein kleiner Schacht aus PP oder PVC, wie er am
 * Gebäudeanschluss sitzt (BIMFY I11, Fabio: „meist ein kleiner PVC-Schacht mit
 * DI = 0,8 m"). Skalierbar über den lichten Durchmesser:
 *
 *   DI ≥ 0,8 m   Unterteil, Schachtrohr, Konus auf die Öffnung, Abdeckung
 *   DI < 0,8 m   Unterteil, Schachtrohr, Teleskop mit Abdeckung (nicht begehbar)
 *
 * Die Produktnorm (DIN EN 13598-2) ist nicht im Bestand: Wand, Boden und die
 * Bauhöhen sind ANNAHMEN, je mit Satz. Gemessene Höhen gelten — Sohle unten,
 * Deckel (bzw. Gelände) oben; das Schachtrohr nimmt den Rest auf.
 *
 * Rein: Zahlen hinein, Zahlen heraus. Meter.
 */
import { ABDECKUNGSKLASSEN, HALS } from './Normwerte.js';
import { ANNAHMEN } from './Normschacht.js';
import { herleitung as H } from './Herleitung.js';

const _fin = Number.isFinite;
const _r3 = (v) => Math.round(v * 1000) / 1000;

/** Die Annahmen des Kunststoffschachts — eine Stelle, je Mass ein Satz. */
export const KUNSTSTOFF_ANNAHMEN = Object.freeze({
    wand: Object.freeze({ faktor: 1 / 40, min: 0.01, text: 'Wand DI/40, mindestens 10 mm (Profilwand gleichwertig; DIN EN 13598-2 nicht im Bestand)' }),
    boden: Object.freeze({ wert: 0.03, text: 'Boden 30 mm (Faustwert Kunststoff)' }),
    unterteil: Object.freeze({ wert: 0.5, text: 'Unterteil 500 mm hoch (Faustwert, mit angeformtem Gerinne)' }),
    konus: Object.freeze({ wert: 0.4, text: 'Konus 400 mm hoch auf Öffnung 625 mm (Faustwert Kunststoff)' }),
    teleskop: Object.freeze({ wert: 0.2, text: 'Teleskop 200 mm (Faustwert)' }),
    begehbar: Object.freeze({ wert: 0.8, text: 'ab DI 800 mm begehbar — Konus statt Teleskop' }),
});

/**
 * KONUS ERST AB 1,0 m TIEFE (Fabio, 2026-10-05: „irgendwo eine Regel") — darunter
 * Teleskop unter der Abdeckung. Die Fundstelle ist offen; DIN 1986-100, DWA-A 157
 * und DIN 4034-1 im Bestand nennen sie nicht wörtlich.
 */
export const KONUS_AB_TIEFE = Object.freeze({ wert: 1.0, text: 'Konus erst ab 1,0 m Tiefe (Vorgabe Fabio, 2026-10-05 — Fundstelle offen)' });

/** Die Wanddicke eines Kunststoffschachts zu seinem Durchmesser (Annahme). */
export const kunststoffWand = (di) => Math.max(KUNSTSTOFF_ANNAHMEN.wand.min, _r3(di * KUNSTSTOFF_ANNAHMEN.wand.faktor));

/**
 * @param {object} s  `{name, ort, sohle, deckel, di, klasse, herkunft: {di, deckel}}` — `herkunft`
 *                    sagt je Mass, woher es stammt (eine Herleitung), damit die Kette es weitergibt
 * @param {object} [o]
 * @param {string} [o.quelle]  'isybau' | 'vorlage'
 * @returns {{teile: object[], befunde: object[], kopf: object|null}}
 */
export function kunststoffschacht(s, { quelle = 'isybau' } = {}) {
    const befunde = [];
    const befund = (regel, text, schwere = 'hinweis') => befunde.push({ regel, schwere, text });
    const di = s.di, zSohle = s.sohle, zDeckel = s.deckel;
    if (!(di > 0) || !_fin(zSohle) || !_fin(zDeckel) || zDeckel <= zSohle) {
        befund('ohne_masse', 'Kunststoffschacht ohne Durchmesser, Sohle oder Deckel.', 'warnung');
        return { teile: [], befunde, kopf: null };
    }
    const A = KUNSTSTOFF_ANNAHMEN;
    const wand = kunststoffWand(di), boden = A.boden.wert;
    const hDi = s.herkunft?.di ?? H(quelle, 'Durchmesser gegeben');
    const hWand = H('annahme', A.wand.text);
    const begehbar = di >= A.begehbar.wert - 1e-9;
    const klasse = s.klasse ?? null;
    const schwer = klasse && (ABDECKUNGSKLASSEN[klasse]?.gruppe ?? 0) >= 4;
    const hRahmen = schwer ? ANNAHMEN.rahmenhoehe.schwer : ANNAHMEN.rahmenhoehe.leicht;
    const oeffnung = begehbar ? HALS.oeffnungen[0] : di;

    // Oben die Abdeckung, darunter Konus (begehbar) oder Teleskop.
    const teile = [];
    const oben = [];
    let z = zDeckel;
    const dAbd = oeffnung + 2 * ANNAHMEN.rahmenbreite.wert;
    oben.push({ rolle: 'abdeckung', name: `Schachtabdeckung ${klasse ? ABDECKUNGSKLASSEN[klasse]?.titel ?? klasse : ''}`.trim(),
                unten: _r3(z - hRahmen), oben: _r3(z), dAussen: _r3(dAbd), lichteWeite: oeffnung, deckeldicke: ANNAHMEN.deckeldicke.wert, klasse,
                herleitung: { hoehe: H('annahme', ANNAHMEN.rahmenhoehe.text), deckel: s.herkunft?.deckel ?? H(quelle, 'Deckelhöhe gegeben') } });
    z -= hRahmen;
    const rest = () => z - zSohle - A.unterteil.wert;
    const tiefe = zDeckel - zSohle;
    const konusErlaubt = tiefe >= KONUS_AB_TIEFE.wert - 1e-9;
    // Das Schachtrohr darf entfallen: Abdeckung, Konus und Unterteil allein sind ein Schacht.
    if (begehbar && konusErlaubt && rest() >= A.konus.wert - 1e-9) {
        oben.push({ rolle: 'schachthals', name: `Konus DI ${Math.round(di * 1000)}/${Math.round(oeffnung * 1000)}`,
                    unten: _r3(z - A.konus.wert), oben: _r3(z), dUnten: di, dOben: oeffnung, wanddicke: wand,
                    herleitung: { hoehe: H('annahme', A.konus.text), wanddicke: hWand, konus: H('vorgabe', KONUS_AB_TIEFE.text) } });
        z -= A.konus.wert;
    } else {
        if (begehbar && !konusErlaubt) befund('unter_konustiefe', `${Math.round(tiefe * 100) / 100} m tief — ${KONUS_AB_TIEFE.text}: Teleskop unter der Abdeckung.`);
        else if (begehbar) befund('zu_flach_fuer_konus', 'Zu flach für einen Konus — Teleskop direkt unter der Abdeckung.');
        const h = Math.min(A.teleskop.wert, Math.max(0, rest()));
        if (h > 0.01) {
            oben.push({ rolle: 'teleskop', name: `Teleskop DI ${Math.round(oeffnung * 1000)}`, unten: _r3(z - h), oben: _r3(z),
                        dInnen: oeffnung, dAussen: _r3(oeffnung + 2 * wand), herleitung: { hoehe: H('annahme', A.teleskop.text), wanddicke: hWand } });
            z -= h;
        }
    }

    // Unten: Unterteil (mit Boden unter der Sohle), dazwischen das Schachtrohr.
    const hUnter = Math.min(A.unterteil.wert, z - zSohle);
    if (hUnter < 0.05) {
        befund('zu_flach', `Zu flach für einen Kunststoffschacht: ${Math.round((zDeckel - zSohle) * 1000)} mm.`, 'warnung');
        return { teile: [], befunde, kopf: null };
    }
    teile.push({ rolle: 'schachtunterteil', name: `Schachtunterteil DI ${Math.round(di * 1000)} (Kunststoff)`,
                 unten: _r3(zSohle - boden), oben: _r3(zSohle + hUnter), dInnen: di, dAussen: _r3(di + 2 * wand), boden,
                 herleitung: { dInnen: hDi, wanddicke: hWand, boden: H('annahme', A.boden.text), hoehe: H('annahme', A.unterteil.text) } });
    const hRohr = z - (zSohle + hUnter);
    if (hRohr > 0.01) {
        teile.push({ rolle: 'schachtrohr', name: `Schachtrohr DI ${Math.round(di * 1000)}`, unten: _r3(zSohle + hUnter), oben: _r3(z),
                     dInnen: di, dAussen: _r3(di + 2 * wand),
                     herleitung: { hoehe: H(quelle, 'Rest zwischen Unterteil und Oberteil — die gemessenen Höhen gelten'), dInnen: hDi, wanddicke: hWand } });
    }
    teile.push(...oben.reverse());
    befund('kunststoff_annahmen', 'Kunststoffschacht: Wand, Boden und Bauhöhen sind Annahmen (DIN EN 13598-2 nicht im Bestand).');
    return {
        teile, befunde,
        kopf: { vorlage: 'kunststoffschacht', name: s.name, ort: s.ort, sohle: zSohle, deckel: zDeckel, tiefe: _r3(zDeckel - zSohle),
                di, wand, oeffnung, begehbar, klasse },
    };
}
