/**
 * Das Gelände bleibt, wo nicht editiert wird (Teil XXII, 2026-09-18).
 *
 * Fabio: „das Bearbeitungsgelände verschiebt sich an Stellen, wo keine
 * Editierung stattfindet". Gemessen vorher am Testgelände R02 mit seinen vier
 * Operationen: fern jeder Bearbeitung bis 48 cm neben der Lieferung, im
 * Flicken, aber unberührt, bis 13 cm — die Anzeige war überall ein Raster.
 *
 * Gemessen wird hier an DERSELBEN Grösse wie im Bild: an der gezeichneten
 * Fläche (Dreiecke → Sampler), gegen die Lieferung (ihr Sampler) — und die
 * Naht an der Grundfläche (dicht, ohne Doppelung) und am Auswahl-Umriss
 * (konform: kein T-Stoss liest sich als Rand).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { heightfieldRaster, hoeheImRaster } from '../services/geometrie/SurfaceOps.js';
import { makeHeightSampler } from '../services/geometrie/HeightSampler.js';
import { formeNach, wirkbereichVon } from '../services/gelaende/Operationen.js';
import { anzeigeFlicken } from '../services/gelaende/Flicken.js';
import { anzeigeNetz } from '../services/gelaende/Anzeigenetz.js';
import { umrissAusNetz } from '../services/GelaendeKanten.js';
import { ERDBAU_ZELLBUDGET, ERDBAU_ZELLE } from '../services/ableitung/Ableitungen.js';

/**
 * Ein TIN mit echten Knicken: 8-m-Dreiecke, Diagonalen im Wechsel, Höhen mit
 * Buckeln — so schneidet ein 2-m-Raster die Knicke ab wie am Testgelände.
 */
function tin({ n = 12, a = 8 } = {}) {
    const h = (i, j) => 300 + 0.05 * i * a + 1.2 * Math.sin(i * 1.7) * Math.cos(j * 1.3) + ((i * 7 + j * 3) % 5) * 0.15;
    const t = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const p = (ii, jj) => [ii * a, h(ii, jj), jj * a];
        const [p00, p10, p11, p01] = [p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1)];
        if ((i + j) % 2) t.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
        else t.push(...p00, ...p10, ...p01, ...p10, ...p11, ...p01);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}

const flaeche = ({ positions: P, triCount }) => {
    let s = 0;
    for (let t = 0; t < triCount; t++) {
        const o = t * 9;
        s += Math.abs((P[o + 3] - P[o]) * (P[o + 8] - P[o + 2]) - (P[o + 6] - P[o]) * (P[o + 5] - P[o + 2])) / 2;
    }
    return s;
};
const laenge = (strecken) => {
    let s = 0;
    for (let i = 0; i < strecken.length; i += 6) {
        s += Math.hypot(strecken[i + 3] - strecken[i], strecken[i + 4] - strecken[i + 1], strecken[i + 5] - strecken[i + 2]);
    }
    return s;
};

/** Der Weg des Anzeige-Rezepts, mit denselben Funktionen und Zahlen. */
async function anzeige(netz, ops, { cell = 2 } = {}) {
    const ur = heightfieldRaster(netz.positions, netz.triCount, cell);
    const stand = formeNach(ur, ops, { ur }).raster;
    const gitter = { x0: ur.x0, z0: ur.z0, cell: ur.cell };
    const feinesUr = async (bereich, c) => heightfieldRaster(netz.positions, netz.triCount, c, [], { bereich, gitter });
    const { flicken } = await anzeigeFlicken(ur, stand, ops,
        { zelle: ERDBAU_ZELLE, budget: ERDBAU_ZELLBUDGET, feinesUr, randAufGrob: false, rand: 1 });
    expect(flicken.every(f => f.urAusQuelle)).toBe(true);
    const flaechen = flicken.length ? flicken.map(f => ({ raster: f.raster, ur: f.ur })) : [{ raster: stand, ur }];
    return { ur, stand, flicken, netz: anzeigeNetz({ urNetz: netz, flaechen }) };
}

const GRUBE = {
    art: 'grube', parameter: {
        umriss: [{ x: 30, z: 30 }, { x: 62, z: 34 }, { x: 58, z: 62 }, { x: 33, z: 57 }].map(p => ({ ...p, y: 306 })),
        sohle: 301.5, neigung: 1.5,
    },
};

describe('Ohne Vorgang ist die Anzeige die Lieferung', () => {
    it('dieselben Dreiecke, dieselbe Fläche', () => {
        const t = tin();
        const ur = heightfieldRaster(t.positions, t.triCount, 2);
        const n = anzeigeNetz({ urNetz: t, flaechen: [{ raster: ur, ur }] });
        expect(n.triCount).toBe(t.triCount);
        expect(n.kennzahlen.zugeschnitten).toBe(0);
        expect(flaeche(n)).toBeCloseTo(flaeche(t), 9);
    });
});

describe('Mit einer Grube: nur die veränderten Zellen sind Raster', () => {
    it('ausserhalb der Aussparung = Lieferung, auf den Mikrometer — auch dicht neben dem Eingriff', async () => {
        const t = tin();
        const { netz, flicken } = await anzeige(t, [GRUBE]);
        const sT = makeHeightSampler(t.positions, t.triCount);
        const sA = makeHeightSampler(netz.positions, netz.triCount);
        const f = flicken[0];
        let fern = 0, nah = 0, maxFern = 0, maxNah = 0;
        for (let k = 0; k < 20000; k++) {
            const x = (k * 7.919) % 96, z = (k * 3.137 + k * k * 1e-4) % 96;
            const a = sA.sample(x, z), b = sT.sample(x, z);
            if (a == null || b == null) continue;
            // Unberührt heisst: in 1 m Umkreis ändert der Vorgang nichts.
            let unberuehrt = true;
            for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]]) {
                const g = hoeheImRaster(f.raster, x + dx, z + dz), u = hoeheImRaster(f.ur, x + dx, z + dz);
                if (g != null && u != null && Math.abs(g - u) > 1e-4) { unberuehrt = false; break; }
            }
            if (!unberuehrt) continue;
            const imFlicken = hoeheImRaster(f.raster, x, z) != null;
            if (imFlicken) { nah++; maxNah = Math.max(maxNah, Math.abs(a - b)); }
            else { fern++; maxFern = Math.max(maxFern, Math.abs(a - b)); }
        }
        expect(fern).toBeGreaterThan(5000);
        expect(nah).toBeGreaterThan(500);
        expect(maxFern).toBeLessThan(1e-6);
        expect(maxNah).toBeLessThan(1e-6);
    });

    it('in der Grube = das geformte Raster (dieselbe Fläche wie die Erdkörper)', async () => {
        const t = tin();
        const { netz, flicken } = await anzeige(t, [GRUBE]);
        const sA = makeHeightSampler(netz.positions, netz.triCount);
        const f = flicken[0];
        let n = 0, max = 0;
        for (let k = 0; k < 4000; k++) {
            const x = 38 + (k * 0.731) % 16, z = 40 + (k * 0.377) % 14;
            const g = hoeheImRaster(f.raster, x, z), u = hoeheImRaster(f.ur, x, z);
            if (g == null || u == null || Math.abs(g - u) < 0.5) continue;       // mitten im Eingriff
            n++; max = Math.max(max, Math.abs(sA.sample(x, z) - g));
        }
        expect(n).toBeGreaterThan(1000);
        expect(max).toBeLessThan(1e-9);
    });

    it('dicht: die Grundfläche ist die der Lieferung — kein Loch, keine Doppelung', async () => {
        const t = tin();
        const { netz } = await anzeige(t, [GRUBE]);
        expect(netz.kennzahlen.zugeschnitten).toBeGreaterThan(0);
        expect(Math.abs(flaeche(netz) - flaeche(t)) / flaeche(t)).toBeLessThan(1e-9);
        const sA = makeHeightSampler(netz.positions, netz.triCount);
        let loecher = 0;
        for (let k = 0; k < 20000; k++) {
            const x = 0.01 + (k * 7.919) % 95.98, z = 0.01 + (k * 3.137) % 95.98;
            if (sA.sample(x, z) == null) loecher++;
        }
        expect(loecher).toBe(0);
    });

    it('konform: der Auswahl-Umriss ist der Rand der Lieferung — keine Naht liest sich als Kante', async () => {
        const t = tin();
        const { netz } = await anzeige(t, [GRUBE]);
        expect(netz.kennzahlen.eingefuegt).toBeGreaterThan(0);
        expect(laenge(umrissAusNetz(netz))).toBeCloseTo(laenge(umrissAusNetz(t)), 6);
    });

    it('die Kanten sind die der Lieferung und des Rasters — nicht die Schnittlinien', async () => {
        const t = tin();
        const { netz, flicken } = await anzeige(t, [GRUBE]);
        // Jede Kante liegt auf einer Dreieckskante der Lieferung ODER in der
        // Aussparung (dort auf dem Rastergitter).
        const kantenDerLieferung = [];
        for (let i = 0; i < t.triCount; i++) {
            const o = i * 9;
            for (const [u, w] of [[0, 3], [3, 6], [6, 0]]) kantenDerLieferung.push([t.positions[o + u], t.positions[o + u + 2], t.positions[o + w], t.positions[o + w + 2]]);
        }
        const aufLieferung = (x, z) => kantenDerLieferung.some(([ax, az, bx, bz]) => {
            const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
            const s = ((x - ax) * dx + (z - az) * dz) / l2;
            return s >= -1e-9 && s <= 1 + 1e-9 && Math.abs((x - ax) * dz - (z - az) * dx) / Math.sqrt(l2) < 1e-6;
        });
        const f = flicken[0];
        const aufGitter = (v, x0, c) => Math.abs((v - x0) / c - Math.round((v - x0) / c)) < 1e-6;
        let fremd = 0;
        const K = netz.kanten;
        for (let i = 0; i < K.length; i += 6) {
            const mx = (K[i] + K[i + 3]) / 2, mz = (K[i + 2] + K[i + 5]) / 2;
            if (aufLieferung(mx, mz)) continue;
            // Rasterkante: beide Enden auf dem feinen Gitter (Ecken) oder auf einer Gitterlinie (Naht).
            const gitter = (x, z) => aufGitter(x, f.raster.x0, f.raster.cell) || aufGitter(z, f.raster.z0, f.raster.cell);
            if (gitter(K[i], K[i + 2]) && gitter(K[i + 3], K[i + 5])) continue;
            fremd++;
        }
        expect(fremd).toBe(0);
    });
});

/**
 * FABIOS FALL: das Testgelände R02 (TIN aus der Vorlage, 8-m-Raster) mit den
 * vier Operationen aus seinem Journal vom 2026-09-18 (Weltlage aus 1337,
 * nur gelesen). Die Datei liegt ausserhalb von Git — ohne sie wird übersprungen.
 */
const IFC = new URL('../../../../testdata-local/TEST-ERDKOERPER_ENQUIER.ifc', import.meta.url);
const hatIfc = (() => { try { return fs.existsSync(IFC); } catch { return false; } })();

function r02() {
    const text = fs.readFileSync(IFC, 'utf8');
    const pts = [...text.match(/IFCCARTESIANPOINTLIST3D\(\((.*?)\)\);/s)[1].matchAll(/\(([-\d.eE]+),([-\d.eE]+),([-\d.eE]+)\)/g)]
        .map(m => [+m[1], +m[2], +m[3]]);
    const idx = [...text.match(/IFCTRIANGULATEDFACESET\(#\d+,\$,\.T\.,\((.*?)\),\$/s)[1].matchAll(/\((\d+),(\d+),(\d+)\)/g)]
        .map(m => [+m[1] - 1, +m[2] - 1, +m[3] - 1]);
    // Welt wie in der CDE: Ost − Ost₀, Höhe, −(Nord − Nord₀) mit den Minima.
    const e0 = Math.min(...pts.map(p => p[0])), n0 = Math.min(...pts.map(p => p[1]));
    const positions = new Float64Array(idx.length * 9);
    idx.forEach((t, i) => t.forEach((k, j) => positions.set([pts[k][0] - e0, pts[k][2], -(pts[k][1] - n0)], i * 9 + j * 3)));
    return { positions, triCount: idx.length };
}
const FABIO = [
    { art: 'grube', parameter: { umriss: [{ x: 217.424, y: 288.97, z: -165.904 }, { x: 167.118, y: 290.314, z: -112.069 },
        { x: 167.118, y: 286.303, z: -240.148 }, { x: 230.782, y: 291.23, z: -264.163 }], sohle: 287.229, neigung: 1.5 } },
    { art: 'schuettung', parameter: { umriss: [{ x: 185.971, y: 287.215, z: -195.195 }, { x: 179.503, y: 287.014, z: -194.540 },
        { x: 179.527, y: 287.007, z: -189.070 }, { x: 185.854, y: 287.177, z: -188.795 }], ziel: 'hoehe', hoehe: 288.103, neigung: 1.5 } },
    { art: 'schuettung', parameter: { umriss: [{ x: 286.016, y: 306.133, z: -44.468 }, { x: 310.201, y: 306.889, z: -48.458 },
        { x: 309.801, y: 307.236, z: -32.042 }, { x: 281.784, y: 306.967, z: -30.122 }], ziel: 'hoehe', hoehe: 307.806, neigung: 1.5 } },
    { art: 'gerinne', parameter: { achse: [{ x: 319.429, z: -57.817 }, { x: 291.981, z: -29.045 }, { x: 275.308, z: -37.463 }],
        sohlbreite: 1, boeschung: 1.5, sohleAnfang: 305.45, sohleEnde: 306.28 } },
];

describe.skipIf(!hatIfc)('Fabios Fall am Testgelände R02', () => {
    it('fern jeder Bearbeitung und im Flicken unberührt: 0 statt 48 bzw. 13 cm', async () => {
        const t = r02();
        const { netz, ur, flicken } = await anzeige(t, FABIO);
        const sT = makeHeightSampler(t.positions, t.triCount);
        const sA = makeHeightSampler(netz.positions, netz.triCount);
        const boxen = FABIO.map(o => wirkbereichVon(ur, o.art, o.parameter));
        const weit = (x, z) => !boxen.some(b => x >= b.minX - 5 && x <= b.maxX + 5 && z >= b.minZ - 5 && z <= b.maxZ + 5);
        let nFern = 0, maxFern = 0, nNah = 0, maxNah = 0;
        for (let k = 0; k < 100000; k++) {
            const x = ur.x0 + ((k * 7.919) % 1) * 0 + ((k * 0.6180339887) % 1) * (ur.maxX - ur.x0);
            const z = ur.z0 + ((k * 0.7548776662) % 1) * (ur.maxZ - ur.z0);
            const a = sA.sample(x, z), b = sT.sample(x, z);
            if (a == null || b == null) continue;
            if (weit(x, z)) { nFern++; maxFern = Math.max(maxFern, Math.abs(a - b)); continue; }
            const f = flicken.find(g => hoeheImRaster(g.raster, x, z) != null);
            if (!f) continue;
            let unberuehrt = true;
            for (const [dx, dz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) {
                const g = hoeheImRaster(f.raster, x + dx, z + dz), u = hoeheImRaster(f.ur, x + dx, z + dz);
                if (g == null || u == null || Math.abs(g - u) > 1e-3) { unberuehrt = false; break; }
            }
            if (unberuehrt) { nNah++; maxNah = Math.max(maxNah, Math.abs(a - b)); }
        }
        expect(nFern).toBeGreaterThan(50000);
        expect(nNah).toBeGreaterThan(1000);
        expect(maxFern).toBeLessThan(1e-3);
        expect(maxNah).toBeLessThan(1e-3);
        // Und die Zahl der Dreiecke: die Lieferung plus die veränderten Zellen —
        // vorher 212 434 für dieselben vier Operationen.
        expect(netz.triCount).toBeLessThan(150000);
    });
});
