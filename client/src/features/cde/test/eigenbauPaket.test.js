// Das Eigenbau-Paket: CDE-Welt → Landeskoordinaten → IFC-Schreiber (2026-09-10).
//
// Die Bauteile, die die CDE selbst erzeugt, hatten keinen IFC-Weg. Das Paket
// trägt sie zum Schreiber `backend/app/ifc/eigenbau.py`, der sie durch
// DASSELBE Prüftor schickt wie den Verbund der gelieferten Modelle. Hier wird
// festgehalten, was auf der Browserseite stimmen muss, damit dort nichts
// ankommt, das still falsch liegt:
//   - die Achsen: three (Y oben, Nord auf −Z) → Ost/Nord/Höhe (Z oben),
//     über DIESELBE Funktion, mit der die CDE jede Projektkoordinate rechnet;
//   - die WICKLUNG bleibt erhalten — was nach aussen zeigt, zeigt nach aussen;
//   - Ecken werden verschweisst, entartete Dreiecke gezählt, nicht verschwiegen;
//   - ein Aushub nennt seinen WIRT (sonst ist er im IFC schemawidrig).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    PAKET_VERSION, baueEigenbauPaket, bauteilFuersPaket, mitUrsprung, nachLandes, verschweisse, wirtVon,
} from '../services/EigenbauPaket.js';
import { bestimmeBezug } from '../services/Projektkoordinaten.js';
import { BAUTEILFARBEN } from '../services/Bauteilfarben.js';

/** Der Bezug, wie die CDE ihn für ein Modell ohne MapConversion bildet. */
const versatz = { x: 2577000, y: 300, z: -5465000 };
const bezug = bestimmeBezug({ georeferenz: null, versatz });

/** Ein geschlossener Kasten in der three-Welt, Wicklung nach aussen, unindiziert (wie `dreiecksGeometrie`). */
function kastenWelt(dx = 2, dy = 3, dz = 4) {
    const v = [[0, 0, 0], [dx, 0, 0], [dx, dy, 0], [0, dy, 0], [0, 0, dz], [dx, 0, dz], [dx, dy, dz], [0, dy, dz]];
    // Aussen-Wicklung in three (rechtshändig, Y oben).
    const t = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
               [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
    const pos = [];
    for (const d of t) for (const i of d) pos.push(...v[i]);
    return new Float32Array(pos);
}

/** Vorzeichenbehaftetes Volumen einer Dreiecksliste — > 0 heisst: Normalen zeigen nach aussen. */
function volumen(punkte, dreiecke) {
    let s = 0;
    for (const [a, b, c] of dreiecke) {
        const [p, q, r] = [punkte[a], punkte[b], punkte[c]];
        s += p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0]);
    }
    return s / 6;
}

describe('die Achsen', () => {
    it('Ost = x + Versatz, Nord = −(z + Versatz), Höhe = y + Versatz — über nachProjekt', () => {
        const l = nachLandes([10, 2, -30], bezug.nachProjekt);
        expect(l[0]).toBeCloseTo(2577010, 6);
        expect(l[1]).toBeCloseTo(-(-30 + versatz.z), 6);   // 5465030
        expect(l[2]).toBeCloseTo(302, 6);
    });

    it('die Wicklung bleibt erhalten: ein Körper zeigt auch im IFC nach aussen', () => {
        const pos = kastenWelt();
        // Vorher, in der Welt: positives Volumen.
        const welt = verschweisse(Float64Array.from(pos));
        expect(volumen(welt.punkte, welt.dreiecke)).toBeGreaterThan(0);
        // Nachher, in Landeskoordinaten mit Z oben: ebenso — die Drehung ist eigentlich.
        const landes = verschweisse(nachLandes(pos, bezug.nachProjekt));
        const { punkte } = mitUrsprung(landes.punkte);
        expect(volumen(punkte, landes.dreiecke)).toBeCloseTo(2 * 3 * 4, 3);
    });
});

describe('verschweissen', () => {
    it('ein unindizierter Kasten: 36 Ecken werden 8 Punkte, 12 Dreiecke', () => {
        const r = verschweisse(nachLandes(kastenWelt(), bezug.nachProjekt));
        expect(r.punkte).toHaveLength(8);
        expect(r.dreiecke).toHaveLength(12);
        expect(r.entartet).toBe(0);
    });

    it('ein vorhandener Index wird benutzt', () => {
        const ecken = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0];
        const r = verschweisse(Float64Array.from(ecken), [0, 1, 2, 0, 2, 3]);
        expect(r.punkte).toHaveLength(4);
        expect(r.dreiecke).toEqual([[0, 1, 2], [0, 2, 3]]);
    });

    it('ein Dreieck, das beim Verschweissen zur Kante wird, fällt — gezählt', () => {
        // Zwei Ecken unter einem Millimeter auseinander.
        const r = verschweisse(Float64Array.from([0, 0, 0, 0.0002, 0, 0, 1, 1, 0]));
        expect(r.dreiecke).toHaveLength(0);
        expect(r.entartet).toBe(1);
    });
});

describe('der Ursprung', () => {
    it('trägt den grossen Landeswert, die Punkte bleiben klein und auf den Millimeter', () => {
        const { ursprung, punkte } = mitUrsprung([[2577010.4567, 5465030.1, 302.9], [2577015, 5465031, 305]]);
        expect(ursprung).toEqual([2577010, 5465030, 302]);
        expect(punkte[0]).toEqual([0.457, 0.1, 0.9]);
        expect(Math.max(...punkte.flat())).toBeLessThan(10);
    });
});

describe('der Wirt eines Aushubs', () => {
    const geliefert = '1OaU$rmOTF_8XVO$FIs70b';

    it('ist das Gelände, auf dem geformt wurde', () => {
        expect(wirtVon({ parameter: { quellen: { gelaende: geliefert } } }, new Map(), new Set())).toBe(geliefert);
    });

    it('geht über ein verborgenes eigenes DGM zurück bis zum gelieferten', () => {
        const stand = new Map([['cde-dgm-alt', { parameter: { quellen: { gelaende: geliefert } } }]]);
        const plan = { parameter: { quellen: { gelaende: 'cde-dgm-alt' } } };
        expect(wirtVon(plan, stand, new Set())).toBe(geliefert);
    });

    it('bleibt beim eigenen DGM, wenn es mit exportiert wird', () => {
        const plan = { parameter: { quellen: { gelaende: 'cde-dgm' } } };
        expect(wirtVon(plan, new Map(), new Set(['cde-dgm']))).toBe('cde-dgm');
    });
});

describe('ein Bauteil fürs Paket', () => {
    const quelle = '2TestDGM000000000000ab';
    const teil = (kategorie, extra = {}) => ({
        globalId: `cde-${kategorie.toLowerCase()}`, positionen: kastenWelt(), index: null,
        kategorie, name: 'Test', geschlossen: true,
        wert: { rezept: 'erdbau', rolle: extra.rolle ?? null, ableitung: 'a1',
                parameter: { quellen: { gelaende: quelle } } },
        predefinedType: extra.pt ?? null,
    });
    const opts = { nachProjekt: bezug.nachProjekt, stand: new Map(), exportiert: new Set() };

    it('ein Aushub: Farbe und Deckkraft aus dem Katalog, und sein Wirt', () => {
        const b = bauteilFuersPaket(teil('IFCEARTHWORKSCUT', { rolle: 'aushub', pt: 'TRENCH' }), opts);
        expect(b.klasse).toBe('IFCEARTHWORKSCUT');
        expect(b.predefinedType).toBe('TRENCH');
        expect(b.farbe).toBe(BAUTEILFARBEN.IFCEARTHWORKSCUT.farbe);
        expect(b.deckkraft).toBeCloseTo(0.55);
        expect(b.wirt).toBe(quelle);
        expect(b.geschlossen).toBe(true);
    });

    it('v2: kein `ersetzt` mehr — ein Gelände-Teil vertritt nichts, und es hat keinen Wirt', () => {
        // Die Anzeigeform kommt gar nicht erst ins Paket (Stufe 2); ein Gelände,
        // das doch drin ist (Altbestand), ist ein eigenes Bauteil, kein Stellvertreter.
        const b = bauteilFuersPaket(teil('IFCGEOGRAPHICELEMENT', { rolle: 'dgm', pt: 'TERRAIN' }), opts);
        expect('ersetzt' in b).toBe(false);
        expect(b.wirt).toBeNull();
    });

    it('ein Aushub auf einem Alt-DGM (verborgen) nennt das gelieferte Ur — als Wirt UND als Quelle', () => {
        const stand = new Map([['cde-dgm-alt', { parameter: { quellen: { gelaende: quelle } } }]]);
        const t = teil('IFCEARTHWORKSCUT', { rolle: 'aushub', pt: 'TRENCH' });
        t.wert = { ...t.wert, parameter: { quellen: { gelaende: 'cde-dgm-alt' } } };
        const b = bauteilFuersPaket(t, { ...opts, stand });
        expect(b.wirt).toBe(quelle);
        expect(b.quellen.gelaende).toBe(quelle);
    });

    it('v2 trägt Vorgang, Mengen, Fachmodell und die geschnittenen Füllungen durch — aus dem Autor, nicht erfunden', () => {
        const t = {
            ...teil('IFCEARTHWORKSCUT', { rolle: 'aushub', pt: 'TRENCH' }),
            fachmodell: 'erdbau', vorgang: { ableitung: 'a1', art: 'erdbau', reihe: 1, titel: 'Ur · Gelände formen' },
            mengen: { undisturbedVolume: 12.5 }, schneidetAuffuellung: ['cde-fill-a'],
            kennzahlen: { aushubAusAuffuellung: 3.25 },
        };
        t.wert = { ...t.wert, parameter: { quellen: { gelaende: quelle, rohr: 'H1', schaechte: ['S1'] } } };
        const b = bauteilFuersPaket(t, opts);
        expect(b).toMatchObject({ fachmodell: 'erdbau', vorgang: t.vorgang, mengen: { undisturbedVolume: 12.5 },
                                  schneidetAuffuellung: ['cde-fill-a'], aushubAusAuffuellung: 3.25 });
        // Alt-Journale nennen `rohr` einzeln — im Paket ist es immer eine Liste.
        expect(b.quellen).toEqual({ gelaende: quelle, rohre: ['H1'], schaechte: ['S1'], bauteil: null });
        // Ein Fill schneidet nichts — auch wenn man es ihm anhängt.
        const f = bauteilFuersPaket({ ...t, kategorie: 'IFCEARTHWORKSFILL' }, opts);
        expect(f.schneidetAuffuellung).toEqual([]);
        expect(f.aushubAusAuffuellung).toBeNull();
        expect(f.wirt).toBeNull();
    });

    it('ein Rohr ohne Katalogfarbe bekommt keine erfundene', () => {
        const b = bauteilFuersPaket({ ...teil('IFCPIPESEGMENT'), wert: { rezept: 'rohr' } }, opts);
        expect(b.farbe).toBeNull();
        expect(b.wirt).toBeNull();
    });
});

describe('das Paket', () => {
    it('trägt Version, System und die Bauteile', () => {
        const p = baueEigenbauPaket({
            teile: [{ globalId: 'cde-r', positionen: kastenWelt(), index: null, kategorie: 'IFCPIPESEGMENT',
                      wert: { rezept: 'rohr' }, geschlossen: true }],
            nachProjekt: bezug.nachProjekt, crs: 'EPSG:31466', projektname: 'Test',
            jetzt: new Date('2026-09-10T00:00:00Z'),
        });
        expect(p.version).toBe(PAKET_VERSION);
        expect(p.crs).toBe('EPSG:31466');
        expect(p.bauteile).toHaveLength(1);
        expect(p.erzeugt).toBe('2026-09-10T00:00:00.000Z');
    });

    it('v2: Anzeigeformen stehen unter `uebersprungen`, mit Grund — Journalstand und Quelldokumente stehen darin', () => {
        const p = baueEigenbauPaket({
            teile: [], nachProjekt: bezug.nachProjekt, anzeigeformen: ['cde-anzeige'],
            quellDokumente: [{ sha256: 'a'.repeat(64), datei: 'Ur.ifc', revision: 1, globalIds: ['2Ur'] }],
            journal: { commit: 'c-1', sitzungOffen: false },
        });
        expect(p.uebersprungen).toEqual([{ cdeId: 'cde-anzeige', grund: expect.stringMatching(/Anzeigeform/) }]);
        expect(p.journal).toEqual({ commit: 'c-1', sitzungOffen: false });
        expect(p.quellDokumente[0].datei).toBe('Ur.ifc');
    });

    it('ohne nachProjekt gibt es keine Landeskoordinaten — lieber ein Fehler als Welt-Werte im IFC', () => {
        expect(() => baueEigenbauPaket({ teile: [] })).toThrow(/nachProjekt/);
    });

    it('ein Bauteil ohne Fläche wird genannt, nicht still weggelassen', () => {
        const p = baueEigenbauPaket({
            teile: [{ globalId: 'cde-leer', positionen: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]),
                      kategorie: 'IFCPIPESEGMENT', wert: {} }],
            nachProjekt: bezug.nachProjekt,
        });
        expect(p.bauteile).toHaveLength(0);
        expect(p.uebersprungen[0].cdeId).toBe('cde-leer');
    });
});

describe('Verträge über die Grenze', () => {
    const lies = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

    it('Browser und Schreiber sprechen dieselbe Paketversion', () => {
        const py = lies('../backend/app/ifc/eigenbau.py');
        expect(py).toMatch(new RegExp(`PAKET_VERSION = ${PAKET_VERSION}\\b`));
    });

    it('EIN Bauweg für Raum und Export — kein zweiter (Gesetz 7)', () => {
        const autor = lies('src/features/cde/services/IfcAutor.js');
        const raum = autor.slice(autor.indexOf('async baueErzeugte('));
        const exp = autor.slice(autor.indexOf('async eigenbauGeometrien('), autor.indexOf('async baueErzeugte('));
        expect(raum).toMatch(/this\._baueSchritt\(lauf, schritt\)/);
        expect(exp).toMatch(/this\._baueSchritt\(lauf, schritt\)/);
        // Der Export nimmt NICHT das fragments-Modell — dort liegt die Geometrie im Modellrahmen.
        expect(exp).not.toMatch(/getItemsGeometry|_getFragments/);
    });
});
