// @vitest-environment jsdom
/**
 * Das Regelwerk als Katalog (Teil XXIII, AR; Audit „Bearbeitungsstruktur", S9).
 *
 *  - OHNE Repo gilt der eingebaute Satz — die Werte von vor AR, unverändert.
 *  - Ein BÜRO-Regelwerk mit Mindestüberdeckung 1,0 m: derselbe Kanalgraben
 *    meldet den Befund, der bei 0,8 m ausbleibt — mit Quelle „Büro-Regelwerk".
 *    Am echten Weg: Store lädt den Katalog, der Ableitungslauf rechnet.
 *  - Ungültiges wird gemeldet und gilt nicht; Tabellen nur in ihrer Form.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { EINGEBAUTE_REGELN, FORMELN, aufgeloestesRegelwerk, regelquelle, regeltabelle, regelwert, setzeRegelwerk } from '../services/regeln/Regelwerk.js';
import { REGELWERK, befundeFuer, mindestGefaelle } from '../services/Befunde.js';
import { GRABENREGELN, grabenbreite } from '../services/gelaende/Grabenregeln.js';
import { pruefeEintrag } from '../services/katalog/Katalogschema.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { ableitungsSchritte, erzeugtEintrag, rezeptNach } from '../services/Bauteilrezepte.js';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';

function repoMit({ projekt = {}, buero = {} } = {}) {
    const lese = (q) => async (k) => (k in q ? JSON.parse(JSON.stringify(q[k])) : null);
    return {
        get: lese(projekt), set: async (k, v) => { projekt[k] = v; return true; },
        buero: { get: lese(buero), set: async (k, v) => { buero[k] = v; return true; } },
        mitVorrang: async (k, vorgabe) => (k in projekt ? projekt[k] : k in buero ? buero[k] : vorgabe),
    };
}

beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });
afterEach(() => setzeRegelwerk([]));             // das Register ist Modulzustand

describe('ohne Repo: die Werte von vor AR', () => {
    it('der eingebaute Satz ist das alte REGELWERK — plus Fang und Anschlussweite', () => {
        expect(aufgeloestesRegelwerk()).toEqual(REGELWERK);
        expect(REGELWERK).toMatchObject({ ueberdeckungMindestM: 0.8, gefaelleHoechstPromille: 100, laengeHoechstM: 100 });
        expect(regelwert('fangKnotenM')).toBe(10);
        expect(regelwert('kanalgrabenAnschlussM')).toBe(2);
        expect(mindestGefaelle(300)).toBeCloseTo(1000 / 300, 12);            // 1:DN
    });
    it('jeder Eintrag nennt Eigenschaft, Art und Quelle — nie einen Bauteiltyp', () => {
        for (const e of EINGEBAUTE_REGELN) {
            expect(e.prueft, e.id).toMatch(/^(achse|netzrolle|lage|mass|eingabe)[.:]/);
            expect(e.prueft, e.id).not.toMatch(/IFC|schacht|haltung|rohr/i);
            expect(['norm', 'faustregel', 'erfahrung', 'setzung'], e.id).toContain(e.art);
            expect(e.quelle.length, e.id).toBeGreaterThan(5);
        }
        expect(typeof FORMELN.einsDurchNennmass).toBe('function');
    });
});

describe('Büro und Projekt überschreiben je Wert — geprüft', () => {
    it('Projekt schlägt Büro; die Quelle sagt, woher', async () => {
        const b = useBearbeitung();
        await b.ladeProfile(repoMit({
            buero: { regelwerk: [{ id: 'ueberdeckungMindestM', wert: 1.0 }, { id: 'laengeHoechstM', wert: 80 }] },
            projekt: { regelwerk: [{ id: 'laengeHoechstM', wert: 60 }] },
        }));
        expect(b.katalogBefunde).toEqual([]);
        expect(regelwert('ueberdeckungMindestM')).toBe(1.0);
        expect(regelwert('laengeHoechstM')).toBe(60);
        expect(regelquelle('ueberdeckungMindestM')).toBe('Büro-Regelwerk');
        expect(regelquelle('laengeHoechstM')).toBe('Projekt-Regelwerk');
        // Ein Befund aus dem Store nennt den geltenden Grenzwert und seine Herkunft.
        const lang = befundeFuer({ globalId: 'H', achse: { anfang: { x: 0, y: 1, z: 0 }, ende: { x: 70, y: 0.8, z: 0 }, laenge: 70, dn: 300 } });
        expect(lang.find(x => x.regel === 'laenge_zu_lang')).toMatchObject({ grenze: 'höchstens 60.00 m', quelle: 'Projekt-Regelwerk' });
    });

    it('Ungültiges gilt nicht und wird gemeldet: unbekannte Id, falscher Typ, falsche Tabellenform', async () => {
        const b = useBearbeitung();
        await b.ladeProfile(repoMit({ buero: { regelwerk: [
            { id: 'mindestUeberdeckung', wert: 1.0 },                         // vertippt
            { id: 'fangKnotenM', wert: 'weit' },
            { id: 'grabenregeln', wert: { quelle: 'Büro' } },
        ] } }));
        expect(b.katalogBefunde.map(x => [x.art, x.id])).toEqual([['regel', 'mindestUeberdeckung'], ['regel', 'fangKnotenM'], ['regel', 'grabenregeln']]);
        expect(b.katalogBefunde[0].fehler.join()).toMatch(/gibt es nicht/);
        expect(b.katalogBefunde[2].fehler.join()).toMatch(/nicht die Form/);
        expect(regelwert('fangKnotenM')).toBe(10);
        expect(regeltabelle('grabenregeln', GRABENREGELN)).toBe(GRABENREGELN);
    });

    it('eine Tabelle in der Form der eingebauten gilt — auch aus JSON, mit offenem Ende', async () => {
        // Aus dem Repo kommt JSON: „bis DN ∞" steht dort als null.
        const eigene = JSON.parse(JSON.stringify(GRABENREGELN));
        expect(eigene.breiteNachDn.at(-1).bisDn).toBeNull();
        eigene.breiteNachDn.at(-1).verbaut = 1.5;                    // das Büro rechnet grosse DN breiter
        expect(pruefeEintrag('regel', { id: 'grabenregeln', wert: eigene }).ok).toBe(true);
        const vorher = grabenbreite({ dn: 1600, tiefe: 2 });
        await useBearbeitung().ladeProfile(repoMit({ buero: { regelwerk: [{ id: 'grabenregeln', wert: eigene }] } }));
        expect(regeltabelle('grabenregeln', GRABENREGELN).breiteNachDn.at(-1).bisDn).toBe(Infinity);
        const nachher = grabenbreite({ dn: 1600, tiefe: 2 });
        expect(nachher.sohlbreite).toBeGreaterThan(vorher.sohlbreite);
        expect(grabenbreite({ dn: 300, tiefe: 2 })).toEqual(grabenbreite({ dn: 300, tiefe: 2, regeln: GRABENREGELN }));
    });

    it('die Formel lässt sich durch einen festen Wert ersetzen', () => {
        setzeRegelwerk([{ id: 'gefaelleMindestPromille', wert: 5, herkunft: 'buero' }]);
        expect(mindestGefaelle(300)).toBe(5);
        expect(pruefeEintrag('regel', { id: 'gefaelleMindestPromille', wert: null }).ok).toBe(true);   // zurück zur Formel
        expect(pruefeEintrag('regel', { id: 'laengeMindestM', wert: null }).ok).toBe(false);          // ohne Formel nicht
    });
});

describe('Am echten Weg: derselbe Kanalgraben, zwei Regelwerke', () => {
    // Gelände 300 + 0,01·x; Rohr DN 300, Scheitel 0,85 m unter Gelände an beiden Enden.
    function gelaende() {
        const h = (x) => 300 + 0.01 * x;
        const t = [];
        for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) {
            const a = [x, h(x), z], b = [x + 1, h(x + 1), z], c = [x + 1, h(x + 1), z + 1], d = [x, h(x), z + 1];
            t.push(...a, ...b, ...c, ...a, ...c, ...d);
        }
        return { positions: new Float64Array(t), triCount: t.length / 9 };
    }
    const holeQuellForm = async (gid, form, { cell } = {}) =>
        (gid === 'DGM1' && form === 'raster' ? rasterAusMesh({ mesh: gelaende() }, { cell: cell ?? 1 }).ergebnis : null);
    const OP = [{ art: 'kanalgraben', parameter: { dn: 300, arbeitsraum: 0.4, bettung: 0.15, boeschung: 0.5 } }];

    async function graben() {
        const rohr = erzeugtEintrag({ rezept: 'rohr', kategorie: 'IFCPIPESEGMENT', name: 'H-001',
                                      parameter: { punkte: [[5, 299.05, 20], [35, 299.35, 20]], dn: 300 } });
        const schritte = ableitungsSchritte({ rezept: 'kanalgraben', quellen: { rohr: rohr.globalId, gelaende: 'DGM1' },
                                              raster: { cell: 0.5 }, operationen: OP, name: 'H-001' });
        const stand = new Map([rohr, ...schritte].map(e => [e.globalId, e.nachher]));
        const lauf = neuerAbleitungslauf({ stand, rezeptNach, holeQuellForm, kernel: erzeugeKernel() });
        await lauf.baue(schritte[0].globalId);
        return lauf.ableitungen.get(schritte[0].nachher.ableitung);
    }

    it('0,8 m (eingebaut): kein Befund — 1,0 m (Büro): der Befund, mit Quelle', async () => {
        const vorher = await graben();
        expect(vorher.kennzahlen.ueberdeckungMin).toBeGreaterThan(0.8);
        expect(vorher.kennzahlen.ueberdeckungMin).toBeLessThan(1.0);
        expect(vorher.befunde.map(x => x.regel)).not.toContain('ueberdeckung_gering');

        await useBearbeitung().ladeProfile(repoMit({ buero: { regelwerk: [{ id: 'ueberdeckungMindestM', wert: 1.0 }] } }));
        const nachher = await graben();
        const bef = nachher.befunde.find(x => x.regel === 'ueberdeckung_gering');
        expect(bef).toMatchObject({ grenze: 'mindestens 1.00 m' });
        expect(bef.quelle).toMatch(/^Büro-Regelwerk/);
    });
});
