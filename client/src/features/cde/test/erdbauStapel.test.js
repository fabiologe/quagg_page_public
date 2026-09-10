/**
 * Der Erdbau-Stapel (Stufe 1 des Aushub-Fachmodells) — am ECHTEN Rezept und
 * echten Kernel, auf einem synthetischen Gelände, damit die Zahlen
 * nachrechenbar sind.
 *
 * Was hier gemessen wird, ist die Größe, die der Befund behauptet hat: ein
 * Gelände, ein Stapel, eine Anzeige — und die Summe der Vorgänge ist die
 * Gesamtmasse. Dazu die Reihenfolge (der zweite Cut nimmt nur, was noch da
 * ist) und die Alt-Kette (ein Journal von vor Stufe 1 landet im selben
 * Stapel, ohne umgeschrieben zu werden).
 */
import { describe, expect, it } from 'vitest';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { ABLEITUNGEN } from '../services/ableitung/Ableitungen.js';
import { urGelaendeVon } from '../services/ableitung/Bezuege.js';
import { ableitungsSchritte, rezeptNach, istAnzeigeform } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';
import { formeNach, massenAus } from '../services/gelaende/Operationen.js';

function gelaende() {
    const h = (x, z) => 300 + 0.02 * x - 0.01 * z;
    const t = [];
    for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) {
        const a = [x, h(x, z), z], b = [x + 1, h(x + 1, z), z];
        const c = [x + 1, h(x + 1, z + 1), z + 1], d = [x, h(x, z + 1), z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const urRaster = (cell = 1) => rasterAusMesh({ mesh: gelaende() }, { cell }).ergebnis;
const holeQuellForm = async (gid, form, { cell } = {}) => (gid === 'DGM1' && form === 'raster' ? urRaster(cell ?? 1) : null);
const standAus = (...listen) => new Map(listen.flat().map(s => [s.globalId, s.nachher]));
const lauf = (stand) => neuerAbleitungslauf({ stand, rezeptNach, holeQuellForm, kernel: erzeugeKernel(), hoehenversatz: 300 });

// Zwei Vorgänge, die sich NICHT überlappen: ein Gerinne bei z = 10, ein Planum bei z = 30.
const GERINNE = { art: 'gerinne', parameter: { achse: [{ x: 5, z: 10 }, { x: 35, z: 10 }], sohlbreite: 2, boeschung: 1.5, sohleAnfang: 598, sohleEnde: 597.5 } };
const PLANUM  = { art: 'planum',  parameter: { umriss: [{ x: 5, z: 26 }, { x: 15, z: 26 }, { x: 15, z: 36 }, { x: 5, z: 36 }], hoehe: 598.5 } };
// Und einer, der das Gerinne KREUZT: ein AUFTRAG (602 → 302 in Welt, ~1,6 m über dem
// Gelände) über der Gerinnemitte. Die Höhen sind Eingaben mit Höhenversatz 300 —
// `_opsInWelt` zieht ihn ab; 599 wäre ein Abtrag, kein Auftrag.
const KREUZT  = { art: 'planum',  parameter: { umriss: [{ x: 15, z: 5 }, { x: 25, z: 5 }, { x: 25, z: 15 }, { x: 15, z: 15 }], hoehe: 602 } };

function vorgang(ops, name) {
    return ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: 1 }, operationen: ops, name });
}
function anzeige(vorgaenge) {
    return ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 1 }, operationen: [] })
        .map(s => ({ ...s, nachher: { ...s.nachher, parameter: { ...s.nachher.parameter, vorgaenge } } }));
}
const idVon = (schritte) => schritte[0].nachher.ableitung;
const teil = (schritte, rolle) => schritte.find(s => s.nachher.rolle === rolle);

describe('Ein Ur-Gelände, ein Stapel, eine Anzeige', () => {
    it('die Rezepte tragen keinen dgm-Teil mehr; die Anzeige ist die eine Fläche und kein Export', () => {
        for (const r of ['erdbau', 'kanalgraben', 'bauwerksgrube']) {
            expect(ABLEITUNGEN[r].erdbau).toBe(true);
            expect(ABLEITUNGEN[r].teile.map(t => t.rolle)).not.toContain('dgm');
        }
        expect(ABLEITUNGEN.anzeige.erdbau).toBeUndefined();
        expect(ABLEITUNGEN.anzeige.teile).toHaveLength(1);
        expect(ABLEITUNGEN.anzeige.teile[0]).toMatchObject({ rolle: 'anzeige', export: false, predefinedType: 'TERRAIN' });
        expect(istAnzeigeform({ rezept: 'anzeige', rolle: 'anzeige' })).toBe(true);
        // ein Erdbau-Vorgang: zwei Einträge (Cut, Fill), kein Gelände
        expect(vorgang([GERINNE], 'Ur').map(s => s.nachher.rolle)).toEqual(['aushub', 'auftrag']);
    });

    it('die Anzeige ist das Ur-Gelände nach ALLEN Vorgängen — Zelle für Zelle', async () => {
        const A = vorgang([GERINNE], 'Ur'), B = vorgang([PLANUM], 'Ur');
        const Z = anzeige([{ ableitung: idVon(A), titel: 'Gerinne', art: 'erdbau' }, { ableitung: idVon(B), titel: 'Planum', art: 'erdbau' }]);
        const l = lauf(standAus(A, B, Z));
        const r = await l.baue(Z[0].globalId);
        expect(r.ok && r.teil.form === 'raster').toBe(true);
        const erwartet = formeNach(urRaster(1), [
            ...A[0].nachher.parameter.operationen.map(o => ({ ...o, parameter: { ...o.parameter, sohleAnfang: 298, sohleEnde: 297.5 } })),
            { ...PLANUM, parameter: { ...PLANUM.parameter, hoehe: 298.5 } },
        ]).raster;
        expect(r.teil.daten.heights.length).toBe(erwartet.heights.length);
        let maxAbweichung = 0;
        for (let i = 0; i < erwartet.heights.length; i++) maxAbweichung = Math.max(maxAbweichung, Math.abs(r.teil.daten.heights[i] - erwartet.heights[i]));
        expect(maxAbweichung).toBeLessThan(1e-9);
        expect(l.stapelVon('DGM1')).toEqual([idVon(A), idVon(B)]);
    });

    it('die Summe der Vorgänge IST die Gesamtmasse (Regel und Kur messen dieselbe Größe)', async () => {
        const A = vorgang([GERINNE], 'Ur'), B = vorgang([PLANUM], 'Ur');
        const Z = anzeige([{ ableitung: idVon(A) }, { ableitung: idVon(B) }]);
        const l = lauf(standAus(A, B, Z));
        await l.baue(teil(A, 'aushub').globalId);
        await l.baue(teil(B, 'aushub').globalId);
        const z = await l.baue(Z[0].globalId);
        const kA = l.ableitungen.get(idVon(A)).kennzahlen, kB = l.ableitungen.get(idVon(B)).kennzahlen;
        const gesamt = massenAus(urRaster(1), z.teil.daten);
        expect(kA.aushubRaster).toBeGreaterThan(10);
        expect(kA.aushubRaster + kB.aushubRaster).toBeCloseTo(gesamt.aushub, 6);
        expect(kA.auftragRaster + kB.auftragRaster).toBeCloseTo(gesamt.auftrag, 6);
        expect(l.ableitungen.get(Z[0].nachher.ableitung).kennzahlen).toMatchObject({ aushubGesamt: gesamt.aushub, vorgaenge: 2 });
        // Reihe: A ist der erste, B der zweite Vorgang
        expect([kA.reihe, kB.reihe]).toEqual([0, 1]);
    });

    it('der zweite Cut nimmt nur, was noch da ist — die Reihenfolge entscheidet die Menge', async () => {
        // Planum zuerst hebt das Gelände an (Auftrag); das Gerinne danach schneidet auch durch den Auftrag.
        const P = vorgang([KREUZT], 'Ur'), G = vorgang([GERINNE], 'Ur');
        const nachher = lauf(standAus(P, G, anzeige([{ ableitung: idVon(P) }, { ableitung: idVon(G) }])));
        await nachher.baue(teil(P, 'auftrag').globalId);
        expect(nachher.ableitungen.get(idVon(P)).kennzahlen.auftragRaster).toBeGreaterThan(100);   // es IST ein Auftrag
        await nachher.baue(teil(G, 'aushub').globalId);
        const allein = lauf(standAus(G));
        await allein.baue(teil(G, 'aushub').globalId);
        const mitAuftrag = nachher.ableitungen.get(idVon(G)).kennzahlen.aushubRaster;
        const ohne = allein.ableitungen.get(idVon(G)).kennzahlen.aushubRaster;
        expect(mitAuftrag).toBeGreaterThan(ohne + 1);          // das Gerinne räumt den Auftrag mit ab
        // Umgekehrt (Gerinne zuerst, Planum danach) sieht das Gerinne nur das Ur-Gelände.
        const umgekehrt = lauf(standAus(P, G, anzeige([{ ableitung: idVon(G) }, { ableitung: idVon(P) }])));
        await umgekehrt.baue(teil(G, 'aushub').globalId);
        expect(umgekehrt.ableitungen.get(idVon(G)).kennzahlen.aushubRaster).toBeCloseTo(ohne, 6);
    });

    it('ohne Anzeige gilt die Stand-Reihenfolge; die Anzeige ordnet, was sie kennt', async () => {
        const A = vorgang([GERINNE], 'Ur'), B = vorgang([PLANUM], 'Ur'), C = vorgang([KREUZT], 'Ur');
        expect(lauf(standAus(B, A)).stapelVon('DGM1')).toEqual([idVon(B), idVon(A)]);
        const Z = anzeige([{ ableitung: idVon(C) }]);              // nur C geordnet, A und B folgen nach Stand
        expect(lauf(standAus(A, B, C, Z)).stapelVon('DGM1')).toEqual([idVon(C), idVon(A), idVon(B)]);
    });
});

describe('Alt-Journale (vor Stufe 1) landen im selben Stapel', () => {
    it('urGelaendeVon folgt der Kette dgm → dgm bis zum gelieferten Gelände', () => {
        const stand = new Map([
            ['cde-dgm1', { rezept: 'erdbau', rolle: 'dgm', ableitung: 'ab-1', parameter: { quellen: { gelaende: 'DGM1' } } }],
            ['cde-dgm2', { rezept: 'bauwerksgrube', rolle: 'dgm', ableitung: 'ab-2', parameter: { quellen: { gelaende: 'cde-dgm1' } } }],
            ['cde-cut', { rezept: 'erdbau', rolle: 'aushub', ableitung: 'ab-1', parameter: { quellen: { gelaende: 'DGM1' } } }],
            ['cde-alt', { rezept: 'gelaende', parameter: { quelle: 'DGM1', operationen: [] } }],
        ]);
        expect(urGelaendeVon(stand, 'cde-dgm2', { rezeptNach })).toBe('DGM1');
        expect(urGelaendeVon(stand, 'cde-alt', { rezeptNach })).toBe('DGM1');
        expect(urGelaendeVon(stand, 'cde-cut', { rezeptNach })).toBe('cde-cut');   // ein Cut ist keine Anzeigeform
        expect(urGelaendeVon(stand, 'DGM1', { rezeptNach })).toBe('DGM1');
    });

    it('eine Alt-Kette (Vorgang auf dem dgm-Teil des vorigen) baut wie zuvor — und liegt im Stapel des Ur-Geländes', async () => {
        // Alt-Journal: A mit dgm-Teil (so schrieb Stufe 0 ihn), B auf A.dgm
        const A = vorgang([GERINNE], 'Ur');
        const dgmA = { art: 'erzeugt', globalId: 'cde-alt-dgm', modell: 'cde',
                       nachher: { ...A[0].nachher, rolle: 'dgm', kategorie: 'IFCGEOGRAPHICELEMENT', bauform: 'hoehenfeld', predefinedType: 'TERRAIN', name: 'Ur (geformt)' } };
        const B = ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'cde-alt-dgm' }, raster: { cell: 1 }, operationen: [PLANUM], name: 'Ur (geformt)' });
        const l = lauf(standAus(A, [dgmA], B));
        expect(l.stapelVon('DGM1')).toEqual([idVon(A), idVon(B)]);
        const rd = await l.baue('cde-alt-dgm');                 // der alte dgm-Teil baut weiter
        expect(rd.ok && rd.teil.form === 'raster').toBe(true);
        const rb = await l.baue(teil(B, 'aushub').globalId);
        expect(rb.ok).toBe(true);
        const kA = l.ableitungen.get(idVon(A)).kennzahlen, kB = l.ableitungen.get(idVon(B)).kennzahlen;
        expect(kA.aushubRaster).toBeGreaterThan(10);
        expect(kB.aushubRaster).toBeGreaterThan(0);       // das Planum (598,5 → 298,5) ist ein Abtrag
        expect(kB.reihe).toBe(1);
    });
});
