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

    it('auch am fiktiven Knoten (Status 2) wirkt das Abwählen', () => {
        // Die Modellregel „ohne Deckel kein Überstau" gilt weiter — der
        // Schalter führt isManhole deshalb mit, statt daran zu scheitern.
        store.nodes.set('F', new Node({ id: 'F', type: 'Schacht', z: 10, depth: 2, isManhole: false }));
        const zeile = alsTabellenzeile(store.nodes.get('F'));
        Object.assign(zeile, { isManhole: true, canOverflow: true });
        store.applyPreprocessing({ nodes: [zeile] });

        expect(store.nodes.get('F').canOverflow).toBe(true);
        expect(junctionZeile(store, 'F')).toMatch(/\s0\.000\s+20\.000\s*$/);
    });
});

describe('Ein einziger Schalter — in beiden Fenstern', () => {
    /* Fachliche Vorgabe: der Nutzer sieht NUR „Druckdicht". Das zweite
       Modellfeld (isManhole, aus ISYBAU-Status 2) fuehrt der Schalter mit.
       Unbedenklich, weil isManhole keine andere Wirkung hat: der ISYBAU-Export
       schreibt `status`, der SwmmBuilder nutzt es nur als Ueberstau-Sperre. */
    const mounten = (nodes) => mount(PreprocessingModal, {
        props: { isOpen: true, network: { nodes, edges: new Map() },
                 hydraulics: { catchments: [], areas: [] } },
        global: { stubs: { Teleport: true, DraggableModal: { template: '<div><slot/></div>' } } },
    });
    const haken = (w, id) => {
        const b = w.find(`tr[data-row-id="${id}"]`).findAll('input[type="checkbox"]');
        return b[b.length - 1];
    };

    beforeEach(() => setActivePinia(createPinia()));

    it('es gibt genau EINE Druckdicht-Spalte, keine Deckel-Spalte', () => {
        const src = fs.readFileSync(
            path.resolve(__dirname, '../components/modals/PreprocessingModal.vue'), 'utf-8');
        expect(src).not.toContain('Deckel vorh.');
        expect(src).not.toContain('Schacht an Oberfläche');
        expect((src.match(/<th>Druckdicht<\/th>/g) || []).length, 'Knoten- und Bauwerke-Tabelle').toBe(2);
    });

    it.each([
        ['normaler Schacht', {}],
        ['fiktiver Knoten (Status 2)', { isManhole: false }],
    ])('%s: der Haken ist bedienbar und wirkt', async (_name, extra) => {
        const nodes = new Map([['N', new Node({ id: 'N', type: 'Schacht', x: 0, y: 0, z: 10, depth: 2, ...extra })]]);
        const w = mounten(nodes);
        await w.vm.$nextTick();

        const box = haken(w, 'N');
        expect(box.attributes('disabled'), 'nie gesperrt').toBeUndefined();

        await box.setValue(false);                 // „Druckdicht" abwählen
        await w.vm.$nextTick();
        await w.find('[data-tutorial="preprocessing-uebernehmen"]').trigger('click');

        const n = w.emitted('apply')[0][0].nodes.find(x => x.id === 'N');
        expect(n.canOverflow, 'kann jetzt überstauen').toBe(true);
        expect(n.isManhole, 'Deckel wird mitgeführt').toBe(true);
    });

    it('anhaken macht wieder druckdicht', async () => {
        const nodes = new Map([['N', new Node({ id: 'N', type: 'Schacht', x: 0, y: 0, z: 10, depth: 2 })]]);
        const w = mounten(nodes);
        await w.vm.$nextTick();
        await haken(w, 'N').setValue(true);
        await w.find('[data-tutorial="preprocessing-uebernehmen"]').trigger('click');
        expect(w.emitted('apply')[0][0].nodes[0].canOverflow).toBe(false);
    });

    it('die Massenbearbeitung setzt denselben Zustand', async () => {
        const nodes = new Map([['F', new Node({ id: 'F', type: 'Schacht', x: 0, y: 0, z: 10, depth: 2, isManhole: false })]]);
        const w = mounten(nodes);
        await w.vm.$nextTick();
        await w.find('tr[data-row-id="F"] input[type="checkbox"]').setValue(true);
        w.vm.bulkForm.canOverflow = true;          // „Nein – überlauffähig"
        w.vm.applyBulkEdit();
        await w.vm.$nextTick();
        await w.find('[data-tutorial="preprocessing-uebernehmen"]').trigger('click');

        const n = w.emitted('apply')[0][0].nodes.find(x => x.id === 'F');
        expect(n.canOverflow).toBe(true);
        expect(n.isManhole).toBe(true);
    });

    it('ElementInfo zeigt denselben einen Schalter und nutzt dieselbe Regel', () => {
        const src = fs.readFileSync(
            path.resolve(__dirname, '../components/visualizer/ElementInfo.vue'), 'utf-8');
        expect(src, 'Deckel-Kasten entfernt').not.toContain('id="isManhole"');
        expect(src).toContain('id="druckdicht"');
        expect(src).toContain("normalizeOverflowState } from '../../core/domain/Node.js'");
    });

    it('die Kopplung im Modell bleibt unangetastet', () => {
        // Der Schalter umgeht die Regel nicht, er fuettert sie richtig.
        expect(normalizeOverflowState({ isManhole: false, canOverflow: true }))
            .toEqual({ isManhole: false, canOverflow: false });
        const n = new Node({ id: 'X', z: 0, isManhole: false });
        expect(n.canOverflow).toBe(false);
    });
});
