// @vitest-environment jsdom
/**
 * Das Auge je Vorgang IM BAUM (Teil XXI, E3).
 *
 * Die Regel steht in der Engine (`vorgangAuge.test.js`), der Knoten entsteht in
 * `Bauwerksstruktur.eigenbauBaum`. Hier wird das Dritte geprüft: dass der Baum
 * den überdeckten Vorgang als solchen ZEIGT und dass sein Auge dort ankommt, wo
 * es hingehört. Ein Knopf, der nichts ruft, sähe im Bild genauso aus.
 */
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import IfcSpatialTree from '../components/IfcSpatialTree.vue';
import { eigenbauBaum } from '../services/Bauwerksstruktur.js';

const A = 'ab-grube', B = 'ab-fuellung';

/** Derselbe Weg wie im Viewer: Stand → Baum → Komponente. */
function baum({ sichtbar = false } = {}) {
    const stand = new Map([
        ['cde-a-aushub',  { rezept: 'erdbau', rolle: 'aushub',  kategorie: 'IFCEARTHWORKSCUT',  name: 'Ur · Ausheben · Aushub',  ableitung: A }],
        ['cde-b-auftrag', { rezept: 'erdbau', rolle: 'auftrag', kategorie: 'IFCEARTHWORKSFILL', name: 'Ur · Auffüllen · Auftrag', ableitung: B }],
    ]);
    return eigenbauBaum({
        stand, modelId: 'cde-eigenbau',
        karte: new Map([['cde-a-aushub', 7], ['cde-b-auftrag', 13]]),
        titel: new Map([[A, 'Ur · Ausheben'], [B, 'Ur · Auffüllen']]),
        vorgangsAugen: new Map([
            [A, { sichtbar, verdecktVon: [{ ableitung: B, anteil: 1 }] }],
            [B, { sichtbar: true, verdecktVon: [] }],
        ]),
    });
}

const hänge = (tree, vorgangAuge) => mount(IfcSpatialTree, {
    props: { tree: tree.wurzel, bare: true },
    global: { provide: { vorgangAuge }, stubs: { CdeIcon: { template: '<i />' } } },
});

describe('Der Baum zeigt, welcher Vorgang überdeckt ist', () => {
    it('der überdeckte Vorgang nennt den jüngeren beim Namen', () => {
        const t = baum();
        const knoten = t.wurzel.children.find(k => k.vorgang === A);
        expect(knoten.sichtbar).toBe(false);
        expect(knoten.verdecktVon).toEqual(['Ur · Auffüllen']);      // Titel, nicht Kennung
        const w = hänge(t, vi.fn());
        expect(w.text()).toContain('verdeckt von Ur · Auffüllen');
        w.unmount();
    });

    it('der jüngere Vorgang trägt keinen Hinweis', () => {
        const t = baum();
        const knoten = t.wurzel.children.find(k => k.vorgang === B);
        expect(knoten.verdecktVon).toBeUndefined();
        expect(knoten.sichtbar).toBe(true);
    });

    it('das Auge am Vorgangsknoten ruft die Engine — mit dem Knoten und dem NEUEN Zustand', async () => {
        const auge = vi.fn();
        const w = hänge(baum(), auge);
        const knopf = w.findAll('button[aria-label="Vorgang zeigen oder ausblenden"]');
        expect(knopf).toHaveLength(2);                                // je Vorgang eines
        await knopf[0].trigger('click');
        expect(auge).toHaveBeenCalledTimes(1);
        expect(auge.mock.calls[0][0].vorgang).toBe(A);
        expect(auge.mock.calls[0][1]).toBe(true);                     // verdeckt → zeigen
        await knopf[1].trigger('click');
        expect(auge.mock.calls[1][0].vorgang).toBe(B);
        expect(auge.mock.calls[1][1]).toBe(false);                    // sichtbar → ausblenden
        w.unmount();
    });

    it('ohne bereitgestelltes Auge gibt es keinen Knopf — kein toter Knopf im Bild', () => {
        const w = mount(IfcSpatialTree, {
            props: { tree: baum().wurzel, bare: true },
            global: { stubs: { CdeIcon: { template: '<i />' } } },
        });
        expect(w.findAll('button[aria-label="Vorgang zeigen oder ausblenden"]')).toHaveLength(0);
        w.unmount();
    });

    it('ohne Angabe der Engine gilt „sichtbar" — ein Baum ohne Raum verbirgt nichts', () => {
        const t = eigenbauBaum({
            stand: new Map([['cde-a', { rezept: 'erdbau', rolle: 'aushub', name: 'Aushub', ableitung: A }]]),
            titel: new Map([[A, 'Ur · Ausheben']]), modelId: 'cde-eigenbau',
        });
        const knoten = t.wurzel.children.find(k => k.vorgang === A);
        expect(knoten.sichtbar).toBe(true);
        expect(knoten.verdecktVon).toBeUndefined();
    });
});
