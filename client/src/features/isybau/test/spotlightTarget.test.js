import { describe, it, expect } from 'vitest';
import { resolveSpotlightTarget, scaleForRadius, centerTransform } from '../utils/spotlightTarget.js';

const nodes = new Map([
  ['K1', { id: 'K1', x: 100, y: 200 }],
  ['K2', { id: 'K2', x: 140, y: 200, diameter: 3 }],
  ['KAPUTT', { id: 'KAPUTT', x: NaN, y: 200 }],
]);
const edges = new Map([
  ['H1', { id: 'H1', fromNodeId: 'K1', toNodeId: 'K2' }],
  ['H2', { id: 'H2', fromNodeId: 'K1', toNodeId: 'K2',
           coords: [{ x: 100, y: 200 }, { x: 100, y: 260 }] }],
  ['H_TOT', { id: 'H_TOT', fromNodeId: 'FEHLT', toNodeId: 'AUCHWEG' }],
]);
const areas = [
  { id: 'F1', points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] },
  { id: 'F_LEER', points: [] },
];
const all = { nodes, edges, areas };

describe('resolveSpotlightTarget — Knoten', () => {
  it('zentriert auf den Knoten', () => {
    const t = resolveSpotlightTarget({ type: 'node', id: 'K1' }, all);
    expect(t.x).toBe(100);
    expect(t.y).toBe(200);
  });

  it('haelt einen Mindestradius, damit der Ring sichtbar bleibt', () => {
    const t = resolveSpotlightTarget({ type: 'node', id: 'K1' }, all);
    expect(t.radius).toBeGreaterThan(0);
  });

  it('nutzt den Schachtdurchmesser, wenn er groesser als der Mindestradius ist', () => {
    const t = resolveSpotlightTarget({ type: 'node', id: 'K2' }, all, { minRadius: 0.5 });
    expect(t.radius).toBe(1.5); // diameter 3 / 2
  });
});

describe('resolveSpotlightTarget — Haltungen', () => {
  it('zentriert auf die Mitte zwischen den Endknoten', () => {
    const t = resolveSpotlightTarget({ type: 'edge', id: 'H1' }, all);
    expect(t.x).toBe(120);
    expect(t.y).toBe(200);
  });

  it('umschliesst die halbe Laenge', () => {
    const t = resolveSpotlightTarget({ type: 'edge', id: 'H1' }, all);
    expect(t.radius).toBeCloseTo(20, 6);
  });

  it('bevorzugt die eigene Polylinie vor den Endknoten', () => {
    const t = resolveSpotlightTarget({ type: 'edge', id: 'H2' }, all);
    expect(t.x).toBe(100);
    expect(t.y).toBe(230);
  });

  it('gibt null zurueck, wenn beide Endknoten fehlen', () => {
    expect(resolveSpotlightTarget({ type: 'edge', id: 'H_TOT' }, all)).toBeNull();
  });
});

describe('resolveSpotlightTarget — Flaechen', () => {
  it('zentriert auf den Schwerpunkt', () => {
    const t = resolveSpotlightTarget({ type: 'area', id: 'F1' }, all);
    expect(t.x).toBe(10);
    expect(t.y).toBe(10);
  });

  it('umschliesst alle Eckpunkte', () => {
    const t = resolveSpotlightTarget({ type: 'area', id: 'F1' }, all);
    expect(t.radius).toBeCloseTo(Math.hypot(10, 10), 6);
  });

  it('gibt null zurueck bei einer Flaeche ohne Punkte', () => {
    expect(resolveSpotlightTarget({ type: 'area', id: 'F_LEER' }, all)).toBeNull();
  });
});

describe('resolveSpotlightTarget — Robustheit', () => {
  it('ohne Referenz oder bei unbekannter ID: null', () => {
    expect(resolveSpotlightTarget(null, all)).toBeNull();
    expect(resolveSpotlightTarget({ type: 'node', id: 'GIBTESNICHT' }, all)).toBeNull();
    expect(resolveSpotlightTarget({ type: 'quatsch', id: 'K1' }, all)).toBeNull();
  });

  it('ignoriert Elemente mit ungueltigen Koordinaten', () => {
    expect(resolveSpotlightTarget({ type: 'node', id: 'KAPUTT' }, all)).toBeNull();
  });

  it('kommt mit fehlenden Sammlungen klar', () => {
    expect(() => resolveSpotlightTarget({ type: 'node', id: 'K1' }, {})).not.toThrow();
    expect(resolveSpotlightTarget({ type: 'node', id: 'K1' }, {})).toBeNull();
  });
});

describe('scaleForRadius', () => {
  it('zoomt naeher heran, je kleiner das Ziel ist', () => {
    const klein = scaleForRadius(2, 100);
    const gross = scaleForRadius(20, 100);
    expect(klein).toBeGreaterThan(gross);
  });

  it('bleibt in den Grenzen', () => {
    expect(scaleForRadius(0.0001, 100, { max: 60 })).toBe(60);
    expect(scaleForRadius(100000, 100, { min: 0.2 })).toBe(0.2);
  });

  it('gibt bei unsinnigen Eingaben null zurueck', () => {
    expect(scaleForRadius(0, 100)).toBeNull();
    expect(scaleForRadius(5, 0)).toBeNull();
    expect(scaleForRadius(NaN, 100)).toBeNull();
  });
});

describe('centerTransform — Beweis gegen die alte, kaputte Formel', () => {
  // Bildet EXAKT die Transformation aus IsybauViewer.vue nach:
  //   translate(cx+tx, cy+ty) scale(s) translate(-cx, -cy)
  // Ein lokaler Punkt P landet damit bei (cx+tx) + s*(P-cx).
  const applyViewerTransform = (localPoint, bounds, scale, tx, ty) => ({
    x: (bounds.centerX + tx) + scale * (localPoint.x - bounds.centerX),
    y: (bounds.centerY + ty) + scale * (localPoint.y - bounds.centerY),
  });

  const toLocal = (world, bounds) => ({
    x: world.x - bounds.minX,
    y: bounds.maxY - world.y,
  });

  const bounds = { minX: 100, maxY: 500, width: 200, height: 160, centerX: 100, centerY: 80 };

  it.each([1, 2, 8, 25, 60])('zentriert das Ziel exakt bei scale=%s', (scale) => {
    const world = { x: 137, y: 412 };
    const { translateX, translateY } = centerTransform(world, bounds, scale);
    const screen = applyViewerTransform(toLocal(world, bounds), bounds, scale, translateX, translateY);

    expect(screen.x).toBeCloseTo(bounds.centerX, 9);
    expect(screen.y).toBeCloseTo(bounds.centerY, 9);
  });

  it('die alte Formel (ohne scale-Faktor) verfehlt die Mitte deutlich', () => {
    // Regressionsnachweis: genau dieser fehlende Faktor war die Ursache dafür,
    // dass "zum Element springen" nirgends funktionierte.
    const scale = 25;
    const world = { x: 137, y: 412 };
    const local = toLocal(world, bounds);
    const alt = { tx: bounds.centerX - local.x, ty: bounds.centerY - local.y };
    const screen = applyViewerTransform(local, bounds, scale, alt.tx, alt.ty);

    expect(Math.abs(screen.x - bounds.centerX)).toBeGreaterThan(100);
  });

  it('bei scale=1 war die alte Formel zufaellig richtig (deshalb fiel es nie auf)', () => {
    const world = { x: 137, y: 412 };
    const local = toLocal(world, bounds);
    const alt = { tx: bounds.centerX - local.x, ty: bounds.centerY - local.y };
    const screen = applyViewerTransform(local, bounds, 1, alt.tx, alt.ty);

    expect(screen.x).toBeCloseTo(bounds.centerX, 9);
  });

  it('funktioniert auch, wenn das Ziel exakt in der Mitte liegt', () => {
    const world = { x: bounds.minX + bounds.centerX, y: bounds.maxY - bounds.centerY };
    const { translateX, translateY } = centerTransform(world, bounds, 10);
    expect(translateX).toBeCloseTo(0, 9);
    expect(translateY).toBeCloseTo(0, 9);
  });
});

describe('Freie Punktliste als Ziel (Tutorial-Zeichenvorschau)', () => {
  // Die Kamera muss dorthin fahren koennen, WO der Nutzer erst zeichnen soll —
  // dort existiert per Definition noch kein Element mit einer ID.
  it('umschliesst eine Punktliste ohne jede Element-Referenz', () => {
    const t = resolveSpotlightTarget({
      type: 'points',
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
    });
    expect(t.x).toBeCloseTo(5);
    expect(t.y).toBeCloseTo(5);
    expect(t.radius).toBeCloseTo(Math.hypot(5, 5));
  });

  it('haelt den Mindestradius auch bei zwei dicht beieinander liegenden Punkten', () => {
    const t = resolveSpotlightTarget({ type: 'points', points: [{ x: 0, y: 0 }, { x: 0.1, y: 0 }] });
    expect(t.radius).toBeGreaterThanOrEqual(1.5);
  });

  it('verlangt weiterhin eine id fuer echte Elementtypen', () => {
    expect(resolveSpotlightTarget({ type: 'node' }, { nodes: new Map() })).toBeNull();
  });

  it('liefert null statt zu werfen, wenn die Punktliste unbrauchbar ist', () => {
    expect(resolveSpotlightTarget({ type: 'points', points: [] })).toBeNull();
    expect(resolveSpotlightTarget({ type: 'points' })).toBeNull();
  });
});
