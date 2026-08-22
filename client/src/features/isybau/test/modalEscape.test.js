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
