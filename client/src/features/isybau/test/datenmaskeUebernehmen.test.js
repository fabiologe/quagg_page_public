// @vitest-environment jsdom
/**
 * „Übernehmen" in der Datenmaske darf nichts verändern, was der Nutzer nicht
 * angefasst hat (P0.8): fehlende Sohlhöhen wurden 0 m, Anschlusspunkte und Divider
 * bekamen den Anzeige-Typ („Bauwerk"/„Standard") und verloren damit Auslass- bzw.
 * Verteiler-Eigenschaft. Weg wie in der App: Maske → Knopf → store.updateNetworkData.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { nextTick } from 'vue';
import PreprocessingModal from '../components/modals/PreprocessingModal.vue';
import { useIsybauStore } from '../store/index.js';
import { classifyPreview } from '../utils/mappings.js';

describe('Datenmaske „Übernehmen" ohne Änderung', () => {
    let store;
    beforeEach(() => { setActivePinia(createPinia()); store = useIsybauStore(); });

    it('Sohlhöhen, Anschlusspunkt, Divider und Pumpe bleiben, was sie waren', async () => {
        store.loadParsedData({
            network: {
                nodes: new Map([
                    ['S1', { id: 'S1', type: 'Schacht', x: 0, y: 0, z: 100, coverZ: 102 }],
                    ['AP', { id: 'AP', type: 'Anschlusspunkt', punktkennung: 'NN', x: 10, y: 0, z: 99 }],
                    ['DV', { id: 'DV', type: 'Divider', x: 5, y: 5, z: 99.5, coverZ: 101 }],
                    ['PW', { id: 'PW', type: 'Bauwerk', bauwerkstyp: 6, x: 5, y: -5, z: 98, coverZ: 101 }],
                ]),
                edges: new Map([
                    ['H1', { id: 'H1', fromNodeId: 'S1', toNodeId: 'AP', length: 10, profile: { type: 0, height: 0.3, width: 0.3 } }],
                ]),
            },
            hydraulics: { areas: [] },
        });
        const vorher = {
            sections: ['AP', 'DV', 'PW'].map(id => classifyPreview(store.nodes.get(id))),
            z1: store.edges.get('H1').z1,
        };
        expect(vorher.z1).toBeNull();

        const w = mount(PreprocessingModal, {
            props: { isOpen: true, network: { nodes: store.nodes, edges: store.edges }, hydraulics: { areas: store.areas } },
            global: { stubs: { Teleport: true, DraggableModal: { template: '<div><slot/></div>' } } },
        });
        await nextTick();
        await w.find('[data-tutorial="preprocessing-uebernehmen"]').trigger('click');
        store.updateNetworkData(w.emitted('apply')[0][0]);
        w.unmount();

        expect(store.edges.get('H1').z1).toBeNull();
        expect(store.edges.get('H1').z2).toBeNull();
        expect(store.nodes.get('AP').type).toBe('Anschlusspunkt');
        expect(store.nodes.get('DV').type).toBe('Divider');
        expect(store.nodes.get('PW').bauwerkstyp).toBe(6);
        expect(['AP', 'DV', 'PW'].map(id => classifyPreview(store.nodes.get(id)))).toEqual(vorher.sections);
        expect(store.nodes.get('AP')).not.toHaveProperty('_typAnzeige');
    });
});
