// @vitest-environment jsdom
/**
 * Das Subjekt eines eigenen Bauteils aus dem Stand (Teil XXIV, K3).
 *
 * Gemessen im Browser (2026-09-18, 42069): eine eigene Haltung hatte im
 * Viewer weder Achse noch Strang, kein eigenes Bauteil einen Versatz. Ohne
 * Oberfläche gab es gar kein Subjekt — die Kommandotests bauten es von Hand.
 *
 * Hier, über den ECHTEN Weg (Kommandos schreiben, `subjektAusStand` liest):
 *   1. Eine eigene Haltung hat Achse, Strang, Knoten; ein Schacht seine
 *      Anschlüsse; beide Hülle, Lage und Versatz.
 *   2. Über die Engine (ihr echter Prototyp mit demselben Journalstand)
 *      entsteht DASSELBE Subjekt — nur das Netz ist dort weiter: eine
 *      gelieferte Haltung verlängert den Strang.
 *   3. Ohne Oberfläche laufen Kommandos an eigenen Bauteilen, ohne dass
 *      jemand ein Subjekt baut — auch Verschieben, das im Viewer an eigenen
 *      Bauteilen nichts tat.
 *   4. Ein geliefertes Ziel ohne geladenes Modell und ein verdecktes Ziel
 *      werden abgelehnt, mit Grund.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { IfcEngine } from '../services/IfcEngine.js';
import { cdeAchsenAus, verdeckteAus } from '../services/CdeAchsen.js';
import { nachId } from '../services/Bearbeitungen.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';
import { standVon, subjektAusStand } from '../services/kommando/Subjekt.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

const kommando = (id, werkzeug, rest) => ({ schema: KOMMANDO_SCHEMA, id, werkzeug, ziel: [], wer: 'fabio', wann: '2026-09-18T22:00:00Z', ...rest });
const SCHACHT = { kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', hoehe: '', dn: 1000 };

/** Der Abnahmefall C2, Schritte 1–3: zwei Schächte, eine Haltung — nur Kommandos. */
async function achseGezogen() {
    const b = useBearbeitung();
    for (const k of [
        kommando('ko-a', 'schacht-zeichnen', { neu: ['cde-A'], werte: { name: 'A', ...SCHACHT },
            eingaben: { zug: [{ ost: 0, nord: 0, hoehe: 100 }, { ost: 0, nord: -0.001, hoehe: 102.5 }] } }),
        kommando('ko-b', 'schacht-zeichnen', { neu: ['cde-B'], werte: { name: 'B', ...SCHACHT },
            eingaben: { zug: [{ ost: 30, nord: 0, hoehe: 99.85 }, { ost: 30, nord: -0.001, hoehe: 102.4 }] } }),
        kommando('ko-h', 'rohr-zeichnen', { neu: ['cde-H'], werte: { name: 'H', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 },
            eingaben: { zug: [{ ost: 0, nord: 0, hoehe: 100 }, { ost: 30, nord: 0, hoehe: 99.85 }] } }),
    ]) {
        const erg = await b.fuehreAus(k);
        expect(erg.grund).toBe(null);
    }
    const ae = useAenderungen();
    return { b, ae, subjekt: (gid, opts = {}) => subjektAusStand(gid, { wirksamerStand: ae.wirksamerStand, ...opts }) };
}

/** Die echte Engine-Logik über den Prototyp (Muster `fachmodellJournal.test.js`), mit demselben Journalstand. */
function engineMit(ae, { achsen = new Map(), knoten = new Map() } = {}) {
    const dies = Object.assign(Object.create(IfcEngine.prototype), {
        _achsen: achsen.size ? new Map([['m1', achsen]]) : new Map(),
        _knoten: knoten.size ? new Map([['m1', knoten]]) : new Map(),
        _merkmale: new Map(),
        quelleVon: () => null,
        merkmaleAlle: () => new Map(),
    });
    IfcEngine.prototype.setzeJournalStand.call(dies, {
        ...cdeAchsenAus(ae.wirksamerStand('erzeugt')),
        verdeckt: verdeckteAus(ae.wirksamerStand('geloescht')),
    });
    return dies;
}

describe('1 — das Subjekt aus dem Stand', () => {
    it('eine eigene Haltung: Achse, Strang, Knoten, Hülle, Lage, Versatz', async () => {
        const { subjekt } = await achseGezogen();
        const s = subjekt('cde-H');
        expect(s).toMatchObject({ globalId: 'cde-H', name: 'H', category: 'IFCPIPESEGMENT', type: 'IFCPIPESEGMENT', hoehenversatz: 0 });
        // Die gezeichneten Höhen sind SOHLEN (K4); seit Stufe 4 (K4b) auch so
        // gespeichert, und die Achse sagt es.
        expect(s.achse).toMatchObject({ globalId: 'cde-H', dn: 300, quelle: 'bauplan', achsbezug: 'sohle' });
        expect(s.achse.sohlabstand).toBeCloseTo(0.15, 12);
        expect(s.achse.anfang.y).toBeCloseTo(100, 9);
        expect(s.achse.ende.y).toBeCloseTo(99.85, 9);
        expect(s.strang.map(k => k.globalId)).toEqual(['cde-H']);
        expect(s.knotenImNetz.map(k => k.globalId).sort()).toEqual(['cde-A', 'cde-B']);
        expect(s.stand.bauplan.rezept).toBe('rohr');

        // Die Hülle ist die des gebauten Rohrs (Kreis DN 300 um die Punkte).
        const g = rezeptNach('rohr').baue(s.stand.bauplan.parameter);
        g.computeBoundingBox();
        const bb = g.boundingBox;
        expect(s.anker).toEqual({ x: (bb.min.x + bb.max.x) / 2, y: (bb.min.y + bb.max.y) / 2, z: (bb.min.z + bb.max.z) / 2 });
        expect(s.bezugshoehe).toBeCloseTo(99.85, 4);          // die Sohle am tiefen Ende
        expect(s.oberkante).toBeCloseTo(100 + 0.3, 4);        // der Scheitel am hohen
        // Ohne Bezug: Ost = x, Nord = −z, Versatz null.
        expect(s.lage).toEqual({ ost: s.anker.x, nord: -s.anker.z, hoehe: s.anker.y });
        expect(s.versatz).toEqual({ x: 0, y: 0, z: 0 });
        expect(s.lageUmkehrbar).toBe(true);
    });

    it('ein eigener Schacht: seine Anschlüsse, mit dem Ende, das an ihm hängt', async () => {
        const { subjekt } = await achseGezogen();
        const a = subjekt('cde-A'), b = subjekt('cde-B');
        expect(a.achse).toBeUndefined();
        expect(a.anschluesse.map(x => [x.globalId, x.ende])).toEqual([['cde-H', 'anfang']]);
        expect(b.anschluesse.map(x => [x.globalId, x.ende])).toEqual([['cde-H', 'ende']]);
        expect(a.bezugshoehe).toBeCloseTo(100, 3);
    });

    it('der Stand ist derselbe, den der Store dem gewählten Bauteil gibt', async () => {
        const { b, ae, subjekt } = await achseGezogen();
        await b.einordne({ globalId: 'cde-H', type: 'IFCPIPESEGMENT' }, null);
        expect(b.bauteil.stand).toEqual(subjekt('cde-H').stand);
        expect(standVon('cde-H', ae.wirksamerStand)).toEqual(b.bauteil.stand);
    });
});

describe('2 — über die Engine dasselbe Subjekt, nur das Netz ist weiter', () => {
    it('ohne gelieferte Modelle: feldgleich', async () => {
        const { ae, subjekt } = await achseGezogen();
        const dies = engineMit(ae);
        for (const gid of ['cde-H', 'cde-A', 'cde-B']) {
            expect(subjekt(gid, { netz: IfcEngine.prototype.netzAuskunft.call(dies) })).toEqual(subjekt(gid));
        }
        // … und in der Form, die die Engine vorher selbst lieferte.
        expect(subjekt('cde-H').strang).toEqual(dies.strangVon('cde-eigenbau', 'cde:cde-H'));
        expect(subjekt('cde-A').anschluesse).toEqual(dies.anschluesseFuer('cde-A'));
        expect(subjekt('cde-H').achse).toEqual(dies.achseVon('cde-eigenbau', 'cde:cde-H'));
    });

    it('mit einer gelieferten Haltung hinter B: der Strang läuft über die Lieferung weiter', async () => {
        const { ae, subjekt } = await achseGezogen();
        const dies = engineMit(ae, {
            achsen: new Map([[7, { globalId: 'H2', name: 'H2', kategorie: 'IFCPIPESEGMENT',
                anfang: { x: 30, y: 99.85, z: 0 }, ende: { x: 60, y: 99.7, z: 0 }, laenge: 30, dn: 300 }]]),
        });
        const ueberEngine = subjekt('cde-H', { netz: IfcEngine.prototype.netzAuskunft.call(dies) });
        expect(ueberEngine.strang.map(k => k.globalId)).toEqual(['cde-H', 'H2']);
        expect(subjekt('cde-H').strang.map(k => k.globalId)).toEqual(['cde-H']);
        // Alles andere bleibt gleich.
        const { strang: _a, ...rest1 } = ueberEngine;
        const { strang: _b, ...rest2 } = subjekt('cde-H');
        expect(rest1).toEqual(rest2);
    });
});

describe('3 — ohne Oberfläche, ohne handgebautes Subjekt', () => {
    it('Verschieben einer eigenen Haltung — im Viewer tat es an eigenen Bauteilen nichts', async () => {
        const { b, ae, subjekt } = await achseGezogen();
        const s = subjekt('cde-H');
        const erg = await b.fuehreAus(kommando('ko-v', 'verschieben', { ziel: ['cde-H'],
            werte: { ost: s.lage.ost + 5, nord: s.lage.nord, hoehe: s.lage.hoehe } }));
        expect(erg.grund).toBe(null);
        expect(ae.wirksamerStand('erzeugt').get('cde-H').parameter.punkte.map(p => p[0])).toEqual([5, 35]);
    });

    it('„Sohlhöhen festlegen" findet seine Vorbelegung an der Achse (im Viewer war das Feld leer)', async () => {
        const { subjekt } = await achseGezogen();
        const vor = nachId('sohlhoehen-setzen').vorbelegung(subjekt('cde-H'));
        // Die Punkthöhe einer eigenen Haltung — was sie bedeutet (Mitte oder
        // Sohle), klärt K4 (E7); hier zählt, dass das Formular sie überhaupt sieht.
        expect(Object.values(vor).filter(v => typeof v === 'number').sort((x, y) => y - x)).toEqual([100, 99.85]);
    });
});

describe('4 — was es ohne Oberfläche nicht gibt, wird abgelehnt', () => {
    it('ein geliefertes Ziel: braucht sein geladenes Modell', async () => {
        const { b } = await achseGezogen();
        const erg = await b.fuehreAus(kommando('ko-g', 'umbenennen', { ziel: ['2TestDGM0000000000TEST'], werte: { muster: 'X', beginn: 1 } }));
        expect(erg.ausgefuehrt).toBe(false);
        expect(erg.grund).toMatch(/geliefertes Bauteil braucht sein geladenes Modell/);
    });

    it('ein verdecktes eigenes Bauteil hat kein Subjekt mehr (E8)', async () => {
        const { b, subjekt } = await achseGezogen();
        expect((await b.fuehreAus(kommando('ko-l', 'loeschen', { ziel: ['cde-H'], werte: {} }))).grund).toBe(null);
        expect(subjekt('cde-H')).toBe(null);
        expect(subjekt('cde-A').anschluesse).toBeUndefined();
        const erg = await b.fuehreAus(kommando('ko-u', 'umbenennen', { ziel: ['cde-H'], werte: { muster: 'X', beginn: 1 } }));
        expect(erg.grund).toMatch(/gibt es nicht \(mehr\)/);
    });
});

describe('5 — Verklebung (Textwächter): der Viewer ruft für eigene Bauteile dieselbe Funktion', () => {
    it('`_einordnenMitHuelle` nimmt `subjektAusStand` mit dem Netz der Engine', async () => {
        // Derselbe Lesepfad wie die übrigen Textwächter (`kontextleiste.test.js`).
        const { readFileSync } = await import('node:fs');
        const { fileURLToPath } = await import('node:url');
        const wurzel = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
        const viewer = readFileSync(wurzel + 'components/IfcViewer.vue', 'utf8');
        const block = viewer.slice(viewer.indexOf('async function _einordnenMitHuelle'), viewer.indexOf('return bearbeitung.einordne(angereichert'));
        // Aufgerufen mit dem Netz der Engine — UND das Ergebnis geht ins Subjekt.
        expect(block).toMatch(/const eigen = subjektAusStand\(result\.globalId, \{[^}]*netz: engine\.value\?\.netzAuskunft\?\.\(\)[^;]*\}\);\s*if \(eigen\) angereichert = \{ \.\.\.angereichert, \.\.\.eigen \};/s);
    });
});

// ── Fahrplan R5: gegen das Subjekt des ECHTEN Viewers ────────────────────────
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { netzauskunftAus } from '../services/CdeAchsen.js';
import { rahmenAusBezug } from '../services/kommando/Kommando.js';
import { bestimmeBezug } from '../services/Projektkoordinaten.js';

describe('Das Subjekt aus dem Stand ist das Subjekt des Viewers (Fixture aus dem Browser, Fahrplan R5)', () => {
    // Aufgenommen am 2026-09-19 im Browser (:3001, 42069): das A64-Netz geladen,
    // zwei eigene Schächte und eine eigene Haltung per Kommando, dann über die
    // Auswahl gewählt — `bearbeitung.bauteil`, so wie Werkzeuge es bekommen.
    // Dazu die EINGABEN des Viewers: der Journalstand, der Bezug des ersten
    // Modells (Georeferenz + Versatz) und die Knoten der Netzauskunft (auch
    // die 524 gelieferten Schächte). Bis hierher war die Gleichheit nur im
    // Browser gemessen; jetzt ist sie ein Test.
    const F = JSON.parse(readFileSync(join(process.cwd(), 'src/features/cde/test/fixtures/viewerSubjekt-2026-09-19.json'), 'utf8'));
    const wirksamerStand = (art) => new Map(F.stand[art] ?? []);
    const rahmen = rahmenAusBezug(bestimmeBezug({ georeferenz: F.bezug.georeferenz, versatz: F.bezug.versatz }));
    const netz = netzauskunftAus(cdeAchsenAus(wirksamerStand('erzeugt')).kanten, F.netzKnoten);

    /** Feld für Feld, Zahlen auf 1e-9 — die Pfade, die abweichen. */
    function abweichungen(a, b, pfad = '') {
        if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a)) ? [] : [`${pfad}: ${a} ≠ ${b}`];
        if (Array.isArray(a) || Array.isArray(b)) {
            if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return [`${pfad}: Länge ${a?.length} ≠ ${b?.length}`];
            return a.flatMap((x, i) => abweichungen(x, b[i], `${pfad}[${i}]`));
        }
        if (a && b && typeof a === 'object' && typeof b === 'object') {
            const schluessel = new Set([...Object.keys(a), ...Object.keys(b)]);
            return [...schluessel].flatMap(k => abweichungen(a[k], b[k], `${pfad}.${k}`));
        }
        return Object.is(a, b) || a === b ? [] : [`${pfad}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`];
    }

    // 16/14 bei der Aufnahme, 17/15 seit Teil XXV (V3): der Erdbau-Stand kommt
    // jetzt aus dem Journal statt aus dem Viewer. Dass er DASSELBE ist, prüft
    // der Feldvergleich unten — die Fixture hält den Viewer-Wert fest.
    for (const [rolle, gid, felderSoll] of [['Haltung', F.gids.H1, 17], ['Schacht', F.gids.S1, 15]]) {
        it(`${rolle}: alle ${felderSoll} Felder des Subjekts gleich denen des Viewers`, () => {
            const s = JSON.parse(JSON.stringify(subjektAusStand(gid, { wirksamerStand, rahmen, netz })));
            const felder = Object.keys(s);
            expect(felder).toHaveLength(felderSoll);                              // vorher: 0 verglichen
            const v = F.viewer[gid];
            const aus = felder.flatMap(k => abweichungen(s[k], v[k], k))
                // SEIT DER AUFNAHME dazugekommen (Teil XXV, V2): die Achse nennt
                // ihre Profilhöhe (Sohle → Scheitel), damit der Scheitel eines
                // unsymmetrischen Querschnitts nicht als 2 × Sohlabstand geraten
                // wird. Additiv — jeder ALTE Wert muss weiter stimmen. Geprüft
                // in `kostenprobe.test.js`.
                .filter(z => !/\.profilhoehe:/.test(z))
                // Ebenso nach der Aufnahme dazugekommen, aber NICHT von hier:
                // `erdbauStandVon` nennt seit Durchstich 2 (S2, `00d0ee0`) die
                // Operationen des Stapels. Beide Seiten rufen dieselbe Funktion.
                .filter(z => !/^erdbau\.operationen:/.test(z));
            expect(aus).toEqual([]);
        });
    }
});
