/**
 * Knickpunkte eines Erdbau-Vorgangs ziehen (Teil XX Stufe C / Teil XXI, P5).
 *
 * Fabio (2026-09-10): „Knickpunkte XYZ-ziehbar." Ein Erdbau-Vorgang hat keine
 * `punkte` im Bauplan — seine Ecken stecken in den OPERATIONEN (`umriss`,
 * `linie`, `stationen`), ihre Höhen in m NN. Deshalb eigene Griffe und ein
 * eigenes Werkzeug; der Weg ins Journal bleibt derselbe.
 *
 * Geprüft am echten Katalog und an `griffeFuer` — nicht an einer Attrappe.
 */
import { describe, expect, it } from 'vitest';
import { griffZuWerten, griffeFuer } from '../services/Griffe.js';
import { nachId, passende } from '../services/Bearbeitungen.js';
import { weltAusNn } from '../services/Hoehenbezug.js';

const VERSATZ = 300;
const RING = [
    { x: 10, y: 600, z: 10 }, { x: 30, y: 600.2, z: 10 },
    { x: 30, y: 600.4, z: 30 }, { x: 10, y: 600.1, z: 30 },
];
const BAUPLAN = {
    rezept: 'erdbau', rolle: 'aushub', ableitung: 'ab-1', name: 'Ur · Ausheben · Aushub',
    kategorie: 'IFCEARTHWORKSCUT',
    parameter: {
        quellen: { gelaende: 'DGM1' }, quellBasis: { gelaende: null }, raster: { cell: 1 },
        operationen: [{ art: 'grube', parameter: { umriss: RING, sohle: 597.5, neigung: 1.5 } }],
    },
};
const SUBJEKT = () => ({
    globalId: 'cde-aushub', modelId: 'cde-eigenbau', localId: 7, name: BAUPLAN.name,
    hoehenversatz: VERSATZ, versatz: { x: 0, y: 0, z: 0 },
    anker: { x: 20, y: 300, z: 20 }, lageUmkehrbar: false,
    // In der Form, die der Store beim Einordnen anlegt (`_standVon`: `teile`
    // als Map) — den echten Weg dorthin prüft `erdbauKennungen.test.js`.
    stand: {
        bauplan: BAUPLAN,
        teile: new Map([
            ['aushub',  { globalId: 'cde-aushub',  bauplan: BAUPLAN }],
            ['auftrag', { globalId: 'cde-auftrag', bauplan: { ...BAUPLAN, rolle: 'auftrag', name: 'Ur · Ausheben · Auftrag' } }],
        ]),
    },
});

// Nur die ÄUSSEREN Ecken (die gespeicherten) — die inneren (Sohle, Krone)
// kamen mit Teil XXII dazu und stehen in `eckenZiehen.test.js`.
const aussen = (x) => x.key.startsWith('erdbau-stuetz');
const griffe = () => griffeFuer({ subjekt: SUBJEKT(), subjektHerkunft: 'cde', bauform: 'koerper' }).filter(aussen);

describe('Die Griffe sitzen auf den Ecken der OPERATION', () => {
    it('je Ecke ein Zug- und ein Höhengriff — vier Ecken, acht Griffe', () => {
        const g = griffe().filter(x => x.werkzeug === 'erdbau-stuetzpunkt-verschieben');
        expect(g).toHaveLength(8);
        expect(g.filter(x => x.achsen === 'XZ')).toHaveLength(4);
        expect(g.filter(x => x.achsen === 'Y')).toHaveLength(4);
    });

    it('sie liegen in WELT — die Operation trägt m NN', () => {
        const g = griffe().find(x => x.key.endsWith(':umriss:1'));
        expect(g.pos.x).toBe(30);
        expect(g.pos.z).toBe(10);
        expect(g.pos.y).toBeCloseTo(weltAusNn(600.2, VERSATZ), 9);
    });

    it('jeder Griff nennt Operation, Feld und Index — sonst weiss das Werkzeug nicht, welchen', () => {
        const g = griffe().find(x => x.achsen === 'XZ' && x.key.endsWith(':umriss:2'));
        expect(g.werte).toEqual({ op: 0, feld: 'umriss', index: 2 });
        expect(g.felder).toEqual(['op', 'feld', 'index', 'ost', 'nord', 'hoehe']);
    });

    it('der Höhengriff hängt am Zug-Griff — auf dem Finger gibt es kein Shift', () => {
        const zug = griffe().find(x => x.achsen === 'XZ' && x.key.endsWith(':umriss:0'));
        const hoch = griffe().find(x => x.achsen === 'Y' && x.key.endsWith(':umriss:0'));
        expect(hoch.zeigtBei).toBe(zug.key);
        expect(hoch.rolle).toBe('hoehe');
    });

    it('ein Vorgang OHNE Punktliste bekommt keine Griffe — kein toter Knopf', () => {
        const ohne = SUBJEKT();
        ohne.stand.bauplan = { ...BAUPLAN, parameter: { ...BAUPLAN.parameter,
            operationen: [{ art: 'planum', parameter: { hoehe: 599 } }] } };
        expect(griffeFuer({ subjekt: ohne, subjektHerkunft: 'cde', bauform: 'koerper' })
            .filter(x => x.werkzeug === 'erdbau-stuetzpunkt-verschieben')).toEqual([]);
    });
});

describe('Das Werkzeug schreibt die VOLLE Operationsliste zurück', () => {
    const w = () => nachId('erdbau-stuetzpunkt-verschieben');

    it('es steht am eigenen Erdkörper und nirgends sonst', () => {
        expect(w()).toBeTruthy();
        expect(w().nurEigene).toBe(true);
        expect(w().bauform).toEqual(['koerper']);
        // Ein Cut ist ein gemessener geschlossener Körper — genau so kommt er
        // aus der Einordnung. Ohne diesen Weg fände der Griff kein Werkzeug.
        const am = (o) => passende(o, { eigenes: true }).map(x => x.id);
        expect(am({ bauform: 'koerper', guete: 'gemessen' })).toContain('erdbau-stuetzpunkt-verschieben');
        expect(am({ bauform: 'achse+profil', guete: 'gemessen' })).not.toContain('erdbau-stuetzpunkt-verschieben');
        expect(passende({ bauform: 'koerper', guete: 'gemessen' }).map(x => x.id))
            .not.toContain('erdbau-stuetzpunkt-verschieben');   // an einer Lieferung nicht
    });

    it('die gezogene Ecke wandert, die anderen bleiben — und die Höhe bleibt in NN', () => {
        const s = w().anwenden(SUBJEKT(), { op: 0, feld: 'umriss', index: 1, ost: 35, nord: -12, hoehe: 601 });
        expect(s).toBeTruthy();
        const plan = s.find(x => x.nachher?.rolle === 'aushub').nachher.parameter;
        const umriss = plan.operationen[0].parameter.umriss;
        expect(umriss[1]).toMatchObject({ x: 35, y: 601, z: 12 });
        expect(umriss[0]).toEqual(RING[0]);
        expect(umriss[3]).toEqual(RING[3]);
        // Der Rest des Vorgangs bleibt: Sohle, Neigung, Quellen.
        expect(plan.operationen[0].parameter.sohle).toBe(597.5);
        expect(plan.quellen).toEqual({ gelaende: 'DGM1' });
    });

    it('ALLE Teile des Vorgangs bekommen denselben Parametersatz — dieselben Kennungen', () => {
        const s = w().anwenden(SUBJEKT(), { op: 0, feld: 'umriss', index: 0, ost: 11, nord: -11, hoehe: 600 });
        const ids = s.filter(x => x.art === 'erzeugt').map(x => x.globalId).sort();
        expect(ids).toEqual(['cde-aushub', 'cde-auftrag'].sort());
        // Eine Klammer, ein Parametersatz (sonst: Befund `ableitung_uneinheitlich`).
        const plaene = s.filter(x => x.art === 'erzeugt').map(x => JSON.stringify(x.nachher.parameter));
        expect(new Set(plaene).size).toBe(1);
        expect(new Set(s.map(x => x.nachher.ableitung))).toEqual(new Set(['ab-1']));
    });

    it('ein Zug unter einem Zehntelmillimeter schreibt nichts', () => {
        const s = w().anwenden(SUBJEKT(), { op: 0, feld: 'umriss', index: 0, ost: 10, nord: -10, hoehe: 600 });
        expect(s).toBeNull();
    });

    it('unsinnige Eingaben schreiben nichts — kein halber Vorgang', () => {
        for (const werte of [{ op: 9, feld: 'umriss', index: 0, ost: 1, nord: 1, hoehe: 1 },
                             { op: 0, feld: 'linie', index: 0, ost: 1, nord: 1, hoehe: 1 },
                             { op: 0, feld: 'umriss', index: 9, ost: 1, nord: 1, hoehe: 1 },
                             { op: 0, feld: 'umriss', index: 0, ost: NaN, nord: 1, hoehe: 1 }]) {
            expect(w().anwenden(SUBJEKT(), werte)).toBeNull();
        }
    });

    it('an einem GELIEFERTEN Bauteil gibt es es nicht', () => {
        expect(w().anwenden({ globalId: 'X', stand: {} }, { op: 0, feld: 'umriss', index: 0, ost: 1, nord: 1, hoehe: 1 })).toBeNull();
    });

    it('die Vorbelegung nimmt die erste Ecke — und rechnet sie nach Ost/Nord', () => {
        const v = w().vorbelegung(SUBJEKT());
        expect(v).toMatchObject({ op: 0, feld: 'umriss', index: 0, ost: 10, nord: -10, hoehe: 600 });
    });
});

/**
 * Der ganze Weg: Griff → Zug → Werte → Journal. Hier ist ein ZWEITER Vorgang
 * im Spiel, denn genau dort bricht es, wenn der Zug nur Lage und Index trägt:
 * dann schreibt ein Zug an der Böschungslinie in den Umriss der Grube.
 */
describe('Vom Griff bis ins Journal — der zweite Vorgang beweist es', () => {
    const KANTE = [{ x: 50, y: 601, z: 50 }, { x: 70, y: 601.5, z: 50 }];
    const ZWEI = () => {
        const s = SUBJEKT();
        const ops = [BAUPLAN.parameter.operationen[0],
                     { art: 'boeschungLinie', parameter: { linie: KANTE, seite: 'links', neigung: 1.5 } }];
        s.stand.bauplan = { ...BAUPLAN, parameter: { ...BAUPLAN.parameter, operationen: ops } };
        s.stand.teile = new Map([['aushub', { globalId: 'cde-aushub', bauplan: s.stand.bauplan }]]);
        return s;
    };

    it('die Linie bekommt ihre eigenen Griffe — Feld und Operation stehen dran', () => {
        const g = griffeFuer({ subjekt: ZWEI(), subjektHerkunft: 'cde', bauform: 'koerper' })
            .filter(x => aussen(x) && x.achsen === 'XZ' && x.werkzeug === 'erdbau-stuetzpunkt-verschieben');
        expect(g).toHaveLength(6);                       // 4 Umriss + 2 Linie
        expect(g[5].werte).toEqual({ op: 1, feld: 'linie', index: 1 });
    });

    it('der Zug trägt Operation und Feld mit — sonst landet er an der falschen Ecke', () => {
        const subj = ZWEI();
        const g = griffeFuer({ subjekt: subj, subjektHerkunft: 'cde', bauform: 'koerper' })
            .find(x => x.achsen === 'XZ' && x.key.endsWith(':linie:1'));
        const werte = griffZuWerten(g, { x: 72, y: weltAusNn(602, VERSATZ), z: 55 },
                                    { versatz: subj.versatz, hoehenversatz: VERSATZ });
        expect(werte).toEqual({ op: 1, feld: 'linie', index: 1, ost: 72, nord: -55, hoehe: 602 });

        const s = nachId('erdbau-stuetzpunkt-verschieben').anwenden(subj, werte);
        const ops = s.find(x => x.nachher?.rolle === 'aushub').nachher.parameter.operationen;
        expect(ops[1].parameter.linie[1]).toMatchObject({ x: 72, y: 602, z: 55 });
        expect(ops[1].parameter.linie[0]).toEqual(KANTE[0]);
        expect(ops[0].parameter.umriss).toEqual(RING);     // die Grube bleibt unberührt
    });

    it('eine Operation OHNE Punktfeld ihrer Art bekommt keine Griffe', () => {
        // `stationen` an einer Grube ist kein Knickpunkt — `ERDBAU_PUNKTHOEHEN`
        // sagt, welches Feld welche Art trägt, und die Rechnung liest dasselbe.
        const s = SUBJEKT();
        s.stand.bauplan = { ...BAUPLAN, parameter: { ...BAUPLAN.parameter,
            operationen: [{ art: 'grube', parameter: { umriss: RING, stationen: KANTE, sohle: 597 } }] } };
        const g = griffeFuer({ subjekt: s, subjektHerkunft: 'cde', bauform: 'koerper' })
            .filter(x => aussen(x) && x.achsen === 'XZ' && x.werkzeug === 'erdbau-stuetzpunkt-verschieben');
        expect(g).toHaveLength(4);
        expect(g.every(x => x.werte.feld === 'umriss')).toBe(true);
    });
});
