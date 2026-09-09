// @vitest-environment jsdom
/**
 * Die Toolbox bei MEHRFACHAUSWAHL (B2-Befund, 2026-09-08).
 *
 * `mehrfach` las `herleitung.gruppen` ohne `.value` — im Skript ist die
 * Herleitung eine Computed. Seit 14.10 riss damit jede Mehrfachauswahl die
 * Toolbox beim Rendern (`undefined.flatMap`); kein Test hatte die Toolbox je
 * mit zwei Bauteilen gemountet (die Rahmenauswahl-Tests enden am Store).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/services/api', () => ({
  default: { get: vi.fn(async () => ({ data: {} })), post: vi.fn(async () => ({ data: {} })), put: vi.fn(async () => ({ data: {} })) },
}));

import CdeToolbox from '../components/CdeToolbox.vue';
import { provideViewerApi } from '../composables/viewerApi.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useIfcStore } from '../stores/useIfcStore.js';

const ROHR = (gid, localId) => ({ modelId: 'm1', localId, category: 'IFCPIPESEGMENT', type: 'IFCPIPESEGMENT', globalId: gid, name: gid,
    anker: { x: 10, y: 300, z: 0 }, bezugshoehe: 299.85, oberkante: 300.15, hoehenversatz: 0 });

/** Die Viewer-Fassade als Attrappe: jede Funktion existiert und gibt nichts zurück. */
const apiAttrappe = () => new Proxy({}, { get(t, k) { if (typeof k === 'symbol') return undefined; if (!(k in t)) t[k] = vi.fn(() => undefined); return t[k]; } });

let fehler = [];
let pinia = null;
beforeEach(() => {
  // EINE Pinia für Test und Komponente — sonst liest die Toolbox einen anderen Store.
  localStorage.clear(); pinia = createPinia(); setActivePinia(pinia); fehler = [];
  vi.spyOn(console, 'warn').mockImplementation((...a) => { fehler.push(a.map(String).join(' ')); });
  vi.spyOn(console, 'error').mockImplementation((...a) => { fehler.push(a.map(String).join(' ')); });
});
afterEach(() => { vi.restoreAllMocks(); });

function montiert() {
  const Huelle = { setup() { provideViewerApi(apiAttrappe()); return () => h(CdeToolbox); } };
  return mount(Huelle, { global: { plugins: [pinia], stubs: { CdeIcon: { template: '<i />' } } } });
}

describe('Toolbox mit zwei gewählten Bauteilen', () => {
  it('rendert „2 Bauteile gewählt" und nennt die mehrfachfähigen Werkzeuge — ohne Render-Fehler', async () => {
    const b = useBearbeitung();
    useIfcStore().modelList.push({ modelId: 'm1', name: 'test.ifc' });
    b.modusSetzen(true);
    await b.einordne(ROHR('H1', 42), null, { weitere: [ROHR('H2', 43)] });
    const w = montiert();
    await flushPromises();
    expect(b.bauteile).toHaveLength(2);
    const text = w.text();
    expect(text).toContain('2 Bauteile gewählt.');
    expect(text).toMatch(/Auf alle wirken: .*Kostengruppe/);
    expect(fehler.filter(f => /flatMap|TypeError|ReferenceError|\[Vue warn\]/.test(f))).toEqual([]);
    w.unmount();
  });

  it('ein Bauteil: keine Mehrfach-Auskunft', async () => {
    const b = useBearbeitung();
    useIfcStore().modelList.push({ modelId: 'm1', name: 'test.ifc' });
    b.modusSetzen(true);
    await b.einordne(ROHR('H1', 42), null);
    const w = montiert();
    await flushPromises();
    expect(w.find('.tb-mehrfach').exists()).toBe(false);
    expect(fehler.filter(f => /TypeError|ReferenceError|\[Vue warn\]/.test(f))).toEqual([]);
    w.unmount();
  });
});
