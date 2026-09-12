/**
 * Bauwerksstruktur über alle Modelle (Fahrplan Erdbau-Container, Stufe 8, T6) — rein.
 *
 * Die Knoten von fragments tragen nur {category, localId, children}. Hier steht:
 * je Modell ein Baum, jeder Knoten mit seinem Modell und seinem Namen, der Aushub
 * unter seinem Wirt, die Gruppen als eigener Zweig — und der Baum von fragments
 * bleibt, wie er war.
 */
import { describe, expect, it } from 'vitest';
import { baueBaeume, strukturBeziehungen, trifft } from '../services/Bauwerksstruktur.js';

const baumA = () => ({ category: 'IFCPROJECT', localId: 1, children: [
    { category: 'IFCSITE', localId: 2, children: [{ category: 'IFCGEOGRAPHICELEMENT', localId: 3, children: [] }] }] });
const baumB = () => ({ category: 'IFCPROJECT', localId: 1, children: [
    { category: 'IFCSITE', localId: 2, children: [{ category: null, localId: 3, children: [] }] }] });
const INDEX = [
    { modelId: 'A', localId: 3, name: 'Urgelände', globalId: 'G-A3', category: 'IFCGEOGRAPHICELEMENT' },
    { modelId: 'B', localId: 3, name: 'Fundament', globalId: 'G-B3', category: 'IFCWALL' },
    { modelId: 'A', localId: 7, name: 'Graben', globalId: 'G-A7', category: 'IFCEARTHWORKSCUT' },
    { modelId: 'A', localId: 8, name: 'Verfüllung', globalId: 'G-A8', category: 'IFCEARTHWORKSFILL' },
];
const alle = (k, f = []) => { if (k) { f.push(k); (k.children ?? []).forEach(c => alle(c, f)); } return f; };

describe('je Modell ein Baum — getrennt, benannt, mit Modell an jedem Knoten', () => {
    it('zwei Bäume mit KOLLIDIERENDEN localIds bleiben getrennt; der Baum von fragments bleibt unberührt', () => {
        const roh = baumB();
        const [a, b] = baueBaeume({ baeume: [{ modelId: 'A', name: 'a.ifc', wurzel: baumA() }, { modelId: 'B', name: 'b.ifc', wurzel: roh }], index: INDEX });
        expect(alle(a.wurzel).every(k => k.modelId === 'A')).toBe(true);
        expect(alle(b.wurzel).every(k => k.modelId === 'B')).toBe(true);
        expect(alle(a.wurzel).find(k => k.localId === 3).name).toBe('Urgelände');
        expect(alle(b.wurzel).find(k => k.localId === 3)).toMatchObject({ name: 'Fundament', category: 'IFCWALL', globalId: 'G-B3' });
        expect([a.knoten, b.knoten]).toEqual([3, 3]);
        expect(roh.children[0].children[0].modelId).toBeUndefined();
    });

    it('der Aushub hängt unter seinem Wirt — einmal, und nicht, wenn fragments ihn schon führt', () => {
        const beziehungen = new Map([['A', { voids: [{ wirt: 3, aushub: 7 }, { wirt: 3, aushub: 2 }], gruppen: [] }]]);
        const [a] = baueBaeume({ baeume: [{ modelId: 'A', name: 'a.ifc', wurzel: baumA() }], index: INDEX, beziehungen });
        const wirt = alle(a.wurzel).find(k => k.localId === 3);
        expect(wirt.children.map(k => [k.localId, k.name, k.aussparung, k.category])).toEqual([[7, 'Graben', true, 'IFCEARTHWORKSCUT']]);
        expect(a.knoten).toBe(4);
    });

    it('ein Modell ohne Raumgliederung bleibt ein Abschnitt — ohne Baum', () => {
        expect(baueBaeume({ baeume: [{ modelId: 'C', name: 'c.ifc', wurzel: null }], shaVon: () => 'x' }))
            .toEqual([{ modelId: 'C', name: 'c.ifc', sha256: 'x', wurzel: null, gruppen: null, knoten: 0 }]);
    });
});

describe('der Zweig „Gruppen": Fachmodell → Vorgang → Mitglieder', () => {
    const gruppen = [
        { localId: 20, klasse: 'IFCGROUP', name: 'Erdbau', objectType: 'Fachmodell', mitglieder: [7, 8] },
        { localId: 21, klasse: 'IFCGROUP', name: 'H-001 · Kanalgraben', objectType: 'Vorgang', mitglieder: [7, 8, 9] },
        { localId: 22, klasse: 'IFCGROUP', name: 'Urgelaende.ifc', objectType: 'Fachmodell', mitglieder: [3] },
        { localId: 23, klasse: 'IFCDISTRIBUTIONSYSTEM', name: 'Kanalnetz', objectType: '', mitglieder: [24] },
        { localId: 24, klasse: 'IFCGROUP', name: 'Teilnetz', objectType: '', mitglieder: [9] },
    ];
    const [a] = baueBaeume({ baeume: [{ modelId: 'A', name: 'a.ifc', wurzel: baumA() }], index: INDEX,
                             beziehungen: new Map([['A', { voids: [], gruppen }]]) });

    it('ein Vorgang hängt unter dem Fachmodell, mit dem er Bauteile teilt; eine Gruppe in einer Gruppe darunter', () => {
        const zweig = a.gruppen;
        expect(zweig).toMatchObject({ name: 'Gruppen (5)', gruppe: true, localId: null });
        expect(zweig.children.map(k => k.name)).toEqual(['Erdbau', 'Urgelaende.ifc', 'Kanalnetz']);
        const erdbau = zweig.children[0];
        expect(erdbau.children.map(k => k.name)).toEqual(['H-001 · Kanalgraben']);          // 7 und 8 zeigt der Vorgang
        expect(erdbau.children[0].children.map(k => [k.localId, k.verweis])).toEqual([[7, true], [8, true], [9, true]]);
        expect(zweig.children[2].children[0]).toMatchObject({ name: 'Teilnetz', gruppe: true });
        expect(alle(zweig).every(k => k.modelId === 'A')).toBe(true);
    });

    it('der Filter trifft Namen und Kategorien — auch tief', () => {
        expect(trifft(a.gruppen, 'kanalgr')).toBe(true);
        expect(trifft(a.wurzel, 'urgel')).toBe(true);
        expect(trifft(a.wurzel, 'gibtesnicht')).toBe(false);
        expect(trifft(null, '')).toBe(true);
    });
});

describe('strukturBeziehungen liest Verweise flach und tief', () => {
    it('aus einer IfcQuelle-Attrappe — doppelte Mitglieder einmal', () => {
        const zeilen = {
            IFCRELVOIDSELEMENT: [{ RelatingBuildingElement: { value: 3 }, RelatedOpeningElement: { expressID: 7 } }],
            IFCRELASSIGNSTOGROUP: [{ RelatingGroup: { value: 20 }, RelatedObjects: [{ value: 7 }, { value: 7 }, { value: 8 }] }],
        };
        const q = {
            lebt: () => true, alle: (t) => zeilen[t] ?? [], ids: () => [20], kategorieVon: () => 'IFCGROUP',
            zeile: () => ({ Name: { value: 'Erdbau' }, ObjectType: { value: 'Fachmodell' } }),
        };
        expect(strukturBeziehungen(q)).toEqual({
            voids: [{ wirt: 3, aushub: 7 }],
            gruppen: [{ localId: 20, klasse: 'IFCGROUP', name: 'Erdbau', objectType: 'Fachmodell', mitglieder: [7, 8] }],
        });
        expect(strukturBeziehungen(null)).toEqual({ voids: [], gruppen: [] });
    });
});
