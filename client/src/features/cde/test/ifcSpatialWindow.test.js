// @vitest-environment jsdom
/**
 * Das Fenster „Bauwerksstruktur" zeigt JEDES Modell (Fahrplan Erdbau-Container, Stufe 8, T6).
 *
 * Bis 2026-09-11 stand dort nur das erste Modell, jeder Knoten hieß wie seine
 * Kategorie, und ein Klick zoomte ins erste Modell — auch wenn der Knoten im
 * zweiten lag. Hier: zwei Modelle, zwei Köpfe mit Herkunft, der Klick trifft DAS Modell.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/services/api', () => ({
  default: { get: vi.fn(async () => ({ data: {} })), post: vi.fn(async () => ({ data: {} })), put: vi.fn(async () => ({ data: {} })) },
}));

import IfcSpatialWindow from '../components/IfcSpatialWindow.vue';
import { provideViewerApi } from '../composables/viewerApi.js';
import { useCdeStore } from '../stores/useCdeStore.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { baueBaeume } from '../services/Bauwerksstruktur.js';

let pinia = null;
beforeEach(() => { localStorage.clear(); pinia = createPinia(); setActivePinia(pinia); });
afterEach(() => { vi.restoreAllMocks(); });

const baum = () => ({ category: 'IFCPROJECT', localId: 1, children: [
  { category: 'IFCSITE', localId: 2, children: [{ category: 'IFCGEOGRAPHICELEMENT', localId: 3, children: [] }] }] });

describe('IfcSpatialWindow — alle geladenen Modelle', () => {
  it('zwei Modelle, zwei Köpfe mit Herkunft; ein Klick im zweiten zoomt in DAS Modell', async () => {
    const api = { zoomToLocalId: vi.fn(async () => {}), setStoreyVisible: vi.fn(async () => {}) };
    useIfcStore().setSpatialBaeume(baueBaeume({
      baeume: [{ modelId: 'm1', name: 'Gelaende.ifc', wurzel: baum() }, { modelId: 'm2', name: 'Erdbau_Boden_R01.ifc', wurzel: baum() }],
      index: [{ modelId: 'm1', localId: 3, name: 'Urgelände' }, { modelId: 'm2', localId: 3, name: 'Ur im Erdbau' }],
      shaVon: (m) => ({ m1: 'a'.repeat(64), m2: 'e'.repeat(64) })[m],
    }));
    const Huelle = { setup() { provideViewerApi(api); return () => h(IfcSpatialWindow); } };
    const w = mount(Huelle, { global: { plugins: [pinia], stubs: { CdeIcon: { template: '<i />' } } } });
    await flushPromises();
    // Wie im Betrieb: das Register kommt NACH dem Modell — der Kopf muss es nachziehen.
    expect(w.findAll('.sw-chip').map(c => c.text())).toEqual(['lokal', 'lokal']);
    useCdeStore().dokumente = [
      { sha256: 'a'.repeat(64), name: 'Gelaende.ifc', revision: 1, status: 'WIP' },
      { sha256: 'e'.repeat(64), name: 'Erdbau_Boden_R01.ifc', revision: 2, status: 'Shared',
        herkunft: { art: 'erdbau', satz_name: 'Boden', quellen: [{ datei: 'Gelaende.ifc' }] } },
    ];
    await flushPromises();

    const koepfe = w.findAll('.sw-kopf');
    expect(koepfe).toHaveLength(2);
    expect(w.findAll('.sw-chip').map(c => c.text())).toEqual(['Lieferung', 'Erdbau · aus Gelaende.ifc']);
    expect(koepfe[1].find('.sw-stand').text()).toBe('R2 · Shared');
    expect(w.find('.sw-footer').text()).toContain('2 Modelle');

    const label = w.findAll('.node-label').find(n => n.text() === 'Ur im Erdbau');
    expect(label, 'Knoten des zweiten Modells mit seinem Namen').toBeTruthy();
    await label.trigger('click');
    expect(api.zoomToLocalId).toHaveBeenCalledWith(3, 'm2');

    await koepfe[0].trigger('click');                                   // zuklappen: nur dieser Abschnitt
    expect(w.findAll('.node-label').some(n => n.text() === 'Urgelände')).toBe(false);
    expect(w.findAll('.node-label').some(n => n.text() === 'Ur im Erdbau')).toBe(true);
    w.unmount();
  });
});
