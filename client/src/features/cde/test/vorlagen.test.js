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
import { nachId } from '../services/Bearbeitungen.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { baueEigenbauPaket } from '../services/EigenbauPaket.js';
import { BAUWERKSVORLAGEN } from '../services/rezept/Bauwerksvorlagen.js';
import { e, k, KAMMER, TEILE } from './hilfen/kammerKommandos.js';

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
    // Der Weg über Einzelkommandos bleibt, wie er ist; V1 dreht den Fund unten (1 Kommando).
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
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const beton = (p) => r6(p.bauteile.reduce((a, t) => a + (t.klasse === 'IFCSPACE' ? 0 : t.mengen.netVolume), 0));

/** DIE KAMMER AUS DER VORLAGE — ein Kommando, Kennungen wie in der Kommandofolge (Bauwerk zuerst). */
export const KAMMER_AUS_VORLAGE = (werte = {}) => k('bauwerk-aus-vorlage-rechteckkammer', {
    neu: ['cde-KA', ...TEILE],
    werte: { name: 'Kammer', hoehe: '', laenge: 4, breite: 3, lichteHoehe: 2.5, wand: 0.3, boden: 0.4, decke: 0.25, ...werte },
    eingaben: { zug: [e(0, 0, 210)] },
});

describe('Teil XXVIII, V1/V2 — die Rechteckkammer aus EINER Vorlage', () => {
    it('Fund 1 gedreht: eine Kammer = 1 Kommando, 1 Vorgang, 1 Rückgängig', async () => {
        const erg = await b.fuehreAus(KAMMER_AUS_VORLAGE());
        expect(erg.ausgefuehrt, erg.grund).toBe(true);
        expect(ae.eintraege).toHaveLength(8);
        expect(new Set(ae.eintraege.map(x => x.vorgang)).size).toBe(1);
        // Die Kennungen je Rolle stehen am Bauwerk, jedes Teil gehört zu ihm.
        const s = ae.wirksamerStand('erzeugt');
        const vorlage = s.get('cde-KA').parameter.bauwerksvorlage;
        expect(vorlage.id).toBe('rechteckkammer');
        expect(Object.values(vorlage.rollen)).toEqual(TEILE);
        for (const gid of TEILE) expect(s.get(gid).parameter.teilVon).toBe('cde-KA');
        expect(s.get('cde-WN').parameter.hoeheVon).toEqual({ bauteil: 'cde-BP', mass: 'oberkante', versatz: 0 });
        expect(s.get('cde-DE').parameter.hoeheVon).toEqual({ bauteil: 'cde-WN', mass: 'oberkante', versatz: 0 });
        expect(s.get('cde-BP').parameter.hoeheVon).toBeUndefined();
        // EIN Rückgängig nimmt alles zurück.
        await ae.zurueck();
        expect(ae.wirksamerStand('erzeugt').size).toBe(0);
    });

    it('das Paket ist das der Kammer aus 21 Kommandos — Beton 22,164 m³, Raum 30,000 m³', async () => {
        for (const kom of KAMMER()) expect((await b.fuehreAus(kom)).ausgefuehrt).toBe(true);
        const vorher = await paketAus(ae);
        setActivePinia(createPinia()); repo.setBackend(new Speicher()); b = useBearbeitung(); ae = useAenderungen();
        expect((await b.fuehreAus(KAMMER_AUS_VORLAGE())).ausgefuehrt).toBe(true);
        const nachher = await paketAus(ae);
        expect(beton(nachher)).toBe(22.164);
        const raum = nachher.bauteile.find(t => t.klasse === 'IFCSPACE');
        expect(r6(raum.mengen.netVolume)).toBe(30);
        // Teil für Teil gleich: Klasse, Name, Ausführung, Mengen, Geometrie — auf 1e-9
        // (die Kommandofolge rechnet die Wandachse aus Ost/Nord, die Vorlage aus t/2).
        const rund = (v) => (typeof v === 'number' ? Math.round(v * 1e9) / 1e9 + 0
            : Array.isArray(v) ? v.map(rund) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([a, c]) => [a, rund(c)])) : v);
        const nach = (p) => rund([...p.bauteile].sort((a, c) => a.cdeId.localeCompare(c.cdeId)));
        expect(nach(nachher)).toEqual(nach(vorher));
    });

    it('Werte der Vorlage wirken: lichte Länge 5 m → Beton 26,004 m³, Raum 37,5 m³', async () => {
        expect((await b.fuehreAus(KAMMER_AUS_VORLAGE({ laenge: 5 }))).ausgefuehrt).toBe(true);
        const p = await paketAus(ae);
        expect(beton(p)).toBe(26.004);
        expect(r6(p.bauteile.find(t => t.klasse === 'IFCSPACE').mengen.netVolume)).toBe(37.5);
    });

    it('die Höhe: getippt in m NN gilt vor der Höhe des Punkts', async () => {
        expect((await b.fuehreAus(KAMMER_AUS_VORLAGE({ hoehe: 215 }))).ausgefuehrt).toBe(true);
        const bp = ae.wirksamerStand('erzeugt').get('cde-BP');
        expect(bp.parameter.punkte.every(p => p[1] === 215)).toBe(true);
    });

    it('ablehnen, was nicht geht: zwei Punkte, Wanddicke 0, zu wenige Kennungen', async () => {
        const zwei = await b.fuehreAus({ ...KAMMER_AUS_VORLAGE(), eingaben: { zug: [e(0, 0, 210), e(5, 0, 210)] } });
        expect(zwei.ausgefuehrt).toBe(false);
        const null_ = await b.fuehreAus(KAMMER_AUS_VORLAGE({ wand: 0 }));
        expect(null_.ausgefuehrt).toBe(false);
        expect(null_.grund).toMatch(/wand/);
        const kurz = await b.fuehreAus({ ...KAMMER_AUS_VORLAGE(), neu: ['cde-KA', 'cde-BP'] });
        expect(kurz.ausgefuehrt).toBe(false);
        expect(kurz.grund).toMatch(/neue Kennung/);
        expect(ae.eintraege).toHaveLength(0);
    });

    it('jede Vorlage hat ihr Werkzeug, und es steht in der Gruppe Erzeugen', () => {
        for (const v of Object.values(BAUWERKSVORLAGEN)) {
            const w = nachId(`bauwerk-aus-vorlage-${v.id}`);
            expect(w?.gruppe).toBe('erzeugen');
            expect(w.felder.map(f => f.name)).toEqual(['name', 'hoehe', ...v.felder.map(f => f.name)]);
        }
    });
});

describe('Teil XXVIII, V3 — neu auswerten, Abweichung, angleichen', () => {
    const W = { laenge: 4, breite: 3, lichteHoehe: 2.5, wand: 0.3, boden: 0.4, decke: 0.25 };
    const setze = (werte) => k('vorlage-werte-setzen', { ziel: ['cde-KA'], werte: { ...W, ...werte } });
    const plan = (g) => ae.wirksamerStand('erzeugt').get(g);
    const fuehre = async (kom) => { const erg = await b.fuehreAus(kom); expect(erg.ausgefuehrt, `${kom.werkzeug}: ${erg.grund}`).toBe(true); return erg; };
    const befundeAmBauwerk = () => b.befundeVon('cde-KA').filter(x => x.regel === 'vorlage_abweichung');

    it('Fund 2 gedreht: 4,00 → 5,00 m lichte Länge = 1 Kommando — Beton 26,004 m³, Raum 37,5 m³, die Öffnung bleibt', async () => {
        await fuehre(KAMMER_AUS_VORLAGE());
        await fuehre(k('oeffnung-setzen', { ziel: ['cde-WN'], neu: ['cde-OE', 'op-OE'],
            werte: { form: 'rund', station: 2.3, unterkante: 1, durchmesser: 0.3, breite: '', hoehe: '' } }));
        const oe = JSON.stringify(plan('cde-OE'));
        const erg = await fuehre(setze({ laenge: 5 }));
        // Bauwerk + was sich ändert: Platte, beide Längswände, Querwand Ost, Decke, Raum — nicht die Querwand West.
        expect(erg.eintraege.map(x => x.globalId).sort()).toEqual(['cde-BP', 'cde-DE', 'cde-KA', 'cde-RA', 'cde-WN', 'cde-WO', 'cde-WS']);
        expect(new Set(ae.eintraege.map(x => x.vorgang)).size).toBe(3);
        const p = await paketAus(ae);
        expect(r6(p.bauteile.filter(t => t.klasse !== 'IFCSPACE' && t.klasse !== 'IFCOPENINGELEMENT')
            .reduce((a, t) => a + (t.mengen.grossVolume ?? t.mengen.netVolume), 0))).toBe(26.004);
        expect(r6(p.bauteile.find(t => t.klasse === 'IFCSPACE').mengen.netVolume)).toBe(37.5);
        // Die Öffnung: dieselbe Kennung, derselbe Bauplan, dieselbe Wand — und sie schneidet weiter.
        expect(JSON.stringify(plan('cde-OE'))).toBe(oe);
        expect(r6(p.bauteile.find(t => t.cdeId === 'cde-WN').mengen.netVolume)).toBe(r6(5.6 * 0.3 * 2.5 - Math.PI * 0.15 ** 2 * 0.3));
        // Was die Vorlage nicht steuert, bleibt: Ausführung, Zugehörigkeit, Stand.
        expect(plan('cde-WN').parameter).toMatchObject({ predefinedType: 'RETAININGWALL', teilVon: 'cde-KA', hoeheVon: { bauteil: 'cde-BP' } });
        expect(befundeAmBauwerk()).toEqual([]);
        // EIN Rückgängig: die Kammer ist wieder 4 m lang.
        await ae.zurueck();
        const zurueck = (await paketAus(ae)).bauteile.filter(t => !['IFCSPACE', 'IFCOPENINGELEMENT'].includes(t.klasse));
        expect(r6(zurueck.reduce((a, t) => a + t.mengen.netVolume, 0))).toBe(r6(22.164 - Math.PI * 0.15 ** 2 * 0.3));
    });

    it('lichte Höhe 3 m: Wände wachsen, die Decke steht oben auf der Längswand', async () => {
        await fuehre(KAMMER_AUS_VORLAGE());
        await fuehre(setze({ lichteHoehe: 3 }));
        const uk = rezeptNach('platte').stand.lies(plan('cde-DE').parameter);
        expect(uk).toBeCloseTo(213, 9);
        expect(rezeptNach('wand').stand.oberkante(plan('cde-WN').parameter)).toBeCloseTo(213, 9);
        expect(plan('cde-DE').parameter.hoeheVon).toEqual({ bauteil: 'cde-WN', mass: 'oberkante', versatz: 0 });
    });

    it('E34: ein von Hand geändertes Teil wird übersprungen und genannt — „An Vorlage angleichen" holt es zurück', async () => {
        await fuehre(KAMMER_AUS_VORLAGE());
        await fuehre(k('wand-dicke-setzen', { ziel: ['cde-WS'], werte: { dicke: 0.4 } }));
        expect(befundeAmBauwerk().map(x => [x.rolle, x.feld])).toEqual([['laengswandSued', 'dicke']]);
        const erg = await fuehre(setze({ laenge: 5 }));
        expect(erg.eintraege.map(x => x.globalId)).not.toContain('cde-WS');
        expect(plan('cde-WS').parameter.dicke).toBe(0.4);
        expect(plan('cde-WS').parameter.punkte[1][0]).toBeCloseTo(4.6, 9);          // nicht verlängert
        expect(befundeAmBauwerk().map(x => x.rolle)).toEqual(['laengswandSued']);
        // Angleichen: die Wand bekommt, was die Vorlage JETZT sagt (5 m, 0,30 m).
        await fuehre(k('an-vorlage-angleichen', { ziel: ['cde-KA'], werte: { rolle: 'laengswandSued' } }));
        expect(plan('cde-WS').parameter.dicke).toBe(0.3);
        expect(plan('cde-WS').parameter.punkte[1][0]).toBeCloseTo(5.6, 9);
        expect(befundeAmBauwerk()).toEqual([]);
        // Nichts mehr zu tun — kein leerer Vorgang.
        expect((await b.fuehreAus(k('an-vorlage-angleichen', { ziel: ['cde-KA'], werte: { rolle: '' } }))).ausgefuehrt).toBe(false);
    });

    it('ein gelöschtes Teil: genannt, übersprungen; die übrigen folgen', async () => {
        await fuehre(KAMMER_AUS_VORLAGE());
        await fuehre(k('loeschen', { ziel: ['cde-DE'], werte: {} }));
        expect(befundeAmBauwerk().map(x => [x.rolle, x.wert])).toEqual([['decke', 'fehlt']]);
        const erg = await fuehre(setze({ laenge: 5 }));
        // Gelöscht heisst verborgen (der Bauplan bleibt im Journal) — die Vorlage holt es nicht still zurück.
        expect(erg.eintraege.map(x => x.globalId)).not.toContain('cde-DE');
        expect(plan('cde-BP').parameter.punkte[1][0]).toBeCloseTo(5.6, 9);
    });

    it('der Rahmen geht mit: verschieben, drehen, spiegeln — danach rechnet die Vorlage am neuen Ort', async () => {
        const reihen = [
            k('bauwerk-verschieben', { ziel: ['cde-KA'], werte: { ost: 10, nord: 5, hoehe: 1 } }),
            k('bauwerk-drehen', { ziel: ['cde-KA'], werte: { winkel: 30 } }),
            k('bauwerk-spiegeln', { ziel: ['cde-KA'], werte: { achse: 60, kopie: 'nein' } }),
        ];
        const punkte = () => TEILE.map(g => plan(g).parameter.punkte);
        // Reihenfolge 1: bewegen, dann Werte.
        await fuehre(KAMMER_AUS_VORLAGE());
        for (const kom of reihen) await fuehre({ ...kom, id: `${kom.id}-a` });
        expect(befundeAmBauwerk(), 'nach dem Bewegen weicht nichts ab').toEqual([]);
        await fuehre(setze({ laenge: 5, breite: 4 }));
        const a = punkte();
        // Weg 2: dieselben Bewegungen, eine Wand von Hand geändert (beim Wertesetzen
        // übersprungen), dann angeglichen — muss genau Weg 1 treffen: der mitbewegte
        // Stand und der mitbewegte Rahmen sagen dasselbe.
        setActivePinia(createPinia()); repo.setBackend(new Speicher()); b = useBearbeitung(); ae = useAenderungen();
        await fuehre(KAMMER_AUS_VORLAGE());
        for (const kom of reihen) await fuehre({ ...kom, id: `${kom.id}-b` });
        await fuehre(k('wand-dicke-setzen', { ziel: ['cde-WN'], werte: { dicke: 0.5 } }));     // eine Abweichung
        await fuehre(setze({ laenge: 5, breite: 4 }));
        await fuehre(k('an-vorlage-angleichen', { ziel: ['cde-KA'], werte: { rolle: '' } }));
        const b2 = punkte();
        for (let i = 0; i < a.length; i++) {
            for (let j = 0; j < a[i].length; j++) for (let c = 0; c < 3; c++) expect(b2[i][j][c]).toBeCloseTo(a[i][j][c], 9);
        }
        // Und die Kammer ist wirklich gedreht und gespiegelt: 0° → 30° → 2·60° − 30° = 90°,
        // die Längswand Nord läuft jetzt Nord–Süd.
        const [p0, p1] = plan('cde-WN').parameter.punkte;
        expect(Math.abs(p1[2] - p0[2])).toBeCloseTo(5.6, 9);
        expect(Math.hypot(p1[0] - p0[0], p1[2] - p0[2])).toBeCloseTo(5.6, 9);
    });

    it('eine Kopie: ihre Rollen zeigen auf ihre Teile; Werte an der Kopie ändern nur die Kopie', async () => {
        await fuehre(KAMMER_AUS_VORLAGE());
        const neu = ['cde-KK', ...TEILE.map((_, i) => `cde-KK${i}`)];
        await fuehre(k('bauwerk-kopieren', { ziel: ['cde-KA'], neu, werte: { ost: 20, nord: 0, hoehe: 0 } }));
        expect(Object.values(plan('cde-KK').parameter.bauwerksvorlage.rollen)).toEqual(neu.slice(1));
        await fuehre(k('vorlage-werte-setzen', { ziel: ['cde-KK'], werte: { ...W, laenge: 5 } }));
        expect(plan('cde-KK0').parameter.punkte[1][0]).toBeCloseTo(25.6, 9);
        expect(plan('cde-BP').parameter.punkte[1][0]).toBeCloseTo(4.6, 9);
        expect(b.befundeVon('cde-KK').filter(x => x.regel === 'vorlage_abweichung')).toEqual([]);
    });

    it('nur an einem Bauwerk aus einer Vorlage', async () => {
        await fuehre(k('bauwerk-anlegen', { neu: ['cde-B2'], werte: { name: 'Frei', art: 'anlage' } }));
        const erg = await b.fuehreAus(k('vorlage-werte-setzen', { ziel: ['cde-B2'], werte: W }));
        expect(erg.ausgefuehrt).toBe(false);
        await fuehre(KAMMER_AUS_VORLAGE());
        const ohne = await b.fuehreAus(setze({}));
        expect(ohne.ausgefuehrt).toBe(false);
        expect(ohne.grund).toMatch(/Nichts zu tun/);
        expect((await b.fuehreAus(k('vorlage-werte-setzen', { ziel: ['cde-WN'], werte: W }))).ausgefuehrt).toBe(false);
    });
});
