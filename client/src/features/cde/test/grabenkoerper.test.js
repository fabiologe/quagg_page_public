/**
 * Der Grabenkörper aus Querprofilen (Teil XXI, P6).
 *
 * Gemessen wird gegen ZWEI unabhängige Wahrheiten, nie gegen sich selbst:
 *   1. die Handrechnung (ebenes Gelände, gerade Achse — Trapezformel),
 *   2. dieselbe Operation `gerinne` auf einem 0,0625-m-Raster.
 *
 * Der zweite Vergleich ist der eigentliche Wächter: Körper und Rastermasse
 * entstehen auf verschiedenen Wegen aus derselben Regel. Laufen sie
 * auseinander, ist eine der beiden falsch — und bei senkrechten Wänden ist es
 * nachweislich das Raster (siehe unten).
 */
import { describe, expect, it } from 'vitest';
import { GRABEN_KEIL, grabenkoerper } from '../services/geometrie/ops/Graben.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';
import { formeNach, massenAus } from '../services/gelaende/Operationen.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';

/** Ein Gelände 60 × 60 m aus einer Höhenformel. */
function raster(hf, cell) {
    const t = [];
    for (let x = 0; x < 60; x++) for (let z = 0; z < 60; z++) {
        const a = [x, hf(x, z), z], b = [x + 1, hf(x + 1, z), z];
        const c = [x + 1, hf(x + 1, z + 1), z + 1], d = [x, hf(x, z + 1), z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return rasterAusMesh({ mesh: { positions: new Float64Array(t), triCount: t.length / 9 } }, { cell }).ergebnis;
}
const EBEN = () => 300;
/** 30 m gerade, Sohle 297 (3 m tief), Sohlbreite 1,00 m. */
const GERADE = [{ x: 15, y: 297, z: 30, sohlbreite: 1 }, { x: 45, y: 297, z: 30, sohlbreite: 1 }];

/** Dieselben Stationen als Rasteroperation — die unabhängige Gegenrechnung. */
function rastermasse(hf, stationen, n, cell) {
    const g = raster(hf, cell);
    const op = [{ art: 'gerinne', parameter: { stationen, boeschung: n,
        sohlbreite: Math.max(...stationen.map(s => s.sohlbreite)) } }];
    return massenAus(g, formeNach(g, op).raster).aushub;
}
const koerper = (hf, stationen, n, opts = {}) =>
    grabenkoerper({ raster: raster(hf, opts.cell ?? 0.5) },
                  { stationen, boeschung: n, schritt: 0.25, quer: 0.25, ...opts });

describe('Der Körper ist geschlossen und trägt ein Volumen', () => {
    it('ein Trapezgraben schliesst — Deckel, Sohle, zwei Wände, zwei Stirnseiten', () => {
        const r = koerper(EBEN, GERADE, 1);
        expect(r.ergebnis.closed).toBe(true);
        expect(r.warnungen).toEqual([]);
        expect(r.ergebnis.volumen).toBeGreaterThan(0);
        expect(r.ergebnis.profile).toBeGreaterThan(30);
    });

    it('ohne Stationen, ohne Tiefe, ohne Raster: ein NEIN mit Grund, kein Wurf', () => {
        expect(grabenkoerper({ raster: raster(EBEN, 1) }, { stationen: [] }).ergebnis).toBeNull();
        const ueber = [{ x: 15, y: 301, z: 30, sohlbreite: 1 }, { x: 45, y: 301, z: 30, sohlbreite: 1 }];
        const r = grabenkoerper({ raster: raster(EBEN, 1) }, { stationen: ueber, boeschung: 1 });
        expect(r.ergebnis).toBeNull();
        expect(r.warnungen.join(' ')).toMatch(/ohne_tiefe/);
        // Vertragsbruch dagegen wirft: das Raster ist Pflicht.
        expect(() => grabenkoerper({}, { stationen: GERADE })).toThrow();
    });
});

describe('Gegen die HANDRECHNUNG — ebenes Gelände, gerade Achse', () => {
    it('senkrecht (verbaut): Sohlbreite · Tiefe · Länge, auf den Zentimeter', () => {
        // 1,00 m · 3,00 m · 30 m = 90,00 m³ — es gibt keine Böschung, kein Ausstreichen.
        expect(koerper(EBEN, GERADE, 0).ergebnis.volumen).toBeCloseTo(90, 2);
    });

    /**
     * Geböscht, eben, gerade — das lässt sich geschlossen hinschreiben:
     *
     *     V = L · (b·t + n·t²)   Kern: Trapez über die Länge
     *       + 2 · ( b·t²·n/2     Rampe: die Sohle streicht mit 1 : n aus
     *             + π·t³·n²/6 )  die Viertelkegel an ihren vier Ecken
     *
     * Der zweite Summand der Rampe ist die Hypotenuse: das Zielfeld hinter
     * der Stirnseite ist ein Kegel, kein Keil.
     */
    const ausFormel = (b, t, n, L) => L * (b * t + n * t * t) + 2 * (b * t * t * n / 2 + Math.PI * t ** 3 * n * n / 6);

    for (const n of [1, 1.5]) {
        it(`geböscht 1:${n}: Kern und Rampen nach der Formel (0,1 %)`, () => {
            const v = koerper(EBEN, GERADE, n).ergebnis.volumen;
            expect(Math.abs(v / ausFormel(1, 3, n, 30) - 1)).toBeLessThan(0.001);
        });
    }

    it('der Keil am Rampenende kostet weniger als 0,01 m³', () => {
        expect(GRABEN_KEIL).toBeLessThanOrEqual(0.05);
        const fein = grabenkoerper({ raster: raster(EBEN, 0.5) },
            { stationen: GERADE, boeschung: 1, schritt: 0.1, quer: 0.1 });
        expect(Math.abs(fein.ergebnis.volumen - koerper(EBEN, GERADE, 1).ergebnis.volumen)).toBeLessThan(0.2);
    });
});

describe('Gegen die RASTERMASSE — wo das Raster recht hat', () => {
    // Bei geböschten Wänden ist das Raster genau: das Zielfeld ist stetig.
    // Der Körper muss ihm dann folgen, sonst stünden zwei Zahlen nebeneinander.
    const faelle = [
        ['eben',              EBEN,                                              GERADE, 1],
        ['längs geneigt 5 %', (x) => 300 + 0.05 * (x - 30),                      GERADE, 1],
        ['quer geneigt 5 %',  (x, z) => 300 + 0.05 * (z - 30),                   GERADE, 1],
        ['flacher, n = 1,5',  EBEN,                                              GERADE, 1.5],
        ['wellig',            (x, z) => 300 + 0.8 * Math.sin(x / 7) + 0.6 * Math.cos(z / 5), GERADE, 1],
        ['diagonal',          EBEN, [{ x: 15, y: 297, z: 15, sohlbreite: 1 }, { x: 40, y: 297, z: 40, sohlbreite: 1 }], 1],
    ];
    for (const [name, hf, st, n] of faelle) {
        it(`${name}: Körper und feines Raster auf 0,1 %`, () => {
            const r = koerper(hf, st, n);
            expect(r.ergebnis.closed, name).toBe(true);
            const wahr = rastermasse(hf, st, n, 0.0625);
            expect(Math.abs(r.ergebnis.volumen / wahr - 1), name).toBeLessThan(0.001);
        });
    }

    it('die Sohlbreite darf stufen — jede Teilstrecke hat ihre eigene', () => {
        const st = [];
        for (let i = 0; i <= 15; i++) st.push({ x: 15 + i * 2, y: 297 - i * 0.04, z: 30, sohlbreite: i < 8 ? 1 : 1.2 });
        const r = koerper(EBEN, st, 1);
        expect(r.ergebnis.closed).toBe(true);
        expect(Math.abs(r.ergebnis.volumen / rastermasse(EBEN, st, 1, 0.0625) - 1)).toBeLessThan(0.001);
    });

    it('die Zellweite des Deckels ändert den Körper kaum — er hängt nicht am Gitter', () => {
        const v = [1, 0.5, 0.25].map(cell => koerper(EBEN, GERADE, 1, { cell }).ergebnis.volumen);
        expect(Math.max(...v) - Math.min(...v)).toBeLessThan(0.05);
    });
});

describe('Wo das RASTER es nicht kann: senkrechte Wände', () => {
    /**
     * Der Befund von 2026-09-17, der P6 ausgelöst hat. `wandform: 'verbau'`
     * ist die Vorgabe des Kanalgrabens, und sie erzeugt n = 0. Ein senkrechter
     * Graben ist im Knotenraster eine Sprungfunktion: gemessen wird rund
     * `Sohlbreite + Zellweite` statt `Sohlbreite`.
     */
    it('das Raster verfehlt die Handrechnung — je gröber die Zelle, desto mehr', () => {
        const soll = 90;                                     // 1,00 · 3,00 · 30
        const fehler = (cell) => rastermasse(EBEN, GERADE, 0, cell) / soll - 1;
        expect(Math.abs(fehler(0.5))).toBeGreaterThan(0.25);  // gemessen +52 %
        expect(Math.abs(fehler(0.25))).toBeGreaterThan(0.10); // gemessen +26 %
        // Und es konvergiert nicht sauber: wo die Gitterlinien fallen, entscheidet mit.
        expect(Math.abs(fehler(0.0625))).toBeGreaterThan(0.02);
    });

    it('der Körper trifft sie auf den Zentimeter — bei JEDER Zellweite', () => {
        for (const cell of [1, 0.5, 0.25]) {
            expect(koerper(EBEN, GERADE, 0, { cell }).ergebnis.volumen, `cell ${cell}`).toBeCloseTo(90, 2);
        }
    });
});

describe('Der Kernel kennt die Operation', () => {
    it('sie rechnet im Client und liefert einen Körper', async () => {
        const kernel = erzeugeKernel();
        expect(kernel.kann('grabenkoerper')).toEqual({ ok: true });
        const r = await kernel.op('grabenkoerper', { raster: raster(EBEN, 0.5) },
            { stationen: GERADE, boeschung: 0, schritt: 0.5, quer: 0.5 });
        expect(r.ergebnis.closed).toBe(true);
        expect(r.ergebnis.volumen).toBeCloseTo(90, 2);
    });

    it('`stationen` ist Pflicht — der Vertrag hält', async () => {
        const kernel = erzeugeKernel();
        await expect(kernel.op('grabenkoerper', { raster: raster(EBEN, 1) }, {})).rejects.toThrow();
    });
});
