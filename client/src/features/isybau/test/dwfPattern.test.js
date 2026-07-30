import { describe, it, expect } from 'vitest';
import { buildDwfPatternValues, DWF_NORMALIZED_SHAPE_24H, DWF_SHAPE_MAX } from '../utils/dwfPattern.js';

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

describe('buildDwfPatternValues', () => {
    it('liefert 24 Werte', () => {
        expect(buildDwfPatternValues(1.5)).toHaveLength(24);
    });

    it('Mittelwert bleibt exakt 1.0, Maximum entspricht dem Spitzenfaktor', () => {
        const values = buildDwfPatternValues(1.5);
        expect(mean(values)).toBeCloseTo(1.0, 2);
        expect(Math.max(...values)).toBeCloseTo(1.5, 2);
    });

    it('kein Faktor (null/undefined) => konstant 1.0', () => {
        expect(buildDwfPatternValues(null)).toEqual(Array(24).fill(1.0));
        expect(buildDwfPatternValues(undefined)).toEqual(Array(24).fill(1.0));
    });

    it('Faktor <= 1.0 => konstant 1.0 (kein Sinn ergebender Peak)', () => {
        expect(buildDwfPatternValues(1.0)).toEqual(Array(24).fill(1.0));
        expect(buildDwfPatternValues(0.5)).toEqual(Array(24).fill(1.0));
    });

    it('Werte bleiben auch bei extremen Faktoren positiv (>= 0.05)', () => {
        const values = buildDwfPatternValues(10);
        expect(values.every(v => v >= 0.05)).toBe(true);
    });

    it('Basiskurve (DWF_NORMALIZED_SHAPE_24H) hat Mittelwert 1.0', () => {
        expect(mean(DWF_NORMALIZED_SHAPE_24H)).toBeCloseTo(1.0, 6);
        expect(DWF_SHAPE_MAX).toBeGreaterThan(1.0);
    });
});
