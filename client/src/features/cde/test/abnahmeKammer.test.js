// @vitest-environment jsdom
/**
 * Teil XXVI — Abnahme der Kammer, NUR ÜBER KOMMANDOS (Fahrplan Z9, Punkt 1).
 *
 * Stärker als der Vertrag (`bauwerkVertrag.test.js`), der die Werkzeuge direkt
 * ruft: hier geht jeder Schritt durch `fuehreAus` — Kommandoschema, Kennungen
 * aus `neu` (E2), Subjekt aus dem Journal, Kandidaten aus dem Journal (V3),
 * ganz-oder-gar-nicht ins Journal, Beleg am Vorgang. Danach baut der Autor aus
 * dem JOURNALSTAND, und der Paketbauer verpackt — derselbe Weg wie „Ausgeben".
 *
 * Muster: `durchstichAchse.test.js` (Abnahme C2). Projektkoordinaten Ost/Nord,
 * Höhen in m NN; Höhenversatz 0.
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
import { JOURNAL_KENNT } from '../services/JournalFormat.js';

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
    journal() { const k = [...this.daten.keys()].find(x => x.endsWith(':aenderungen')); return k ? JSON.parse(this.daten.get(k)) : null; }
}

let speicher;
beforeEach(() => { speicher = new Speicher(); repo.setBackend(speicher); setActivePinia(createPinia()); });
afterEach(() => repo.setBackend(null));

let n = 0;
const kommando = (werkzeug, rest) => ({ schema: KOMMANDO_SCHEMA, id: `ko-${++n}`, werkzeug, ziel: [], wer: 'fabio',
                                        wann: '2026-10-01T12:00:00Z', ...rest });
const ecke = (ost, nord, hoehe) => ({ ost, nord, hoehe });
const RECHTECK = (h) => [ecke(0, 0, h), ecke(4.6, 0, h), ecke(4.6, -3.6, h), ecke(0, -3.6, h)];
const WAND = { kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 2.5, predefinedType: 'RETAININGWALL' };
const TEILE = ['cde-BP', 'cde-WN', 'cde-WS', 'cde-WW', 'cde-WO', 'cde-DE', 'cde-RA'];

/** Die Kammer aus Abschnitt 6 des Fahrplans — als Kommandofolge. */
const KAMMER = () => [
    kommando('platte-zeichnen', { neu: ['cde-BP'], werte: { name: 'Bodenplatte', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.4, predefinedType: 'BASESLAB' },
                                  eingaben: { umriss: RECHTECK(210.0) } }),
    kommando('wand-zeichnen', { neu: ['cde-WN'], werte: { name: 'Längswand Nord', ...WAND },
                                eingaben: { zug: [ecke(0, -0.15, 210), ecke(4.6, -0.15, 210)] } }),
    kommando('wand-zeichnen', { neu: ['cde-WS'], werte: { name: 'Längswand Süd', ...WAND },
                                eingaben: { zug: [ecke(0, -3.45, 210), ecke(4.6, -3.45, 210)] } }),
    kommando('wand-zeichnen', { neu: ['cde-WW'], werte: { name: 'Querwand West', ...WAND },
                                eingaben: { zug: [ecke(0.15, -0.3, 210), ecke(0.15, -3.3, 210)] } }),
    kommando('wand-zeichnen', { neu: ['cde-WO'], werte: { name: 'Querwand Ost', ...WAND },
                                eingaben: { zug: [ecke(4.45, -0.3, 210), ecke(4.45, -3.3, 210)] } }),
    kommando('platte-zeichnen', { neu: ['cde-DE'], werte: { name: 'Decke', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.25, predefinedType: 'ROOF' },
                                  eingaben: { umriss: RECHTECK(212.75) } }),
    kommando('raum-zeichnen', { neu: ['cde-RA'], werte: { name: 'Kammerraum', hoehe: '', raumhoehe: 2.5 },
                                eingaben: { umriss: [ecke(0.3, -0.3, 210), ecke(4.3, -0.3, 210), ecke(4.3, -3.3, 210), ecke(0.3, -3.3, 210)] } }),
    kommando('bauwerk-anlegen', { neu: ['cde-KA'], werte: { name: 'Kammer', art: 'anlage', bauwerkstyp: 'RRB' } }),
    ...TEILE.map(gid => kommando('bauwerk-zuordnen', { ziel: [gid], eingaben: { auswahl: { bauwerk: 'cde-KA' } } })),
];

async function paketAus(ae) {
    const stand = ae.wirksamerStand('erzeugt');
    const autor = new IfcAutor({ getFragments: () => null, holeQuellForm: () => null, kernel: erzeugeKernel(), getHoehenversatz: () => 0 });
    const g = await autor.eigenbauGeometrien([...stand].map(([globalId, wert]) => ({ globalId, wert })), { verdeckt: new Set() });
    return baueEigenbauPaket({ teile: g.bauteile, stand, bauwerke: g.bauwerke,
                               nachProjekt: (p) => ({ ost: 410300 + p.x, nord: 5460100 - p.z, hoehe: p.y }) });
}
const r3 = (v) => Math.round(v * 1000) / 1000;

describe('Abnahme Teil XXVI — die Kammer, nur über Kommandos', () => {
    it('zeichnen, anlegen, zuordnen — und das Paket trägt die Zahlen aus Abschnitt 6', async () => {
        const b = useBearbeitung(), ae = useAenderungen();
        for (const k of KAMMER()) {
            const erg = await b.fuehreAus(k);
            expect(erg.ausgefuehrt, `${k.werkzeug}: ${erg.grund ?? ''}`).toBe(true);
        }
        const stand = ae.wirksamerStand('erzeugt');
        expect(stand.get('cde-KA')).toMatchObject({ rezept: 'bauwerk', name: 'Kammer', kategorie: null,
                                                    parameter: { art: 'anlage', bauwerkstyp: 'RRB' } });
        expect(TEILE.map(g => stand.get(g).parameter.teilVon)).toEqual(TEILE.map(() => 'cde-KA'));

        // Jeder Vorgang trägt seinen Beleg, der Vorgang IST das Kommando (E1).
        expect(ae.eintraege.filter(e => e.kommando).length).toBe(KAMMER().length);
        // Die Datei verlangt die Stufe, die dieser Client schreibt (E23, seit 2026-10-06 Stufe 7);
        // die Texttabelle bleibt leer, wenn sich nichts wiederholt.
        expect(speicher.journal().mindestClient).toBe(JOURNAL_KENNT);
        expect(JOURNAL_KENNT).toBe(7);

        const paket = await paketAus(ae);
        const nach = Object.fromEntries(paket.bauteile.map(t => [t.cdeId, t]));
        expect(paket.bauwerke).toEqual([expect.objectContaining({ cdeId: 'cde-KA', art: 'anlage', name: 'Kammer',
                                                                 klassifikation: expect.objectContaining({ code: 'RRB' }) })]);
        const beton = paket.bauteile.filter(t => t.klasse !== 'IFCSPACE').reduce((a, t) => a + t.mengen.netVolume, 0);
        expect(r3(beton)).toBe(22.164);
        expect([r3(nach['cde-RA'].mengen.netVolume), r3(nach['cde-RA'].mengen.netFloorArea)]).toEqual([30, 12]);
        expect(nach['cde-WN'].merkmale).toEqual({ Pset_WallCommon: { LoadBearing: true, IsExternal: true } });
        // Fund 8: die Ausführungen aus Abschnitt 6 — der Raum ohne Angabe nach Vorgabe innen.
        expect(Object.fromEntries(TEILE.map(g => [g, nach[g].predefinedType]))).toEqual({
            'cde-BP': 'BASESLAB', 'cde-WN': 'RETAININGWALL', 'cde-WS': 'RETAININGWALL', 'cde-WW': 'RETAININGWALL',
            'cde-WO': 'RETAININGWALL', 'cde-DE': 'ROOF', 'cde-RA': 'INTERNAL' });
    });

    it('E17 über Kommandos: ein zweites Zuordnen ersetzt — und Rückgängig holt das erste zurück', async () => {
        const b = useBearbeitung(), ae = useAenderungen();
        for (const k of KAMMER()) await b.fuehreAus(k);
        expect((await b.fuehreAus(kommando('bauwerk-anlegen', { neu: ['cde-K2'], werte: { name: 'Zweite', art: 'anlage' } }))).ausgefuehrt).toBe(true);
        expect((await b.fuehreAus(kommando('bauwerk-zuordnen', { ziel: ['cde-BP'], eingaben: { auswahl: { bauwerk: 'cde-K2' } } }))).ausgefuehrt).toBe(true);
        expect(ae.wirksamerStand('erzeugt').get('cde-BP').parameter.teilVon).toBe('cde-K2');
        await ae.zurueck();
        expect(ae.wirksamerStand('erzeugt').get('cde-BP').parameter.teilVon).toBe('cde-KA');
    });

    it('ein Bauwerk kann nicht in sein eigenes Teilbauwerk — die Kandidaten aus dem Journal schliessen es aus', async () => {
        const b = useBearbeitung();
        await b.fuehreAus(kommando('bauwerk-anlegen', { neu: ['cde-R'], werte: { name: 'RÜB', art: 'anlage' } }));
        await b.fuehreAus(kommando('bauwerk-anlegen', { neu: ['cde-T'], werte: { name: 'Teil', art: 'anlage' } }));
        expect((await b.fuehreAus(kommando('bauwerk-zuordnen', { ziel: ['cde-T'], eingaben: { auswahl: { bauwerk: 'cde-R' } } }))).ausgefuehrt).toBe(true);
        const kreis = await b.fuehreAus(kommando('bauwerk-zuordnen', { ziel: ['cde-R'], eingaben: { auswahl: { bauwerk: 'cde-T' } } }));
        expect(kreis.ausgefuehrt).toBe(false);
    });
});
