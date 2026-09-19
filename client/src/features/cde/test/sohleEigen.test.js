// @vitest-environment jsdom
/**
 * Die Sohlhöhe einer eigenen Haltung ist echt (Teil XXIV, K4 — Fabios E7).
 *
 * Gemessen am 2026-09-18: die Punkthöhe einer eigenen Haltung war die
 * ROHRMITTE, Längsschnitt, „Sohlhöhen festlegen" und Sohlzug nannten sie
 * „Sohle" — die Sohle im Raum lag genau DN/2 darunter. Das Gefälle stimmte
 * trotzdem, deshalb fiel es nie auf. Gemessen wird hier deshalb am GEBAUTEN
 * KÖRPER (tiefster Punkt an jedem Ende = kommandierte Sohle ± 1 mm), nicht am
 * Bauplan.
 *
 *   1. Zeichnen: die gezeichneten Höhen sind Sohlen.
 *   2. „Sohlhöhen festlegen" an einer eigenen Haltung schreibt den Bauplan —
 *      Körper, Netzkante und Befund folgen (Abnahmefall C2, Schritte 4 und 5).
 *   3. Der Sohlzug im Längsschnitt: dieselbe Fähigkeit.
 *   4. DN ändern: die Sohle bleibt.
 *   5. Teile gelieferter Achsen (Haltung teilen) bekommen die Sohle der Quelle.
 *   6. Leser: Netzbefund am Knoten und Überdeckung vergleichen Sohlen bzw. Scheitel.
 *   7. Alte Baupläne bleiben bitgleich.
 *   8. Stufe 4 (K4b, noch nicht ausgeliefert): die gespeicherte Zahl IST die Sohle.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { nachId, schreibtAmBauplan } from '../services/Bearbeitungen.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { befundeFuer, befundeFuerNetz } from '../services/Befunde.js';
import { baueNetz } from '../services/Netztopologie.js';
import { baueBeziehungen } from '../services/Beziehungen.js';
import { sohleAnAchse } from '../services/Achsbezug.js';
import { baueSicht } from '../services/LaengsschnittSicht.js';
import { setzeSchreibStufeFuerTests } from '../services/JournalFormat.js';
import { KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';
import { subjektAusStand } from '../services/kommando/Subjekt.js';
import { registriereRezepte } from '../services/katalog/Katalog.js';

const SCHLUESSEL = 'ifc-repo:global:aenderungen';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});
afterEach(() => setzeSchreibStufeFuerTests());

const kommando = (id, werkzeug, rest) => ({ schema: KOMMANDO_SCHEMA, id, werkzeug, ziel: [], wer: 'fabio', wann: '2026-09-19T08:00:00Z', ...rest });
const MM = 0.001;

/** Der tiefste Punkt des GEBAUTEN Körpers am Ort x — die Sohle im Raum. */
function sohleImRaum(plan, x) {
    const g = rezeptNach(plan.rezept).baue(plan.parameter);
    const p = g.getAttribute('position').array;
    let tief = Infinity;
    for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i] - x) < 0.01) tief = Math.min(tief, p[i + 1]);
    return tief;
}

/** C2, Schritte 1–3: Schacht A, Schacht B, Haltung A → B, Sohle 100,00 → 99,85, DN 300. */
async function achseGezogen() {
    const b = useBearbeitung();
    for (const k of [
        kommando('ko-a', 'schacht-zeichnen', { neu: ['cde-A'], werte: { name: 'A', kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', hoehe: '', dn: 1000 },
            eingaben: { zug: [{ ost: 0, nord: 0, hoehe: 100 }, { ost: 0, nord: -0.001, hoehe: 102.5 }] } }),
        kommando('ko-b', 'schacht-zeichnen', { neu: ['cde-B'], werte: { name: 'B', kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', hoehe: '', dn: 1000 },
            eingaben: { zug: [{ ost: 30, nord: 0, hoehe: 99.85 }, { ost: 30, nord: -0.001, hoehe: 102.4 }] } }),
        kommando('ko-h', 'rohr-zeichnen', { neu: ['cde-H'], werte: { name: 'H', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 },
            eingaben: { zug: [{ ost: 0, nord: 0, hoehe: 100 }, { ost: 30, nord: 0, hoehe: 99.85 }] } }),
    ]) {
        expect((await b.fuehreAus(k)).grund).toBe(null);
    }
    const ae = useAenderungen();
    const plan = () => ae.wirksamerStand('erzeugt').get('cde-H');
    const subjekt = () => subjektAusStand('cde-H', { wirksamerStand: ae.wirksamerStand });
    return { b, ae, plan, subjekt };
}
const flach = (befunde) => befunde.filter(x => x.regel === 'gefaelle_zu_flach');

describe('1 — gezeichnet wird auf der Sohle', () => {
    it('die gezeichneten Höhen sind die Sohle des gebauten Rohrs — und alle Leser sagen dasselbe', async () => {
        const { plan, subjekt } = await achseGezogen();
        expect(Math.abs(sohleImRaum(plan(), 0) - 100)).toBeLessThan(MM);
        expect(Math.abs(sohleImRaum(plan(), 30) - 99.85)).toBeLessThan(MM);
        expect(plan().parameter.achsbezug).toBe('sohle');                 // Stufe 4 (K4b, seit 2026-09-19): die Zahl IST die Sohle
        const s = subjekt();
        expect(sohleAnAchse(s.achse.anfang.y, s.achse)).toBeCloseTo(100, 9);
        expect(sohleAnAchse(s.achse.ende.y, s.achse)).toBeCloseTo(99.85, 9);
        const seg = baueSicht({ strang: s.strang, hoehenversatz: 0 }).segmente[0];
        expect(seg.geliefert.hA).toBeCloseTo(100, 9);
        expect(seg.geliefert.hE).toBeCloseTo(99.85, 9);
        expect(nachId('sohlhoehen-setzen').vorbelegung(s)).toEqual({ anfang: 100, ende: 99.85 });
    });
});

describe('2 — „Sohlhöhen festlegen" an der eigenen Haltung ist echt (C2, Schritte 4 und 5)', () => {
    it('der Bauplan wird fortgeschrieben; Körper, Netzkante und Befund folgen', async () => {
        const { b, plan, subjekt } = await achseGezogen();
        expect(flach(befundeFuer({ globalId: 'cde-H', kategorie: 'IFCPIPESEGMENT', achse: subjekt().achse }))).toEqual([]);   // 5,0 ‰

        const erg = await b.fuehreAus(kommando('ko-4', 'sohlhoehen-setzen', { ziel: ['cde-H'], werte: { anfang: 100, ende: 99.91 } }));
        expect(erg.grund).toBe(null);
        expect(erg.eintraege.map(e => e.art)).toEqual(['erzeugt']);        // vorher: parametrik — eine Forderung, die niemand las
        expect(Math.abs(sohleImRaum(plan(), 0) - 100)).toBeLessThan(MM);
        expect(Math.abs(sohleImRaum(plan(), 30) - 99.91)).toBeLessThan(MM);
        expect(sohleAnAchse(subjekt().achse.ende.y, subjekt().achse)).toBeCloseTo(99.91, 9);
        const befund = flach(befundeFuer({ globalId: 'cde-H', kategorie: 'IFCPIPESEGMENT', achse: subjekt().achse }));
        expect(befund).toHaveLength(1);                                    // 3,0 ‰ < 1000/300 = 3,33 ‰
        expect(befund[0].wert).toMatch(/^3[.,]0/);

        await b.fuehreAus(kommando('ko-5', 'sohlhoehen-setzen', { ziel: ['cde-H'], werte: { anfang: 100, ende: 99.88 } }));
        expect(flach(befundeFuer({ globalId: 'cde-H', kategorie: 'IFCPIPESEGMENT', achse: subjekt().achse }))).toEqual([]);   // 4,0 ‰
        expect(nachId('sohlhoehen-setzen').vorbelegung(subjekt())).toEqual({ anfang: 100, ende: 99.88 });
    });

    it('die Kontextleiste sagt am eigenen Bauteil nicht mehr „Forderung an den Planer"', async () => {
        const { subjekt } = await achseGezogen();
        const w = nachId('sohlhoehen-setzen');
        expect(w.nurFestlegung).toBe(true);                                  // geliefert bleibt es eine Forderung
        expect(schreibtAmBauplan(w, subjekt())).toBe(true);
        expect(schreibtAmBauplan(w, { globalId: 'G1', stand: { bauplan: null } })).toBe(false);
    });

    it('eine alte Forderung an einer eigenen Haltung wird nicht mehr als Wert gezeigt — sie wirkte nie', async () => {
        const { ae, subjekt } = await achseGezogen();
        await ae.eintragen({ art: 'parametrik', globalId: 'cde-H', nachher: { sohlhoeheAnfang: 1, sohlhoeheEnde: 2 } });
        expect(nachId('sohlhoehen-setzen').vorbelegung(subjekt())).toEqual({ anfang: 100, ende: 99.85 });
    });
});

describe('3 — der Sohlzug im Längsschnitt: dieselbe Fähigkeit', () => {
    it('gezogen wird die Sohle, gebaut liegt sie dort', async () => {
        const { subjekt, plan } = await achseGezogen();
        // Seit O6 über „Sohle am Punkt setzen" — am Ende der Haltung (30 | 0).
        const e = nachId('sohle-ziehen').anwenden(subjekt(), { hoehe: 99.8 }, { zug: [{ x: 30, z: 0 }] });
        expect(Math.abs(sohleImRaum(e.nachher, 30) - 99.8)).toBeLessThan(MM);
        expect(Math.abs(sohleImRaum(e.nachher, 0) - sohleImRaum(plan(), 0))).toBeLessThan(1e-9);   // das andere Ende bleibt
    });
});

describe('4 — DN ändern: die Sohle bleibt', () => {
    it('von DN 300 auf DN 500 — der Scheitel steigt, die Sohle nicht', async () => {
        const { b, plan } = await achseGezogen();
        expect((await b.fuehreAus(kommando('ko-dn', 'rohr-dn-setzen', { ziel: ['cde-H'], werte: { dn: 500 } }))).grund).toBe(null);
        expect(plan().parameter.dn).toBe(500);
        expect(Math.abs(sohleImRaum(plan(), 0) - 100)).toBeLessThan(MM);
        expect(Math.abs(sohleImRaum(plan(), 30) - 99.85)).toBeLessThan(MM);
    });
});

describe('5 — Teile gelieferter Achsen bekommen die Sohle ihrer Quelle', () => {
    /** Eine gelieferte Haltung, wie die Engine ihre Achse liefert (DN 400). */
    const geliefert = (quelle) => ({
        globalId: 'G1', name: 'G1', category: 'IFCPIPESEGMENT', stand: { bauplan: null },
        achse: { globalId: 'G1', name: 'G1', kategorie: 'IFCPIPESEGMENT', quelle, dn: 400, laenge: 30,
                 anfang: { x: 0, y: 50, z: 0 }, ende: { x: 30, y: 49.7, z: 0 },
                 polyline: [{ x: 0, y: 50, z: 0 }, { x: 30, y: 49.7, z: 0 }] },
    });
    it('Achs-Repräsentation (isyifc, auf Sohlniveau): die Teile liegen mit ihrer Sohle auf der Achse', () => {
        const schritte = nachId('haltung-teilen').anwenden(geliefert('axisRep'), { station: 15 });
        const teile = schritte.filter(s => s.art === 'erzeugt').map(s => s.nachher);
        expect(teile).toHaveLength(2);
        expect(Math.abs(sohleImRaum(teile[0], 0) - 50)).toBeLessThan(MM);        // vorher: 49,80 — DN/2 zu tief
        expect(Math.abs(sohleImRaum(teile[1], 30) - 49.7)).toBeLessThan(MM);
    });
    it('Extrusion (Rohrmitte): die Sohle liegt DN/2 unter der Achse — wie beim gelieferten Rohr', () => {
        const schritte = nachId('haltung-teilen').anwenden(geliefert('extrusion'), { station: 15 });
        const teile = schritte.filter(s => s.art === 'erzeugt').map(s => s.nachher);
        expect(Math.abs(sohleImRaum(teile[0], 0) - 49.8)).toBeLessThan(MM);
    });
});

describe('6 — Leser: Netzbefund und Überdeckung', () => {
    it('Zulauf unter Ablauf: verglichen werden SOHLEN, auch zwischen Mitte und Sohle', () => {
        // Eigener Zulauf in Rohrmitte (DN 300): Mitte 99,95 = Sohle 99,80.
        // Gelieferter Ablauf auf Sohlniveau: 99,85. Die Zulaufsohle liegt 5 cm tiefer.
        const netz = baueNetz({
            kanten: [
                { id: 'zu', anfang: { x: -30, y: 100.2, z: 0 }, ende: { x: 0, y: 99.95, z: 0 }, dn: 300, achsbezug: 'mitte' },
                { id: 'ab', anfang: { x: 0, y: 99.85, z: 0 }, ende: { x: 30, y: 99.7, z: 0 }, dn: 300, achsbezug: 'sohle' },
            ],
            knoten: [{ id: 'S', punkt: { x: 0, y: 99.8, z: 0 } }],
        });
        const b = befundeFuerNetz(netz).get('zu') ?? [];
        expect(b.map(x => x.regel)).toContain('zulauf_unter_ablauf');     // vorher: 99,95 gegen 99,85 — nichts gemeldet
    });

    it('Überdeckung: eine Achse auf Sohlniveau hat ihren Scheitel 2r darüber', () => {
        const idx = baueBeziehungen({
            objekte: [
                { globalId: 'S', achse: { punkte: [{ x: 0, y: 100, z: 0 }, { x: 10, y: 100, z: 0 }], dn: 400, achsbezug: 'sohle' } },
                { globalId: 'M', achse: { punkte: [{ x: 0, y: 100, z: 5 }, { x: 10, y: 100, z: 5 }], dn: 400, achsbezug: 'mitte' } },
            ],
            gelaende: { globalId: 'DGM', name: 'DGM', hoeheAn: () => 102 },
        });
        const u = Object.fromEntries(idx.paare('auflage').map(r => [r.a, r.mass.ueberdeckung]));
        expect(u.S).toBeCloseTo(102 - 100.4, 9);                            // vorher 1,80 — um r zu gross
        expect(u.M).toBeCloseTo(102 - 100.2, 9);
    });
});

describe('7 — alte Baupläne bleiben bitgleich', () => {
    it('ohne `achsbezug` baut das Rohr genau wie mit „mitte"', () => {
        const p = { punkte: [[0, 10, 0], [20, 9.9, 3]], dn: 300 };
        const alt = rezeptNach('rohr').baue(p).getAttribute('position').array;
        const mitte = rezeptNach('rohr').baue({ ...p, achsbezug: 'mitte' }).getAttribute('position').array;
        expect(Array.from(mitte)).toEqual(Array.from(alt));
    });
});

describe('8 — Stufe 4 (K4b, erst eine Auslieferung nach K4a): gespeichert wird die Sohle', () => {
    it('neue Haltung: achsbezug „sohle", die Zahl ist die Sohle, der Körper derselbe; die Datei verlangt Stufe 4', async () => {
        const { plan: planMitte } = await achseGezogen();
        const koerperMitte = rezeptNach('rohr').baue(planMitte().parameter).getAttribute('position').array;

        localStorage.clear();
        setActivePinia(createPinia());
        setzeSchreibStufeFuerTests(4);
        const { plan, b, subjekt } = await achseGezogen();
        expect(plan().parameter.achsbezug).toBe('sohle');
        expect(plan().parameter.punkte.map(p => p[1])).toEqual([100, 99.85]);
        // Die Netzkante sagt es weiter — Längsschnitt und Vorbelegung lesen die Sohle.
        expect(baueSicht({ strang: subjekt().strang, hoehenversatz: 0 }).segmente[0].geliefert).toEqual({ hA: 100, hE: 99.85 });
        expect(nachId('sohlhoehen-setzen').vorbelegung(subjekt())).toEqual({ anfang: 100, ende: 99.85 });
        const koerper = rezeptNach('rohr').baue(plan().parameter).getAttribute('position').array;
        expect(Math.max(...Array.from(koerper).map((v, i) => Math.abs(v - koerperMitte[i])))).toBeLessThan(1e-4);
        expect(JSON.parse(localStorage.getItem(SCHLUESSEL)).mindestClient).toBe(4);

        // „Sohlhöhen festlegen" bleibt im Bezug des Bauplans.
        await b.fuehreAus(kommando('ko-4', 'sohlhoehen-setzen', { ziel: ['cde-H'], werte: { anfang: 100, ende: 99.91 } }));
        expect(plan().parameter.achsbezug).toBe('sohle');
        expect(plan().parameter.punkte.map(p => p[1])).toEqual([100, 99.91]);
        expect(Math.abs(sohleImRaum(plan(), 30) - 99.91)).toBeLessThan(MM);
    });
});

describe('Alte Forderungen an eigenen Haltungen (Fahrplan R3)', () => {
    // Vor K4 schrieb „Sohlhöhen festlegen" an einer eigenen Haltung eine
    // Forderung (`parametrik`). Kein Werkzeug löst sie mehr ein — der
    // Längsschnitt zeigte sie trotzdem als „gefordert", still.
    async function mitAlterForderung() {
        const b = useBearbeitung();
        const ae = useAenderungen();
        await ae.bereit;
        const erg = await b.fuehreAus(kommando('ko-r3', 'rohr-zeichnen', { neu: ['cde-R3'], werte: { name: 'R3', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 },
            eingaben: { zug: [{ ost: 0, nord: 0, hoehe: 100 }, { ost: 30, nord: 0, hoehe: 99.85 }] } }));
        expect(erg.grund).toBe(null);
        // Die alte Forderung, wie sie vor K4 im Journal landete.
        await ae.eintragen({ art: 'parametrik', globalId: 'cde-R3', nachher: { sohlhoeheAnfang: 99, sohlhoeheEnde: 98.9 }, modell: 'cde' });
        return { b, ae };
    }

    it('der Längsschnitt zeigt an der eigenen Haltung keine Forderung mehr — der Bauplan gilt (vorher: „gefordert 99,00")', async () => {
        const { ae } = await mitAlterForderung();
        const s = subjektAusStand('cde-R3', { wirksamerStand: ae.wirksamerStand });
        expect(s.strang[0].quelle).toBe('bauplan');
        const sicht = baueSicht({ strang: s.strang, parametrikStand: ae.wirksamerStand('parametrik') });
        expect(sicht.segmente[0].gefordert).toBe(null);
        expect(sicht.segmente[0].geliefert.hA).toBeCloseTo(100, 9);
        // Ein GELIEFERTES Glied mit derselben Festlegung behält seine Forderung.
        const geliefert = baueSicht({ strang: [{ ...s.strang[0], globalId: 'G1', quelle: 'axisRep' }],
                                      parametrikStand: new Map([['G1', { sohlhoeheAnfang: 99 }]]) });
        expect(geliefert.segmente[0].gefordert).toMatchObject({ hA: 99 });
    });

    it('der Prüflauf meldet sie — mit der Kur, sie in den Bauplan zu übernehmen; danach ist der Befund weg', async () => {
        const { b } = await mitAlterForderung();
        const befunde = () => b.befundeVon('cde-R3').filter(x => x.regel === 'forderung_ohne_wirkung');
        const [f] = befunde();
        expect(f).toMatchObject({ schwere: 'warnung', kur: { bearbeitung: 'sohlhoehen-setzen', werte: { anfang: 99, ende: 98.9 } } });
        expect(f.text).toMatch(/gefordert 99\.00 m NN → 98\.90 m NN, gebaut 100\.00 m NN → 99\.85 m NN/);
        // Die Kur: dasselbe Werkzeug mit den Werten des Befunds — an einer eigenen Haltung der Bauplan.
        const erg = await b.fuehreAus(kommando('ko-kur', 'sohlhoehen-setzen', { ziel: ['cde-R3'], werte: f.kur.werte }));
        expect(erg.grund).toBe(null);
        expect(rezeptNach('rohr').sohlen.lies(useAenderungen().wirksamerStand('erzeugt').get('cde-R3').parameter)
            .map(v => Math.round(v * 1000) / 1000)).toEqual([99, 98.9]);
        expect(befunde()).toEqual([]);
    });
});

describe('Rechteckprofil: Abstand Mitte → Sohle ist die halbe Tiefe (Fahrplan R6)', () => {
    // 7a: „Ein Rechteckprofil nimmt den Abstand Mitte → Sohle über dieselbe
    // Formel (halbe Tiefe), ist aber nicht eigens getestet." Ein Rechteckkanal
    // aus der Bibliothek, 800 mm hoch — der tiefste Punkt des gebauten
    // Körpers muss auf der gesetzten Sohle liegen, in beiden Speicherformen.
    const RECHTECKKANAL = {
        id: 'rechteckkanal', titel: 'Rechteckkanal', icon: 'laengsschnitt', bauform: 'achse+profil',
        kategorieVorgabe: 'IFCPIPESEGMENT', mindestPunkte: 2, geschlossen: false, netzrolle: 'kante',
        felder: [
            { name: 'name', titel: 'Bezeichnung', typ: 'text', leerErlaubt: true },
            { name: 'kategorie', titel: 'IFC-Typ', typ: 'text' },
            { name: 'hoehe', titel: 'Höhe', einheit: 'm', typ: 'zahl', leerErlaubt: true },
            { name: 'b', titel: 'Breite', einheit: 'mm', typ: 'zahl', vorgabe: 1200 },
            { name: 'h', titel: 'Höhe', einheit: 'mm', typ: 'zahl', vorgabe: 800 },
        ],
        geometrie: { art: 'sweep', profil: { art: 'rechteck', breite: 'b', tiefe: 'h', einheit: 'mm' } },
    };
    afterEach(() => registriereRezepte([]));

    for (const stufe of [4, 2]) {
        it(`Schreibstufe ${stufe} (${stufe >= 4 ? 'Sohle gespeichert' : 'Mitte gespeichert'}): Sohle 99,50 → 99,40 gesetzt, der Körper liegt mit seiner Unterkante darauf`, async () => {
            setzeSchreibStufeFuerTests(stufe);
            registriereRezepte([RECHTECKKANAL]);
            const b = useBearbeitung();
            const ae = useAenderungen();
            await ae.bereit;
            expect((await b.fuehreAus(kommando('ko-rk', 'rechteckkanal-zeichnen', { neu: ['cde-RK'], werte: { name: 'RK', kategorie: 'IFCPIPESEGMENT', hoehe: '', b: 1200, h: 800 },
                eingaben: { zug: [{ ost: 0, nord: 0, hoehe: 100 }, { ost: 30, nord: 0, hoehe: 99.9 }] } }))).grund).toBe(null);
            expect((await b.fuehreAus(kommando('ko-sh', 'sohlhoehen-setzen', { ziel: ['cde-RK'], werte: { anfang: 99.5, ende: 99.4 } }))).grund).toBe(null);
            const plan = ae.wirksamerStand('erzeugt').get('cde-RK');
            expect(plan.parameter.achsbezug).toBe(stufe >= 4 ? 'sohle' : 'mitte');
            expect(rezeptNach('rechteckkanal').sohlen.abstand(plan.parameter)).toBeCloseTo(0.4, 12);
            expect(Math.abs(sohleImRaum(plan, 0) - 99.5)).toBeLessThan(MM);
            expect(Math.abs(sohleImRaum(plan, 30) - 99.4)).toBeLessThan(MM);
        });
    }
});
