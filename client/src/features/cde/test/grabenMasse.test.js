/**
 * EINE Aushubmasse, vier Leser (Teil XXI, P6).
 *
 * Seit der Kanalgraben seinen Körper aus Querprofilen baut, ist die geltende
 * Masse nicht mehr zwangsläufig die Rastermasse. Meldung, Mengen-Reiter,
 * Eigenschaftsfenster und IFC-Qto müssen trotzdem DIESELBE Zahl zeigen —
 * sonst streitet die Oberfläche mit dem Export.
 *
 * Gemessen wird am echten Rezept, gegen die Handrechnung.
 */
import { describe, expect, it } from 'vitest';
import { ABLEITUNGEN, aushubMasseVon } from '../services/ableitung/Ableitungen.js';
import { mengenVon } from '../services/Bauteilrezepte.js';
import { mengenZeile } from '../services/Mengenzeile.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';

/** Ebenes Gelände auf 300 m — dann ist die Handrechnung exakt. */
function gelaende(cell) {
    const t = [];
    for (let x = 0; x < 60; x++) for (let z = 0; z < 40; z++) {
        const a = [x, 300, z], b = [x + 1, 300, z], c = [x + 1, 300, z + 1], d = [x, 300, z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return rasterAusMesh({ mesh: { positions: new Float64Array(t), triCount: t.length / 9 } },
                         { cell, bereich: { minX: 0, maxX: 55, minZ: 0, maxZ: 38 } }).ergebnis;
}
/** 30 m gerade Haltung, Achse = Sohle auf 297,0 → Grabensohle 296,9 (3,10 m tief). */
const ACHSE = [{ x: 10, y: 297, z: 20 }, { x: 40, y: 297, z: 20 }];
const param = (extra = {}) => ({
    quellen: { rohre: ['H1'], gelaende: 'DGM1' }, raster: { cell: 1 },
    operationen: [{ art: 'kanalgraben', parameter: {
        umfang: 'haltung', achsbezug: 'sohle', wandform: 'verbau', boden: 'nichtbindig',
        wanddickeMm: 0, breite: null, bettung: 0.1, schachtMass: 1.0, dn: 400, ...extra } }],
});
const lauf = (cell, extra = {}, schaechte = []) => ABLEITUNGEN.kanalgraben.leite(
    param(extra),
    { gelaende: gelaende(cell), rohre: [{ punkte: ACHSE, dn: 400, achsbezug: 'sohle' }], schaechte },
    { kernel: erzeugeKernel() });

describe('Der verbaute Graben — die Vorgabe, und der teuerste Irrtum', () => {
    it('die Masse folgt der Handrechnung, nicht der Zellweite', async () => {
        // Sohlbreite 1,10 m (DN 400, verbaut) · 3,10 m Tiefe · 30 m = 102,30 m³.
        for (const cell of [1, 0.5, 0.25]) {
            const k = (await lauf(cell)).kennzahlen;
            expect(k.sohlbreite, `cell ${cell}`).toBeCloseTo(1.1, 9);
            expect(k.koerperArt, `cell ${cell}`).toBe('profil');
            expect(k.aushubMasse, `cell ${cell}`).toBeCloseTo(102.3, 1);
        }
    });

    it('das Raster lag daneben — und die Kennzahl zeigt beide Wege', async () => {
        const k = (await lauf(0.5)).kennzahlen;
        expect(k.aushubRaster).toBeGreaterThan(130);         // gemessen 141,83 statt 102,30
        expect(k.aushubKoerper).toBeCloseTo(102.3, 1);
        expect(k.gegenprobeAushub).toBeGreaterThan(0.2);
        expect(k.massenQuelle).toBe('Querprofile');
    });

    it('und sagt es als Hinweis, nicht als Fehler — senkrecht kann das Raster es nicht', async () => {
        const b = (await lauf(0.5)).befunde.find(x => x.regel === 'masse_senkrecht_raster');
        expect(b).toBeTruthy();
        expect(b.schwere).toBe('hinweis');
        expect(b.text).toMatch(/Profilkörper/);
        // Die geböschte Variante hat den Streit gar nicht.
        const geboescht = (await lauf(0.5, { wandform: 'boeschung', winkelGrad: 45 })).kennzahlen;
        expect(Math.abs(geboescht.aushubKoerper / geboescht.aushubRaster - 1)).toBeLessThan(0.02);
    });
});

describe('Wo kein Profilkörper gebaut werden kann, wird es GESAGT', () => {
    it('eine Schachtbaugrube daneben durchdringt den Graben — Rasterkörper mit Begründung', async () => {
        const erg = await lauf(0.5, {}, [{ x: 40, y: 296.9, z: 20, name: 'S2', unterkante: 296.9 }]);
        const k = erg.kennzahlen;
        expect(k.koerperArt).toBe('raster');
        expect(k.aushubMasse).toBe(k.aushubRaster);
        expect(k.koerperGrund).toMatch(/durchdringen einander/);
        const b = erg.befunde.find(x => x.regel === 'masse_senkrecht_raster');
        expect(b.schwere).toBe('warnung');
        expect(b.text).toMatch(/danebenliegen/);
    });
});

describe('Dieselbe Zahl an jeder Stelle', () => {
    it('Meldung, Mengen-Reiter und IFC-Qto lesen `aushubMasseVon`', async () => {
        const erg = await lauf(0.5);
        const k = erg.kennzahlen;
        expect(aushubMasseVon(k)).toBe(k.aushubMasse);
        // Die IFC-Qto: das Rezept deklariert `aushubMasse`.
        const mengen = mengenVon({ rezept: 'kanalgraben', rolle: 'graben' }, k);
        expect(mengen.undisturbedVolume).toBe(k.aushubMasse);
        expect(mengen.looseVolume).toBeCloseTo(k.aushubMasse * k.auflockerung, 9);
        // Die Meldung nach dem Übernehmen.
        expect(mengenZeile([k])).toMatch(/^Aushub 102 m³/);
    });

    it('ein Rezept OHNE Profilkörper bleibt beim Raster — ohne Sonderfall im Leser', () => {
        expect(aushubMasseVon({ aushubRaster: 7 })).toBe(7);
        expect(aushubMasseVon({ aushubMasse: 9, aushubRaster: 7 })).toBe(9);
        expect(aushubMasseVon({})).toBeNull();
        expect(aushubMasseVon(null)).toBeNull();
    });
});
