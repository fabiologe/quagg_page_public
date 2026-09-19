// @vitest-environment jsdom
/**
 * Werkzeuge aus Muster + Operation + Katalogeintrag (Teil XXIII, A6; B7, S1).
 *
 * VERHALTENSNEUTRAL: dieselben Eingaben liefen VOR dem Umbau durch die alten,
 * handgeschriebenen Hooks (Fixture `werkzeuge_vor_a6.json`, erzeugt mit
 * `hilfen/werkzeugGold.js`). Die aus Daten erzeugten Werkzeuge müssen
 * DASSELBE sagen — Vorbelegung, Vorbelegung aus dem Zug, jeder Journalschritt.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROBEN, goldVon } from './hilfen/werkzeugGold.js';

const GOLD = JSON.parse(readFileSync(join(process.cwd(), 'src/features/cde/test/fixtures/werkzeuge_vor_a6.json'), 'utf8'));

/**
 * Die FELDER so, wie A6 sie kannte: was dazukam — ein Feld, eine Option, ein
 * Schlüssel —, zählt nicht; was es gab, muss gleich sein. Seit Durchstich 2
 * nennt „Auffüllen" ein drittes Ziel („bis zur Fläche") und ein Feld für die
 * Zieloperation, und „Höhe über dem Rand" darf leer sein (sie gilt nur bei
 * Ziel Höhe). Die Frage dieses Tests bleibt dieselbe: sagen die Werkzeuge zu
 * den ALTEN Eingaben dasselbe? Jeder Journalschritt wird weiter exakt verglichen.
 */
function felderWieA6(felder, gold) {
    if (!Array.isArray(felder) || !Array.isArray(gold)) return felder;
    const alt = new Map(gold.map(f => [f.name, f]));
    return felder.filter(f => alt.has(f.name)).map((f) => {
        const g = alt.get(f.name);
        const aus = Object.fromEntries(Object.entries(f).filter(([k]) => k in g));
        if (Array.isArray(aus.optionen) && Array.isArray(g.optionen)) aus.optionen = aus.optionen.filter(o => g.optionen.some(x => x.wert === o.wert));
        return aus;
    });
}

describe('jedes umgebaute Werkzeug sagt, was es vorher sagte', () => {
    const jetzt = goldVon();
    PROBEN.forEach((p, i) => {
        it(`${p.id} (Probe ${i + 1})`, () => expect({ ...jetzt[i], felder: felderWieA6(jetzt[i].felder, GOLD[i].felder) }).toEqual(GOLD[i]));
    });
});

// ── Die neuen Wege (A6) ───────────────────────────────────────────────────
import { afterEach, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { BEARBEITUNGEN, formwerkzeugFuer, nachId, passende, werkzeugKatalog } from '../services/Bearbeitungen.js';
import { GELAENDE_OPS } from '../services/gelaende/Operationen.js';
import { baueAusBauplan, erzeugtEintrag, rezeptNach, spiegelePunktliste } from '../services/Bauteilrezepte.js';
import { registriereRezepte } from '../services/katalog/Katalog.js';
import { warumNicht } from '../services/Herleitung.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useZeichnen } from '../composables/useZeichnen.js';

describe('Ein Geländewerkzeug entsteht aus seiner Operation', () => {
    // Eine Operation, die NUR hier existiert — kein Zweig in Bearbeitungen.js kennt sie.
    const MULDE = {
        titel: 'Mulde', wende: (r) => ({ raster: r, warnungen: [] }), hoehenfelder: [], punktfelder: ['umriss'],
        wirkflaeche: { form: 'ring', punkte: (p) => p.umriss },
        werkzeug: {
            id: 'mulde-ziehen', titel: 'Mulde ziehen', icon: 'ausheben', rang: 9,
            felder: [{ name: 'tiefe', titel: 'Tiefe', einheit: 'm', typ: 'zahl', vorgabe: 0.3 }],
            vorbelegung: () => ({ tiefe: 0.3 }),
            ausEingabe: (werte, zug) => ({ titel: 'Mulde', ops: [{ art: 'mulde', parameter: {
                umriss: zug.map(p => ({ x: p.x, z: p.z })), tiefe: Number(werte.tiefe) } }] }),
        },
    };
    const UR = { globalId: '1Ur0Gelaende0Vertrag00', name: 'Urgelände', hoehenversatz: 0, quellmass: { cell: 2 } };
    const RING = [{ x: 0, y: 1, z: 0 }, { x: 4, y: 1, z: 0 }, { x: 4, y: 1, z: 4 }];

    it('Muster aus der Wirkfläche (Ring → Umriss, ≥ 3), Felder und Vorbelegung vom Eintrag', () => {
        const w = formwerkzeugFuer('mulde', MULDE);
        expect(w).toMatchObject({ id: 'mulde-ziehen', gruppe: 'gelaende', bauform: 'hoehenfeld', eingabe: 'umriss', mindestPunkte: 3, operation: 'mulde' });
        expect(w.vorbelegung(UR)).toEqual({ tiefe: 0.3 });
    });
    it('anwenden: EIN Vorgang im Erdbau-Stapel mit der neuen Operation — zu wenige Punkte: nichts', () => {
        const w = formwerkzeugFuer('mulde', MULDE);
        const schritte = w.anwenden(UR, { tiefe: 0.5 }, { zug: RING });
        const bauplan = schritte.find(e => e.art === 'erzeugt' && e.nachher.rezept === 'erdbau').nachher;
        // Seit Teil XXIV (K2b) trägt jede Operation eine Kennung (`op-…`).
        expect(bauplan.parameter.operationen[0].id).toMatch(/^op-/);
        expect(bauplan.parameter.operationen.map(({ id, ...o }) => o)).toEqual([{ art: 'mulde', parameter: { umriss: RING.map(p => ({ x: p.x, z: p.z })), tiefe: 0.5 } }]);
        expect(bauplan.name).toMatch(/· Mulde ·/);
        expect(w.anwenden(UR, { tiefe: 0.5 }, { zug: RING.slice(0, 2) })).toBeNull();
    });
    it('die fünf eingebauten stehen im Katalog, in ihrer Reihenfolge', () => {
        const gelaende = BEARBEITUNGEN.filter(b => b.gruppe === 'gelaende' && b.operation).map(b => b.id);
        expect(gelaende).toEqual(['gerinne-einschneiden', 'graben-ausheben', 'auffuellen', 'boeschung-anschliessen', 'planum-herstellen']);
        for (const [art, op] of Object.entries(GELAENDE_OPS)) {
            if (op.werkzeug) expect(nachId(op.werkzeug.id).operation, art).toBe(art);
        }
    });
});

describe('Setzer: eine Regel für die Kennung, zwei weitere als Daten', () => {
    it('Löschen und Bauform auslegen sind Deklarationen', () => {
        expect(nachId('loeschen').setzt).toEqual({ art: 'merkmal', journal: 'geloescht', wert: true });
        expect(nachId('loeschen').anwenden({ globalId: 'H1' })).toEqual({ art: 'geloescht', globalId: 'H1', nachher: true });
        expect(nachId('bauform-auslegen').vorbelegung({ stand: { bauformAusnahme: 'koerper' } })).toEqual({ bauform: 'koerper' });
        expect(nachId('bauform-auslegen').anwenden({ globalId: 'H1' }, { bauform: '' })).toEqual({ art: 'bauform', globalId: 'H1', nachher: null });
    });
    it('ohne Kennung kein Eintrag — und der Grund nennt die GlobalId', () => {
        // Ausgenommen die Setzer OHNE Bauteil (Planinhalt, Rotstift — Fahrplan R2):
        // ihre Kennungen stehen in den Werten, und ohne Werte gibt es nichts.
        for (const b of BEARBEITUNGEN.filter(x => x.setzt && !x.ohneBauteil)) {
            expect(b.anwenden({ globalId: '' }, {}), b.id).toBeNull();
            expect(b.warumNicht({ globalId: '' }), b.id).toMatch(/GlobalId/);
        }
        for (const b of BEARBEITUNGEN.filter(x => x.ohneBauteil)) {
            expect(b.anwenden({}, {}), b.id).toBeNull();
            expect(b.warumNicht({}, {}), b.id).toMatch(/Nichts einzutragen/);
        }
    });
});

describe('Ein Rezeptfeld mit `setzbar` bringt sein Werkzeug mit', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); useBearbeitung().modusSetzen(true); });
    afterEach(() => registriereRezepte([]));

    it('DN eines EIGENEN Rohrs ändern: neuer Bauplan unter derselben Kennung, der Körper wird dicker', async () => {
        const b = useBearbeitung(), ae = useAenderungen();
        const z = useZeichnen({ bearbeitung: b, cde: { bearbeiter: 'Fabio' }, getModellSha: () => 'sha1', getHoehenversatz: () => 0 });
        z.starte('rohr-zeichnen');
        b.setzeWert('hoehe', 5); b.setzeWert('dn', 300);
        for (const p of [{ x: 0, z: 0 }, { x: 10, z: 0 }]) z.setzePunkt(p);
        await z.abschliessen();
        const gid = ae.eintraege[0].globalId;

        await b.einordne({ globalId: gid, modelId: 'cde-eigenbau', localId: 1, category: 'IFCPIPESEGMENT', name: '' }, null);
        const ids = b.moeglich.map(x => x.id);
        expect(ids).toContain('rohr-dn-setzen');
        expect(ids).not.toContain('schacht-dn-setzen');
        expect(b.starte('rohr-dn-setzen')).toBeTruthy();
        expect(b.werte.dn).toBe(300);                                   // vorbelegt aus dem Bauplan
        b.setzeWert('dn', 500);
        await b.ausfuehren({ wer: 'Fabio' });
        const plan = ae.wirksamerStand('erzeugt').get(gid);
        expect(plan.parameter.dn).toBe(500);
        expect(rezeptNach('rohr').formAus(plan.parameter, 'koerper').volumen)
            .toBeGreaterThan(rezeptNach('rohr').formAus({ ...plan.parameter, dn: 300 }, 'koerper').volumen * 2.5);
    });

    it('an einem Bauteil eines anderen Rezepts erscheint es nicht — mit Grund', () => {
        const schacht = { bauform: 'koerper', guete: 'gemessen' };
        expect(passende(schacht, { eigenes: true, rezept: rezeptNach('schacht') }).map(x => x.id)).not.toContain('rohr-dn-setzen');
        expect(warumNicht(nachId('rohr-dn-setzen'), { ...schacht, rezept: rezeptNach('schacht') })).toMatch(/Rezept „rohr"/);
    });

    it('ein Rezept der Bibliothek bringt seine Setzer mit — ohne Code', () => {
        registriereRezepte([{ id: 'kanal-rechteck', titel: 'Kanal', bauform: 'achse+profil', kategorieVorgabe: 'IFCPIPESEGMENT',
            mindestPunkte: 2, geschlossen: false, netzrolle: 'kante',
            felder: [{ name: 'b', titel: 'Breite', typ: 'zahl', vorgabe: 1200, setzbar: true }, { name: 'h', titel: 'Höhe', typ: 'zahl', vorgabe: 800 }],
            geometrie: { art: 'sweep', profil: { art: 'rechteck', breite: 'b', tiefe: 'h', einheit: 'mm' } } }]);
        expect(werkzeugKatalog().map(x => x.id)).toEqual(expect.arrayContaining(['kanal-rechteck-zeichnen', 'kanal-rechteck-b-setzen']));
        expect(nachId('kanal-rechteck-h-setzen')).toBeNull();
    });
});

describe('Spiegeln', () => {
    const RING = [[0, 1, 0], [6, 1, 0], [6, 1, 2]];
    const EIGEN = { globalId: 'cde-a-b', stand: { bauplan: { rezept: 'flaeche', kategorie: 'IFCANNOTATION', name: 'F', parameter: { punkte: RING } } } };

    it('an der Ost–West-Achse durch den Schwerpunkt: z spiegelt, x und Höhe bleiben', () => {
        const p = spiegelePunktliste({ punkte: RING }, 0).punkte;
        expect(p.map(q => q[0])).toEqual([0, 6, 6]);
        expect(p.map(q => q[1])).toEqual([1, 1, 1]);
        const s = 2 / 3;                                                // Schwerpunkt z der drei Punkte
        p.forEach((q, i) => expect(q[2]).toBeCloseTo(2 * s - RING[i][2], 12));
    });
    it('als Werkzeug: an Ort und Stelle dieselbe Kennung, als Kopie eine neue — baubar', () => {
        const hier = nachId('spiegeln').anwenden(EIGEN, { achse: 90, kopie: 'nein' });
        const kopie = nachId('spiegeln').anwenden(EIGEN, { achse: 90, kopie: 'ja' });
        expect(hier.globalId).toBe('cde-a-b');
        expect(kopie.globalId).not.toBe('cde-a-b');
        expect(kopie.nachher.name).toBe('F (gespiegelt)');
        expect(baueAusBauplan(kopie.nachher).ok).toBe(true);
        // Einen Pfosten (ein Punkt) am eigenen Schwerpunkt zu spiegeln tut nichts.
        const pfosten = { globalId: 'p', stand: { bauplan: { rezept: 'pfosten', parameter: { punkte: [[1, 0, 1]] } } } };
        expect(nachId('spiegeln').anwenden(pfosten, { achse: 0, kopie: 'nein' })).toBeNull();
    });
});

describe('„Auffüllen bis zur Fläche" ist ein Katalogeintrag (Durchstich 2, S3)', () => {
    const UR = { globalId: '1Ur0Gelaende0Vertrag00', name: 'Urgelände', hoehenversatz: 0, quellmass: { cell: 1 } };
    const zug = [{ x: 5, y: 100, z: 5 }, { x: 25, y: 100, z: 5 }, { x: 25, y: 100, z: 25 }, { x: 5, y: 100, z: 25 }];
    const b = nachId('auffuellen');

    it('Ziel Fläche: die Operation nennt ihre Zieloperation über die Kennung — keine Höhe, kein Index', () => {
        const schritte = b.anwenden(UR, { ziel: 'flaeche', bis: 'op-P', neigung: '' }, { zug });
        const op = schritte.find(s => s.nachher?.rezept === 'erdbau').nachher.parameter.operationen[0];
        expect(op).toMatchObject({ art: 'schuettung', parameter: { ziel: 'flaeche', flaeche: 'op-P', neigung: null } });
        expect(op.parameter.hoehe).toBeUndefined();
        expect(op.parameter.umriss).toHaveLength(4);
    });

    it('was fehlt, sagt das Werkzeug — technisch, je Ziel (E5)', () => {
        expect(b.anwenden(UR, { ziel: 'flaeche', bis: '', neigung: '' }, { zug })).toBeNull();
        expect(b.warumNicht(UR, { ziel: 'flaeche', bis: '' }, { zug })).toMatch(/Zieloperation fehlt/);
        expect(b.warumNicht(UR, { ziel: 'hoehe', mass: '' }, { zug })).toMatch(/Höhe über dem Rand fehlt/);
        expect(b.warumNicht(UR, { ziel: 'ur' }, { zug })).toBeNull();
        // Das Feld der Zieloperation ist eine Adresse, die ihre Kennung weiterreicht.
        expect(b.felder.find(f => f.name === 'bis')).toMatchObject({ adresse: 'stapeloperation', leerErlaubt: true });
    });

    it('die Planumshöhe ist per Kommando setzbar; eine Krone hat nur das Ziel Höhe', () => {
        expect(GELAENDE_OPS.planum.setzbar).toEqual({ hoehe: {} });
        expect(GELAENDE_OPS.schuettung.kennhoehen({ ziel: 'flaeche', flaeche: 'op-P' })).toEqual([]);
        expect(GELAENDE_OPS.schuettung.kennhoehen({ ziel: 'hoehe', hoehe: 101 })).toEqual([{ art: 'kronenkante', hoehe: 101 }]);
    });
});
