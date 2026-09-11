/**
 * Feine Flicken in der Anzeige (Teil XX, 2026-09-11).
 *
 * Im Browser gemessen: die Anzeige ist ein 2-m-Raster; eine Böschungskante
 * zwischen zwei Knotenreihen verschmierte über eine Zelle — an der Linie
 * 1,3 m zu tief, links sogar aufgeschüttet. Gemessen wird hier an DERSELBEN
 * Größe wie im Browser: an der gezeichneten Fläche (Dreiecke → Sampler),
 * nicht am Raster.
 */
import { describe, expect, it } from 'vitest';
import {
    dreieckeAusRaster, dreieckeMitFlicken, flickenRaster, hoeheImRaster, rasterKnoten,
} from '../services/geometry/SurfaceOps.js';
import { makeHeightSampler } from '../services/geometry/HeightSampler.js';
import { formeNach } from '../services/gelaende/Operationen.js';
import { anzeigeFlicken } from '../services/gelaende/Flicken.js';
import { ERDBAU_ZELLBUDGET, ERDBAU_ZELLE } from '../services/ableitung/Ableitungen.js';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { ableitungsSchritte, geometrieAusTeil, rezeptNach } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';
import { umrissAusNetz } from '../services/GelaendeKanten.js';
import { wicklungVon } from '../services/geometry/SurfaceOps.js';

const OPT = { zelle: ERDBAU_ZELLE, budget: ERDBAU_ZELLBUDGET };
const welle = (x, z) => 10 + 0.3 * Math.sin(x / 7) + 0.2 * Math.cos(z / 5) + 0.02 * x;

function raster({ n = 26, cell = 2, hoehe = () => 10 } = {}) {
    const heights = new Float64Array(n * n);
    for (let ix = 0; ix < n; ix++) for (let iz = 0; iz < n; iz++) heights[ix * n + iz] = hoehe(ix * cell, iz * cell);
    return { x0: 0, z0: 0, maxX: (n - 1) * cell, maxZ: (n - 1) * cell, cell, nx: n, nz: n, heights };
}
/** Die gezeichnete Fläche — so, wie `hoeheAn` sie im Raum liest. */
const gezeichnet = ({ positions, triCount }) => {
    const s = makeHeightSampler(positions, triCount);
    return (x, z) => s.sample(x, z);
};
/** Grundfläche (x/z) eines Netzes: gleich = keine Lücke, keine Doppelung. */
function grundflaeche({ positions, triCount }) {
    let a = 0;
    for (let t = 0; t < triCount; t++) {
        const o = t * 9;
        a += Math.abs((positions[o + 3] - positions[o]) * (positions[o + 8] - positions[o + 2])
                    - (positions[o + 6] - positions[o]) * (positions[o + 5] - positions[o + 2])) / 2;
    }
    return a;
}

describe('hoeheImRaster — genau die Fläche, die dreieckeAusRaster zeichnet', () => {
    it('Punkt für Punkt wie der Sampler über den gezeichneten Dreiecken — auch am Loch', () => {
        const r = raster({ hoehe: welle });
        r.heights[5 * r.nz + 7] = NaN;                       // ein Loch: Zelle (5,7) behält ein Dreieck
        const s = gezeichnet(dreieckeAusRaster(r));
        let verglichen = 0;
        for (let i = 0; i < 500; i++) {
            const x = (i * 7.31) % 49.9, z = (i * 3.77) % 49.9;
            const a = hoeheImRaster(r, x, z), b = s(x, z);
            if (a != null && b != null) { expect(a).toBeCloseTo(b, 9); verglichen++; }
        }
        expect(verglichen).toBeGreaterThan(450);
        expect(hoeheImRaster(r, 10.2, 14.2)).toBeNull();     // die fehlende Hälfte neben dem NaN-Knoten
        expect(s(10.2, 14.2)).toBeNull();
        expect(hoeheImRaster(r, -1, 5)).toBeNull();          // ausserhalb
    });
});

describe('Ein Flicken ohne Operation ist dieselbe Fläche, nur feiner zerlegt', () => {
    it('er füllt genau die ausgelassenen Zellen (gleiche Grundfläche) und weicht höchstens um Millimeter ab', () => {
        const r = raster({ hoehe: welle });
        const box = { ix0: 5, ix1: 12, iz0: 4, iz1: 9 };
        const flicken = [{ box, raster: flickenRaster(r, box, 4) }];
        const grob = dreieckeAusRaster(r), mit = dreieckeMitFlicken(r, flicken);
        // 7 × 5 grobe Zellen fallen (je 2 Dreiecke), 28 × 20 feine kommen (je 2); die 24
        // Nachbarzellen werden Fächer aus 4 Ecken + 3 Randknoten = 7 Dreiecke statt 2.
        expect(mit.triCount).toBe(grob.triCount - 7 * 5 * 2 + 28 * 20 * 2 + 24 * (7 - 2));
        expect(grundflaeche(mit)).toBeCloseTo(grundflaeche(grob), 6);
        const a = gezeichnet(grob), b = gezeichnet(mit);
        let groesste = 0;
        for (let i = 0; i < 400; i++) {
            const x = 8 + (i * 1.37) % 18, z = 6 + (i * 0.91) % 14;
            groesste = Math.max(groesste, Math.abs(b(x, z) - a(x, z)));
        }
        // Wo eine grobe Diagonale eine feine Zelle schneidet, darf die feine
        // Zelle die andere Diagonale wählen — ein Knick weniger, Millimeter.
        expect(groesste).toBeLessThan(0.01);
    });
});

describe('Kein T-Stoss am Flickenrand (im Browser gesehen: ein Quadrat um die Grube)', () => {
    it('der Umriss des Verbunds ist nur der Rasterumfang — der Flickenrand ist innen', () => {
        const r = raster({ hoehe: welle });
        const box = { ix0: 5, ix1: 12, iz0: 4, iz1: 9 };
        const mit = dreieckeMitFlicken(r, [{ box, raster: flickenRaster(r, box, 4) }]);
        const grob = dreieckeAusRaster(r);
        expect(umrissAusNetz(grob).length / 6).toBe(2 * (25 + 25));
        expect(umrissAusNetz(mit).length / 6).toBe(2 * (25 + 25));
    });

    it('die Fächer laufen im selben Sinn wie jede Zelle — upfaces behält alle Dreiecke', () => {
        const r = raster({ hoehe: welle });
        const box = { ix0: 5, ix1: 12, iz0: 4, iz1: 9 };
        const mit = dreieckeMitFlicken(r, [{ box, raster: flickenRaster(r, box, 4) }]);
        let auf = 0, ab = 0;
        for (let t = 0; t < mit.triCount; t++) {
            const w = wicklungVon(mit.positions.subarray(t * 9, t * 9 + 9), 1);
            if (w > 0) auf++; else ab++;
        }
        expect({ auf, ab }).toEqual({ auf: 0, ab: mit.triCount });
    });
});

describe('Die Böschungskante aus dem Browser — grob verschmiert, fein an ihrem Ort', () => {
    // Eben auf 10 m, 2-m-Zellen; die Kante bei z = 11,2 (zwischen den Knotenreihen 10 und 12),
    // 2 m über dem Gelände, Böschung 1 : 1,5 nach rechts (+z).
    const r = raster();
    const ops = [{ art: 'boeschungLinie', parameter: {
        linie: [{ x: 5, y: 12, z: 11.2 }, { x: 45, y: 12, z: 11.2 }], seite: 'rechts', neigung: 1.5 } }];
    const { raster: stand } = formeNach(r, ops, { ur: r });
    const exakt = (d) => (d < 0 ? 10 : Math.max(10, 12 - d / 1.5));

    it('der Befund am alten Weg: 0,5 m rechts über 0,3 m daneben, links sogar aufgeschüttet', () => {
        const grob = gezeichnet(dreieckeAusRaster(stand));
        expect(Math.abs(grob(25, 11.7) - exakt(0.5))).toBeGreaterThan(0.3);
        expect(grob(25, 10.7) - 10).toBeGreaterThan(0.3);
    });

    it('mit Flicken: links unberührt, rechts auf 1 cm die Böschung — dieselben Stellen', () => {
        const { flicken, zelle, warnungen } = anzeigeFlicken(r, stand, ops, OPT);
        expect(warnungen).toEqual([]);
        expect(flicken).toHaveLength(1);
        expect(zelle).toBe(ERDBAU_ZELLE);
        const fein = gezeichnet(dreieckeMitFlicken(stand, flicken));
        for (const d of [-1.5, -0.5, 0.5, 1, 1.5, 2, 2.5, 4]) {
            expect(Math.abs(fein(25, 11.2 + d) - exakt(d))).toBeLessThan(0.01);
        }
    });

    it('kein Riss: der Rand des Flickens liegt exakt auf der groben Anzeige, die Grundfläche bleibt', () => {
        const { flicken } = anzeigeFlicken(r, stand, ops, OPT);
        const f = flicken[0].raster;
        const rand = [];
        for (let i = 0; i < f.nx; i++) rand.push([i, 0], [i, f.nz - 1]);
        for (let j = 0; j < f.nz; j++) rand.push([0, j], [f.nx - 1, j]);
        for (const [i, j] of rand) {
            const p = rasterKnoten(f, i, j);
            expect(f.heights[i * f.nz + j]).toBeCloseTo(hoeheImRaster(stand, p.x, p.z), 9);
        }
        expect(grundflaeche(dreieckeMitFlicken(stand, flicken))).toBeCloseTo(grundflaeche(dreieckeAusRaster(stand)), 6);
    });
});

describe('Wann es Flicken gibt', () => {
    const r = raster();
    const grube = (x0, z0) => ({ art: 'grube', parameter: {
        umriss: [{ x: x0, y: 10, z: z0 }, { x: x0 + 4, y: 10, z: z0 }, { x: x0 + 4, y: 10, z: z0 + 4 }, { x: x0, y: 10, z: z0 + 4 }],
        sohle: 8, neigung: 1 } });

    it('zwei Gruben nebeneinander: EIN Flicken; weit auseinander: zwei', () => {
        const nah = [grube(6, 6), grube(12, 6)];
        expect(anzeigeFlicken(r, formeNach(r, nah, { ur: r }).raster, nah, OPT).flicken).toHaveLength(1);
        const fern = [grube(6, 6), grube(36, 36)];
        expect(anzeigeFlicken(r, formeNach(r, fern, { ur: r }).raster, fern, OPT).flicken).toHaveLength(2);
    });

    it('über dem Budget bleibt die Anzeige grob — mit Warnung, nicht still', () => {
        const ops = [grube(6, 6)];
        const { flicken, warnungen } = anzeigeFlicken(r, formeNach(r, ops, { ur: r }).raster, ops, { ...OPT, budget: 50 });
        expect(flicken).toEqual([]);
        expect(warnungen.join()).toMatch(/anzeige_flicken_budget/);
    });

    it('ohne Operation oder mit einer Anzeige, die schon fein genug ist: keine Flicken', () => {
        expect(anzeigeFlicken(r, r, [], OPT).flicken).toEqual([]);
        const fein = raster({ cell: ERDBAU_ZELLE });
        const ops = [grube(2, 2)];
        expect(anzeigeFlicken(fein, formeNach(fein, ops, { ur: fein }).raster, ops, OPT).flicken).toEqual([]);
    });
});

describe('Über den echten Lauf: die Anzeige trägt ihren Flicken bis in die Geometrie', () => {
    it('ein Erdbau-Vorgang mit Böschungskante → Flicken, mehr Dreiecke, die Kante 0,5 m daneben auf 2 cm', async () => {
        // Muster `erdbauStapel.test.js`: geneigtes Gelände um 300 m, Höhenversatz 300 (Eingaben in NN).
        const h = (x, z) => 300 + 0.02 * x - 0.01 * z;
        const t = [];
        for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) {
            const a = [x, h(x, z), z], b = [x + 1, h(x + 1, z), z];
            const c = [x + 1, h(x + 1, z + 1), z + 1], d = [x, h(x, z + 1), z + 1];
            t.push(...a, ...b, ...c, ...a, ...c, ...d);
        }
        const netz = { positions: new Float64Array(t), triCount: t.length / 9 };
        const holeQuellForm = async (gid, form, { cell } = {}) =>
            (gid === 'DGM1' && form === 'raster' ? rasterAusMesh({ mesh: netz }, { cell: cell ?? 2 }).ergebnis : null);
        const kante = { art: 'boeschungLinie', parameter: {
            linie: [{ x: 5, y: 602, z: 17.3 }, { x: 35, y: 602, z: 17.3 }], seite: 'rechts', neigung: 1.5 } };
        const A = ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: 2 }, operationen: [kante], name: 'Ur' });
        const Z = ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 2 }, operationen: [] })
            .map(s => ({ ...s, nachher: { ...s.nachher, parameter: { ...s.nachher.parameter, vorgaenge: [{ ableitung: A[0].nachher.ableitung }] } } }));
        const l = neuerAbleitungslauf({ stand: new Map([...A, ...Z].map(s => [s.globalId, s.nachher])),
                                        rezeptNach, holeQuellForm, kernel: erzeugeKernel(), hoehenversatz: 300 });
        const r = await l.baue(Z[0].globalId);
        expect(r.ok).toBe(true);
        expect(r.teil.flicken).toHaveLength(1);
        expect(l.ableitungen.get(Z[0].nachher.ableitung).kennzahlen).toMatchObject({ flicken: 1, flickenZelle: ERDBAU_ZELLE });
        // Die Geometrie, die der Autor in den Raum stellt, IST die mit Flicken
        const geo = geometrieAusTeil(r.teil);
        const mit = dreieckeMitFlicken(r.teil.daten, r.teil.flicken);
        expect(geo.getAttribute('position').count / 3).toBe(mit.triCount);
        expect(mit.triCount).toBeGreaterThan(dreieckeAusRaster(r.teil.daten).triCount);
        // 0,5 m rechts der Kante (302 m Welt = 602 NN − 300): die Böschung, nicht der Verschmierte Knick
        expect(Math.abs(gezeichnet(mit)(20, 17.8) - (302 - 0.5 / 1.5))).toBeLessThan(0.02);
    });
});
