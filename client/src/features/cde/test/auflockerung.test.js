/**
 * Gemessen wird gewachsen, abgefahren wird lose (Teil XXI, P4).
 *
 * Gewachsener Boden nimmt beim Lösen mehr Raum ein: 100 m³ im Baugrund füllen
 * auf der Mulde 115 bis 160 m³. Der Aushub wird als `UndisturbedVolume`
 * gemessen — ohne die zweite Zahl rechnet sie jeder Empfänger selbst aus,
 * jeder mit seinem Faktor.
 *
 * Der Faktor ist ein REGLER, keine Norm: DIN 18300 kennt seit 2015
 * Homogenbereiche statt Bodenklassen und schreibt keinen vor.
 */
import { describe, expect, it } from 'vitest';
import { AUFLOCKERUNG, auflockerungFuer, auflockerungOder } from '../services/gelaende/Grabenregeln.js';
import { nachId } from '../services/Bearbeitungen.js';
import { mengenVon, rezeptNach } from '../services/Bauteilrezepte.js';
import { ABLEITUNGEN } from '../services/ableitung/Ableitungen.js';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { ableitungsSchritte } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';

describe('Die Tabelle — Erfahrungswerte mit Herkunft, kein Normwert', () => {
    it('je Bodenklasse ein Faktor, Fels lockert am stärksten auf', () => {
        expect(auflockerungFuer('nichtbindig')).toBe(1.15);
        expect(auflockerungFuer('bindigSteif')).toBe(1.25);
        expect(auflockerungFuer('fels')).toBe(1.45);
        expect(auflockerungFuer('nichtbindig')).toBeLessThan(auflockerungFuer('fels'));
    });

    it('eine unbekannte Klasse bekommt die Vorgabe, keine Erfindung', () => {
        expect(auflockerungFuer('moor')).toBe(AUFLOCKERUNG.vorgabe);
        expect(auflockerungFuer(null)).toBe(AUFLOCKERUNG.vorgabe);
    });

    it('die Quelle steht dabei — und sie behauptet keine Norm', () => {
        expect(AUFLOCKERUNG.quelle).toMatch(/kein Normwert/);
    });

    it('was ausserhalb der Grenzen liegt, ist keine Auflockerung', () => {
        expect(auflockerungOder(1.3)).toBe(1.3);
        expect(auflockerungOder(0.8)).toBeNull();        // Boden schrumpft nicht
        expect(auflockerungOder(5)).toBeNull();
        expect(auflockerungOder('')).toBeNull();
        expect(auflockerungOder(null, 1.2)).toBe(1.2);
    });
});

describe('Der Regler steht in jedem Erdbau-Formular', () => {
    // NICHT beim Auffüllen: eine Schüttung wird VERDICHTET, nicht gelöst —
    // ihre Menge ist `CompactedVolume`. Ein Feld dort wäre ein totes Feld.
    for (const id of ['graben-ausheben', 'kanalgraben-ableiten', 'bauwerksgrube-ableiten']) {
        it(`„${id}" hat das Feld und eine Vorgabe`, () => {
            const w = nachId(id);
            const feld = w.felder.find(f => f.name === 'auflockerung');
            expect(feld, `${id} ohne Feld`).toBeTruthy();
            expect(feld.typ).toBe('zahl');
            expect([feld.min, feld.max]).toEqual([AUFLOCKERUNG.min, AUFLOCKERUNG.max]);
        });
    }

    it('beim Auffüllen gibt es ihn NICHT — verdichtet wird, nicht gelöst', () => {
        expect(nachId('auffuellen').felder.some(f => f.name === 'auflockerung')).toBe(false);
    });

    it('das Werkzeug schreibt ihn an den VORGANG, nicht in eine Operation', () => {
        const GELAENDE = {
            globalId: 'DGM1', modelId: 'm1', localId: 3, name: 'Urgelände', hoehenversatz: 300,
            gelaendeQuellen: [{ globalId: 'DGM1', name: 'Urgelände', herkunft: 'geliefert', cell: 1 }],
        };
        const zug = [{ x: 5, y: 300, z: 5 }, { x: 15, y: 300, z: 5 }, { x: 15, y: 300, z: 15 }, { x: 5, y: 300, z: 15 }];
        const s = nachId('graben-ausheben').anwenden(GELAENDE, { mass: 2, neigung: 1.5, auflockerung: 1.3 }, { zug });
        const plan = s.find(x => x.nachher?.rezept === 'erdbau').nachher.parameter;
        expect(plan.auflockerung).toBe(1.3);
        // Die Geometrie bleibt unberührt — eine Menge ist keine Form.
        expect(JSON.stringify(plan.operationen)).not.toMatch(/auflockerung/);
    });
});

describe('Der Lauf rechnet die lose Masse — und sagt, womit', () => {
    const h = (x, z) => 300 + 0.02 * x;
    function netz() {
        const t = [];
        for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) {
            const a = [x, h(x, z), z], b = [x + 1, h(x + 1, z), z];
            const c = [x + 1, h(x + 1, z + 1), z + 1], d = [x, h(x, z + 1), z + 1];
            t.push(...a, ...b, ...c, ...a, ...c, ...d);
        }
        return { positions: new Float64Array(t), triCount: t.length / 9 };
    }
    const holeQuellForm = async (gid, form, o = {}) => (gid === 'DGM1' && form === 'raster'
        ? rasterAusMesh({ mesh: netz() }, { cell: o.cell ?? 1, bereich: o.bereich ?? null, gitter: o.gitter ?? null }).ergebnis : null);

    async function lauf(auflockerung) {
        const A = ableitungsSchritte({
            rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: 1 }, name: 'Ur', auflockerung,
            operationen: [{ art: 'grube', parameter: {
                umriss: [[8, 8], [28, 8], [28, 28], [8, 28]].map(([x, z]) => ({ x, y: 600 + 0.02 * x, z })),
                sohle: 598, neigung: 1.5 } }],
        });
        const l = neuerAbleitungslauf({ stand: new Map(A.map(s => [s.globalId, s.nachher])),
                                        rezeptNach, holeQuellForm, kernel: erzeugeKernel(), hoehenversatz: 300 });
        const aushub = A.find(s => s.nachher.rolle === 'aushub');
        await l.baue(aushub.globalId);
        return { k: l.ableitungen.get(A[0].nachher.ableitung).kennzahlen, plan: aushub.nachher };
    }

    it('lose Masse = gewachsene Masse mal Faktor — nachrechenbar', async () => {
        const { k } = await lauf(1.3);
        expect(k.auflockerung).toBe(1.3);
        expect(k.aushubLose).toBeCloseTo(k.aushubRaster * 1.3, 9);
        expect(k.aushubRaster).toBeGreaterThan(10);
    });

    it('ohne Angabe gilt die Vorgabe, nicht „keine Auflockerung"', async () => {
        const { k } = await lauf(null);
        expect(k.auflockerung).toBe(AUFLOCKERUNG.vorgabe);
        expect(k.aushubLose).toBeGreaterThan(k.aushubRaster);
    });

    it('die Menge geht als `looseVolume` ins IFC — neben `undisturbedVolume`', async () => {
        const { k, plan } = await lauf(1.25);
        const mengen = mengenVon(plan, k);
        expect(Object.keys(mengen).sort()).toEqual(['looseVolume', 'undisturbedVolume']);
        expect(mengen.looseVolume).toBeCloseTo(mengen.undisturbedVolume * 1.25, 9);
    });

    it('die Gegenprobe steht als ZAHL da, nicht nur als Befund, wenn sie ausschlägt', async () => {
        const { k } = await lauf(1.15);
        expect(Number.isFinite(k.gegenprobeAushub)).toBe(true);
        expect(k.gegenprobeAushub).toBeLessThan(0.02);   // Körper und Raster stimmen
    });

    it('nur der AUSHUB lockert auf — ein Auftrag wird verdichtet, nicht gelöst', () => {
        const teile = ABLEITUNGEN.erdbau.teile;
        const aushub = teile.find(t => t.rolle === 'aushub');
        const auftrag = teile.find(t => t.rolle === 'auftrag');
        expect(Object.keys(aushub.menge).sort()).toEqual(['looseVolume', 'undisturbedVolume']);
        expect(Object.keys(auftrag.menge)).toEqual(['compactedVolume']);
    });
});
