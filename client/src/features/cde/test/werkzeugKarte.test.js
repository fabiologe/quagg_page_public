// @vitest-environment jsdom
/**
 * Teil XXX, B1 — das Formular steht in der Tafel, das Bild bleibt frei (Fabios E-B1).
 *
 * Messlauf B0: beim Zeichnen deckte die Kontextleiste mit elf Feldern 85,7 % des mittleren Bilddrittels, zwei Klicks in
 * die Bildmitte trafen das Formular. Jetzt zeigt die Tafel „Bauteil" die Werkzeugkarte, die Leiste unter dem Bild nur
 * eine Zeile. Montiert WIE IN DER APP: Tafel und Leiste sind GESCHWISTER (die Seite baut die Panels, nicht der Viewer)
 * — die Karte kommt über die Viewer-Schnittstelle. (Ein erster Versuch mit `provide` aus dem Viewer war im Test grün
 * und in der App wirkungslos: dort ist die Tafel kein Kind des Viewers.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, h, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/services/api', () => ({
  default: { get: vi.fn(async () => ({ data: {} })), post: vi.fn(async () => ({ data: {} })), put: vi.fn(async () => ({ data: {} })) },
}));

import CdeToolbox from '../components/CdeToolbox.vue';
import CdeKontextleiste from '../components/CdeKontextleiste.vue';
import { provideViewerApi } from '../composables/viewerApi.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useIfcStore } from '../stores/useIfcStore.js';

let pinia = null;
beforeEach(() => { localStorage.clear(); pinia = createPinia(); setActivePinia(pinia); });
afterEach(() => { vi.restoreAllMocks(); });

function montiert({ mitTafel = true } = {}) {
  const inTafel = ref(0);
  const uebernehmen = vi.fn();
  const karte = { inTafel, motor: null, chips: computed(() => [{ art: 'neu', text: '1 neues Bauteil' }]), profile: computed(() => []),
                  uebernehmen, geste: vi.fn(), gesteAb: vi.fn() };
  const api = new Proxy({ werkzeugKarte: karte }, { get(t, k) { if (typeof k === 'symbol') return undefined; if (!(k in t)) t[k] = vi.fn(() => undefined); return t[k]; } });
  const tafelDa = ref(mitTafel);
  const Seite = { setup() {
    provideViewerApi(api);
    // Wie IfcViewer: schmal nur, wenn die Tafel offen ist UND die Karte zeigt.
    return () => h('div', [tafelDa.value ? h(CdeToolbox) : null, h(CdeKontextleiste, { kompakt: inTafel.value > 0 })]);
  } };
  const w = mount(Seite, { global: { plugins: [pinia], stubs: { CdeIcon: { template: '<i />' } } } });
  return { w, inTafel, uebernehmen, tafelDa };
}

describe('Teil XXX, B1 — die Werkzeugkarte in der Tafel', () => {
  it('beim Zeichnen: das Formular steht in der Tafel, unter dem Bild nur eine Zeile mit Übernehmen', async () => {
    const b = useBearbeitung();
    useIfcStore().modelList.push({ modelId: 'm1', name: 'test.ifc' });
    b.modusSetzen(true);
    const { w, inTafel, uebernehmen } = montiert();
    b.starte('wand-zeichnen');
    await flushPromises();
    expect(inTafel.value).toBe(1);
    const tafel = w.find('.tb'), leiste = w.find('.modus-leiste');
    // Die Felder der Wand stehen in der Tafel …
    expect(tafel.text()).toContain('Dicke');
    expect(tafel.text()).toContain('Wandhöhe');
    expect(tafel.find('.kl-chip').text()).toBe('1 neues Bauteil');
    // … und nicht unter dem Bild: dort nur Werkzeug, Schritt, Übernehmen, Abbrechen.
    expect(leiste.text()).not.toContain('Dicke');
    expect(leiste.classes()).not.toContain('modus-leiste--werkzeug');
    expect(leiste.find('.kl-zeile').exists()).toBe(true);
    await leiste.find('.kl-zeile .modus-fertig').trigger('click');
    expect(uebernehmen).not.toHaveBeenCalled();   // die Leiste meldet „uebernehmen" an den Viewer, nicht an die Karte
    expect(w.findComponent(CdeKontextleiste).emitted('uebernehmen')).toHaveLength(1);
    w.unmount();
  });

  it('ohne Tafel (zugeklappt, Tablet) bleibt das Formular in der Leiste — nie nirgends', async () => {
    const b = useBearbeitung();
    useIfcStore().modelList.push({ modelId: 'm1', name: 'test.ifc' });
    b.modusSetzen(true);
    const { w, inTafel, tafelDa } = montiert();
    b.starte('wand-zeichnen');
    await flushPromises();
    tafelDa.value = false;
    await flushPromises();
    expect(inTafel.value).toBe(0);
    const leiste = w.find('.modus-leiste');
    expect(leiste.text()).toContain('Dicke');
    expect(leiste.classes()).toContain('modus-leiste--werkzeug');
    w.unmount();
  });
});
