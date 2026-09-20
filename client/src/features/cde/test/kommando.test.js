// @vitest-environment jsdom
/**
 * Das Kommando als Wert (Teil XXIV, K1).
 *
 * Geprüft wird, was K1 verspricht:
 *   1. Das Schema lehnt nur Technisches ab (E5) — und sagt, was.
 *   2. Kommandos sprechen in Ost/Nord/m NN (O1); der Weg Welt → Projekt → Welt
 *      ist verlustfrei, auch mit Kartenbezug (Drehung, Massstab).
 *   3. Die Auswertung ruft das UNVERÄNDERTE Werkzeug: für die Proben des
 *      A6-Goldstandards liefert sie dieselben Schritte wie der direkte Aufruf.
 *   4. Neue Kennungen kommen vom Aufrufer (E2) — aus `neu`, sonst aus seinem Geber.
 *   5. `fuehreAus` schreibt ohne Oberfläche (kein Modus, kein scharfes Werkzeug)
 *      und ganz oder gar nicht.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
    KOMMANDO_SCHEMA, kommandoAusZustand, pruefeKommando, punktAusWelt, punktInWelt,
    rahmenAusBezug, rahmenOhneBezug,
} from '../services/kommando/Kommando.js';
import { werteAus } from '../services/kommando/Auswertung.js';
import { bestimmeBezug } from '../services/Projektkoordinaten.js';
import { nachId, werkzeugKatalog } from '../services/Bearbeitungen.js';
import { neueGlobalId, rezeptNach, zufallsKennung } from '../services/Bauteilrezepte.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { OHNE_PROBE, PROBEN_ALLE } from './hilfen/werkzeugProben.js';
import { repo } from '../services/RepoFacade.js';

/** Eine Ablage im Speicher — wie auf dem Server, nur ohne Netz. */
class Speicher {
    constructor() { this.d = new Map(); }
    async get(k) { return this.d.has(k) ? JSON.parse(this.d.get(k)) : null; }
    async set(k, v) { this.d.set(k, JSON.stringify(v)); return true; }
    async delete(k) { this.d.delete(k); return true; }
    async listKeys(p) { return [...this.d.keys()].filter(x => x.startsWith(p)); }
    async getBlob() { return null; }
    async setBlob() { return false; }
    async deleteBlob() { return false; }
    async listBlobs() { return []; }
}

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

const schacht = (neu = ['cde-sA'], extra = {}) => ({
    schema: KOMMANDO_SCHEMA, id: 'ko-test-1', werkzeug: 'schacht-zeichnen', ziel: [], neu,
    eingaben: { zug: [{ ost: 10, nord: -5, hoehe: 100 }, { ost: 10, nord: -5.001, hoehe: 102.5 }] },
    werte: { name: 'S1', kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', hoehe: '', dn: 1000 },
    wer: 'Test', wann: '2026-09-18T20:00:00Z', ...extra,
});

describe('1 — das Schema lehnt nur Technisches ab, und sagt was', () => {
    it('ein gültiges Kommando besteht', () => {
        expect(pruefeKommando(schacht())).toEqual([]);
    });

    it('ein Schema, das diese CDE nicht kennt, wird abgelehnt — nicht geraten', () => {
        expect(pruefeKommando({ ...schacht(), schema: 2 })[0]).toMatch(/Kommando-Schema 2 kennt diese CDE nicht/);
        expect(pruefeKommando({ ...schacht(), schema: undefined })[0]).toMatch(/kennt diese CDE nicht/);
    });

    it('Werkzeug, Ziel und Erzeugen', () => {
        expect(pruefeKommando({ ...schacht(), werkzeug: 'gibts-nicht' }).join()).toMatch(/gibt es nicht/);
        expect(pruefeKommando({ ...schacht(), ziel: ['X'] }).join()).toMatch(/erzeugt — es hat kein Ziel/);
        // „Sohlhöhen festlegen" wirkt auf EIN Bauteil (fünf Haltungen mit derselben Sohle ebneten den Strang ein).
        expect(nachId('sohlhoehen-setzen').mehrfach).toBeFalsy();
        const setzen = { schema: 1, id: 'k', werkzeug: 'sohlhoehen-setzen', ziel: [], werte: { anfang: 100, ende: 99.9 } };
        expect(pruefeKommando(setzen).join()).toMatch(/fehlt die GlobalId/);
        expect(pruefeKommando({ ...setzen, ziel: ['A', 'B'] }).join()).toMatch(/wirkt auf ein Bauteil, nicht auf 2/);
        expect(pruefeKommando({ ...setzen, ziel: [3] }).join()).toMatch(/Liste von GlobalIds/);
    });

    it('neue Kennungen haben die Form eigener Bauteile und kommen nicht doppelt', () => {
        expect(pruefeKommando(schacht(['A'])).join()).toMatch(/weder die Kennung eines eigenen Bauteils \(cde-…\) noch einer Operation \(op-…\)/);
        expect(pruefeKommando(schacht(['cde-a', 'op-b']))).toEqual([]);
        expect(pruefeKommando(schacht(['cde-x', 'cde-x'])).join()).toMatch(/doppelt/);
    });

    it('Punkte: nur zug/umriss, Ost und Nord als Zahlen, Knotenverweise nur am Rand eines Zugs, der auf Knoten fängt', () => {
        expect(pruefeKommando(schacht(undefined, { eingaben: { strich: [] } })).join()).toMatch(/diesen Schlitz gibt es nicht/);
        expect(pruefeKommando(schacht(undefined, { eingaben: { zug: [{ ost: 1 }] } })).join()).toMatch(/Ost und Nord/);
        // Seit K8 (E6) gibt es Knotenverweise — ein Schacht fängt aber nicht auf Knoten.
        expect(pruefeKommando(schacht(undefined, { eingaben: { zug: [{ knoten: 'cde-a' }] } })).join()).toMatch(/nur am Anfang oder Ende eines Zugs, der auf Knoten fängt/);
        expect(pruefeKommando(schacht(undefined, { eingaben: { zug: [{ ost: 1, nord: 2, hoehe: 'x' }] } })).join()).toMatch(/Höhe/);
    });
});

describe('2 — Ost/Nord/m NN: Welt → Projekt → Welt ist verlustfrei', () => {
    it('ohne Bezug: Ost = x, Nord = −z, Höhe = y + Höhenversatz; ohne Höhe bleibt ohne', () => {
        const r = rahmenOhneBezug({ hoehenversatz: 300 });
        expect(punktAusWelt({ x: 3, y: 1.5, z: 4 }, r)).toEqual({ ost: 3, nord: -4, hoehe: 301.5 });
        expect(punktAusWelt({ x: 3, z: 4 }, r)).toEqual({ ost: 3, nord: -4 });
        expect(punktInWelt({ ost: 3, nord: -4 }, r)).toEqual({ x: 3, z: 4 });
        expect(punktAusWelt([3, 1.5, 4], r)).toEqual({ ost: 3, nord: -4, hoehe: 301.5 });
    });

    it('mit Kartenbezug (gedreht, skaliert, verschoben) und Ladeversatz — auf 1e-9 m', () => {
        const bezug = bestimmeBezug({
            georeferenz: { kartenbezug: { ost: 410000, nord: 5460000, hoehe: 100, drehung: 0.3, massstab: 0.9996 }, crs: { name: 'EPSG:25832' } },
            versatz: { x: 12.5, y: 3, z: -40 },
        });
        expect(bezug.mapAngewandt).toBe(true);
        const r = rahmenAusBezug(bezug);
        for (let i = 0; i < 50; i++) {
            const p = { x: (i * 37.1) % 500 - 250, y: (i * 3.3) % 20 - 5, z: (i * 91.7) % 500 - 250 };
            const q = punktAusWelt(p, r);
            const w = punktInWelt(q, r);
            expect(Math.abs(w.x - p.x)).toBeLessThan(1e-9);
            expect(Math.abs(w.y - p.y)).toBeLessThan(1e-9);
            expect(Math.abs(w.z - p.z)).toBeLessThan(1e-9);
            // Die Lage ist die des Bezugs selbst — dieselbe Zahl, die jedes Fenster zeigt.
            const amtlich = bezug.nachProjekt(p);
            expect(Math.abs(q.ost - amtlich.ost)).toBeLessThan(1e-9);
            expect(Math.abs(q.nord - amtlich.nord)).toBeLessThan(1e-9);
        }
    });
});

/** Zufallskennungen in der Reihenfolge ihres Auftretens ersetzen — wie der A6-Goldstandard. */
function normiere(wert) {
    const karte = new Map();
    return JSON.parse(JSON.stringify(wert ?? null, (k, v) => (typeof v === 'string' && /^(cde|ab|op)-[a-z0-9]+-[a-z0-9]+$/.test(v)
        ? (karte.has(v) ? karte.get(v) : (karte.set(v, `ID${karte.size}`), karte.get(v))) : v)));
}
/** Gleich bis auf Rundung — der Weg über Projektkoordinaten darf 1e-9 m kosten, nicht mehr. */
function gleichBisAuf(a, b, eps = 1e-9, pfad = '') {
    if (typeof a === 'number' && typeof b === 'number') {
        if (Math.abs(a - b) > eps) throw new Error(`${pfad}: ${a} ≠ ${b}`);
        return;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
        const schluessel = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const s of schluessel) gleichBisAuf(a[s], b[s], eps, `${pfad}.${s}`);
        return;
    }
    if (a !== b) throw new Error(`${pfad}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
}

describe('3 — die Auswertung ruft das unveränderte Werkzeug', () => {
    // Fahrplan R4: bis hierher nur die 15 Werkzeuge des A6-Goldstandards; jetzt
    // jedes Werkzeug des Katalogs (`hilfen/werkzeugProben.js`).
    it('für jede Probe — jedes Katalogwerkzeug — dieselben Schritte wie der direkte Aufruf', () => {
        let n = 0;
        for (const p of PROBEN_ALLE) {
            const b = nachId(p.id);
            const r = rahmenOhneBezug({ hoehenversatz: p.el.hoehenversatz ?? 0 });
            for (const w of p.werte) {
                const direkt = b.anwenden(p.el, w, { nummer: 0, zug: p.zug ?? [], kandidatenVon: p.kandidaten ?? null });
                const { kommando } = kommandoAusZustand({ werkzeug: b, werte: w, subjekte: [p.el], punkte: p.zug ?? null, rahmen: r });
                expect(pruefeKommando(kommando), p.id).toEqual([]);
                const aus = werteAus(kommando, {
                    subjektVon: (gid) => (gid === p.el.globalId ? p.el : null), rahmen: r,
                    kennungsgeber: zufallsKennung, pruefeWerte: () => [],
                    kandidatenVon: p.kandidaten ?? null,
                });
                const erwartet = normiere((Array.isArray(direkt) ? direkt : [direkt]).filter(x => x?.art));
                gleichBisAuf(normiere(aus.schritte), erwartet, 1e-9, `${p.id}/${JSON.stringify(w)}`);
                n++;
            }
        }
        expect(n).toBeGreaterThanOrEqual(90);
    });

    it('jedes Katalogwerkzeug hat eine Probe oder einen genannten Grund — und jede Probe liefert Schritte', () => {
        const mitProbe = new Set(PROBEN_ALLE.map(p => p.id));
        const ids = werkzeugKatalog().map(b => b.id);
        const offen = ids.filter(id => !mitProbe.has(id) && !OHNE_PROBE[id]);
        expect(offen).toEqual([]);                                             // vorher: 48 ohne Probe
        expect(Object.keys(OHNE_PROBE).length).toBeLessThanOrEqual(5);
        for (const [id, grund] of Object.entries(OHNE_PROBE)) expect(grund, id).toMatch(/\S{10,}/);
        // Ein Werkzeug, dessen Proben nie etwas schreiben, wäre nicht geprüft —
        // der Vergleich zweier leerer Listen beweist nichts. (Einzelne Proben
        // DÜRFEN leer sein: A6 hält auch das Nein eines Werkzeugs fest.)
        const schreibt = new Set(PROBEN_ALLE.filter(p => p.werte.some(w => {
            const r = nachId(p.id).anwenden(p.el, w, { nummer: 0, zug: p.zug ?? [], kandidatenVon: p.kandidaten ?? null });
            return [].concat(r ?? []).some(x => x?.art);
        })).map(p => p.id));
        expect([...mitProbe].filter(id => !schreibt.has(id))).toEqual([]);
    });

    it('Gesten stehen unter `eingaben` (auswahl, punkt) — und kommen beim Werkzeug an wie vorher', () => {
        const r = rahmenOhneBezug();
        // AUSWAHL: „Aussparung ableiten" wählt einen eigenen Körper als Werkzeug.
        const wand = { globalId: '2Wand000000000000000001', modelId: 'm1', category: 'IFCWALL', name: 'W1',
                       koerperQuellen: [{ globalId: 'cde-kern', name: 'Kern' }], quellmass: { pruefmass: { n: 1 } } };
        const aussparung = nachId('aussparung-ableiten');
        const w1 = { werkzeug: 'cde-kern' };
        const { kommando: k1 } = kommandoAusZustand({ werkzeug: aussparung, werte: w1, subjekte: [wand], rahmen: r });
        expect(k1.eingaben).toEqual({ auswahl: { werkzeug: 'cde-kern' } });
        expect(k1.werte).toEqual({});
        expect(pruefeKommando(k1)).toEqual([]);
        const a1 = werteAus(k1, { subjektVon: () => wand, kennungsgeber: zufallsKennung, pruefeWerte: () => [] });
        gleichBisAuf(normiere(a1.schritte), normiere(aussparung.anwenden(wand, w1, { nummer: 0, zug: [] })));
        expect(a1.schritte.length).toBeGreaterThan(1);

        // PUNKT: „Haltung teilen" bei Station 4 m auf der Achse des Ziels.
        const rohr = { globalId: '2Rohr0Haltung000000001', category: 'IFCPIPESEGMENT', name: 'H-001', hoehenversatz: 0,
                       achse: { anfang: { x: 0, y: -1.5, z: 0 }, ende: { x: 10, y: -1.7, z: 0 }, laenge: 10, dn: 300 }, stand: {} };
        const teilen = nachId('haltung-teilen');
        const { kommando: k2 } = kommandoAusZustand({ werkzeug: teilen, werte: { station: 4 }, subjekte: [rohr], rahmen: r });
        expect(k2.eingaben).toEqual({ punkt: { station: 4 } });
        const a2 = werteAus(k2, { subjektVon: () => rohr, kennungsgeber: zufallsKennung, pruefeWerte: () => [] });
        gleichBisAuf(normiere(a2.schritte), normiere(teilen.anwenden(rohr, { station: 4 }, { nummer: 0, zug: [] })));
        expect(a2.schritte.map(s => s.art)).toEqual(['geloescht', 'erzeugt', 'erzeugt']);

        // Ein Feld, das das Werkzeug nicht als diese Geste kennt, ist ein Schemafehler.
        expect(pruefeKommando({ ...k2, eingaben: { punkt: { gibtsnicht: 1 } } }).join()).toMatch(/kennt dieses Feld nicht als punkt/);
        expect(pruefeKommando({ ...k1, eingaben: { auswahl: { werkzeug: 7 } } }).join()).toMatch(/eine Auswahl ist eine GlobalId/);
    });

    it('das Werkzeug lehnt ab → die Auswertung nennt seinen Grund', () => {
        const b = nachId('bezugshoehe-setzen');
        const el = { globalId: 'G1', category: 'IFCFOOTING', anker: null, hoehenversatz: 0, stand: {} };
        const { kommando } = kommandoAusZustand({ werkzeug: b, werte: { hoehe: 298 }, subjekte: [el], rahmen: rahmenOhneBezug() });
        const aus = werteAus(kommando, { subjektVon: () => el, pruefeWerte: () => [] });
        expect(aus.schritte).toEqual([]);
        expect(aus.grund).toBeTruthy();
    });

    it('ein fehlendes Ziel wird abgelehnt (E8), nicht übersprungen', () => {
        const k = { schema: 1, id: 'k', werkzeug: 'kg-setzen', ziel: ['weg'], werte: { kg: '411' } };
        expect(werteAus(k, { subjektVon: () => null }).grund).toMatch(/gibt es nicht \(mehr\)/);
    });
});

describe('4 — die Kennung vergibt der Aufrufer (E2)', () => {
    it('aus `neu`: der Schacht heisst, wie das Kommando es sagt — und trägt Sohle UND Deckel', () => {
        const aus = werteAus(schacht(['cde-sA']));
        expect(aus.grund).toBeNull();
        expect(aus.schritte.map(s => s.globalId)).toEqual(['cde-sA']);
        expect(aus.neu).toEqual(['cde-sA']);
        // Jeder Punkt behält seine Höhe: Sohle 100, Deckel 102,5 (ohne Bezug: y = m NN).
        expect(aus.schritte[0].nachher.parameter.punkte.map(p => p[1])).toEqual([100, 102.5]);
    });

    it('zu wenige oder zu viele Kennungen: abgelehnt, mit Zahl', () => {
        expect(werteAus(schacht([])).grund).toMatch(/nennt 0 neue Kennung/);
        expect(werteAus(schacht(['cde-a', 'cde-b'])).grund).toMatch(/1 Kennung\(en\) mehr, als entstehen/);
    });

    it('ohne `neu` zieht der Geber des Aufrufers — und das Ergebnis nennt, was verwendet wurde', () => {
        let i = 0;
        const { neu: _weg, ...ohneNeu } = schacht();
        const aus = werteAus(ohneNeu, { kennungsgeber: () => `cde-geber-${++i}` });
        expect(aus.neu).toEqual(['cde-geber-1']);
        expect(aus.schritte[0].globalId).toBe('cde-geber-1');
    });

    it('nach der Auswertung gilt die Quelle nicht mehr — auch nach einem Fehler', () => {
        werteAus(schacht([]));                       // wirft intern und fängt
        werteAus(schacht(['cde-sA']));
        expect(neueGlobalId()).toMatch(/^cde-[a-z0-9]+-[a-z0-9]+$/);
        expect(neueGlobalId()).not.toBe('cde-sA');
    });
});

describe('5 — fuehreAus: ohne Oberfläche, ganz oder gar nicht', () => {
    it('schreibt ohne Bearbeiten-Modus und ohne scharfes Werkzeug — mit der Kennung aus `neu`', async () => {
        const b = useBearbeitung(), ae = useAenderungen();
        expect(b.modusAn).toBe(false);
        const erg = await b.fuehreAus(schacht(['cde-sA']));
        expect(erg.ausgefuehrt).toBe(true);
        expect(erg.eintraege.map(e => e.globalId)).toEqual(['cde-sA']);
        expect(ae.wirksamerStand('erzeugt').get('cde-sA')).toMatchObject({ rezept: 'schacht', parameter: { dn: 1000 } });
        expect(erg.kommando.neu).toEqual(['cde-sA']);
    });

    it('abgelehnt heisst: nichts im Journal', async () => {
        const b = useBearbeitung(), ae = useAenderungen();
        const vorher = ae.eintraege.length;
        expect((await b.fuehreAus({ ...schacht(), schema: 9 })).ausgefuehrt).toBe(false);
        expect((await b.fuehreAus(schacht([]))).ausgefuehrt).toBe(false);
        expect(ae.eintraege.length).toBe(vorher);
    });

    it('„neu" heisst neu: eine Kennung, die das Journal kennt, bekommt kein zweites Bauteil', async () => {
        const b = useBearbeitung(), ae = useAenderungen();
        await b.fuehreAus(schacht(['cde-sA']));
        const erg = await b.fuehreAus({ ...schacht(['cde-sA']), id: 'ko-test-2' });
        expect(erg.ausgefuehrt).toBe(false);
        expect(erg.grund).toMatch(/gibt es schon/);
        expect(ae.eintraege.length).toBe(1);
    });

    it('die Oberfläche geht denselben Weg: gezeichnet im Raum, übersetzt über den Rahmen, gleich zurück', async () => {
        const b = useBearbeitung(), ae = useAenderungen();
        const bezug = bestimmeBezug({ georeferenz: null, versatz: { x: 410000, y: 0, z: -5460000 } });
        b.setzeRahmen(rahmenAusBezug(bezug));
        b.modusSetzen(true);
        const punkte = [{ x: 1.25, z: 2.5 }, { x: 21.75, z: 2.5 }];
        expect(b.starte('rohr-zeichnen', { subjekt: { punkte, hoehenversatz: 0 } })).toBe(true);
        b.setzeWert('hoehe', 290); b.setzeWert('dn', 300);
        const e = await b.ausfuehren({ wer: 'Test', subjekt: { punkte, hoehenversatz: 0 } });
        expect(e?.globalId).toMatch(/^cde-/);
        const gebaut = ae.wirksamerStand('erzeugt').get(e.globalId).parameter.punkte;
        expect(Math.abs(gebaut[0][0] - 1.25)).toBeLessThan(1e-9);
        expect(Math.abs(gebaut[1][0] - 21.75)).toBeLessThan(1e-9);
        expect(Math.abs(gebaut[0][2] - 2.5)).toBeLessThan(1e-9);
        // Die getippte Höhe ist die SOHLE (Teil XXIV, K4 — E7). Seit Stufe 4 (K4b,
        // ausgeliefert 2026-09-19) steht sie so im Bauplan; bis dahin die
        // Rohrmitte, ausdrücklich: 290 + DN 300 / 2.
        const plan = ae.wirksamerStand('erzeugt').get(e.globalId);
        expect(plan.parameter.achsbezug).toBe('sohle');
        expect(gebaut[0][1]).toBeCloseTo(290, 9);
        expect(rezeptNach('rohr').sohlen.lies(plan.parameter)[0]).toBeCloseTo(290, 9);
    });
});
describe('6 — die Ebene im Kommando (Teil XXV, V6, Fabios E16)', () => {
    // `ebene` steht im Schema, seit es das Schema gibt, und KEIN Produktionsweg
    // setzt sie: die Oberfläche schreibt immer in die aktive Ebene. Ein Feld
    // ohne Beweis ist ein Versprechen — hier ist der Beweis, dass ein Skript
    // gezielt auf die Auftragsebene schreiben kann.
    it('ein Kommando darf seine Ebene nennen — der Eintrag landet dort', async () => {
        const speicher = new Speicher();
        repo.setBackend(speicher);
        setActivePinia(createPinia());
        const b = useBearbeitung();
        const ae = useAenderungen();
        const erg = await b.fuehreAus({
            schema: KOMMANDO_SCHEMA, id: 'ko-ebene', werkzeug: 'linie-zeichnen', ziel: [], neu: ['cde-Lx'],
            werte: { name: 'L', kategorie: 'IFCKERB', hoehe: 100 },
            eingaben: { zug: [{ ost: 0, nord: 0 }, { ost: 10, nord: 0 }] },
            ebene: 'auftrag', wer: 'skript', wann: '2026-09-20T09:00:00Z',
        });
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        expect(ae.ebeneVon('cde-Lx')).toBe('auftrag');
        expect(ae.auftragsEintraege.map(e => e.globalId)).toContain('cde-Lx');
        repo.setBackend(null);
    });
});

