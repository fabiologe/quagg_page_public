import { describe, it, expect } from 'vitest';
import { computeRunoffValidation } from '../utils/runoffValidation.js';

describe('computeRunoffValidation (Fließzeitverfahren)', () => {
    const areas = [
        { id: 'A1', size: 1.0, runoffCoeff: 0.5, nodeId: 'N1', slope: 1 },
        { id: 'A2', size: 0, runoffCoeff: 0.9, nodeId: 'N2' } // size 0 → gefiltert
    ];

    it('rationale Methode: Q = ψ·i·A', () => {
        const rows = computeRunoffValidation({
            areas,
            rain: { intensity: 100, duration: 1 } // 100 l/(s·ha), 1 h Blockregen
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].maxFlow).toBeCloseTo(0.5 * 100 * 1.0, 5); // 50 l/s
        // Regenhöhe: 100 × 60 min × 0.006 = 36 mm → V = 0.5 × 0.036 × 10000 = 180 m³
        expect(rows[0].totalVolume).toBeCloseTo(180, 3);
    });

    it('1 mm Anfangsverlust reduziert das Volumen', () => {
        const [withL] = computeRunoffValidation({ areas, rain: { intensity: 100, duration: 1 }, applyLosses: true });
        const [without] = computeRunoffValidation({ areas, rain: { intensity: 100, duration: 1 }, applyLosses: false });
        expect(withL.totalVolume).toBeLessThan(without.totalVolume);
        // ΔV = ψ × 1mm × A = 0.5 × 0.001 × 10000 = 5 m³
        expect(without.totalVolume - withL.totalVolume).toBeCloseTo(5, 3);
    });

    it('Modellregen: Spitzenintensität der Serie ist maßgebend', () => {
        const [row] = computeRunoffValidation({
            areas,
            rain: { activeModelRain: { series: [
                { time: 0, intensity: 50 }, { time: 5, intensity: 200 }, { time: 10, intensity: 80 }
            ] } }
        });
        expect(row.maxFlow).toBeCloseTo(0.5 * 200 * 1.0, 5);
    });
});
