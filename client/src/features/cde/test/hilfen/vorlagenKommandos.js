/**
 * Teil XXVIII — Kammer und RÜB aus der Vorlage als Kommandos, der Speicher und das Paket.
 * Gebraucht von `vorlagen.test.js` und `einbauten.test.js`.
 */
import { expect } from 'vitest';
import { erzeugeKernel } from '../../services/geometrie/Kernel.js';
import { IfcAutor } from '../../services/IfcAutor.js';
import { baueEigenbauPaket } from '../../services/EigenbauPaket.js';
import { e, k, TEILE } from './kammerKommandos.js';
import { TEILE as RUEB_TEILE } from './ruebKommandos.js';


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


/** Das Paket des wirksamen Stands — wie der Export es baut (Muster `abnahmeBearbeiten`). */
export async function paketAus(ae) {
    const s = ae.wirksamerStand('erzeugt');
    const autor = new IfcAutor({ getFragments: () => null, holeQuellForm: () => null, kernel: erzeugeKernel(), getHoehenversatz: () => 0 });
    const g = await autor.eigenbauGeometrien([...s].map(([globalId, wert]) => ({ globalId, wert })), { verdeckt: new Set() });
    expect(g.misserfolge ?? []).toEqual([]);
    return baueEigenbauPaket({ teile: g.bauteile, stand: s, bauwerke: g.bauwerke, crs: 'EPSG:25832',
        projektname: 'Kammer', schluessel: 'kammer', journal: { commit: 'c-kammer', sitzungOffen: false },
        jetzt: new Date('2026-10-02T00:00:00Z'), nachProjekt: (p) => ({ ost: 410300 + p.x, nord: 5460100 - p.z, hoehe: p.y }) });
}
export const r6 = (v) => Math.round(v * 1e6) / 1e6;
export const beton = (p) => r6(p.bauteile.reduce((a, t) => a + (t.klasse === 'IFCSPACE' ? 0 : t.mengen.netVolume), 0));

/** DIE KAMMER AUS DER VORLAGE — ein Kommando, Kennungen wie in der Kommandofolge (Bauwerk zuerst). */
export const KAMMER_AUS_VORLAGE = (werte = {}) => k('bauwerk-aus-vorlage-rechteckkammer', {
    neu: ['cde-KA', ...TEILE],
    werte: { name: 'Kammer', hoehe: '', laenge: 4, breite: 3, lichteHoehe: 2.5, wand: 0.3, boden: 0.4, decke: 0.25, ...werte },
    eingaben: { zug: [e(0, 0, 210)] },
});

/** DER RÜB AUS DER VORLAGE — Kennungen wie in der Kommandofolge aus Z9.2 (Bauwerk zuerst). */
export const RUEB_W = Object.freeze({ laenge: 4, breite: 3, lichteHoehe: 2.5, wand: 0.3, boden: 0.4, decke: 0.25, ueberlaufhoehe: 2.4, schwelle: 0.5 });
export const RUEB_AUS_VORLAGE = (werte = {}) => k('bauwerk-aus-vorlage-zweikammer-rueb', {
    neu: ['cde-RUEB', ...RUEB_TEILE], werte: { name: 'RÜB', hoehe: '', ...RUEB_W, ...werte }, eingaben: { zug: [e(0, 0, 210)] } });
/** Was der Planer an der Schwelle selbst sagt — die Vorlage steuert es nicht. */
export const RUEB_BEIWERT = () => [
    k('ueberlaufschwelle-ueberfallbeiwert-setzen', { ziel: ['cde-UE'], werte: { ueberfallbeiwert: 0.6 } }),
    k('ueberlaufschwelle-herleitung-setzen', { ziel: ['cde-UE'], werte: { herleitung: 'Annahme der Abnahme, nicht bemessen' } }),
];
