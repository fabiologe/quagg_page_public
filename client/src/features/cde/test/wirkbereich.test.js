// Der Wirkbereich: dasselbe Ergebnis, ein Bruchteil der Zellen (2026-09-09).
//
// Fabios Befund am eigenen Gerinne: „extrem heavy 3D modellieren
// anscheinend". Gemessen war es das: `formeNach` lief über JEDE Zelle des
// Geländes — bei einem DGM am Zellbudget 250.000, während ein Gerinne von
// 200 × 60 m rund 3.000 davon berührt.
//
// Die Gefahr dabei ist nicht die Rechnung, sondern das STILLE ABSCHNEIDEN:
// ein zu enger Bereich schneidet die Böschung ab, und das Ergebnis sieht
// plausibel aus. Deshalb prüfen die ersten Tests hier nicht die Zeit,
// sondern die GLEICHHEIT — Zelle für Zelle gegen den vollen Lauf.

import { describe, expect, it } from 'vitest';
import { formeNach, gerinne, planum, wirkbereichVon } from '../services/gelaende/Operationen.js';

/** Ein Raster mit sanfter Neigung — wie ein echtes Gelände. */
function raster({ nx = 200, nz = 200, cell = 2, x0 = 0, z0 = 0 } = {}) {
    const heights = new Float64Array(nx * nz);
    for (let ix = 0; ix < nx; ix++) {
        for (let iz = 0; iz < nz; iz++) heights[ix * nz + iz] = 100 + ix * 0.05 + iz * 0.02;
    }
    return { x0, z0, cell, nx, nz, heights, maxX: x0 + nx * cell, maxZ: z0 + nz * cell };
}

const gleich = (a, b) => {
    expect(a.heights.length).toBe(b.heights.length);
    let abw = 0;
    for (let i = 0; i < a.heights.length; i++) {
        const x = a.heights[i], y = b.heights[i];
        if (Number.isNaN(x) && Number.isNaN(y)) continue;
        if (Math.abs(x - y) > 1e-9) abw++;
    }
    return abw;
};

describe('das Ergebnis ist dasselbe', () => {
    const ops = [{
        art: 'gerinne',
        parameter: {
            achse: [{ x: 60, z: 120 }, { x: 260, z: 200 }],
            sohlbreite: 4, boeschung: 1.5, sohleAnfang: 98, sohleEnde: 96,
        },
    }];

    it('Gerinne: Bereich und ganzes Raster stimmen Zelle für Zelle überein', () => {
        const r = raster();
        const mit = formeNach(r, ops);
        const ohne = formeNach(r, ops, { ganzesRaster: true });
        expect(gleich(mit.raster, ohne.raster)).toBe(0);
    });

    it('Planum mit Böschung: ebenso', () => {
        const r = raster();
        const liste = [
            { art: 'planum', parameter: { umriss: [{ x: 100, z: 100 }, { x: 180, z: 100 }, { x: 180, z: 180 }, { x: 100, z: 180 }], hoehe: 99 } },
            { art: 'boeschung', parameter: { umriss: [{ x: 100, z: 100 }, { x: 180, z: 100 }, { x: 180, z: 180 }, { x: 100, z: 180 }], hoehe: 99, neigung: 2 } },
        ];
        const r1 = formeNach(r, liste);
        const r2 = formeNach(r, liste, { ganzesRaster: true });
        expect(gleich(r1.raster, r2.raster)).toBe(0);
    });

    it('Baugrube: ebenso — auch gedreht', () => {
        const r = raster();
        const liste = [{ art: 'baugrube', parameter: { mitte: { x: 200, z: 200 }, laenge: 30, breite: 18, richtung: 0.6, sohle: 95, neigung: 1 } }];
        expect(gleich(formeNach(r, liste).raster, formeNach(r, liste, { ganzesRaster: true }).raster)).toBe(0);
    });

    it('zweimal angewandt ändert sich nichts — die Idempotenz bleibt', () => {
        const r = raster();
        const eins = formeNach(r, ops).raster;
        const zwei = formeNach(eins, ops).raster;
        expect(gleich(eins, zwei)).toBe(0);
    });

    it('NaN bleibt NaN, auch ausserhalb des Bereichs', () => {
        const r = raster();
        r.heights[0] = NaN;                       // weit weg vom Gerinne
        r.heights[150 * 200 + 150] = NaN;         // mittendrin
        const n = formeNach(r, ops).raster;
        expect(Number.isNaN(n.heights[0])).toBe(true);
        expect(Number.isNaN(n.heights[150 * 200 + 150])).toBe(true);
    });
});

describe('der Bereich ist klein — darum geht es', () => {
    it('ein Gerinne berührt einen Bruchteil des Geländes', () => {
        const r = raster();                        // 200 × 200 = 40.000 Zellen
        const b = wirkbereichVon(r, 'gerinne', {
            achse: [{ x: 60, z: 120 }, { x: 260, z: 200 }],
            sohlbreite: 4, boeschung: 1.5, sohleAnfang: 98, sohleEnde: 96,
        });
        expect(b).toBeTruthy();
        const zellen = ((b.maxX - b.minX) / r.cell) * ((b.maxZ - b.minZ) / r.cell);
        // Deutlich weniger als das ganze Raster — sonst lohnt es nicht.
        expect(zellen).toBeLessThan(r.nx * r.nz * 0.5);
    });

    it('der Rand wächst mit Tiefe und Neigung — eine flache Böschung braucht mehr Platz', () => {
        const r = raster();
        const p = { achse: [{ x: 100, z: 100 }, { x: 140, z: 100 }], sohlbreite: 2, sohleAnfang: 95, sohleEnde: 95 };
        const steil = wirkbereichVon(r, 'gerinne', { ...p, boeschung: 0.5 });
        const flach = wirkbereichVon(r, 'gerinne', { ...p, boeschung: 4 });
        expect(flach.maxX - flach.minX).toBeGreaterThan(steil.maxX - steil.minX);
    });

    it('eine unbekannte Art grenzt NICHT ein — lieber alles als zu wenig', () => {
        expect(wirkbereichVon(raster(), 'pinsel', {})).toBeNull();
        expect(wirkbereichVon(raster(), 'gerinne', {})).toBeNull();
    });
});

describe('abgeschnitten wird gemeldet, nicht gehofft', () => {
    it('ein zu enger Bereich meldet sich', () => {
        const r = raster();
        // Ein Bereich, der die Böschung mitten durchschneidet.
        const eng = { minX: 100, maxX: 140, minZ: 100, maxZ: 140 };
        const { warnungen } = formeNach(r, [{
            art: 'planum',
            parameter: { umriss: [{ x: 100, z: 100 }, { x: 140, z: 100 }, { x: 140, z: 140 }, { x: 100, z: 140 }], hoehe: 90 },
        }], { bereich: eng });
        expect(warnungen.join(' ')).toMatch(/wirkbereich_zu_klein/);
    });

    it('ein ausreichender Bereich meldet nichts', () => {
        const r = raster();
        const { warnungen } = formeNach(r, [{
            art: 'planum',
            parameter: { umriss: [{ x: 100, z: 100 }, { x: 140, z: 100 }, { x: 140, z: 140 }, { x: 100, z: 140 }], hoehe: 90 },
        }]);
        expect(warnungen.join(' ')).not.toMatch(/wirkbereich_zu_klein/);
    });
});

describe('und es ist wirklich schneller', () => {
    it('der Bereich schlägt das ganze Raster deutlich', () => {
        const r = raster({ nx: 500, nz: 500 });      // 250.000 Zellen, das Budget
        const ops = [{
            art: 'gerinne',
            parameter: {
                achse: [{ x: 200, z: 400 }, { x: 600, z: 600 }],
                sohlbreite: 4, boeschung: 1.5, sohleAnfang: 98, sohleEnde: 96,
            },
        }];
        const t0 = performance.now(); formeNach(r, ops, { ganzesRaster: true }); const voll = performance.now() - t0;
        const t1 = performance.now(); formeNach(r, ops); const eng = performance.now() - t1;
        // Kein knapper Vorsprung: mindestens die Hälfte gespart.
        expect(eng).toBeLessThan(voll * 0.5);
    });
});

/**
 * Der feine Korridor der Erdbau-Ableitung — zweiter Teil von E2.
 *
 * Der Wirkbereich oben macht die Formung schnell; er ändert aber nichts an
 * der ZELLWEITE. Eine 4-m-Sohle in 2-m-Zellen bleibt grob, und daran hängen
 * Aushubkörper und Masse. Deshalb holt die Ableitung das Gelände ein
 * zweites Mal — fein und nur im Korridor —, rechnet Körper und Massen
 * darauf und lässt das sichtbare DGM beim vollen Raster (sonst hätte die
 * Oberfläche ein Loch, wo der Korridor endet).
 */
describe('der feine Korridor der Erdbau-Ableitung', () => {
    const gerinneOps = [{
        art: 'gerinne',
        parameter: {
            achse: [{ x: 200, z: 400 }, { x: 600, z: 600 }],
            sohlbreite: 4, boeschung: 1.5, sohleAnfang: 98, sohleEnde: 96,
        },
    }];

    /** Eine SCHMALE Sohle — nur dann lohnt der feine Korridor. */
    const schmalOps = [{
        art: 'gerinne',
        parameter: {
            achse: [{ x: 200, z: 400 }, { x: 600, z: 600 }],
            sohlbreite: 1.2, boeschung: 1.5, sohleAnfang: 98, sohleEnde: 96,
        },
    }];

    it('eine breite Sohle braucht ihn NICHT — zwei Sekunden für die dritte Nachkommastelle', async () => {
        const { ABLEITUNGEN } = await import('../services/ableitung/Ableitungen.js');
        const r = raster({ nx: 500, nz: 500 });          // 2-m-Zellen
        // 4 m Sohle liegen über zwei Zellen: am echten Gelände gemessen
        // 4,4 s / 0,05 % ohne gegen 6,6 s / 0,01 % mit Korridor.
        expect(ABLEITUNGEN.erdbau.zusatzQuellen(
            { operationen: gerinneOps }, { gelaende: r }, { gelaende: 'g' }).gelaendeFein).toBeUndefined();
    });

    it('eine schmale Sohle fordert ein feineres Raster an — und nur im Korridor', async () => {
        const { ABLEITUNGEN, ERDBAU_ZELLE } = await import('../services/ableitung/Ableitungen.js');
        const r = raster({ nx: 500, nz: 500 });          // 2-m-Zellen
        const zusatz = ABLEITUNGEN.erdbau.zusatzQuellen(
            { operationen: schmalOps }, { gelaende: r }, { gelaende: 'g-dgm' });
        expect(zusatz.gelaendeFein).toBeTruthy();
        expect(zusatz.gelaendeFein.gid).toBe('g-dgm');
        expect(zusatz.gelaendeFein.opts.cell).toBeLessThan(r.cell);
        expect(zusatz.gelaendeFein.opts.cell).toBeGreaterThanOrEqual(ERDBAU_ZELLE);
        // Der Ausschnitt ist deutlich kleiner als das Gelände.
        const b = zusatz.gelaendeFein.opts.bereich;
        expect(b.maxX - b.minX).toBeLessThan(r.nx * r.cell);
    });

    it('bei schon feinem Gelände lohnt er nicht — dann gibt es keinen', async () => {
        const { ABLEITUNGEN } = await import('../services/ableitung/Ableitungen.js');
        const fein = raster({ nx: 100, nz: 100, cell: 0.5 });
        const zusatz = ABLEITUNGEN.erdbau.zusatzQuellen(
            { operationen: [{ art: 'gerinne', parameter: { achse: [{ x: 10, z: 10 }, { x: 30, z: 30 }], sohlbreite: 0.6, boeschung: 1, sohleAnfang: 98, sohleEnde: 98 } }] },
            { gelaende: fein }, { gelaende: 'g' });
        expect(zusatz.gelaendeFein).toBeUndefined();
    });

    it('ohne eingrenzbare Operation gibt es keinen Korridor — lieber alles als zu wenig', async () => {
        const { ABLEITUNGEN } = await import('../services/ableitung/Ableitungen.js');
        const r = raster({ nx: 500, nz: 500 });
        const zusatz = ABLEITUNGEN.erdbau.zusatzQuellen(
            { operationen: [{ art: 'gerinne', parameter: { sohlbreite: 0.5 } }, { art: 'pinsel', parameter: {} }] },
            { gelaende: r }, { gelaende: 'g' });
        expect(zusatz.gelaendeFein).toBeUndefined();
    });

    it('der feine Korridor findet MEHR Masse als das grobe Raster', () => {
        // Das ist der fachliche Sinn: ein schmales Gerinne verschwindet in
        // groben Zellen halb. Beide Male dieselbe Formung, nur die
        // Auflösung unterscheidet sich.
        const grob = raster({ nx: 400, nz: 400, cell: 2 });
        const fein = raster({ nx: 400, nz: 400, cell: 0.5 });
        const ops = [{
            art: 'gerinne',
            parameter: { achse: [{ x: 100, z: 100 }, { x: 180, z: 140 }], sohlbreite: 1.5, boeschung: 1, sohleAnfang: 95, sohleEnde: 95 },
        }];
        const mGrob = massen(grob, formeNach(grob, ops).raster);
        const mFein = massen(fein, formeNach(fein, ops).raster);
        expect(mFein).toBeGreaterThan(0);
        expect(mGrob).toBeGreaterThan(0);
        // Beide in derselben Grössenordnung, das feine genauer — und nie
        // gleich, sonst wäre der Korridor umsonst.
        expect(Math.abs(mFein - mGrob) / mFein).toBeGreaterThan(0.01);
    });
});

/** Aushubmasse zweier Raster gleichen Bezugs — grob, für den Vergleich. */
function massen(a, b) {
    let v = 0;
    for (let i = 0; i < a.heights.length; i++) {
        const x = a.heights[i], y = b.heights[i];
        if (Number.isFinite(x) && Number.isFinite(y) && x > y) v += (x - y) * a.cell * a.cell;
    }
    return v;
}
