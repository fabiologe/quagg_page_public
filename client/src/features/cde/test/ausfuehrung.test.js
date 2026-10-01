// @vitest-environment jsdom
/**
 * Fund 8 (Teil XXVI): gezeichnete Bauteile tragen ihre AUSFÜHRUNG — den
 * PredefinedType der IFC-Klasse — und, bei USERDEFINED, den Objekttyp.
 *
 * Vorher (gelesen): `predefinedTypeVon` las den Wert nur aus Ableitungsteilen,
 * kein Zeichenwerkzeug schrieb ihn — jede eigene Platte, Wand, jedes Fundament
 * kam als NOTDEFINED ins IFC. Alles hier geht durch `fuehreAus` und den
 * Paketbauer, denselben Weg wie „Ausgeben".
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';
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

beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
afterEach(() => repo.setBackend(null));

let n = 0;
const ecke = (ost, nord, hoehe = 210) => ({ ost, nord, hoehe });
const WAND = { name: 'Schwelle', kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 0.6 };
const wand = (gid, mehr = {}) => ({ schema: KOMMANDO_SCHEMA, id: `ka-${++n}`, werkzeug: 'wand-zeichnen', ziel: [], neu: [gid],
                                   werte: { ...WAND, ...mehr }, eingaben: { zug: [ecke(0, 0), ecke(4, 0)] },
                                   wer: 'test', wann: '2026-10-01T12:00:00Z' });
const fundament = (gid, mehr = {}) => ({ ...wand(gid), werkzeug: 'streifenfundament-zeichnen',
                                          werte: { name: 'F', kategorie: 'IFCFOOTING', hoehe: '', breite: 0.6, dicke: 0.4, ...mehr } });

async function paketAus(ae) {
    const stand = ae.wirksamerStand('erzeugt');
    const autor = new IfcAutor({ getFragments: () => null, holeQuellForm: () => null, kernel: erzeugeKernel(), getHoehenversatz: () => 0 });
    const g = await autor.eigenbauGeometrien([...stand].map(([globalId, wert]) => ({ globalId, wert })), { verdeckt: new Set() });
    const paket = baueEigenbauPaket({ teile: g.bauteile, stand, bauwerke: g.bauwerke,
                                      nachProjekt: (p) => ({ ost: p.x, nord: -p.z, hoehe: p.y }) });
    return Object.fromEntries(paket.bauteile.map(t => [t.cdeId, t]));
}

describe('Fund 8 — die Ausführung eines gezeichneten Bauteils', () => {
    it('ein Wert aus dem Schema der Klasse kommt ins Paket — klein geschrieben wie gross', async () => {
        const b = useBearbeitung();
        expect((await b.fuehreAus(wand('cde-W', { predefinedType: 'retainingwall' }))).ausgefuehrt).toBe(true);
        expect((await paketAus(useAenderungen()))['cde-W']).toMatchObject({ klasse: 'IFCWALL', predefinedType: 'RETAININGWALL' });
    });

    it('ein Wert, den die Klasse nicht kennt, wird abgelehnt — mit der Liste, die es gibt', async () => {
        const erg = await useBearbeitung().fuehreAus(wand('cde-W', { predefinedType: 'BASESLAB' }));
        expect(erg.ausgefuehrt).toBe(false);
        expect(erg.grund).toMatch(/Ausführung „BASESLAB" gibt es für IFCWALL nicht \(.*RETAININGWALL/);
        expect(useAenderungen().eintraege).toHaveLength(0);
    });

    it('USERDEFINED verlangt den Objekttyp; mit ihm tragen Paket und Bauteil beides', async () => {
        const b = useBearbeitung();
        const ohne = await b.fuehreAus(wand('cde-W', { predefinedType: 'USERDEFINED' }));
        expect(ohne.ausgefuehrt).toBe(false);
        expect(ohne.grund).toMatch(/USERDEFINED braucht einen Objekttyp/);
        expect((await b.fuehreAus(wand('cde-S', { predefinedType: 'USERDEFINED', objektTyp: 'Überlaufschwelle' }))).ausgefuehrt).toBe(true);
        expect((await paketAus(useAenderungen()))['cde-S']).toMatchObject({ predefinedType: 'USERDEFINED', objektTyp: 'Überlaufschwelle' });
    });

    it('leer heisst die Vorgabe des Rezepts — aber nur, wenn die gewählte Klasse sie kennt', async () => {
        const b = useBearbeitung();
        expect((await b.fuehreAus(fundament('cde-F1'))).ausgefuehrt).toBe(true);
        expect((await b.fuehreAus(fundament('cde-F2', { kategorie: 'IFCBUILDINGELEMENTPROXY' }))).ausgefuehrt).toBe(true);
        expect((await b.fuehreAus(wand('cde-W'))).ausgefuehrt).toBe(true);
        const nach = await paketAus(useAenderungen());
        expect([nach['cde-F1'].predefinedType, nach['cde-F2'].predefinedType, nach['cde-W'].predefinedType])
            .toEqual(['STRIP_FOOTING', null, null]);
    });

    it('„Ausführung ändern" an einer gezeichneten Platte schreibt einen neuen Bauplan — und prüft ihn', async () => {
        const b = useBearbeitung();
        const platte = { ...wand('cde-P'), werkzeug: 'platte-zeichnen', werte: { name: 'P', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.4 },
                         eingaben: { umriss: [ecke(0, 0), ecke(4, 0), ecke(4, -3)] } };
        expect((await b.fuehreAus(platte)).ausgefuehrt).toBe(true);
        const setze = (wert) => ({ schema: KOMMANDO_SCHEMA, id: `ka-${++n}`, werkzeug: 'platte-predefinedType-setzen',
                                   ziel: ['cde-P'], werte: { predefinedType: wert }, wer: 'test', wann: '2026-10-01T12:00:00Z' });
        expect((await b.fuehreAus(setze('BASESLAB'))).ausgefuehrt).toBe(true);
        expect((await b.fuehreAus(setze('RETAININGWALL'))).ausgefuehrt).toBe(false);
        expect(useAenderungen().wirksamerStand('erzeugt').get('cde-P').parameter.predefinedType).toBe('BASESLAB');
    });
});
