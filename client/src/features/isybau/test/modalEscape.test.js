import { describe, it, expect } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useIsybauStore } from '../store/index.js';
import { ESC_REIHENFOLGE, obersteOffene } from '../utils/modalEscape.js';

describe('Escape schliesst das oberste Modal', () => {
  it('gibt null zurueck, wenn nichts offen ist', () => {
    expect(obersteOffene({})).toBeNull();
    expect(obersteOffene(null)).toBeNull();
  });

  it('schliesst das einzige offene Modal', () => {
    expect(obersteOffene({ showKostraModal: true })).toBe('showKostraModal');
  });

  it('bevorzugt bei mehreren das weiter oben stehende', () => {
    // Bestaetigungsdialog ueber der Datenmaske: der Dialog weicht zuerst.
    expect(obersteOffene({ showPreprocessingModal: true, showEzgCrsModal: true }))
      .toBe('showEzgCrsModal');
  });

  it('weicht je Tastendruck nur einem Modal', () => {
    const ui = { showPreprocessingModal: true, showElementModal: true };
    const erstes = obersteOffene(ui);
    ui[erstes] = false;
    expect(erstes).toBe('showElementModal');
    expect(obersteOffene(ui)).toBe('showPreprocessingModal');
  });

  it('deckt GENAU die Modal-Flags des Stores ab', () => {
    // Waechter gegen ein neues Modal, das jemand hinzufuegt und hier vergisst -
    // es waere sonst das einzige, aus dem man nicht mit Escape herauskommt.
    setActivePinia(createPinia());
    const store = useIsybauStore();
    const imStore = Object.keys(store.ui).filter((k) => k.startsWith('show'));
    expect([...ESC_REIHENFOLGE].sort()).toEqual([...imStore].sort());
  });
});

describe('Escape gehoert zuerst dem aufgeklappten Auswahlfeld', () => {
  // Reihenfolge-Falle: der Escape-Lauscher von IsybauModals.vue haengt seit dem
  // Mounten des Fensters an window, der von PixelSelect.vue erst seit dem
  // Aufklappen der Liste — in derselben Capture-Phase kommt also das FENSTER
  // zuerst dran und wuerde sich schliessen, waehrend der Nutzer nur die Liste
  // wegklicken wollte. Deshalb weicht das Fenster von sich aus zurueck,
  // solange eine Liste im Dokument steht.
  it('die Rueckzugsbedingung steht im Escape-Handler', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/modals/IsybauModals.vue'), 'utf-8');
    const handler = src.slice(src.indexOf('const aufEscape'), src.indexOf('onMounted('));
    expect(handler).toContain(".isy-select-liste");
    // …und zwar VOR dem Schliessen, sonst ist die Reihenfolge wirkungslos.
    expect(handler.indexOf('.isy-select-liste')).toBeLessThan(handler.indexOf('obersteOffene'));
  });
});
