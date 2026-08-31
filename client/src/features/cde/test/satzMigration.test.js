// @vitest-environment jsdom
/**
 * Übernahme der alten Client-Projekte in Modellsätze (Stufe 11.5).
 *
 * In `1337_Genau` standen zwei erfundene „Projekte" mit derselben Nummer, beide
 * gemeint als Variantenuntersuchung. Fabio: „es wäre sinnvoll beide zu
 * erhalten." Genau das wird hier geprüft — und die zwei Eigenschaften, ohne die
 * eine Migration gefährlich ist: sie muss IDEMPOTENT sein und sie muss LAUT
 * sein.
 *
 * Der laute Teil hat einen konkreten Anlass: das alte Register führte
 * `BIM26_Gruppe5_BODEN_Planung.ifc` als registriert, obwohl der Upload damals
 * still am FormData-Fehler scheiterte. Diesen Eintrag zu übernehmen hiesse,
 * einen Satz auf eine Datei zeigen zu lassen, die es nie gab.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repo } from '../services/RepoFacade.js';
import { MARKE, auswahlAus, berichtText, migriere, satzNameAus } from '../services/SatzMigration.js';

beforeEach(() => {
    localStorage.clear();
    repo.setBackend(null);
});

const MANIFEST = [
    { sha256: 'aaa', name: 'Kanal_R01.ifc' },
    { sha256: 'bbb', name: 'Gelaende.ifc' },
];

/** Legt Sätze in einer Liste ab — wie der Server, nur ohne ihn. */
function fakeAnlegen(gesammelt) {
    let n = 0;
    return vi.fn(async (daten) => {
        const satz = { id: `s-${++n}`, ...daten };
        gesammelt.push(satz);
        return satz;
    });
}

describe('auswahlAus — rein', () => {
    it('nimmt nur, was es wirklich gibt', () => {
        const { enthaelt, phantome } = auswahlAus(
            [{ sha256: 'aaa', name: 'Kanal_R01.ifc' }, { sha256: 'zzz', name: 'Nie hochgeladen.ifc' }],
            MANIFEST,
        );
        expect(enthaelt).toEqual(['aaa']);
        expect(phantome).toEqual([{ sha256: 'zzz', name: 'Nie hochgeladen.ifc' }]);
    });

    it('erträgt eine leere Altliste', () => {
        expect(auswahlAus(null, MANIFEST)).toEqual({ enthaelt: [], phantome: [] });
    });
});

describe('satzNameAus', () => {
    it('nimmt den Namen des Alt-Projekts, nicht die Nummer', () => {
        // Die Nummer war eine Kopie der Auftragsnummer — „1337" als Variante
        // von 1337 wäre verwirrend.
        expect(satzNameAus({ nummer: '1337', name: 'Variante Nord' })).toBe('Variante Nord');
    });

    it('fällt auf die Nummer zurück, wenn kein Name da ist', () => {
        expect(satzNameAus({ nummer: '1337', name: '' })).toBe('1337');
    });

    it('macht doppelte Namen eindeutig — der Server lässt sie nicht zu', () => {
        const benutzt = new Set(['Nord']);
        expect(satzNameAus({ name: 'Nord' }, benutzt)).toBe('Nord (2)');
    });
});

describe('migriere', () => {
    it('macht aus beiden Alt-Projekten je einen Satz — keines geht verloren', async () => {
        await repo.set('cde-projects', [
            { id: 'pA', nummer: '1337', name: '1337_TestProjekCDE01' },
            { id: 'pB', nummer: '1337', name: 'Keine Ahung was hier sein könnte' },
        ]);
        const saetze = [];
        const bericht = await migriere({ repo, manifest: MANIFEST, satzAnlegen: fakeAnlegen(saetze) });

        expect(bericht.gelaufen).toBe(true);
        expect(saetze.map(s => s.name)).toEqual(['1337_TestProjekCDE01', 'Keine Ahung was hier sein könnte']);
        expect(saetze.every(s => s.zweck === 'variante')).toBe(true);
    });

    it('MELDET einen Alteintrag ohne Datei, statt ihn zu übernehmen', async () => {
        await repo.set('cde-projects', [{ id: 'pA', name: 'Alt' }]);
        await repo.withScope('project:pA').set('dokumente', [
            { sha256: 'aaa', name: 'Kanal_R01.ifc' },
            { sha256: 'zzz', name: 'BIM26_Gruppe5_BODEN_Planung.ifc' },   // nie hochgeladen
        ]);
        const saetze = [];
        const bericht = await migriere({ repo, manifest: MANIFEST, satzAnlegen: fakeAnlegen(saetze) });

        expect(saetze[0].enthaelt).toEqual(['aaa']);
        expect(bericht.phantome).toHaveLength(1);
        expect(bericht.phantome[0].name).toBe('BIM26_Gruppe5_BODEN_Planung.ifc');
    });

    it('zieht die Ablage in den Satz-Scope um', async () => {
        await repo.set('cde-projects', [{ id: 'pA', name: 'Alt' }]);
        const alt = repo.withScope('project:pA');
        await alt.set('ansichten', [{ name: 'Übersicht' }]);
        await alt.set('issues', [{ id: 1 }]);

        const saetze = [];
        const bericht = await migriere({ repo, manifest: MANIFEST, satzAnlegen: fakeAnlegen(saetze) });

        const neu = repo.withScope(`stand:${saetze[0].id}`);
        expect(await neu.get('ansichten')).toEqual([{ name: 'Übersicht' }]);
        expect(await neu.get('issues')).toEqual([{ id: 1 }]);
        expect(bericht.verschoben).toBe(2);
    });

    it('lässt `dokumente` beim Auftrag — sie gehören nicht dem Satz', async () => {
        await repo.set('cde-projects', [{ id: 'pA', name: 'Alt' }]);
        await repo.withScope('project:pA').set('dokumente', [{ sha256: 'aaa' }]);
        const saetze = [];
        await migriere({ repo, manifest: MANIFEST, satzAnlegen: fakeAnlegen(saetze) });
        expect(await repo.withScope(`stand:${saetze[0].id}`).get('dokumente')).toBe(null);
    });

    it('IST IDEMPOTENT — zweimal ausgeführt legt nichts doppelt an', async () => {
        await repo.set('cde-projects', [{ id: 'pA', name: 'Alt' }]);
        const saetze = [];
        const anlegen = fakeAnlegen(saetze);
        await migriere({ repo, manifest: MANIFEST, satzAnlegen: anlegen });
        const zweit = await migriere({ repo, manifest: MANIFEST, satzAnlegen: anlegen });

        expect(saetze).toHaveLength(1);
        expect(anlegen).toHaveBeenCalledTimes(1);
        expect(zweit.gelaufen).toBe(false);
    });

    it('setzt die Marke auch, wenn es nichts zu übernehmen gibt', async () => {
        // Sonst suchte jeder Seitenaufruf aufs Neue.
        const bericht = await migriere({ repo, manifest: MANIFEST, satzAnlegen: fakeAnlegen([]) });
        expect(bericht.gelaufen).toBe(true);
        expect((await repo.get(MARKE)).fassung).toBe(1);
    });

    it('LÖSCHT den Altbestand nicht — er ist die einzige Quelle, wenn etwas schiefging', async () => {
        await repo.set('cde-projects', [{ id: 'pA', name: 'Alt' }]);
        await repo.withScope('project:pA').set('ansichten', [1]);
        await migriere({ repo, manifest: MANIFEST, satzAnlegen: fakeAnlegen([]) });

        expect(await repo.get('cde-projects')).toHaveLength(1);
        expect(await repo.withScope('project:pA').get('ansichten')).toEqual([1]);
    });

    it('macht weiter, wenn EIN Satz abgelehnt wird, und meldet ihn', async () => {
        await repo.set('cde-projects', [{ id: 'pA', name: 'Kaputt' }, { id: 'pB', name: 'Gut' }]);
        const saetze = [];
        let erster = true;
        const anlegen = vi.fn(async (daten) => {
            if (erster) { erster = false; throw new Error('Server sagt nein'); }
            const satz = { id: 's-2', ...daten };
            saetze.push(satz);
            return satz;
        });
        const bericht = await migriere({ repo, manifest: MANIFEST, satzAnlegen: anlegen });

        expect(bericht.angelegt).toHaveLength(1);
        expect(bericht.fehler[0]).toMatch(/Kaputt: Server sagt nein/);
    });
});

describe('berichtText', () => {
    it('nennt die Phantome beim Namen', () => {
        const text = berichtText({
            gelaufen: true, angelegt: [{ name: 'A' }],
            phantome: [{ name: 'Planung.ifc' }], fehler: [],
        });
        expect(text).toMatch(/1 Modellsatz übernommen/);
        expect(text).toMatch(/Planung\.ifc/);
    });

    it('schweigt, wenn nichts übernommen wurde', () => {
        expect(berichtText({ gelaufen: true, angelegt: [], phantome: [], fehler: [] })).toBe('');
    });
});
