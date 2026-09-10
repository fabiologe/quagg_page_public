/**
 * Die Gelände-Frage wird EINMAL gestellt (2026-09-03).
 *
 * Zwei Fehler, die dieselbe Wurzel haben und beide erst auffallen, wenn sich
 * das Gelände oft ändert — also seit eine Bauform-Auslegung es bewegen kann:
 *
 *  1. `setzeJournalStand` nullte den Sampler, aber NICHT die laufende
 *     Berechnung. Ein bereits gestarteter Aufbau schrieb sein Ergebnis danach
 *     zurück in den Cache — mit der alten Elementliste. Kein Fehler, keine
 *     Meldung, nur ein Gelände, das dem Journal eine Runde hinterherhinkt.
 *
 *  2. Sampler und Kandidatenliste stellten dieselbe Frage getrennt. Getrennt
 *     heisst: sie können auseinanderlaufen, und dann rechnet die Ableitung mit
 *     etwas anderem, als in der Auswahl stand.
 *
 * Geprüft wird am ECHTEN Prototyp — die Engine-Methoden rufen einander.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const gelaendeElementeSpy = vi.fn(async () => [{ modelId: 'm1', localId: 7 }]);

vi.mock('../services/GelaendeQuelle.js', async (echt) => ({
    ...(await echt()),
    gelaendeElemente: (...args) => gelaendeElementeSpy(...args),
}));

const { IfcEngine } = await import('../services/IfcEngine.js');

/**
 * Eine Quellen-Attrappe, die sich wie `IfcQuelle` verhält.
 *
 * WICHTIG und leicht falsch zu bauen: `zeile().type` ist eine ZAHL, nicht der
 * Klassenname — die Umsetzung macht `kategorieVon`. Eine Attrappe, die schon
 * einen Namen liefert, prüft eine Schnittstelle, die es nicht gibt (dieselbe
 * Falle wie beim `fakeWebIfc` in axisAnnotations.test.js).
 */
function quelle(kategorie, felder = {}) {
    const zeile = { type: 1077100507, ...felder };
    return {
        zeile: () => zeile,
        kategorieVon: (z) => ((z ?? zeile).type === 1077100507 ? kategorie : ''),
        ...(felder._merkmale ? { merkmale: felder._merkmale } : {}),
    };
}

/** Eine Engine-Attrappe auf dem echten Prototyp, ohne WebGL. */
function engine() {
    return Object.assign(Object.create(IfcEngine.prototype), {
        components: { get: () => ({ list: new Map() }) },
        _categoryGroups: [],
        quelleVon: () => null,
    });
}

beforeEach(() => gelaendeElementeSpy.mockClear());

describe('setzeJournalStand verwirft ALLES Gelände-Abgeleitete', () => {
    it('auch die laufende Berechnung — sonst schreibt sie Altes zurück', () => {
        const e = engine();
        e._gelaendeSampler = { sample: () => 1 };
        e._gelaendeSamplerLauf = Promise.resolve('alt');
        e._gelaendeOrte = [{ modelId: 'm1', localId: 999 }];
        e._gelaendeOrteLauf = Promise.resolve([]);

        e.setzeJournalStand({});

        expect(e._gelaendeSampler).toBe(null);
        expect(e._gelaendeSamplerLauf).toBe(null);
        expect(e._gelaendeOrte).toBe(null);
        expect(e._gelaendeOrteLauf).toBe(null);
    });

    it('nimmt Vorfilter und Bauform-Auskunft entgegen und reicht beide durch', async () => {
        const e = engine();
        e.setzeJournalStand({
            gelaendeKategorien: ['IFCCIVILELEMENT'],
            bauformVon: (ctx) => (ctx.globalId === 'ERD1' ? 'hoehenfeld' : 'koerper'),
        });

        await e._gelaendeOrteHolen();
        expect(gelaendeElementeSpy).toHaveBeenCalledTimes(1);
        const arg = gelaendeElementeSpy.mock.calls[0][0];
        expect(arg.kategorien).toEqual(['IFCCIVILELEMENT']);
        expect(typeof arg.leseKontext).toBe('function');
        // „Ist das Gelände?" ist NUR die Frage `=== 'hoehenfeld'` — eine
        // zweite injizierte Funktion wäre ein zweiter Weg zur selben Frage.
        expect(arg.istGelaende({ globalId: 'ERD1' })).toBe(true);
        expect(arg.istGelaende({ globalId: 'STW1' })).toBe(false);
    });

    it('das Formpaar-Gate fragt DIESELBE Auskunft — nicht eine zweite Rechnung', async () => {
        const e = engine();
        e.setzeJournalStand({ bauformVon: (ctx) => (ctx.category === 'IFCCIVILELEMENT' ? 'hoehenfeld' : 'koerper') });
        e.quelleVon = () => quelle('IFCCIVILELEMENT', { GlobalId: { value: 'ERD1' } });
        e._modelle = new Map();
        // karteMitEngine braucht eine Fragments-Liste; hier genügt ein Modell,
        // das die GlobalId kennt.
        e.components = { get: () => ({ list: new Map([['m1', {
            modelId: 'm1', getLocalIdsByGuids: async (g) => g.map(x => (x === 'ERD1' ? 7 : null)),
        }]]) }) };
        expect(await e._quellBauformVon('ERD1')).toBe('hoehenfeld');
        expect(await e._quellBauformVon('GIBTSNICHT')).toBe(null);
    });

    it('ohne Entscheidung bleibt die Vorbelegung — der Rückfall für Altpfade', async () => {
        const e = engine();
        e.setzeJournalStand({});
        await e._gelaendeOrteHolen();
        expect(gelaendeElementeSpy.mock.calls[0][0].kategorien).toContain('IFCGEOGRAPHICELEMENT');
        expect(gelaendeElementeSpy.mock.calls[0][0].istGelaende).toBe(null);
        expect(await e._quellBauformVon('X')).toBe(null);
    });
});

describe('Sampler und Kandidatenliste teilen sich EINE Antwort', () => {
    it('fragen zusammen genau einmal — und nach dem Verwerfen wieder', async () => {
        const e = engine();
        e.setzeJournalStand({});
        // Der Sampler braucht einen Resolver; hier zählt nur, dass er die
        // Ortsliste über dieselbe Memo holt.
        e.makeGeometryResolver = () => ({ forElements: () => ({ getForm: async () => null }) });

        await e.gelaendeSampler();
        await e.gelaendeKandidaten();
        expect(gelaendeElementeSpy).toHaveBeenCalledTimes(1);

        // Ein neuer Journalstand muss die Frage NEU stellen — sonst bliebe die
        // Auslegung ohne Wirkung, und genau so sieht ein toter Knopf aus.
        e.setzeJournalStand({});
        await e.gelaendeSampler();
        expect(gelaendeElementeSpy).toHaveBeenCalledTimes(2);
    });
});

describe('WÄCHTER: es gibt nur EINE Gelände-Liste', () => {
    it('TERRAIN_CATEGORIES_DEFAULT existiert nicht mehr', async () => {
        // Quelltext-Wächter, kein Verhaltenstest: zwei Listen, die dasselbe
        // sagen, sind beide grün. Nur der Text zeigt, dass es die zweite gibt.
        const { readFileSync } = await import('node:fs');
        const { fileURLToPath } = await import('node:url');
        const { execSync } = await import('node:child_process');
        const wurzel = fileURLToPath(new URL('..', import.meta.url));
        const treffer = execSync(
            `grep -rl "TERRAIN_CATEGORIES_DEFAULT" ${wurzel} --include=*.js --include=*.vue || true`,
            { encoding: 'utf8' },
        ).split('\n').filter(Boolean)
            // Der Grabstein in TerrainMesh.js darf stehen bleiben — er erklärt,
            // warum es die Liste nicht mehr gibt. Ein IMPORT wäre ein Rückfall.
            .filter(f => !/TerrainMesh\.js$/.test(f) && !/gelaendeVerdrahtung\.test\.js$/.test(f));
        expect(treffer).toEqual([]);

        // Und der Grabstein ist wirklich nur ein Kommentar.
        const terrain = readFileSync(`${wurzel}services/TerrainMesh.js`, 'utf8');
        expect(terrain).not.toMatch(/export const TERRAIN_CATEGORIES_DEFAULT/);
    });
});

describe('Der Elementzusammenhang kommt aus der DATEI, nicht aus den Fragmenten', () => {
    it('trägt PredefinedType — das Feld, an dem IfcGeographicElement hängt', () => {
        const e = engine();
        e.setzeJournalStand({});
        e.quelleVon = () => quelle('IFCGEOGRAPHICELEMENT', {
            GlobalId: { value: 'G1' },
            Name: { value: 'Urgelände' },
            PredefinedType: { value: 'TERRAIN' },
        });
        const ctx = e._gelaendeKontext('m1', 7);
        // Die KATEGORIE muss ein Klassenname sein. `zeile().type` liefert die
        // Typkonstante als Zahl; roh weitergereicht sucht sie in Typprofilen
        // und Regeln nach einer Ziffernfolge — kein Treffer, keine Meldung.
        expect(ctx.category).toMatch(/^IFC[A-Z0-9]+$/);
        // Die Fragmente führen einen schmalen Attributsatz OHNE PredefinedType.
        // Käme der Kontext von dort, träfe die mitgelieferte Terrain-Regel nie.
        expect(ctx).toMatchObject({
            category: 'IFCGEOGRAPHICELEMENT',
            globalId: 'G1',
            attributes: { Name: 'Urgelände', PredefinedType: 'TERRAIN' },
        });
    });

    it('liest Merkmalssätze NUR, wenn eine Regel sie braucht', () => {
        const e = engine();
        const merkmale = vi.fn(() => new Map([[7, { Bodenklasse: '3' }]]));
        e.quelleVon = () => quelle('IFCCIVILELEMENT', { _merkmale: merkmale });

        e.setzeJournalStand({});                       // ohne Bedarf
        e._gelaendeKontext('m1', 7);
        expect(merkmale).not.toHaveBeenCalled();

        e.setzeJournalStand({ gelaendeBrauchtMerkmale: true });
        const ctx = e._gelaendeKontext('m1', 7);
        expect(merkmale).toHaveBeenCalledTimes(1);
        expect(ctx.attributes.Bodenklasse).toBe('3');

        // Und genau einmal je Modell — `merkmale()` läuft tief über die Datei.
        e._gelaendeKontext('m1', 7);
        expect(merkmale).toHaveBeenCalledTimes(1);
    });

    it('ein echtes IFC-Attribut schlägt ein gleichnamiges Merkmal', () => {
        const e = engine();
        e.setzeJournalStand({ gelaendeBrauchtMerkmale: true });
        e.quelleVon = () => quelle('IFCCIVILELEMENT', {
            Name: { value: 'echt' },
            _merkmale: () => new Map([[7, { Name: 'aus dem Pset' }]]),
        });
        expect(e._gelaendeKontext('m1', 7).attributes.Name).toBe('echt');
    });
});

describe('Ein Lauf, der VOR dem Verwerfen begann, schreibt danach nicht zurück (2026-09-10, im Browser gefunden)', () => {
    // R02 geladen → der Gelände-Aufbau startet; R02 entladen, R01 geladen →
    // verworfen; DANACH wird der alte Aufbau fertig. Vorher schrieb er seine
    // Liste (R02-Elemente) in den Cache, und sein `.finally` nullte obendrein
    // den NEUEN Lauf. Die Kandidatenliste nannte dann kein Gelände — bis zum
    // nächsten Verwerfen. Nullen des Laufs (Test oben) genügte dafür nicht.
    function aufgeschoben() {
        let loese;
        const p = new Promise(r => { loese = r; });
        return { p, loese };
    }

    it('die Ortsliste: der alte Lauf fragt NEU, der Cache hält den Stand von jetzt', async () => {
        const e = engine();
        e.setzeJournalStand({});
        const alt = aufgeschoben();
        gelaendeElementeSpy.mockImplementationOnce(() => alt.p);
        const erster = e._gelaendeOrteHolen();                     // R02 im Raum: Aufbau läuft
        e._gelaendeVerwerfen();                                    // R02 entladen, R01 geladen
        gelaendeElementeSpy.mockImplementationOnce(async () => [{ modelId: 'R01', localId: 7 }]);
        alt.loese([{ modelId: 'R02', localId: 7 }]);               // der alte Aufbau wird fertig
        expect(await erster).toEqual([{ modelId: 'R01', localId: 7 }]);
        expect(e._gelaendeOrte).toEqual([{ modelId: 'R01', localId: 7 }]);
        expect(gelaendeElementeSpy).toHaveBeenCalledTimes(2);
    });

    it('der Sampler: nie aus den Orten des entladenen Modells gebaut, und das alte finally nullt keinen neuen Lauf', async () => {
        const e = engine();
        e.setzeJournalStand({});
        const gebaut = [];
        e.makeGeometryResolver = () => ({ forElements: (el) => { gebaut.push(el.map(x => x.modelId).join()); return { getForm: async () => null }; } });
        const alt = aufgeschoben();
        gelaendeElementeSpy.mockImplementationOnce(() => alt.p);
        const erster = e.gelaendeSampler();
        e._gelaendeVerwerfen();
        gelaendeElementeSpy.mockImplementation(async () => [{ modelId: 'R01', localId: 7 }]);
        const zweiter = e.gelaendeSampler();                        // jemand fragt nach dem Verwerfen
        alt.loese([{ modelId: 'R02', localId: 7 }]);
        await Promise.all([erster, zweiter]);
        expect(gebaut).not.toContain('R02');
        expect(gebaut.at(-1)).toBe('R01');
        expect(e._gelaendeSampler).not.toBeNull();
        expect(e._gelaendeSamplerLauf).toBeNull();
        gelaendeElementeSpy.mockImplementation(async () => [{ modelId: 'm1', localId: 7 }]);   // Grundzustand
    });
});

describe('Die Kategoriengruppen sehen die Modelle von JETZT (2026-09-10, im Browser gefunden)', () => {
    it('buildCategoryIndex leert die gecachten Abfragen, BEVOR es neu gruppiert', async () => {
        // Die FinderQuery je Kategorie cacht ihr erstes Ergebnis ({R01: [107]}) —
        // ohne Leeren sah die Gruppe nach dem Revisionswechsel nur das entladene Modell.
        const OBC = await import('@thatopen/components');
        const protokoll = [];
        const finder = { list: new Map([['IFCGEOGRAPHICELEMENT', { clearCache: () => protokoll.push('leeren') }]]) };
        const classifier = {
            byCategory: async () => { protokoll.push('gruppieren'); },
            list: new Map([['Categories', new Map([['IFCGEOGRAPHICELEMENT', { get: async () => ({ R02: [107] }) }]])]]),
        };
        const e = engine();
        e.components = { get: (K) => (K === OBC.ItemsFinder ? finder : K === OBC.Classifier ? classifier : { list: new Map() }) };
        expect(await e.buildCategoryIndex()).toEqual(['IFCGEOGRAPHICELEMENT']);
        expect(protokoll).toEqual(['leeren', 'gruppieren']);
    });
});
