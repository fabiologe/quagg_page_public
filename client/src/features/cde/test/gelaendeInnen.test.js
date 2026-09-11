/**
 * Teil XX — Ausheben, Auffüllen, Böschung AUF dem Gelände (Fabio, 2026-09-10).
 *
 * Der Test am Gelände: „Ausheben" legte die gezeichneten Ecken 2 m tiefer —
 * der Umriss war die SOHLE, die Böschung lief nach aussen. Jetzt ist der
 * Umriss die Oberkante auf dem Gelände (Grube) bzw. der Fuss (Schüttung),
 * und die Böschung läuft nach INNEN; die Böschung an einer Kante ist eine
 * offene Linie mit Seite. Die Kernzusagen wie bei jeder Geländeoperation:
 * idempotent, NaN bleibt NaN, die Eingabe unberührt, nur schneiden bzw. nur
 * füllen — und neu: der gezeichnete Rand bleibt, wo er gezeichnet wurde.
 */
import { describe, expect, it } from 'vitest';
import { grube, schuettung, boeschungLinie, formeNach, massenAus, wirkbereichVon, GELAENDE_OPS }
    from '../services/gelaende/Operationen.js';

/** Ebenes Raster: 41×41 Knoten, Zelle 1 m, x/z 0…40 — oder geneigt über `neigungX`. */
function gelaende(hoehe = 10, neigungX = 0) {
    const nx = 41, nz = 41;
    const heights = new Float64Array(nx * nz);
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) heights[ix * nz + iz] = hoehe + neigungX * ix;
    return { x0: 0, z0: 0, maxX: 40, maxZ: 40, cell: 1, nx, nz, heights };
}
const h = (r, x, z) => r.heights[x * r.nz + z];
/** Ein Quadrat von a bis b, Punkthöhen aus dem Gelände (wie der Sampler sie liefert). */
const quadrat = (a, b, hoeheAn) => [[a, a], [b, a], [b, b], [a, b]].map(([x, z]) => ({ x, y: hoeheAn(x, z), z }));

describe('Grube — Umriss = Oberkante auf dem Gelände, Böschung nach innen', () => {
    const eben = gelaende(10);
    const umriss = quadrat(10, 30, () => 10);
    const p = { umriss, sohle: 7, neigung: 1 };

    it('der gezeichnete Rand bleibt auf dem Gelände — die Böschung fällt nach innen bis zur Sohle', () => {
        const { raster } = grube(eben, p);
        expect(h(raster, 10, 20)).toBeCloseTo(10, 6);            // AUF dem Rand: unverändert (vorher 2 m tiefer)
        expect(h(raster, 11, 20)).toBeCloseTo(9, 6);             // 1 m innen, 1:1
        expect(h(raster, 12, 20)).toBeCloseTo(8, 6);
        expect(h(raster, 20, 20)).toBeCloseTo(7, 6);             // Mitte: die Sohle
        expect(h(raster, 5, 5)).toBe(10);                        // aussen: nichts
    });

    it('senkrecht (ohne Neigung) liegt die ganze Fläche innen auf der Sohle', () => {
        const { raster } = grube(eben, { ...p, neigung: null });
        expect(h(raster, 11, 11)).toBeCloseTo(7, 6);
        expect(h(raster, 9, 20)).toBe(10);
    });

    it('idempotent, schneidet nur, NaN bleibt NaN, die Eingabe bleibt unberührt', () => {
        const vorher = Float64Array.from(eben.heights);
        const einmal = grube(eben, p).raster;
        const zweimal = grube(einmal, p).raster;
        expect(Array.from(zweimal.heights)).toEqual(Array.from(einmal.heights));
        expect(Array.from(eben.heights)).toEqual(Array.from(vorher));
        const tief = gelaende(5);                                 // Gelände unter der Sohle: nichts wird aufgefüllt
        expect(Array.from(grube(tief, p).raster.heights)).toEqual(Array.from(tief.heights));
        const loch = gelaende(10); loch.heights[20 * 41 + 20] = NaN;
        expect(Number.isNaN(h(grube(loch, p).raster, 20, 20))).toBe(true);
    });

    it('am Hang: die Randhöhe kommt aus den Umrisspunkten, nicht aus dem Raster', () => {
        const hang = gelaende(10, 0.1);                            // 10 m bei x=0, 14 m bei x=40
        const u = quadrat(10, 30, (x) => 10 + 0.1 * x);            // Rand 11 … 13
        const { raster } = grube(hang, { umriss: u, sohle: 8, neigung: 2 });
        expect(h(raster, 10, 20)).toBeCloseTo(11, 6);              // Rand links bleibt
        expect(h(raster, 30, 20)).toBeCloseTo(13, 6);              // Rand rechts bleibt
        expect(h(raster, 28, 20)).toBeCloseTo(13 - 2 / 2, 6);      // 2 m innen vom hohen Rand, 1:2
        expect(h(raster, 20, 20)).toBeCloseTo(8, 6);
    });

    it('ohne Höhe je Punkt wird nicht geraten', () => {
        const r = grube(eben, { ...p, umriss: umriss.map(({ x, z }) => ({ x, z })) });
        expect(r.warnungen.join(' ')).toMatch(/grube_ohne_umriss/);
        expect(r.raster).toBe(eben);
    });
});

describe('Schüttung — Umriss = Fuss auf dem Gelände, Böschung steigt nach innen', () => {
    const eben = gelaende(10);
    const umriss = quadrat(10, 30, () => 10);

    it('bis Höhe Z: am Fuss unverändert, nach innen 1:n bis zur Zielhöhe — nur auffüllen', () => {
        const { raster } = schuettung(eben, { umriss, ziel: 'hoehe', hoehe: 12, neigung: 1 });
        expect(h(raster, 10, 20)).toBeCloseTo(10, 6);
        expect(h(raster, 11, 20)).toBeCloseTo(11, 6);
        expect(h(raster, 20, 20)).toBeCloseTo(12, 6);
        const hoch = gelaende(13);                                 // höher als das Ziel: bleibt
        expect(Array.from(schuettung(hoch, { umriss, ziel: 'hoehe', hoehe: 12, neigung: 1 }).raster.heights)).toEqual(Array.from(hoch.heights));
    });

    it('bis GOK: eine Grube wird wieder auf das Ur-Gelände verfüllt — Auftrag = Aushub', () => {
        const ops = [
            { art: 'grube', parameter: { umriss, sohle: 7, neigung: 1.5 } },
            { art: 'schuettung', parameter: { umriss, ziel: 'ur' } },
        ];
        const nurGrube = formeNach(eben, ops.slice(0, 1)).raster;
        const beide = formeNach(eben, ops).raster;
        expect(Array.from(beide.heights)).toEqual(Array.from(eben.heights));    // wie vorher
        const aus = massenAus(eben, nurGrube).aushub;
        const auf = massenAus(nurGrube, beide).auftrag;
        expect(aus).toBeGreaterThan(100);
        expect(auf).toBeCloseTo(aus, 6);
    });

    it('bis GOK auf einem gefalteten Stand braucht das Ur ausdrücklich — sonst füllt es auf sich selbst', () => {
        const grubeRaster = grube(eben, { umriss, sohle: 7, neigung: 1.5 }).raster;
        const ohne = formeNach(grubeRaster, [{ art: 'schuettung', parameter: { umriss, ziel: 'ur' } }]).raster;
        expect(Array.from(ohne.heights)).toEqual(Array.from(grubeRaster.heights));
        const mit = formeNach(grubeRaster, [{ art: 'schuettung', parameter: { umriss, ziel: 'ur' } }], { ur: eben }).raster;
        expect(Array.from(mit.heights)).toEqual(Array.from(eben.heights));
    });

    it('fremdes Raster als Ur: eine Warnung, keine Rechnung', () => {
        const r = schuettung(eben, { umriss, ziel: 'ur' }, { ur: { ...gelaende(10), cell: 2 } });
        expect(r.warnungen.join(' ')).toMatch(/schuettung_ohne_ur/);
        expect(r.raster).toBe(eben);
    });
});

describe('Böschung an einer Kante — offene Linie, eine Seite', () => {
    const eben = gelaende(10);
    // Kante von West nach Ost bei z = 20, zwei Meter über dem Gelände. „Links"
    // der Zeichenrichtung ist im Lageplan Nord — in Welt −z.
    const linie = [{ x: 10, y: 12, z: 20 }, { x: 30, y: 12, z: 20 }];

    it('läuft nur auf der gewählten Seite 1:n bis zum Gelände (Damm, weil die Kante höher liegt)', () => {
        const { raster } = boeschungLinie(eben, { linie, seite: 'links', neigung: 1 });
        expect(h(raster, 20, 20)).toBeCloseTo(12, 6);              // auf der Kante
        expect(h(raster, 20, 19)).toBeCloseTo(11, 6);              // 1 m links (Nord)
        expect(h(raster, 20, 18)).toBeCloseTo(10, 6);              // hier trifft sie das Gelände
        expect(h(raster, 20, 21)).toBe(10);                        // rechts: unberührt
    });

    it('die Enden laufen als Kegel aus — nur auf der gewählten Seite', () => {
        const { raster } = boeschungLinie(eben, { linie, seite: 'links', neigung: 1 });
        expect(h(raster, 9, 20)).toBeCloseTo(11, 6);               // 1 m vor dem Anfang, auf der Linie verlängert
        expect(h(raster, 9, 21)).toBe(10);                         // vor dem Anfang, aber rechts: unberührt
    });

    it('liegt die Kante unter dem Gelände, wird eingeschnitten — und zweimal ist wie einmal', () => {
        const tief = [{ x: 10, y: 8, z: 20 }, { x: 30, y: 8, z: 20 }];
        const einmal = boeschungLinie(eben, { linie: tief, seite: 'rechts', neigung: 1 }).raster;
        expect(h(einmal, 20, 21)).toBeCloseTo(9, 6);               // rechts (Süd, +z) 1 m: 8 + 1
        expect(h(einmal, 20, 19)).toBe(10);                        // links unberührt
        const zweimal = boeschungLinie(einmal, { linie: tief, seite: 'rechts', neigung: 1 }).raster;
        expect(Array.from(zweimal.heights)).toEqual(Array.from(einmal.heights));
    });
});

describe('Katalog und Korridor kennen die drei', () => {
    it('stehen in GELAENDE_OPS', () => {
        expect(Object.keys(GELAENDE_OPS)).toEqual(expect.arrayContaining(['grube', 'schuettung', 'boeschungLinie']));
    });

    it('Grube und Schüttung wirken nur im Umriss (+ Mindestrand), die Böschung reicht um Spanne·n hinaus', () => {
        const eben = gelaende(10);
        const w = wirkbereichVon(eben, 'grube', { umriss: quadrat(10, 30, () => 10), sohle: 7, neigung: 1 });
        expect(w).toEqual({ minX: 6, maxX: 34, minZ: 6, maxZ: 34 });
        const b = wirkbereichVon(eben, 'boeschungLinie', { linie: [{ x: 10, y: 14, z: 20 }, { x: 30, y: 14, z: 20 }], seite: 'links', neigung: 2 });
        expect(b.minZ).toBeLessThanOrEqual(20 - 4 - 4 * 2);       // 4 m Spanne · 1:2 + Mindestrand
    });

    it('formeNach rechnet die drei im Korridor genauso wie auf dem ganzen Raster', () => {
        const eben = gelaende(10, 0.05);
        const u = quadrat(10, 30, (x) => 10 + 0.05 * x);
        const ops = [
            { art: 'grube', parameter: { umriss: u, sohle: 8, neigung: 1.5 } },
            { art: 'schuettung', parameter: { umriss: quadrat(14, 26, (x) => 10 + 0.05 * x), ziel: 'hoehe', hoehe: 9, neigung: 1 } },
            { art: 'boeschungLinie', parameter: { linie: [{ x: 2, y: 12, z: 35 }, { x: 38, y: 12, z: 35 }], seite: 'rechts', neigung: 1.5 } },
        ];
        const korridor = formeNach(eben, ops);
        const ganz = formeNach(eben, ops, { ganzesRaster: true });
        expect(korridor.warnungen.join(' ')).not.toMatch(/wirkbereich_zu_klein/);
        expect(Array.from(korridor.raster.heights)).toEqual(Array.from(ganz.raster.heights));
    });
});
