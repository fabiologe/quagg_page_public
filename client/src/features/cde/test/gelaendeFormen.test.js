// @vitest-environment jsdom
/**
 * Gelände formen (Stufe 15) — die JOURNALSEITE.
 *
 * Die Operationen selbst prüft gelaendeOperationen.test.js. Hier steht, wie
 * sie ins Journal kommen und wieder heraus: erste Formung = Ausblenden +
 * Erzeugen (das Trasse-ändern-Muster), jede weitere = EIN Eintrag mit der
 * VOLLEN Liste (absolute Zielzustände — die Faltung bleibt „letzter
 * gewinnt"), und der Bauplan sagt der Einordnung seine Bauform, damit die
 * Werkzeuge nach der ersten Formung nicht verschwinden.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen, standAus } from '../stores/useAenderungen.js';
import { nachId, eingabeArt, passende } from '../services/Bearbeitungen.js';
import { baueMitAbleitung, rezeptNach } from '../services/Bauteilrezepte.js';
import { bestimme } from '../services/bauform/Bauformen.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBearbeitung().modusSetzen(true);
});

const GELAENDE = {
    modelId: 'm1', localId: 7, category: 'IFCGEOGRAPHICELEMENT',
    globalId: 'DGM1', name: 'Urgelände', hoehenversatz: 300,
    anker: { x: 10, y: 10, z: 10 }, bezugshoehe: 10, oberkante: 12,
};
const ZUG = [{ x: 0, z: 10 }, { x: 20, z: 10 }];
const UMRISS = [{ x: 5, z: 5 }, { x: 15, z: 5 }, { x: 15, z: 15 }, { x: 5, z: 15 }];

describe('Der Katalog', () => {
    it('Gerinne will einen Zug, Planum einen Umriss', () => {
        expect(eingabeArt(nachId('gerinne-einschneiden'))).toBe('zug');
        expect(eingabeArt(nachId('planum-herstellen'))).toBe('umriss');
    });

    it('beide hängen an der Bauform hoehenfeld — und NUR dort', () => {
        const amGelaende = passende({ bauform: 'hoehenfeld', guete: 'gemessen' }).map(b => b.id);
        expect(amGelaende).toContain('gerinne-einschneiden');
        expect(amGelaende).toContain('planum-herstellen');
        const amRohr = passende({ bauform: 'achse+profil', guete: 'gemessen' }).map(b => b.id);
        expect(amRohr).not.toContain('gerinne-einschneiden');
    });
});

describe('Erste Formung: Ausblenden + drei Teile EINER Ableitung (Teil XIV)', () => {
    it('vier Einträge — Quelle, Prüfmass, Zellweite und Operationsliste als Parameter, NIE ein Raster', () => {
        const el = { ...GELAENDE, quellmass: { pruefmass: { triCount: 800, spanX: 40, spanY: 2, spanZ: 40 }, cell: 0.5 } };
        const s = nachId('gerinne-einschneiden').anwenden(
            el, { sohleAnfang: 8, sohleEnde: 6, sohlbreite: 2, boeschung: 1 }, { zug: ZUG });
        expect(s).toHaveLength(4);
        expect(s[0]).toEqual({ art: 'geloescht', globalId: 'DGM1', nachher: true });
        const teile = s.slice(1);
        expect(teile.map(t => t.nachher.rolle)).toEqual(['aushub', 'auftrag', 'dgm']);
        expect(teile.every(t => t.art === 'erzeugt' && t.modell === 'cde' && t.nachher.rezept === 'erdbau')).toBe(true);
        // EINE Klammer, drei GlobalIds
        expect(new Set(teile.map(t => t.nachher.ableitung)).size).toBe(1);
        expect(new Set(teile.map(t => t.globalId)).size).toBe(3);
        // IFC 4.3: Aushub = Graben, DGM = Terrain
        expect(teile[0].nachher).toMatchObject({ kategorie: 'IFCEARTHWORKSCUT', predefinedType: 'TRENCH', bauform: 'koerper' });
        expect(teile[1].nachher).toMatchObject({ kategorie: 'IFCEARTHWORKSFILL', predefinedType: 'EMBANKMENT' });
        expect(teile[2].nachher).toMatchObject({ kategorie: 'IFCGEOGRAPHICELEMENT', predefinedType: 'TERRAIN', bauform: 'hoehenfeld' });
        const p = teile[2].nachher.parameter;
        expect(p.quellen).toEqual({ gelaende: 'DGM1' });
        expect(p.quellBasis.gelaende.triCount).toBe(800);
        expect(p.raster.cell).toBe(0.5);
        expect(p.operationen).toHaveLength(1);
        expect(p.operationen[0].art).toBe('gerinne');
        expect(p.operationen[0].parameter.sohleAnfang).toBe(8);   // m NN — die Grenze liegt im Rezept
        expect(JSON.stringify(p)).not.toMatch(/heights/);
    });

    it('Planum mit Neigung = zwei Operationen in JEDEM Teil — der Aushub wird EXCAVATION', () => {
        const s = nachId('planum-herstellen').anwenden(
            GELAENDE, { hoehe: 8, neigung: 1.5 }, { zug: UMRISS });
        for (const t of s.slice(1)) {
            expect(t.nachher.parameter.operationen.map(o => o.art)).toEqual(['planum', 'boeschung']);
        }
        expect(s[1].nachher.predefinedType).toBe('EXCAVATION');
    });

    it('ohne Pflichtwert oder mit zu kurzem Zug passiert nichts', () => {
        const b = nachId('gerinne-einschneiden');
        expect(b.anwenden(GELAENDE, {}, { zug: ZUG })).toBeNull();
        expect(b.anwenden(GELAENDE, { sohleAnfang: 8 }, { zug: [ZUG[0]] })).toBeNull();
    });
});

describe('Weitere Formung: die Liste wächst absolut, die Teile behalten ihre Kennung', () => {
    function erstformung() {
        return nachId('gerinne-einschneiden').anwenden(
            { ...GELAENDE, quellmass: { pruefmass: { triCount: 1 }, cell: 1 } },
            { sohleAnfang: 8, sohleEnde: 6, sohlbreite: 2, boeschung: 1 }, { zug: ZUG });
    }
    function dgmTeil(schritte) {
        const teile = new Map(schritte.slice(1).map(t => [t.nachher.rolle, { globalId: t.globalId, bauplan: t.nachher }]));
        const dgm = teile.get('dgm');
        return { ...GELAENDE, globalId: dgm.globalId, name: dgm.bauplan.name,
                 stand: { bauplan: dgm.bauplan, teile } };
    }

    it('drei Einträge, dieselben GlobalIds, volle Liste — kein zweites Gelände, keine Kette', () => {
        const erst = erstformung();
        const s = nachId('planum-herstellen').anwenden(dgmTeil(erst), { hoehe: 8 }, { zug: UMRISS });
        expect(s).toHaveLength(3);                                   // KEIN geloescht mehr
        expect(s.map(t => t.globalId)).toEqual(erst.slice(1).map(t => t.globalId));
        expect(s[2].nachher.ableitung).toBe(erst[3].nachher.ableitung);
        const ops = s[2].nachher.parameter.operationen;
        expect(ops.map(o => o.art)).toEqual(['gerinne', 'planum']);
        expect(s[2].nachher.parameter.quellen.gelaende).toBe('DGM1');  // die Quelle bleibt das ORIGINAL
    });

    it('ein Gelände aus der Zeit VOR der Ableitung wird bei der nächsten Formung überführt', () => {
        const alt = {
            ...GELAENDE, globalId: 'cde-g1', name: 'Urgelände (geformt)',
            stand: { bauplan: { rezept: 'gelaende', kategorie: 'IFCGEOGRAPHICELEMENT', name: 'Urgelände (geformt)',
                                bauform: 'hoehenfeld', parameter: { quelle: 'DGM1', operationen: [{ art: 'gerinne', parameter: { sohleAnfang: 8 } }] } } },
        };
        const s = nachId('planum-herstellen').anwenden(alt, { hoehe: 8 }, { zug: UMRISS });
        expect(s).toHaveLength(4);
        // Stufe 0 (D1): das Alt-Gelände ist EIGEN — das Ausblenden sagt es.
        expect(s[0]).toEqual({ art: 'geloescht', globalId: 'cde-g1', nachher: true, modell: 'cde' });
        expect(s[3].nachher.parameter.quellen.gelaende).toBe('DGM1');
        expect(s[3].nachher.parameter.operationen.map(o => o.art)).toEqual(['gerinne', 'planum']);
        expect(s[3].nachher.name).toBe('Urgelände (geformt)');
    });

    it('„zurück" stellt die vorige Liste in ALLEN Teilen her — Faltung unverändert', async () => {
        const ae = useAenderungen();
        const erst = erstformung();
        for (const e of erst) await ae.eintragen({ ...e, wer: 'Fabio' });
        const zweite = nachId('planum-herstellen').anwenden(dgmTeil(erst), { hoehe: 8 }, { zug: UMRISS });
        const vg = ae.neueVorgangsId();
        for (const e of zweite) await ae.eintragen({ ...e, wer: 'Fabio', vorgang: vg, vorgangTitel: 'Planum' });

        const dgmId = erst[3].globalId;
        expect(standAus(ae.eintraege, 'erzeugt').get(dgmId).parameter.operationen).toHaveLength(2);
        await ae.zurueck('Fabio');
        const stand = standAus(ae.eintraege, 'erzeugt');
        expect(stand.get(dgmId).parameter.operationen).toHaveLength(1);
        expect(stand.get(erst[1].globalId).parameter.operationen).toHaveLength(1);   // der Aushub ebenso
    });
});

describe('Der Bauplan sagt der Einordnung seine Bauform', () => {
    it('bestimme() nimmt ausBauplan VOR allem anderen — Güte gemessen', async () => {
        const res = await bestimme(
            { localId: 9, category: 'IFCGEOGRAPHICELEMENT' },
            { resolver: { forElements: () => ({ getForm: async () => ({ data: null, perElement: [] }) }) },
              ausBauplan: 'hoehenfeld' },
        );
        expect(res.bauform).toBe('hoehenfeld');
        expect(res.guete).toBe('gemessen');
        expect(res.quelle).toBe('bauplan');
    });

    it('ein erfundener Bauplan-Wert fällt auf den normalen Weg zurück', async () => {
        const res = await bestimme(
            { localId: 9, category: 'IFCGEOGRAPHICELEMENT' },
            { resolver: { forElements: () => ({ getForm: async () => ({ data: null, perElement: [] }) }) },
              ausBauplan: 'zauberteppich' },
        );
        expect(res.quelle).not.toBe('bauplan');
    });
});

describe('Das Rezept mit Bedarf', () => {
    const RASTER = {
        x0: 0, z0: 0, maxX: 20, maxZ: 20, cell: 1, nx: 21, nz: 21,
        heights: new Float64Array(21 * 21).fill(10),
    };
    const BAUPLAN = {
        rezept: 'gelaende', kategorie: 'IFCGEOGRAPHICELEMENT', name: 'G',
        parameter: {
            quelle: 'DGM1',
            operationen: [{ art: 'planum', parameter: { umriss: UMRISS, hoehe: 8 } }],
        },
    };

    it('deklariert seinen Bedarf — und baut mit hereingereichtem Raster', async () => {
        expect(rezeptNach('gelaende').braucht).toBe('quellraster');
        const r = await baueMitAbleitung(BAUPLAN, async (gid) => (gid === 'DGM1' ? RASTER : null));
        expect(r.ok).toBe(true);
        expect(r.geometrie.getAttribute('position').count).toBeGreaterThan(0);
        expect(r.kategorie).toBe('IFCGEOGRAPHICELEMENT');
    });

    it('ohne Quelle, ohne Operationen oder ohne Raster: benannter Fehler, kein Wurf', async () => {
        const ohneQuelle = await baueMitAbleitung(
            { ...BAUPLAN, parameter: { operationen: BAUPLAN.parameter.operationen } }, async () => RASTER);
        expect(ohneQuelle.ok).toBe(false);
        expect(ohneQuelle.fehler.join(' ')).toMatch(/Quelle/);

        const ohneOps = await baueMitAbleitung(
            { ...BAUPLAN, parameter: { quelle: 'DGM1', operationen: [] } }, async () => RASTER);
        expect(ohneOps.ok).toBe(false);

        const ohneRaster = await baueMitAbleitung(BAUPLAN, async () => null);
        expect(ohneRaster.ok).toBe(false);
        expect(ohneRaster.fehler.join(' ')).toMatch(/Quellraster/);
    });
});
