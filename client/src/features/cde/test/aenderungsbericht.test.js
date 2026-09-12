/**
 * Der Änderungsbericht (Stufe 9.5) — das Journal als Dokument.
 *
 * Drei Zusagen: der WIRKSAME Stand ist die Forderungsliste (Aufgehobenes
 * fehlt), der VERLAUF fasst Vorgänge zusammen (drei Einträge des Teilens
 * sind EIN Abschnitt), und die Herkunft steht als Wort daneben
 * („eigenes Bauteil" vs. Forderung an den Planer).
 */
import { describe, expect, it } from 'vitest';
import { baueBericht } from '../services/Aenderungsbericht.js';
import { schreibeBericht } from '../services/AenderungsberichtPdf.js';

const WANN = Date.UTC(2026, 8, 1, 10, 0);

const EINTRAEGE = [
    { id: 'e1', art: 'parametrik', globalId: 'H1', wer: 'Fabio', wann: WANN,
      nachher: { sohlhoeheAnfang: 310, sohlhoeheEnde: 309 },
      befunde: [{ text: 'Gefälle 2,0 ‰ unter Mindestmass', schwere: 'warnung' }] },
    { id: 'e2', art: 'geloescht', globalId: 'H2', wer: 'Fabio', wann: WANN + 1000,
      vorgang: 'vg-1', vorgangTitel: 'Haltung geteilt', nachher: true },
    { id: 'e3', art: 'erzeugt', globalId: 'cde-a', wer: 'Fabio', wann: WANN + 1000,
      vorgang: 'vg-1', modell: 'cde',
      nachher: { rezept: 'rohr', kategorie: 'IFCPIPESEGMENT', name: 'H2.1',
                 parameter: { punkte: [[0, 9, 0], [50, 8, 0]], dn: 300 } } },
    { id: 'e4', art: 'kg', globalId: 'S1', wer: 'Anna', wann: WANN + 2000, nachher: '322' },
    // Aufgehoben: die KG von S1 wird wieder gelöscht — sie darf im STAND fehlen.
    { id: 'e5', art: 'kg', globalId: 'S1', wer: 'Anna', wann: WANN + 3000, nachher: null },
];

describe('baueBericht', () => {
    const bericht = baueBericht({
        eintraege: EINTRAEGE,
        konflikte: [{ globalId: 'H9', art: 'lage', zustand: 'fehlt', grund: 'nicht im Modell' }],
        meta: { projekt: '1337_Genau', modellSha: 'abc123' },
    });

    it('der wirksame Stand ist die Forderungsliste — Aufgehobenes fehlt', () => {
        const ids = bericht.stand.map(z => z.globalId);
        expect(ids).toContain('H1');
        expect(ids).toContain('cde-a');
        expect(ids).not.toContain('S1');                 // KG wieder aufgehoben
    });

    it('die Herkunft steht als Wort daneben', () => {
        const eigen = bericht.stand.find(z => z.globalId === 'cde-a');
        const forderung = bericht.stand.find(z => z.globalId === 'H1');
        expect(eigen.eigen).toBe(true);
        expect(eigen.bauteil).toContain('H2.1');          // Name aus dem Bauplan
        expect(forderung.eigen).toBe(false);
    });

    it('die Befund-Momentaufnahme wandert mit — „war beim Setzen bekannt"', () => {
        const z = bericht.stand.find(x => x.globalId === 'H1');
        expect(z.befunde).toEqual(['Gefälle 2,0 ‰ unter Mindestmass']);
    });

    it('der Verlauf fasst Vorgänge zusammen — das Teilen ist EIN Abschnitt', () => {
        expect(bericht.verlauf).toHaveLength(4);          // e1 · vg-1 · e4 · e5
        const teilen = bericht.verlauf.find(v => v.titel === 'Haltung geteilt');
        expect(teilen.zeilen).toHaveLength(2);
        expect(teilen.wer).toBe('Fabio');
    });

    it('Kopf und Konflikte tragen, was der Planer wissen muss', () => {
        expect(bericht.kopf.projekt).toBe('1337_Genau');
        expect(bericht.kopf.bearbeiter.sort()).toEqual(['Anna', 'Fabio']);
        expect(bericht.kopf.anzahlEintraege).toBe(5);
        expect(bericht.konflikte[0]).toEqual({
            globalId: 'H9', art: 'Lage', zustand: 'fehlt', grund: 'nicht im Modell',
        });
    });

    it('leeres Journal: ein gültiger, leerer Bericht — kein Wurf', () => {
        const leer = baueBericht({});
        expect(leer.stand).toEqual([]);
        expect(leer.verlauf).toEqual([]);
    });
});

describe('schreibeBericht', () => {
    it('rendert ohne Wurf und liefert ein mehrseitiges Dokument bei viel Inhalt', () => {
        const viele = Array.from({ length: 120 }, (_, i) => ({
            id: `e${i}`, art: 'kg', globalId: `B${i}`, wer: 'Fabio', wann: WANN + i,
            nachher: '322',
        }));
        const doc = schreibeBericht(baueBericht({ eintraege: viele }));
        expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    });
});

describe('Der Verlauf aus der Commit-Zeitleiste (U3)', () => {
    it('je Commit ein Abschnitt mit NACHRICHT — die Sitzung als unversioniert', () => {
        const zeitleiste = [
            { typ: 'sitzung', id: 'sitzung', titel: 'Offene Bearbeitung — nicht gesichert',
              wer: 'Fabio', wann: WANN + 5000,
              vorgaenge: [{ schluessel: 'x', zeilen: [EINTRAEGE[0]] }] },
            { typ: 'commit', id: 'c1', titel: 'Kanal Süd nachgezogen',
              wer: 'Fabio', wann: WANN,
              vorgaenge: [{ schluessel: 'vg-1', zeilen: [EINTRAEGE[1], EINTRAEGE[2]] }] },
        ];
        const b = baueBericht({ eintraege: EINTRAEGE, zeitleiste });
        expect(b.verlauf).toHaveLength(2);
        expect(b.verlauf[0].titel).toMatch(/nicht gesichert/);
        expect(b.verlauf[1].titel).toBe('Kanal Süd nachgezogen');
        expect(b.verlauf[1].zeilen).toHaveLength(2);
        // Der wirksame Stand rechnet weiter über die flache Liste.
        expect(b.stand.length).toBeGreaterThan(0);
    });
});

