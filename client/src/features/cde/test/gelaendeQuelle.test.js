/**
 * Welche Elemente SIND das Gelände? (Teil XIV, G3)
 *
 * Drei Fallen, die die Kategorienliste nicht sieht: das VERDECKTE Ur-Gelände
 * (gewänne im Sampler als höchster Treffer), der AUSHUBKÖRPER (seine
 * Oberseite ist das alte Gelände) und das NEUE DGM im CDE-Modell (heisst wie
 * das alte). Attrappen in der Form der Bibliothek: `groupData.get()` liefert
 * eine Map modelId → localIds, Modelle kennen `getLocalIdsByGuids`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    GELAENDE_KATEGORIEN, GELAENDE_VORBELEGUNG, gelaendeElemente, kandidatKategorien,
} from '../services/GelaendeQuelle.js';
import { profilFuer } from '../services/bauform/Typprofile.js';

function modell(modelId, guids) {
    return { modelId, getLocalIdsByGuids: async (g) => g.map(x => guids[x] ?? null) };
}
const nurM1Fill = new Map([['m1', modell('m1', {})]]);
const gruppen = [
    { name: 'IFCGEOGRAPHICELEMENT', groupData: { get: async () => new Map([['m1', [7, 8]], ['cde-eigenbau', [1, 2]]]) } },
    { name: 'IFCEARTHWORKSCUT',     groupData: { get: async () => new Map([['cde-eigenbau', [3]]]) } },
    { name: 'IFCPIPESEGMENT',       groupData: { get: async () => new Map([['m1', [20]]]) } },
];
const liste = new Map([
    ['m1', modell('m1', { DGM1: 7, DGM2: 8 })],
    ['cde-eigenbau', modell('cde-eigenbau', { 'cde-dgm': 1, 'cde-alt': 2, 'cde-aushub': 3 })],
]);

describe('gelaendeElemente', () => {
    it('Verdecktes fällt raus, das eigene DGM kommt rein, der Aushubkörper nie', async () => {
        const e = await gelaendeElemente({
            categoryGroups: gruppen, fragmentsList: liste,
            verdeckt: new Set(['DGM1']),
            cdeGelaende: new Set(['cde-dgm']),
        });
        expect(e).toEqual([
            { modelId: 'm1', localId: 8 },              // DGM2 bleibt, DGM1 ist verdeckt
            { modelId: 'cde-eigenbau', localId: 1 },    // das neue DGM — über den Stand, nicht die Kategorie
        ]);
    });

    it('ohne Verdecktes und ohne CDE-Teile: die gelieferten Gelände-Kategorien, keine Rohre', async () => {
        const e = await gelaendeElemente({ categoryGroups: gruppen, fragmentsList: liste });
        expect(e).toEqual([{ modelId: 'm1', localId: 7 }, { modelId: 'm1', localId: 8 }]);
    });

    it('ein Cut steht nicht in den Gelände-Kategorien', () => {
        expect(GELAENDE_KATEGORIEN).not.toContain('IFCEARTHWORKSCUT');
        expect(GELAENDE_KATEGORIEN).toContain('IFCGEOGRAPHICELEMENT');
    });

    /**
     * DIE ATTRAPPE OBEN IST ZU FREUNDLICH — im Browser antwortet die BASIS
     * des CDE-Modells auf `getLocalIdsByGuids` NICHT; den GUID-Index führt
     * die Bibliothek nur im `…-DELTA-MODEL-…`. Wer nur die Basis fragt,
     * bekommt eine leere Karte, und dann ist das gerade gebaute Gelände
     * kein Gelände mehr: `gelaendeKandidaten()` leer, `hoeheAn` NaN, keine
     * zweite Formung, Längsschnitt ohne das neue DGM. Genau so gemessen
     * (2026-09-09); dieselbe Landmine wie bei den Griffen (S10).
     */
    it('findet das eigene DGM im DELTA — die Basis antwortet nicht', async () => {
        const wirklich = new Map([
            ['m1', modell('m1', { DGM1: 7, DGM2: 8 })],
            // Basis: kennt die Kennung nicht.
            ['cde-eigenbau', modell('cde-eigenbau', {})],
            // Delta: hier steht der Index.
            ['cde-eigenbau-DELTA-MODEL-4711', modell('cde-eigenbau-DELTA-MODEL-4711', { 'cde-dgm': 1 })],
        ]);
        const e = await gelaendeElemente({
            categoryGroups: gruppen, fragmentsList: wirklich,
            verdeckt: new Set(['DGM1']),
            cdeGelaende: new Set(['cde-dgm']),
        });
        expect(e).toContainEqual({ modelId: 'cde-eigenbau-DELTA-MODEL-4711', localId: 1 });
    });

    it('ein fremdes Modell wird durch die Delta-Suche nicht mitgenommen', async () => {
        // `basisModelId` schneidet nur die Delta-Marke ab — ein Modell, das
        // zufällig ähnlich heisst, bleibt draussen.
        const fremd = new Map([
            ['cde-eigenbau-alt', modell('cde-eigenbau-alt', { 'cde-dgm': 99 })],
        ]);
        const e = await gelaendeElemente({
            categoryGroups: [], fragmentsList: fremd, cdeGelaende: new Set(['cde-dgm']),
        });
        expect(e).toEqual([]);
    });
});

/**
 * Die BAUFORM entscheidet — nicht die Kategorie (2026-09-03).
 *
 * Die Kategorienliste war eine ZWEITE Antwort auf „was ist Gelände", und sie
 * widersprach der Bauform an zwei Stellen: `IFCEARTHWORKSFILL` stand darin,
 * ist im Typprofil aber als Auftrags-KÖRPER deklariert; und ein Proxy, den
 * eine Regel zum Höhenfeld erklärt, kam nie an. Jetzt ist die Liste ein
 * Vorfilter und `istGelaende` die Entscheidung.
 */
describe('Die Entscheidung trifft die Bauform, nicht die Kategorie', () => {
    // ZWEI IfcCivilElement im selben Modell — genau Fabios Fall: der eine ist
    // das Geländemodell, der andere eine Stützwand. Beide Mengen sind
    // nichtleer; ein Test, in dem `istGelaende` nie true wird, verglich [] mit
    // [] und bewiese nichts.
    const zweiCivil = [{
        name: 'IFCCIVILELEMENT',
        groupData: { get: async () => new Map([['m1', [40, 41]]]) },
    }];
    const nurM1 = new Map([['m1', modell('m1', {})]]);
    const kontext = (_m, localId) => ({
        category: 'IFCCIVILELEMENT',
        globalId: localId === 40 ? 'ERD1' : 'STW1',
        attributes: {}, psets: {},
    });

    it('nimmt den erklärten Erdkörper und lässt die Stützwand liegen', async () => {
        const e = await gelaendeElemente({
            categoryGroups: zweiCivil, fragmentsList: nurM1,
            leseKontext: kontext,
            istGelaende: (ctx) => ctx.globalId === 'ERD1',
        });
        expect(e).toEqual([{ modelId: 'm1', localId: 40 }]);
    });

    it('ohne Entscheidung gilt weiter die Kategorie — der Rückfall für Altpfade', async () => {
        const e = await gelaendeElemente({ categoryGroups: zweiCivil, fragmentsList: nurM1 });
        expect(e).toHaveLength(2);
    });

    it('ein unlesbarer Kontext fällt auf die Kategorie zurück, nicht heraus', async () => {
        // Sonst verschwände das Gelände, sobald ein Modell keine lebende
        // web-ifc-Quelle hat — und zwar ohne Meldung.
        const e = await gelaendeElemente({
            categoryGroups: zweiCivil, fragmentsList: nurM1,
            leseKontext: () => null,
            istGelaende: () => false,
        });
        expect(e).toHaveLength(2);
    });
});

describe('kandidatKategorien — der billige Vorfilter', () => {
    it('nimmt die Vorbelegung und ergänzt, was Regeln zum Höhenfeld erklären', () => {
        const k = kandidatKategorien({
            regeln: [
                { bauform: 'hoehenfeld', condition: { category: 'ifcbuildingelementproxy' } },
                { bauform: 'koerper', condition: { category: 'IFCWALL' } },   // andere Form: egal
            ],
            profilSatz: {},
        });
        expect(k).toEqual(expect.arrayContaining([...GELAENDE_VORBELEGUNG, 'IFCBUILDINGELEMENTPROXY']));
        expect(k).not.toContain('IFCWALL');
    });

    it('zieht die Untertypen mit — aufwärts deklariert, abwärts gültig', () => {
        const k = kandidatKategorien({ profilSatz: { IFCEARTHWORKSELEMENT: { bauform: 'hoehenfeld' } } });
        // `IfcEarthworksFill` erbt von `IfcEarthworksElement` und ist damit
        // Kandidat — er fällt erst an seiner EIGENEN Deklaration heraus.
        expect(k).toContain('IFCEARTHWORKSFILL');
    });

    it('der Cut wird gar nicht erst Kandidat — er hängt an einem anderen Ast', () => {
        // `IfcEarthworksCut` erbt über `IfcFeatureElementSubtraction`, nicht
        // über `IfcEarthworksElement`: er ist ein VOID, kein Bauteil. Dass die
        // Vererbung ihn deshalb nicht mitzieht, ist kein Zufall — es ist
        // dieselbe Aussage, die die alte Kategorienliste von Hand traf.
        const k = kandidatKategorien({ profilSatz: { IFCEARTHWORKSELEMENT: { bauform: 'hoehenfeld' } } });
        expect(k).not.toContain('IFCEARTHWORKSCUT');
    });

    it('der Kandidat IFCEARTHWORKSFILL fällt an der eigenen Deklaration wieder heraus', async () => {
        // DAS ist die Auflösung des alten Widerspruchs: grosszügig suchen,
        // streng entscheiden. Ohne diese Zeile stünde der Auftragskörper
        // weiter als Gelände in der Liste — so, wie es die Kategorienliste tat.
        const gruppenFill = [{
            name: 'IFCEARTHWORKSFILL',
            groupData: { get: async () => new Map([['m1', [55]]]) },
        }];
        const e = await gelaendeElemente({
            categoryGroups: gruppenFill, fragmentsList: nurM1Fill,
            kategorien: kandidatKategorien({ profilSatz: { IFCEARTHWORKSELEMENT: { bauform: 'hoehenfeld' } } }),
            leseKontext: () => ({ category: 'IFCEARTHWORKSFILL', globalId: 'F1', attributes: {}, psets: {} }),
            // Die echte Regel: das Typprofil von IFCEARTHWORKSFILL sagt `koerper`.
            istGelaende: (ctx) => profilFuer(ctx.category)?.bauform === 'hoehenfeld',
        });
        expect(e).toEqual([]);
    });
});

describe('Dreiwertig (2026-09-07): null heisst „niemand hat etwas erklärt" — dann misst die Geometrie', () => {
    // Fabios DGM: ein IfcCivilElement OHNE Regel, ohne Typprofil, ohne
    // Auslegung. `istGelaende` kann nichts sagen (null). Vorher zählte null
    // als false, und das Gelände fiel aus dem Sampler — obwohl es in der
    // Vorbelegung stand.
    const zweiCivil = [{
        name: 'IFCCIVILELEMENT',
        groupData: { get: async () => new Map([['m1', [40, 41]]]) },
    }];
    const nurM1 = new Map([['m1', modell('m1', {})]]);
    const kontext = (_m, localId) => ({ category: 'IFCCIVILELEMENT', globalId: localId === 40 ? 'DGM' : 'WAND', attributes: {}, psets: {} });
    const keineDeklaration = () => null;

    it('die Formsignatur entscheidet: Höhenfeld bleibt, Körper fällt', async () => {
        const gefragt = [];
        const e = await gelaendeElemente({
            categoryGroups: zweiCivil, fragmentsList: nurM1, leseKontext: kontext,
            istGelaende: keineDeklaration,
            bauformAusGeometrie: async (_m, localId) => { gefragt.push(localId); return localId === 40 ? 'hoehenfeld' : 'koerper'; },
        });
        expect(e).toEqual([{ modelId: 'm1', localId: 40 }]);
        expect(gefragt).toEqual([40, 41]);          // nur die Undeklarierten — beide hier
    });

    it('eine Deklaration wird NICHT nachgemessen — die Geometrie ist nur der Rückfall', async () => {
        const gefragt = [];
        await gelaendeElemente({
            categoryGroups: zweiCivil, fragmentsList: nurM1, leseKontext: kontext,
            istGelaende: (ctx) => ctx.globalId === 'DGM',       // true/false, nie null
            bauformAusGeometrie: async (_m, l) => { gefragt.push(l); return 'koerper'; },
        });
        expect(gefragt).toEqual([]);
    });

    it('kann die Geometrie nicht antworten, gilt die Vorbelegung weiter — nichts fällt still heraus', async () => {
        const e = await gelaendeElemente({
            categoryGroups: zweiCivil, fragmentsList: nurM1, leseKontext: kontext,
            istGelaende: keineDeklaration,
            bauformAusGeometrie: async () => { throw new Error('kein Netz'); },
        });
        expect(e).toHaveLength(2);
        const ohneGeometrie = await gelaendeElemente({
            categoryGroups: zweiCivil, fragmentsList: nurM1, leseKontext: kontext, istGelaende: keineDeklaration,
        });
        expect(ohneGeometrie).toHaveLength(2);
    });
});

describe('Der Gelände-Cache stirbt beim LADEN (2026-09-09, im Browser gefunden)', () => {
    /**
     * `_gelaendeOrteHolen` merkt sich seine Antwort. Verworfen wurde sie beim
     * ENTLADEN und beim Journalwechsel — nicht beim Laden. Wer sein Kanalnetz
     * öffnet und danach das Geländemodell dazulädt, behielt die Liste, die
     * beim Netz allein entstand: leer. Danach bot kein Werkzeug ein Gelände
     * an, und nach einer Formung stand gar nichts mehr im Raum — das
     * Ur-Gelände verborgen, das neue nie gefunden.
     */
    it('`loadIfc` verwirft den Cache, bevor der Kategorienindex neu gebaut wird', () => {
        const quelle = readFileSync(new URL('../services/IfcEngine.js', import.meta.url), 'utf8');
        const ladeStelle = quelle.slice(quelle.indexOf('async loadIfc('), quelle.indexOf('async buildCategoryIndex('));
        expect(ladeStelle).toMatch(/_gelaendeVerwerfen\(\);\s*\n\s*await Promise\.all\(\[\s*\n\s*this\.buildCategoryIndex\(\)/);
    });

    it('… und die drei anderen Anlässe bleiben: Entladen, Journalstand, der Aufruf selbst', () => {
        const quelle = readFileSync(new URL('../services/IfcEngine.js', import.meta.url), 'utf8');
        expect((quelle.match(/this\._gelaendeVerwerfen\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
    });
});
