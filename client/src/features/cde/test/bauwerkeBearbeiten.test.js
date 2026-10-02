// @vitest-environment jsdom
/**
 * Teil XXVII — Bauwerke bearbeiten (Fahrplan docs/cde/fahrplan-teil-xxvii-bauwerke-bearbeiten-2026-10-02.md).
 *
 * B0 friert die sechs Funde der Vorprüfung mit ihrem HEUTIGEN Ergebnis ein — über
 * den Kommandoweg (`fuehreAus`) am RÜB aus Z9.2, und über die Werkzeugleiste
 * (`passende`). Die Stufe, die einen Fund behebt, dreht seine Erwartung um und
 * sagt im Commit, warum.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { subjektAusStand } from '../services/kommando/Subjekt.js';
import { nachId, passende } from '../services/Bearbeitungen.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { hoeheAus } from '../services/kommando/Folgen.js';
import { eigenbauBaum } from '../services/Bauwerksstruktur.js';
import { istBehaelter } from '../services/Bauteilrezepte.js';
import { griffeFuer, griffeFrei, griffZuWerten } from '../services/Griffe.js';
import { registriereRezepte } from '../services/katalog/Katalog.js';
import { pruefeEintrag } from '../services/katalog/Katalogschema.js';
import { EINGEBAUTE_REZEPTE } from '../services/rezept/Eingebaut.js';
import { kommando, RUEB, TEILE } from './hilfen/ruebKommandos.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { baueEigenbauPaket } from '../services/EigenbauPaket.js';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';

class Speicher {
    constructor() { this.daten = new Map(); }
    async get(k) { return this.daten.has(k) ? JSON.parse(this.daten.get(k)) : null; }
    async set(k, v) { this.daten.set(k, JSON.stringify(v)); return true; }
    async delete(k) { this.daten.delete(k); return true; }
    async listKeys(p) { return [...this.daten.keys()].filter(k => k.startsWith(p)); }
    async getBlob() { return null; }
    async setBlob() { return false; }
    async deleteBlob() { return false; }
    async listBlobs() { return []; }
}

let b, ae;
beforeEach(async () => {
    repo.setBackend(new Speicher()); setActivePinia(createPinia());
    b = useBearbeitung(); ae = useAenderungen();
    for (const k of RUEB()) {
        const erg = await b.fuehreAus(k);
        if (!erg.ausgefuehrt) throw new Error(`${k.werkzeug}: ${erg.grund}`);
    }
});
afterEach(() => { repo.setBackend(null); registriereRezepte([]); });

const plan = (gid) => ae.wirksamerStand('erzeugt').get(gid);
const subj = (gid, mehr = {}) => ({ ...subjektAusStand(gid, { wirksamerStand: ae.wirksamerStand }), ...mehr });
const vorbelegt = (id, gid, mehr = {}) => nachId(id).vorbelegung?.(subj(gid, mehr), {}) ?? {};
/** Was die Werkzeugleiste an einem EIGENEN Bauteil anbietet — wie im Viewer: Bauform und Rezept. */
const angeboten = (gid) => {
    const p = plan(gid);
    return passende({ bauform: p.bauform, guete: 'gemessen' }, { eigenes: true, rezept: rezeptNach(p.rezept) }).map(w => w.id);
};
async function paketAus() {
    const stand = ae.wirksamerStand('erzeugt');
    const autor = new IfcAutor({ getFragments: () => null, holeQuellForm: () => null, kernel: erzeugeKernel(), getHoehenversatz: () => 0 });
    const g = await autor.eigenbauGeometrien([...stand].map(([globalId, wert]) => ({ globalId, wert })), { verdeckt: new Set() });
    if (g.misserfolge?.length) throw new Error(JSON.stringify(g.misserfolge));
    return baueEigenbauPaket({ teile: g.bauteile, stand, bauwerke: g.bauwerke, crs: 'EPSG:25832', projektname: 'RÜB', schluessel: 'rueb-oeffnung',
                               journal: { commit: 'c-oeffnung', sitzungOffen: false }, jetzt: new Date('2026-10-02T00:00:00Z'),
                               nachProjekt: (p) => ({ ost: 410300 + p.x, nord: 5460100 - p.z, hoehe: p.y }) });
}
// Vertrag mit dem Schreiber (B3): OEFFNUNG_VERTRAG_SCHREIBEN=1 npx vitest run src/features/cde/test/bauwerkeBearbeiten.test.js
const FIXTURE_OEFFNUNG = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../backend/app/ifc/tests/daten/paket_oeffnung.json');
let zaehler = 0;
const geber = (art) => `${art === 'operation' ? 'op' : 'cde'}-g${++zaehler}`;

describe('Teil XXVII, B0 — die Funde der Vorprüfung, wie sie HEUTE sind', () => {
    // B1 — ANGEBOT = AUSFÜHRUNG: Leiste, Griff und Kommando fragen dieselbe Regel (`eignungVon`).
    it('Fund 1 (B1): die Leiste bietet „Stützpunkt verschieben" an der Platte an — wie ihr Eckgriff es schon tat', async () => {
        for (const w of ['stuetzpunkt-verschieben', 'stuetzpunkt-einfuegen', 'stuetzpunkt-entfernen', 'kante-verschieben']) {
            expect(angeboten('cde-BP'), w).toContain(w);
        }
        const erg = await b.fuehreAus(kommando('stuetzpunkt-verschieben', { ziel: ['cde-BP'],
            werte: { index: { ost: 0, nord: 0, hoehe: 210 }, ost: -0.5, nord: 0.5, hoehe: 210 } }));
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        expect(plan('cde-BP').parameter.punkte[0]).toEqual([-0.5, 210, -0.5]);
    });

    it('Fund 2 (B1): „Kanalgraben ableiten" an einer Wand wird nicht angeboten — und abgelehnt mit dem Grund: keine Kante im Netz', async () => {
        expect(angeboten('cde-LN')).not.toContain('kanalgraben-ableiten');
        const gelaende = [{ globalId: 'cde-BP', name: 'Gelände', cell: 0.5 }];
        const erg = await b.fuehreAus(kommando('kanalgraben-ableiten', { ziel: ['cde-LN'],
            werte: vorbelegt('kanalgraben-ableiten', 'cde-LN', { gelaendeQuellen: gelaende }),
            eingaben: { auswahl: { gelaende: 'cde-BP' } } }),
            { subjektVon: (g) => subj(g, { gelaendeQuellen: gelaende }), kennungsgeber: geber });
        expect(erg.ausgefuehrt).toBe(false);
        expect(erg.grund).toMatch(/^„Kanalgraben ableiten" passt nicht zu Längswand Nord: Dem Bauteil fehlt/);
        expect(erg.grund).not.toMatch(/Bezug unzulässig/);
    });

    it('Fund 3 (B1): ein Erdbau-Werkzeug am Raum wird nicht angeboten — und abgelehnt mit dem fachlichen Grund', async () => {
        expect(angeboten('cde-R1')).not.toContain('erdbau-stuetzpunkt-verschieben');
        // Formgerecht (E3: keine Nummern) — dann spricht die Eignung, nicht die Adresse.
        const erg = await b.fuehreAus(kommando('erdbau-stuetzpunkt-verschieben', { ziel: ['cde-R1'], werte: { hoehe: 211 } }));
        expect(erg.ausgefuehrt).toBe(false);
        expect(erg.grund).toBe('„Knickpunkt verschieben" passt nicht zu Kammer 1: Nur an einem eigenen Erdbau-Vorgang.');
    });

    // B2 — DAS BAUWERK ALS GANZES (E24): aufgefächert auf alle Teile, ein Kommando, ein Rückgängig.
    it('Fund 4 (B2): am Bauwerk stehen die vier Lagewerkzeuge des Bauwerks — das einfache „Verschieben" nicht mehr, mit Grund', async () => {
        const da = angeboten('cde-RUEB');
        for (const w of ['bauwerk-verschieben', 'bauwerk-kopieren', 'bauwerk-drehen', 'bauwerk-spiegeln']) expect(da, w).toContain(w);
        expect(da).not.toContain('verschieben');
        const erg = await b.fuehreAus(kommando('verschieben', { ziel: ['cde-RUEB'], werte: { ost: 1, nord: 0, hoehe: 0 } }));
        expect(erg.ausgefuehrt).toBe(false);
        expect(erg.grund).toMatch(/Bauwerk verschieben" — mit allen seinen Teilen/);
        // … und an einem einzelnen Bauteil gibt es die Bauwerkswerkzeuge nicht.
        expect(angeboten('cde-LN')).not.toContain('bauwerk-verschieben');
    });

    it('B2: „Bauwerk verschieben" +10 m Ost — alle 10 Teile um genau 10,000 m, ein Vorgang, ein Rückgängig stellt alle her', async () => {
        const vorher = Object.fromEntries(TEILE.map(g => [g, plan(g).parameter.punkte]));
        const n0 = ae.eintraege.length;
        const erg = await b.fuehreAus(kommando('bauwerk-verschieben', { ziel: ['cde-RUEB'], werte: { ost: 10, nord: 0, hoehe: 0 } }));
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        expect(erg.eintraege).toHaveLength(10);
        expect(new Set(ae.eintraege.slice(n0).map(e => e.vorgang)).size).toBe(1);
        for (const g of TEILE) {
            plan(g).parameter.punkte.forEach((p, k) => {
                expect(p[0] - vorher[g][k][0]).toBeCloseTo(10, 9);
                expect([p[1], p[2]]).toEqual([vorher[g][k][1], vorher[g][k][2]]);
            });
            expect(plan(g).parameter.teilVon).toBe('cde-RUEB');
        }
        await ae.zurueck();
        for (const g of TEILE) expect(plan(g).parameter.punkte).toEqual(vorher[g]);
    });

    it('B2: „Bauwerk kopieren" — ein zweites Bauwerk mit 10 neuen Teilen, die auf die KOPIE zeigen; das Original bleibt', async () => {
        const vorher = JSON.stringify(TEILE.map(g => plan(g)));
        const neu = ['cde-K', ...TEILE.map((_, k) => `cde-K${k}`)];
        const erg = await b.fuehreAus(kommando('bauwerk-kopieren', { ziel: ['cde-RUEB'], neu, werte: { ost: 20, nord: 0, hoehe: 0 } }));
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        expect(plan('cde-K')).toMatchObject({ rezept: 'bauwerk', name: 'RÜB Kopie' });
        expect(plan('cde-K').parameter.bauwerkstyp).toBe('RUEB');
        TEILE.forEach((g, k) => {
            expect(plan(`cde-K${k}`).parameter.teilVon).toBe('cde-K');
            expect(plan(`cde-K${k}`).parameter.punkte[0][0] - plan(g).parameter.punkte[0][0]).toBeCloseTo(20, 9);
        });
        expect(JSON.stringify(TEILE.map(g => plan(g)))).toBe(vorher);
        // Über die Grenze: das Paket trägt ZWEI Bauwerke, jedes mit seinen zehn Teilen.
        const stand = ae.wirksamerStand('erzeugt');
        const autor = new IfcAutor({ getFragments: () => null, holeQuellForm: () => null, kernel: erzeugeKernel(), getHoehenversatz: () => 0 });
        const g = await autor.eigenbauGeometrien([...stand].map(([globalId, wert]) => ({ globalId, wert })), { verdeckt: new Set() });
        const paket = baueEigenbauPaket({ teile: g.bauteile, stand, bauwerke: g.bauwerke, crs: 'EPSG:25832',
                                          nachProjekt: (p) => ({ ost: 410300 + p.x, nord: 5460100 - p.z, hoehe: p.y }) });
        expect(paket.bauwerke.map(w => w.cdeId).sort()).toEqual(['cde-K', 'cde-RUEB']);
        const je = (id) => paket.bauteile.filter(t => t.teilVon === id).length;
        expect([je('cde-RUEB'), je('cde-K')]).toEqual([10, 10]);
    });

    it('B2: „Bauwerk drehen" 90° — um EINEN Drehpunkt: die Abstände zwischen den Teilen bleiben', async () => {
        const abstand = (a, c) => { const p = plan(a).parameter.punkte[0], q = plan(c).parameter.punkte[0]; return Math.hypot(p[0] - q[0], p[2] - q[2]); };
        const d0 = [abstand('cde-LN', 'cde-LS'), abstand('cde-SW', 'cde-SO'), abstand('cde-BP', 'cde-R2')];
        const erg = await b.fuehreAus(kommando('bauwerk-drehen', { ziel: ['cde-RUEB'], werte: { winkel: 90 } }));
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        const d1 = [abstand('cde-LN', 'cde-LS'), abstand('cde-SW', 'cde-SO'), abstand('cde-BP', 'cde-R2')];
        d1.forEach((d, k) => expect(d).toBeCloseTo(d0[k], 9));
        // Die Längswand lief Ost–West; gedreht läuft sie Nord–Süd.
        const [a, e] = plan('cde-LN').parameter.punkte;
        expect(Math.abs(a[0] - e[0])).toBeCloseTo(0, 9);
        expect(Math.abs(a[2] - e[2])).toBeCloseTo(8.9, 9);
    });

    it('B2: „Bauwerk spiegeln" als Kopie — Original bleibt, die Kopie ist ein eigenes Bauwerk', async () => {
        const neu = ['cde-S', ...TEILE.map((_, k) => `cde-S${k}`)];
        const erg = await b.fuehreAus(kommando('bauwerk-spiegeln', { ziel: ['cde-RUEB'], neu, werte: { achse: 0, kopie: 'ja' } }));
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        expect(TEILE.every((_, k) => plan(`cde-S${k}`).parameter.teilVon === 'cde-S')).toBe(true);
        expect(plan('cde-LN').parameter.teilVon).toBe('cde-RUEB');
    });

    // B3 — ÖFFNUNGEN (E27): ein eigenes IfcOpeningElement am Wirt; die Wand bleibt, was sie ist.
    it('Fund 5 (B3): an der eigenen Wand steht „Öffnung setzen" — die Aussparung nicht mehr, mit Grund', async () => {
        expect(angeboten('cde-LN')).toContain('oeffnung-setzen');
        expect(angeboten('cde-LN')).not.toContain('aussparung-ableiten');
        const erg = await b.fuehreAus(kommando('aussparung-ableiten', { ziel: ['cde-LN'], neu: ['cde-AU', 'op-AU'], werte: { werkzeug: 'cde-UE' } }),
            { subjektVon: (g) => subj(g, { koerperQuellen: [{ globalId: 'cde-UE', name: 'Schwelle' }] }) });
        expect(erg.ausgefuehrt).toBe(false);
        expect(erg.grund).toMatch(/An Eigenbau setzt man eine Öffnung/);
        expect(ae.wirksamerStand('geloescht').has('cde-LN')).toBe(false);
        // Eine Platte hat kein Rechteckprofil — dort gibt es keine Öffnung (der Grund sagt, warum).
        expect(angeboten('cde-BP')).not.toContain('oeffnung-setzen');
    });

    const BOHRUNG = { form: 'rund', station: 2, unterkante: 1, durchmesser: 0.3, breite: '', hoehe: '' };
    const setze = (werte = BOHRUNG) => b.fuehreAus(kommando('oeffnung-setzen', { ziel: ['cde-LN'], neu: ['cde-OE', 'op-OE'], werte }));

    it('B3: Kernbohrung Ø 0,30 in der Längswand — IfcOpeningElement am Wirt, Wand bleibt im Bauwerk, Nettomenge 6,653 794 m³', async () => {
        const erg = await setze();
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        expect(ae.wirksamerStand('geloescht').has('cde-LN')).toBe(false);
        expect(plan('cde-LN').parameter.teilVon).toBe('cde-RUEB');
        const p = await paketAus();
        const oe = p.bauteile.find(t => t.klasse === 'IFCOPENINGELEMENT');
        expect(oe).toMatchObject({ wirt: 'cde-LN', predefinedType: 'OPENING' });
        expect(oe.teilVon ?? null).toBe(null);
        expect(oe.mengen.depth).toBeCloseTo(0.3, 9);
        expect(oe.mengen.volume).toBeCloseTo(Math.PI * 0.15 ** 2 * 0.3, 9);
        const ln = p.bauteile.find(t => t.cdeId === 'cde-LN');
        expect(ln.mengen.grossVolume).toBeCloseTo(6.675, 9);
        expect(ln.mengen.netVolume).toBeCloseTo(6.675 - Math.PI * 0.15 ** 2 * 0.3, 9);
        expect(Math.round(ln.mengen.netVolume * 1e6) / 1e6).toBe(6.653794);
        // Die Bohrung sitzt bei Station 2 auf der Wandachse, Mitte 1,15 über dem Fuss (210).
        const xs = oe.punkte.map(q => q[0] + oe.ursprung[0] - 410300), ys = oe.punkte.map(q => q[2] + oe.ursprung[2]);
        expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(2, 6);
        expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(211.15, 6);
        if (process.env.OEFFNUNG_VERTRAG_SCHREIBEN) writeFileSync(FIXTURE_OEFFNUNG, JSON.stringify(p));
        expect(existsSync(FIXTURE_OEFFNUNG), 'Fixture fehlt: OEFFNUNG_VERTRAG_SCHREIBEN=1 …').toBe(true);
        const alt = JSON.parse(readFileSync(FIXTURE_OEFFNUNG, 'utf8'));
        expect(alt.bauteile.map(t => [t.cdeId, t.klasse, t.wirt ?? null, t.mengen])).toEqual(p.bauteile.map(t => [t.cdeId, t.klasse, t.wirt ?? null, t.mengen]));
    });

    it('Fund 15: im Strukturbaum steht die Öffnung UNTER ihrer Wand — wie im IFC (IfcRelVoidsElement), nicht daneben', async () => {
        await setze();
        const wurzel = eigenbauBaum({ stand: ae.wirksamerStand('erzeugt'), modelId: 'cde', istBehaelter }).wurzel;
        const finde = (k, gid) => (k.globalId === gid ? k : k.children?.map(c => finde(c, gid)).find(Boolean) ?? null);
        const wand = finde(wurzel, 'cde-LN');
        expect(wand.children.map(c => c.globalId)).toEqual(['cde-OE']);
        expect(wurzel.children.some(c => c.globalId === 'cde-OE')).toBe(false);
        // … und die Wand bleibt unter ihrem Bauwerk.
        expect(finde(wurzel, 'cde-RUEB').children.some(c => c.globalId === 'cde-LN')).toBe(true);
    });

    it('B3: die Öffnung folgt ihrer Wand — Wand +1 m Ost, die Öffnung mit; ihre Kennung bleibt', async () => {
        await setze();
        const mitte = (p) => { const o = p.bauteile.find(t => t.klasse === 'IFCOPENINGELEMENT');
                                const xs = o.punkte.map(q => q[0] + o.ursprung[0]); return [(Math.min(...xs) + Math.max(...xs)) / 2, o.cdeId]; };
        const [x0, id0] = mitte(await paketAus());
        const v = vorbelegt('verschieben', 'cde-LN');
        expect((await b.fuehreAus(kommando('verschieben', { ziel: ['cde-LN'], werte: { ...v, ost: v.ost + 1 } }))).ausgefuehrt).toBe(true);
        const [x1, id1] = mitte(await paketAus());
        expect(x1 - x0).toBeCloseTo(1, 6);
        expect(id1).toBe(id0);
    });

    it('B3: eine Öffnung über den Rand hinaus wird gebaut und markiert (E5)', async () => {
        await setze({ ...BOHRUNG, unterkante: 2.4 });
        const p = await paketAus();
        expect(p.bauteile.some(t => t.klasse === 'IFCOPENINGELEMENT')).toBe(true);
        // Der Befund gehört zum Lauf (der Raum zeigt ihn über `autor.ableitungen`).
        const stand = ae.wirksamerStand('erzeugt');
        const lauf = neuerAbleitungslauf({ stand, rezeptNach, holeQuellForm: async () => null, kernel: erzeugeKernel(), hoehenversatz: 0 });
        const r = await lauf.baue('cde-OE');
        expect(r.ok, JSON.stringify(r.fehler ?? null)).toBe(true);
        expect(lauf.ableitungen.get(plan('cde-OE').ableitung).befunde.map(f => f.regel)).toEqual(['oeffnung_ausserhalb']);
    });

    // B4 — ROHRDURCHFÜHRUNG: eine runde Öffnung, wo die Rohrachse die Wand kreuzt.
    const ROHR = () => kommando('rohr-zeichnen', { neu: ['cde-RO'],
        werte: { name: 'Zulauf', kategorie: 'IFCPIPESEGMENT', hoehe: 211, dn: 300 },
        eingaben: { zug: [{ ost: 2, nord: 2, hoehe: 211 }, { ost: 2, nord: -2, hoehe: 211 }] } });
    const DURCH = (mehr = {}) => kommando('durchfuehrung-setzen', { ziel: ['cde-RO'], neu: ['cde-DF', 'op-DF'],
        werte: { wirt: 'cde-LN', ringspalt: 0.05, ...mehr } });
    const durchfuehrung = (p) => p.bauteile.find(t => t.klasse === 'IFCOPENINGELEMENT');
    const mitteVon = (o) => ['x', 'y', 'z'].map((_, k) => { const v = o.punkte.map(q => q[k] + o.ursprung[k]); return (Math.min(...v) + Math.max(...v)) / 2; });

    it('B4: Rohr DN 300 durch die Längswand — Öffnung Ø 0,40 auf der Rohrachse (± 1 mm), an der Wand', async () => {
        expect((await b.fuehreAus(ROHR())).ausgefuehrt).toBe(true);
        expect(angeboten('cde-RO')).toContain('durchfuehrung-setzen');
        expect(angeboten('cde-LN')).not.toContain('durchfuehrung-setzen');
        const erg = await b.fuehreAus(DURCH());
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        const o = durchfuehrung(await paketAus());
        expect(o).toMatchObject({ wirt: 'cde-LN', predefinedType: 'OPENING' });
        expect(o.mengen.width).toBeCloseTo(0.4, 9);
        expect(o.mengen.volume).toBeCloseTo(Math.PI * 0.2 ** 2 * 0.3, 9);
        // Achse bei Ost 2, Nord −0,15 (Wandachse); Mitte des Rohrs = Sohle 211,00 + DN/2.
        const [ost, nord, hoehe] = mitteVon(o);
        expect(ost - 410300).toBeCloseTo(2, 3);
        expect(nord - 5460100).toBeCloseTo(-0.15, 3);
        expect(hoehe).toBeCloseTo(211.15, 3);
    });

    it('B4: das Rohr wandert 1 m nach Ost — die Durchführung geht mit, ihre Kennung bleibt', async () => {
        await b.fuehreAus(ROHR());
        await b.fuehreAus(DURCH());
        const vor = durchfuehrung(await paketAus());
        const v = vorbelegt('verschieben', 'cde-RO');
        expect((await b.fuehreAus(kommando('verschieben', { ziel: ['cde-RO'], werte: { ...v, ost: v.ost + 1 } }))).ausgefuehrt).toBe(true);
        const nach = durchfuehrung(await paketAus());
        expect(nach.cdeId).toBe(vor.cdeId);
        expect(mitteVon(nach)[0] - mitteVon(vor)[0]).toBeCloseTo(1, 6);
    });

    it('B4: kreuzt das Rohr die Wand nicht, entsteht nichts — mit Grund', async () => {
        await b.fuehreAus(ROHR());
        await b.fuehreAus(DURCH({ wirt: 'cde-SO' }));        // Stirnwand Ost bei Ost 8,75 — das Rohr liegt bei Ost 2
        const stand = ae.wirksamerStand('erzeugt');
        const lauf = neuerAbleitungslauf({ stand, rezeptNach, holeQuellForm: async () => null, kernel: erzeugeKernel(), hoehenversatz: 0 });
        const r = await lauf.baue('cde-DF');
        expect(r.ok).toBe(false);
        expect(r.fehler.join(' ')).toMatch(/kreuzt die Wand nicht/);
    });

    it('Fund 6 (B5, E25): waagerecht folgt nichts — Lage-Verweise sind nicht gebaut, nur Höhen', async () => {
        const v = vorbelegt('verschieben', 'cde-BP');
        const erg = await b.fuehreAus(kommando('verschieben', { ziel: ['cde-BP'], werte: { ...v, ost: v.ost + 1 } }));
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        expect(plan('cde-BP').parameter.punkte[0][0]).toBeCloseTo(1, 6);
        expect(plan('cde-LS').parameter.punkte[0]).toEqual([0, 210, 3.45]);
    });

    // B5 — HÖHEN FOLGEN: der Verweis wirkt beim Schreiben, im selben Vorgang.
    const stelle = (gid, bauteil, mass = 'oberkante') => b.fuehreAus(kommando('auf-bauteil-stellen', { ziel: [gid], werte: { bauteil, mass, versatz: 0 } }));
    const unterkante = (gid) => rezeptNach(plan(gid).rezept).stand.lies(plan(gid).parameter);
    const AUF_PLATTE = ['cde-LN', 'cde-LS', 'cde-SW', 'cde-SO', 'cde-TW', 'cde-R1', 'cde-R2'];
    async function aufstellen() {
        for (const g of AUF_PLATTE) expect((await stelle(g, 'cde-BP')).ausgefuehrt, g).toBe(true);
        expect((await stelle('cde-UE', 'cde-TW')).ausgefuehrt).toBe(true);
        expect((await stelle('cde-DE', 'cde-LN')).ausgefuehrt).toBe(true);
    }

    it('B5: „Auf Bauteil stellen" setzt die Höhe und merkt sich den Träger — an der Platte, nicht am Rohr', async () => {
        expect(angeboten('cde-LN')).toContain('auf-bauteil-stellen');
        await aufstellen();
        expect(plan('cde-LN').parameter.hoeheVon).toEqual({ bauteil: 'cde-BP', mass: 'oberkante', versatz: 0 });
        expect(unterkante('cde-LN')).toBeCloseTo(210, 9);
        expect(unterkante('cde-DE')).toBeCloseTo(212.5, 9);           // auf der Längswand: 210 + 2,50
        // Ein Kreis wird nicht angeboten: die Platte steht nicht auf der Wand, die auf ihr steht.
        const erg = await stelle('cde-BP', 'cde-LN');
        expect(erg.ausgefuehrt).toBe(false);
        expect(erg.grund).toMatch(/es steht selbst darauf/);
    });

    it('B5: Bodenplatte +0,20 m — Wände und Räume auf 210,20, Schwelle auf 212,10, Decke Unterkante 212,70; ein Vorgang, ein Rückgängig', async () => {
        await aufstellen();
        const vorher = Object.fromEntries([...AUF_PLATTE, 'cde-UE', 'cde-DE', 'cde-BP'].map(g => [g, plan(g).parameter.punkte]));
        const v = vorbelegt('verschieben', 'cde-BP');
        const n0 = ae.eintraege.length;
        const erg = await b.fuehreAus(kommando('verschieben', { ziel: ['cde-BP'], werte: { ...v, hoehe: v.hoehe + 0.2 } }));
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        expect(erg.eintraege).toHaveLength(1 + AUF_PLATTE.length + 2);                     // Platte + 7 + Schwelle + Decke
        expect(new Set(ae.eintraege.slice(n0).map(e => e.vorgang)).size).toBe(1);
        // Fund 13: die Platte selbst ohne Float32-Rauschen (vorher 210,199 997 und x = 1,9·10⁻⁷).
        expect(plan('cde-BP').parameter.punkte[0][0]).toBe(0);
        expect(plan('cde-BP').parameter.punkte[0][1]).toBeCloseTo(210.2, 12);
        for (const g of AUF_PLATTE) expect(unterkante(g), g).toBeCloseTo(210.2, 9);
        expect(unterkante('cde-UE')).toBeCloseTo(212.1, 9);                                 // Trennwand 210,20 + 1,90
        expect(unterkante('cde-DE')).toBeCloseTo(212.7, 9);                                 // Längswand 210,20 + 2,50
        expect(plan('cde-DE').parameter.punkte[0][1]).toBeCloseTo(212.95, 9);              // Oberkante = UK + 0,25
        await ae.zurueck();
        for (const [g, p] of Object.entries(vorher)) expect(plan(g).parameter.punkte, g).toEqual(p);
    });

    it('B5 × B2: eine Bauwerkskopie steht auf IHRER Platte — die Verweise zeigen in die Kopie, nicht ins Original', async () => {
        await aufstellen();
        const neu = ['cde-K', ...TEILE.map((_, k) => `cde-K${k}`)];
        expect((await b.fuehreAus(kommando('bauwerk-kopieren', { ziel: ['cde-RUEB'], neu, werte: { ost: 20, nord: 0, hoehe: 0 } }))).ausgefuehrt).toBe(true);
        const kopie = (g) => `cde-K${TEILE.indexOf(g)}`;
        expect(plan(kopie('cde-LN')).parameter.hoeheVon.bauteil).toBe(kopie('cde-BP'));
        expect(plan(kopie('cde-DE')).parameter.hoeheVon.bauteil).toBe(kopie('cde-LN'));
        // Das Original anheben — die Kopie bleibt, wo sie ist.
        const v = vorbelegt('verschieben', 'cde-BP');
        await b.fuehreAus(kommando('verschieben', { ziel: ['cde-BP'], werte: { ...v, hoehe: v.hoehe + 0.2 } }));
        expect(unterkante('cde-LN')).toBeCloseTo(210.2, 9);
        expect(unterkante(kopie('cde-LN'))).toBeCloseTo(210, 9);
    });

    it('B5: wer die Wand selbst auf eine andere Höhe zieht, löst ihren Verweis — sie folgt der Platte dann nicht mehr', async () => {
        await aufstellen();
        // Die GANZE Wand woanders hingestellt (Unterkante 210,50) — ein einzelner gezogener
        // Fusspunkt liesse die Unterkante (den tiefsten Punkt) auf der Platte.
        const w = vorbelegt('verschieben', 'cde-LS');
        const erg = await b.fuehreAus(kommando('verschieben', { ziel: ['cde-LS'], werte: { ...w, hoehe: w.hoehe + 0.5 } }));
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        expect(plan('cde-LS').parameter.hoeheVon).toBeUndefined();
        const v = vorbelegt('verschieben', 'cde-BP');
        await b.fuehreAus(kommando('verschieben', { ziel: ['cde-BP'], werte: { ...v, hoehe: v.hoehe + 0.2 } }));
        expect(unterkante('cde-LN')).toBeCloseTo(210.2, 9);
        expect(unterkante('cde-LS')).toBeCloseTo(210.5, 9);        // bleibt, wo man sie hingestellt hat
        expect(hoeheAus(plan('cde-LN').parameter.hoeheVon, ae.wirksamerStand('erzeugt'), rezeptNach)).toBeCloseTo(210.2, 9);
    });
});

describe('Teil XXVII, B6 — Griffe aus Feldern', () => {
    const griffe = (gid) => griffeFuer({ subjekt: subj(gid), subjektHerkunft: 'cde' });
    const arten = (gs) => gs.reduce((a, g) => ({ ...a, [g.art]: (a[g.art] ?? 0) + 1 }), {});
    const zieh = async (g, pos) => {
        const werte = griffZuWerten(g, pos);
        return b.fuehreAus(kommando(g.werkzeug, { ziel: [g.globalId], werte }));
    };

    it('die Wand hat 9 Griffe statt 7 — Höhe (von der Unterkante) und Dicke (quer), aus ihren Feldern', () => {
        const gs = griffe('cde-LN');
        expect(gs).toHaveLength(9);
        expect(arten(gs)).toEqual({ stuetzpunkt: 4, kante: 1, 'kante-plus': 1, drehung: 1, feldmass: 2 });
        const hoehe = gs.find(g => g.feld?.name === 'wandhoehe');
        expect(hoehe).toMatchObject({ werkzeug: 'wand-wandhoehe-setzen', achsen: 'Y' });
        expect(hoehe.pos.y).toBeCloseTo(212.5, 9);                 // Fuss 210 + 2,50
        // Sichtbar nur mit SEINEM Werkzeug scharf (K5) — eine eigene Familie je Feldsetzer.
        expect(griffeFrei({ modusAn: true, scharfId: 'wand-wandhoehe-setzen' }, hoehe, { subjektGid: 'cde-LN' })).toBe(true);
        expect(griffeFrei({ modusAn: true, scharfId: 'wand-dicke-setzen' }, hoehe, { subjektGid: 'cde-LN' })).toBe(false);
    });

    it('Wandhöhe am Griff auf 3,00 gezogen — und die Decke, die auf der Wand steht, folgt (B5)', async () => {
        expect((await b.fuehreAus(kommando('auf-bauteil-stellen', { ziel: ['cde-DE'], werte: { bauteil: 'cde-LN', mass: 'oberkante', versatz: 0 } }))).ausgefuehrt).toBe(true);
        const g = griffe('cde-LN').find(x => x.feld?.name === 'wandhoehe');
        const erg = await zieh(g, { ...g.pos, y: 213 });
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        expect(plan('cde-LN').parameter.wandhoehe).toBe(3);
        expect(rezeptNach('platte').stand.lies(plan('cde-DE').parameter)).toBeCloseTo(213, 9);
    });

    it('Plattendicke von oben, Wanddicke quer — der Zug ergibt das Mass', async () => {
        const dicke = griffe('cde-BP').find(x => x.feld?.name === 'dicke');
        expect(dicke.pos.y).toBeCloseTo(209.6, 9);                 // Oberkante 210 − 0,40
        expect((await zieh(dicke, { ...dicke.pos, y: 209.5 })).ausgefuehrt).toBe(true);
        expect(plan('cde-BP').parameter.dicke).toBe(0.5);
        const quer = griffe('cde-LN').find(x => x.feld?.name === 'dicke');
        expect(quer.achsen).toBe('XZ');
        const p = { x: quer.pos.x + quer.feld.normal.x * 0.1, y: quer.pos.y, z: quer.pos.z + quer.feld.normal.z * 0.1 };
        expect((await zieh(quer, p)).ausgefuehrt).toBe(true);
        expect(plan('cde-LN').parameter.dicke).toBe(0.5);           // 2 × (0,15 + 0,10)
    });

    it('das Bauwerk hat Versatz- und Drehgriff am gemeinsamen Schwerpunkt — der Versatzgriff verschiebt alle Teile', async () => {
        const gs = griffe('cde-RUEB');
        expect(arten(gs)).toEqual({ 'bauwerk-versatz': 1, drehung: 1 });
        const g = gs.find(x => x.art === 'bauwerk-versatz');
        const vorher = plan('cde-SO').parameter.punkte[0];
        expect((await zieh(g, { x: g.pos.x + 2, y: g.pos.y, z: g.pos.z + 1 })).ausgefuehrt).toBe(true);
        const nachher = plan('cde-SO').parameter.punkte[0];
        expect([nachher[0] - vorher[0], nachher[2] - vorher[2]]).toEqual([2, 1]);
        const dreh = gs.find(x => x.art === 'drehung');
        expect(dreh.werkzeug).toBe('bauwerk-drehen');
    });

    it('ein Rezept nur aus JSON bekommt seinen Griff ohne Codezeile — und das Schema prüft die Erklärung', async () => {
        const wand = EINGEBAUTE_REZEPTE.find(r => r.id === 'wand');
        const mauer = JSON.parse(JSON.stringify({ ...wand, id: 'gartenmauer', titel: 'Gartenmauer' }));
        expect(pruefeEintrag('rezept', mauer).fehler).toEqual([]);
        registriereRezepte([mauer]);
        const erg = await b.fuehreAus(kommando('gartenmauer-zeichnen', { neu: ['cde-GM'],
            werte: { name: 'GM', kategorie: 'IFCWALL', hoehe: '', dicke: 0.24, wandhoehe: 1.2 },
            eingaben: { zug: [{ ost: 20, nord: 0, hoehe: 210 }, { ost: 25, nord: 0, hoehe: 210 }] } }));
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        const g = griffe('cde-GM').find(x => x.feld?.name === 'wandhoehe');
        expect(g?.werkzeug).toBe('gartenmauer-wandhoehe-setzen');
        expect((await zieh(g, { ...g.pos, y: 211.5 })).ausgefuehrt).toBe(true);
        expect(plan('cde-GM').parameter.wandhoehe).toBe(1.5);
        // Ein Griff an einem nicht setzbaren Feld ist ein Fehler im Katalog.
        const falsch = JSON.parse(JSON.stringify(mauer));
        falsch.id = 'falschmauer';
        falsch.felder.find(f => f.name === 'wandhoehe').setzbar = false;
        expect(pruefeEintrag('rezept', falsch).fehler.join(' ')).toMatch(/einen Griff hat nur ein setzbares Zahlenfeld/);
    });
});
