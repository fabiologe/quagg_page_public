// @vitest-environment jsdom
/**
 * Schicht auf Schicht (Teil XXIX, nach G8 — Fabio: „wie in der Realität wäre das ja ein eigenes Aushub- oder
 * Auftrag-Ding mit Volumen, es sollte halt auch eine Höhe haben, z. B. 0,01 m für die Dichtungsbahn").
 *
 * Jede Schicht ist ein Körper mit ihrer Dicke; eine Schicht, die AUF einer anderen liegt (`auf`), sieht als Gelände
 * deren Oberkante — ein Verweis, er wandert mit. Gemessen wird, was im Bild und im Volumen zählt: die FUGE zwischen
 * zwei Schichten (Oberkante der unteren gegen Unterkante der oberen, je gemeinsamer Ecke) muss 0 sein — kein Spalt,
 * keine Überschneidung, kein Flimmern.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { schicht, rasterAngehoben } from '../services/geometrie/ops/Schicht.js';
import { diagonale00_11 } from '../services/geometrie/SurfaceOps.js';
import { unterlageVon } from '../services/ableitung/Ableitungen.js';
import { kandidatenAus } from '../services/kommando/Kandidaten.js';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { Speicher } from './hilfen/vorlagenKommandos.js';
import { p11Kommandos } from './hilfen/p11Kommandos.js';

beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
afterEach(() => repo.setBackend(null));

function raster(n, cell, hoehe) {
    const heights = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) heights[i * n + j] = hoehe(i * cell, j * cell);
    return { x0: 0, z0: 0, cell, nx: n, nz: n, maxX: (n - 1) * cell, maxZ: (n - 1) * cell, heights };
}
/** Je Ecke (x, z): tiefste und höchste Höhe des Körpers. */
function spanne(koerper) {
    const p = koerper.positions, m = new Map();
    for (let k = 0; k < p.length; k += 3) {
        const key = `${Math.round(p[k] * 1e6)}|${Math.round(p[k + 2] * 1e6)}`;
        const e = m.get(key) ?? [Infinity, -Infinity];
        m.set(key, [Math.min(e[0], p[k + 1]), Math.max(e[1], p[k + 1])]);
    }
    return m;
}
function fuge(unten, oben) {
    const a = spanne(unten), b = spanne(oben);
    let n = 0, max = 0;
    for (const [k, [, top]] of a) { const e = b.get(k); if (e) { n++; max = Math.max(max, Math.abs(e[0] - top)); } }
    return { n, max };
}
/**
 * Die Fuge FLÄCHIG: die Oberkante der unteren Schicht im SCHWERPUNKT jedes Dreiecks der Unterkante der oberen —
 * mitten in der Zelle, wo zwei verschiedene Diagonalen verschiedene Flächen ergäben. Gemeinsame Ecken allein sehen das
 * nicht: auf Knoten und Zellkanten stimmen zwei Triangulierungen immer überein.
 */
function flaeche(koerper, seite) {
    const sp = spanne(koerper), p = koerper.positions, tri = [];
    const key = (x, z) => `${Math.round(x * 1e6)}|${Math.round(z * 1e6)}`;
    for (let k = 0; k < p.length; k += 9) {
        const v = [0, 3, 6].map(o => [p[k + o], p[k + o + 1], p[k + o + 2]]);
        const d = (v[1][0] - v[0][0]) * (v[2][2] - v[0][2]) - (v[2][0] - v[0][0]) * (v[1][2] - v[0][2]);
        if (Math.abs(d) > 1e-12 && v.every(([x, y, z]) => y === sp.get(key(x, z))[seite])) tri.push(v);
    }
    return tri;
}
function fugeFlaechig(unten, oben) {
    const tri = flaeche(unten, 1);
    const hoeheAn = (x, z) => {
        for (const [a, b, c] of tri) {
            const d = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]);
            const u = ((x - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (z - a[2])) / d;
            const w = ((b[0] - a[0]) * (z - a[2]) - (x - a[0]) * (b[2] - a[2])) / d;
            if (u >= -1e-12 && w >= -1e-12 && u + w <= 1 + 1e-12) return a[1] + u * (b[1] - a[1]) + w * (c[1] - a[1]);
        }
        return null;
    };
    let n = 0, max = 0;
    for (const [a, b, c] of flaeche(oben, 0)) {
        const x = (a[0] + b[0] + c[0]) / 3, z = (a[2] + b[2] + c[2]) / 3, y = (a[1] + b[1] + c[1]) / 3;
        const yu = hoeheAn(x, z);
        if (yu === null) continue;
        n++; max = Math.max(max, Math.abs(y - yu));
    }
    return { n, max };
}

describe('Schicht auf Schicht — die Fuge ist null', () => {
    it('auf rauem Gelände, senkrecht zur Fläche: Oberkante der unteren = Unterkante der oberen, an jeder Ecke', () => {
        let s = 7;
        const zufall = () => ((s = (s * 16807) % 2147483647) / 2147483647);
        const r = raster(30, 0.5, (x, z) => 100 + 0.4 * Math.sin(x) + 0.3 * Math.cos(1.7 * z) + 0.25 * zufall());
        const umriss = [{ x: 1.3, z: 1.1 }, { x: 13.2, z: 1.7 }, { x: 12.4, z: 13.6 }, { x: 2.1, z: 12.2 }];
        const a = schicht({ raster: r }, { umriss, dicke: 0.3, richtung: 'normal' }).ergebnis;
        const b = schicht({ raster: rasterAngehoben(r, 0.3, 'normal') }, { umriss, dicke: 0.2, richtung: 'normal' }).ergebnis;
        const c = schicht({ raster: rasterAngehoben(rasterAngehoben(r, 0.3, 'normal'), 0.2, 'normal') }, { umriss, dicke: 0.4, richtung: 'lot' }).ergebnis;
        expect([a.closed, b.closed, c.closed]).toEqual([true, true, true]);
        const ab = fuge(a, b), bc = fuge(b, c);
        expect(ab.n).toBeGreaterThan(500);
        expect([ab.max, bc.max]).toEqual([0, 0]);
        const abF = fugeFlaechig(a, b), bcF = fugeFlaechig(b, c);
        expect(abF.n).toBeGreaterThan(500);
        expect(Math.max(abF.max, bcF.max)).toBeLessThan(1e-9);
        // Die Probe ist empfindlich: ohne geerbte Triangulierung kippte das Anheben Diagonalen.
        const ohneErbe = { ...rasterAngehoben(r, 0.3, 'normal'), diagonalen: undefined };
        let gekippt = 0;
        for (let ix = 0; ix < 29; ix++) for (let iz = 0; iz < 29; iz++) if (diagonale00_11(r, ix, iz) !== diagonale00_11(ohneErbe, ix, iz)) gekippt++;
        expect(gekippt).toBeGreaterThan(0);
    });

    it('von Hand: auf einer Böschung 1 : 3 hebt „senkrecht" um d·√10/3, in einem Tal um die steilere Seite', () => {
        const hang = raster(9, 1, (x) => 100 + x / 3);
        const h = rasterAngehoben(hang, 0.6, 'normal');
        for (let i = 0; i < h.heights.length; i++) expect(h.heights[i] - hang.heights[i]).toBeCloseTo(0.6 * Math.sqrt(10) / 3, 9);   // Randknoten 1e-9 eingerückt
        // Tal: Sohle flach bis x = 4, dann Böschung 1 : 3 — der Knoten AUF der Talkante nimmt die steilere Ebene
        // (genaue Versatzfläche: der Schnitt beider versetzter Ebenen liegt dort, wo die Böschungsebene höher ist).
        const tal = raster(9, 1, (x) => 100 + Math.max(0, x - 4) / 3);
        const t = rasterAngehoben(tal, 0.6, 'normal');
        const k = (i, j) => i * 9 + j;
        expect(t.heights[k(4, 4)] - tal.heights[k(4, 4)]).toBeCloseTo(0.6 * Math.sqrt(10) / 3, 9);
        expect(t.heights[k(1, 4)] - tal.heights[k(1, 4)]).toBeCloseTo(0.6, 9);
        // Lotrecht: überall genau d.
        const lot = rasterAngehoben(tal, 0.6, 'lot');
        expect(Math.max(...lot.heights.map((y, i) => Math.abs(y - tal.heights[i] - 0.6)))).toBeLessThan(1e-12);
    });
});

describe('die Kette „liegt auf"', () => {
    const plan = (auf, dicke = 0.1, abstand = 0, richtung = 'normal') => ({ rezept: 'gelaendeschicht',
        parameter: { operationen: [{ art: 'gelaendeschicht', parameter: { umriss: [], dicke, abstand, richtung, ...(auf ? { auf } : {}) } }] } });

    it('von unten nach oben, je Glied Abstand + Dicke und Richtung', () => {
        const stand = new Map([['A', plan(null, 0.5)], ['B', plan('A', 0.01)], ['C', plan('B', 0.3, 0.02, 'lot')]]);
        expect(unterlageVon(plan('C').parameter, (g) => stand.get(g))).toEqual({
            glieder: [{ gid: 'A', hoehe: 0.5, richtung: 'normal' }, { gid: 'B', hoehe: 0.01, richtung: 'normal' }, { gid: 'C', hoehe: 0.32, richtung: 'lot' }],
            grund: null,
        });
        expect(unterlageVon(plan(null).parameter, (g) => stand.get(g))).toBeNull();
    });

    it('ein Kreis und ein fehlendes Ziel brechen die Kette mit Grund — nie still', () => {
        const kreis = new Map([['A', plan('B')], ['B', plan('A')]]);
        expect(unterlageVon(plan('A').parameter, (g) => kreis.get(g)).grund).toMatch(/Kreis/);
        expect(unterlageVon(plan('X').parameter, () => null)).toEqual({ glieder: [], grund: 'X ist keine Schicht auf dem Gelände (gelöscht?)' });
    });
});

describe('Werkzeug und Kandidaten', () => {
    it('„Liegt auf" nennt die Schichten — nie sich selbst und nichts, das auf ihr liegt; eine erfundene wird abgelehnt', async () => {
        const b = useBearbeitung(), ae = useAenderungen();
        const URS = { modelId: 'm1', localId: 1, globalId: 'UR', name: 'Urgelände', category: 'IFCGEOGRAPHICELEMENT', hoehenversatz: 0,
                      quellmass: { pruefmass: { triCount: 4900, spanX: 140, spanY: 0, spanZ: 140 }, cell: 2 } };
        const { kommandos } = p11Kommandos();
        let i = 0;
        const opts = { subjektVon: (g) => (g === 'UR' ? URS : null), kennungsgeber: (a) => (a === 'operation' ? `op-s${++i}` : `cde-s${++i}`) };
        for (const kom of kommandos.slice(0, 7)) expect((await b.fuehreAus(kom, opts)).ausgefuehrt, kom.id).toBe(true);
        const k = kandidatenAus({ wirksamerStand: ae.wirksamerStand });
        expect(k('eigene:schicht', null).map(x => x.id)).toEqual(['cde-T5', 'cde-T6', 'cde-T7', 'cde-T8']);
        // T6 selbst nicht, T7 (liegt auf T6) nicht, T8 (liegt auf T7, also auf T6) auch nicht.
        expect(k('eigene:schicht', { globalId: 'cde-T6' }).map(x => x.id)).toEqual(['cde-T5']);
        const vlies = kommandos.find(x => x.neu?.[0] === 'cde-T6');
        const r = await b.fuehreAus({ ...vlies, id: 'p11-falsch', neu: ['cde-falsch', 'op-falsch'], werte: { ...vlies.werte, auf: 'cde-GIBTSNICHT' } }, opts);
        expect(r.ausgefuehrt).toBe(false);
    }, 60000);
});
