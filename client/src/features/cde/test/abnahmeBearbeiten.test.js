// @vitest-environment jsdom
/**
 * Teil XXVII, B7 — Abnahme: die Kammer BEARBEITEN, nur über Kommandos.
 *
 * Die Kammer aus Teil XXVI (Abschnitt 6: Bodenplatte 4,60 × 3,60 × 0,40 mit
 * Oberkante 210,00, vier Wände 0,30 × 2,50, Decke 0,25, Raum 4,00 × 3,00 × 2,50),
 * die Wände und der Raum auf die Platte gestellt, die Decke auf die Längswand.
 * Dann, je ein Kommando:
 *   A  Bauwerk verschieben +10 m Ost
 *   B  Bauwerk kopieren +20 m Ost
 *   C  Bodenplatte +0,20 m           → Wände, Raum 210,20; Decke Unterkante 212,70; die Kopie bleibt
 *   D  Öffnung Ø 0,30 in der Längswand Nord → NetVolume 3,450 − π·0,15²·0,30 = 3,428 794 m³
 *   E  Rohr DN 300 und Durchführung durch die Längswand Süd → Ø 0,40,
 *      NetVolume 3,450 − π·0,20²·0,30 = 3,412 301 m³
 * Nach jedem Schritt das Paket. Danach Rückgängig, Schritt für Schritt, bis zum
 * Anfang — jeder Zwischenstand gleich dem auf dem Hinweg.
 *
 * Legt das Vertragspaket ab (Endstand):
 *     BEARBEITUNG_VERTRAG_SCHREIBEN=1 npx vitest run src/features/cde/test/abnahmeBearbeiten.test.js
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
import { KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';
import { nachId } from '../services/Bearbeitungen.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { baueEigenbauPaket } from '../services/EigenbauPaket.js';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../backend/app/ifc/tests/daten/paket_kammer_bearbeitet.json');

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
const k = (werkzeug, rest) => ({ schema: KOMMANDO_SCHEMA, id: `ab-${++n}`, werkzeug, ziel: [], wer: 'fabio', wann: '2026-10-02T12:00:00Z', ...rest });
const e = (ost, nord, hoehe) => ({ ost, nord, hoehe });
const RECHTECK = (h) => [e(0, 0, h), e(4.6, 0, h), e(4.6, -3.6, h), e(0, -3.6, h)];
const WAND = { kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 2.5, predefinedType: 'RETAININGWALL' };
const TEILE = ['cde-BP', 'cde-WN', 'cde-WS', 'cde-WW', 'cde-WO', 'cde-DE', 'cde-RA'];
const KAMMER = () => [
    k('platte-zeichnen', { neu: ['cde-BP'], werte: { name: 'Bodenplatte', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.4, predefinedType: 'BASESLAB' }, eingaben: { umriss: RECHTECK(210) } }),
    k('wand-zeichnen', { neu: ['cde-WN'], werte: { name: 'Längswand Nord', ...WAND }, eingaben: { zug: [e(0, -0.15, 210), e(4.6, -0.15, 210)] } }),
    k('wand-zeichnen', { neu: ['cde-WS'], werte: { name: 'Längswand Süd', ...WAND }, eingaben: { zug: [e(0, -3.45, 210), e(4.6, -3.45, 210)] } }),
    k('wand-zeichnen', { neu: ['cde-WW'], werte: { name: 'Querwand West', ...WAND }, eingaben: { zug: [e(0.15, -0.3, 210), e(0.15, -3.3, 210)] } }),
    k('wand-zeichnen', { neu: ['cde-WO'], werte: { name: 'Querwand Ost', ...WAND }, eingaben: { zug: [e(4.45, -0.3, 210), e(4.45, -3.3, 210)] } }),
    k('platte-zeichnen', { neu: ['cde-DE'], werte: { name: 'Decke', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.25, predefinedType: 'ROOF' }, eingaben: { umriss: RECHTECK(212.75) } }),
    k('raum-zeichnen', { neu: ['cde-RA'], werte: { name: 'Kammerraum', hoehe: '', raumhoehe: 2.5 }, eingaben: { umriss: [e(0.3, -0.3, 210), e(4.3, -0.3, 210), e(4.3, -3.3, 210), e(0.3, -3.3, 210)] } }),
    k('bauwerk-anlegen', { neu: ['cde-KA'], werte: { name: 'Kammer', art: 'anlage', bauwerkstyp: 'RRB' } }),
    ...TEILE.map(gid => k('bauwerk-zuordnen', { ziel: [gid], eingaben: { auswahl: { bauwerk: 'cde-KA' } } })),
    ...['cde-WN', 'cde-WS', 'cde-WW', 'cde-WO', 'cde-RA'].map(gid => k('auf-bauteil-stellen', { ziel: [gid], werte: { bauteil: 'cde-BP', mass: 'oberkante', versatz: 0 } })),
    k('auf-bauteil-stellen', { ziel: ['cde-DE'], werte: { bauteil: 'cde-WN', mass: 'oberkante', versatz: 0 } }),
];

describe('Abnahme Teil XXVII — die Kammer bearbeiten, nur über Kommandos', () => {
    it('A–E nacheinander, das Paket nach jedem Schritt; dann Rückgängig bis zum Anfang', async () => {
        const b = useBearbeitung(), ae = useAenderungen();
        const plan = (g) => ae.wirksamerStand('erzeugt').get(g);
        const vor = (id, g) => nachId(id).vorbelegung(subjektAusStand(g, { wirksamerStand: ae.wirksamerStand }), {});
        const uk = (g) => rezeptNach(plan(g).rezept).stand.lies(plan(g).parameter);
        const stand = () => JSON.stringify([...ae.wirksamerStand('erzeugt')].sort(([a], [c]) => a.localeCompare(c)));
        const schnappschuesse = [stand()];
        const fuehre = async (kom) => {
            const erg = await b.fuehreAus(kom);
            expect(erg.ausgefuehrt, `${kom.werkzeug} ${kom.ziel ?? ''}: ${erg.grund ?? ''}`).toBe(true);
            schnappschuesse.push(stand());
            return erg;
        };
        const paket = async () => {
            const s = ae.wirksamerStand('erzeugt');
            const autor = new IfcAutor({ getFragments: () => null, holeQuellForm: () => null, kernel: erzeugeKernel(), getHoehenversatz: () => 0 });
            const g = await autor.eigenbauGeometrien([...s].map(([globalId, wert]) => ({ globalId, wert })), { verdeckt: new Set() });
            expect(g.misserfolge ?? []).toEqual([]);
            return baueEigenbauPaket({ teile: g.bauteile, stand: s, bauwerke: g.bauwerke, crs: 'EPSG:25832',
                projektname: 'Kammer bearbeitet', schluessel: 'kammer-bearbeitet',
                journal: { commit: 'c-kammer-bearbeitet', sitzungOffen: false }, jetzt: new Date('2026-10-02T00:00:00Z'),
                nachProjekt: (p) => ({ ost: 410300 + p.x, nord: 5460100 - p.z, hoehe: p.y }) });
        };
        const r6 = (v) => Math.round(v * 1e6) / 1e6;

        for (const kom of KAMMER()) await fuehre(kom);
        expect(r6((await paket()).bauteile.reduce((a, t) => a + (t.klasse === 'IFCSPACE' ? 0 : t.mengen.netVolume), 0))).toBe(22.164);

        // A — das Bauwerk als Ganzes
        const x0 = plan('cde-WO').parameter.punkte[0][0];
        await fuehre(k('bauwerk-verschieben', { ziel: ['cde-KA'], werte: { ost: 10, nord: 0, hoehe: 0 } }));
        expect(plan('cde-WO').parameter.punkte[0][0] - x0).toBeCloseTo(10, 9);

        // B — eine Kopie, auf ihrer eigenen Platte
        const neu = ['cde-KK', ...TEILE.map((_, i) => `cde-KK${i}`)];
        await fuehre(k('bauwerk-kopieren', { ziel: ['cde-KA'], neu, werte: { ost: 20, nord: 0, hoehe: 0 } }));
        expect((await paket()).bauwerke.map(w => w.cdeId).sort()).toEqual(['cde-KA', 'cde-KK']);

        // C — Bodenplatte +0,20: was darauf steht, folgt; die Kopie nicht
        const v = vor('verschieben', 'cde-BP');
        const c = await fuehre(k('verschieben', { ziel: ['cde-BP'], werte: { ...v, hoehe: v.hoehe + 0.2 } }));
        expect(c.eintraege).toHaveLength(1 + 5 + 1);
        for (const g of ['cde-WN', 'cde-WS', 'cde-WW', 'cde-WO', 'cde-RA']) expect(uk(g), g).toBeCloseTo(210.2, 9);
        expect(uk('cde-DE')).toBeCloseTo(212.7, 9);
        expect(uk('cde-KK1')).toBeCloseTo(210, 9);

        // D — Öffnung Ø 0,30 in der Längswand Nord
        await fuehre(k('oeffnung-setzen', { ziel: ['cde-WN'], neu: ['cde-OE', 'op-OE'],
            werte: { form: 'rund', station: 2.3, unterkante: 1, durchmesser: 0.3, breite: '', hoehe: '' } }));
        let p = await paket();
        const wn = p.bauteile.find(t => t.cdeId === 'cde-WN');
        expect(r6(wn.mengen.netVolume)).toBe(3.428794);
        expect(r6(wn.mengen.grossVolume)).toBe(3.45);

        // E — ein Rohr DN 300 durch die Längswand Süd, und seine Durchführung
        await fuehre(k('rohr-zeichnen', { neu: ['cde-RO'], werte: { name: 'Ablauf', kategorie: 'IFCPIPESEGMENT', hoehe: 210.6, dn: 300 },
            eingaben: { zug: [e(12.3, -2, 210.6), e(12.3, -5.5, 210.6)] } }));
        await fuehre(k('durchfuehrung-setzen', { ziel: ['cde-RO'], neu: ['cde-DF', 'op-DF'], werte: { wirt: 'cde-WS', ringspalt: 0.05 } }));
        p = await paket();
        const oeffnungen = p.bauteile.filter(t => t.klasse === 'IFCOPENINGELEMENT').map(t => [t.wirt, r6(t.mengen.width)]).sort();
        expect(oeffnungen).toEqual([['cde-WN', 0.3], ['cde-WS', 0.4]]);
        expect(r6(p.bauteile.find(t => t.cdeId === 'cde-WS').mengen.netVolume)).toBe(3.412301);

        if (process.env.BEARBEITUNG_VERTRAG_SCHREIBEN) writeFileSync(FIXTURE, JSON.stringify(p));
        expect(existsSync(FIXTURE), 'Fixture fehlt: BEARBEITUNG_VERTRAG_SCHREIBEN=1 …').toBe(true);
        const alt = JSON.parse(readFileSync(FIXTURE, 'utf8'));
        expect(alt.bauteile.map(t => [t.cdeId, t.klasse, t.wirt ?? null, t.teilVon ?? null]))
            .toEqual(p.bauteile.map(t => [t.cdeId, t.klasse, t.wirt ?? null, t.teilVon ?? null]));

        // Rückgängig, Schritt für Schritt — jeder Zwischenstand wie auf dem Hinweg.
        for (let i = schnappschuesse.length - 2; i >= 0; i--) {
            await ae.zurueck();
            expect(stand(), `nach Rückgängig zu Schritt ${i}`).toBe(schnappschuesse[i]);
        }
        expect(ae.wirksamerStand('erzeugt').size).toBe(0);
    });
});
