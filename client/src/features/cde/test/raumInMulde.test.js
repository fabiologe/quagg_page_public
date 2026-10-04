// @vitest-environment node
/**
 * Teil XXIX, G-T2 — ein Raum in der Erdmulde (Konzept § 11.3, Lücke L-B).
 *
 * Von Hand (Konzept § 11): Sohle 40 × 20 m auf 98,00, Böschung 1 : 3, Rand 52 × 32 m auf 100,00.
 *   Dauerstau     98 → 99:  (800 + 4 · 989 + 1 196) / 6 = 992,0 m³
 *   Rückhalteraum 99 → 100: (1 196 + 4 · 1 421 + 1 664) / 6 = 1 424,0 m³
 * Gerechnet wird auf dem Raster des Geländes: in den vier Muldenecken teilt es die Zellen quer zum Grat — dort fehlen
 * bei 0,5 m Zellweite 1/6 m³ (0,017 %), bei 0,25 m 1/24 m³; die Abweichung fällt mit dem Quadrat der Zellweite.
 * Ein senkrechtes Prisma über der Wasserfläche bei 99 hätte 1 196 m³ (G0).
 * Dazu: ein Geländeknoten genau auf dem Spiegel gilt der Rechnung als 10 µm darüber (`KNOTEN_ABSTAND`, sonst berührten
 * sich zwei Wasserflächen in einem Punkt) — das kostet hier unter 10⁻³ m³, und die vier Eckdreiecke, die genau auf dem
 * Spiegel liegen (je cell²/2), zählen nicht zur Wasserfläche.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { nachId } from '../services/Bearbeitungen.js';
import { gewerkVon, mengenVon, rezeptNach } from '../services/Bauteilrezepte.js';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';
import { kandidatenAus } from '../services/kommando/Kandidaten.js';
import { Speicher } from './hilfen/vorlagenKommandos.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { baueEigenbauPaket } from '../services/EigenbauPaket.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Das Vertragspaket für den Schreiber: `MULDE_VERTRAG_SCHREIBEN=1 npx vitest run …/raumInMulde.test.js`. */
const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../backend/app/ifc/tests/daten/paket_mulde_gt2.json');
import { k } from './hilfen/kammerKommandos.js';

beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
afterEach(() => repo.setBackend(null));

const UR = 'DGM-M';
/** Die Mulde als Raster, Knoten für Knoten von Hand: Rand 4 … 56 × 4 … 36 auf 100, Sohle auf 98. */
function mulde(cell) {
    const n = Math.round(64 / cell) + 1, h = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const x = i * cell, z = j * cell, d = Math.min(x - 4, 56 - x, z - 4, 36 - z);
        h[i * n + j] = d < 0 ? 100 : Math.max(98, 100 - d / 3);
    }
    return { x0: 0, z0: 0, cell, nx: n, nz: n, maxX: 64, maxZ: 64, heights: h };
}
const RAND = [{ x: 4, z: 4 }, { x: 56, z: 4 }, { x: 56, z: 36 }, { x: 4, z: 36 }];

describe('Teil XXIX, G-T2 — ein Raum in der Erdmulde', () => {
    it('Kernel: Dauerstau 992 und Rückhalteraum 1 424 m³ (bis auf die Eckgrate); geschlossen; die Wasserfläche', async () => {
        const kernel = erzeugeKernel();
        for (const [cell, fehlt] of [[0.5, 1 / 6], [0.25, 1 / 24]]) {
            const raster = mulde(cell);
            const dauer = (await kernel.op('raumInMulde', { raster }, { umriss: RAND, oben: 99 })).ergebnis;
            const rueck = (await kernel.op('raumInMulde', { raster }, { umriss: RAND, oben: 100, unten: 99 })).ergebnis;
            expect([dauer.closed, rueck.closed]).toEqual([true, true]);
            expect(Math.abs(dauer.volumen - (992 - fehlt))).toBeLessThan(1e-3);
            expect(Math.abs(rueck.volumen - (1424 - fehlt))).toBeLessThan(1e-3);
            expect(Math.abs(dauer.wasserflaeche - (1196 - 2 * cell * cell))).toBeLessThan(0.01);
            expect(Math.abs(rueck.wasserflaeche - (1664 - 2 * cell * cell))).toBeLessThan(0.01);
            expect(dauer.tiefster).toBe(98);
        }
        // Ein grösserer Umriss ändert nichts: das Wasser steht nur, wo das Gelände tiefer liegt.
        const dauer05 = () => dauer05Wert;
        const dauer05Wert = (await kernel.op('raumInMulde', { raster: mulde(0.5) }, { umriss: RAND, oben: 99 })).ergebnis.volumen;
        const weit = (await kernel.op('raumInMulde', { raster: mulde(0.5) }, { umriss: [{ x: 0, z: 0 }, { x: 60, z: 0 }, { x: 60, z: 40 }, { x: 0, z: 40 }], oben: 99 })).ergebnis;
        expect(Math.abs(weit.volumen - dauer05())).toBeLessThan(1e-6);   // andere Zerlegung, Rechenrauschen
        // Ein Umriss mitten in der Mulde: dort ist der Raum senkrecht abgeschnitten — gesagt, nicht verschwiegen.
        const eng = await kernel.op('raumInMulde', { raster: mulde(0.5) }, { umriss: [{ x: 20, z: 15 }, { x: 30, z: 15 }, { x: 30, z: 25 }, { x: 20, z: 25 }], oben: 99 });
        expect(eng.ergebnis.volumen).toBeCloseTo(100, 6);
        expect(eng.warnungen.join(' ')).toMatch(/senkrecht abgeschnitten/);
        // DER HARTE FALL (gemessen im Browser, 2026-10-04): Geländehöhen aus Float32, waagerechte Flecken genau auf dem
        // Spiegel, Spiegel genau auf einer Knotenhöhe oder 1e-8 daneben. Vorher bis 111 von 1 800 Körpern offen.
        let seed = 9, offen = 0;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let fall = 0; fall < 60; fall++) {
            const c = [0.5, 0.25, 1][fall % 3], N = Math.ceil(30 / c) + 1, a1 = rnd(), b1 = rnd(), hs = new Float64Array(N * N);
            for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
                hs[i * N + j] = Math.fround((i + j) % 7 === 0 ? 250.15 : 250 + a1 * Math.sin(i * c * 0.5) + b1 * Math.cos(j * c * 0.4));
            }
            const r = { x0: 0, z0: 0, cell: c, nx: N, nz: N, maxX: (N - 1) * c, maxZ: (N - 1) * c, heights: hs };
            const knoten = hs[Math.floor(rnd() * hs.length)];
            const a = [knoten, knoten + 1e-8, knoten - 1e-8, Math.fround(250.15), 250.15][fall % 5], b = a + 0.3 + rnd();
            const ring = [{ x: 2, z: 2 }, { x: 28, z: 2 }, { x: 28, z: 28 }, { x: 2, z: 28 }];
            for (const par of [{ oben: a }, { oben: b }, { oben: b, unten: a }]) {
                const e = (await kernel.op('raumInMulde', { raster: r }, { umriss: ring, ...par })).ergebnis;
                if (e && !e.closed) offen++;
            }
        }
        expect(offen).toBe(0);
        // Kein Wasser, wo der Spiegel unter dem Gelände liegt; eine untere Grenze über dem Spiegel ist leer.
        expect((await kernel.op('raumInMulde', { raster: mulde(0.5) }, { umriss: RAND, oben: 97 })).ergebnis).toBeNull();
        expect((await kernel.op('raumInMulde', { raster: mulde(0.5) }, { umriss: RAND, oben: 99, unten: 99.5 })).ergebnis).toBeNull();
    }, 30000);

    it('über den echten Weg: Aushub, dann Dauerstau und Rückhalteraum als IfcSpace — Mengen nach Qto_SpaceBaseQuantities', async () => {
        // Ein ebenes Gelände auf 100,00 (Welt = NN), darin die Mulde mit „Ausheben".
        const t = [];
        for (let x = 0; x < 64; x += 2) for (let z = 0; z < 64; z += 2) t.push(x, 100, z, x + 2, 100, z, x + 2, 100, z + 2, x, 100, z, x + 2, 100, z + 2, x, 100, z + 2);
        const netz = { positions: new Float64Array(t), triCount: t.length / 9 };
        const holeQuellForm = async (gid, form, { cell, bereich = null, gitter = null } = {}) =>
            (gid === UR && form === 'raster' ? rasterAusMesh({ mesh: netz }, { cell: cell ?? 2, bereich, gitter }).ergebnis : null);
        const ae = useAenderungen();
        const trage = async (schritte, titel) => {
            expect(schritte, titel).toBeTruthy();
            const vg = ae.neueVorgangsId();
            for (const s of [].concat(schritte)) await ae.eintragen({ ...s, wer: 'fabio', vorgang: vg, vorgangTitel: titel });
        };
        const URSUBJEKT = { modelId: 'm1', localId: 1, globalId: UR, name: 'Urgelände', hoehenversatz: 0,
                            quellmass: { pruefmass: { triCount: 2048 }, cell: 2 } };
        await trage(nachId('graben-ausheben').anwenden(URSUBJEKT, { mass: 2, neigung: 3 }, { zug: RAND.map(p => ({ ...p, y: 100 })) }), 'Teichmulde');
        const kandidatenVon = kandidatenAus({ wirksamerStand: ae.wirksamerStand });
        const raum = (werte) => nachId('muldenraum-zeichnen').anwenden({ punkte: RAND, hoehenversatz: 0 }, { predefinedType: 'EXTERNAL', gelaende: '', ...werte }, { kandidatenVon });
        await trage(raum({ name: 'Dauerstau', oben: 99, unten: '' }), 'Dauerstau');
        await trage(raum({ name: 'Rückhalteraum', oben: 100, unten: 99 }), 'Rückhalteraum');

        const stand = ae.wirksamerStand('erzeugt');
        const lauf = neuerAbleitungslauf({ stand, rezeptNach, holeQuellForm, kernel: erzeugeKernel(), hoehenversatz: 0 });
        const r6 = (v) => Math.round(v * 1e6) / 1e6;
        const aus = {};
        for (const [gid, plan] of stand) {
            if (plan.rezept !== 'muldenraum') continue;
            const r = await lauf.baue(gid);
            expect(r.ok, (r.fehler ?? []).join(' · ')).toBe(true);
            aus[plan.name] = { plan, koerper: r.teil.daten, k: lauf.ableitungen.get(plan.ableitung).kennzahlen };
        }
        const { Dauerstau: D, Rückhalteraum: R } = aus;
        expect([D.plan.kategorie, D.plan.parameter.predefinedType, D.plan.parameter.quellen.gelaende]).toEqual(['IFCSPACE', 'EXTERNAL', UR]);
        expect([D.koerper.closed, R.koerper.closed]).toEqual([true, true]);
        // Die Mulde des Aushubs liegt auf dem 0,5-m-Raster des Laufs — dieselben Zahlen wie das Raster von Hand.
        const k = erzeugeKernel();
        const soll = { D: (await k.op('raumInMulde', { raster: mulde(0.5) }, { umriss: RAND, oben: 99 })).ergebnis,
                       R: (await k.op('raumInMulde', { raster: mulde(0.5) }, { umriss: RAND, oben: 100, unten: 99 })).ergebnis };
        expect([r6(D.k.volumen), r6(R.k.volumen)]).toEqual([r6(soll.D.volumen), r6(soll.R.volumen)]);
        expect(Math.abs(D.k.volumen - (992 - 1 / 6))).toBeLessThan(1e-3);
        expect(D.k.gelaende).toBe('nach Erdbau');
        expect(gewerkVon(D.plan).gewerk).toBe('entwaesserung');
        const m = (x) => Object.fromEntries(Object.entries(mengenVon(x.plan, x.k)).map(([n, v]) => [n, r6(v)]));
        expect(m(D)).toEqual({ netVolume: r6(soll.D.volumen), grossVolume: r6(soll.D.volumen), netFloorArea: r6(soll.D.wasserflaeche), height: 1 });
        expect(m(R)).toEqual({ netVolume: r6(soll.R.volumen), grossVolume: r6(soll.R.volumen), netFloorArea: r6(soll.R.wasserflaeche), height: 1 });
    }, 60000);

    it('der Spiegel steht in m NN: bei Höhenversatz 300 (Welt = NN − 300) dasselbe Wasser', async () => {
        // Die Mulde in Welt um 300 tiefer, der Spiegel bleibt 99 m NN.
        const raster = mulde(0.5);
        const welt = { ...raster, heights: raster.heights.map(v => v - 300) };
        const ae = useAenderungen();
        const vg = ae.neueVorgangsId();
        const schritte = nachId('muldenraum-zeichnen').anwenden({ punkte: RAND, hoehenversatz: 300 },
            { name: 'Dauerstau', predefinedType: 'EXTERNAL', oben: 99, unten: '', gelaende: UR }, {});
        for (const st of schritte) await ae.eintragen({ ...st, wer: 'fabio', vorgang: vg, vorgangTitel: 'Dauerstau' });
        const stand = ae.wirksamerStand('erzeugt');
        const gid = [...stand.keys()][0];
        const lauf = neuerAbleitungslauf({ stand, rezeptNach, kernel: erzeugeKernel(), hoehenversatz: 300,
            holeQuellForm: async (g, form) => (g === UR && form === 'raster' ? welt : null) });
        const r = await lauf.baue(gid);
        expect(r.ok, (r.fehler ?? []).join(' · ')).toBe(true);
        const ohneVersatz = (await erzeugeKernel().op('raumInMulde', { raster: mulde(0.5) }, { umriss: RAND, oben: 99 })).ergebnis.volumen;
        expect(Math.abs(r.teil.daten.volumen - ohneVersatz)).toBeLessThan(1e-6);
        expect(lauf.ableitungen.get(stand.get(gid).ableitung).kennzahlen.tiefe).toBeCloseTo(1, 9);
    }, 30000);

    it('Vertrag: ein kleiner Teich (Rand 16 × 12, Tiefe 1, 1 : 2) — zwei IfcSpace im Paket, von Hand 58,67 und 82,67 m³', async () => {
        const t = [];
        for (let x = 0; x < 24; x += 2) for (let z = 0; z < 24; z += 2) t.push(x, 100, z, x + 2, 100, z, x + 2, 100, z + 2, x, 100, z, x + 2, 100, z + 2, x, 100, z + 2);
        const netz = { positions: new Float64Array(t), triCount: t.length / 9 };
        const holeQuellForm = async (gid, form, { cell, bereich = null, gitter = null } = {}) =>
            (gid === UR && form === 'raster' ? rasterAusMesh({ mesh: netz }, { cell: cell ?? 2, bereich, gitter }).ergebnis : null);
        const ae = useAenderungen();
        const trage = async (schritte, titel) => {
            const vg = ae.neueVorgangsId();
            for (const st of [].concat(schritte)) await ae.eintragen({ ...st, wer: 'fabio', vorgang: vg, vorgangTitel: titel });
        };
        const rand = [{ x: 4, z: 4 }, { x: 20, z: 4 }, { x: 20, z: 16 }, { x: 4, z: 16 }];
        await trage(nachId('graben-ausheben').anwenden({ modelId: 'm1', localId: 1, globalId: UR, name: 'Urgelände', hoehenversatz: 0,
            quellmass: { pruefmass: { triCount: 288 }, cell: 2 } }, { mass: 1, neigung: 2 }, { zug: rand.map(p => ({ ...p, y: 100 })) }), 'Mulde');
        const kandidatenVon = kandidatenAus({ wirksamerStand: ae.wirksamerStand });
        for (const [name, oben, unten] of [['Dauerstau', 99.5, ''], ['Rückhalteraum', 100, 99.5]]) {
            await trage(nachId('muldenraum-zeichnen').anwenden({ punkte: rand, hoehenversatz: 0 },
                { name, predefinedType: 'EXTERNAL', oben, unten, gelaende: '' }, { kandidatenVon }), name);
        }
        const stand = ae.wirksamerStand('erzeugt');
        const autor = new IfcAutor({ getFragments: () => null, holeQuellForm, kernel: erzeugeKernel(), getHoehenversatz: () => 0 });
        const g = await autor.eigenbauGeometrien([...stand].map(([globalId, wert]) => ({ globalId, wert })), { verdeckt: new Set() });
        expect(g.misserfolge).toEqual([]);
        const teile = g.bauteile.filter(b => b.wert?.rezept === 'muldenraum').map(b => ({ ...b, globalId: b.wert.name === 'Dauerstau' ? 'cde-DS' : 'cde-RH' }));
        const p = baueEigenbauPaket({ teile, stand, bauwerke: [], crs: 'EPSG:25832', projektname: 'Teich', schluessel: 'mulde-gt2',
            journal: { commit: 'c-mulde', sitzungOffen: false }, jetzt: new Date('2026-10-04T00:00:00Z'),
            nachProjekt: (q) => ({ ost: 410300 + q.x, nord: 5460100 - q.z, hoehe: q.y }) });
        const r4 = (v) => Math.round(v * 1e4) / 1e4;
        const zeile = (b) => [b.cdeId, b.klasse, b.predefinedType, b.geschlossen, Object.fromEntries(Object.entries(b.mengen).map(([n, v]) => [n, r4(v)]))];
        const ds = zeile(p.bauteile.find(b => b.cdeId === 'cde-DS')), rh = zeile(p.bauteile.find(b => b.cdeId === 'cde-RH'));
        expect(ds.slice(0, 4)).toEqual(['cde-DS', 'IFCSPACE', 'EXTERNAL', true]);
        // Von Hand (Prismatoid): 0,5/6 · (96 + 4 · 117 + 140) = 58,667 und 0,5/6 · (140 + 4 · 165 + 192) = 82,667;
        // gerechnet fehlen je 1/12 m³ — die vier Eckgrate, wie bei der grossen Mulde (dazu < 10⁻³ aus KNOTEN_ABSTAND).
        expect(Math.abs(ds[4].netVolume - (0.5 / 6 * (96 + 4 * 117 + 140) - 1 / 12))).toBeLessThan(1e-3);
        expect(Math.abs(rh[4].netVolume - (0.5 / 6 * (140 + 4 * 165 + 192) - 1 / 12))).toBeLessThan(1e-3);
        // Die Wasserfläche ohne die vier Eckdreiecke genau auf dem Spiegel (4 · 0,125 m²).
        expect(Math.abs(ds[4].netFloorArea - 139.5)).toBeLessThan(0.01);
        expect(Math.abs(rh[4].netFloorArea - 191.5)).toBeLessThan(0.01);
        expect([ds[4].height, rh[4].height]).toEqual([0.5, 0.5]);
        if (process.env.MULDE_VERTRAG_SCHREIBEN) writeFileSync(FIXTURE, JSON.stringify(p));
        expect(existsSync(FIXTURE), 'Fixture fehlt: MULDE_VERTRAG_SCHREIBEN=1 …').toBe(true);
        expect(JSON.parse(readFileSync(FIXTURE, 'utf8')).bauteile.map(zeile)).toEqual([ds, rh]);
    }, 60000);

    it('als Kommando ohne Oberfläche — vor dem Aushub steht kein Wasser: der Lauf sagt es', async () => {
        const b = useBearbeitung();
        const erg = await b.fuehreAus(k('muldenraum-zeichnen', {
            neu: ['cde-DS', 'op-DS'],
            eingaben: { umriss: [{ ost: 4, nord: -4, hoehe: 100 }, { ost: 56, nord: -4, hoehe: 100 }, { ost: 56, nord: -36, hoehe: 100 }, { ost: 4, nord: -36, hoehe: 100 }] },
            werte: { name: 'Dauerstau', predefinedType: 'EXTERNAL', objektTyp: '', oben: 99, unten: '', gelaende: UR },
        }));
        expect(erg.ausgefuehrt, erg.grund).toBe(true);
        const plan = useAenderungen().wirksamerStand('erzeugt').get('cde-DS');
        expect(plan.parameter.operationen[0].parameter).toEqual({ umriss: [{ x: 4, z: 4 }, { x: 56, z: 4 }, { x: 56, z: 36 }, { x: 4, z: 36 }], oben: 99, unten: null });
        // Gebaut auf ebenem Gelände 100,00: der Spiegel 99 liegt darunter — kein Raum, mit Grund.
        const eben = { positions: new Float64Array([0, 100, 0, 64, 100, 0, 64, 100, 64, 0, 100, 0, 64, 100, 64, 0, 100, 64]), triCount: 2 };
        const lauf = neuerAbleitungslauf({ stand: useAenderungen().wirksamerStand('erzeugt'), rezeptNach, kernel: erzeugeKernel(),
            holeQuellForm: async (gid, form, { cell, bereich = null, gitter = null } = {}) =>
                (gid === UR && form === 'raster' ? rasterAusMesh({ mesh: eben }, { cell: cell ?? 2, bereich, gitter }).ergebnis : null) });
        const r = await lauf.baue('cde-DS');
        expect(r.ok).toBe(false);
        expect(r.fehler.join(' ')).toMatch(/nirgends unter dem Spiegel/);
    }, 30000);
});
