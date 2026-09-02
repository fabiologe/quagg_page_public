// @vitest-environment jsdom
/**
 * Satz gegen Satz (Lücke ⑦ / Stufe 9.9).
 *
 * Der Vergleich läuft über die WIRKSAMEN Stände, nicht über Schrittlisten:
 * eine Auftragskorrektur gilt in beiden Sätzen und macht deshalb KEINE
 * Zeile — erst ein Satz, der sie überstimmt. Und der Objektvergleich kommt
 * aus der Art (`gleichFuer`), sonst meldete jede Karte {x,y,z} gegen sich
 * selbst „verschieden".
 */
import { describe, expect, it } from 'vitest';
import { flacheAusNutzlast, vergleicheStaende } from '../services/Standvergleich.js';

describe('flacheAusNutzlast', () => {
    it('packt Commits in Reihenfolge aus, die Sitzung zuletzt — Fremdes leer', () => {
        const roh = {
            version: 2,
            commits: [
                { id: 'c1', schritte: [{ id: 'e1', art: 'kg', globalId: 'G', nachher: '410' }] },
                { id: 'c2', schritte: [{ id: 'e2', art: 'kg', globalId: 'G', nachher: '420' }] },
            ],
            sitzung: { schritte: [{ id: 'e3', art: 'kg', globalId: 'G', nachher: '430' }] },
        };
        expect(flacheAusNutzlast(roh).map(e => e.id)).toEqual(['e1', 'e2', 'e3']);
        expect(flacheAusNutzlast([{ art: 'kg' }])).toEqual([]);   // v1: verworfen
        expect(flacheAusNutzlast(null)).toEqual([]);
    });
});

describe('vergleicheStaende', () => {
    const kg = (gid, wert, id) => ({ id, art: 'kg', globalId: gid, nachher: wert });

    it('nur_hier · nur_dort · verschieden — Gleiches erscheint nicht', () => {
        const zeilen = vergleicheStaende({
            hier: [kg('A', '410', 'h1'), kg('B', '420', 'h2'), kg('C', '430', 'h3')],
            dort: [kg('B', '425', 'd1'), kg('C', '430', 'd2'), kg('D', '440', 'd3')],
        });
        const je = new Map(zeilen.map(z => [z.globalId, z]));
        expect(je.get('A').zustand).toBe('nur_hier');
        expect(je.get('B')).toMatchObject({ zustand: 'verschieden', hier: '420', dort: '425' });
        expect(je.has('C')).toBe(false);
        expect(je.get('D').zustand).toBe('nur_dort');
    });

    it('die Auftragsebene gilt in BEIDEN Sätzen — erst das Überstimmen macht eine Zeile', () => {
        const auftrag = [kg('A', '410', 'a1')];
        expect(vergleicheStaende({ auftrag, hier: [], dort: [] })).toEqual([]);
        const zeilen = vergleicheStaende({ auftrag, hier: [], dort: [kg('A', '415', 'd1')] });
        expect(zeilen).toEqual([expect.objectContaining(
            { globalId: 'A', zustand: 'verschieden', hier: '410', dort: '415' })]);
    });

    it('Objektwerte vergleichen sich über die Art — die Bautoleranz von lage gilt', () => {
        const lage = (gid, p, id) => ({ id, art: 'lage', globalId: gid, nachher: p });
        const zeilen = vergleicheStaende({
            hier: [lage('A', { x: 1, y: 2, z: 3 }, 'h1'), lage('B', { x: 0, y: 0, z: 0 }, 'h2')],
            dort: [lage('A', { x: 1.0001, y: 2, z: 3 }, 'd1'), lage('B', { x: 5, y: 0, z: 0 }, 'd2')],
        });
        // A liegt innerhalb der Bautoleranz — keine Zeile; B ist echt anders.
        expect(zeilen.map(z => z.globalId)).toEqual(['B']);
    });
});
