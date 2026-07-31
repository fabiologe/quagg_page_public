import { describe, it, expect } from 'vitest';
import { resolveSubcatchmentSize } from '../utils/subcatchmentSize.js';

describe('resolveSubcatchmentSize', () => {
    it('exakte ID-Übereinstimmung (kein Split)', () => {
        const areas = [{ id: 'F1', size: 0.5 }];
        expect(resolveSubcatchmentSize('F1', areas)).toBeCloseTo(0.5, 6);
    });

    it('funktioniert auch mit Map statt Array', () => {
        const areas = new Map([['F1', { id: 'F1', size: 0.5 }]]);
        expect(resolveSubcatchmentSize('F1', areas)).toBeCloseTo(0.5, 6);
    });

    it('Split-Fläche: "_2"-Suffix nutzt (1 - splitRatio/100) der Gesamtgröße', () => {
        const areas = [{ id: 'F1', size: 1.0, nodeId2: 'N2', splitRatio: 30 }];
        expect(resolveSubcatchmentSize('F1', areas)).toBeCloseTo(0.3, 6); // Teil 1: 30%
        expect(resolveSubcatchmentSize('F1_2', areas)).toBeCloseTo(0.7, 6); // Teil 2: 70%
    });

    it('ohne splitRatio ist der Default 50/50', () => {
        const areas = [{ id: 'F1', size: 1.0, nodeId2: 'N2' }];
        expect(resolveSubcatchmentSize('F1', areas)).toBeCloseTo(0.5, 6);
        expect(resolveSubcatchmentSize('F1_2', areas)).toBeCloseTo(0.5, 6);
    });

    it('".1"-Suffix-Fallback (ISYBAU-Importbenennung ohne exakte Übereinstimmung)', () => {
        const areas = [{ id: 'RW34', size: 0.8 }];
        expect(resolveSubcatchmentSize('RW34.1', areas)).toBeCloseTo(0.8, 6);
    });

    it('keine passende Fläche gefunden -> 0 (nicht NaN/undefined)', () => {
        const areas = [{ id: 'F1', size: 0.5 }];
        expect(resolveSubcatchmentSize('UNBEKANNT', areas)).toBe(0);
    });
});
