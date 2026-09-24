// @vitest-environment jsdom
/**
 * Die Geländeanzeige ist VON OBEN zu sehen (Tragfähig, T7, 2026-09-24).
 *
 * Gemessen im Browser: nach „Ausheben → Anwenden" stand über das ganze
 * Gelände der Hintergrund (32,41,50) statt (110,108,102); nur das Gitter
 * blieb. Die Anzeige war da (der Fang traf sie, y 0,711) — ihre Dreiecke sind
 * nach unten gewickelt (`Anzeigenetz._oberflaeche`, „Umlauf der
 * Rasteranzeige"), das Material war einseitig. `side = DoubleSide` im
 * laufenden Bild: sofort wieder (111,109,103).
 *
 * REGEL UND KUR MESSEN DIESELBE GRÖSSE: der Anteil der Anzeige-Dreiecke, die
 * eine Kamera von oben zeichnet — mit dem Material, das der Eigenbau wirklich
 * baut, und den Dreiecken, die das Anzeige-Rezept wirklich liefert.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { heightfieldRaster } from '../services/geometrie/SurfaceOps.js';
import { formeNach } from '../services/gelaende/Operationen.js';
import { anzeigeNetz } from '../services/gelaende/Anzeigenetz.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { ABLEITUNGEN } from '../services/ableitung/Ableitungen.js';

function tin({ n = 10, a = 8 } = {}) {
    const h = (i, j) => 300 + 0.05 * i * a + 1.2 * Math.sin(i * 1.7) * Math.cos(j * 1.3);
    const t = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const p = (ii, jj) => [ii * a, h(ii, jj), jj * a];
        const [p00, p10, p11, p01] = [p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1)];
        // Nach OBEN gewickelt, wie eine Lieferung (ny > 0).
        t.push(...p00, ...p01, ...p10, ...p10, ...p01, ...p11);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}

const GRUBE = { art: 'grube', parameter: {
    umriss: [{ x: 20, z: 20 }, { x: 50, z: 22 }, { x: 48, z: 50 }, { x: 22, z: 48 }].map(p => ({ ...p, y: 306 })),
    sohle: 301.5, neigung: 1.5 } };

/** Anteil der Dreiecke, die eine Kamera senkrecht von oben zeichnet. */
function vonObenSichtbar({ positions: P, triCount }, material) {
    if (material.side === THREE.DoubleSide) return 1;
    let oben = 0;
    for (let t = 0; t < triCount; t++) {
        const o = t * 9;
        const ux = P[o + 3] - P[o], uz = P[o + 5] - P[o + 2];
        const vx = P[o + 6] - P[o], vz = P[o + 8] - P[o + 2];
        const ny = uz * vx - ux * vz;                       // (u × v).y
        // three: Vorderseite = gegen den Uhrzeigersinn vom Betrachter → Normale zeigt zu ihm.
        if ((material.side === THREE.BackSide ? -ny : ny) > 0) oben++;
    }
    return oben / triCount;
}

/** Das Material, das der Editor bekommt — derselbe Weg wie `_elementAuftrag`. */
function eigenbauMaterial(kategorie) {
    const autor = new IfcAutor({ getFragments: () => null });
    return autor._fuerEditor(autor._materialFuer(kategorie));
}

describe('Die Geländeanzeige ist von oben zu sehen', () => {
    const ur = heightfieldRaster(tin().positions, tin().triCount, 2);
    const stand = formeNach(ur, [GRUBE], { ur }).raster;
    const netz = anzeigeNetz({ urNetz: tin(), flaechen: [{ raster: stand, ur }] });

    it('das Anzeigenetz ist nach unten gewickelt (so gebaut, kein Fehler) …', () => {
        expect(netz.triCount).toBeGreaterThan(100);
        expect(vonObenSichtbar(netz, new THREE.MeshLambertMaterial())).toBe(0);
    });
    it('… deshalb trägt sein Material beide Seiten: 100 % der Dreiecke von oben (vorher 0 %)', () => {
        const m = eigenbauMaterial('IFCGEOGRAPHICELEMENT');
        expect(m.side).toBe(THREE.DoubleSide);
        expect(vonObenSichtbar(netz, m)).toBe(1);
    });
    it('Körper bleiben einseitig — nur der Geländeton ist zweiseitig', () => {
        expect(eigenbauMaterial('IFCEARTHWORKSCUT').side).toBe(THREE.FrontSide);
        expect(eigenbauMaterial('IFCEARTHWORKSFILL').side).toBe(THREE.FrontSide);
        expect(eigenbauMaterial('IFCEARTHWORKSELEMENT').side).toBe(THREE.DoubleSide);   // Ton des Geländes
    });
});

describe('Die Lieferung nicht lesbar: gesagt, nicht still aufs Raster (T7)', () => {
    it('`urNetz` wirft → Warnung anzeige_raster mit Grund, Anzeige als Raster', async () => {
        const ur = heightfieldRaster(tin().positions, tin().triCount, 2);
        const r = await ABLEITUNGEN.anzeige.leite({}, { gelaende: ur },
            { stapel: { urRaster: ur, opsVor: [], urNetz: async () => { throw new Error('Worker weg'); } } });
        expect(r.kennzahlen.anzeigeArt).toBe('raster');
        expect(r.warnungen).toContain('anzeige_raster: die Lieferung war nicht lesbar (Worker weg) — angezeigt als Raster');
    });
    it('gelingt es, gibt es keine solche Warnung und die Anzeige ist das Netz', async () => {
        const ur = heightfieldRaster(tin().positions, tin().triCount, 2);
        const r = await ABLEITUNGEN.anzeige.leite({}, { gelaende: ur }, { stapel: { urRaster: ur, opsVor: [], urNetz: async () => tin() } });
        expect(r.kennzahlen.anzeigeArt).toBe('netz');
        expect(r.warnungen.filter(w => /nicht lesbar/.test(w))).toEqual([]);
    });
});
