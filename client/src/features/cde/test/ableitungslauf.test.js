/**
 * Der Ableitungslauf (Teil XIV, G2): lazy, memoisiert, ein Durchlauf.
 *
 * Geprüft am ECHTEN Rezept `erdbau` und am echten Kernel — die Quelle kommt
 * als synthetisches Gelände, damit die Zahlen nachrechenbar sind. Dazu ein
 * Fantasie-Rezept für den Zyklus, weil kein echtes eines bildet.
 */
import { describe, expect, it, vi } from 'vitest';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { ABLEITUNGEN } from '../services/ableitung/Ableitungen.js';
import { ableitungsSchritte, rezeptNach } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';
import { ableitungenOhneFormpaar } from '../services/JournalVersatz.js';

function gelaende() {
    const h = (x, z) => 300 + 0.03 * x - 0.02 * z;
    const t = [];
    for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) {
        const a = [x, h(x, z), z], b = [x + 1, h(x + 1, z), z];
        const c = [x + 1, h(x + 1, z + 1), z + 1], d = [x, h(x, z + 1), z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const holeQuellForm = async (gid, form, { cell } = {}) => (gid === 'DGM1' && form === 'raster'
    ? rasterAusMesh({ mesh: gelaende() }, { cell: cell ?? 1 }).ergebnis : null);

function standAus(schritte) { return new Map(schritte.map(s => [s.globalId, s.nachher])); }

const OPS = [{ art: 'gerinne', parameter: {
    achse: [{ x: 5, z: 20 }, { x: 35, z: 20 }], sohlbreite: 2, boeschung: 1.5,
    sohleAnfang: 598, sohleEnde: 597.5,   // m NN — Versatz 300 ⇒ Welt 298 / 297,5
} }];

describe('Ableitungslauf am echten erdbau', () => {
    it('leite läuft EINMAL für drei Teile; Aushub und DGM entstehen, Auftrag ist leer', async () => {
        const schritte = ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: 0.5 }, operationen: OPS, name: 'Ur' });
        const leite = vi.spyOn(ABLEITUNGEN.erdbau, 'leite');
        const lauf = neuerAbleitungslauf({ stand: standAus(schritte), rezeptNach, holeQuellForm, kernel: erzeugeKernel(), hoehenversatz: 300 });
        const [aushub, auftrag, dgm] = schritte;
        const ra = await lauf.baue(aushub.globalId);
        const rf = await lauf.baue(auftrag.globalId);
        const rd = await lauf.baue(dgm.globalId);
        expect(leite).toHaveBeenCalledTimes(1);
        leite.mockRestore();
        expect(ra.ok && ra.teil.form === 'koerper' && ra.teil.daten.closed).toBe(true);
        expect(rf).toMatchObject({ ok: true, leer: true });
        expect(rd.ok && rd.teil.form === 'raster').toBe(true);
        // Die NN-Grenze: die Sohle liegt in WELT bei 298 ± Böschung, nicht bei 598
        const r = rd.teil.daten;
        const mitte = r.heights[Math.round(20 / r.cell) * r.nz + Math.round(20 / r.cell)];
        expect(mitte).toBeGreaterThan(297.4);
        expect(mitte).toBeLessThan(298.1);
        const a = lauf.ableitungen.get(aushub.nachher.ableitung);
        expect(a.teile).toEqual({ aushub: aushub.globalId, dgm: dgm.globalId });
        expect(a.leer).toEqual(['auftrag']);
        expect(a.kennzahlen.aushubRaster).toBeGreaterThan(10);
        expect(Math.abs(a.kennzahlen.aushubKoerper - a.kennzahlen.aushubRaster) / a.kennzahlen.aushubRaster).toBeLessThan(0.02);
        expect(a.befunde).toEqual([]);
        expect(lauf.misserfolge).toEqual([]);
    });

    it('eine fehlende Quelle macht KEIN halbes Ding: alle Teile fallen mit demselben Grund', async () => {
        const schritte = ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'GIBTSNICHT' }, raster: { cell: 1 }, operationen: OPS });
        const lauf = neuerAbleitungslauf({ stand: standAus(schritte), rezeptNach, holeQuellForm, kernel: erzeugeKernel() });
        const r = await Promise.all(schritte.map(s => lauf.baue(s.globalId)));
        expect(r.every(x => x.ok === false)).toBe(true);
        expect(r[0].fehler[0]).toMatch(/GIBTSNICHT/);
        expect(r[2].fehler).toEqual(r[0].fehler);
        expect(lauf.misserfolge).toHaveLength(3);
    });

    it('ein CDE-Teil als Quelle wird lazy gebaut — egal, in welcher Reihenfolge der Stand steht', async () => {
        // Zweite Ableitung nimmt das DGM der ersten als Quelle (Ableitung auf Ableitung).
        const erste = ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: 0.5 }, operationen: OPS });
        const dgm1 = erste[2].globalId;
        const zweite = ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: dgm1 }, raster: { cell: 0.5 },
            operationen: [{ art: 'planum', parameter: { umriss: [{ x: 10, z: 5 }, { x: 15, z: 5 }, { x: 15, z: 10 }, { x: 10, z: 10 }], hoehe: 596 } }] });
        // Stand RÜCKWÄRTS: die zweite steht vor der ersten.
        const lauf = neuerAbleitungslauf({ stand: standAus([...zweite, ...erste]), rezeptNach, holeQuellForm, kernel: erzeugeKernel(), hoehenversatz: 300 });
        const r = await lauf.baue(zweite[2].globalId);
        expect(r.ok).toBe(true);
        expect(r.teil.form).toBe('raster');
        // Das Zwischenergebnis (DGM der ersten) wurde dabei mitgebaut — und nur einmal.
        expect(lauf.ableitungen.size).toBe(2);
    });

    it('ein Zyklus ist ein Misserfolg mit Namen, keine Endlosschleife', async () => {
        const a = ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'B-dgm' }, raster: { cell: 1 }, operationen: OPS });
        const b = ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: a[2].globalId }, raster: { cell: 1 }, operationen: OPS });
        // b's DGM soll die feste Kennung tragen, auf die a zeigt
        b[2].globalId = 'B-dgm';
        const lauf = neuerAbleitungslauf({ stand: standAus([...a, ...b]), rezeptNach, holeQuellForm, kernel: erzeugeKernel() });
        const r = await lauf.baue(a[2].globalId);
        expect(r.ok).toBe(false);
        expect(r.fehler.join(' ')).toMatch(/zyklus/);
    });

    /**
     * DAS FORMPAAR-GATE (2026-09-03).
     *
     * `braucht: {gelaende: ['hoehenfeld']}` stand seit Teil XIV in jedem
     * Ableitungsrezept — und wurde von niemandem gelesen. Der „eigentliche
     * Explosionsschutz" existierte nur als Kommentar; wer eine Stützwand als
     * Gelände auswählte, bekam keinen Grund, sondern irgendein Ergebnis.
     *
     * Der Test braucht BEIDE Richtungen. Prüfte er nur, dass eine falsche
     * Quelle scheitert, bewiese er nur, dass irgendetwas schiefgeht — nicht,
     * dass es das Gate war.
     */
    describe('Formpaar-Gate: passt die Bauform der Quelle?', () => {
        const schritteMit = () => ableitungsSchritte({
            rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: 1 },
            operationen: OPS, name: 'Ur',
        });

        it('weist eine Quelle mit falscher Bauform BENANNT ab', async () => {
            const schritte = schritteMit();
            const lauf = neuerAbleitungslauf({
                stand: standAus(schritte), rezeptNach, holeQuellForm,
                holeQuellBauform: async () => 'koerper',
                kernel: erzeugeKernel(), hoehenversatz: 300,
            });
            const r = await lauf.baue(schritte[0].globalId);
            expect(r.ok).toBe(false);
            // Der Grund muss BEIDE Formen nennen — „nicht ableitbar" hilft
            // niemandem beim Verstehen, was er stattdessen wählen soll.
            expect(r.fehler.join(' ')).toMatch(/koerper/);
            expect(r.fehler.join(' ')).toMatch(/hoehenfeld/);
            expect(lauf.misserfolge[0].grund).toMatch(/gelaende/);
        });

        it('lässt dieselbe Quelle mit passender Bauform durch', async () => {
            // Ohne diese Gegenprobe prüfte der Test oben nur, dass irgendetwas
            // scheitert — nicht, dass das Gate der Grund war.
            const schritte = schritteMit();
            const lauf = neuerAbleitungslauf({
                stand: standAus(schritte), rezeptNach, holeQuellForm,
                holeQuellBauform: async () => 'hoehenfeld',
                kernel: erzeugeKernel(), hoehenversatz: 300,
            });
            const r = await lauf.baue(schritte[0].globalId);
            expect(r.ok).toBe(true);
        });

        it('ohne Bauform-Leser läuft es weiter — sagt aber, dass ungeprüft blieb', async () => {
            // Ein Gate, das nicht laufen konnte, ist etwas anderes als eines,
            // das zufrieden war. Stillschweigend durchzulassen hiesse, ein Gate
            // zu haben, das man nicht sieht.
            const schritte = schritteMit();
            const lauf = neuerAbleitungslauf({
                stand: standAus(schritte), rezeptNach, holeQuellForm,
                kernel: erzeugeKernel(), hoehenversatz: 300,
            });
            const r = await lauf.baue(schritte[0].globalId);
            expect(r.ok).toBe(true);
            const a = lauf.ableitungen.get(schritte[0].nachher.ableitung);
            expect(a.warnungen.some(w => /Formpaar ungepr/.test(w))).toBe(true);
        });

        it('WÄCHTER: jede Ableitung deklariert zu jeder Quellform ein Formpaar', () => {
            // Ein neues Rezept mit `formen: {x: 'raster'}` und ohne `braucht.x`
            // liefe still OHNE Gate — und das fiele niemandem auf, weil alles
            // funktioniert, bis jemand die falsche Quelle wählt.
            expect(ableitungenOhneFormpaar()).toEqual([]);
        });
    });

    it('uneinheitliche Parameter innerhalb einer Klammer werden GEMELDET, nicht still gemittelt', async () => {
        const schritte = ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: 1 }, operationen: OPS });
        schritte[2].nachher = { ...schritte[2].nachher, parameter: { ...schritte[2].nachher.parameter, operationen: [] } };
        const lauf = neuerAbleitungslauf({ stand: standAus(schritte), rezeptNach, holeQuellForm, kernel: erzeugeKernel(), hoehenversatz: 300 });
        await lauf.baue(schritte[0].globalId);
        await lauf.baue(schritte[2].globalId);
        const a = lauf.ableitungen.get(schritte[0].nachher.ableitung);
        expect(a.befunde.some(b => b.regel === 'ableitung_uneinheitlich')).toBe(true);
    });
});
