// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { nextTick } from 'vue';
import ElementPropertiesModal from '../components/modals/ElementPropertiesModal.vue';
import ModelRainModal from '../components/modals/ModelRainModal.vue';

/**
 * Zwei Stellen, an denen die Umstellung vom nativen <select> auf
 * PixelSelect.vue mehr war als ein Austausch der Auszeichnung — sie werden
 * deshalb hier einzeln nachgehalten:
 *
 *   1. Der Auslass einer Flaeche haing an `required`. Ein <span> kennt das
 *      nicht, also prueft das Formular jetzt selbst.
 *   2. Die Wiederkehrzeit im Modellregen-Fenster erscheint nur bei Euler II
 *      MIT KOSTRA-Daten — im Klickweg durch die laufende App ist sie deshalb
 *      nicht erreichbar (der Knopf ist ohne Daten gesperrt).
 */
// Teleport wird gestubbt (wie in preprocessingDruckdicht.test.js): sowohl das
// Fenster als auch die aufgeklappte Liste rendern dann an Ort und Stelle und
// sind ueber den Wrapper erreichbar.
const HUELLE = {
    global: { stubs: { Teleport: true, DraggableModal: { template: '<div><slot/></div>' } } },
};

// Chart.js malt auf ein <canvas>, das jsdom nicht hat — die Vorschau im
// Modellregen-Fenster gehoert nicht zu dem, was hier geprueft wird.
vi.mock('vue-chartjs', () => ({ Bar: { template: '<div class="chart-attrappe" />' } }));
const auswahl = (w) => w.findAll('.isy-select');
const eintraege = (w) => w.findAll('.isy-select-liste__eintrag');

beforeEach(() => setActivePinia(createPinia()));

describe('Flaechen-Formular: Auslass ist Pflicht, auch ohne required', () => {
    const bauen = () => mount(ElementPropertiesModal, {
        props: {
            isOpen: true,
            mode: 'area',
            elementData: { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] },
            availableNodes: [{ id: 'K1' }, { id: 'K2' }],
            availableEdges: [{ id: 'R1', fromNodeId: 'K1', toNodeId: 'K2' }],
        },
        ...HUELLE,
    });

    it('speichert NICHT, solange kein Anschluss gewaehlt ist', async () => {
        const w = bauen();
        await nextTick(); // Formular füllt sich nach einem Tick (initForm)
        await w.find('form').trigger('submit');
        expect(w.emitted('save')).toBeUndefined();
        expect(w.text()).toContain('Bitte einen Anschluss wählen.');
        w.unmount();
    });

    it('speichert, sobald ein Knoten gewaehlt wurde', async () => {
        const w = bauen();
        const feld = auswahl(w).find(f => f.text().includes('Knoten wählen'));
        await feld.trigger('click');
        await eintraege(w).find(e => e.text() === 'K2').trigger('click');
        await nextTick();
        await w.find('form').trigger('submit');
        expect(w.emitted('save')).toBeTruthy();
        expect(w.emitted('save')[0][0].data.nodeId).toBe('K2');
        expect(w.emitted('save')[0][0].data.id).toBe('F_1');
        w.unmount();
    });

    it('doppelte ID: Hinweis im Fenster, nichts gespeichert', async () => {
        const { useIsybauStore } = await import('../store/index.js');
        const { Area } = await import('../core/domain/Area.js');
        useIsybauStore().areas.push(new Area({ id: 'F_1', points: [] }));
        const w = bauen();
        await nextTick();
        const feld = auswahl(w).find(f => f.text().includes('Knoten wählen'));
        await feld.trigger('click');
        await eintraege(w).find(e => e.text() === 'K2').trigger('click');
        await w.find('input.form-input').setValue('F_1');
        await w.find('form').trigger('submit');
        expect(w.emitted('save')).toBeUndefined();
        expect(w.text()).toContain('„F_1" gibt es schon');
        expect(w.text()).toContain('F_2');
        w.unmount();
    });
});

describe('Modellregen: Wiederkehrzeit haengt an KOSTRA-Daten', () => {
    it('zeigt die Liste bei Euler II und uebernimmt die Wahl', async () => {
        const w = mount(ModelRainModal, {
            props: { isOpen: true, kostraData: { RN_020A: [10, 20, 30] } },
            ...HUELLE,
        });
        // Euler II ist erst mit KOSTRA-Daten waehlbar — genau deshalb steht
        // dieser Fall hier und nicht im Klickweg.
        const euler = w.findAll('input[type="radio"]').find(r => r.element.value === 'euler2');
        expect(euler.element.disabled).toBe(false);
        await euler.setValue();
        const feld = auswahl(w)[0];
        expect(feld.exists()).toBe(true);
        await feld.trigger('click');
        const ziel = eintraege(w).find(e => e.text() === '20 Jahre');
        expect(ziel, 'Eintrag "20 Jahre" fehlt').toBeTruthy();
        await ziel.trigger('click');
        await nextTick();
        // .isy-select__text statt .text(): mit gestubbtem Teleport steckt die
        // Liste im Feld-Element, dessen Text sonst alle Eintraege mitfuehrt.
        expect(auswahl(w)[0].find('.isy-select__text').text()).toBe('20 Jahre');
        w.unmount();
    });
});

// P2.2: Anlegen-Dialog rechnete in m, Info-Fenster und Datentabelle in mm — „300" wurde 300 m
describe('Haltung anlegen: Profil in mm wie überall', () => {
    it('Voreinstellung 300 mm → Store 0,3 m', async () => {
        const w = mount(ElementPropertiesModal, {
            props: { isOpen: true, mode: 'edge', elementData: { metaFromId: 'K1', metaToId: 'K2' },
                     availableNodes: [{ id: 'K1', z: 2 }, { id: 'K2', z: 1 }], availableEdges: [] },
            ...HUELLE,
        });
        await nextTick();
        expect(w.text()).toContain('Höhe / DN (mm)');
        await w.find('form').trigger('submit');
        const d = w.emitted('save')[0][0].data;
        expect(d.profile.height).toBeCloseTo(0.3, 9);
        w.unmount();
    });
});
