import { describe, it, expect } from 'vitest';
import { depthFromCoverAndZ, coverZFromZAndDepth, round2 } from '../utils/heightCoupling.js';

describe('depthFromCoverAndZ (Deckelhöhe - Sohlhöhe = Tiefe)', () => {
    it('berechnet die Tiefe aus Deckelhöhe und Sohlhöhe', () => {
        expect(depthFromCoverAndZ(103.5, 100.5)).toBeCloseTo(3.0, 2);
    });

    it('fehlende Werte (null/undefined) liefern null, kein NaN', () => {
        expect(depthFromCoverAndZ(null, 100.5)).toBeNull();
        expect(depthFromCoverAndZ(103.5, undefined)).toBeNull();
        expect(depthFromCoverAndZ(null, null)).toBeNull();
    });

    it('0.00 ist ein gültiger Wert, kein "fehlt" (Nutzer-Warnung: nicht mit 0 falsy verrechnen)', () => {
        expect(depthFromCoverAndZ(0, 0)).toBe(0);
        expect(depthFromCoverAndZ(0, -2)).toBeCloseTo(2.0, 2);
        expect(depthFromCoverAndZ(2, 0)).toBeCloseTo(2.0, 2);
    });
});

describe('coverZFromZAndDepth (Sohlhöhe + Tiefe = Deckelhöhe)', () => {
    it('berechnet die Deckelhöhe aus Sohlhöhe und Tiefe', () => {
        expect(coverZFromZAndDepth(100.5, 3.0)).toBeCloseTo(103.5, 2);
    });

    it('fehlende Werte (null/undefined) liefern null, kein NaN', () => {
        expect(coverZFromZAndDepth(null, 3.0)).toBeNull();
        expect(coverZFromZAndDepth(100.5, undefined)).toBeNull();
    });

    it('0.00 ist ein gültiger Wert, kein "fehlt"', () => {
        expect(coverZFromZAndDepth(0, 0)).toBe(0);
        expect(coverZFromZAndDepth(0, 2)).toBeCloseTo(2.0, 2);
        expect(coverZFromZAndDepth(-2, 0)).toBeCloseTo(-2.0, 2);
    });
});

describe('round2', () => {
    it('rundet auf 2 Nachkommastellen', () => {
        expect(round2(3.14159)).toBe(3.14);
        expect(round2(2.005)).toBe(2.01);
    });
});
