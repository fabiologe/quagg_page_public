/**
 * Die Kanten eines Erdbaus (Teil XX Stufe B / Teil XXI P3).
 *
 * Fabio (2026-09-10): „Böschungskanten der Erdbauten leicht hervorheben." Die
 * Linien entstehen NICHT aus dem gezeichneten Umriss, sondern aus der
 * Differenz vorher/nachher — wo die Böschung ausläuft, entscheidet die
 * Neigung gegen den Hang, und das steht erst im Ergebnis.
 *
 * Gemessen wird am echten Kernel und an echten Operationen.
 */
import { describe, expect, it } from 'vitest';
import { KANTEN_ARTEN, boeschungskanten, kantenUebersicht, kennhoehen } from '../services/gelaende/Boeschungskanten.js';
import { formeNach } from '../services/gelaende/Operationen.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';

const KERNEL = erzeugeKernel();

/** Ein ebenes Raster auf 100 m NN, 60 × 60 m, Zelle 0,5. */
function eben({ n = 121, cell = 0.5, h = 100 } = {}) {
    return { x0: 0, z0: 0, maxX: (n - 1) * cell, maxZ: (n - 1) * cell, cell, nx: n, nz: n,
             heights: new Float64Array(n * n).fill(h) };
}
const ring = (x0, z0, x1, z1, y) => [
    { x: x0, y, z: z0 }, { x: x1, y, z: z0 }, { x: x1, y, z: z1 }, { x: x0, y, z: z1 }];

const artenVon = (kanten) => [...new Set(kanten.map(k => k.art))].sort();
/** Der grösste Abstand aller Punkte einer Art von einem Rechteckrand. */
function abstandVomRechteck(kanten, art, [x0, z0, x1, z1]) {
    const punkte = kanten.filter(k => k.art === art).flatMap(k => k.punkte);
    if (!punkte.length) return null;
    let max = 0;
    for (const p of punkte) {
        const dx = Math.max(x0 - p.x, 0, p.x - x1);
        const dz = Math.max(z0 - p.z, 0, p.z - z1);
        const drinnen = dx === 0 && dz === 0;
        const dRand = drinnen ? Math.min(p.x - x0, x1 - p.x, p.z - z0, z1 - p.z) : Math.hypot(dx, dz);
        max = Math.max(max, dRand);
    }
    return max;
}

describe('kennhoehen — welche Operation eine EBENE Fläche herstellt', () => {
    it('Grube und Baugrube nennen ihre Sohle', () => {
        expect(kennhoehen([{ art: 'grube', parameter: { sohle: 97.5 } }])).toEqual([{ art: 'sohlkante', hoehe: 97.5 }]);
        expect(kennhoehen([{ art: 'baugrube', parameter: { sohle: 96 } }])).toEqual([{ art: 'sohlkante', hoehe: 96 }]);
    });

    it('ein Planum kann beides sein — es schneidet UND schüttet', () => {
        expect(kennhoehen([{ art: 'planum', parameter: { hoehe: 99 } }]))
            .toEqual([{ art: 'sohlkante', hoehe: 99 }, { art: 'kronenkante', hoehe: 99 }]);
    });

    it('eine Schüttung auf Höhe hat eine Krone, „bis GOK" nicht', () => {
        expect(kennhoehen([{ art: 'schuettung', parameter: { hoehe: 102 } }])).toEqual([{ art: 'kronenkante', hoehe: 102 }]);
        expect(kennhoehen([{ art: 'schuettung', parameter: { ziel: 'ur', hoehe: 0 } }])).toEqual([]);
    });

    it('ein GENEIGTES Gerinne hat keine ebene Sohle — und deshalb keine Isolinie', () => {
        // Eine Höhenlinie beschreibt eine geneigte Fläche nicht. Oberkante und
        // Fuss entstehen trotzdem, sie kommen aus der Differenz.
        expect(kennhoehen([{ art: 'gerinne', parameter: { sohleAnfang: 98, sohleEnde: 97 } }])).toEqual([]);
    });

    it('dieselbe Höhe zweimal ist eine Kante, nicht zwei', () => {
        expect(kennhoehen([{ art: 'grube', parameter: { sohle: 97 } }, { art: 'grube', parameter: { sohle: 97 } }]))
            .toHaveLength(1);
    });
});

describe('Eine Grube: Oberkante aussen, Sohlkante innen', () => {
    const UR = eben();
    const OP = [{ art: 'grube', parameter: { umriss: ring(20, 20, 40, 40, 100), sohle: 97, neigung: 1.5 } }];
    const NEU = formeNach(UR, OP, { ur: UR }).raster;

    it('liefert genau die zwei Arten, die eine Grube hat', async () => {
        const { kanten } = await boeschungskanten(KERNEL, { vorher: UR, nachher: NEU, ops: OP });
        expect(artenVon(kanten)).toEqual(['oberkante', 'sohlkante']);
        expect(kanten.every(k => k.punkte.every(p => Number.isFinite(p.y)))).toBe(true);
    });

    it('die Oberkante liegt AUF dem gezeichneten Umriss — dort endet der Abtrag', async () => {
        const { kanten } = await boeschungskanten(KERNEL, { vorher: UR, nachher: NEU, ops: OP });
        // Die Grube schneidet nach INNEN (Teil XX): der Umriss IST die Oberkante.
        expect(abstandVomRechteck(kanten, 'oberkante', [20, 20, 40, 40])).toBeLessThan(2 * UR.cell);
        const ok = kanten.find(k => k.art === 'oberkante');
        expect(ok.geschlossen).toBe(true);
        expect(ok.punkte.every(p => Math.abs(p.y - 100) < 0.05)).toBe(true);   // auf dem Gelände
    });

    it('die Sohlkante liegt um Tiefe × n weiter innen — der Knick am Böschungsfuss', async () => {
        const { kanten } = await boeschungskanten(KERNEL, { vorher: UR, nachher: NEU, ops: OP });
        const sk = kanten.find(k => k.art === 'sohlkante');
        expect(sk).toBeTruthy();
        // 3 m tief bei 1 : 1,5 → 4,5 m Einrückung; die Linie liegt bei 24,5 … 35,5.
        expect(abstandVomRechteck(kanten, 'sohlkante', [24.5, 24.5, 35.5, 35.5])).toBeLessThan(0.3);
        expect(sk.punkte.every(p => Math.abs(p.y - 97) < 0.1)).toBe(true);     // auf der Sohle
    });

    it('das Planbild IST die Oberkante — eine Rechnung, zwei Leser', async () => {
        const { kanten, bild } = await boeschungskanten(KERNEL, { vorher: UR, nachher: NEU, ops: OP });
        const grenzen = kanten.filter(k => ['oberkante', 'fuss'].includes(k.art));
        expect(bild).toHaveLength(grenzen.length);
        expect(bild[0].punkte.length).toBe(grenzen[0].punkte.length);
    });
});

describe('Eine Schüttung: Fuss aussen, Kronenkante oben', () => {
    const UR = eben();
    const OP = [{ art: 'schuettung', parameter: { umriss: ring(20, 20, 40, 40, 100), hoehe: 102, neigung: 1.5 } }];
    const NEU = formeNach(UR, OP, { ur: UR }).raster;

    it('der Fuss liegt auf dem Umriss, die Krone weiter innen', async () => {
        const { kanten } = await boeschungskanten(KERNEL, { vorher: UR, nachher: NEU, ops: OP });
        expect(artenVon(kanten)).toEqual(['fuss', 'kronenkante']);
        expect(abstandVomRechteck(kanten, 'fuss', [20, 20, 40, 40])).toBeLessThan(2 * UR.cell);
        // 2 m hoch bei 1 : 1,5 → 3 m Einrückung.
        expect(abstandVomRechteck(kanten, 'kronenkante', [23, 23, 37, 37])).toBeLessThan(0.3);
        expect(kanten.find(k => k.art === 'kronenkante').punkte.every(p => Math.abs(p.y - 102) < 0.1)).toBe(true);
    });
});

describe('Grube UND Schüttung nebeneinander: beide Grenzen, jede mit ihrem Namen', () => {
    const UR = eben();
    const OP = [
        { art: 'grube', parameter: { umriss: ring(8, 8, 24, 24, 100), sohle: 98, neigung: 1.5 } },
        { art: 'schuettung', parameter: { umriss: ring(34, 34, 52, 52, 100), hoehe: 101.5, neigung: 1.5 } },
    ];
    const NEU = formeNach(UR, OP, { ur: UR }).raster;

    it('Abtrag heisst Oberkante, Auftrag heisst Fuss — das Vorzeichen entscheidet', async () => {
        const { kanten } = await boeschungskanten(KERNEL, { vorher: UR, nachher: NEU, ops: OP });
        expect(artenVon(kanten)).toEqual(['fuss', 'kronenkante', 'oberkante', 'sohlkante']);
        expect(abstandVomRechteck(kanten, 'oberkante', [8, 8, 24, 24])).toBeLessThan(2 * UR.cell);
        expect(abstandVomRechteck(kanten, 'fuss', [34, 34, 52, 52])).toBeLessThan(2 * UR.cell);
    });

    it('die Sohlkante entsteht NUR im Abtrag, die Kronenkante NUR im Auftrag', async () => {
        const { kanten } = await boeschungskanten(KERNEL, { vorher: UR, nachher: NEU, ops: OP });
        // Ohne Maske läge die Isolinie „98 m" auch quer durch das unberührte
        // Gelände bei 100 m — sie tut es nicht.
        for (const k of kanten.filter(k => k.art === 'sohlkante')) {
            expect(k.punkte.every(p => p.x < 25 && p.z < 25)).toBe(true);
        }
        for (const k of kanten.filter(k => k.art === 'kronenkante')) {
            expect(k.punkte.every(p => p.x > 33 && p.z > 33)).toBe(true);
        }
    });

    it('die Übersicht zählt und misst je Art', async () => {
        const { kanten } = await boeschungskanten(KERNEL, { vorher: UR, nachher: NEU, ops: OP });
        const u = kantenUebersicht(kanten);
        expect(Object.keys(u).sort()).toEqual(['fuss', 'kronenkante', 'oberkante', 'sohlkante']);
        // Die Oberkante der 16-m-Grube: rund 64 m Umfang.
        expect(u.oberkante.laenge).toBeGreaterThan(55);
        expect(u.oberkante.laenge).toBeLessThan(75);
        expect(u.oberkante.anzahl).toBe(1);
    });
});

describe('Was ohne Eingriff passiert', () => {
    it('ein unberührtes Gelände hat keine Kanten', async () => {
        const UR = eben();
        const { kanten, bild } = await boeschungskanten(KERNEL, { vorher: UR, nachher: UR, ops: [] });
        expect(kanten).toEqual([]);
        expect(bild).toEqual([]);
    });

    it('ohne Kernel oder ohne Raster kommt eine leere Antwort, kein Wurf', async () => {
        expect(await boeschungskanten(null, { vorher: eben(), nachher: eben() })).toMatchObject({ kanten: [], bild: [] });
        expect(await boeschungskanten(KERNEL, {})).toMatchObject({ kanten: [], bild: [] });
    });

    it('die vier Arten sind Daten — und die IFC-Namen gehören dem Schreiber', () => {
        expect(Object.keys(KANTEN_ARTEN).sort()).toEqual(['fuss', 'kronenkante', 'oberkante', 'sohlkante']);
        expect(KANTEN_ARTEN.oberkante.titel).toBe('Böschungsoberkante');
        // Wie sie im IFC heissen, steht in `backend/app/ifc/eigenbau.py` —
        // hier NICHT ein zweites Mal (Gesetz 7).
        expect(KANTEN_ARTEN.oberkante.ifc).toBeUndefined();
    });
});
