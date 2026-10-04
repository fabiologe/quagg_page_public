// @vitest-environment node
/**
 * Teil XXIX, G-T1 — die Schicht, die dem Gelände folgt (Konzept § 11.3, Lücken L-A und L-C).
 *
 * Gemessen über den ECHTEN Weg: Katalog (Werkzeug) → Journal → Ableitungslauf mit Erdbau-Stapel → Körper.
 * Von Hand gerechnet:
 *   - Teichmulde 30 × 20 m auf 100,00, Tiefe 2 m, Böschung 1 : 3 → Sohle 98,00.
 *   - Eine Schicht LOTRECHT gemessen hat immer Grundfläche × Dicke, egal wie das Gelände liegt:
 *     600 m² × 0,5 m = 300 m³ — vor UND nach dem Aushub.
 *   - Auf der Böschung 1 : 3 SENKRECHT zur Fläche: 14 × 6 m Grundriss × 0,5 × √(1 + 1/9) = 44,27 m³.
 *   - Ein Weg als Band: 50 m Achse × 2,5 m × 0,15 m = 18,75 m³.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { nachId, werkzeugKatalog } from '../services/Bearbeitungen.js';
import { gewerkVon, mengenVon, objektTypVon, rezeptNach } from '../services/Bauteilrezepte.js';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';
import { kandidatenAus } from '../services/kommando/Kandidaten.js';
import { palette } from '../services/Palette.js';
import { EINGEBAUTE_VORLAGEN, pruefeVorlage } from '../services/Bibliothek.js';
import { Speicher } from './hilfen/vorlagenKommandos.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { baueEigenbauPaket } from '../services/EigenbauPaket.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Das Vertragspaket für den Schreiber: `SCHICHT_VERTRAG_SCHREIBEN=1 npx vitest run …/schichtGelaende.test.js`. */
const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../backend/app/ifc/tests/daten/paket_schicht_gt1.json');
import { k } from './hilfen/kammerKommandos.js';

beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
afterEach(() => repo.setBackend(null));

const UR = 'DGM-T';
const ZELLE = 2;
/** Ein ebenes Gelände 60 × 60 m auf 100,00 (Welt = NN, Versatz 0). */
function ebene() {
    const t = [];
    for (let x = 0; x < 60; x += 2) for (let z = 0; z < 60; z += 2) {
        t.push(x, 100, z, x + 2, 100, z, x + 2, 100, z + 2, x, 100, z, x + 2, 100, z + 2, x, 100, z + 2);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const holeQuellForm = async (gid, form, { cell, bereich = null, gitter = null } = {}) =>
    (gid === UR && form === 'raster' ? rasterAusMesh({ mesh: ebene() }, { cell: cell ?? ZELLE, bereich, gitter }).ergebnis : null);
const URSUBJEKT = { modelId: 'm1', localId: 1, globalId: UR, name: 'Urgelände', category: 'IFCGEOGRAPHICELEMENT', hoehenversatz: 0,
                    quellmass: { pruefmass: { triCount: 1800, spanX: 60, spanY: 0, spanZ: 60 }, cell: ZELLE } };
const GELIEFERT = [{ globalId: UR, name: 'Urgelände', herkunft: 'geliefert', cell: ZELLE, pruefmass: URSUBJEKT.quellmass.pruefmass }];
const RECHTECK = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];

async function trage(schritte, titel) {
    const ae = useAenderungen();
    expect(schritte, `${titel}: anwenden ergab nichts`).toBeTruthy();
    const vg = ae.neueVorgangsId();
    for (const s of [].concat(schritte)) await ae.eintragen({ ...s, wer: 'fabio', vorgang: vg, vorgangTitel: titel });
}
const kandidaten = () => kandidatenAus({ wirksamerStand: useAenderungen().wirksamerStand, gelaende: GELIEFERT });
const ausheben = (tiefe = 2) => trage(nachId('graben-ausheben').anwenden(URSUBJEKT, { mass: tiefe, neigung: 3 },
    { zug: RECHTECK(10, 10, 40, 30).map(p => ({ ...p, y: 100 })) }), 'Teichmulde');
const schicht = (werte, punkte, { band = false } = {}) =>
    nachId(band ? 'gelaendeschicht-band-zeichnen' : 'gelaendeschicht-zeichnen')
        .anwenden({ punkte, hoehenversatz: 0 }, { kategorie: 'IFCCOURSE', richtung: 'lot', ...werte }, { kandidatenVon: kandidaten() });

/** Baut den Stand und liefert je Schicht-Kennung den Körper samt Kennzahlen und Bauplan. */
async function baue() {
    const stand = useAenderungen().wirksamerStand('erzeugt');
    const lauf = neuerAbleitungslauf({ stand, rezeptNach, holeQuellForm, kernel: erzeugeKernel(), hoehenversatz: 0 });
    const aus = {};
    for (const [gid, plan] of stand) {
        if (plan.rezept !== 'gelaendeschicht') continue;
        const r = await lauf.baue(gid);
        expect(r.ok, (r.fehler ?? []).join(' · ')).toBe(true);
        const ys = [];
        for (let i = 1; i < r.teil.daten.positions.length; i += 3) ys.push(r.teil.daten.positions[i]);
        aus[plan.name] = { koerper: r.teil.daten, k: lauf.ableitungen.get(plan.ableitung).kennzahlen, plan,
                           unten: Math.min(...ys), oben: Math.max(...ys) };
    }
    return aus;
}

describe('Teil XXIX, G-T1 — die Schicht, die dem Gelände folgt', () => {
    it('Kernel: lotrecht = Grundfläche × Dicke, senkrecht auf 1 : 3 = × √(10/9); geschlossen; ausserhalb benannt', async () => {
        const kernel = erzeugeKernel();
        const n = 41, cell = 0.5, h = new Float64Array(n * n);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) h[i * n + j] = 100 - (j * cell) / 3;
        const raster = { x0: 0, z0: 0, cell, nx: n, nz: n, maxX: 20, maxZ: 20, heights: h };
        const umriss = RECHTECK(2.3, 1.1, 12.7, 7.9);
        const lot = (await kernel.op('schicht', { raster }, { umriss, dicke: 0.3 })).ergebnis;
        const normal = (await kernel.op('schicht', { raster }, { umriss, dicke: 0.3, richtung: 'normal' })).ergebnis;
        expect(lot.closed).toBe(true);
        expect(lot.volumen).toBeCloseTo(10.4 * 6.8 * 0.3, 6);
        expect(lot.flaeche).toBeCloseTo(10.4 * 6.8 * Math.sqrt(10 / 9), 6);
        expect(normal.volumen).toBeCloseTo(10.4 * 6.8 * 0.3 * Math.sqrt(10 / 9), 6);
        // Ein L auf welligem Gelände: Stücke mit Ecken genau auf Rasterlinien (3,6375 = ein halber Millimeter) —
        // ohne die entarteten Dreiecke und ohne Zusammenlegen auf 1 mm riss der Körper (gemessen: eine Kante vierfach).
        const w = new Float64Array(n * n);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) w[i * n + j] = 100 + Math.sin(i * cell) * 0.7 + Math.cos(j * cell * 1.3) * 0.4 + 0.05 * i * j * cell * cell;
        const L = [{ x: 1.2, z: 1.3 }, { x: 15.1, z: 1.3 }, { x: 15.1, z: 6.2 }, { x: 7.7, z: 6.2 }, { x: 7.7, z: 16.4 }, { x: 1.2, z: 16.4 }];
        const l = (await kernel.op('schicht', { raster: { ...raster, heights: w } }, { umriss: L, dicke: 0.4 })).ergebnis;
        expect([l.closed, l.warnungen]).toEqual([true, []]);
        expect(l.volumen).toBeCloseTo((13.9 * 4.9 + 6.5 * 10.2) * 0.4, 6);
        // 120 Umrisse (Rechteck, L, U) mit Ecken auf halben Millimetern neben Rasterlinien: Stücke unter 1 mm Breite.
        // Auf 1 mm gerundet war jeder zweite Körper offen, auf 1 mm zusammengelegt noch einige (gemessen über 4 000).
        let seed = 11;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        let offen = 0, daneben = 0;
        for (let k = 0; k < 120; k++) {
            const q = (v) => (k % 2 ? Math.round(v * 4) / 4 + 0.0005 : Math.round(v * 1000) / 1000 + 0.0005);
            const X0 = q(2 + rnd() * 3), Z0 = q(2 + rnd() * 3), W = q(4 + rnd() * 10), H = q(4 + rnd() * 10);
            const m = q(W * 0.3), hh = q(H * 0.4);
            const [ring, fl] = k % 3 === 0 ? [[[0, 0], [W, 0], [W, H], [0, H]], W * H]
                : k % 3 === 1 ? [[[0, 0], [W, 0], [W, hh], [m, hh], [m, H], [0, H]], W * hh + m * (H - hh)]
                    : [[[0, 0], [W, 0], [W, H], [W - m, H], [W - m, hh], [m, hh], [m, H], [0, H]], W * H - (W - 2 * m) * (H - hh)];
            const dicke = 0.01 + rnd() * 0.4;
            const e = (await kernel.op('schicht', { raster: { ...raster, heights: w } },
                { umriss: ring.map(([x, z]) => ({ x: X0 + x, z: Z0 + z })), dicke })).ergebnis;
            if (!e.closed) offen++;
            if (Math.abs(e.grundflaeche - fl) > 1e-6 * fl || Math.abs(e.volumen - fl * dicke) > 1e-6 * fl * dicke) daneben++;
        }
        expect({ offen, daneben }).toEqual({ offen: 0, daneben: 0 });
        // Ein Umriss, der zu drei Vierteln neben dem Gelände liegt: der Rest wird gebaut, der Anteil gesagt.
        const teil = await kernel.op('schicht', { raster }, { umriss: RECHTECK(15, 15, 25, 25), dicke: 0.2 });
        expect(teil.ergebnis.volumen).toBeCloseTo(5 * 5 * 0.2, 6);
        expect(teil.warnungen.join(' ')).toMatch(/75\.0 % des Umrisses/);
    }, 30000);

    it('die Dichtung folgt der Mulde: vor dem Aushub auf 100,00, danach bis zur Sohle 98,00 — ihr Journaleintrag bleibt', async () => {
        await trage(schicht({ name: 'Tondichtung', predefinedType: 'CORE', dicke: 0.5 }, RECHTECK(10, 10, 40, 30)), 'Tondichtung');
        const vorher = await baue();
        expect([vorher.Tondichtung.unten, vorher.Tondichtung.oben]).toEqual([100, 100.5]);
        expect(vorher.Tondichtung.koerper.closed).toBe(true);
        expect(vorher.Tondichtung.koerper.volumen).toBeCloseTo(300, 6);
        expect(vorher.Tondichtung.k.gelaende).toBe('Urgelände');
        const plan = JSON.stringify(vorher.Tondichtung.plan);

        await ausheben(2);
        const nachher = await baue();
        expect(JSON.stringify(nachher.Tondichtung.plan)).toBe(plan);          // niemand hat die Schicht angefasst
        expect(nachher.Tondichtung.unten).toBeCloseTo(98, 9);                 // sie liegt auf der Sohle …
        expect(nachher.Tondichtung.oben).toBeCloseTo(100.5, 9);               // … und am Rand auf dem Gelände
        expect(nachher.Tondichtung.koerper.closed).toBe(true);
        expect(nachher.Tondichtung.koerper.volumen).toBeCloseTo(300, 6);      // lotrecht: Grundfläche × Dicke
        expect(nachher.Tondichtung.k.gelaende).toBe('nach Erdbau');
        expect(nachher.Tondichtung.k.flaeche).toBeGreaterThan(600);            // geneigt ist sie grösser als ihr Grundriss
    });

    it('auf der Böschung senkrecht zur Fläche: 14 × 6 m × 0,5 × √(10/9) = 44,27 m³', async () => {
        await ausheben(2);
        // Nordböschung zwischen Rand (z = 10) und Sohlkante (z = 16), weit weg von den Ecken.
        await trage(schicht({ name: 'Vlies', predefinedType: 'FILTER', dicke: 0.5, richtung: 'normal' }, RECHTECK(18, 10, 32, 16)), 'Vlies');
        const { Vlies } = await baue();
        expect(Vlies.koerper.closed).toBe(true);
        expect(Vlies.koerper.volumen).toBeCloseTo(14 * 6 * 0.5 * Math.sqrt(10 / 9), 4);
        expect(Vlies.unten).toBeCloseTo(98, 9);
    });

    it('ein Weg als Band entlang seiner Achse: 50 × 2,5 × 0,15 = 18,75 m³, Verkehrsfläche, Mengen nach IfcCourse', async () => {
        await trage(schicht({ name: 'Weg', predefinedType: 'PAVEMENT', dicke: 0.15, breite: 2.5 },
            [{ x: 5, z: 50 }, { x: 55, z: 50 }], { band: true }), 'Weg');
        const { Weg } = await baue();
        expect(Weg.koerper.volumen).toBeCloseTo(18.75, 6);
        expect(gewerkVon(Weg.plan).gewerk).toBe('verkehr');
        expect(mengenVon(Weg.plan, Weg.k)).toEqual({ volume: Weg.koerper.volumen, thickness: 0.15 });
    });

    it('die Klasse ist frei: Oberboden (IfcEarthworksFill) misst verdichtet, Schilf gehört nach Klasse zur Landschaft', async () => {
        await trage(schicht({ name: 'Oberboden', kategorie: 'IFCEARTHWORKSFILL', predefinedType: 'USERDEFINED',
                              objektTyp: 'Oberbodenandeckung', dicke: 0.2, gewerk: 'landschaft' }, RECHTECK(0, 0, 10, 10)), 'Oberboden');
        await trage(schicht({ name: 'Schilf', kategorie: 'IFCGEOGRAPHICELEMENT', predefinedType: 'VEGETATION', dicke: 0.4 },
            RECHTECK(20, 40, 30, 45)), 'Schilf');
        const { Oberboden, Schilf } = await baue();
        expect(Oberboden.plan.kategorie).toBe('IFCEARTHWORKSFILL');
        expect(objektTypVon(Oberboden.plan)).toBe('Oberbodenandeckung');
        expect(Oberboden.plan.parameter.gewerk).toBe('landschaft');            // weicht von der Klassenregel (Erdbau) ab
        const m = mengenVon(Oberboden.plan, Oberboden.k);
        expect(Object.keys(m).sort()).toEqual(['compactedVolume', 'depth']);
        expect([Math.round(m.compactedVolume * 1e6) / 1e6, m.depth]).toEqual([20, 0.2]);
        expect(Schilf.plan.parameter.gewerk).toBeUndefined();                  // die Regel sagt dasselbe
        expect(gewerkVon(Schilf.plan).gewerk).toBe('landschaft');
        expect(mengenVon(Schilf.plan, Schilf.k)).toEqual({});                  // IfcGeographicElement hat keine Qto-Vorlage
    });

    it('das Gelände: aus dem Journal das geformte Ur zuerst, sonst das gelieferte; ohne Gelände kein Schritt', async () => {
        expect(kandidatenAus({ wirksamerStand: useAenderungen().wirksamerStand })('gelaende')).toEqual([]);
        expect(nachId('gelaendeschicht-zeichnen').anwenden({ punkte: RECHTECK(0, 0, 5, 5) }, { kategorie: 'IFCCOURSE', dicke: 0.3 },
            { kandidatenVon: kandidatenAus({ wirksamerStand: useAenderungen().wirksamerStand }) })).toBeNull();
        await ausheben(2);
        const liste = kandidaten()('gelaende');
        expect(liste.map(g => [g.id, g.herkunft, g.cell])).toEqual([[UR, 'journal', ZELLE]]);
    });

    it('als Kommando ohne Oberfläche — das Ur aus dem Journal, Klasse und Ausführung oben im Bauplan', async () => {
        await ausheben(2);
        const b = useBearbeitung();
        const erg = await b.fuehreAus(k('gelaendeschicht-zeichnen', {
            neu: ['cde-S', 'op-S'],
            eingaben: { umriss: [{ ost: 10, nord: -10, hoehe: 100 }, { ost: 40, nord: -10, hoehe: 100 }, { ost: 40, nord: -30, hoehe: 100 }, { ost: 10, nord: -30, hoehe: 100 }] },
            werte: { name: 'Steinschüttung', kategorie: 'IFCCOURSE', predefinedType: 'ARMOUR', dicke: 0.4, richtung: 'lot', gelaende: '' },
        }));
        expect(erg.ausgefuehrt, erg.grund).toBe(true);
        const plan = useAenderungen().wirksamerStand('erzeugt').get('cde-S');
        expect([plan.rezept, plan.kategorie, plan.parameter.predefinedType, plan.parameter.quellen.gelaende]).toEqual(['gelaendeschicht', 'IFCCOURSE', 'ARMOUR', UR]);
        expect(gewerkVon(plan).gewerk).toBe('wasserbau');
        const { Steinschüttung } = await baue();
        expect(Steinschüttung.koerper.volumen).toBeCloseTo(600 * 0.4, 6);
        expect(Steinschüttung.unten).toBeCloseTo(98, 9);
    });

    it('der Teich (§ 11.1): die neun Schicht-Elemente aus den Vorlagen liegen auf der Mulde — G0: 0 in Form, G-T1: 9', async () => {
        // Die Mulde des Konzepts: Rand 52 × 32 auf 100,00 (x 4 … 56, z 4 … 36), Tiefe 2, Böschung 1 : 3 → Sohle 40 × 20 auf 98,00.
        await trage(nachId('graben-ausheben').anwenden(URSUBJEKT, { mass: 2, neigung: 3 },
            { zug: RECHTECK(4, 4, 56, 36).map(p => ({ ...p, y: 100 })) }), 'Teichmulde');
        const vorlage = (id) => EINGEBAUTE_VORLAGEN.find(v => v.id === id).vorgaben;
        const MULDE = RECHTECK(4, 4, 56, 36);
        const TEICH = [
            [5, 'tondichtung', MULDE, {}],
            [6, 'schutzvlies', MULDE, { abstand: 0.5 }],                       // auf der Dichtung
            [7, 'dichtungsschutz', MULDE, { abstand: 0.51 }],                  // auf dem Vlies
            [8, 'oberboden', RECHTECK(12, 4, 48, 7), {}],                      // obere Nordböschung, 100 … 99
            [9, 'steinschuettung', RECHTECK(12, 7, 48, 10), {}],               // Wasserwechselzone um 99
            [10, 'schilf', RECHTECK(12, 30, 48, 33), {}],                      // Südböschung, Flachwasser
            [11, 'rasen', RECHTECK(0, 36, 60, 40), {}],                        // oberhalb des Randes
            [16, 'steinschuettung', RECHTECK(10, 14, 14, 18), { dicke: 0.4 }], // Kolkschutz auf der Sohle am Einlauf
            [24, 'steinschuettung', RECHTECK(52, 16, 60, 24), {}],             // Dammscharte: über den Rand hinweg
        ];
        for (const [nr, id, umriss, mehr] of TEICH) {
            await trage(schicht({ name: `T${nr}`, gelaende: UR, objektTyp: '', ...vorlage(id), ...mehr }, umriss), `T${nr}`);
        }
        const gebaut = await baue();
        const inForm = TEICH.filter(([nr, , umriss]) => {
            const t = gebaut[`T${nr}`];
            const [x0, z0] = [umriss[0].x, umriss[0].z], [x1, z1] = [umriss[2].x, umriss[2].z];
            const grund = (x1 - x0) * (z1 - z0);
            // geschlossen, auf dem geformten Gelände (die Unterkante folgt ihm unter 100,00) und mit der Masse
            // der Vorlage: lotrecht genau Grundfläche × Dicke, senkrecht zur Fläche zwischen dieser und × √(10/9).
            const v = t.koerper.volumen / (grund * t.k.dicke);
            return t.koerper.closed && t.unten < 100 - 1e-6 && v > 1 - 1e-9 && v < Math.sqrt(10 / 9) + 1e-9;
        }).map(([nr]) => nr);
        // Rasen (11) liegt OBERHALB des Randes auf 100,00 — dort ist das Gelände eben, „folgen" heisst liegen bleiben.
        expect(inForm).toEqual([5, 6, 7, 8, 9, 10, 16, 24]);
        expect([gebaut.T11.unten, gebaut.T11.koerper.closed, gebaut.T11.koerper.volumen]).toEqual([100, true, expect.closeTo(60 * 4 * 0.05, 9)]);
        expect(gebaut.T5.unten).toBeCloseTo(98, 9);                            // die Dichtung liegt auf der Sohle
        expect(gebaut.T6.unten).toBeCloseTo(98.5, 9);                          // das Vlies auf der Dichtung
        expect(gebaut.T16.unten).toBeCloseTo(98, 9);
        expect(gebaut.T8.k.gelaende).toBe('nach Erdbau');

        // DAS PAKET für den Schreiber — nur die Schichten (der Aushub braucht seinen Wirt, das Ur-Gelände;
        // das prüft der Erdbau-Vertrag). Kennungen nach der Nummer im Katalog, damit die Datei stabil ist.
        const stand = useAenderungen().wirksamerStand('erzeugt');
        const autor = new IfcAutor({ getFragments: () => null, holeQuellForm, kernel: erzeugeKernel(), getHoehenversatz: () => 0 });
        const g = await autor.eigenbauGeometrien([...stand].map(([globalId, wert]) => ({ globalId, wert })), { verdeckt: new Set() });
        expect(g.misserfolge).toEqual([]);
        const schichten = g.bauteile.filter(t => t.wert?.rezept === 'gelaendeschicht');
        expect(schichten).toHaveLength(9);
        // Die drei muldenweiten Schichten (5–7) tragen je 30 048 Dreiecke — für den Vertrag genügen die übrigen
        // sechs: alle drei Klassen (IfcCourse, IfcEarthworksFill, IfcGeographicElement), 0,25 MB statt 2,4 MB.
        expect(schichten.find(t => t.wert.name === 'T5').positionen.length / 9).toBe(30048);
        const teile = schichten.filter(t => !['T5', 'T6', 'T7'].includes(t.wert.name))
            .map(t => ({ ...t, globalId: `cde-${t.wert.name}` }));
        const p = baueEigenbauPaket({ teile, stand, bauwerke: [], crs: 'EPSG:25832', projektname: 'Teich', schluessel: 'teich-gt1',
            journal: { commit: 'c-teich', sitzungOffen: false }, jetzt: new Date('2026-10-04T00:00:00Z'),
            nachProjekt: (q) => ({ ost: 410300 + q.x, nord: 5460100 - q.z, hoehe: q.y }) });
        const zeile = (t) => [t.cdeId, t.klasse, t.predefinedType ?? null, t.objektTyp ?? null, t.geschlossen,
                              Object.fromEntries(Object.entries(t.mengen).map(([m, v]) => [m, Math.round(v * 1e6) / 1e6]))];
        // Was ankommt: die Klasse der Vorlage, ihre Mengen nach der Qto-Vorlage dieser Klasse.
        expect(p.bauteile.map(zeile).find(z => z[0] === 'cde-T16')).toEqual(['cde-T16', 'IFCCOURSE', 'ARMOUR', null, true, { volume: 6.4, thickness: 0.4 }]);
        expect(p.bauteile.map(zeile).find(z => z[0] === 'cde-T8')[5]).toEqual({ compactedVolume: 21.6, depth: 0.2 });
        if (process.env.SCHICHT_VERTRAG_SCHREIBEN) writeFileSync(FIXTURE, JSON.stringify(p));
        expect(existsSync(FIXTURE), 'Fixture fehlt: SCHICHT_VERTRAG_SCHREIBEN=1 …').toBe(true);
        expect(JSON.parse(readFileSync(FIXTURE, 'utf8')).bauteile.map(zeile)).toEqual(p.bauteile.map(zeile));
    }, 60000);

    it('Werkzeugleiste: Schicht und Band im Wasserbau, in Landschaft und Verkehr; die Schicht-Vorlagen zeigen darauf', () => {
        const p = palette({ katalog: werkzeugKatalog(), vorlagen: EINGEBAUTE_VORLAGEN });
        const bauteile = (g) => p.gewerke.find(x => x.id === g).bauteile.map(e => e.id);
        for (const g of ['wasserbau', 'landschaft', 'verkehr']) {
            expect(bauteile(g)).toEqual(expect.arrayContaining(['gelaendeschicht-zeichnen', 'gelaendeschicht-band-zeichnen']));
        }
        const schichten = EINGEBAUTE_VORLAGEN.filter(v => v.rezept === 'gelaendeschicht');
        expect(schichten.map(v => v.id)).toEqual(['steinschuettung', 'tondichtung', 'schutzvlies', 'dichtungsschutz', 'schilf', 'rasen', 'oberboden', 'weg-wassergebunden']);
        for (const v of schichten) expect(pruefeVorlage(v)).toEqual({ ok: true, grund: null });
        expect(schichten.find(v => v.id === 'weg-wassergebunden').werkzeug).toBe('gelaendeschicht-band-zeichnen');
        expect(pruefeVorlage({ ...schichten[0], werkzeug: 'loeschen' }).ok).toBe(false);
    });
});
