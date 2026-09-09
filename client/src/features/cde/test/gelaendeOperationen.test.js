/**
 * Geländeoperationen (Stufe 15) — die Kernprüfungen aus Teil III:
 * schneidend heisst idempotent, NaN bleibt NaN, ausserhalb des Einflusses
 * bleibt JEDER Wert unberührt, und die Eingabe wird nie mutiert.
 */
import { describe, expect, it } from 'vitest';
import {
    gerinne, planum, boeschung, formeNach, gleicherBezug, massenAus, GELAENDE_OPS,
} from '../services/gelaende/Operationen.js';
import { dreieckeAusRaster, heightfieldRaster, rasterKnoten }
    from '../services/geometry/SurfaceOps.js';

/** Ebenes Raster auf Höhe 10: 21×21 Knoten, Zelle 1 m, x/z 0…20. */
function ebene(hoehe = 10) {
    const nx = 21, nz = 21;
    return {
        x0: 0, z0: 0, maxX: 20, maxZ: 20, cell: 1, nx, nz,
        heights: new Float64Array(nx * nz).fill(hoehe),
    };
}
const idx = (r, ix, iz) => ix * r.nz + iz;

describe('Gerinne', () => {
    const params = {
        achse: [{ x: 0, z: 10 }, { x: 20, z: 10 }],
        sohlbreite: 2, boeschung: 1, sohleAnfang: 8, sohleEnde: 6,
    };

    it('senkt in der Achse auf die Sohle — linear von Anfang nach Ende', () => {
        const { raster } = gerinne(ebene(), params);
        expect(raster.heights[idx(raster, 0, 10)]).toBeCloseTo(8, 6);   // Station 0
        expect(raster.heights[idx(raster, 10, 10)]).toBeCloseTo(7, 6);  // Mitte
        expect(raster.heights[idx(raster, 20, 10)]).toBeCloseTo(6, 6);  // Ende
    });

    it('die Böschung steigt mit dem Abstand und endet am Gelände von selbst', () => {
        const { raster } = gerinne(ebene(), params);
        // Station 0 (Sohle 8), 2 m neben der Achse = 1 m neben der Sohlkante,
        // Neigung 1:1 → Ziel 9.
        expect(raster.heights[idx(raster, 0, 12)]).toBeCloseTo(9, 6);
        // 3 m neben der Achse → Ziel 10 == Gelände; ab hier unberührt.
        expect(raster.heights[idx(raster, 0, 13)]).toBeCloseTo(10, 6);
        expect(raster.heights[idx(raster, 0, 20)]).toBeCloseTo(10, 6);
    });

    it('STIRNSEITEN (B3-Nachtrag): abgeböscht steigt die Böschung auch hinter dem Ende — Trapez im Längsschnitt', () => {
        const { raster } = gerinne(ebene(), { ...params, achse: [{ x: 5, z: 10 }, { x: 15, z: 10 }] });
        // Auf der Achse hinter dem Ende (x = 16, 1 m Überstand, Sohle am Ende 6): 6 + 1 = 7
        expect(raster.heights[idx(raster, 16, 10)]).toBeCloseTo(7, 6);
        expect(raster.heights[idx(raster, 17, 10)]).toBeCloseTo(8, 6);
        expect(raster.heights[idx(raster, 19, 10)]).toBeCloseTo(10, 6);   // erreicht das Gelände
        // Vor dem Anfang (x = 4, Sohle am Anfang 8): 9
        expect(raster.heights[idx(raster, 4, 10)]).toBeCloseTo(9, 6);
        // Die Sohle ragt NICHT mehr über das Ende hinaus — genau am Ende liegt sie noch.
        expect(raster.heights[idx(raster, 15, 10)]).toBeCloseTo(6, 6);
        // Die Ecke: 1 m hinter dem Ende und 1 m neben der Sohlkante → √2 → 6 + 1,41
        expect(raster.heights[idx(raster, 16, 12)]).toBeCloseTo(6 + Math.SQRT2, 6);
    });

    it('VERBAUT (n = 0): senkrechte Wände — Rechteck im Längsschnitt, aussen unberührt', () => {
        const { raster } = gerinne(ebene(), { ...params, achse: [{ x: 5, z: 10 }, { x: 15, z: 10 }], boeschung: 0 });
        expect(raster.heights[idx(raster, 10, 10)]).toBeCloseTo(7, 6);    // in der Sohle
        expect(raster.heights[idx(raster, 10, 11)]).toBeCloseTo(7, 6);    // Sohlkante (b2 = 1)
        expect(raster.heights[idx(raster, 10, 12)]).toBeCloseTo(10, 6);   // 1 m daneben: nichts
        expect(raster.heights[idx(raster, 16, 10)]).toBeCloseTo(10, 6);   // hinter dem Ende: nichts
        expect(raster.heights[idx(raster, 4, 10)]).toBeCloseTo(10, 6);
    });

    it('schneidet NUR — liegt das Gelände schon tiefer, bleibt es', () => {
        const tief = ebene(5);                                    // unter der Sohle
        const { raster } = gerinne(tief, params);
        expect(Array.from(raster.heights)).toEqual(Array.from(tief.heights));
    });

    it('ist idempotent: zweimal angewandt ändert sich nichts mehr', () => {
        const einmal = gerinne(ebene(), params).raster;
        const zweimal = gerinne(einmal, params).raster;
        expect(Array.from(zweimal.heights)).toEqual(Array.from(einmal.heights));
    });

    it('NaN bleibt NaN — kein Loch fällt auf Höhe null', () => {
        const r = ebene();
        r.heights[idx(r, 10, 10)] = NaN;
        const { raster } = gerinne(r, params);
        expect(Number.isNaN(raster.heights[idx(raster, 10, 10)])).toBe(true);
    });

    it('meldet, wenn die Sohle feiner ist als die Zelle — statt still zu vergröbern', () => {
        const { warnungen } = gerinne(ebene(), { ...params, sohlbreite: 0.5 });
        expect(warnungen.join(' ')).toMatch(/feiner_als_zelle/);
    });

    it('mutiert die Eingabe nie', () => {
        const r = ebene();
        gerinne(r, params);
        expect(r.heights[idx(r, 10, 10)]).toBe(10);
    });
});

describe('Planum und Böschung', () => {
    const umriss = [{ x: 5, z: 5 }, { x: 15, z: 5 }, { x: 15, z: 15 }, { x: 5, z: 15 }];

    it('Planum setzt INNEN auf Sollhöhe — hebt und senkt', () => {
        const r = ebene(10);
        r.heights[idx(r, 10, 10)] = 6;                            // Senke im Feld
        const { raster } = planum(r, { umriss, hoehe: 8 });
        expect(raster.heights[idx(raster, 10, 10)]).toBe(8);      // gehoben
        expect(raster.heights[idx(raster, 7, 7)]).toBe(8);        // gesenkt
        expect(raster.heights[idx(raster, 2, 2)]).toBe(10);       // aussen unberührt
    });

    it('Böschung schliesst den Einschnitt ans Gelände an — 1:n vom Rand', () => {
        const { raster } = boeschung(ebene(10), { umriss, hoehe: 8, neigung: 1 });
        // 1 m vor dem Rand (x=4): Ziel 8+1=9; 2 m davor: 10 == Gelände.
        expect(raster.heights[idx(raster, 4, 10)]).toBeCloseTo(9, 6);
        expect(raster.heights[idx(raster, 3, 10)]).toBeCloseTo(10, 6);
        // Innen bleibt Sache des Planums:
        expect(raster.heights[idx(raster, 10, 10)]).toBe(10);
    });

    it('Böschung dammt auch AUFWÄRTS an', () => {
        const { raster } = boeschung(ebene(4), { umriss, hoehe: 8, neigung: 1 });
        expect(raster.heights[idx(raster, 4, 10)]).toBeCloseTo(7, 6);   // 8 − 1
        expect(raster.heights[idx(raster, 0, 10)]).toBeCloseTo(4, 6);   // erreicht Gelände
    });

    it('beide sind idempotent', () => {
        const p1 = planum(ebene(), { umriss, hoehe: 8 }).raster;
        expect(Array.from(planum(p1, { umriss, hoehe: 8 }).raster.heights))
            .toEqual(Array.from(p1.heights));
        const b1 = boeschung(ebene(), { umriss, hoehe: 8, neigung: 1 }).raster;
        expect(Array.from(boeschung(b1, { umriss, hoehe: 8, neigung: 1 }).raster.heights))
            .toEqual(Array.from(b1.heights));
    });
});

describe('formeNach — die Journalseite', () => {
    it('wendet die Liste in Reihenfolge an und sammelt Warnungen', () => {
        const ops = [
            { art: 'planum', parameter: { umriss: [{ x: 5, z: 5 }, { x: 15, z: 5 }, { x: 15, z: 15 }, { x: 5, z: 15 }], hoehe: 8 } },
            { art: 'gibtsnicht', parameter: {} },
        ];
        const { raster, warnungen } = formeNach(ebene(), ops);
        expect(raster.heights[10 * 21 + 10]).toBe(8);
        expect(warnungen.join(' ')).toMatch(/unbekannte_operation: gibtsnicht/);
    });

    it('jede Katalog-Operation nennt Titel und Anwendung', () => {
        for (const [art, e] of Object.entries(GELAENDE_OPS)) {
            expect(e.titel, art).toBeTruthy();
            expect(typeof e.wende, art).toBe('function');
        }
    });
});

describe('Der Rasterbezug', () => {
    it('gleicherBezug erkennt fremde Raster', () => {
        const a = ebene();
        expect(gleicherBezug(a, ebene())).toBe(true);
        expect(gleicherBezug(a, { ...ebene(), cell: 2 })).toBe(false);
        expect(gleicherBezug(a, null)).toBe(false);
    });

    it('Raster → Dreiecke → dieselbe Fläche (Rundlauf über SurfaceOps)', () => {
        // Ebenes 20×20-Feld: 400 m² — die Triangulation muss sie exakt decken.
        const { positions, triCount } = dreieckeAusRaster(ebene());
        let flaeche = 0;
        for (let i = 0; i < triCount; i++) {
            const o = i * 9;
            const ax = positions[o],     az = positions[o + 2];
            const bx = positions[o + 3], bz = positions[o + 5];
            const cx = positions[o + 6], cz = positions[o + 8];
            flaeche += Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
        }
        expect(flaeche).toBeCloseTo(400, 6);
    });

    it('heightfieldRaster und rasterKnoten reproduzieren die Randklemme', () => {
        // Ein simples Dreiecksdach als Positionsliste: 2 Dreiecke über 0…10.
        const pos = new Float64Array([
            0, 5, 0,   10, 5, 0,   10, 5, 10,
            0, 5, 0,   10, 5, 10,  0, 5, 10,
        ]);
        const r = heightfieldRaster(pos, 2, 1);
        expect(r.nx).toBeGreaterThan(2);
        const k = rasterKnoten(r, r.nx - 1, 0);
        expect(k.x).toBeLessThanOrEqual(r.maxX);           // geklemmt, nicht darüber
        expect(Number.isFinite(r.heights[(r.nx - 1) * r.nz])).toBe(true);
    });
});

describe('massenAus — der Erdmassen-Auszug', () => {
    it('ein 10×10-Planum, 2 m tiefer: 200 m³ Aushub, kein Auftrag', () => {
        const vorher = ebene(10);
        const umriss = [{ x: 5, z: 5 }, { x: 15, z: 5 }, { x: 15, z: 15 }, { x: 5, z: 15 }];
        const { raster } = planum(vorher, { umriss, hoehe: 8 });
        const m = massenAus(vorher, raster);
        // Randzellen sind nur halb/viertel betroffen (Eckmittelung) — der
        // Kern ist exakt: 10×10 Fläche × 2 m Tiefe.
        expect(m.aushub).toBeCloseTo(200, 6);
        expect(m.auftrag).toBe(0);
    });

    it('Heben zählt als Auftrag — beide Richtungen getrennt', () => {
        const vorher = ebene(10);
        const nachher = ebene(10);
        nachher.heights.fill(11, 0, 21);          // die erste Knotenspalte +1
        const m = massenAus(vorher, nachher);
        expect(m.auftrag).toBeGreaterThan(0);
        expect(m.aushub).toBe(0);
    });

    it('eine NaN-Ecke nimmt die Zelle aus dem Auszug — nie als Null gezählt', () => {
        const vorher = ebene(10);
        const nachher = ebene(8);
        nachher.heights[0] = NaN;
        const komplett = massenAus(ebene(10), ebene(8)).aushub;
        const mitLoch = massenAus(vorher, nachher).aushub;
        expect(mitLoch).toBeLessThan(komplett);
    });

    it('fremder Bezug → null, nicht 0 — eine Null wäre eine Behauptung', () => {
        expect(massenAus(ebene(10), { ...ebene(10), cell: 2 })).toBeNull();
    });
});

