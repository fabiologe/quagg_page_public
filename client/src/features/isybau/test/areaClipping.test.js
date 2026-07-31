import { describe, it, expect } from 'vitest';
import { clipNewArea, snapPoint, hasSelfIntersection } from '../utils/areaClipping.js';

const sq = (x0, y0, s) => [
    { x: x0, y: y0 }, { x: x0 + s, y: y0 }, { x: x0 + s, y: y0 + s }, { x: x0, y: y0 + s }
];

describe('clipNewArea', () => {
    it('ohne bestehende Flächen bleibt das Polygon unverändert', () => {
        const points = sq(0, 0, 10);
        expect(clipNewArea(points, [])).toEqual([points]);
    });

    it('keine Überlappung -> Polygon bleibt unverändert', () => {
        const newPoints = sq(0, 0, 10);
        const existing = [{ points: sq(100, 100, 10) }];
        const result = clipNewArea(newPoints, existing);
        expect(result).toHaveLength(1);
        expect(result[0]).toHaveLength(4);
    });

    it('teilweise Überlappung -> das Ergebnis überlappt die bestehende Fläche NICHT mehr', () => {
        // Neue Fläche 0..10, bestehende Fläche 5..15 (überlappt in 5..10)
        const newPoints = sq(0, 0, 10);
        const existing = [{ points: sq(5, 0, 10) }];
        const result = clipNewArea(newPoints, existing);
        expect(result.length).toBeGreaterThanOrEqual(1);
        // Kein Punkt des Ergebnisses darf innerhalb von x>5 liegen (dort ist die bestehende Fläche)
        for (const frag of result) {
            for (const p of frag) {
                expect(p.x).toBeLessThanOrEqual(5.001);
            }
        }
    });

    it('komplett verdeckte Fläche -> leeres Ergebnis (nichts anzulegen)', () => {
        const newPoints = sq(2, 2, 2); // klein, komplett innerhalb der bestehenden 0..10-Fläche
        const existing = [{ points: sq(0, 0, 10) }];
        expect(clipNewArea(newPoints, existing)).toEqual([]);
    });

    it('bestehende Fläche mit < 3 Punkten wird ignoriert statt zu crashen', () => {
        const newPoints = sq(0, 0, 10);
        const existing = [{ points: [{ x: 1, y: 1 }] }];
        expect(clipNewArea(newPoints, existing)).toEqual([newPoints]);
    });
});

describe('snapPoint', () => {
    it('ohne Nachbarschaft (außerhalb Toleranz) bleibt der Punkt unverändert', () => {
        const raw = { x: 100, y: 100 };
        const existing = [{ points: sq(0, 0, 10) }];
        expect(snapPoint(raw, existing, 0.5)).toEqual(raw);
    });

    it('snapt exakt auf einen nahen Vertex (Priorität vor Kanten-Snap)', () => {
        const raw = { x: 10.1, y: 10.1 }; // knapp neben der Ecke (10,10)
        const existing = [{ points: sq(0, 0, 10) }];
        const snapped = snapPoint(raw, existing, 0.5);
        expect(snapped).toEqual({ x: 10, y: 10 });
    });

    it('snapt auf die nächste Kante, wenn kein Vertex in Reichweite ist', () => {
        const raw = { x: 5, y: 10.2 }; // knapp über der oberen Kante (y=10), mittig zwischen den Ecken
        const existing = [{ points: sq(0, 0, 10) }];
        const snapped = snapPoint(raw, existing, 0.5);
        expect(snapped.x).toBeCloseTo(5, 6);
        expect(snapped.y).toBeCloseTo(10, 6);
    });
});

describe('hasSelfIntersection', () => {
    it('konvexes Quadrat hat keine Selbstüberschneidung', () => {
        expect(hasSelfIntersection(sq(0, 0, 10))).toBe(false);
    });

    it('erkennt eine "bowtie"-Form (Eckpunkt über eine gegenüberliegende Kante gezogen)', () => {
        // Klassisches Schmetterlings-Polygon: Punkte 1 und 3 vertauscht
        const bowtie = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
        expect(hasSelfIntersection(bowtie)).toBe(true);
    });

    it('weniger als 3 Punkte gilt als nicht selbstüberschneidend (kein valides Polygon, aber kein Kinks-Fall)', () => {
        expect(hasSelfIntersection([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
    });
});
