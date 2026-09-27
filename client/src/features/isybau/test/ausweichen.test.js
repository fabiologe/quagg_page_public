import { describe, it, expect } from 'vitest';
import { ueberlappt, mussAusweichen, verschoben } from '../tutorial/ausweichen.js';

// Maße aus dem Browser (1600×1000, 2026-09-27): Blase 1158–1498 × 760–938,
// „Übernehmen“ der Datenmaske liegt darunter.
const blase = { left: 1158, top: 760, right: 1498, bottom: 938 };
const uebernehmen = { left: 1200, top: 850, right: 1330, bottom: 885 };
const startknopf = { left: 30, top: 745, right: 270, bottom: 785 };

describe('Ratte weicht ihrem Ziel aus', () => {
  it('überdeckt sie „Übernehmen“, weicht sie aus', () => {
    expect(mussAusweichen([blase], [uebernehmen])).toBe(true);
  });
  it('ein Ziel woanders (Berechnung starten links) lässt sie stehen', () => {
    expect(mussAusweichen([blase], [startknopf])).toBe(false);
  });
  it('unsichtbare Ziele (0×0) zählen nicht', () => {
    expect(mussAusweichen([blase], [{ left: 1300, top: 900, right: 1300, bottom: 900 }])).toBe(false);
  });
  it('Kanten berühren ist keine Überschneidung', () => {
    expect(ueberlappt(blase, { left: 1498, top: 800, right: 1600, bottom: 900 })).toBe(false);
  });
  it('am linken Platz wird der Stammplatz zurückgerechnet', () => {
    expect(verschoben({ left: 20, right: 360, top: 1, bottom: 2 }, 1138)).toEqual({ left: 1158, right: 1498, top: 1, bottom: 2 });
  });
});
