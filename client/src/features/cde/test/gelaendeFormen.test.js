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

describe('Erste Formung: Ausblenden + Erzeugen', () => {
    it('zwei Einträge — Quelle und Operationsliste als Parameter, NIE ein Raster', () => {
        const s = nachId('gerinne-einschneiden').anwenden(
            GELAENDE, { sohleAnfang: 8, sohleEnde: 6, sohlbreite: 2, boeschung: 1 }, { zug: ZUG });
        expect(s).toHaveLength(2);
        expect(s[0]).toEqual({ art: 'geloescht', globalId: 'DGM1', nachher: true });
        expect(s[1].art).toBe('erzeugt');
        expect(s[1].modell).toBe('cde');
        const p = s[1].nachher.parameter;
        expect(p.quelle).toBe('DGM1');
        expect(p.operationen).toHaveLength(1);
        expect(p.operationen[0].art).toBe('gerinne');
        expect(p.operationen[0].parameter.sohleAnfang).toBe(8);
        expect(JSON.stringify(p)).not.toMatch(/heights/);
    });

    it('Planum mit Neigung = zwei Operationen, EIN Eintrag', () => {
        const s = nachId('planum-herstellen').anwenden(
            GELAENDE, { hoehe: 8, neigung: 1.5 }, { zug: UMRISS });
        const ops = s[1].nachher.parameter.operationen;
        expect(ops.map(o => o.art)).toEqual(['planum', 'boeschung']);
        expect(ops[1].parameter.neigung).toBe(1.5);
    });

    it('ohne Pflichtwert oder mit zu kurzem Zug passiert nichts', () => {
        const b = nachId('gerinne-einschneiden');
        expect(b.anwenden(GELAENDE, {}, { zug: ZUG })).toBeNull();
        expect(b.anwenden(GELAENDE, { sohleAnfang: 8 }, { zug: [ZUG[0]] })).toBeNull();
    });
});

describe('Weitere Formung: die Liste wächst absolut', () => {
    function geformtesTeil(ops) {
        return {
            ...GELAENDE, globalId: 'cde-g1', name: 'Urgelände (geformt)',
            stand: {
                bauplan: {
                    rezept: 'gelaende', kategorie: 'IFCGEOGRAPHICELEMENT',
                    name: 'Urgelände (geformt)', bauform: 'hoehenfeld',
                    parameter: { quelle: 'DGM1', operationen: ops },
                },
            },
        };
    }

    it('EIN Eintrag, gleiche GlobalId, volle Liste', () => {
        const alt = [{ art: 'gerinne', parameter: { sohleAnfang: 8 } }];
        const s = nachId('planum-herstellen').anwenden(
            geformtesTeil(alt), { hoehe: 8 }, { zug: UMRISS });
        expect(Array.isArray(s)).toBe(false);
        expect(s.globalId).toBe('cde-g1');
        const ops = s.nachher.parameter.operationen;
        expect(ops.map(o => o.art)).toEqual(['gerinne', 'planum']);
        expect(s.nachher.parameter.quelle).toBe('DGM1');   // die Quelle bleibt das ORIGINAL
    });

    it('„zurück" stellt die vorige Liste wieder her — Faltung unverändert', async () => {
        const ae = useAenderungen();
        const basisEintrag = {
            art: 'erzeugt', globalId: 'cde-g1', modell: 'cde', wer: 'Fabio',
            nachher: { rezept: 'gelaende', kategorie: 'IFCGEOGRAPHICELEMENT', name: '', bauform: 'hoehenfeld',
                       parameter: { quelle: 'DGM1', operationen: [{ art: 'gerinne', parameter: {} }] } },
        };
        await ae.eintragen(basisEintrag);
        const zweiter = nachId('planum-herstellen').anwenden(
            { ...GELAENDE, globalId: 'cde-g1', stand: { bauplan: basisEintrag.nachher } },
            { hoehe: 8 }, { zug: UMRISS });
        await ae.eintragen({ ...zweiter, wer: 'Fabio' });

        expect(standAus(ae.eintraege, 'erzeugt').get('cde-g1').parameter.operationen).toHaveLength(2);
        await ae.zurueck('Fabio');
        expect(standAus(ae.eintraege, 'erzeugt').get('cde-g1').parameter.operationen).toHaveLength(1);
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
