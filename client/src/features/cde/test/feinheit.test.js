/**
 * Wie fein wird gerechnet? (Teil XXI, 2026-09-17)
 *
 * FABIOS BEFUND: „Gräben können zig Meter lang werden — dort braucht es ein
 * smartes Handling." Bis dahin gab es DREI Regeln für dieselbe Frage: der
 * Erdbau-Korridor eine Wurzel aus seiner Hüllfläche, der Kanalgraben feste
 * 0,5 m ohne jedes Budget, die Anzeige-Flicken eine Zählung grober Zellen.
 * Sie stimmten nur zufällig überein — und seit Teil XXI MÜSSEN sie
 * übereinstimmen, weil Erdkörper und Geländeanzeige dieselbe Fläche sind.
 *
 * Die eine Regel wiegt zwei Grössen gegeneinander:
 *   die FLÄCHE, die wirklich angefasst wird (nicht das Hüllrechteck), und
 *   die KENNWEITE, das Schmalste, was aufgelöst werden muss.
 * Das Budget macht gröber; die Kennweite schützt dagegen.
 */
import { describe, expect, it } from 'vitest';
import {
    ZELLEN_JE_KENNWEITE, feinheitAus, feinheitFuer, kennweiteVon, wirkflaecheVon,
} from '../services/gelaende/Operationen.js';

/** Ein ebenes Raster, grob wie eine Lieferung: 2-m-Zellen auf 300 × 300 m. */
function eben({ n = 151, cell = 2, h = 100 } = {}) {
    return { x0: 0, z0: 0, maxX: (n - 1) * cell, maxZ: (n - 1) * cell, cell, nx: n, nz: n,
             heights: new Float64Array(n * n).fill(h) };
}
const ring = (x0, z0, x1, z1, y = 100) => [
    { x: x0, y, z: z0 }, { x: x1, y, z: z0 }, { x: x1, y, z: z1 }, { x: x0, y, z: z1 }];

const GRUBE = (x0, z0, x1, z1, sohle = 98) => ({ art: 'grube', parameter: {
    umriss: ring(x0, z0, x1, z1), sohle, neigung: 1.5 } });
/** Ein langer, schmaler Graben — der Fall, den Fabio nennt. */
const GRABEN = (laenge, sohlbreite = 0.9) => ({ art: 'gerinne', parameter: {
    achse: [{ x: 10, z: 100 }, { x: 10 + laenge, z: 100 }],
    sohlbreite, boeschung: 1.5, sohleAnfang: 97, sohleEnde: 96.5 } });

describe('wirkflaecheVon — ein langer Graben füllt sein Hüllrechteck nicht aus', () => {
    it('ein DIAGONALER Graben misst seinen Streifen, nicht die Hülle', () => {
        const r = eben();
        const diagonal = { art: 'gerinne', parameter: {
            achse: [{ x: 20, z: 20 }, { x: 220, z: 220 }], sohlbreite: 0.9, boeschung: 1.5,
            sohleAnfang: 97, sohleEnde: 96 } };
        const flaeche = wirkflaecheVon(r, diagonal.art, diagonal.parameter);
        // Die Hülle misst rund 200 × 200 = 40.000 m²; der Streifen ist ein
        // Bruchteil davon. Genau daran wurde ein langer Graben grob.
        expect(flaeche).toBeLessThan(12000);
        expect(flaeche).toBeGreaterThan(2000);
    });

    it('eine Grube misst ihren Ring plus den Saum der Böschung', () => {
        const r = eben();
        const g = GRUBE(20, 20, 100, 100);             // 80 × 80 m
        const flaeche = wirkflaecheVon(r, g.art, g.parameter);
        expect(flaeche).toBeGreaterThan(6400);          // der Ring selbst
        expect(flaeche).toBeLessThan(6400 * 1.6);       // plus Saum, nicht das Doppelte
    });
});

describe('kennweiteVon — das Schmalste, was aufgelöst werden muss', () => {
    it('beim Graben die Sohlbreite', () => {
        const r = eben();
        const g = GRABEN(200, 0.9);
        expect(kennweiteVon(r, g.art, g.parameter)).toBeCloseTo(0.9, 6);
    });

    it('bei der Grube die Breite ihrer Böschung', () => {
        const r = eben();
        const g = GRUBE(20, 20, 100, 100, 98);          // 2 m tief, 1 : 1,5 → 3 m
        expect(kennweiteVon(r, g.art, g.parameter)).toBeCloseTo(3, 6);
    });

    it('ohne Böschung gibt es nichts Schmales — dann entscheidet die Fläche allein', () => {
        const r = eben();
        expect(kennweiteVon(r, 'planum', { umriss: ring(10, 10, 60, 60), hoehe: 99, neigung: 0 })).toBeNull();
    });
});

describe('feinheitAus — das Budget macht gröber, die Form schützt', () => {
    const grob = 2, zelle = 0.5;

    it('eine kleine Fläche bekommt die feinste Zelle', () => {
        const f = feinheitAus({ grob, flaeche: 600, kennweite: 3, zelle, budget: 20000 });
        expect(f).toMatchObject({ k: 4, cell: 0.5 });
        expect(f.ueberBudget).toBe(false);
    });

    it('eine GROSSE Fläche mit breiten Formen wird gröber — das ist der Sinn', () => {
        // 80 × 80 m Grube, 3 m breite Böschung: drei Teilungen statt vier.
        const f = feinheitAus({ grob, flaeche: 7744, kennweite: 3, zelle, budget: 20000 });
        expect(f.k).toBe(3);
        expect(f.cell).toBeCloseTo(2 / 3, 9);
    });

    it('eine SCHMALE Form überstimmt das Budget — sonst verschwände sie', () => {
        // Derselbe lange Graben, aber 0,9 m Sohle: die Kennweite gewinnt.
        const f = feinheitAus({ grob, flaeche: 7744, kennweite: 0.9, zelle, budget: 20000 });
        expect(f.k).toBe(4);
        expect(f.cell).toBe(0.5);
        expect(f.ueberBudget).toBe(true);               // bewusst über dem Budget
    });

    it('feiner als die feinste Zelle wird es nie — auch nicht für eine Haarlinie', () => {
        const f = feinheitAus({ grob, flaeche: 100, kennweite: 0.05, zelle, budget: 20000 });
        expect(f.cell).toBe(zelle);
    });

    it('ist das grobe Raster schon fein, gibt es nichts zu teilen', () => {
        expect(feinheitAus({ grob: 0.5, flaeche: 600, kennweite: 0.9, zelle: 0.5, budget: 20000 }).k).toBe(1);
    });

    it('ohne Fläche, Budget oder Zelle: keine Teilung, kein Wurf', () => {
        for (const o of [{}, { grob, flaeche: 0 }, { grob, flaeche: 100, budget: 0 }, { grob, flaeche: 100, zelle: 0 }]) {
            expect(feinheitAus(o).k).toBe(1);
        }
    });

    it('drei Zellen quer über die schmalste Stelle — die Zahl steht an EINER Stelle', () => {
        expect(ZELLEN_JE_KENNWEITE).toBe(3);
        // 1,5 m Kennweite → 0,5 m Zelle: genau drei.
        expect(feinheitAus({ grob, flaeche: 1e9, kennweite: 1.5, zelle, budget: 1 }).cell).toBe(0.5);
    });
});

describe('feinheitFuer — dieselbe Antwort für Korridor und Anzeige', () => {
    it('der lange schmale Graben bleibt fein, die grosse Grube wird gröber', () => {
        const r = eben();
        const opt = { zelle: 0.5, budget: 20000 };
        const graben = feinheitFuer(r, [GRABEN(300, 0.9)], opt);
        const grube = feinheitFuer(r, [GRUBE(20, 20, 100, 100)], opt);
        expect(graben.cell).toBe(0.5);
        expect(grube.cell).toBeGreaterThan(0.5);
        expect(grube.cell).toBeLessThanOrEqual(1);
    });

    it('mehrere Operationen: die Flächen summieren sich, die schmalste Form gewinnt', () => {
        const r = eben();
        const opt = { zelle: 0.5, budget: 20000 };
        const nurGrube = feinheitFuer(r, [GRUBE(20, 20, 100, 100)], opt);
        const mitGraben = feinheitFuer(r, [GRUBE(20, 20, 100, 100), GRABEN(60, 0.9)], opt);
        expect(mitGraben.flaeche).toBeGreaterThan(nurGrube.flaeche);
        expect(mitGraben.kennweite).toBeCloseTo(0.9, 6);
        expect(mitGraben.cell).toBe(0.5);               // der Graben schützt die ganze Rechnung
    });

    it('ohne Operationen oder ohne Raster: keine Teilung', () => {
        expect(feinheitFuer(eben(), []).k).toBe(1);
        expect(feinheitFuer(null, [GRABEN(50)]).k).toBe(1);
    });
});
