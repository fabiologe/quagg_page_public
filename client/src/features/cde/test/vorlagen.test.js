// @vitest-environment jsdom
/**
 * Teil XXVIII — Bauwerke aus Vorlagen, Einbauten, Rigole
 * (Fahrplan docs/cde/fahrplan-teil-xxviii-vorlagen-und-einbauten-2026-10-02.md).
 *
 * V0 friert die Funde der Vorprüfung mit ihrem HEUTIGEN Ergebnis ein; die Stufe,
 * die einen Fund behebt, dreht seine Erwartung um.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { pruefeEintrag } from '../services/katalog/Katalogschema.js';
import { PSET_TEMPLATES } from '../data/pset-templates.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { k, KAMMER } from './hilfen/kammerKommandos.js';

export class Speicher {
    constructor() { this.daten = new Map(); }
    async get(x) { return this.daten.has(x) ? JSON.parse(this.daten.get(x)) : null; }
    async set(x, v) { this.daten.set(x, JSON.stringify(v)); return true; }
    async delete(x) { this.daten.delete(x); return true; }
    async listKeys(p) { return [...this.daten.keys()].filter(x => x.startsWith(p)); }
    async getBlob() { return null; }
    async setBlob() { return false; }
    async deleteBlob() { return false; }
    async listBlobs() { return []; }
}
let b, ae;
beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); b = useBearbeitung(); ae = useAenderungen(); });
afterEach(() => repo.setBackend(null));

describe('Teil XXVIII, V0 — die Funde der Vorprüfung, wie sie HEUTE sind', () => {
    it('Fund 1: eine Kammer kostet 21 Kommandos — und 21 Vorgänge im Journal', async () => {
        const liste = KAMMER();
        expect(liste).toHaveLength(21);
        for (const kom of liste) expect((await b.fuehreAus(kom)).ausgefuehrt, kom.werkzeug).toBe(true);
        expect(new Set(ae.eintraege.map(x => x.vorgang)).size).toBe(21);
    });

    it('Fund 3: eine Bibliotheks-Vorlage kennt genau EIN Rezept', () => {
        expect(pruefeEintrag('vorlage', { id: 'v', name: 'V', rezept: 'wand', vorgaben: { dicke: 0.3 } }).ok).toBe(true);
        expect(pruefeEintrag('vorlage', { id: 'v', name: 'V', rezept: ['wand', 'platte'], vorgaben: {} }).ok).toBe(false);
    });

    it('Fund 4: dieselbe Kommandofolge ein zweites Mal wird abgelehnt — „neu" heisst neu', async () => {
        const [platte] = KAMMER();
        expect((await b.fuehreAus(platte)).ausgefuehrt).toBe(true);
        const nochmal = await b.fuehreAus({ ...platte, id: 'noch-einmal' });
        expect(nochmal.ausgefuehrt).toBe(false);
        expect(nochmal.grund).toMatch(/„neu" heisst neu/);
    });

    it('Fund 7: Quagg_Versickerung steht noch nicht im Katalog', () => {
        expect(PSET_TEMPLATES.Quagg_Versickerung).toBeUndefined();
    });

    it('Fund 8: eine Wand trägt keine Schalungsfläche (GrossSideArea)', () => {
        const m = rezeptNach('wand').mengen({ punkte: [[0, 210, 0], [4.6, 210, 0]], dicke: 0.3, wandhoehe: 2.5 });
        expect(m.grossSideArea).toBeUndefined();
        expect(m.netVolume).toBeCloseTo(3.45, 9);
    });
});
