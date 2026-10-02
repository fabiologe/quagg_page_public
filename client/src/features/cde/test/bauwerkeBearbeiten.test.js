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
import { kommando, RUEB } from './hilfen/ruebKommandos.js';

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

    it('Fund 4: „Verschieben" am Bauwerk wird angeboten, ist mit (0 | 0 | 0) vorbelegt und lehnt ab', async () => {
        expect(angeboten('cde-RUEB')).toContain('verschieben');
        const v = vorbelegt('verschieben', 'cde-RUEB');
        expect([v.ost, v.nord, v.hoehe]).toEqual([0, 0, 0]);
        const erg = await b.fuehreAus(kommando('verschieben', { ziel: ['cde-RUEB'], werte: { ...v, ost: 1 } }));
        expect(erg.ausgefuehrt).toBe(false);
        expect(erg.grund).toMatch(/fehlt der Bezug/);
        for (const w of ['kopieren', 'drehen', 'spiegeln']) expect(angeboten('cde-RUEB')).not.toContain(w);
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
