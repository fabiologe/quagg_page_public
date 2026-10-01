// @vitest-environment jsdom
/**
 * Teil XXVI, Z8 — Fachmerkmale als Katalog (Fund 10).
 *
 * Bis hierher liessen beide Seiten nur bSI-Sätze zu: `Merkmalsziele` (Regex
 * `Pset_`) und der Schreiber (`_bsi_merkmale` über die bSI-Vorlagen). Jetzt
 * kommen die hauseigenen Sätze aus EINEM Katalog
 * (`backend/app/ifc/daten/quagg-merkmale.json`), den beide lesen.
 *
 * Die Probe aus dem Fahrplan: eine Überlaufschwelle (Fuss 211,90, Höhe 0,50)
 * trägt `Quagg_Entlastung.SchwellenhoeheNN = 212,40` — gemessen an ihrer
 * Oberkante, nicht getippt. Legt das Vertragspaket für den Schreiber ab:
 *
 *     FACHMERKMALE_VERTRAG_SCHREIBEN=1 npx vitest run src/features/cde/test/fachmerkmale.test.js
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { baueEigenbauPaket } from '../services/EigenbauPaket.js';
import { pruefeEintrag } from '../services/katalog/Katalogschema.js';
import { EINGEBAUTE_REZEPTE } from '../services/rezept/Eingebaut.js';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../backend/app/ifc/tests/daten/paket_schwelle.json');

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
const ecke = (ost, nord, hoehe) => ({ ost, nord, hoehe });
const kommando = (werkzeug, rest) => ({ schema: KOMMANDO_SCHEMA, id: `fm-${++n}`, werkzeug, ziel: [], wer: 'test',
                                        wann: '2026-10-01T12:00:00Z', ...rest });
const SCHWELLE = () => kommando('ueberlaufschwelle-zeichnen', {
    neu: ['cde-SW'],
    werte: { name: 'Beckenüberlauf', kategorie: 'IFCWALL', hoehe: 211.9, dicke: 0.3, wandhoehe: 0.5,
             ueberlaufart: 'Beckenüberlauf', schwellenlaenge: 4, ueberfallbeiwert: 0.6, herleitung: 'Probe Teil XXVI, Z8' },
    eingaben: { zug: [ecke(0, -1, 211.9), ecke(4, -1, 211.9)] },
});
const RAUM = () => kommando('raum-zeichnen', {
    neu: ['cde-RA'], werte: { name: 'Speicherraum', hoehe: 210, raumhoehe: 2.5, betriebswasser: 212.4 },
    eingaben: { umriss: [ecke(0, 0, 210), ecke(4, 0, 210), ecke(4, -3, 210), ecke(0, -3, 210)] },
});

async function paketAus() {
    const stand = useAenderungen().wirksamerStand('erzeugt');
    const autor = new IfcAutor({ getFragments: () => null, holeQuellForm: () => null, kernel: erzeugeKernel(), getHoehenversatz: () => 0 });
    const g = await autor.eigenbauGeometrien([...stand].map(([globalId, wert]) => ({ globalId, wert })), { verdeckt: new Set() });
    return baueEigenbauPaket({ teile: g.bauteile, stand, bauwerke: g.bauwerke,
                               crs: 'EPSG:25832', projektname: 'Schwelle', schluessel: 'schwelle',
                               nachProjekt: (p) => ({ ost: 410300 + p.x, nord: 5460100 - p.z, hoehe: p.y }) });
}

describe('Z8 — die Überlaufschwelle trägt Quagg_Entlastung', () => {
    it('Schwellenhöhe gemessen (212,40), die übrigen Zahlen aus den Feldern, USERDEFINED mit Objekttyp', async () => {
        const b = useBearbeitung();
        for (const k of [SCHWELLE(), RAUM()]) {
            const erg = await b.fuehreAus(k);
            expect(erg.ausgefuehrt, `${k.werkzeug}: ${erg.grund ?? ''}`).toBe(true);
        }
        const paket = await paketAus();
        const nach = Object.fromEntries(paket.bauteile.map(t => [t.cdeId, t]));
        expect(nach['cde-SW']).toMatchObject({ klasse: 'IFCWALL', predefinedType: 'USERDEFINED', objektTyp: 'Überlaufschwelle' });
        expect(nach['cde-SW'].merkmale).toEqual({
            Pset_WallCommon: { LoadBearing: false, IsExternal: false },
            Quagg_Entlastung: { Art: 'Beckenüberlauf', SchwellenhoeheNN: 212.4, Schwellenlaenge: 4,
                                Ueberfallbeiwert: 0.6, Herleitung: 'Probe Teil XXVI, Z8' },
        });
        expect(nach['cde-RA'].merkmale).toEqual({ Quagg_Speicherraum: { SohlhoeheNN: 210, BetriebswasserNN: 212.4 } });

        if (process.env.FACHMERKMALE_VERTRAG_SCHREIBEN) writeFileSync(FIXTURE, JSON.stringify(paket));
        expect(existsSync(FIXTURE), 'Fixture fehlt: FACHMERKMALE_VERTRAG_SCHREIBEN=1 …').toBe(true);
        const alt = JSON.parse(readFileSync(FIXTURE, 'utf8'));
        expect(alt.bauteile.map(t => [t.cdeId, t.merkmale])).toEqual(paket.bauteile.map(t => [t.cdeId, t.merkmale]));
    });

    it('die Schwellenhöhe folgt dem Körper: höher gezogen, höher im Paket — ohne zweite Eingabe', async () => {
        const b = useBearbeitung();
        await b.fuehreAus(SCHWELLE());
        const erg = await b.fuehreAus(kommando('ueberlaufschwelle-wandhoehe-setzen', { ziel: ['cde-SW'], werte: { wandhoehe: 0.7 } }));
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        expect((await paketAus()).bauteile[0].merkmale.Quagg_Entlastung.SchwellenhoeheNN).toBe(212.6);
    });
});

describe('Z8 — der Katalog lässt nur erklärte Sätze zu', () => {
    const wand = EINGEBAUTE_REZEPTE.find(r => r.id === 'wand');
    const probe = (mehr) => pruefeEintrag('rezept', { ...wand, id: 'probe-schwelle', ...mehr });

    it('die eingebauten Rezepte bestehen ihr eigenes Schema', () => {
        for (const id of ['ueberlaufschwelle', 'raum']) {
            const r = EINGEBAUTE_REZEPTE.find(x => x.id === id);
            expect(pruefeEintrag('rezept', { ...r, id: `kopie-${id}` }).fehler).toEqual([]);
        }
    });

    it('ein vertippter Quagg-Satz ist kein neuer Satz', () => {
        const f = probe({ felder: [...wand.felder, { name: 'x', titel: 'X', typ: 'zahl', leerErlaubt: true, pset: 'Quagg_Entlastungg.Schwellenlaenge' }] });
        expect(f.fehler.join(' ')).toMatch(/Quagg_Entlastungg" kennt das Wörterbuch nicht/);
    });

    it('ein Satz gilt nur für seine Klasse; ein Lagemerkmal ist eine Länge und ein bekanntes Mass', () => {
        expect(probe({ felder: [...wand.felder, { name: 'x', titel: 'X', typ: 'zahl', leerErlaubt: true, pset: 'Quagg_Speicherraum.BetriebswasserNN' }] })
            .fehler.join(' ')).toMatch(/„Quagg_Speicherraum" gilt nicht für IFCWALL/);
        expect(probe({ lagemerkmale: { 'Quagg_Entlastung.Ueberfallbeiwert': 'oberkante' } }).fehler.join(' '))
            .toMatch(/IfcReal ist keine Länge/);
        expect(probe({ lagemerkmale: { 'Quagg_Entlastung.SchwellenhoeheNN': 'mitte' } }).fehler.join(' '))
            .toMatch(/„mitte" ist kein Lagemass/);
        expect(probe({ lagemerkmale: { 'Quagg_Entlastung.SchwellenhoeheNN': 'oberkante' } }).fehler).toEqual([]);
    });
});
