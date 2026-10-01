// @vitest-environment jsdom
/**
 * Fund 11 (Teil XXVI): ein Kommando, dessen Bauplan sich nicht bauen lässt,
 * wird ABGELEHNT (E5: das technisch Unmögliche) — nicht eingetragen.
 *
 * Vorher (gemessen 2026-10-01 über `fuehreAus`): alle vier Fälle unten kamen
 * mit `ausgefuehrt: true` ins Journal, mit 0, 0, 2 bzw. 1 Punkt; erst der Autor
 * meldete „mindestens 3 Punkte" — das Bauteil fehlte still im Raum und im IFC.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';

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

const p = (ost, nord, hoehe = 210) => ({ ost, nord, hoehe });
const PLATTE = { name: 'P', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.4 };
const kommando = (werkzeug, eingaben, werte = PLATTE) => ({
    schema: KOMMANDO_SCHEMA, id: `k-${werkzeug}`, werkzeug, ziel: [], neu: ['cde-X'],
    werte, eingaben, wer: 'test', wann: '2026-10-01T12:00:00Z',
});

describe('Fund 11 — unbaubar heisst abgelehnt', () => {
    let b, ae;
    beforeEach(() => {
        repo.setBackend(new Speicher());
        setActivePinia(createPinia());
        b = useBearbeitung(); ae = useAenderungen();
    });

    const FAELLE = [
        ['Platte, Punkte im falschen Schlitz', kommando('platte-zeichnen', { zug: [p(0, 0), p(4, 0), p(4, -3)] }), /eingaben\.zug: „platte-zeichnen" nimmt seine Punkte unter eingaben\.umriss/],
        ['Platte ohne Punkte', kommando('platte-zeichnen', {}), /Nicht baubar: .*mindestens 3 Punkte, 0 gesetzt/],
        ['Platte mit 2 Punkten', kommando('platte-zeichnen', { umriss: [p(0, 0), p(4, 0)] }), /Nicht baubar: .*mindestens 3 Punkte, 2 gesetzt/],
        ['Rohr mit 1 Punkt', kommando('rohr-zeichnen', { zug: [p(0, 0)] }, { name: 'R', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 }), /Nicht baubar: .*mindestens 2 Punkte, 1 gesetzt/],
    ];
    for (const [titel, k, grund] of FAELLE) {
        it(`${titel}: abgelehnt mit Grund, das Journal bleibt leer`, async () => {
            const erg = await b.fuehreAus(k);
            expect(erg.ausgefuehrt).toBe(false);
            expect(erg.grund).toMatch(grund);
            expect(ae.eintraege).toHaveLength(0);
        });
    }

    it('Gegenstück: dieselbe Platte mit drei Punkten im richtigen Schlitz wird eingetragen', async () => {
        const erg = await b.fuehreAus(kommando('platte-zeichnen', { umriss: [p(0, 0), p(4, 0), p(4, -3)] }));
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        expect(ae.wirksamerStand('erzeugt').get('cde-X').parameter.punkte).toHaveLength(3);
    });
});
