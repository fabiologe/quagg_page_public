import { describe, it, expect } from 'vitest';
import { kanalfliesszeit, vollflaeche } from '../utils/swmm/fliesszeit.js';
import { empfohleneRegendauer, regenDauerHinweis, kostraDauern, regenDauerMin } from '../utils/regenNorm.js';

// Kreis DN 300: A = 0,070686 m²; Q_voll 70,686 l/s → v_voll = 1,000 m/s
const kreis = { type: 0, height: 0.3 };
const QV_1MS = Math.PI * 0.3 * 0.3 / 4 * 1000;
const h = (id, von, nach, L) => ({ id, fromNodeId: von, toNodeId: nach, length: L, profile: kreis });

describe('Kanalfließzeit (Fließzeitverfahren mit v_voll)', () => {
    //   A ──100 m──► B ──200 m──► C ──300 m──► AUS
    //                D ──50 m──►  C
    const edges = [h('AB', 'A', 'B', 100), h('BC', 'B', 'C', 200), h('CX', 'C', 'AUS', 300), h('DC', 'D', 'C', 50)];
    const ergebnis = Object.fromEntries(edges.map(e => [e.id, { capacity: QV_1MS, maxVelocity: 3 }]));

    it('längster Weg von einem Flächenanschluss bis zum Ende, mit v_voll (nicht v_max)', () => {
        const r = kanalfliesszeit({ edges, areas: [{ nodeId: 'A' }, { nodeId: 'D' }], ergebnis });
        expect(r.minuten).toBeCloseTo(600 / 60, 6);          // 100 + 200 + 300 m bei 1 m/s
        expect(r.von).toBe('A');
        expect(r.nach).toBe('AUS');
        expect(r.haltungen).toEqual(['AB', 'BC', 'CX']);
    });

    it('nur Knoten mit angeschlossener Fläche zählen als Anfang', () => {
        const r = kanalfliesszeit({ edges, areas: [{ nodeId: 'D' }], ergebnis });
        expect(r.minuten).toBeCloseTo(350 / 60, 6);
    });

    it('Profil ohne einfache Fläche: gerechnete Höchstgeschwindigkeit als Ersatz', () => {
        const maul = [{ ...h('M', 'A', 'AUS', 120), profile: { type: 2, height: 1, width: 1.2 } }];
        const r = kanalfliesszeit({ edges: maul, areas: [{ nodeId: 'A' }], ergebnis: { M: { capacity: 900, maxVelocity: 2 } } });
        expect(r.minuten).toBeCloseTo(60 / 60, 6);
    });

    it('Masche im Netz hängt nicht', () => {
        const kreisNetz = [h('XY', 'X', 'Y', 60), h('YX', 'Y', 'X', 60), h('YA', 'Y', 'AUS', 60)];
        const erg = Object.fromEntries(kreisNetz.map(e => [e.id, { capacity: QV_1MS }]));
        expect(kanalfliesszeit({ edges: kreisNetz, areas: [{ nodeId: 'X' }], ergebnis: erg }).minuten).toBeGreaterThan(0);
    });

    it('Ei 3:2 nach DIN 4263: A = 0,5105·H²', () => {
        expect(vollflaeche({ type: 1, height: 0.9 })).toBeCloseTo(0.4135, 3);
    });
});

describe('Regendauer nach DWA-A 118:2024 (5.5.1)', () => {
    it('mindestens 60 min, sonst die doppelte Fließzeit', () => {
        expect(empfohleneRegendauer(10)).toBe(60);
        expect(empfohleneRegendauer(42)).toBe(85);
    });
    it('Hinweis nur unter 60 min', () => {
        expect(regenDauerHinweis(15)).toMatch(/15 min < 60 min/);
        expect(regenDauerHinweis(60)).toBe('');
    });
    it('Dauerstufen aus den Daten, ohne Textschlüssel, bis 24 h', () => {
        expect(kostraDauern({ _quelle: 'x', 5: {}, 60: {}, 180: {}, 2880: {} })).toEqual([5, 60, 180]);
    });
    it('Regendauer aus den Metadaten, sonst Schritte × Intervall', () => {
        expect(regenDauerMin({ metadata: { duration: 90 } })).toBe(90);
        expect(regenDauerMin({ series: new Array(12), metadata: { interval: 5 } })).toBe(60);
    });
});
