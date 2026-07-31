import { describe, it, expect } from 'vitest';
import { dist, distSq, closestPointOnSegment, distanceToSegment } from '../utils/geometry2d.js';

describe('dist/distSq', () => {
    it('berechnet den euklidischen Abstand', () => {
        expect(dist(0, 0, 3, 4)).toBeCloseTo(5, 6);
        expect(distSq(0, 0, 3, 4)).toBeCloseTo(25, 6);
    });
});

describe('closestPointOnSegment', () => {
    it('Lotfußpunkt liegt mittig auf der Strecke', () => {
        const cp = closestPointOnSegment(5, 5, 0, 0, 10, 0);
        expect(cp.x).toBeCloseTo(5, 6);
        expect(cp.y).toBeCloseTo(0, 6);
    });

    it('klemmt auf den Endpunkt, wenn das Lot außerhalb der Strecke fällt', () => {
        const cp = closestPointOnSegment(-5, 3, 0, 0, 10, 0);
        expect(cp.x).toBeCloseTo(0, 6);
        expect(cp.y).toBeCloseTo(0, 6);
    });

    it('entartete Strecke (a === b) liefert a', () => {
        const cp = closestPointOnSegment(5, 5, 2, 2, 2, 2);
        expect(cp).toEqual({ x: 2, y: 2 });
    });
});

describe('distanceToSegment', () => {
    it('senkrechter Abstand zu einer horizontalen Strecke', () => {
        expect(distanceToSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3, 6);
    });

    it('Abstand zum nächsten Endpunkt außerhalb der Strecke', () => {
        expect(distanceToSegment(-3, 4, 0, 0, 10, 0)).toBeCloseTo(5, 6); // 3-4-5
    });
});
