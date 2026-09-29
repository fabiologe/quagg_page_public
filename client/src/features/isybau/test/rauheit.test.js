/**
 * Rauheit nach DWA-A 110 (Fahrplan „Grenzen beheben“, Stufe 4). Sollwerte aus
 * einer unabhängigen Handrechnung (Python, doc/GrenzenEvaluierung.md B2).
 */
import { describe, it, expect } from 'vitest';
import { manningN, manningAusKb, vPrandtlColebrook, kbFuerHaltung, rauheitManuell, radiusVoll, KB_MM } from '../utils/rauheit.js';

const kreis = (d) => ({ type: 0, height: d });

describe('Prandtl-Colebrook und gleichwertiges Manning-n', () => {
    it('v_voll DN 300, 5 ‰, kb 0,75 mm = 1,075 m/s', () => {
        expect(vPrandtlColebrook(0.3 / 4, 0.005, 0.75)).toBeCloseTo(1.075, 2);
    });
    it('gleichwertiger kSt: DN 300 ≈ 85, DN 500 ≈ 84, DN 1000 ≈ 82 (vorher Kunststoff 95)', () => {
        expect(1 / manningAusKb(kreis(0.3), 0.005, 0.75)).toBeCloseTo(85, 0);
        expect(1 / manningAusKb(kreis(0.5), 0.005, 0.75)).toBeCloseTo(84, 0);
        expect(1 / manningAusKb(kreis(1.0), 0.005, 0.75)).toBeCloseTo(82, 0);
    });
    it('Manning mit diesem n liefert bei Vollfüllung dasselbe v wie Prandtl-Colebrook', () => {
        const n = manningAusKb(kreis(0.4), 0.003, 0.75);
        const R = 0.1;
        expect(R ** (2 / 3) * Math.sqrt(0.003) / n).toBeCloseTo(vPrandtlColebrook(R, 0.003, 0.75), 6);
    });
    it('Ei 3:2 nach DIN 4263: R = 0,1932 · H', () => {
        expect(radiusVoll({ type: 1, height: 0.9 })).toBeCloseTo(0.1739, 3);
    });
});

describe('Welches kb, welcher Weg', () => {
    it('Sammelkanal 0,75 · Mauerwerk/Ortbeton 1,50 · Druckleitung 0,25 mm (A 110, 5.2.2)', () => {
        expect(kbFuerHaltung({ material: 'PVC' })).toBe(KB_MM.sammel);
        expect(kbFuerHaltung({ material: 'MA' })).toBe(KB_MM.sonder);
        expect(kbFuerHaltung({ material: 'Mauerwerk' })).toBe(KB_MM.sonder);
        expect(kbFuerHaltung({ material: 'B' }, { druckleitung: true })).toBe(KB_MM.druck);
    });
    it('Material wählt nicht mehr die Leistungsfähigkeit: Kunststoff und Beton gleich', () => {
        const pvc = manningN({ material: 'PVC', profile: kreis(0.3) }, { gefaelle: 0.005 });
        const beton = manningN({ material: 'B', profile: kreis(0.3) }, { gefaelle: 0.005 });
        expect(pvc.quelle).toBe('kb');
        expect(pvc.n).toBeCloseTo(beton.n, 10);
    });
    it('ein bewusst eingetragener kSt geht vor; die alte Materialvorgabe gilt als automatisch', () => {
        expect(manningN({ material: 'PVC', roughness: 70, profile: kreis(0.3) }).quelle).toBe('manuell');
        expect(manningN({ material: 'PVC', roughness: 70, profile: kreis(0.3) }).n).toBeCloseTo(1 / 70, 10);
        expect(rauheitManuell({ material: 'PVC', roughness: 95 })).toBeNull(); // = getRoughness('PVC')
        expect(rauheitManuell({ material: 'PVC', roughness: null })).toBeNull();
    });
    it('offene Gerinne behalten kSt aus dem Material', () => {
        const r = manningN({ material: 'Erde', profile: { type: 8, height: 0.5, width: 1 } });
        expect(r.quelle).toBe('gerinne');
        expect(r.kSt).toBe(25);
    });
});
