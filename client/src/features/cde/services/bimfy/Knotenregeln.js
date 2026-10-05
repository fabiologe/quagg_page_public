/**
 * DAS KNOTENREGELWERK (BIMFY I11) — was aus einem ISYBAU-Knoten wird.
 *
 * Schacht, Anschlusspunkt, Bauwerk: jeder Knoten läuft in Reihenfolge durch die
 * Regeln seiner Art. Eine Regel
 *
 *   ENTSCHEIDET   `{bauart, muster?, grund}` — fertig, das ist das Bauteil;
 *   BERICHTIGT    `{korrektur, befund}` — ein Fehleintrag wird repariert
 *                 (vertauschte Höhen, fehlendes Gelände …) und es geht weiter;
 *   PASST NICHT   `null` (oder `{befunde}`: warum nicht) — die nächste Regel.
 *
 * Eine NEUE Regel ist ein neuer Eintrag in `KNOTENREGELN` — mit einem
 * `beispiel`, an dem sie greift (der Wächter in `bimfyKnotenregeln.test.js`
 * prüft jedes). Zahlen, die man drehen will, stehen in `KNOTEN_VORGABEN`.
 *
 * Bauarten: normschacht, kastenschacht, kunststoffschacht, strassenablauf (Vorlagen),
 * formstueck (Rezept anschlusspunkt), huelle (Rezept sonderbauwerk),
 * sonderform (Rezept schacht), auslassen (nichts baubar — gemeldet).
 *
 * Rein: Daten hinein, Entscheidung heraus.
 */
import { normschacht } from './muster/Normschacht.js';
import { kastenschacht } from './muster/Kastenschacht.js';
import { KONUS_AB_TIEFE, kunststoffschacht } from './muster/Kunststoffschacht.js';
import { strassenablauf } from './muster/Strassenablauf.js';
import { herleitung as H } from './muster/Herleitung.js';
import { B, GRUNDSTUECK_SCHACHT } from './muster/Normwerte.js';

const _fin = Number.isFinite;
const _r3 = (v) => Math.round(v * 1000) / 1000;

/** Die Stellschrauben des Regelwerks — je mit Grund. */
export const KNOTEN_VORGABEN = Object.freeze({
    kunststoffschachtFuer: Object.freeze({ wert: Object.freeze(['GA']), text: 'Punktkennungen, an denen ein Kunststoffschacht sitzt' }),
    gaDurchmesser: Object.freeze({ wert: 0.8, text: 'Gebäudeanschluss: meist ein PVC-Schacht DI 0,8 m (Fabio, 2026-10-05)' }),
    gaTiefeOhneGelaende: Object.freeze({ wert: 1.0, text: 'kein Geländepunkt (GOK) — Tiefe 1,0 m angenommen' }),
    gaTiefeMin: Object.freeze({ wert: 0.3, text: 'flacher als 0,3 m ist kein Schacht — ein Formstück' }),
    gaInspektionDi: Object.freeze({ wert: 0.4, text: 'flacher als die Konustiefe: nicht besteigbare Inspektionsöffnung DN/ID 400 (DIN 1986-100, Tab. 3: 400 bis < 800 mm bis 3,0 m)' }),
    strassenablaufFuer: Object.freeze({ wert: Object.freeze(['SE']), text: 'Punktkennungen, an denen ein Straßenablauf sitzt' }),
    seTiefeOhneGelaende: Object.freeze({ wert: 1.25, text: 'Straßenablauf ohne Oberkante — Tiefe 1,25 m angenommen (normale Bauform)' }),
    gaTiefeMax: Object.freeze({ wert: 6, text: 'tiefer als 6 m ist an einem Gebäudeanschluss unplausibel' }),
});

const V = (name) => KNOTEN_VORGABEN[name].wert;
const befund = (regel, text, schwere = 'hinweis') => ({ regel, schwere, text });

/** Ein Schacht mit gemessenen Höhen und runder Form — das Beispiel der Schachtregeln. */
const SCHACHT_BEISPIEL = Object.freeze({
    art: 'schacht', name: 'S1', ort: { ost: 0, nord: 0 }, deckelHoehe: 105, sohle: { hoehe: 102, quelle: 'SMP' },
    aufbau: { form: 'R', laenge: 0.625, konus: true }, unterteil: { form: 'R', laenge: 1 }, abdeckung: { laenge: 0.625, klasse: 'D' },
});
const GA_BEISPIEL = Object.freeze({ art: 'anschlusspunkt', name: 'GA1', punktkennung: 'GA', ort: { ost: 0, nord: 0 }, sohle: 101.2, gelaende: 102.5 });

export const KNOTENREGELN = Object.freeze([
    // ── Schacht ──
    {
        id: 'schacht-normschacht', fuer: 'schacht', titel: 'Runder Schacht → Normschacht nach DIN 4034-1',
        beispiel: SCHACHT_BEISPIEL,
        versuche(s, { anschluesse = [] } = {}) {
            const m = normschacht(s, { anschluesse });
            if (m.kopf) return { bauart: 'normschacht', muster: m, grund: 'ISYBAU-Schacht, Muster DIN 4034-1' };
            return { befunde: m.befunde };
        },
    },
    {
        id: 'schacht-kasten', fuer: 'schacht', titel: 'Eckiger Schacht (E, Q) → Kastenschacht',
        beispiel: { ...SCHACHT_BEISPIEL, aufbau: { form: 'E', laenge: 0.5, breite: 0.5 }, unterteil: null, deckelHoehe: 102.8 },
        versuche(s, { anschluesse = [] } = {}) {
            const formen = [s.aufbau?.form, s.unterteil?.form].filter(Boolean);
            if (!formen.some(f => f === 'E' || f === 'Q')) return null;
            const m = kastenschacht(s, { anschluesse });
            if (m.kopf) return { bauart: 'kastenschacht', muster: m, grund: 'ISYBAU-Schacht rechteckig, Muster Kasten', ersetzt: ['form_eckig'] };
            return { befunde: m.befunde };
        },
    },
    {
        id: 'schacht-sonderform', fuer: 'schacht', titel: 'Alles andere → Sonderform (ein Zylinder, gemeldet)',
        beispiel: { ...SCHACHT_BEISPIEL, aufbau: { form: 'Z' }, unterteil: { form: 'Z' } },
        versuche: () => ({ bauart: 'sonderform', grund: 'kein Muster passt — als Zylinder gebaut' }),
    },

    // ── Anschlusspunkt ──
    {
        id: 'ap-ohne-sohle', fuer: 'anschlusspunkt', titel: 'Ohne Lage oder Sohle → nicht baubar',
        beispiel: { ...GA_BEISPIEL, sohle: null },
        versuche: (a) => (!a.ort || !_fin(a.sohle)
            ? { bauart: 'auslassen', grund: 'ohne Lage oder Sohle', befunde: [befund('ohne_sohle', `Anschlusspunkt „${a.name}" ohne Lage oder Sohle.`, 'warnung')] }
            : null),
    },
    {
        id: 'ap-abzweig', fuer: 'anschlusspunkt', titel: 'AP (Stutzen, Abzweig) → Formstück JUNCTION',
        beispiel: { ...GA_BEISPIEL, punktkennung: 'AP', gelaende: null },
        versuche: (a) => (!a.punktkennung || a.punktkennung === 'AP'
            ? { bauart: 'formstueck', predefinedType: 'JUNCTION', grund: 'Anschlusspunkt AP: Leitungen kommen zusammen (AH15, Tab. A-1-2)' }
            : null),
    },
    {
        id: 'ga-hoehen-vertauscht', fuer: 'anschlusspunkt', titel: 'Gelände unter der Sohle → Höhen vertauscht',
        beispiel: { ...GA_BEISPIEL, sohle: 102.5, gelaende: 101.2 },
        versuche: (a) => {
            if (!_fin(a.gelaende) || a.gelaende >= a.sohle) return null;
            const d = a.sohle - a.gelaende;
            if (d < V('gaTiefeMin') || d > V('gaTiefeMax')) return null;
            return { korrektur: { ...a, sohle: a.gelaende, gelaende: a.sohle },
                     befund: befund('hoehen_vertauscht', `„${a.name}": Gelände ${a.gelaende.toFixed(2)} unter der Sohle ${a.sohle.toFixed(2)} — als vertauscht gelesen.`, 'warnung') };
        },
    },
    {
        id: 'ga-gelaende-unplausibel', fuer: 'anschlusspunkt', titel: 'Gelände unbrauchbar (unter der Sohle oder zu hoch) → verworfen',
        beispiel: { ...GA_BEISPIEL, gelaende: 120 },
        versuche: (a) => {
            if (!_fin(a.gelaende)) return null;
            const t = a.gelaende - a.sohle;
            if (t > 0 && t <= V('gaTiefeMax')) return null;
            return { korrektur: { ...a, gelaende: null },
                     befund: befund('gelaende_unplausibel', `„${a.name}": Gelände ${a.gelaende.toFixed(2)} passt nicht zur Sohle ${a.sohle.toFixed(2)} — verworfen.`, 'warnung') };
        },
    },
    {
        id: 'ga-ohne-gelaende', fuer: 'anschlusspunkt', titel: 'Kein Geländepunkt → Tiefe aus der Vorgabe',
        beispiel: { ...GA_BEISPIEL, gelaende: null },
        versuche: (a) => {
            if (_fin(a.gelaende) || !V('kunststoffschachtFuer').includes(a.punktkennung)) return null;
            return { korrektur: { ...a, gelaende: _r3(a.sohle + V('gaTiefeOhneGelaende')), gelaendeAngenommen: true },
                     befund: befund('ohne_gelaende', `„${a.name}": ${KNOTEN_VORGABEN.gaTiefeOhneGelaende.text}.`) };
        },
    },
    {
        id: 'ga-zu-flach', fuer: 'anschlusspunkt', titel: 'Zu flach für einen Schacht → Formstück ENTRY',
        beispiel: { ...GA_BEISPIEL, gelaende: 101.35 },
        versuche: (a) => (V('kunststoffschachtFuer').includes(a.punktkennung) && a.gelaende - a.sohle < V('gaTiefeMin')
            ? { bauart: 'formstueck', predefinedType: 'ENTRY', grund: KNOTEN_VORGABEN.gaTiefeMin.text,
                befunde: [befund('zu_flach', `„${a.name}": ${Math.round((a.gelaende - a.sohle) * 1000)} mm — ${KNOTEN_VORGABEN.gaTiefeMin.text}.`)] }
            : null),
    },
    {
        id: 'ga-tiefer-als-3m', fuer: 'anschlusspunkt', titel: 'DI 0,8 m tiefer als 3 m → DI 1,0 m (DIN 1986-100, Tab. 3)',
        beispiel: { ...GA_BEISPIEL, gelaende: 104.6 },
        versuche: (a) => {
            const di = a.di ?? V('gaDurchmesser');
            if (!V('kunststoffschachtFuer').includes(a.punktkennung) || di >= GRUNDSTUECK_SCHACHT.besteigbarDi) return null;
            if (!(a.gelaende - a.sohle > GRUNDSTUECK_SCHACHT.ausnahmeBisTiefe)) return null;
            return { korrektur: { ...a, di: GRUNDSTUECK_SCHACHT.besteigbarDi,
                                  diHerleitung: H('norm', `DN/ID 800 nur bis 3,0 m Tiefe — tiefer DN/ID 1000`, B.grundstueckSchacht) },
                     befund: befund('ga_tiefer_als_3m', `„${a.name}": ${(a.gelaende - a.sohle).toFixed(2)} m tief — DI 0,8 m ist nur bis 3,0 m zulässig, DI 1,0 m gebaut.`) };
        },
    },
    {
        id: 'ga-inspektionsoeffnung', fuer: 'anschlusspunkt', titel: 'Flacher als 1,0 m → Inspektionsöffnung DI 0,4 m (DIN 1986-100, Tab. 3)',
        beispiel: { ...GA_BEISPIEL, gelaende: 102.0 },
        versuche: (a) => {
            if (!V('kunststoffschachtFuer').includes(a.punktkennung) || _fin(a.di)) return null;
            const t = a.gelaende - a.sohle;
            if (!(t < KONUS_AB_TIEFE.wert - 1e-9)) return null;
            return { korrektur: { ...a, di: V('gaInspektionDi'),
                                  diHerleitung: H('norm', 'nicht besteigbare Inspektionsöffnung DN/ID 400 — flacher als die Konustiefe 1,0 m', B.grundstueckSchacht) },
                     befund: befund('ga_inspektionsoeffnung', `„${a.name}": ${t.toFixed(2)} m tief — ${KNOTEN_VORGABEN.gaInspektionDi.text}.`) };
        },
    },
    {
        id: 'ga-kunststoffschacht', fuer: 'anschlusspunkt', titel: 'Gebäudeanschluss → Kunststoffschacht DI 0,8 m',
        beispiel: GA_BEISPIEL,
        versuche: (a) => {
            if (!V('kunststoffschachtFuer').includes(a.punktkennung)) return null;
            const m = kunststoffschacht({
                name: a.name, ort: a.ort, sohle: a.sohle, deckel: a.gelaende, di: a.di ?? V('gaDurchmesser'),
                herkunft: { di: a.diHerleitung ?? H('vorgabe', KNOTEN_VORGABEN.gaDurchmesser.text),
                            deckel: a.gelaendeAngenommen ? H('annahme', KNOTEN_VORGABEN.gaTiefeOhneGelaende.text) : H('isybau', 'Geländeoberkante (GOK)') },
            });
            if (!m.kopf) return { befunde: m.befunde };
            return { bauart: 'kunststoffschacht', muster: m, grund: `${a.punktkennung}: ${KNOTEN_VORGABEN.gaDurchmesser.text}` };
        },
    },
    {
        id: 'se-ohne-gelaende', fuer: 'anschlusspunkt', titel: 'Straßenablauf ohne Oberkante → Tiefe aus der Vorgabe',
        beispiel: { ...GA_BEISPIEL, punktkennung: 'SE', gelaende: null },
        versuche: (a) => {
            if (_fin(a.gelaende) || !V('strassenablaufFuer').includes(a.punktkennung)) return null;
            return { korrektur: { ...a, gelaende: _r3(a.sohle + V('seTiefeOhneGelaende')), gelaendeAngenommen: true },
                     befund: befund('ohne_gelaende', `„${a.name}": ${KNOTEN_VORGABEN.seTiefeOhneGelaende.text}.`) };
        },
    },
    {
        id: 'se-strassenablauf', fuer: 'anschlusspunkt', titel: 'Straßenablauf (SE) → Gully nach REwS 5.6.3',
        beispiel: { ...GA_BEISPIEL, punktkennung: 'SE', gelaende: 102.45 },
        versuche: (a) => {
            if (!V('strassenablaufFuer').includes(a.punktkennung) || !_fin(a.gelaende)) return null;
            const m = strassenablauf({ name: a.name, ort: a.ort, sohle: a.sohle, deckel: a.gelaende,
                                       herkunft: { deckel: a.gelaendeAngenommen ? H('annahme', KNOTEN_VORGABEN.seTiefeOhneGelaende.text) : H('isybau', 'Oberkante (GOK)') } });
            if (!m.kopf) return { befunde: m.befunde };
            return { bauart: 'strassenablauf', muster: m, grund: 'Straßenablauf: Aufsatz, Auflagering, Schaft, Boden (REwS 2021, 5.6.3)' };
        },
    },
    {
        id: 'ap-formstueck', fuer: 'anschlusspunkt', titel: 'Alle anderen (RR, ER …) → Formstück ENTRY',
        beispiel: { ...GA_BEISPIEL, punktkennung: 'RR' },
        versuche: (a) => ({ bauart: 'formstueck', predefinedType: 'ENTRY', grund: `Anschlusspunkt ${a.punktkennung ?? ''}: Wasser tritt ins Netz (AH15, Tab. A-1-2)`.trim() }),
    },

    // ── Bauwerk ──
    {
        id: 'bauwerk-huelle', fuer: 'bauwerk', titel: 'Bauwerk mit Umriss und Höhen → Hülle',
        beispiel: { art: 'bauwerk', name: 'RÜ1', ort: { ost: 0, nord: 0 }, sohle: 99, deckel: 103,
                    umriss: [{ ost: -2, nord: -1 }, { ost: 2, nord: -1 }, { ost: 2, nord: 1 }, { ost: -2, nord: 1 }] },
        versuche: (b) => (b.umriss?.length >= 3 && _fin(b.sohle) && _fin(b.deckel) && b.deckel - b.sohle > 0.05
            ? { bauart: 'huelle', grund: 'ISYBAU-Bauwerk, Hülle aus dem vermessenen Umriss' } : null),
    },
    {
        id: 'bauwerk-ohne-umriss', fuer: 'bauwerk', titel: 'Bauwerk ohne Umriss → Sonderform',
        beispiel: { art: 'bauwerk', name: 'B2', ort: { ost: 0, nord: 0 }, sohle: 99, deckel: 103, umriss: null },
        versuche: (b) => (b.ort && _fin(b.sohle) && _fin(b.deckel) && b.deckel - b.sohle > 0.05
            ? { bauart: 'sonderform', grund: 'Bauwerk ohne Umriss — als Zylinder gebaut',
                befunde: [befund('ohne_umriss', `Bauwerk „${b.name}" ohne Umriss.`)] } : null),
    },
    {
        id: 'bauwerk-auslassen', fuer: 'bauwerk', titel: 'Ohne Umriss und Höhen → nicht baubar',
        beispiel: { art: 'bauwerk', name: 'B3', ort: null, sohle: null, deckel: null },
        versuche: (b) => ({ bauart: 'auslassen', grund: 'ohne Umriss und Höhen',
                            befunde: [befund('ohne_hoehen', `Bauwerk „${b.name}" ohne Umriss und Höhen.`, 'warnung')] }),
    },
]);

/**
 * Einen Knoten durch das Regelwerk schicken.
 *
 * @param {object} knoten  aus `isybau/Isybauleser` (art: schacht | anschlusspunkt | bauwerk)
 * @param {object} [kontext]  `anschluesse` (beim Schacht)
 * @returns {{bauart, regel, grund, knoten, muster: object|null, befunde: object[], berichtigt: string[], predefinedType?}}
 *          `knoten` ist der BERICHTIGTE Knoten; `berichtigt` nennt die Regeln, die ihn änderten.
 */
export function ordneKnoten(knoten, kontext = {}, regeln = KNOTENREGELN) {
    let k = knoten;
    const befunde = [];
    const berichtigt = [];
    for (const r of regeln) {
        if (r.fuer !== k?.art) continue;
        const e = r.versuche(k, kontext);
        if (!e) continue;
        if (e.korrektur) {
            k = e.korrektur;
            berichtigt.push(r.id);
            if (e.befund) befunde.push(e.befund);
            continue;
        }
        if (e.bauart) {
            // Was die Entscheidung erledigt (der Normschacht sagte „eckig — Kastenvorlage"), fällt weg.
            if (e.ersetzt) for (let i = befunde.length - 1; i >= 0; i--) if (e.ersetzt.includes(befunde[i].regel)) befunde.splice(i, 1);
            const muster = e.muster ? { ...e.muster, befunde: [...befunde, ...(e.muster.befunde ?? [])] } : null;
            return { bauart: e.bauart, regel: r.id, grund: e.grund ?? r.titel, knoten: k, muster,
                     befunde: muster ? muster.befunde : [...befunde, ...(e.befunde ?? [])], berichtigt,
                     ...(e.predefinedType ? { predefinedType: e.predefinedType } : {}) };
        }
        if (e.befunde) befunde.push(...e.befunde);
    }
    return { bauart: 'auslassen', regel: null, grund: 'keine Regel greift', knoten: k, muster: null, befunde, berichtigt };
}
