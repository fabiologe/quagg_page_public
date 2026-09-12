/**
 * Die Bauwerksstruktur in der ECHTEN Form von fragments (Abnahme 2026-09-12, A7).
 *
 * Fabio sah im Fenster „PROJECT › Element › SITE › Site", kein Auge je Modell,
 * und „cde-eigenbau · lokal" klappte nicht auf. Die Tests von Stufe 8 waren
 * grün, weil ihre Attrappen eine Mischform trugen (Kategorie UND localId am
 * selben Knoten), die es nie gab: `getTreeItem` im Worker baut Kategorie-Knoten
 * ohne localId und Element-Knoten ohne Kategorie, im Wechsel. Hier steht die
 * echte Form — und der Abschnitt „Eigenbau", der aus dem Verlauf kommt.
 */
import { describe, expect, it } from 'vitest';
import { baueBaeume, eigenbauBaum } from '../services/Bauwerksstruktur.js';

const alle = (k, f = []) => { if (k) { f.push(k); (k.children ?? []).forEach(c => alle(c, f)); } return f; };

/** So liefert `model.getSpatialStructure()` den Baum (fragments-Worker, `getTreeItem`). */
const echt = () => ({ category: 'IFCPROJECT', localId: null, children: [
    { category: null, localId: 1, children: [
        { category: 'IFCSITE', localId: null, children: [
            { category: null, localId: 2, children: [
                { category: 'IFCGEOGRAPHICELEMENT', localId: null, children: [{ category: null, localId: 3 }] },
                { category: 'IFCPIPESEGMENT', localId: null, children: [{ category: null, localId: 4 }, { category: null, localId: 5 }] },
            ] }] }] }] });
const INDEX = [
    { modelId: 'A', localId: 1, name: 'Projekt Kanal', category: 'IFCPROJECT' },
    { modelId: 'A', localId: 2, name: 'Standort', category: 'IFCSITE' },
    { modelId: 'A', localId: 3, name: 'Urgelände', category: 'IFCGEOGRAPHICELEMENT' },
];

describe('die echte Form von fragments wird gefaltet', () => {
    it('Projekt › Standort › Gelände — keine „Element"- und keine Kategoriezeilen dazwischen', () => {
        const [a] = baueBaeume({ baeume: [{ modelId: 'A', name: 'a.ifc', wurzel: echt() }], index: INDEX });
        const pfad = [];
        for (let k = a.wurzel; k; k = k.children?.[0]) pfad.push(`${k.category}:${k.name}`);
        // vorher: PROJECT › Element › SITE › Standort — vier Zeilen für zwei Dinge
        expect(pfad.slice(0, 3)).toEqual(['IFCPROJECT:Projekt Kanal', 'IFCSITE:Standort', 'IFCGEOGRAPHICELEMENT:Urgelände']);
        // Zeilen ohne Bauteil: nur noch der eine Ordner (vorher: jede Kategorie)
        expect(alle(a.wurzel).filter(k => k.localId == null)).toHaveLength(1);
    });

    it('mehrere Elemente einer Kategorie werden EIN Ordner mit Zahl; jedes trägt die Kategorie', () => {
        const [a] = baueBaeume({ baeume: [{ modelId: 'A', name: 'a.ifc', wurzel: echt() }], index: INDEX });
        const ordner = alle(a.wurzel).find(k => k.ordner);
        expect(ordner.name).toBe('IfcPipeSegment (2)');
        expect(ordner.children.map(k => [k.localId, k.category])).toEqual([[4, 'IFCPIPESEGMENT'], [5, 'IFCPIPESEGMENT']]);
        expect(alle(a.wurzel).every(k => k.modelId === 'A')).toBe(true);
    });
});

describe('der Abschnitt „Eigenbau" kommt aus dem Verlauf', () => {
    const STAND = new Map([
        ['cde-cut', { rezept: 'erdbau', rolle: 'aushub', ableitung: 'ab-1', kategorie: 'IFCEARTHWORKSCUT', name: 'Ur · Ausheben · Aushub' }],
        ['cde-fill', { rezept: 'erdbau', rolle: 'auftrag', ableitung: 'ab-1', kategorie: 'IFCEARTHWORKSFILL', name: 'Ur · Ausheben · Auftrag' }],
        ['cde-anz', { rezept: 'anzeige', rolle: 'anzeige', ableitung: 'an-1', kategorie: 'IFCGEOGRAPHICELEMENT', name: 'Ur (geformt)',
                      parameter: { vorgaenge: [{ ableitung: 'ab-1', titel: 'Ur · Ausheben' }] } }],
    ]);

    it('je Vorgang ein Knoten mit seinen Teilen, das Gelände daneben — mit den localIds des Aufbaus', () => {
        const b = eigenbauBaum({ stand: STAND, karte: new Map([['cde-cut', 11], ['cde-anz', 13]]),
                                 titel: new Map([['ab-1', 'Ur · Ausheben']]), modelId: 'cde-eigenbau' });
        expect(b).toMatchObject({ modelId: 'cde-eigenbau', name: 'Eigenbau', eigenbau: true, knoten: 3 });
        const [vorgang, gelaende] = b.wurzel.children;
        expect(vorgang).toMatchObject({ name: 'Ur · Ausheben', vorgang: 'ab-1', gruppe: true });
        // Was der Aufbau nicht bauen konnte, steht da — und sagt es.
        expect(vorgang.children.map(k => [k.localId, k.name])).toEqual([
            [11, 'Ur · Ausheben · Aushub'], [null, 'Ur · Ausheben · Auftrag (nicht gebaut)']]);
        expect(gelaende).toMatchObject({ localId: 13, name: 'Ur (geformt)', category: 'IFCGEOGRAPHICELEMENT' });
    });

    // Abnahme 2026-09-12 (M2): der Auftrag eines reinen Aushubs ist LEER — kein Fehlschlag.
    it('ein leeres Teil heißt „leer“, nicht „nicht gebaut“', () => {
        const b = eigenbauBaum({ stand: STAND, karte: new Map([['cde-cut', 11], ['cde-anz', 13]]),
                                 titel: new Map([['ab-1', 'Ur · Ausheben']]), leer: new Set(['cde-fill']), modelId: 'cde-eigenbau' });
        const [vorgang] = b.wurzel.children;
        expect(vorgang.children.map(k => k.name)).toEqual(['Ur · Ausheben · Aushub', 'Ur · Ausheben · Auftrag (leer)']);
    });

    it('ohne eigene Teile gibt es keinen Abschnitt', () => {
        expect(eigenbauBaum({ stand: new Map(), modelId: 'cde-eigenbau' })).toBe(null);
    });
});
