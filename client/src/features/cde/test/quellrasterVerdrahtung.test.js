// @vitest-environment jsdom
/**
 * Die Quellraster-Brücke, am ECHTEN Methodenkörper (Teil XIV, Stufe 0).
 *
 * `IfcEngine._quellrasterVon` stand seit Stufe 15 auf einem Fehler, den
 * kein Test sah: `karteMitEngine` liefert den UMSCHLAG {karte, fehlend},
 * die Methode rief `.get` auf dem Umschlag — TypeError, immer. Damit warf
 * jeder Gelände-Neuaufbau nach F5 und jeder Erdmassen-Auszug. Der
 * bestehende Test (gelaendeFormen) prüfte `baueMitAbleitung` mit einer
 * Raster-Attrappe und kam an dieser Stelle nie vorbei — die Lehre aus
 * 17.3: Attrappen einer Methode, die es so nicht gibt, lügen grün.
 *
 * Deshalb hier `IfcEngine.prototype…call(attrappe)`: die Engine-Attrappe
 * hat die FORM der Wirklichkeit (FragmentsManager.list mit
 * `getLocalIdsByGuids`, ein Resolver mit `forElements().getForm('mesh')`),
 * der Methodenkörper ist der echte.
 */
import { describe, expect, it } from 'vitest';
import { IfcEngine } from '../services/IfcEngine.js';
import { gleicherBezug } from '../services/gelaende/Operationen.js';

/** Ein geneigtes Gelände 20 × 20 m als Dreiecksliste (Float64, 9 je Δ). */
function gelaendeDreiecke() {
    const h = (x, z) => 300 + 0.05 * x - 0.02 * z;
    const tris = [];
    for (let x = 0; x < 20; x++) {
        for (let z = 0; z < 20; z++) {
            const a = [x, h(x, z), z], b = [x + 1, h(x + 1, z), z];
            const c = [x + 1, h(x + 1, z + 1), z + 1], d = [x, h(x, z + 1), z + 1];
            tris.push(...a, ...b, ...c, ...a, ...c, ...d);
        }
    }
    return { positions: new Float64Array(tris), triCount: tris.length / 9 };
}

function engineAttrappe() {
    const mesh = gelaendeDreiecke();
    // Auf dem ECHTEN Prototyp, ohne Konstruktor: `erdmassen` ruft
    // `this._quellrasterVon`, das ruft `this._quellFormVon` — die Kette
    // soll die echte sein, nur die Quellen sind Attrappen.
    return Object.assign(Object.create(IfcEngine.prototype), {
        components: {
            get: () => ({
                list: new Map([['m1', {
                    modelId: 'm1',
                    getLocalIdsByGuids: async (guids) => guids.map(g => (g === 'DGM1' ? 7 : null)),
                }]]),
            }),
        },
        makeGeometryResolver: () => ({
            forElements: (els) => ({
                getForm: async (form) => (form === 'mesh' && els[0]?.localId === 7
                    ? { data: mesh } : { data: null }),
            }),
        }),
    });
}

describe('IfcEngine._quellFormVon (echter Methodenkörper)', () => {
    it('liefert das Raster eines gelieferten Geländes — der Umschlag wird richtig zerlegt', async () => {
        const dieses = engineAttrappe();
        const raster = await IfcEngine.prototype._quellFormVon.call(dieses, 'DGM1', 'raster', { cell: 1 });
        expect(raster).toBeTruthy();
        expect(raster.cell).toBe(1);
        expect(raster.nx).toBeGreaterThan(10);
        // Eine Zelle mitten im Gelände trägt die geneigte Höhe.
        const mitte = raster.heights[Math.floor(raster.nx / 2) * raster.nz + Math.floor(raster.nz / 2)];
        expect(mitte).toBeGreaterThan(299);
        expect(mitte).toBeLessThan(302);
    });

    it('`cell` wird durchgereicht: zwei Aufrufe mit derselben Zellweite haben EINEN Bezug', async () => {
        const dieses = engineAttrappe();
        const a = await IfcEngine.prototype._quellFormVon.call(dieses, 'DGM1', 'raster', { cell: 0.5 });
        const b = await IfcEngine.prototype._quellrasterVon.call(dieses, 'DGM1', { cell: 0.5 });
        expect(gleicherBezug(a, b)).toBe(true);
        expect(a.cell).toBe(0.5);
    });

    it('unbekannte GlobalId → null, kein Wurf', async () => {
        const dieses = engineAttrappe();
        expect(await IfcEngine.prototype._quellFormVon.call(dieses, 'GIBTSNICHT', 'raster', {})).toBeNull();
    });

    it('die Form `mesh` gibt die Dreiecke selbst heraus', async () => {
        const dieses = engineAttrappe();
        const m = await IfcEngine.prototype._quellFormVon.call(dieses, 'DGM1', 'mesh');
        expect(m.triCount).toBe(800);
        expect(m.positions).toBeInstanceOf(Float64Array);
    });
});

describe('IfcEngine.erdmassen (echter Methodenkörper)', () => {
    it('rechnet Aushub statt „Quellraster nicht ableitbar" zu melden', async () => {
        const dieses = engineAttrappe();
        const zeilen = await IfcEngine.prototype.erdmassen.call(dieses, [{
            rezept: 'gelaende', name: 'Planum-Probe',
            parameter: {
                quelle: 'DGM1',
                raster: { cell: 1 },
                operationen: [{ art: 'planum', parameter: {
                    umriss: [{ x: 5, z: 5 }, { x: 15, z: 5 }, { x: 15, z: 15 }, { x: 5, z: 15 }],
                    hoehe: 298,
                } }],
            },
        }]);
        expect(zeilen).toHaveLength(1);
        expect(zeilen[0].grund).toBeUndefined();
        // 10 × 10 m auf 298 m unter einem Gelände bei ~300 m: rund 200 m³ Aushub.
        expect(zeilen[0].aushub).toBeGreaterThan(120);
        expect(zeilen[0].aushub).toBeLessThan(300);
        expect(zeilen[0].auftrag).toBe(0);
    });
});
