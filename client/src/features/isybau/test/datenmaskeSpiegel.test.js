// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { nextTick } from 'vue';
import PreprocessingModal from '../components/modals/PreprocessingModal.vue';
import { useIsybauStore } from '../store/index.js';

/**
 * Drei Dinge weiss nur die Datenmaske, das Tutorial braucht sie aber, um im
 * richtigen Moment auf den richtigen Knopf zu zeigen: wie viele Zeilen
 * angehakt sind, ob die Massenbearbeitung offen steht und ob Aenderungen
 * vorgemerkt sind.
 *
 * Der Auslass-Schritt haengt daran (siehe tutorialExercise.js): ohne die
 * Spiegelung zeigte die Ratte auf "Typ aendern", einen Kasten, den man an der
 * Stelle noch gar nicht sehen kann — genau die gemeldete Fehlfuehrung.
 */
const netz = () => new Map([
    ['AL1_RBB', { id: 'AL1_RBB', type: 'Standard', x: 0, y: 0, z: 1, coverZ: 2 }],
    ['AL2_RRB', { id: 'AL2_RRB', type: 'Standard', x: 1, y: 1, z: 1, coverZ: 2 }],
]);
const mounten = () => mount(PreprocessingModal, {
    props: { isOpen: true, network: { nodes: netz(), edges: new Map() },
             hydraulics: { catchments: [], areas: [] } },
    global: { stubs: { Teleport: true, DraggableModal: { template: '<div><slot/></div>' } } },
});
/** Das Auswahl-Kaestchen einer Zeile — je Zeile gibt es noch ein zweites
 *  ("Druckdicht"), deshalb ausdruecklich das erste. */
const auswahlHaken = (w, i) => w.findAll('tbody tr')[i].findAll('input[type="checkbox"]')[0];

describe('Die Datenmaske sagt dem Tutorial, wo der Nutzer steht', () => {
    let store;
    beforeEach(() => { setActivePinia(createPinia()); store = useIsybauStore(); });

    it('zaehlt die angehakten Zeilen mit', async () => {
        const w = mounten();
        expect(store.ui.preprocessingSelection).toBe(0);
        await auswahlHaken(w, 0).setValue(true);
        expect(store.ui.preprocessingSelection).toBe(1);
        await auswahlHaken(w, 1).setValue(true);
        expect(store.ui.preprocessingSelection).toBe(2);
        w.unmount();
    });

    it('meldet die offene Massenbearbeitung', async () => {
        const w = mounten();
        await auswahlHaken(w, 0).setValue(true);
        await w.find('[data-tutorial="sammel-bearbeiten"]').trigger('click');
        await nextTick();
        expect(store.ui.preprocessingBulkOpen).toBe(true);
        w.unmount();
    });

    it('meldet vorgemerkte Aenderungen nach dem Sammel-Anwenden', async () => {
        const w = mounten();
        expect(store.ui.preprocessingDirty).toBe(false);
        await auswahlHaken(w, 0).setValue(true);
        await w.find('[data-tutorial="sammel-bearbeiten"]').trigger('click');
        await nextTick();
        await w.find('[data-tutorial="sammel-anwenden"]').trigger('click');
        await nextTick();
        // Genau hier zeigt die Ratte auf "Uebernehmen" statt zurueck aufs Suchfeld.
        expect(store.ui.preprocessingDirty).toBe(true);
        expect(store.ui.preprocessingBulkOpen).toBe(false);
        expect(store.ui.preprocessingSelection).toBe(0);
        w.unmount();
    });

    it('raeumt beim Schliessen auf — sonst zeigt das Tutorial auf ein Fenster, das weg ist', async () => {
        const w = mounten();
        await auswahlHaken(w, 0).setValue(true);
        await w.find('[data-tutorial="sammel-bearbeiten"]').trigger('click');
        await nextTick();
        w.unmount();
        expect(store.ui.preprocessingSelection).toBe(0);
        expect(store.ui.preprocessingBulkOpen).toBe(false);
        expect(store.ui.preprocessingDirty).toBe(false);
    });
});
