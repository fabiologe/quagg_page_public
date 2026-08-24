// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { useIsybauStore } from '../store/index.js';
import { Node } from '../core/domain/Node.js';
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
