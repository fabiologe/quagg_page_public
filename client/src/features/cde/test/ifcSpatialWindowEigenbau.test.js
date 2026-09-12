// @vitest-environment jsdom
/**
 * Das Auge je Modell und der Abschnitt „Eigenbau" im Fenster (Abnahme 2026-09-12, A6/A7).
 *
 * Fabio fand in der Bauwerksstruktur kein Auge je Modell, und „cde-eigenbau ·
 * lokal" klappte nicht auf; die Eigenbau-Teile liessen sich weder ausblenden
 * noch löschen. Hier: das Auge im Kopf schaltet über die Engine (die Wahrheit
 * liegt dort), der Eigenbau heisst Eigenbau, und sein Vorgang bietet
 * „Vorgang entfernen" an.
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
import { useIfcStore } from '../stores/useIfcStore.js';
import { baueBaeume, eigenbauBaum } from '../services/Bauwerksstruktur.js';

let pinia = null;
beforeEach(() => { localStorage.clear(); pinia = createPinia(); setActivePinia(pinia); });
afterEach(() => { vi.restoreAllMocks(); });

const baum = () => ({ category: 'IFCPROJECT', localId: 1, children: [
  { category: 'IFCSITE', localId: 2, children: [{ category: 'IFCGEOGRAPHICELEMENT', localId: 3, children: [] }] }] });

describe('IfcSpatialWindow — Auge je Modell, Abschnitt Eigenbau', () => {
  it('das Auge schaltet über die Engine; der Eigenbau heisst Eigenbau und bietet „Vorgang entfernen"', async () => {
    const verborgen = new Set();
    const api = {
      zoomToLocalId: vi.fn(async () => {}), setStoreyVisible: vi.fn(async () => {}),
      modellSichtbar: vi.fn((id) => !verborgen.has(id)),
      setzeModellSichtbar: vi.fn(async (id, an) => {
        if (an) verborgen.delete(id); else verborgen.add(id);
        useIfcStore().bumpSichtbarkeit();
      }),
      vorgangEntfernen: vi.fn(async () => true),
    };
    useIfcStore().setSpatialBaeume([
      ...baueBaeume({ baeume: [{ modelId: 'm1', name: 'Gelaende.ifc', wurzel: baum() }], index: [] }),
      eigenbauBaum({ modelId: 'cde-eigenbau', titel: new Map([['ab-1', 'Ur · Ausheben']]), karte: new Map([['cde-cut', 11]]),
                     stand: new Map([['cde-cut', { ableitung: 'ab-1', kategorie: 'IFCEARTHWORKSCUT', name: 'Ur · Ausheben · Aushub' }]]) }),
    ]);
    const Huelle = { setup() { provideViewerApi(api); return () => h(IfcSpatialWindow); } };
    const w = mount(Huelle, { global: { plugins: [pinia], stubs: { CdeIcon: { template: '<i />' } } } });
    await flushPromises();

    // vorher: „cde-eigenbau · lokal", ein leerer Knoten ohne Aufklapper
    expect(w.findAll('.sw-chip').map(c => c.text())).toEqual(['lokal', 'Eigenbau']);
    expect(w.findAll('.node-label').some(n => n.text() === 'Ur · Ausheben · Aushub')).toBe(true);

    const augen = w.findAll('.sw-auge');
    expect(augen).toHaveLength(2);                                          // vorher: kein Auge je Modell
    await augen[0].trigger('click');
    expect(api.setzeModellSichtbar).toHaveBeenCalledWith('m1', false);
    await flushPromises();
    expect(w.findAll('.sw-auge')[0].classes()).toContain('aus');

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await w.find('.entfernen-btn').trigger('click');
    await flushPromises();
    expect(api.vorgangEntfernen).toHaveBeenCalledWith('ab-1');
    w.unmount();
  });
});
