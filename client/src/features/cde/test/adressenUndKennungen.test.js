// @vitest-environment jsdom
/**
 * Operationen tragen Kennungen, und Kommandos sprechen nie über Nummern
 * (Teil XXIV, K2b + E3).
 *
 *   1. Jede Operation bekommt beim Schreiben eine Kennung `op-…` — eine neue
 *      vom Aufrufer (`neu`), eine aus der Zeit vor K2b die aus ihrem Inhalt
 *      abgeleitete, die ein Kommando eben benutzt hat.
 *   2. Die vier Werkzeuge mit Nummernfeldern (Knickpunkt, Stützpunkt, Kante)
 *      stehen im Kommando mit dem alten Punkt bzw. der Operationskennung —
 *      und liefern dieselben Schritte wie der direkte Aufruf mit der Nummer.
 *   3. Eine Nummer ist im Kommando ein Schemafehler; ein Punkt, den es nicht
 *      mehr gibt, ein fehlendes Ziel (E8).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { adressenAlsNummern, kommandoAusZustand, nummernAlsAdressen, pruefeKommando, rahmenOhneBezug, KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';
import { werteAus } from '../services/kommando/Auswertung.js';
import { nachId, werkzeugKatalog } from '../services/Bearbeitungen.js';
import { ableitungsSchritte, erdbauStandVon, operationenMitKennung, zufallsKennung, mitKennungen } from '../services/Bauteilrezepte.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

const ring = (dx, y = 600) => Array.from({ length: 6 }, (_, i) => {
    const w = (i / 6) * Math.PI * 2;
    return { x: 20 + dx + Math.cos(w) * 8, y: y + i * 0.01, z: 20 + Math.sin(w) * 8 };
});
const grube = (dx) => ({ art: 'grube', parameter: { umriss: ring(dx), sohle: 597.5, neigung: 1.5 } });

describe('1 — Operationen tragen eine Kennung (K2b)', () => {
    it('eine neue Operation bekommt ihre Kennung vom Aufrufer (neu), in ihrer Art', () => {
        const schritte = mitKennungen((art) => (art === 'operation' ? 'op-vom-aufrufer' : 'cde-vom-aufrufer-' + Math.random()), () =>
            ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, operationen: [grube(0)], name: 'Ur' }));
        expect(schritte[0].nachher.parameter.operationen[0].id).toBe('op-vom-aufrufer');
    });

    it('eine Altoperation (vor K2b, ohne Kennung) bekommt die aus ihrem Inhalt — stabil, und durchgezählt bei Gleichen', () => {
        const alt = [grube(0), grube(30), grube(0)];
        const a = operationenMitKennung(alt), b = operationenMitKennung(JSON.parse(JSON.stringify(alt)));
        expect(a.map(o => o.id)).toEqual(b.map(o => o.id));
        expect(a[0].id).toMatch(/^op-alt-/);
        expect(new Set(a.map(o => o.id)).size).toBe(3);
        expect(a[2].id).toBe(`${a[0].id}-2`);
        expect(alt[0].id).toBeUndefined();                     // nichts wird verändert
    });

    it('beim Schreiben behält eine Altoperation an ihrer Stelle genau diese abgeleitete Kennung', () => {
        const altOps = [grube(0), grube(30)];
        const plan = { rezept: 'erdbau', rolle: 'aushub', ableitung: 'ab-1', parameter: { quellen: { gelaende: 'DGM1' }, operationen: altOps } };
        const abgeleitet = operationenMitKennung(altOps).map(o => o.id);
        // Eine Ecke der ZWEITEN Operation wandert — die Liste wird neu geschrieben.
        const geaendert = altOps.map((op, j) => (j === 1 ? { ...op, parameter: { ...op.parameter, sohle: 597 } } : op));
        const schritte = ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, operationen: geaendert,
            bestehend: { ableitung: 'ab-1', teile: { aushub: { globalId: 'cde-a', bauplan: plan } } } });
        expect(schritte[0].nachher.parameter.operationen.map(o => o.id)).toEqual(abgeleitet);
    });
});

/** Ein eigener Erdbau-Vorgang im Stand — als Subjekt, wie der Store es einordnet. */
function erdbauSubjekt({ mitKennung = false } = {}) {
    const ops = [grube(0), grube(30)].map((op, j) => (mitKennung ? { ...op, id: `op-g${j}` } : op));
    const plan = { rezept: 'erdbau', rolle: 'aushub', ableitung: 'ab-1', name: 'Ur · Ausheben · aushub', kategorie: 'IFCEARTHWORKSCUT',
                   parameter: { quellen: { gelaende: 'DGM1' }, quellBasis: {}, raster: { cell: 1 }, operationen: ops } };
    return { globalId: 'cde-a', category: 'IFCEARTHWORKSCUT', versatz: { x: 0, y: 0, z: 0 }, hoehenversatz: 0,
             stand: { bauplan: plan, teile: new Map([['aushub', { globalId: 'cde-a', bauplan: plan }]]) } };
}
const linie = () => ({ globalId: 'cde-l', category: 'IFCANNOTATION', versatz: { x: 0, y: 0, z: 0 }, hoehenversatz: 0,
    stand: { bauplan: { rezept: 'linie', kategorie: 'IFCANNOTATION', name: 'L', parameter: { punkte: [[0, 5, 0], [10, 5, 0], [10, 6, 10], [0, 7, 10]] } } } });

/** Dasselbe Werkzeug zweimal: direkt mit der Nummer und als Kommando mit Adresse. */
function beideWege(id, el, werte) {
    const b = nachId(id);
    const r = rahmenOhneBezug();
    const roh = mitKennungen((art) => zufallsKennung(art), () => b.anwenden(el, werte, { nummer: 0, zug: [] }));
    const direkt = (Array.isArray(roh) ? roh : [roh]).filter(x => x?.art);
    const { kommando } = kommandoAusZustand({ werkzeug: b, werte, subjekte: [el], rahmen: r });
    const aus = werteAus(kommando, { subjektVon: () => el, rahmen: r, kennungsgeber: zufallsKennung, pruefeWerte: () => [] });
    return { direkt, kommando, aus };
}
const normiere = (w) => JSON.parse(JSON.stringify(w, (k, v) => (typeof v === 'string' && /^(cde|ab|op)-[a-z0-9]+-[a-z0-9]+$/.test(v) ? 'ID' : v)));

describe('2 — Adressen statt Nummern: dieselben Schritte wie mit der Nummer', () => {
    it('Knickpunkt verschieben: die Operation per Kennung, die Ecke per Lage', () => {
        for (const mitKennung of [false, true]) {
            const el = erdbauSubjekt({ mitKennung });
            const werte = { op: 1, feld: 'umriss', index: 2, ost: 40, nord: -30, hoehe: 601 };
            const { direkt, kommando, aus } = beideWege('erdbau-stuetzpunkt-verschieben', el, werte);
            const e = el.stand.bauplan.parameter.operationen[1].parameter.umriss[2];
            expect(kommando.werte.op).toEqual({ operation: operationenMitKennung(el.stand.bauplan.parameter.operationen)[1].id });
            expect(kommando.werte.index).toEqual({ ost: e.x, nord: -e.z, hoehe: e.y });
            expect(JSON.stringify(kommando.werte)).not.toMatch(/"(op|index)":\d/);
            expect(pruefeKommando(kommando)).toEqual([]);
            expect(aus.grund).toBeNull();
            expect(normiere(aus.schritte)).toEqual(normiere(direkt));
        }
    });

    for (const [id, werte] of [
        ['stuetzpunkt-verschieben', { index: 2, ost: 11, nord: -12, hoehe: 6.5 }],
        ['stuetzpunkt-entfernen', { index: 1 }],
        ['kante-verschieben', { index: 1, ost: 12, nord: -5, hoehe: 5.5 }],
    ]) {
        it(`${id}: der Stützpunkt per Lage`, () => {
            const el = linie();
            const { direkt, kommando, aus } = beideWege(id, el, werte);
            const p = el.stand.bauplan.parameter.punkte[werte.index];
            expect(kommando.werte.index).toEqual({ ost: p[0], nord: -p[2], hoehe: p[1] });
            expect(pruefeKommando(kommando)).toEqual([]);
            expect(aus.grund).toBeNull();
            expect(normiere(aus.schritte)).toEqual(normiere(direkt));
        });
    }
});

describe('3 — Nummern sind im Kommando ein Schemafehler; ein verschwundener Punkt ein fehlendes Ziel', () => {
    const k = (werte, werkzeug = 'stuetzpunkt-entfernen') => ({ schema: KOMMANDO_SCHEMA, id: 'k', werkzeug, ziel: ['cde-l'], werte });

    // WÄCHTER: ein neues Werkzeug mit einem Nummernfeld ohne Adresse trüge die
    // Nummer wieder ins Kommando. Nummer = Name `index`/`op`, Titel „… Nr.",
    // oder ein Griff-Feld ohne Einheit (mit Einheit ist es ein Wert: Drehen, °).
    it('jedes Nummernfeld im Katalog ist als Adresse ausgezeichnet', () => {
        const nackt = [];
        for (const w of werkzeugKatalog()) {
            for (const f of Array.isArray(w.felder) ? w.felder : []) {
                const nummer = ['index', 'op'].includes(f.name) || /Nr\.?$/.test(f.titel ?? '')
                    || (f.aus?.geste === 'griff' && f.typ === 'zahl' && !f.einheit);
                if (nummer && !f.adresse) nackt.push(`${w.id}.${f.name}`);
            }
        }
        expect(nackt).toEqual([]);
    });

    it('eine Nummer statt einer Adresse: abgelehnt mit E3', () => {
        expect(pruefeKommando(k({ index: 1 })).join()).toMatch(/nie über seine Nummer \(E3\)/);
        expect(pruefeKommando(k({ op: 0, feld: 'umriss', index: { ost: 1, nord: 2 } }, 'erdbau-stuetzpunkt-verschieben')).join())
            .toMatch(/Operation wird über ihre Kennung angesprochen/);
    });

    it('ein Punkt, den es am Bauteil nicht (mehr) gibt: abgelehnt, keine geratene Nummer', () => {
        const aus = werteAus(k({ index: { ost: 99, nord: 99 } }), { subjektVon: () => linie() });
        expect(aus.grund).toMatch(/gibt es an diesem Bauteil nicht \(mehr\)/);
        expect(aus.schritte).toEqual([]);
    });

    // Der Zeichenweg versetzt den Deckel um 1 mm; ein Schacht aus Daten kann
    // Sohle und Deckel genau übereinander haben — dann trennt NUR die Höhe.
    it.each([[0.001, '1 mm auseinander'], [0, 'genau übereinander']])(
        'Sohl- und Deckelpunkt eines Schachts liegen im Grundriss %s (%s) — die Höhe entscheidet', (dz) => {
        const schacht = { globalId: 'cde-s', category: 'IFCDISTRIBUTIONCHAMBERELEMENT', versatz: { x: 0, y: 0, z: 0 }, hoehenversatz: 0,
            stand: { bauplan: { rezept: 'schacht', kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', parameter: { dn: 1000, punkte: [[5, 100, 5], [5, 102.5, 5 + dz]] } } } };
        const b = nachId('stuetzpunkt-verschieben');
        const { kommando } = kommandoAusZustand({ werkzeug: b, werte: { index: 1, ost: 5, nord: -(5 + dz), hoehe: 103 }, subjekte: [schacht], rahmen: rahmenOhneBezug() });
        expect(kommando.werte.index).toMatchObject({ hoehe: 102.5 });
        const aus = werteAus(kommando, { subjektVon: () => schacht, pruefeWerte: () => [] });
        expect(aus.schritte[0].nachher.parameter.punkte.map(p => p[1])).toEqual([100, 103]);
    });
});

describe('4 — am echten Weg: Knickpunkt über die Oberfläche, Beleg ohne Nummer', () => {
    it('20 Züge, und kein Beleg trägt eine Nummer in op oder index', async () => {
        const ae = useAenderungen();
        const el = erdbauSubjekt();
        await ae.eintragen({ art: 'erzeugt', globalId: 'cde-a', nachher: el.stand.bauplan, modell: 'cde' });
        const b = useBearbeitung();
        b.modusSetzen(true);
        for (let k = 0; k < 4; k++) {
            const plan = ae.wirksamerStand('erzeugt').get('cde-a');
            const subjekt = { ...el, stand: { bauplan: plan, teile: new Map([['aushub', { globalId: 'cde-a', bauplan: plan }]]) } };
            expect(b.starte('erdbau-stuetzpunkt-verschieben', { subjekt })).toBe(true);
            b.setzeWert('op', k % 2); b.setzeWert('feld', 'umriss'); b.setzeWert('index', k);
            b.setzeWert('ost', 20 + k); b.setzeWert('nord', -(21 + k)); b.setzeWert('hoehe', 600.5);
            const e = await b.ausfuehren({ wer: 'pruefer', subjekt, modell: 'cde' });
            expect(e, b.letzterGrund).toBeTruthy();
        }
        const belege = ae.eintraege.filter(e => e.kommando).map(e => e.kommando);
        expect(belege).toHaveLength(4);
        for (const k of belege) {
            expect(typeof k.werte.op).toBe('object');
            expect(typeof k.werte.index).toBe('object');
        }
        // Nach dem ersten Zug tragen alle Operationen ihre Kennung gespeichert.
        const ops = ae.wirksamerStand('erzeugt').get('cde-a').parameter.operationen;
        expect(ops.every(o => /^op-/.test(o.id))).toBe(true);
    });
});

describe('Eine Operation in einem ANDEREN Vorgang des Stapels (Durchstich 2)', () => {
    // K2b adressiert Operationen des eigenen Bauplans. „Fülle bis zum Planum P"
    // zeigt aus einem Vorgang in einen anderen: die Liste kommt vom Stapel des
    // Geländes (`erdbauStandVon`), weitergereicht wird die KENNUNG.
    const ring = [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 5 }];
    const vorgang = (ops) => mitKennungen((art) => zufallsKennung(art), () =>
        ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: 1 }, operationen: ops, name: 'Ur' }));
    const stand = (...listen) => new Map(listen.flat().map(s => [s.globalId, s.nachher]));
    const WERKZEUG = { felder: [{ name: 'bis', typ: 'text', adresse: 'stapeloperation' }] };
    const R = rahmenOhneBezug();

    it('der Stapel nennt seine Operationen mit gespeicherter Kennung und ihrem Vorgang — Altoperationen ohne Kennung nicht', () => {
        const A = vorgang([{ id: 'op-P', art: 'planum', parameter: { umriss: ring, hoehe: 101 } }]);
        const B = vorgang([{ id: 'op-G', art: 'grube', parameter: { umriss: ring, sohle: 99 } }]);
        // Eine Altoperation (vor K2b): im Bauplan OHNE Kennung.
        const alt = vorgang([{ art: 'planum', parameter: { umriss: ring, hoehe: 102 } }])
            .map(s => ({ ...s, nachher: { ...s.nachher, parameter: { ...s.nachher.parameter, operationen: [{ art: 'planum', parameter: { umriss: ring, hoehe: 102 } }] } } }));
        const eb = erdbauStandVon(stand(A, B, alt), 'DGM1');
        expect(eb.operationen.map(o => [o.id, o.vorgang])).toEqual([['op-P', A[0].nachher.ableitung], ['op-G', B[0].nachher.ableitung]]);
    });

    it('Adresse → Kennung (nicht Nummer); eine fehlende ist ein fehlendes Ziel (E8); die Oberfläche wickelt eine Kennung ein', () => {
        const el = { erdbau: erdbauStandVon(stand(vorgang([{ id: 'op-P', art: 'planum', parameter: { umriss: ring, hoehe: 101 } }])), 'DGM1') };
        expect(adressenAlsNummern(WERKZEUG, el, { bis: { operation: 'op-P' } }, R)).toEqual({ werte: { bis: 'op-P' }, grund: null });
        expect(adressenAlsNummern(WERKZEUG, el, { bis: { operation: 'op-X' } }, R).grund).toMatch(/op-X gibt es im Stapel dieses Geländes nicht/);
        expect(nummernAlsAdressen(WERKZEUG, el, { bis: 'op-P' }, R)).toEqual({ bis: { operation: 'op-P' } });
    });
});
