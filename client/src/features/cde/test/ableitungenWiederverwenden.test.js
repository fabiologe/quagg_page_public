// @vitest-environment jsdom
/**
 * Teil XXX, B4 — ein Kommando rechnet die Ableitungen nur neu, wenn sich etwas
 * geändert hat, wovon sie abhängen.
 *
 * Gemessen in 10001 (43 Teile): der Ableitungslauf rechnete bei JEDEM
 * Kommando Geländeanzeige, Schichten und Mulden neu (2–2,7 s), auch wenn das
 * Kommando nur eine Wand setzte. Jetzt gilt das letzte Ergebnis weiter,
 * solange alle Ableitungsteile, alles, was der Lauf aus dem Stand GELESEN hat,
 * die Bauformen gelieferter Quellen, Höhenversatz und Regelwerk gleich sind.
 *
 * Die Abnahme ist der Vergleich mit einem FRISCHEN Autor: nach jedem Schritt
 * muss der Aufbau mit Speicher dieselbe Geometrie liefern wie einer ohne.
 * Ein Speicher, der zu lange gilt, zeigte sonst still eine alte Fläche.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CDE_MODELL_ID, IfcAutor } from '../services/IfcAutor.js';
import { ableitungsSchritte, erzeugtEintrag } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';
import { setzeRegelwerk } from '../services/regeln/Regelwerk.js';
import { registrierte, setzeRegistrierte } from '../services/rezept/Register.js';

function gelaende() {
    const h = (x) => 300 + 0.01 * x;
    const t = [];
    for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) {
        const a = [x, h(x), z], b = [x + 1, h(x + 1), z], c = [x + 1, h(x + 1), z + 1], d = [x, h(x), z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const NETZ = gelaende();

/** Ein Autor mit echtem Lauf und Kernel; nur der fragments-Teil ist Attrappe. Er merkt sich, was er erzeugte. */
function autor({ bauform = () => 'hoehenfeld', versatz = () => 0 } = {}) {
    const quellFragen = vi.fn(async (gid, form, opts = {}) => (gid === 'DGM1' && form === 'raster'
        ? rasterAusMesh({ mesh: NETZ }, { cell: opts.cell ?? 1, bereich: opts.bereich ?? null, gitter: opts.gitter ?? null }).ergebnis
        : null));
    const a = new IfcAutor({
        getFragments: () => null,
        holeQuellForm: quellFragen,
        holeQuellBauform: async (gid) => bauform(gid),
        kernel: erzeugeKernel(),
        getHoehenversatz: versatz,
    });
    a.verwirfEigenesModell = vi.fn(async () => {});
    a.eigenesModell = vi.fn(async () => ({ ok: true, modelId: CDE_MODELL_ID, neu: true }));
    a._neuZeichnen = vi.fn(async () => {});
    a.erzeugt = new Map();
    a.erzeugeAlle = vi.fn(async (_mid, bauteile) => {
        a.erzeugt = new Map(bauteile.map(b => [b.globalId, { kategorie: b.kategorie, name: b.name,
            positions: [...(b.geometrie?.attributes?.position?.array ?? [])] }]));
        return bauteile.map((_, i) => ({ ok: true, localId: 100 + i }));
    });
    a.quellFragen = quellFragen;
    return a;
}

const OP = [{ art: 'kanalgraben', parameter: { dn: 300, arbeitsraum: 0.4, bettung: 0.15, boeschung: 0.5 } }];
const rohr = (gid, punkte) => ({ ...erzeugtEintrag({ rezept: 'rohr', kategorie: 'IFCPIPESEGMENT', name: gid, parameter: { punkte, dn: 300 } }), globalId: gid });

/** Rohr R1 (Quelle des Grabens), ein unbeteiligtes Rohr R2, der Kanalgraben auf R1 und die Geländeanzeige. */
function szenario() {
    const r1 = rohr('cde-R1', [[5, 297.5, 20], [35, 297.2, 20]]);
    const r2 = rohr('cde-R2', [[5, 299, 5], [15, 299, 5]]);
    const graben = ableitungsSchritte({ rezept: 'kanalgraben', quellen: { rohr: 'cde-R1', gelaende: 'DGM1' },
                                        raster: { cell: 0.5 }, operationen: OP, name: 'H-001' });
    const anzeige = ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 0.5 },
                                         vorgaenge: [{ ableitung: graben[0].nachher.ableitung }] });
    return [r1, r2, ...graben, ...anzeige].map(e => ({ globalId: e.globalId, art: 'erzeugt', modell: 'cde', wert: e.nachher }));
}
const mit = (schritte, gid, aendern) => schritte.map(s => (s.globalId === gid ? { ...s, wert: aendern(structuredClone(s.wert)) } : s));

/** Baut mit dem Autor `a` und mit einem frischen — und vergleicht, was in den Raum ging. */
async function bauenUndVergleichen(a, schritte, opts = {}, bauOpts = {}) {
    const r = await a.baueErzeugte(schritte, CDE_MODELL_ID, bauOpts);
    const frisch = autor(opts);
    await frisch.baueErzeugte(schritte, CDE_MODELL_ID, bauOpts);
    expect([...a.erzeugt.keys()].sort()).toEqual([...frisch.erzeugt.keys()].sort());
    for (const [gid, b] of frisch.erzeugt) expect(a.erzeugt.get(gid)).toEqual(b);
    return r;
}

afterEach(() => setzeRegelwerk([]));

describe('Ableitungen werden wiederverwendet — nur, solange sie gelten', () => {
    it('ein unbeteiligtes Bauteil ändert sich: der Lauf rechnet nicht neu, das Bild ist dasselbe wie frisch', async () => {
        const a = autor();
        let s = szenario();
        expect((await bauenUndVergleichen(a, s)).wiederverwendet).toBe(false);
        a.quellFragen.mockClear();
        s = mit(s, 'cde-R2', w => { w.parameter.punkte[1][0] = 25; return w; });
        expect((await bauenUndVergleichen(a, s)).wiederverwendet).toBe(true);
        expect(a.quellFragen).not.toHaveBeenCalled();             // vorher: das Gelände für jede Ableitung neu
        expect(a.ableitungen.size).toBeGreaterThan(0);            // Kennzahlen bleiben da
    });

    it('die Quelle des Grabens ändert sich: neu gerechnet', async () => {
        const a = autor();
        let s = szenario();
        await a.baueErzeugte(s);
        s = mit(s, 'cde-R1', w => { w.parameter.punkte[1][1] = 296.8; return w; });
        expect((await bauenUndVergleichen(a, s)).wiederverwendet).toBe(false);
    });

    it('eine Ableitung selbst ändert sich: neu gerechnet', async () => {
        const a = autor();
        let s = szenario();
        await a.baueErzeugte(s);
        const graben = s.find(x => x.wert.rezept === 'kanalgraben');
        s = mit(s, graben.globalId, w => { w.parameter.operationen[0].parameter.arbeitsraum = 0.8; return w; });
        expect((await bauenUndVergleichen(a, s)).wiederverwendet).toBe(false);
    });

    it('ein neues Bauteil kommt dazu: wiederverwendet; eine neue Ableitung: neu gerechnet', async () => {
        const a = autor();
        let s = szenario();
        await a.baueErzeugte(s);
        const r3 = rohr('cde-R3', [[2, 299, 30], [8, 299, 30]]);
        s = [...s, { globalId: r3.globalId, art: 'erzeugt', modell: 'cde', wert: r3.nachher }];
        expect((await bauenUndVergleichen(a, s)).wiederverwendet).toBe(true);
        const g2 = ableitungsSchritte({ rezept: 'kanalgraben', quellen: { rohr: 'cde-R3', gelaende: 'DGM1' },
                                        raster: { cell: 0.5 }, operationen: OP, name: 'H-003' });
        s = [...s, ...g2.map(e => ({ globalId: e.globalId, art: 'erzeugt', modell: 'cde', wert: e.nachher }))];
        expect((await bauenUndVergleichen(a, s)).wiederverwendet).toBe(false);
    });

    it('ein früherer Vorgang im Erdbau-Stapel verschwindet: neu gerechnet — der spätere lag auf ihm', async () => {
        // Der Stapel findet seine Vorgänge über den ganzen Stand, nicht über
        // eine Quelle — deshalb gehören ALLE Ableitungsteile in den Schlüssel.
        const ring = (a, b) => [[a, a], [b, a], [b, b], [a, b]].map(([x, z]) => ({ x, y: 300 + 0.01 * x, z }));
        const vorgang = (op) => ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: 1 },
                                                     operationen: [op], name: 'Ur' });
        const A = vorgang({ art: 'grube', parameter: { umriss: ring(10, 30), sohle: 297, neigung: 1.5 } });
        const B = vorgang({ art: 'schuettung', parameter: { umriss: ring(14, 26), ziel: 'hoehe', hoehe: 299, neigung: 1.5 } });
        const Z = ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 1 }, name: 'Ur',
            vorgaenge: [{ ableitung: A[0].nachher.ableitung, art: 'erdbau' }, { ableitung: B[0].nachher.ableitung, art: 'erdbau' }] });
        const alsSchritte = (l) => l.map(e => ({ globalId: e.globalId, art: 'erzeugt', modell: 'cde', wert: e.nachher }));
        const a = autor();
        await bauenUndVergleichen(a, alsSchritte([...A, ...B, ...Z]));
        expect((await bauenUndVergleichen(a, alsSchritte([...B, ...Z]))).wiederverwendet).toBe(false);
    });

    it('ein verborgener Vorgang kommt in den Stapel: neu gerechnet — der Lauf findet ihn ohne ihn zu „lesen"', async () => {
        const ring = (a, b) => [[a, a], [b, a], [b, b], [a, b]].map(([x, z]) => ({ x, y: 300 + 0.01 * x, z }));
        const vorgang = (op) => ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: 1 },
                                                     operationen: [op], name: 'Ur' });
        const A = vorgang({ art: 'grube', parameter: { umriss: ring(10, 30), sohle: 297, neigung: 1.5 } });
        const B = vorgang({ art: 'schuettung', parameter: { umriss: ring(14, 26), ziel: 'hoehe', hoehe: 299, neigung: 1.5 } });
        const Z = ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 1 }, name: 'Ur',
            vorgaenge: [{ ableitung: B[0].nachher.ableitung, art: 'erdbau' }] });
        const alsSchritte = (l) => l.map(e => ({ globalId: e.globalId, art: 'erzeugt', modell: 'cde', wert: e.nachher }));
        const a = autor();
        await a.baueErzeugte(alsSchritte([...B, ...Z]));
        const r = await bauenUndVergleichen(a, alsSchritte([...A, ...B, ...Z]), {}, { verdeckt: new Set(A.map(e => e.globalId)) });
        expect(r.wiederverwendet).toBe(false);
    });

    it('ein anderes Regelwerk, ein anderer Höhenversatz: neu gerechnet', async () => {
        const a = autor();
        const s = szenario();
        await a.baueErzeugte(s);
        const befunde = () => [...a.ableitungen.values()].flatMap(x => x.befunde ?? []).map(b => b.regel);
        const vorher = befunde();
        setzeRegelwerk([{ id: 'ueberdeckungMindestM', wert: 5, herkunft: 'buero' }]);
        expect((await bauenUndVergleichen(a, s)).wiederverwendet).toBe(false);
        expect(befunde().filter(r => r === 'ueberdeckung_gering').length)
            .toBeGreaterThan(vorher.filter(r => r === 'ueberdeckung_gering').length);   // die Befunde des Büros, nicht die alten
        expect((await a.baueErzeugte(s)).wiederverwendet).toBe(true);
        let hv = 0;
        const b = autor({ versatz: () => hv });
        await b.baueErzeugte(s);
        hv = 0.5;
        expect((await b.baueErzeugte(s)).wiederverwendet).toBe(false);
    });

    it('der Rezeptkatalog der Bibliothek wird neu geladen: neu gerechnet', async () => {
        const a = autor();
        const s = szenario();
        await a.baueErzeugte(s);
        setzeRegistrierte(registrierte());                    // dieselbe Liste, neu geladen — die Form könnte anders sein
        expect((await bauenUndVergleichen(a, s)).wiederverwendet).toBe(false);
    });

    it('die Bauform einer gelieferten Quelle ändert sich: neu gerechnet', async () => {
        let form = 'hoehenfeld';
        const a = autor({ bauform: () => form });
        const s = szenario();
        await a.baueErzeugte(s);
        form = 'koerper';
        expect((await a.baueErzeugte(s)).wiederverwendet).toBe(false);
    });

    it('die Engine vergisst (Modell geladen, entladen, Geliefertes geändert): neu gerechnet', async () => {
        const a = autor();
        const s = szenario();
        await a.baueErzeugte(s);
        a.ableitungenVergessen();
        expect((await a.baueErzeugte(s)).wiederverwendet).toBe(false);
    });

    it('verborgene Teile tauchen wieder auf, für die es kein Ergebnis gibt: neu gerechnet, kein gemischter Lauf', async () => {
        const a = autor();
        const s = szenario();
        const anzeige = s.find(x => x.wert.rezept === 'anzeige').globalId;
        await a.baueErzeugte(s, CDE_MODELL_ID, { verdeckt: new Set([anzeige]) });
        const r = await a.baueErzeugte(s);
        expect(r.wiederverwendet).toBe(false);
        expect(a.erzeugt.has(anzeige)).toBe(true);
    });
});

describe('die Engine sagt dem Autor, wenn Geliefertes sich ändert', () => {
    it('quellNetzeVergessen vergisst auch die Ableitungen', async () => {
        const { IfcEngine } = await import('../services/IfcEngine.js');
        const e = Object.create(IfcEngine.prototype);
        e.autor = { ableitungenVergessen: vi.fn() };
        e.quellNetzeVergessen();
        expect(e.autor.ableitungenVergessen).toHaveBeenCalled();
    });
});
