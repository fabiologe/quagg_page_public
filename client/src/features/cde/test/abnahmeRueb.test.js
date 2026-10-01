// @vitest-environment jsdom
/**
 * Teil XXVI, Z9.2 — ein Regenüberlaufbecken OHNE Ports und ohne Einbautechnik,
 * NUR ÜBER KOMMANDOS. Gerechnet wird nicht: das Speichervolumen ist ein
 * Messwert (`IfcSpace.NetVolume`), keine Eingabe.
 *
 * Zwei Kammern, lichte Maße je 4,00 × 3,00 × 2,50 m. Dazwischen eine Trennwand
 * 0,30 m, 1,90 m hoch, und auf ihr die Überlaufschwelle 0,50 m — Oberkante
 * 212,40 m NN. Aussenmass 8,90 × 3,60 m, Oberkante Bodenplatte 210,00.
 *
 *   Bodenplatte   8,90 · 3,60 · 0,40          = 12,816 m³
 *   Längswände    2 · 8,90 · 0,30 · 2,50      = 13,350 m³
 *   Stirnwände    2 · 3,00 · 0,30 · 2,50      =  4,500 m³
 *   Trennwand     3,00 · 0,30 · 1,90          =  1,710 m³
 *   Schwelle      3,00 · 0,30 · 0,50          =  0,450 m³
 *   Decke         8,90 · 3,60 · 0,25          =  8,010 m³
 *   Beton                                     = 40,836 m³
 *   Speicherraum  2 · 4,00 · 3,00 · 2,50      = 60,000 m³
 *
 * Gegenprobe der Aussenwände: Ringfläche 8,90 · 3,60 − 2 · 12,00 − 3,00 · 0,30
 * = 7,14 m², · 2,50 = 17,85 m³ = 13,35 + 4,50.
 *
 * Legt das Vertragspaket für den Schreiber ab:
 *     RUEB_VERTRAG_SCHREIBEN=1 npx vitest run src/features/cde/test/abnahmeRueb.test.js
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { RUEB, TEILE } from './hilfen/ruebKommandos.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { baueEigenbauPaket } from '../services/EigenbauPaket.js';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../backend/app/ifc/tests/daten/paket_rueb.json');

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

async function paketAus() {
    const stand = useAenderungen().wirksamerStand('erzeugt');
    const autor = new IfcAutor({ getFragments: () => null, holeQuellForm: () => null, kernel: erzeugeKernel(), getHoehenversatz: () => 0 });
    const g = await autor.eigenbauGeometrien([...stand].map(([globalId, wert]) => ({ globalId, wert })), { verdeckt: new Set() });
    return baueEigenbauPaket({ teile: g.bauteile, stand, bauwerke: g.bauwerke,
                               crs: 'EPSG:25832', projektname: 'RÜB', schluessel: 'rueb',
                               journal: { commit: 'c-rueb', sitzungOffen: false }, jetzt: new Date('2026-10-01T00:00:00Z'),
                               nachProjekt: (p) => ({ ost: 410300 + p.x, nord: 5460100 - p.z, hoehe: p.y }) });
}
const r3 = (v) => Math.round(v * 1000) / 1000;

describe('Abnahme Teil XXVI, Z9.2 — ein RÜB ohne Ports, nur über Kommandos', () => {
    it('Beton 40,836 m³, zwei Kammern zu je 30 m³, Schwelle 212,40 gemessen, Klassifizierung RUEB', async () => {
        const b = useBearbeitung();
        for (const k of RUEB()) {
            const erg = await b.fuehreAus(k);
            expect(erg.ausgefuehrt, `${k.werkzeug} ${k.neu ?? k.ziel}: ${erg.grund ?? ''}`).toBe(true);
        }
        const paket = await paketAus();
        const nach = Object.fromEntries(paket.bauteile.map(t => [t.cdeId, t]));
        expect(paket.bauteile.map(t => t.cdeId).sort()).toEqual([...TEILE].sort());
        expect(paket.bauteile.every(t => t.teilVon === 'cde-RUEB')).toBe(true);
        expect(paket.bauwerke).toEqual([expect.objectContaining({ cdeId: 'cde-RUEB', art: 'anlage', name: 'RÜB',
                                                                 klassifikation: expect.objectContaining({ code: 'RUEB' }) })]);

        const beton = paket.bauteile.filter(t => t.klasse !== 'IFCSPACE').map(t => [t.cdeId, r3(t.mengen.netVolume)]);
        expect(Object.fromEntries(beton)).toEqual({ 'cde-BP': 12.816, 'cde-LN': 6.675, 'cde-LS': 6.675, 'cde-SW': 2.25,
                                                    'cde-SO': 2.25, 'cde-TW': 1.71, 'cde-UE': 0.45, 'cde-DE': 8.01 });
        expect(r3(beton.reduce((a, [, v]) => a + v, 0))).toBe(40.836);
        expect(r3(nach['cde-R1'].mengen.netVolume + nach['cde-R2'].mengen.netVolume)).toBe(60);

        expect(nach['cde-UE']).toMatchObject({ predefinedType: 'USERDEFINED', objektTyp: 'Überlaufschwelle' });
        expect(nach['cde-UE'].merkmale.Quagg_Entlastung.SchwellenhoeheNN).toBe(212.4);
        // Die Betriebshöhe der Kammern ist die Schwelle — hier getippt, und sie stimmt mit der gemessenen überein.
        for (const r of ['cde-R1', 'cde-R2']) {
            expect(nach[r].merkmale).toEqual({ Quagg_Speicherraum: { SohlhoeheNN: 210, BetriebswasserNN: 212.4 } });
        }

        if (process.env.RUEB_VERTRAG_SCHREIBEN) writeFileSync(FIXTURE, JSON.stringify(paket));
        expect(existsSync(FIXTURE), 'Fixture fehlt: RUEB_VERTRAG_SCHREIBEN=1 …').toBe(true);
        const alt = JSON.parse(readFileSync(FIXTURE, 'utf8'));
        expect(alt.bauteile.map(t => [t.cdeId, t.merkmale, t.mengen])).toEqual(paket.bauteile.map(t => [t.cdeId, t.merkmale, t.mengen]));
    });
});
