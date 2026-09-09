// @vitest-environment jsdom
/**
 * Die Composables der Viewer-Schale (Sprint I, Stufe 5).
 *
 * `IfcViewer.vue` hatte 824 Zeilen `setup` mit neun Belangen nebeneinander:
 * Dateiladen, IndexedDB-Ablage, Schnitt, Messen, Annotationen,
 * Geschoss-Navigation, Maus, Tastatur, zuletzt geöffnete Modelle. Geprüft war
 * davon nichts — die Komponente braucht WebGL.
 *
 * Herausgelöst nach dem Hausstil (`flood-2D/composables/useSectionTool.js`):
 * Optionsobjekt herein, flaches Objekt aus Refs und Handlern heraus, Zustand
 * in den Store. Was jetzt prüfbar ist, ist genau das, was vorher im Dunkeln lag.
 *
 * Die Engine wird durch eine Attrappe ersetzt. Das reicht: die Composables
 * rufen sie nur, sie rechnen nicht mit ihr.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';
import { useSchnitt } from '../composables/useSchnitt';
import { useMessen, formatiereLaenge } from '../composables/useMessen';
import { fmtBytes, fmtDate } from '../composables/useModellAblage';
import { useIfcStore } from '../stores/useIfcStore';

/** Engine-Attrappe: zählt Aufrufe und liefert Stellungen zurück. */
function attrappe(over = {}) {
  return {
    createSectionCut: vi.fn(() => true),
    deleteSectionCuts: vi.fn(),
    setSectionChangeCallback: vi.fn(),
    setSectionGizmoVisible: vi.fn(),
    setSectionMode: vi.fn(),
    snapSectionTo: vi.fn(),
    resetSection: vi.fn(),
    getSectionPosition: vi.fn(() => ({ x: 1, y: 2, z: 3 })),
    enableMeasureMode: vi.fn(),
    disableMeasureMode: vi.fn(),
    clearMeasurements: vi.fn(),
    addMeasurePoint: vi.fn(),
    updateMeasureHover: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('useSchnitt', () => {
  it('legt beim ersten Umschalten an und räumt beim zweiten ab', () => {
    const e = attrappe();
    const s = useSchnitt({ engine: ref(e) });
    expect(s.aktiv.value).toBe(false);

    s.umschalten();
    expect(e.createSectionCut).toHaveBeenCalled();
    expect(s.aktiv.value).toBe(true);
    expect(s.leisteOffen.value).toBe(true);
    expect(s.position.value).toEqual({ x: 1, y: 2, z: 3 });

    s.umschalten();
    expect(e.deleteSectionCuts).toHaveBeenCalled();
    expect(e.setSectionChangeCallback).toHaveBeenLastCalledWith(null);
    expect(s.aktiv.value).toBe(false);
    expect(s.position.value).toBeNull();
  });

  it('bleibt aus, wenn die Engine keinen Schnitt anlegen kann', () => {
    // Ohne Modell gibt createSectionCut nichts zurück — die Leiste darf dann
    // nicht erscheinen und behaupten, es gäbe einen Schnitt.
    const s = useSchnitt({ engine: ref(attrappe({ createSectionCut: vi.fn(() => null) })) });
    s.umschalten();
    expect(s.aktiv.value).toBe(false);
    expect(s.leisteOffen.value).toBe(false);
  });

  it('meldet die Rückmeldung genau einmal an — nicht an zwei Stellen', () => {
    // Der behobene Fehler: die Registrierung stand doppelt im Viewer.
    const e = attrappe();
    const s = useSchnitt({ engine: ref(e) });
    s.umschalten();
    const rueckruf = e.setSectionChangeCallback.mock.calls.at(-1)[0];
    e.getSectionPosition.mockReturnValue({ x: 9, y: 9, z: 9 });
    rueckruf();
    expect(s.position.value).toEqual({ x: 9, y: 9, z: 9 });
  });

  it('blendet nur die Leiste aus — die Ebene schneidet weiter', () => {
    const e = attrappe();
    const s = useSchnitt({ engine: ref(e) });
    s.umschalten();
    s.leisteAusblenden();
    expect(s.leisteOffen.value).toBe(false);
    expect(s.aktiv.value).toBe(true);                       // Ebene bleibt
    expect(e.setSectionGizmoVisible).toHaveBeenCalledWith(false);
    expect(e.deleteSectionCuts).not.toHaveBeenCalled();
  });

  it('übernimmt die Stellung, die die Engine beim Geschosswechsel gesetzt hat', () => {
    const e = attrappe();
    const s = useSchnitt({ engine: ref(e) });
    s.uebernehmeVonEngine();
    expect(s.aktiv.value).toBe(true);
    expect(s.position.value).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('verwirft still, wenn gar kein Schnitt da war', () => {
    const e = attrappe();
    const s = useSchnitt({ engine: ref(e) });
    s.verwerfen();
    expect(e.deleteSectionCuts).not.toHaveBeenCalled();
  });
});

describe('useMessen', () => {
  function bau(engineOver = {}) {
    const ifc = useIfcStore();
    const selection = { setMode: vi.fn() };
    const e = attrappe(engineOver);
    return { e, ifc, selection, m: useMessen({ engine: ref(e), ifc, selection: () => selection }) };
  }

  it('rührt den Auswahl-Modus NICHT an — den leitet der Viewer aus allen Werkzeugen ab (Teil XVI)', async () => {
    // Vorher schaltete Messen die Auswahl selbst auf „disabled". Mit der
    // scharfen Bearbeitung als drittem Zustand wären das drei Schreiber auf
    // einen Modus — der letzte hätte gewonnen. Jetzt gibt es EINE Ableitung
    // (`auswahlModusNachziehen` im Viewer); der Tipp kommt als Verbraucher an.
    const { e, selection, m } = bau();
    m.umschalten();
    expect(e.enableMeasureMode).toHaveBeenCalled();
    m.umschalten();
    expect(selection.setMode).not.toHaveBeenCalled();
  });

  it('legt die fertige Strecke im Store ab, nicht bei sich', async () => {
    const { ifc, m } = bau({
      addMeasurePoint: vi.fn(async () => ({
        phase: 'complete', dist: 5,
        p1: { x: 0, y: 0, z: 0 }, p2: { x: 3, y: 0, z: 4 },
      })),
    });
    await ifc.ready;
    m.umschalten();
    expect(await m.klick(10, 10)).toBe(true);
    expect(ifc.messungen).toHaveLength(1);
    expect(ifc.messungen[0].dist).toBe(5);
  });

  it('verbraucht den Klick nur im Messmodus', async () => {
    const { m } = bau();
    expect(await m.klick(10, 10)).toBe(false);
  });

  it('meldet, wenn kein Bauteil getroffen wurde', async () => {
    const { m } = bau({ addMeasurePoint: vi.fn(async () => ({ phase: 'no-hit' })) });
    m.umschalten();
    await m.klick(1, 1);
    expect(m.meldung.value.text).toMatch(/Kein Treffer/);
  });

  it('beendet nur, wenn es läuft', () => {
    const { e, m } = bau();
    m.beenden();
    expect(e.disableMeasureMode).not.toHaveBeenCalled();
    m.umschalten();
    m.beenden();
    expect(e.disableMeasureMode).toHaveBeenCalled();
    expect(m.aktiv.value).toBe(false);
  });
});

describe('Anzeigeformate', () => {
  it('wählt die Einheit nach Größenordnung', () => {
    expect(formatiereLaenge(0.045)).toBe('45 mm');
    expect(formatiereLaenge(2.5)).toBe('2.500 m');
    expect(formatiereLaenge(42.123)).toBe('42.12 m');
  });

  it('rundet Dateigrößen lesbar', () => {
    expect(fmtBytes(0)).toBe('');
    expect(fmtBytes(-1)).toBe('');
    expect(fmtBytes(2048)).toBe('2 kB');
    expect(fmtBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('kommt mit fehlendem Datum klar', () => {
    expect(fmtDate(null)).toBe('');
    expect(fmtDate(0)).toBe('');
    expect(fmtDate(Date.UTC(2026, 7, 29))).toMatch(/29\.08\.26/);
  });
});
