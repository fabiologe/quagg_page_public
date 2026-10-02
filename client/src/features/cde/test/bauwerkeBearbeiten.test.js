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
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { subjektAusStand } from '../services/kommando/Subjekt.js';
import { nachId, passende } from '../services/Bearbeitungen.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { kommando, RUEB, TEILE } from './hilfen/ruebKommandos.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { baueEigenbauPaket } from '../services/EigenbauPaket.js';

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
afterEach(() => repo.setBackend(null));

const plan = (gid) => ae.wirksamerStand('erzeugt').get(gid);
const subj = (gid, mehr = {}) => ({ ...subjektAusStand(gid, { wirksamerStand: ae.wirksamerStand }), ...mehr });
const vorbelegt = (id, gid, mehr = {}) => nachId(id).vorbelegung?.(subj(gid, mehr), {}) ?? {};
/** Was die Werkzeugleiste an einem EIGENEN Bauteil anbietet — wie im Viewer: Bauform und Rezept. */
const angeboten = (gid) => {
    const p = plan(gid);
    return passende({ bauform: p.bauform, guete: 'gemessen' }, { eigenes: true, rezept: rezeptNach(p.rezept) }).map(w => w.id);
};
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

    it('Fund 5: die Aussparung verdeckt die Wand und setzt ein Teil OHNE Bauwerk, Merkmale und Ausführung an ihre Stelle', async () => {
        expect(angeboten('cde-LN')).toContain('aussparung-ableiten');
        const erg = await b.fuehreAus(kommando('aussparung-ableiten', { ziel: ['cde-LN'], neu: ['cde-AU', 'op-AU'], werte: { werkzeug: 'cde-UE' } }),
            { subjektVon: (g) => subj(g, { koerperQuellen: [{ globalId: 'cde-UE', name: 'Schwelle' }] }) });
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        expect(ae.wirksamerStand('geloescht').has('cde-LN')).toBe(true);
        const au = plan('cde-AU');
        expect(au).toMatchObject({ rezept: 'aussparung', kategorie: 'IFCWALL' });
        expect(au.parameter.teilVon ?? null).toBe(null);
        expect(Object.keys(au.parameter)).not.toContain('tragend');
    });

    it('Fund 6: die Bodenplatte wird verschoben — die Wände bleiben stehen', async () => {
        const v = vorbelegt('verschieben', 'cde-BP');
        const erg = await b.fuehreAus(kommando('verschieben', { ziel: ['cde-BP'], werte: { ...v, ost: v.ost + 1 } }));
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        expect(plan('cde-BP').parameter.punkte[0][0]).toBeCloseTo(1, 6);
        expect(plan('cde-LS').parameter.punkte[0]).toEqual([0, 210, 3.45]);
    });
});
