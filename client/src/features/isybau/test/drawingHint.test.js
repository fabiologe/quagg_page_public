import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingHint } from '../composables/useDrawingHint.js';

describe('useDrawingHint (Zeichen-Vorschau)', () => {
  let hint;
  beforeEach(() => {
    hint = useDrawingHint();
    hint.resetDrawingHint();
  });

  it('nimmt einen Umriss an und liefert ihn als Kamera-Ziel', () => {
    hint.showDrawingHint([{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 1 }]);
    expect(hint.hintPoints.value).toHaveLength(3);
    expect(hint.hintFocusTarget.value).toEqual({
      type: 'points',
      points: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 1 }],
    });
  });

  it('kopiert die Punkte, statt die Vorlage zu verlinken', () => {
    // Sonst wuerde ein spaeteres Verschieben der Schritt-Konstante die
    // laufende Vorschau still mitverdrehen.
    const vorlage = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
    hint.showDrawingHint(vorlage);
    vorlage[0].x = 999;
    expect(hint.hintPoints.value[0].x).toBe(1);
  });

  it('weist unbrauchbare Umrisse ab, statt Bruchstuecke zu zeigen', () => {
    hint.showDrawingHint([{ x: 1, y: 2 }]);
    expect(hint.hintPoints.value).toBeNull();
    hint.showDrawingHint([{ x: NaN, y: 2 }, { x: 3, y: 4 }]);
    expect(hint.hintPoints.value).toBeNull();
    hint.showDrawingHint(null);
    expect(hint.hintPoints.value).toBeNull();
    expect(hint.hintFocusTarget.value).toBeNull();
  });

  it('startet die Animation auch bei identischem Umriss neu', () => {
    const pts = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
    hint.showDrawingHint(pts);
    const ersteRunde = hint.hintToken.value;
    hint.showDrawingHint(pts);
    expect(hint.hintToken.value).toBeGreaterThan(ersteRunde);
  });

  it('clearDrawingHint loescht die Vorschau', () => {
    hint.showDrawingHint([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
    hint.clearDrawingHint();
    expect(hint.hintPoints.value).toBeNull();
  });
});
