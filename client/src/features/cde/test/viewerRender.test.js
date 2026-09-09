// @vitest-environment jsdom
/**
 * Der Viewer RENDERT (Teil XVI, Nachprüfung).
 *
 * „SFC übersetzt sauber" heisst nicht „läuft": ein nicht existierender
 * Bezeichner im Setup hat diese Ansicht schon einmal komplett gekillt. Die
 * Suite mountet den Viewer deshalb wirklich — Setup-Skript, Template,
 * Watcher, Tastatur —, mit einer Engine-Attrappe, die jede Methode kennt
 * und nichts tut. WebGL gibt es nicht, alles andere schon: der Modus, die
 * scharfe Bearbeitung, die Kontextleiste, die Vorschau, Messen.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/services/api', () => ({
  default: { get: vi.fn(async () => ({ data: {} })), post: vi.fn(async () => ({ data: {} })), put: vi.fn(async () => ({ data: {} })) },
}));

/** Die Engine als Attrappe: jede Methode existiert, tut nichts, gibt undefined. */
const instanzen = [];
vi.mock('../services/IfcEngine.js', () => ({
  IfcEngine: class {
    constructor() {
      const ziel = {};
      const p = new Proxy(ziel, {
        get(t, k) {
          if (typeof k === 'symbol' || k === 'then') return undefined;
          if (!(k in t)) t[k] = vi.fn(() => undefined);
          return t[k];
        },
      });
      instanzen.push(p);
      return p;
    }
  },
}));

import IfcViewer from '../components/IfcViewer.vue';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useIfcStore } from '../stores/useIfcStore.js';

const STUBS = {
  IfcLayerPanel: true, CdeCommandPalette: true, IfcStoreyNav: true, IfcSavedViews: true,
  IfcAnnotationOverlay: true, IfcShortcutsOverlay: true, IfcLoadOverlay: true,
};

const ROHR = {
  modelId: 'm1', localId: 42, category: 'IFCPIPESEGMENT', globalId: 'H1', name: 'H1',
  anker: { x: 10, y: 300, z: 0 }, bezugshoehe: 299.85, oberkante: 300.15, hoehenversatz: 0,
  box: { min: { x: 0, y: 299.85, z: -0.15 }, max: { x: 20, y: 300.15, z: 0.15 } },
};

let warnungen = [];
let fehler = [];
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  instanzen.length = 0;
  warnungen = []; fehler = [];
  vi.spyOn(console, 'warn').mockImplementation((...a) => { warnungen.push(a.map(String).join(' ')); });
  vi.spyOn(console, 'error').mockImplementation((...a) => { fehler.push(a.map(String).join(' ')); });
});
afterEach(() => { vi.restoreAllMocks(); });

const taste = (key) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

async function montiert() {
  const w = mount(IfcViewer, { attachTo: document.body, global: { plugins: [createPinia()], stubs: STUBS } });
  await flushPromises();
  return w;
}

/** Nur die Warnungen, die etwas Kaputtes anzeigen — nicht die erwarteten Hinweise der Attrappe. */
const vueWarnungen = () => warnungen.filter(w => /\[Vue warn\]|ReferenceError|TypeError|is not defined|Cannot read/.test(w));
const echteFehler = () => fehler.filter(f => /ReferenceError|TypeError|is not defined|Cannot read/.test(f));

describe('Der Viewer mountet und lebt', () => {
  it('rendert ohne Vue-Warnung, mit Canvas-Wurzel und dem Zeiger in Ruhe', async () => {
    const w = await montiert();
    expect(vueWarnungen()).toEqual([]);
    expect(echteFehler()).toEqual([]);
    const root = w.find('.canvas-root');
    expect(root.exists()).toBe(true);
    expect(root.classes()).toContain('zeiger--auswahl');
    expect(instanzen).toHaveLength(1);
    expect(instanzen[0].init).toHaveBeenCalledTimes(1);
    expect(w.find('.toolbox').exists()).toBe(true);
    w.unmount();
    expect(instanzen[0].dispose).toHaveBeenCalled();
  });

  it('E ohne Modell nennt den Sperrgrund — mit Modell beginnt die Sitzung', async () => {
    const w = await montiert();
    taste('e');
    await flushPromises();
    expect(w.text()).toContain('Erst ein Modell laden');
    const b = useBearbeitung();
    expect(b.modusAn).toBe(false);

    useIfcStore().modelList.push({ modelId: 'm1', name: 'test.ifc' });
    await flushPromises();
    taste('e');
    await flushPromises();
    expect(b.modusAn).toBe(true);
    expect(w.find('.bearb-rahmen').exists()).toBe(true);
    expect(vueWarnungen()).toEqual([]);
    w.unmount();
  });

  it('eine scharfe Bearbeitung öffnet die Kontextleiste, stellt das Fadenkreuz und zeichnet die Vorschau', async () => {
    vi.useFakeTimers();
    const w = await montiert();
    const b = useBearbeitung();
    useIfcStore().modelList.push({ modelId: 'm1', name: 'test.ifc' });
    b.modusSetzen(true);
    await b.einordne(ROHR, null);
    expect(b.starte('bezugshoehe-setzen', { subjekt: ROHR })).toBe(true);
    b.setzeWert('hoehe', 305);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(120);
    await flushPromises();

    // Ein Formular-Werkzeug zeigt auf nichts: KEIN Fadenkreuz (S6 — sonst
    // streiten Griffkugel und Zielring). Das Fadenkreuz gehört Zug und Geste.
    expect(w.find('.canvas-root').classes()).not.toContain('zeiger--werkzeug');
    const leiste = w.find('.modus-leiste');
    expect(leiste.exists()).toBe(true);
    expect(leiste.classes()).toContain('modus-leiste--werkzeug');
    expect(leiste.text()).toContain('Bezugshöhe setzen');
    expect(leiste.find('.bearb-form').exists()).toBe(true);
    expect(leiste.text()).toContain('ΔH');                         // der Vorschau-Chip
    const e = instanzen[0];
    expect(e.overlayZeige).toHaveBeenCalledWith('vorschau', expect.arrayContaining([expect.objectContaining({ art: 'box' })]));

    b.abbrechen();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(120);
    expect(w.find('.modus-leiste').exists()).toBe(false);
    expect(w.find('.canvas-root').classes()).toContain('zeiger--auswahl');
    expect(e.overlayLeere).toHaveBeenCalledWith('vorschau');
    expect(vueWarnungen()).toEqual([]);
    expect(echteFehler()).toEqual([]);
    w.unmount();
    vi.useRealTimers();
  });

  it('ein Werkzeug OHNE Zug, aber mit Punkt-Geste zeigt den Gesten-Knopf, bevor der Motor sammelt', async () => {
    // „Haltung teilen": kein Zug, die Station ist ein Feld mit Geste `punkt`.
    // Der Knopf startet den Motor erst — er muss also da sein, solange die
    // Phase noch `aus` ist (Headless-Lauf 2026-09-08: er fehlte).
    vi.useFakeTimers();
    const w = await montiert();
    const b = useBearbeitung();
    useIfcStore().modelList.push({ modelId: 'm1', name: 'test.ifc' });
    b.modusSetzen(true);
    const rohr = { ...ROHR, achse: { anfang: { x: 0, y: 300, z: 0 }, ende: { x: 20, y: 299.9, z: 0 },
      polyline: [{ x: 0, y: 300, z: 0 }, { x: 20, y: 299.9, z: 0 }], laenge: 20 } };
    await b.einordne(rohr, null);
    expect(b.starte('haltung-teilen', { subjekt: rohr })).toBe(true);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(120);
    expect(b.eingabe.phase).toBe('aus');
    const knopf = w.find('.modus-leiste .kl-geste');
    expect(knopf.exists()).toBe(true);
    expect(knopf.text()).toContain('auf der Achse zeigen');
    await knopf.trigger('click');
    await flushPromises();
    expect(b.eingabe.geste?.feld).toBe('station');
    expect(w.find('.modus-leiste .kl-geste-hinweis').exists()).toBe(true);
    b.abbrechen();
    await flushPromises();
    expect(vueWarnungen()).toEqual([]);
    expect(echteFehler()).toEqual([]);
    w.unmount();
    vi.useRealTimers();
  });

  it('Messen über die Werkzeugleiste: Leiste mit Hinweis und Fertig, Cursor-Klasse messen', async () => {
    const w = await montiert();
    const knopf = w.findAll('.toolbox .tool-btn').find(k => /Strecke messen/.test(k.attributes('title') ?? ''));
    expect(knopf).toBeTruthy();
    await knopf.trigger('click');
    await flushPromises();
    expect(w.find('.canvas-root').classes()).toContain('zeiger--messen');
    const leiste = w.find('.modus-leiste');
    expect(leiste.text()).toContain('Ersten Punkt antippen');
    await leiste.find('.modus-fertig').trigger('click');
    await flushPromises();
    expect(w.find('.modus-leiste').exists()).toBe(false);
    expect(w.find('.canvas-root').classes()).toContain('zeiger--auswahl');
    expect(vueWarnungen()).toEqual([]);
    w.unmount();
  });

  it('Esc geht durch den Slot: die scharfe Bearbeitung fällt, die Leiste verschwindet', async () => {
    const w = await montiert();
    const b = useBearbeitung();
    useIfcStore().modelList.push({ modelId: 'm1', name: 'test.ifc' });
    b.modusSetzen(true);
    await b.einordne(ROHR, null);
    b.starte('bezugshoehe-setzen', { subjekt: ROHR });
    await flushPromises();
    expect(w.find('.modus-leiste').exists()).toBe(true);
    taste('Escape');
    await flushPromises();
    expect(b.scharfId).toBeNull();
    expect(b.werkzeug).toBeNull();
    expect(w.find('.modus-leiste').exists()).toBe(false);
    w.unmount();
  });
});
