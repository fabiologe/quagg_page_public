/**
 * Der Aushubkörper (Teil XIV, G1) — die Gegenprobe, auf der die erste
 * Pipeline ruht: ZWEI unabhängige Wege zur Masse (Körpervolumen über den
 * Divergenzsatz, Rasterdifferenz über `massenAus`) müssen sich treffen.
 * Und der Körper muss GESCHLOSSEN sein, sonst ist das Volumen eine
 * Schätzung — inklusive der beiden Randfallen (Nullflächen, NaN-Zellen).
 */
import { describe, expect, it } from 'vitest';
import { koerperZwischenRastern, DUENN } from '../services/geometrie/ops/Koerper.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';
import { gerinne, planum, massenAus } from '../services/gelaende/Operationen.js';
import { meshVolume } from '../services/geometry/MeshOps.js';

/** Welliges, geneigtes Gelände 40 × 40 m als Dreiecke — kein Sonderfall. */
function gelaende() {
    const h = (x, z) => 300 + 0.03 * x - 0.02 * z + 0.4 * Math.sin(x / 5) * Math.cos(z / 7);
    const t = [];
    for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) {
        const a = [x, h(x, z), z], b = [x + 1, h(x + 1, z), z];
        const c = [x + 1, h(x + 1, z + 1), z + 1], d = [x, h(x, z + 1), z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}

const ur = () => rasterAusMesh({ mesh: gelaende() }, { cell: 0.5 }).ergebnis;

describe('koerperZwischenRastern', () => {
    it('Gerinne: geschlossener Körper, Volumen trifft die Rasterdifferenz auf < 2 %', () => {
        const oben = ur();
        const { raster: unten } = gerinne(oben, {
            achse: [{ x: 5, z: 20 }, { x: 35, z: 22 }],
            sohlbreite: 1.5, boeschung: 1.5, sohleAnfang: 297.5, sohleEnde: 297.0,
        });
        const { ergebnis: k, warnungen } = koerperZwischenRastern({ oben, unten });
        expect(k).toBeTruthy();
        expect(k.closed).toBe(true);
        expect(warnungen).toEqual([]);
        const m = massenAus(oben, unten);
        expect(m.aushub).toBeGreaterThan(50);
        const abweichung = Math.abs(k.volumen - m.aushub) / m.aushub;
        expect(abweichung).toBeLessThan(0.02);
        // Das Attest kommt aus demselben Massstab, den die Mengen nutzen.
        expect(meshVolume(k.positions, k.triCount).closed).toBe(true);
        expect(k.positions).toBeInstanceOf(Float64Array);
    });

    it('Argumente vertauscht = Auftragskörper (unten über oben wird zu Dicke null, nie negativ)', () => {
        const oben = ur();
        const { raster: geformt } = planum(oben, {
            umriss: [{ x: 10, z: 10 }, { x: 20, z: 10 }, { x: 20, z: 20 }, { x: 10, z: 20 }], hoehe: 305,
        });
        // Aushub: nirgends (Planum liegt über dem Gelände) → leer
        const aushub = koerperZwischenRastern({ oben, unten: geformt });
        expect(aushub.ergebnis).toBeNull();
        expect(aushub.warnungen.join(' ')).toContain('koerper_leer');
        // Auftrag: der Damm zwischen Gelände (unten) und Planum (oben)
        const auftrag = koerperZwischenRastern({ oben: geformt, unten: oben });
        expect(auftrag.ergebnis.closed).toBe(true);
        const m = massenAus(oben, geformt);
        expect(Math.abs(auftrag.ergebnis.volumen - m.auftrag) / m.auftrag).toBeLessThan(0.02);
    });

    it('NaN-Zellen im Gelände reissen keine Wände ins Nichts — der Körper bleibt geschlossen', () => {
        const oben = ur();
        const { raster: unten } = gerinne(oben, {
            achse: [{ x: 5, z: 20 }, { x: 35, z: 20 }], sohlbreite: 2, boeschung: 1, sohleAnfang: 297, sohleEnde: 297,
        });
        // Ein Loch mitten im Graben — in BEIDEN Rastern (kein Treffer bleibt kein Treffer)
        for (let ix = 30; ix < 36; ix++) for (let iz = 36; iz < 44; iz++) {
            oben.heights[ix * oben.nz + iz] = NaN;
            unten.heights[ix * unten.nz + iz] = NaN;
        }
        const { ergebnis: k } = koerperZwischenRastern({ oben, unten });
        expect(k.closed).toBe(true);
        expect(k.warnungen).toEqual([]);
    });

    it('fremder Bezug wird angeglichen und gemeldet', () => {
        const oben = ur();
        const grob = rasterAusMesh({ mesh: gelaende() }, { cell: 1 }).ergebnis;
        const { raster: unten } = planum(grob, {
            umriss: [{ x: 10, z: 10 }, { x: 20, z: 10 }, { x: 20, z: 20 }, { x: 10, z: 20 }], hoehe: 295,
        });
        const { ergebnis: k, warnungen } = koerperZwischenRastern({ oben, unten });
        expect(warnungen[0]).toContain('bezug_angeglichen');
        expect(k.closed).toBe(true);
    });

    it('der Randkeil ist DUENN dick und die Region zählt nur, was dicker als eps ist', () => {
        const oben = ur();
        const unten = { ...oben, heights: oben.heights.slice() };
        // Eine einzige Zelle 1 cm tiefer: Region = 1 Zelle (Nachbarn haben max. Dicke 0,01 an EINER Ecke → auch drin)
        unten.heights[40 * unten.nz + 40] -= 0.01;
        const { ergebnis: k } = koerperZwischenRastern({ oben, unten });
        expect(k.zellen).toBe(4);                     // die vier Zellen um den Knoten
        expect(k.closed).toBe(true);
        expect(DUENN).toBe(0.005);
    });
});
