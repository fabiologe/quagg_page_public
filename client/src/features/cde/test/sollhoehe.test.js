/**
 * DIE SOLLHÖHE AM ORT — ein Auflöser für alle Geländeoperationen
 * (Teil XXIV-4, Paket A; Fabio: „Ein Auflöser Sollhöhe am Ort, den alle
 * Geländeoperationen benutzen. Die Zielart ist danach keine Sache der
 * einzelnen Operation mehr.").
 *
 * DIESER TEST ENTSTEHT VOR DEM UMBAU (A0) und friert ein, was der heutige
 * Code rechnet: je Szenario das geformte Raster und die Warnliste. Danach
 * muss jedes Szenario BITGLEICH bleiben — der Umbau ist verhaltensneutral,
 * und kein Erwartungswert wird angepasst.
 *
 * Warum nicht die vollen Raster im Fixture: 41 × 41 Knoten je Szenario wären
 * 25 000 Zahlen, die niemand liest. Stattdessen je Szenario eine Handvoll
 * Grössen, die jede einzelne Knotenänderung sichtbar machen: Summe, gewichtete
 * Summe (fängt zwei Fehler, die sich aufheben), Kleinstes, Grösstes, die Zahl
 * der veränderten Knoten und zwölf feste Proben. Dazu die Warnliste wörtlich.
 *
 * Fixture neu schreiben (nur mit Grund — es ist der Stand VOR dem Umbau):
 *   SOLLHOEHE_SCHREIBEN=1 npx vitest run src/features/cde/test/sollhoehe.test.js
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GELAENDE_OPS, formeNach } from '../services/gelaende/Operationen.js';

const PFAD = join(process.cwd(), 'src/features/cde/test/fixtures/sollhoehe-vorher.json');

// ── Das Gelände: eben auf 300, 40 × 40 m ─────────────────────────────────

function raster(cell = 1, { luecke = false } = {}) {
    const nx = Math.round(40 / cell) + 1, nz = nx;
    const heights = new Float64Array(nx * nz).fill(300);
    // EIN LOCH (NaN): eine Zelle ohne Auskunft — jede Operation muss sie in Ruhe lassen.
    if (luecke) heights[Math.floor(nx / 2) * nz + Math.floor(nz / 2)] = NaN;
    return { x0: 0, z0: 0, maxX: 40, maxZ: 40, cell, nx, nz, heights };
}
/** Ein achsparalleles Rechteck als Umriss, jeder Punkt auf dem Gelände. */
const ring = (a, b, y = 300) => [{ x: a, y, z: a }, { x: b, y, z: a }, { x: b, y, z: b }, { x: a, y, z: b }];

const PLANUM = { id: 'op-P', art: 'planum', parameter: { umriss: ring(10.5, 20.5), hoehe: 301 } };
const BOESCHUNG = { id: 'op-B', art: 'boeschung', parameter: { umriss: ring(10.5, 20.5), hoehe: 301, neigung: 2 } };
const GRUBE = { id: 'op-G', art: 'grube', parameter: { umriss: ring(10.5, 20.5), sohle: 298 } };

/**
 * Die Szenarien. Jedes nennt seine Operationen, sein Raster und — wo es darauf
 * ankommt — die Operationen der Vorgänger (`vorherige`) und ein abweichendes
 * Ur-Gelände (`ur`).
 */
const SZENARIEN = [
    { name: 'planum', ops: [PLANUM] },
    { name: 'planum + boeschung 1:2', ops: [PLANUM, BOESCHUNG] },
    { name: 'planum ohne hoehe', ops: [{ ...PLANUM, parameter: { umriss: ring(10.5, 20.5) } }] },
    { name: 'boeschung ohne hoehe', ops: [{ ...BOESCHUNG, parameter: { umriss: ring(10.5, 20.5), neigung: 2 } }] },
    { name: 'grube senkrecht', ops: [GRUBE] },
    { name: 'grube 1:1,5', ops: [{ ...GRUBE, parameter: { ...GRUBE.parameter, neigung: 1.5 } }] },
    { name: 'grube ohne sohle', ops: [{ ...GRUBE, parameter: { umriss: ring(10.5, 20.5) } }] },
    { name: 'schuettung bis hoehe 1:1,5', ops: [{ id: 'op-S', art: 'schuettung', parameter: { umriss: ring(5.5, 25.5), ziel: 'hoehe', hoehe: 301, neigung: 1.5 } }] },
    // Nur die MITTE der Grube wird zurückverfüllt — sonst höbe die Schüttung den
    // Aushub genau auf, und dasselbe Bild entstünde, wenn beide nichts täten.
    { name: 'schuettung bis ur in der mitte einer grube', ops: [GRUBE, { id: 'op-S', art: 'schuettung', parameter: { umriss: ring(13.5, 17.5), ziel: 'ur' } }] },
    { name: 'schuettung bis ur, fremdes raster', ur: () => raster(0.5),
      ops: [{ id: 'op-S', art: 'schuettung', parameter: { umriss: ring(8.5, 22.5), ziel: 'ur' } }] },
    { name: 'schuettung bis flaeche, ziel in derselben liste', ops: [PLANUM, { id: 'op-S', art: 'schuettung', parameter: { umriss: ring(5.5, 25.5), ziel: 'flaeche', flaeche: 'op-P' } }] },
    { name: 'schuettung bis flaeche, ziel im vorgaenger', vorherige: [PLANUM],
      ops: [{ id: 'op-S', art: 'schuettung', parameter: { umriss: ring(5.5, 25.5), ziel: 'flaeche', flaeche: 'op-P', neigung: 1.5 } }] },
    { name: 'schuettung bis flaeche, ziel fehlt', ops: [{ id: 'op-S', art: 'schuettung', parameter: { umriss: ring(5.5, 25.5), ziel: 'flaeche', flaeche: 'op-X' } }] },
    { name: 'schuettung bis flaeche, ziel ohne flaeche', ops: [GRUBE, { id: 'op-S', art: 'schuettung', parameter: { umriss: ring(5.5, 25.5), ziel: 'flaeche', flaeche: 'op-G' } }] },
    { name: 'schuettung, unbekannte zielart', ops: [{ id: 'op-S', art: 'schuettung', parameter: { umriss: ring(5.5, 25.5), ziel: 'xyz', hoehe: 301 } }] },
    { name: 'baugrube', ops: [{ id: 'op-BG', art: 'baugrube', parameter: { mitte: { x: 15, z: 15 }, laenge: 6, breite: 4, sohle: 297, neigung: 1 } }] },
    { name: 'baugrube ohne sohle', ops: [{ id: 'op-BG', art: 'baugrube', parameter: { mitte: { x: 15, z: 15 }, laenge: 6, breite: 4 } }] },
    { name: 'planum über das ganze raster', ops: [{ id: 'op-R', art: 'planum', parameter: { umriss: ring(0, 40), hoehe: 299 } }] },
    // Ein Bereich, der die Formung abschneidet — `formeNach` muss das melden.
    { name: 'planum in zu kleinem bereich', bereich: { minX: 12, maxX: 18, minZ: 12, maxZ: 18 }, ops: [PLANUM] },
    // Ein Loch im Gelände: NaN bleibt NaN.
    { name: 'planum mit loch im raster', luecke: true, ops: [PLANUM] },
    // Feineres Raster — dieselbe Formung, andere Zellweite.
    { name: 'planum + boeschung auf 0,5 m', cell: 0.5, ops: [PLANUM, BOESCHUNG] },
];

/** Zwölf feste Orte, die Innen, Rand, Böschungsbereich und Aussen treffen. */
const PROBEN = [[15, 15], [10.5, 15], [12, 12], [21, 15], [22, 15], [24, 15], [26, 15], [7, 7], [5, 15], [3, 3], [30, 30], [39, 39]];

function messe(s) {
    const r = s.cell ? raster(s.cell, { luecke: s.luecke }) : raster(1, { luecke: s.luecke });
    const ur = s.ur ? s.ur() : r;
    const { raster: neu, warnungen } = formeNach(r, s.ops, { ur, vorherige: s.vorherige ?? [], ...(s.bereich ? { bereich: s.bereich } : {}) });
    const rund = (v) => (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null);
    let summe = 0, gewichtet = 0, min = Infinity, max = -Infinity, geaendert = 0, loecher = 0;
    for (let i = 0; i < neu.heights.length; i++) {
        const h = neu.heights[i];
        if (!Number.isFinite(h)) { loecher++; continue; }
        summe += h;
        gewichtet += h * ((i % 97) + 1);
        min = Math.min(min, h);
        max = Math.max(max, h);
        if (Math.abs(h - r.heights[i]) > 1e-9 || !Number.isFinite(r.heights[i])) geaendert++;
    }
    const hoeheAn = (x, z) => {
        const ix = Math.round((x - neu.x0) / neu.cell), iz = Math.round((z - neu.z0) / neu.cell);
        return rund(neu.heights[ix * neu.nz + iz]);
    };
    return {
        warnungen,
        summe: rund(summe), gewichtet: rund(gewichtet), min: rund(min), max: rund(max),
        geaendert, loecher,
        proben: PROBEN.map(([x, z]) => hoeheAn(x, z)),
    };
}

describe('Der Auflöser ändert nichts: jede Operation rechnet wie vorher', () => {
    const jetzt = Object.fromEntries(SZENARIEN.map(s => [s.name, messe(s)]));
    if (process.env.SOLLHOEHE_SCHREIBEN) writeFileSync(PFAD, `${JSON.stringify(jetzt, null, 1)}\n`);
    const GOLD = JSON.parse(readFileSync(PFAD, 'utf8'));

    it('das Fixture nennt jedes Szenario — keins fällt still weg', () => {
        expect(Object.keys(jetzt)).toEqual(Object.keys(GOLD));
    });
    for (const s of SZENARIEN) {
        it(`${s.name}: Raster und Warnungen wie vorher`, () => {
            expect(jetzt[s.name]).toEqual(GOLD[s.name]);
        });
    }
});

describe('Was die Registry über eine Zielart sagt — ebenfalls eingefroren', () => {
    const e = GELAENDE_OPS.schuettung;
    const fragen = (p) => ({
        kennhoehen: e.kennhoehen(p),
        innenGilt: !!e.innen.gilt(p),
        fillTyp: e.fillTyp(p) ?? null,
    });

    it('Ziel Höhe: Krone, innerer Ring, EMBANKMENT', () => {
        expect(fragen({ ziel: 'hoehe', hoehe: 301 })).toEqual({ kennhoehen: [{ art: 'kronenkante', hoehe: 301 }], innenGilt: true, fillTyp: null });
    });
    it('ohne Angabe gilt Höhe (Alt-Journale)', () => {
        expect(fragen({ hoehe: 301 })).toEqual({ kennhoehen: [{ art: 'kronenkante', hoehe: 301 }], innenGilt: true, fillTyp: null });
    });
    it('Ziel Ur: keine ebene Krone, kein innerer Ring, BACKFILL', () => {
        expect(fragen({ ziel: 'ur' })).toEqual({ kennhoehen: [], innenGilt: false, fillTyp: 'BACKFILL' });
    });
    it('Ziel Fläche: keine ebene Krone, kein innerer Ring, EMBANKMENT', () => {
        expect(fragen({ ziel: 'flaeche', flaeche: 'op-P' })).toEqual({ kennhoehen: [], innenGilt: false, fillTyp: null });
    });
    it('eine UNBEKANNTE Zielart: die Rechnung nimmt sie wie „Höhe", die Registry nicht — so ist es heute', () => {
        expect(fragen({ ziel: 'xyz', hoehe: 301 })).toEqual({ kennhoehen: [], innenGilt: false, fillTyp: null });
        // … und `wende` rechnet sie wie eine Höhe (siehe Szenario „unbekannte zielart").
    });
    it('das Planum bietet seine Ebene an, die Grube nicht', () => {
        expect(GELAENDE_OPS.planum.flaeche({ hoehe: 301 })(3, 7)).toBe(301);
        expect(GELAENDE_OPS.planum.flaeche({})).toBeNull();
        expect(GELAENDE_OPS.grube.flaeche).toBeUndefined();
    });
    it('welche Parameter m NN tragen, sagt jeder Eintrag', () => {
        expect(Object.fromEntries(Object.entries(GELAENDE_OPS).map(([art, x]) => [art, x.hoehenfelder])))
            .toEqual({ gerinne: ['sohleAnfang', 'sohleEnde'], planum: ['hoehe'], boeschung: ['hoehe'], baugrube: ['sohle'],
                       grube: ['sohle'], schuettung: ['hoehe'], boeschungLinie: [] });
    });
});

describe('Der Nachweis (A3): eine ZWEITE Operation bekommt die Zielart, ohne sie zu kennen', () => {
    // In `grube()` steht kein Zweig für eine Zielart — sie fragt den Auflöser und
    // schneidet. Diese drei Fälle kann sie seit dem Umbau, ohne eine Zeile über
    // „Fläche" oder „Ur" zu enthalten.
    const hoeheBei = (r, x, z) => r.heights[Math.round((x - r.x0) / r.cell) * r.nz + Math.round((z - r.z0) / r.cell)];
    const GRUBE_GROSS = (ziel) => ({ id: 'op-G', art: 'grube', parameter: { umriss: ring(5.5, 25.5), ...ziel } });

    it('bis zur FLÄCHE eines Planums: sie hebt bis auf dessen Ebene aus, nicht tiefer', () => {
        const tief = { id: 'op-P', art: 'planum', parameter: { umriss: ring(10.5, 20.5), hoehe: 299 } };
        const { raster: r, warnungen } = formeNach(raster(), [tief, GRUBE_GROSS({ ziel: 'flaeche', flaeche: 'op-P' })]);
        expect(warnungen).toEqual([]);
        expect(hoeheBei(r, 7, 7)).toBe(299);          // im Ring der Grube, ausserhalb des Planums
        expect(hoeheBei(r, 15, 15)).toBe(299);        // im Planum: schon dort
        expect(hoeheBei(r, 3, 3)).toBe(300);          // ausserhalb
    });

    it('bis zum UR-Gelände: nach einer Schüttung trägt sie wieder ab', () => {
        const auf = { id: 'op-S', art: 'schuettung', parameter: { umriss: ring(10.5, 20.5), ziel: 'hoehe', hoehe: 302 } };
        const ur = raster();
        const { raster: r, warnungen } = formeNach(raster(), [auf, { id: 'op-G', art: 'grube', parameter: { umriss: ring(8.5, 22.5), ziel: 'ur' } }], { ur });
        expect(warnungen).toEqual([]);
        expect(hoeheBei(r, 15, 15)).toBe(300);        // die Schüttung ist wieder weg
        expect(hoeheBei(r, 3, 3)).toBe(300);
    });

    it('ein Ziel, das es nicht gibt: die Grube meldet sich mit IHREM Namen', () => {
        const { raster: r, warnungen } = formeNach(raster(), [GRUBE_GROSS({ ziel: 'flaeche', flaeche: 'op-X' })]);
        expect(warnungen).toEqual(['grube_ziel_fehlt: die Operation op-X liegt im Stapel nicht vor dieser Grube']);
        expect(hoeheBei(r, 7, 7)).toBe(300);
    });

    it('„bis GOK" kennt keine Böschung — der Umriss liegt auf der Grubensohle, gefüllt wird trotzdem bis ans Ur', () => {
        // Rückverfüllung einer Grube: der Ring wird auf der SOHLE gezeichnet (y = 298).
        // Mit Böschung stiege die Schüttung von 298 mit 1:1,5 an; „bis GOK" tut das
        // nicht — sie füllt überall bis zum Ur-Gelände. So ist es seit Teil XX.
        const ur = raster();
        const ops = [{ id: 'op-G', art: 'grube', parameter: { umriss: ring(10.5, 20.5), sohle: 298 } },
                     { id: 'op-S', art: 'schuettung', parameter: { umriss: ring(12.5, 18.5, 298), ziel: 'ur', neigung: 1.5 } }];
        const { raster: r } = formeNach(raster(), ops, { ur });
        expect(hoeheBei(r, 13, 15)).toBe(300);        // 0,5 m vom Rand: voll bis zum Ur
        expect(hoeheBei(r, 15, 15)).toBe(300);
        expect(hoeheBei(r, 11, 15)).toBe(298);        // ausserhalb der Schüttung: die Grube bleibt
    });

    it('und ihre eigene Sohle rechnet sie wie vorher — mit Böschung 1:1,5', () => {
        const { raster: r } = formeNach(raster(), [{ id: 'op-G', art: 'grube', parameter: { umriss: ring(10.5, 20.5), sohle: 298, neigung: 1.5 } }]);
        expect(hoeheBei(r, 15, 15)).toBe(298);                    // Mitte: auf der Sohle
        // 0,5 m innerhalb des Rands: die Böschung fällt vom Rand (300) mit 1:1,5 ab.
        expect(hoeheBei(r, 11, 15)).toBeCloseTo(300 - 0.5 / 1.5, 9);
    });
});
