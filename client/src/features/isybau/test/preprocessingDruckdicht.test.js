// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import fs from 'fs';
import path from 'path';
import { mount } from '@vue/test-utils';
import { useIsybauStore } from '../store/index.js';
import { Node, normalizeOverflowState } from '../core/domain/Node.js';
import { Edge } from '../core/domain/Edge.js';
import { SwmmBuilder } from '../core/services/SwmmBuilder.js';
import { resolveNodeUiType } from '../utils/mappings.js';
import PreprocessingModal from '../components/modals/PreprocessingModal.vue';

/**
 * Gemeldeter Fehler: „Druckdicht" im Daten-bearbeiten-Fenster setzen bzw.
 * entfernen, „Übernehmen" drücken — die Änderung kam nicht an, und der Solver
 * rechnete weiter druckdicht.
 *
 * Ursache war NICHT die Domänenregel (die ist richtig und in domain.test.js
 * abgedeckt: ein Knoten ohne Deckel, isManhole=false, kann nicht überstauen).
 * Ursache war, dass PreprocessingModal den Haken für genau diese Knoten frei
 * bedienbar zeigte. Node.applyOverflowState() setzte ihn beim Übernehmen
 * stillschweigend zurück — ohne dass der Nutzer je erfuhr, warum.
 *
 * Im Beispielnetz sind 42 von 306 Elementen Status 2, im Netz des Nutzers
 * 7 von 83 — der Fall ist also nicht exotisch.
 */

// Bildet nach, was PreprocessingModal beim Öffnen aus einem Knoten macht.
const alsTabellenzeile = (n) => ({
    ...n,
    type: resolveNodeUiType(n),
    coverZ: n.coverZ !== undefined ? n.coverZ : (n.z + (n.depth || 0)),
    canOverflow: n.canOverflow !== undefined ? n.canOverflow : true,
});

// SwmmBuilder liest getAllNodes/getAllEdges als GETTER (wie in builder.test.js).
const junctionZeile = (store, id) => {
    const nodes = [...store.nodes.values(), new Node({ id: 'O1', x: 999, y: 0, z: -50 })];
    const builder = new SwmmBuilder({
        get getAllNodes() { return nodes; },
        get getAllEdges() { return [new Edge({ id: 'E1', fromNodeId: id, toNodeId: 'O1', length: 10 })]; },
        areas: [],
    });
    builder.setOptions({ durationHours: 2 });
    const r = builder.build();
    const inp = typeof r === 'object' ? r.inpContent : r;
    return inp.split('[JUNCTIONS]')[1].split('[')[0].split('\n').find(l => l.startsWith(id)) ?? '';
};

describe('Druckdicht über „Daten bearbeiten" umstellen', () => {
    let store;
    beforeEach(() => { setActivePinia(createPinia()); store = useIsybauStore(); });

    it('normaler Schacht: Haken entfernen wirkt bis in den Solver-Export', () => {
        store.nodes.set('N', new Node({ id: 'N', type: 'Schacht', z: 10, depth: 2, canOverflow: false }));
        const zeile = alsTabellenzeile(store.nodes.get('N'));
        zeile.canOverflow = true;                    // Nutzer entfernt den Haken
        store.applyPreprocessing({ nodes: [zeile] });

        expect(store.nodes.get('N').canOverflow).toBe(true);
        // SurDepth 0 + Aponded > 0 = überlauffähig (SurDepth 100 / 0 wäre versiegelt)
        expect(junctionZeile(store, 'N')).toMatch(/\s0\.000\s+20\.000\s*$/);
    });

    it('normaler Schacht: Haken setzen wirkt bis in den Solver-Export', () => {
        store.nodes.set('N', new Node({ id: 'N', type: 'Schacht', z: 10, depth: 2 }));
        const zeile = alsTabellenzeile(store.nodes.get('N'));
        zeile.canOverflow = false;                   // Nutzer setzt den Haken
        store.applyPreprocessing({ nodes: [zeile] });

        expect(store.nodes.get('N').canOverflow).toBe(false);
        expect(junctionZeile(store, 'N')).toMatch(/\s100\.000\s+0\.000\s*$/);
    });

    it('mehrfaches Umstellen hintereinander bleibt stabil', () => {
        store.nodes.set('N', new Node({ id: 'N', type: 'Schacht', z: 10, depth: 2 }));
        for (const wert of [false, true, false, true]) {
            const zeile = alsTabellenzeile(store.nodes.get('N'));
            zeile.canOverflow = wert;
            store.applyPreprocessing({ nodes: [zeile] });
            expect(store.nodes.get('N').canOverflow, `nach Umstellen auf ${wert}`).toBe(wert);
        }
    });

    it('deckelloser Knoten bleibt druckdicht — das ist die Domänenregel, kein Fehler', () => {
        store.nodes.set('F', new Node({ id: 'F', type: 'Schacht', z: 10, depth: 2, isManhole: false }));
        const zeile = alsTabellenzeile(store.nodes.get('F'));
        zeile.canOverflow = true;
        store.applyPreprocessing({ nodes: [zeile] });

        expect(store.nodes.get('F').canOverflow).toBe(false);
        expect(junctionZeile(store, 'F')).toMatch(/\s100\.000\s+0\.000\s*$/);
    });
});

describe('…und das Fenster sagt es dem Nutzer, statt still zu verwerfen', () => {
    /* Echter Komponententest statt Quelltext-Lesen: @vue/test-utils ist seit
       dem Pruefstand („Jede Komponente rendert") im Projekt. Geprueft wird das
       gerenderte DOM — also das, was der Nutzer wirklich vor sich hat. */
    const netz = () => {
        const nodes = new Map();
        nodes.set('N', new Node({ id: 'N', type: 'Schacht', x: 0, y: 0, z: 10, depth: 2 }));
        nodes.set('F', new Node({ id: 'F', type: 'Schacht', x: 1, y: 1, z: 10, depth: 2, isManhole: false }));
        return { nodes, edges: new Map() };
    };

    let haken;
    beforeEach(async () => {
        setActivePinia(createPinia());
        const w = mount(PreprocessingModal, {
            props: { isOpen: true, network: netz(), hydraulics: { catchments: [], areas: [] } },
            global: { stubs: { Teleport: true, DraggableModal: { template: '<div><slot/></div>' } } },
        });
        await w.vm.$nextTick();
        // Erste Checkbox der Zeile ist die Zeilenauswahl, die letzte „Druckdicht".
        haken = {};
        for (const id of ['N', 'F']) {
            const zeile = w.find(`tr[data-row-id="${id}"]`);
            if (!zeile.exists()) continue;
            const boxen = zeile.findAll('input[type="checkbox"]');
            haken[id] = boxen[boxen.length - 1];
        }
    });

    it('der Haken am normalen Schacht ist bedienbar', () => {
        expect(haken.N, 'Zeile für N nicht gefunden').toBeTruthy();
        expect(haken.N.attributes('disabled')).toBeUndefined();
    });

    it('der Haken am deckellosen Knoten ist gesperrt und nennt den Grund', () => {
        expect(haken.F, 'Zeile für F nicht gefunden').toBeTruthy();
        expect(haken.F.attributes('disabled')).toBeDefined();
        expect(haken.F.attributes('title')).toMatch(/kein Deckel|Überstau nicht möglich/);
    });
});

describe('Der echte Weg durch die Komponente: klicken und Übernehmen', () => {
    /* Die Tests oben bilden die Tabellenzeile nach. Dieser hier klickt wirklich
       im gerenderten Fenster und liest, was „Übernehmen" nach draußen gibt —
       damit die Nachbildung nicht unbemerkt von der Komponente abweichen kann. */
    it('der Haken am normalen Schacht landet im apply-Ereignis', async () => {
        setActivePinia(createPinia());
        const nodes = new Map();
        nodes.set('N', new Node({ id: 'N', type: 'Schacht', x: 0, y: 0, z: 10, depth: 2 }));
        const w = mount(PreprocessingModal, {
            props: { isOpen: true, network: { nodes, edges: new Map() },
                     hydraulics: { catchments: [], areas: [] } },
            global: { stubs: { Teleport: true, DraggableModal: { template: '<div><slot/></div>' } } },
        });
        await w.vm.$nextTick();

        const zeile = w.find('tr[data-row-id="N"]');
        const boxen = zeile.findAll('input[type="checkbox"]');
        const druckdicht = boxen[boxen.length - 1];
        expect(druckdicht.element.checked, 'startet nicht druckdicht').toBe(false);

        await druckdicht.setValue(true);          // Nutzer hakt „Druckdicht" an
        await w.find('[data-tutorial="preprocessing-uebernehmen"]').trigger('click');

        const nutzlast = w.emitted('apply')?.[0]?.[0];
        expect(nutzlast, 'kein apply-Ereignis').toBeTruthy();
        expect(nutzlast.nodes.find(n => n.id === 'N').canOverflow).toBe(false);
    });
});

describe('Deckel-Haken im Preprocessing (dasselbe Feld wie in ElementInfo)', () => {
    const mounten = (nodes) => mount(PreprocessingModal, {
        props: { isOpen: true, network: { nodes, edges: new Map() },
                 hydraulics: { catchments: [], areas: [] } },
        global: { stubs: { Teleport: true, DraggableModal: { template: '<div><slot/></div>' } } },
    });
    const boxen = (w, id) => {
        const b = w.find(`tr[data-row-id="${id}"]`).findAll('input[type="checkbox"]');
        return { deckel: b[b.length - 2], druckdicht: b[b.length - 1] };
    };

    beforeEach(() => setActivePinia(createPinia()));

    it('Deckel abwählen macht den Knoten druckdicht und sperrt den Haken', async () => {
        const nodes = new Map([['N', new Node({ id: 'N', type: 'Schacht', x: 0, y: 0, z: 10, depth: 2 })]]);
        const w = mounten(nodes);
        await w.vm.$nextTick();

        let b = boxen(w, 'N');
        expect(b.deckel.element.checked).toBe(true);
        expect(b.druckdicht.attributes('disabled')).toBeUndefined();

        await b.deckel.setValue(false);           // „Schacht an Oberfläche" abwählen
        await w.vm.$nextTick();

        b = boxen(w, 'N');
        expect(b.druckdicht.element.checked, 'druckdicht folgt automatisch').toBe(true);
        expect(b.druckdicht.attributes('disabled'), 'und ist jetzt gesperrt').toBeDefined();

        await w.find('[data-tutorial="preprocessing-uebernehmen"]').trigger('click');
        const n = w.emitted('apply')[0][0].nodes.find(x => x.id === 'N');
        expect(n.isManhole).toBe(false);
        expect(n.canOverflow).toBe(false);
    });

    it('Deckel anwählen macht einen fiktiven Knoten wieder überstaufähig', async () => {
        const nodes = new Map([['F', new Node({ id: 'F', type: 'Schacht', x: 0, y: 0, z: 10, depth: 2, isManhole: false })]]);
        const w = mounten(nodes);
        await w.vm.$nextTick();
        expect(boxen(w, 'F').druckdicht.attributes('disabled')).toBeDefined();

        await boxen(w, 'F').deckel.setValue(true);
        await w.vm.$nextTick();

        // Der Zwang gilt nur in EINE Richtung: ohne Deckel kann nichts
        // überstauen. Andersherum gibt es keinen — deshalb bleibt „druckdicht"
        // stehen und wird nicht stillschweigend mitgelöst. Der Haken ist jetzt
        // aber bedienbar, der Nutzer entscheidet selbst.
        let b = boxen(w, 'F');
        expect(b.druckdicht.attributes('disabled'), 'Haken wird bedienbar').toBeUndefined();
        expect(b.druckdicht.element.checked, 'bleibt vorerst druckdicht').toBe(true);

        await b.druckdicht.setValue(false);       // zweiter, bewusster Klick
        await w.vm.$nextTick();

        await w.find('[data-tutorial="preprocessing-uebernehmen"]').trigger('click');
        const n = w.emitted('apply')[0][0].nodes.find(x => x.id === 'F');
        expect(n.isManhole).toBe(true);
        expect(n.canOverflow).toBe(true);
    });

    it('bis in den Store und den Solver-Export', () => {
        const store = useIsybauStore();
        store.nodes.set('F', new Node({ id: 'F', type: 'Schacht', z: 10, depth: 2, isManhole: false }));
        const zeile = alsTabellenzeile(store.nodes.get('F'));
        zeile.isManhole = true;                   // Nutzer setzt den Deckel
        zeile.canOverflow = true;
        store.applyPreprocessing({ nodes: [zeile] });

        expect(store.nodes.get('F').isManhole).toBe(true);
        expect(store.nodes.get('F').canOverflow).toBe(true);
        expect(junctionZeile(store, 'F')).toMatch(/\s0\.000\s+20\.000\s*$/);
    });
});

describe('Massenbearbeitung hält dieselbe Regel ein', () => {
    const mounten = (nodes) => mount(PreprocessingModal, {
        props: { isOpen: true, network: { nodes, edges: new Map() },
                 hydraulics: { catchments: [], areas: [] } },
        global: { stubs: { Teleport: true, DraggableModal: { template: '<div><slot/></div>' } } },
    });

    beforeEach(() => setActivePinia(createPinia()));

    /**
     * Der widersprüchliche Fall: „kein Deckel" UND „überlauffähig" in einem
     * Rutsch. Der Deckel muss gewinnen.
     *
     * Nachgeprüft: das Ergebnis hängt NICHT an der Reihenfolge der beiden
     * Zweige in applyBulkEdit — setzeDeckel normalisiert neu, und der
     * druckdicht-Zweig überspringt deckellose Knoten ohnehin. Der Test hält
     * deshalb die Wirkung fest, nicht die Reihenfolge.
     */
    it('Deckel aus + überlauffähig gleichzeitig: der Deckel gewinnt', async () => {
        const nodes = new Map([['N', new Node({ id: 'N', type: 'Schacht', x: 0, y: 0, z: 10, depth: 2 })]]);
        const w = mounten(nodes);
        await w.vm.$nextTick();

        await w.find('tr[data-row-id="N"] input[type="checkbox"]').setValue(true); // Zeile auswählen
        w.vm.openBulkEdit ? w.vm.openBulkEdit() : (w.vm.showBulkEdit = true);
        await w.vm.$nextTick();

        w.vm.bulkForm.isManhole = false;
        w.vm.bulkForm.canOverflow = true;
        w.vm.applyBulkEdit();
        await w.vm.$nextTick();

        await w.find('[data-tutorial="preprocessing-uebernehmen"]').trigger('click');
        const n = w.emitted('apply')[0][0].nodes.find(x => x.id === 'N');
        expect(n.isManhole).toBe(false);
        expect(n.canOverflow, 'ohne Deckel kein Überstau').toBe(false);
    });

    it('kein emittierter Knoten trägt je den widersprüchlichen Zustand', async () => {
        const nodes = new Map([
            ['A', new Node({ id: 'A', type: 'Schacht', x: 0, y: 0, z: 10, depth: 2 })],
            ['B', new Node({ id: 'B', type: 'Schacht', x: 1, y: 1, z: 10, depth: 2, isManhole: false })],
        ]);
        const w = mounten(nodes);
        await w.vm.$nextTick();
        await w.find('[data-tutorial="preprocessing-uebernehmen"]').trigger('click');

        for (const n of w.emitted('apply')[0][0].nodes) {
            expect(n.isManhole === false && n.canOverflow === true, `${n.id} widersprüchlich`).toBe(false);
        }
    });
});

describe('Beide Formulare halten denselben Zustand', () => {
    /* Der Nutzer soll den Deckel in ElementInfo UND im Preprocessing umlegen
       können und dasselbe Ergebnis bekommen. Beide Formulare arbeiten auf
       Kopien (localData bzw. Tabellenzeile), deshalb kann die Regel nicht im
       Node-Modell allein sitzen — sie liegt als reine Funktion daneben. */
    it('normalizeOverflowState und Node.applyOverflowState stimmen überein', () => {
        const faelle = [
            { isManhole: true,  canOverflow: true  },
            { isManhole: true,  canOverflow: false },
            { isManhole: false, canOverflow: true  },
            { isManhole: false, canOverflow: false },
            { isManhole: undefined, canOverflow: undefined },
        ];
        for (const f of faelle) {
            const n = new Node({ id: 'X', z: 0 });
            n.applyOverflowState(f);
            const rein = normalizeOverflowState(f);
            expect({ isManhole: n.isManhole, canOverflow: n.canOverflow }, JSON.stringify(f)).toEqual(rein);
        }
    });

    it('ein deckelloser Knoten kann die Regel nicht verletzen', () => {
        expect(normalizeOverflowState({ isManhole: false, canOverflow: true }))
            .toEqual({ isManhole: false, canOverflow: false });
    });

    it('beide Formulare rufen dieselbe Funktion auf', () => {
        const lies = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
        for (const datei of ['../components/modals/PreprocessingModal.vue',
                             '../components/visualizer/ElementInfo.vue']) {
            const src = lies(datei);
            expect(src, `${datei} importiert die Regel nicht`).toContain("normalizeOverflowState } from '../../core/domain/Node.js'");
            expect(src, `${datei} ruft die Regel nicht auf`).toMatch(/normalizeOverflowState\(\{/);
        }
    });
});
