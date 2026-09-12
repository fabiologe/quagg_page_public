// @vitest-environment jsdom
/**
 * Ein Werkzeug wählen heißt bearbeiten (Kassensturz E4 / H2, 2026-09-12).
 *
 * Vorher war jeder Werkzeugknopf ohne Bearbeiten-Modus grau: „Bearbeiten ist
 * aus — oben einschalten (oder E)". Jetzt schaltet das Werkzeug selbst ein —
 * über den Viewer, der die echten Sperren kennt (kein Modell, Millimeter,
 * Published). Grau bleibt ein Knopf nur mit so einem Grund, und der steht als
 * Zeile da. Geprüft an der echten Tafel „Bauteil" und an der Pille.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/services/api', () => ({
  default: { get: vi.fn(async () => ({ data: {} })), post: vi.fn(async () => ({ data: {} })), put: vi.fn(async () => ({ data: {} })) },
}));

import CdeToolbox from '../components/CdeToolbox.vue';
import CdeHudLayer from '../components/CdeHudLayer.vue';
import { provideViewerApi } from '../composables/viewerApi.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useIfcStore } from '../stores/useIfcStore.js';

const ROHR = { modelId: 'm1', localId: 42, category: 'IFCPIPESEGMENT', type: 'IFCPIPESEGMENT', globalId: 'H1', name: 'H1',
  anker: { x: 10, y: 300, z: 0 }, bezugshoehe: 299.85, oberkante: 300.15, hoehenversatz: 0 };

const STUBS = { CdeIcon: { template: '<i />' }, IfcSidebar: { template: '<div class="sidebar-attrappe" />' } };

let pinia;
beforeEach(() => { localStorage.clear(); pinia = createPinia(); setActivePinia(pinia); });
afterEach(() => { vi.restoreAllMocks(); });

/** Der Viewer als Attrappe — mit DERSELBEN Verdrahtung wie IfcViewer.werkzeugStarten. */
function viewerAttrappe({ sperrgrund = null } = {}) {
  const b = useBearbeitung();
  const ein = () => (sperrgrund ? false : b.modusSetzen(true));
  return {
    werkzeugStarten: vi.fn((id, opts = {}) => b.starteMitModus(id, { ...opts, einschalten: ein })),
    bearbeitenEin: vi.fn(ein),
    bearbeitenSperrgrund: vi.fn(() => sperrgrund),
  };
}

async function eingeordnet() {
  const b = useBearbeitung();
  useIfcStore().modelList.push({ modelId: 'm1', name: 'test.ifc' });
  await b.einordne(ROHR, null);
  return b;
}

function tafel(api) {
  const Huelle = { setup() { provideViewerApi(api); return () => h(CdeToolbox); } };
  return mount(Huelle, { global: { plugins: [pinia], stubs: STUBS } });
}

describe('useBearbeitung.starteMitModus', () => {
  it('ohne Modus: erst einschalten, dann starten', async () => {
    const b = await eingeordnet();
    const ein = vi.fn(() => b.modusSetzen(true));
    expect(b.starteMitModus('kg-setzen', { einschalten: ein })).toBe(true);
    expect(ein).toHaveBeenCalledTimes(1);
    expect(b.scharfId).toBe('kg-setzen');
  });

  it('lehnt der Viewer ab, startet nichts — und ein Grund steht da', async () => {
    const b = await eingeordnet();
    expect(b.starteMitModus('kg-setzen', { einschalten: () => false })).toBe(false);
    expect(b.modusAn).toBe(false);
    expect(b.scharfId).toBeNull();
    expect(b.letzterGrund).toBeTruthy();
  });

  it('im Modus fragt es den Einschalter gar nicht erst', async () => {
    const b = await eingeordnet();
    b.modusSetzen(true);
    const ein = vi.fn();
    expect(b.starteMitModus('kg-setzen', { einschalten: ein })).toBe(true);
    expect(ein).not.toHaveBeenCalled();
  });
});

describe('Die Tafel „Bauteil" ohne Bearbeiten-Modus', () => {
  it('kein Werkzeugknopf ist grau, und ein Klick startet über den Viewer', async () => {
    const b = await eingeordnet();
    const api = viewerAttrappe();
    const w = tafel(api);
    await flushPromises();
    const knoepfe = w.findAll('.tb-gruppe .tb-btn');
    expect(knoepfe.length).toBeGreaterThan(0);
    expect(knoepfe.filter(k => k.attributes('disabled') !== undefined)).toHaveLength(0);

    await knoepfe.find(k => k.text().includes('Kostengruppe')).trigger('click');
    expect(api.werkzeugStarten).toHaveBeenCalledWith('kg-setzen', {});
    expect(b.modusAn).toBe(true);
    expect(b.scharfId).toBe('kg-setzen');
    w.unmount();
  });

  it('mit einem echten Grund: grau — und der Grund steht als Zeile da, nicht nur im Tooltip', async () => {
    await eingeordnet();
    const grund = 'Modell in Millimetern — Bearbeitung gesperrt.';
    const w = tafel(viewerAttrappe({ sperrgrund: grund }));
    await flushPromises();
    expect(w.find('.tb-sperre').text()).toContain('Millimetern');
    const knoepfe = w.findAll('.tb-gruppe .tb-btn');
    expect(knoepfe.every(k => k.attributes('disabled') !== undefined)).toBe(true);
    expect(knoepfe[0].attributes('title')).toBe(grund);
    w.unmount();
  });

  it('erst die Handlung, dann die Erklärung: Werkzeuge, Merkmale, dann „Warum?" (zu)', async () => {
    await eingeordnet();
    useIfcStore().setElement(ROHR);
    const w = tafel(viewerAttrappe());
    await flushPromises();
    const html = w.html();
    expect(html.indexOf('tb-gruppe')).toBeLessThan(html.indexOf('tb-merkmale'));
    expect(html.indexOf('tb-merkmale')).toBeLessThan(html.indexOf('tb-herleitung'));
    expect(w.find('.tb-merkmale .sidebar-attrappe').exists()).toBe(true);
    expect(w.find('.tb-herleitung').attributes('open')).toBeUndefined();
    // Der Modus-Schalter der alten Toolbox ist weg — E und die Werkzeugleiste bleiben.
    expect(w.find('.tb-modus').exists()).toBe(false);
    w.unmount();
  });
});

describe('Die Pille ohne Bearbeiten-Modus', () => {
  it('zeigt die Werkzeuge und startet über den Viewer', async () => {
    const b = await eingeordnet();
    const api = viewerAttrappe();
    const Huelle = {
      setup() {
        provideViewerApi(api);
        return () => h(CdeHudLayer, { element: ROHR, elementAnker: [10, 300, 0], projectToScreen: () => ({ x: 100, y: 100 }) });
      },
    };
    const w = mount(Huelle, { global: { plugins: [pinia], stubs: STUBS } });
    await w.find('.hud-pille').trigger('click');
    const kg = w.findAll('.hud-bearb-btn').find(k => k.text().includes('Kostengruppe'));
    expect(kg).toBeTruthy();
    await kg.trigger('click');
    expect(api.werkzeugStarten).toHaveBeenCalledWith('kg-setzen');
    expect(b.scharfId).toBe('kg-setzen');
    w.unmount();
  });
});
