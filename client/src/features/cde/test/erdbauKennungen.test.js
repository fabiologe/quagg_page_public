// @vitest-environment jsdom
/**
 * Ein Eckenzug behält die Kennungen ALLER Teile seines Vorgangs (Teil XXII, B1).
 *
 * Fabios Journal in 1337 (2026-09-18, gelesen, nicht geschrieben): zwei Züge
 * an Ecke 0 einer Grube — der Aushub behielt seine GlobalId, der Auftrag
 * bekam JEDES MAL eine neue. Drei Auftrag-Teile derselben Ableitung standen
 * danach im Journal, jeder mit einem Körper im Raum.
 *
 * Ursache: der Viewer hängte `vorgangTeile` nur an, wenn das Subjekt schon
 * einen `stand` trug — den setzt aber erst der Store beim Einordnen. Der
 * Test zu P5 reichte `vorgangTeile` selbst herein und lief am echten Weg
 * vorbei. Hier geht es über GENAU den Weg des Griffs: Journal → Store
 * (`einordne` legt `stand` an) → `starte` → `ausfuehren`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { CDE_MODELL_ID, IfcAutor } from '../services/IfcAutor.js';
import { erdbauStapelVon, ueberholteTeile } from '../services/ableitung/Bezuege.js';
import { ableitungsSchritte, rezeptNach, teileVon } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';

const VERSATZ = 0;
const RING = [
    { x: 10, y: 600, z: 10 }, { x: 30, y: 600.2, z: 10 },
    { x: 30, y: 600.4, z: 30 }, { x: 10, y: 600.1, z: 30 },
];
const plan = (rolle, umriss = RING) => ({
    rezept: 'erdbau', rolle, ableitung: 'ab-1', name: `Ur · Ausheben · ${rolle === 'aushub' ? 'Aushub' : 'Auftrag'}`,
    kategorie: rolle === 'aushub' ? 'IFCEARTHWORKSCUT' : 'IFCEARTHWORKSFILL',
    parameter: {
        quellen: { gelaende: 'DGM1' }, quellBasis: { gelaende: null }, raster: { cell: 1 },
        operationen: [{ art: 'grube', parameter: { umriss: umriss, sohle: 597.5, neigung: 1.5 } }],
    },
});

const resolverLeer = {
    forElements: () => ({ async getForm(form) { return { form, data: null, perElement: [], warnings: [] }; } }),
};

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBearbeitung().modusSetzen(true);
});

async function vorgangEintragen() {
    const ae = useAenderungen();
    await ae.eintragen({ art: 'erzeugt', globalId: 'cde-aushub', nachher: plan('aushub'), modell: 'cde' });
    await ae.eintragen({ art: 'erzeugt', globalId: 'cde-auftrag', nachher: plan('auftrag'), modell: 'cde' });
}

/** Was der Griff tut: das gewählte Teil einordnen, Werkzeug scharf, Werte, ausführen. */
async function eckeZiehen(gewaehlt, { ost, nord, hoehe }) {
    const b = useBearbeitung();
    // So kommt das Subjekt aus `pickElement` + `_einordnenMitHuelle`: OHNE
    // `stand` und OHNE `vorgangTeile` — beides ist Sache des Stores.
    await b.einordne({ globalId: gewaehlt, modelId: CDE_MODELL_ID, localId: 7,
                       hoehenversatz: VERSATZ, versatz: { x: 0, y: 0, z: 0 } }, resolverLeer);
    expect(b.starte('erdbau-stuetzpunkt-verschieben', { subjekt: b.bauteil })).toBe(true);
    b.setzeWert('op', 0); b.setzeWert('feld', 'umriss'); b.setzeWert('index', 0);
    b.setzeWert('ost', ost); b.setzeWert('nord', nord); b.setzeWert('hoehe', hoehe);
    return b.ausfuehren({ wer: 'pruefer', subjekt: b.bauteil, modell: 'cde' });
}

describe('Eckenzug: die Teile behalten ihre Kennungen', () => {
    it('am Aushub gezogen — der Auftrag bleibt „cde-auftrag"', async () => {
        await vorgangEintragen();
        await eckeZiehen('cde-aushub', { ost: 5, nord: -12, hoehe: 600 });
        const stand = useAenderungen().wirksamerStand('erzeugt');
        const teile = teileVon(stand, 'ab-1');
        expect([...stand.keys()].sort()).toEqual(['cde-auftrag', 'cde-aushub']);
        expect(teile.get('aushub').globalId).toBe('cde-aushub');
        expect(teile.get('auftrag').globalId).toBe('cde-auftrag');
        // Beide tragen den gezogenen Punkt.
        for (const gid of ['cde-aushub', 'cde-auftrag']) {
            const p = stand.get(gid).parameter.operationen[0].parameter.umriss[0];
            expect(p.x).toBeCloseTo(5, 9);
            expect(p.z).toBeCloseTo(12, 9);
        }
    });

    it('am Auftrag gezogen — der Aushub bleibt „cde-aushub"', async () => {
        await vorgangEintragen();
        await eckeZiehen('cde-auftrag', { ost: 5, nord: -12, hoehe: 600 });
        const stand = useAenderungen().wirksamerStand('erzeugt');
        expect([...stand.keys()].sort()).toEqual(['cde-auftrag', 'cde-aushub']);
        expect(stand.get('cde-aushub').parameter.operationen[0].parameter.umriss[0].x).toBeCloseTo(5, 9);
    });

    it('zweimal gezogen — immer noch genau zwei Teile', async () => {
        await vorgangEintragen();
        await eckeZiehen('cde-aushub', { ost: 5, nord: -12, hoehe: 600 });
        await eckeZiehen('cde-aushub', { ost: 4, nord: -11, hoehe: 599.9 });
        expect([...useAenderungen().wirksamerStand('erzeugt').keys()].sort()).toEqual(['cde-auftrag', 'cde-aushub']);
    });
});

describe('Altlast: verwaiste Teile aus der Zeit vor der Kur', () => {
    /**
     * Fabios Journal: je Zug ein neuer Auftrag — die Map führt die Kennungen
     * in der Reihenfolge ihres ERSTEN Auftretens, und der Aushub (ältester
     * Eintrag, jüngster Wert) steht vorn.
     */
    const verwaist = () => new Map([
        ['cde-anzeige', { rezept: 'anzeige', rolle: 'anzeige', ableitung: 'ab-anz',
                          parameter: { quellen: { gelaende: 'DGM1' }, vorgaenge: [{ ableitung: 'ab-1', titel: 'Ausheben' }] } }],
        ['cde-aushub', plan('aushub', [{ ...RING[0], x: 5 }, ...RING.slice(1)])],
        ['cde-auftrag-alt', plan('auftrag')],
        ['cde-auftrag-mitte', plan('auftrag', [{ ...RING[0], x: 8 }, ...RING.slice(1)])],
        ['cde-auftrag-neu', plan('auftrag', [{ ...RING[0], x: 5 }, ...RING.slice(1)])],
    ]);

    it('der Stapel rechnet mit dem JÜNGSTEN Bauplan des Vorgangs', () => {
        // Gegenprobe der Reihenfolge: steht der alte Auftrag VOR dem Aushub,
        // nahm „der erste gewinnt" den alten Umriss.
        const m = verwaist();
        const umgestellt = new Map([['cde-anzeige', m.get('cde-anzeige')], ['cde-auftrag-alt', m.get('cde-auftrag-alt')],
                                    ['cde-aushub', m.get('cde-aushub')], ['cde-auftrag-mitte', m.get('cde-auftrag-mitte')],
                                    ['cde-auftrag-neu', m.get('cde-auftrag-neu')]]);
        for (const stand of [m, umgestellt]) {
            const { vorgaenge } = erdbauStapelVon(stand, 'DGM1', { rezeptNach });
            expect(vorgaenge).toHaveLength(1);
            expect(vorgaenge[0].bauplan.parameter.operationen[0].parameter.umriss[0].x).toBe(5);
        }
    });
});

describe('Altlast: der Autor baut je Rolle EIN Teil', () => {
    it('ueberholteTeile nennt die älteren Kennungen und den geltenden Teil', () => {
        const m = new Map([
            ['cde-aushub', plan('aushub')], ['cde-auftrag-alt', plan('auftrag')],
            ['cde-auftrag-mitte', plan('auftrag')], ['cde-auftrag-neu', plan('auftrag')],
        ]);
        expect([...ueberholteTeile(m)]).toEqual([['cde-auftrag-alt', 'cde-auftrag-neu'], ['cde-auftrag-mitte', 'cde-auftrag-neu']]);
        // Ein sauberer Vorgang hat nichts Überholtes.
        expect(ueberholteTeile(new Map([['a', plan('aushub')], ['b', plan('auftrag')]])).size).toBe(0);
    });

    /** Ein flaches, leicht geneigtes Gelände, 40 × 40 m — die Rechnung ist hier nicht das Thema. */
    const NETZ = (() => {
        const h = (x) => 300 + 0.02 * x, t = [];
        for (let x = 0; x < 40; x += 2) for (let z = 0; z < 40; z += 2) {
            const a = [x, h(x), z], b = [x + 2, h(x + 2), z], c = [x + 2, h(x + 2), z + 2], d = [x, h(x), z + 2];
            t.push(...a, ...b, ...c, ...a, ...c, ...d);
        }
        return { positions: new Float64Array(t), triCount: t.length / 9 };
    })();
    function autor() {
        const a = new IfcAutor({
            getFragments: () => null,
            holeQuellForm: async (gid, form, opts = {}) => (gid === 'DGM1' && form === 'raster'
                ? rasterAusMesh({ mesh: NETZ }, { cell: opts.cell ?? 2, bereich: opts.bereich ?? null, gitter: opts.gitter ?? null }).ergebnis
                : null),
            kernel: erzeugeKernel(),
            getHoehenversatz: () => 300,
        });
        a.verwirfEigenesModell = vi.fn(async () => {});
        a.eigenesModell = vi.fn(async () => ({ ok: true, modelId: CDE_MODELL_ID, neu: true }));
        a._neuZeichnen = vi.fn(async () => {});
        a.erzeugeAlle = vi.fn(async (_mid, bauteile) => bauteile.map((_, i) => ({ ok: true, localId: 100 + i })));
        return a;
    }
    function journalMitWaise() {
        const ring = [[12, 12], [28, 12], [28, 28], [12, 28]].map(([x, z]) => ({ x, y: 600 + 0.02 * x, z }));
        const grube = (umriss) => ({ art: 'grube', parameter: { umriss, sohle: 598, neigung: 1.5 } });
        const A = ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: 2 },
                                       operationen: [grube(ring)], name: 'Ur' });
        const abl = A[0].nachher.ableitung;
        const Z = ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 2 }, name: 'Ur',
                                       vorgaenge: [{ ableitung: abl, art: 'erdbau', titel: 'Ausheben' }] });
        // Der Zug vor der Kur: Aushub überschrieben, Auftrag unter NEUER Kennung,
        // der alte Auftrag (alter Umriss) bleibt im Stand.
        const gezogen = [{ ...ring[0], x: 10 }, ...ring.slice(1)];
        const aushub = A.find(s => s.nachher.rolle === 'aushub');
        const auftrag = A.find(s => s.nachher.rolle === 'auftrag');
        const neu = (s) => ({ ...s.nachher, parameter: { ...s.nachher.parameter, operationen: [grube(gezogen)] } });
        const plan = [
            ...Z.map(s => ({ globalId: s.globalId, art: 'erzeugt', modell: 'cde', wert: s.nachher })),
            { globalId: aushub.globalId, art: 'erzeugt', modell: 'cde', wert: neu(aushub) },
            { globalId: auftrag.globalId, art: 'erzeugt', modell: 'cde', wert: auftrag.nachher },
            { globalId: 'cde-auftrag-neu', art: 'erzeugt', modell: 'cde', wert: neu(auftrag) },
        ];
        return { plan, abl, aushub: aushub.globalId, alt: auftrag.globalId };
    }

    it('im Raum: EIN Aushub, EIN Auftrag — die Waise steht in `ueberholt`', async () => {
        const { plan, alt } = journalMitWaise();
        const a = autor();
        const r = await a.baueErzeugte(plan);
        expect(r.misserfolge).toEqual([]);
        expect(r.ueberholt).toEqual([alt]);
        expect(r.karte.has(alt)).toBe(false);
        // Die Befundzeile „verschiedene Parameter" gibt es nicht mehr: gebaut
        // wird nur, was denselben (jüngsten) Stand trägt.
        const befunde = [...r.ableitungen.values()].flatMap(x => x.befunde ?? []);
        expect(befunde.filter(b => b.regel === 'ableitung_uneinheitlich')).toEqual([]);
    });

    it('im Export: die Waise kommt nicht ins Paket', async () => {
        const { plan, alt } = journalMitWaise();
        const r = await autor().eigenbauGeometrien(plan);
        expect(r.ueberholt).toEqual([alt]);
        // Eine reine Grube hat keinen Auftrag — der geltende Teil ist „leer",
        // die Waise taucht nirgends auf.
        expect(r.bauteile.map(b => b.globalId)).not.toContain(alt);
        expect(r.leer).not.toContain(alt);
        expect([...r.leer, ...r.bauteile.map(b => b.globalId)]).toContain('cde-auftrag-neu');
    });
});
