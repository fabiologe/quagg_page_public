// @vitest-environment jsdom
/**
 * Formulare sperren nicht mehr bei Fachgrenzen (Teil XXIV, K10 — Fabios E5).
 *
 * Bis K10 wies `Bearbeitungen.pruefe` jede Formulargrenze ab: DN 5000 war im
 * Formular „nicht bereit" und als Kommando „abgelehnt" — obwohl die Befunde
 * nach Fabios Regel nur beraten. Jetzt:
 *
 *   1. Abgelehnt wird nur, was ein Feld als TECHNISCHE Grenze erklärt
 *      (`gueltig`): DN 0, ein Böschungswinkel von 90°.
 *   2. Die Fachgrenze (`min`/`max`) wird ausgeführt und markiert — im Formular
 *      als Hinweis, am Eintrag in der Momentaufnahme der Befunde, und am
 *      eigenen Bauteil, solange der Wert steht (Prüflauf, mit und ohne Engine).
 *   3. Die Kontextleiste sagt es, bevor übernommen wird.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { felderFuer, nachId, pruefe } from '../services/Bearbeitungen.js';
import { befundeFuerWerte } from '../services/Befunde.js';
import { pruefeEintrag } from '../services/katalog/Katalogschema.js';
import { IfcEngine } from '../services/IfcEngine.js';
import { cdeAchsenAus, verdeckteAus } from '../services/CdeAchsen.js';
import { KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';
import { EINGEBAUTE_REZEPTE } from '../services/rezept/Eingebaut.js';
import { profilFuer } from '../services/bauform/Typprofile.js';
import CdeKontextleiste from '../components/CdeKontextleiste.vue';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});
afterEach(() => { document.body.innerHTML = ''; });

const kommando = (id, werkzeug, rest) => ({ schema: KOMMANDO_SCHEMA, id, werkzeug, ziel: [], wer: 'fabio', wann: '2026-09-19T11:00:00Z', ...rest });
const rohr = (id, gid, dn) => kommando(id, 'rohr-zeichnen', { neu: [gid], werte: { name: gid, kategorie: 'IFCPIPESEGMENT', hoehe: '', dn },
    eingaben: { zug: [{ ost: 0, nord: 0, hoehe: 100 }, { ost: 30, nord: 0, hoehe: 99.85 }] } });
const pfosten = (id, gid, laenge) => kommando(id, 'pfosten-zeichnen', { neu: [gid], werte: { name: gid, kategorie: 'IFCSIGN', hoehe: 100, laenge, breite: 0.12, tiefe: 0.12 },
    eingaben: { zug: [{ ost: 50, nord: 5, hoehe: 100 }] } });
const regeln = (befunde) => (befunde ?? []).map(b => b.regel).sort();
const felderVon = (id) => felderFuer(nachId(id), null, null);

describe('1 — technisch unmöglich sperrt, ungewöhnlich nicht', () => {
    it('Rohr: DN 5000 geht (Hinweis), DN 0 und negativ nicht', () => {
        const felder = felderVon('rohr-zeichnen');
        const werte = { name: 'H', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 5000 };
        expect(pruefe(felder, werte)).toEqual([]);
        const [h, ...rest] = befundeFuerWerte(felder, werte);
        expect(rest).toEqual([]);
        expect(h).toMatchObject({ regel: 'wert_ausserhalb', schwere: 'warnung', feld: 'dn', wert: '5000 mm', grenze: 'höchstens 4000 mm' });
        expect(pruefe(felder, { ...werte, dn: 0 })).toEqual(['dn: muss größer als 0 sein']);
        expect(pruefe(felder, { ...werte, dn: -300 })).toEqual(['dn: muss größer als 0 sein']);
        expect(pruefe(felder, { ...werte, dn: 30 })).toEqual([]);         // unter 50: nur ein Hinweis
    });

    it('Kanalgraben: Böschungswinkel 5° geht (Hinweis), 90° und 0° nicht', () => {
        const felder = felderVon('kanalgraben-ableiten');
        const w = Object.fromEntries(felder.filter(f => f.vorgabe !== undefined).map(f => [f.name, f.vorgabe]));
        const mit = (winkel) => ({ ...w, winkel });
        const nurWinkel = (fehler) => fehler.filter(f => f.startsWith('winkel'));
        expect(nurWinkel(pruefe(felder, mit(5)))).toEqual([]);
        expect(befundeFuerWerte(felder, mit(5)).map(b => b.feld)).toEqual(['winkel']);
        expect(nurWinkel(pruefe(felder, mit(90)))).toEqual(['winkel: muss kleiner als 90 sein']);
        expect(nurWinkel(pruefe(felder, mit(0)))).toEqual(['winkel: muss größer als 0 sein']);
    });

    it('ein Rezept aus der Bibliothek erklärt `gueltig` nur mit bekannten Schlüsseln und Zahlen', () => {
        const rohr = JSON.parse(JSON.stringify(EINGEBAUTE_REZEPTE.find(r => r.id === 'rohr')));
        const mitDn = (gueltig) => ({ ...rohr, id: 'probe-rohr', felder: rohr.felder.map(f => (f.name === 'dn' ? { ...f, gueltig } : f)) });
        expect(pruefeEintrag('rezept', mitDn({ ueber: 0 })).fehler).toEqual([]);
        expect(pruefeEintrag('rezept', mitDn({ groesser: 0 })).fehler.join(' ')).toMatch(/gueltig\.groesser gibt es nicht/);
        expect(pruefeEintrag('rezept', mitDn({ ueber: '0' })).fehler.join(' ')).toMatch(/gueltig\.ueber ist keine Zahl/);
        expect(pruefeEintrag('rezept', mitDn([0])).fehler.join(' ')).toMatch(/gueltig ist ein Objekt/);
    });
});

describe('2 — die Oberfläche: bereit, mit Hinweis', () => {
    it('DN 5000 im Formular: bereit, und die Kontextleiste sagt die Grenze', async () => {
        const b = useBearbeitung();
        b.modusSetzen(true);
        expect(b.starte('rohr-zeichnen')).toBe(true);
        b.setzeWert('dn', 5000);
        expect(b.fehler).toEqual([]);
        expect(b.bereit).toBe(true);                                   // vorher: false („größer als 4000")
        expect(regeln(b.grenzhinweise)).toEqual(['wert_ausserhalb']);

        const w = mount(CdeKontextleiste, { attachTo: document.body });
        await w.vm.$nextTick();
        expect(w.text()).toContain('DN 5000 mm liegt über der üblichen Grenze');

        b.setzeWert('dn', 0);
        await w.vm.$nextTick();
        expect(b.bereit).toBe(false);
        expect(w.text()).toContain('dn: muss größer als 0 sein');
        w.unmount();
    });
});

describe('3 — das Kommando: ausgeführt und markiert', () => {
    it('DN 5000: ausgeführt, Hinweis im Ergebnis, am Eintrag und am Bauteil — bis der Wert zurückgeht', async () => {
        const b = useBearbeitung();
        const ae = useAenderungen();
        const erg = await b.fuehreAus(rohr('ko-1', 'cde-H', 5000));
        expect(erg.ausgefuehrt).toBe(true);
        expect(erg.grund).toBe(null);
        expect(regeln(erg.hinweise)).toEqual(['wert_ausserhalb']);
        expect(ae.wirksamerStand('erzeugt').get('cde-H').parameter.dn).toBe(5000);
        // Am Eintrag: die Momentaufnahme „was beim Setzen bekannt war".
        expect(regeln(ae.eintraege.at(-1).befunde)).toEqual(['wert_ausserhalb']);
        // Am Bauteil, solange der Wert steht — neben den Netzbefunden (loses Ende
        // ohne Schächte). Die Nennweite beurteilt schon das Typprofil
        // (`dn_ausserhalb`) — ein Feld, ein Befund: kein zweiter daneben.
        expect(regeln(b.befundeVon('cde-H'))).toEqual(['dn_ausserhalb', 'loses_ende', 'loses_ende']);

        // Ein Schacht (kein Typprofil-Befund für seine Nennweite) trägt die Fachgrenze selbst.
        expect((await b.fuehreAus(kommando('ko-s', 'schacht-zeichnen', { neu: ['cde-S'], werte: { name: 'S', kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', hoehe: '', dn: 200 },
            eingaben: { zug: [{ ost: 80, nord: 0, hoehe: 99 }, { ost: 80, nord: -0.001, hoehe: 101.5 }] } }))).grund).toBe(null);
        expect(b.befundeVon('cde-S').map(x => [x.regel, x.feld ?? null])).toEqual([['schacht_ohne_anschluss', null], ['wert_ausserhalb', 'dn']]);

        const zurueck = await b.fuehreAus(kommando('ko-2', 'rohr-dn-setzen', { ziel: ['cde-H'], werte: { dn: 300 } }));
        expect(zurueck.ausgefuehrt).toBe(true);
        expect(zurueck.hinweise).toEqual([]);
        expect(regeln(b.befundeVon('cde-H'))).toEqual(['loses_ende', 'loses_ende']);
    });

    it('DN 0: abgelehnt mit dem technischen Grund, das Journal bleibt, wie es war', async () => {
        const b = useBearbeitung();
        const ae = useAenderungen();
        const vorher = ae.eintraege.length;
        const erg = await b.fuehreAus(rohr('ko-0', 'cde-X', 0));
        expect(erg.ausgefuehrt).toBe(false);
        expect(erg.grund).toBe('dn: muss größer als 0 sein');
        expect(ae.eintraege.length).toBe(vorher);
    });

    it('ein Bauteil ohne Netzrolle (Pfosten, 50 m hoch) ist ebenso markiert', async () => {
        const b = useBearbeitung();
        const erg = await b.fuehreAus(pfosten('ko-p', 'cde-P', 50));
        expect(erg.grund).toBe(null);
        expect(b.befundeVon('cde-P').map(x => [x.regel, x.feld, x.grenze])).toEqual([['wert_ausserhalb', 'laenge', 'höchstens 30 m']]);
    });

    it('ein verdecktes Bauteil hat keine Wertebefunde mehr', async () => {
        const b = useBearbeitung();
        await b.fuehreAus(pfosten('ko-p', 'cde-P', 50));
        await b.fuehreAus(kommando('ko-l', 'loeschen', { ziel: ['cde-P'], werte: {} }));
        expect(b.befundeVon('cde-P')).toEqual([]);
    });
});

describe('4 — mit und ohne Engine: dieselben Markierungen', () => {
    it('die Prüfliste der Engine zeigt die Fachgrenze wie der Lauf aus dem Journal', async () => {
        const b = useBearbeitung();
        const ae = useAenderungen();
        await b.fuehreAus(rohr('ko-1', 'cde-H', 5000));
        await b.fuehreAus(pfosten('ko-p', 'cde-P', 50));
        const dies = Object.assign(Object.create(IfcEngine.prototype), {
            _achsen: new Map(), _knoten: new Map(), _merkmale: new Map(),
            quelleVon: () => null, merkmaleAlle: () => new Map(),
        });
        IfcEngine.prototype.setzeJournalStand.call(dies, {
            ...cdeAchsenAus(ae.wirksamerStand('erzeugt')),
            verdeckt: verdeckteAus(ae.wirksamerStand('geloescht')),
            bauplaene: ae.wirksamerStand('erzeugt'),                   // wie der Viewer
        });
        const sortiert = (liste) => liste.map(({ globalId, befunde }) => ({ globalId, befunde: regeln(befunde) }))
            .sort((x, y) => x.globalId.localeCompare(y.globalId));
        // Dasselbe Typprofil wie der Store (eingebauter Satz).
        const mit = sortiert(dies.pruefeAlles({ typprofilFuer: (k) => profilFuer(k) }).filter(z => String(z.globalId).startsWith('cde-')));
        expect(mit).toEqual(sortiert(b.pruefeEigenes()));
        expect(mit.map(z => z.globalId)).toEqual(['cde-H', 'cde-P']);
    });

    it('der Viewer reicht die Baupläne an die Engine (Textwächter)', () => {
        const viewer = readFileSync(WURZEL + 'components/IfcViewer.vue', 'utf8');
        expect(viewer).toMatch(/setzeJournalStand\?\.\(\{[^}]*bauplaene: erzeugtStand,/s);
    });
});
