// @vitest-environment jsdom
/**
 * Teil XXVI, Z9.3 — der RÜB im Gelände: Baugrube um das Bauwerk, nur über
 * Kommandos, und das Paket für den Verbund mit der Geländelieferung.
 *
 * Gelände: geliefert, eben auf 213,00 m NN, GlobalId aus dem Vertrag
 * (`VERTRAG.ur`, dieselbe wie in test_eigenbau.py). Der RÜB aus Z9.2 steht mit
 * Unterkante Bodenplatte 209,60 darin. „Baugrube ums Bauwerk" nimmt den UMRISS
 * eines Bauteils — ein Bauwerk (Behälter ohne Körper) hat keinen; die Grube
 * geht deshalb um die Bodenplatte, deren Umriss beim RÜB das Aussenmass ist.
 *
 * Von Hand (Arbeitsraum 0,50 geböscht, nichtbindig 45°, DIN 4124):
 *   Sohle 209,60, Tiefe h = 3,40, Sohlfläche A = 9,90 · 4,60 = 45,54 m²,
 *   Umfang U = 29,00 m. Die Ableitung böscht über den ABSTAND zum Rand — die
 *   Ecken sind Kegel:  V = A·h + U·h²/2 + π·h³/3
 *                        = 154,836 + 167,620 + 41,158 = 363,614 m³
 *   (scharfe Ecken wären 374,861). Gemessen wird auf dem Raster.
 *
 * Legt das Vertragspaket ab:
 *     VERBUND_VERTRAG_SCHREIBEN=1 npx vitest run src/features/cde/test/abnahmeVerbund.test.js
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
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';
import { grundrissAusMesh } from '../services/geometrie/ops/Umriss.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { baueEigenbauPaket } from '../services/EigenbauPaket.js';
import { auflockerungFuer } from '../services/gelaende/Grabenregeln.js';
import { quader } from './hilfen/erdbauSzenario.js';
import { kommando, RUEB } from './hilfen/ruebKommandos.js';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../backend/app/ifc/tests/daten/paket_rueb_gelaende.json');
const UR = '1Ur0Gelaende0Vertrag00';
const CELL = 0.25;

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

/** Das gelieferte Gelände: eben auf 213,00, 50 × 40 m um den RÜB (Welt-Y = m NN, Versatz 0). */
function gelaendeNetz() {
    const t = [];
    for (let x = -20; x < 30; x++) for (let z = -18; z < 22; z++) {
        const a = [x, 213, z], b = [x + 1, 213, z], c = [x + 1, 213, z + 1], d = [x, 213, z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
// Was der Viewer aus den Modellen liest: das Gelände als Raster, die Bodenplatte als Umriss.
const holeQuellForm = async (gid, form, { cell, bereich = null } = {}) => {
    if (gid === UR && form === 'raster') return rasterAusMesh({ mesh: gelaendeNetz() }, { cell: cell ?? CELL, bereich }).ergebnis;
    if (gid === 'cde-BP' && form === 'umriss') return grundrissAusMesh({ mesh: quader(0, 0, 8.9, 3.6, 209.6, 210) }).ergebnis;
    return null;
};
const GELAENDE = { globalId: UR, name: 'Urgelände', herkunft: 'geliefert', cell: CELL, pruefmass: { triCount: 4000 } };

async function paketAus() {
    const stand = useAenderungen().wirksamerStand('erzeugt');
    const autor = new IfcAutor({ getFragments: () => null, holeQuellForm, kernel: erzeugeKernel(), getHoehenversatz: () => 0 });
    const g = await autor.eigenbauGeometrien([...stand].map(([globalId, wert]) => ({ globalId, wert })), { verdeckt: new Set() });
    return { g, paket: baueEigenbauPaket({ teile: g.bauteile, stand, bauwerke: g.bauwerke,
        crs: 'EPSG:25832', projektname: 'RÜB im Gelände', schluessel: 'rueb-gelaende',
        journal: { commit: 'c-rueb-gelaende', sitzungOffen: false }, jetzt: new Date('2026-10-01T00:00:00Z'),
        nachProjekt: (p) => ({ ost: 410300 + p.x, nord: 5460100 - p.z, hoehe: p.y }) }) };
}

describe('Abnahme Teil XXVI, Z9.3 — der RÜB im Gelände', () => {
    it('Baugrube um die Bodenplatte über ein Kommando: Wirt ist das gelieferte Gelände, Menge gegen die Handrechnung', async () => {
        const b = useBearbeitung(), ae = useAenderungen();
        for (const k of RUEB()) expect((await b.fuehreAus(k)).ausgefuehrt, k.werkzeug).toBe(true);
        // Wie der Viewer: das Subjekt aus dem Stand, angereichert um die Gelände, die er sieht.
        const subjektVon = (gid) => {
            const s = subjektAusStand(gid, { wirksamerStand: ae.wirksamerStand });
            return s ? { ...s, gelaendeQuellen: [GELAENDE] } : null;
        };
        const erg = await b.fuehreAus(kommando('bauwerksgrube-ableiten', {
            ziel: ['cde-BP'], neu: ['cde-GA', 'cde-GR', 'op-GR1'],
            werte: { arbeitsraum: '', wandform: 'boeschung', boden: 'nichtbindig', winkel: '', sohle: '',
                     auflockerung: auflockerungFuer('nichtbindig') },
            eingaben: { auswahl: { gelaende: UR } },
        }), { subjektVon });
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);

        const { g, paket } = await paketAus();
        expect(g.misserfolge ?? [], JSON.stringify(g.misserfolge)).toEqual([]);
        const grube = paket.bauteile.find(t => t.klasse === 'IFCEARTHWORKSCUT');
        expect(grube).toMatchObject({ wirt: UR, fachmodell: 'erdbau', predefinedType: 'EXCAVATION' });
        expect(grube.teilVon ?? null).toBe(null);          // die Grube gehört zum Erdbau, nicht ins Bauwerk
        const v = grube.mengen.undisturbedVolume;
        expect(Math.abs(v - 363.614) / 363.614).toBeLessThan(0.005);   // gemessen 363,637 (0,01 %)

        if (process.env.VERBUND_VERTRAG_SCHREIBEN) writeFileSync(FIXTURE, JSON.stringify(paket));
        expect(existsSync(FIXTURE), 'Fixture fehlt: VERBUND_VERTRAG_SCHREIBEN=1 …').toBe(true);
        const alt = JSON.parse(readFileSync(FIXTURE, 'utf8'));
        expect(alt.bauteile.map(t => [t.cdeId, t.klasse, t.wirt ?? null]).sort())
            .toEqual(paket.bauteile.map(t => [t.cdeId, t.klasse, t.wirt ?? null]).sort());
    });
});
