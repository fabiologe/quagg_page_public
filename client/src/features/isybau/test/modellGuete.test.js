/** P1.8: Modellgüte in Stufen. IGBWEST (Browser 2026-09-26): Systembilanz −0,14 %,
 *  Knoten 451170437 mit 26,1 % Kontinuitätsfehler → vorher „100 Exzellent". */
import { describe, it, expect } from 'vitest';
import { modellGuete, bilanzStufe } from '../utils/swmm/modellGuete.js';
import { getContinuityClass } from '../components/modals/results/resultsShared.js';

describe('Modellgüte', () => {
    it('IGBWEST: Knotenfehler 26 % → prüfen, mit Grund', () => {
        const g = modellGuete({ flow: { error: -0.14 }, routingTimeStep: { notConverging: 0 }, continuityErrors: [{ id: '451170437', error: 26.1 }, { id: 'X', error: 2 }] });
        expect(g.stufe).toBe('pruefen');
        expect(g.gruende).toEqual(['1 Knoten mit Kontinuitätsfehler ≥ 10 %: 451170437 (26,1 %)']);
    });
    it('Schwellen der Bilanzkachel: ≤ 1 % gut, > 1 % prüfen, > 5 % kritisch', () => {
        expect(modellGuete({ flow: { error: 0.9 } }).stufe).toBe('gut');
        expect(modellGuete({ flow: { error: -1.6 } }).stufe).toBe('pruefen');
        expect(modellGuete({ flow: { error: 14.3 } }).stufe).toBe('kritisch');
        expect(modellGuete({ flow: { error: 0 }, routingTimeStep: { notConverging: 12 } }).stufe).toBe('kritisch');
    });
    it('kritisch bleibt kritisch, auch wenn danach nur „prüfen"-Gründe kommen', () => {
        const g = modellGuete({ flow: { error: 8 }, continuityErrors: [{ id: 'A', error: 50 }] });
        expect(g.stufe).toBe('kritisch');
        expect(g.gruende).toHaveLength(2);
    });
    it('ohne Angaben: gut', () => {
        expect(modellGuete(undefined).stufe).toBe('gut');
    });
});

describe('bilanzStufe — eine Einstufung für Fenster und PDF (Fahrplan Grenzen, Stufe 3)', () => {
    // Vorher: Fenster ≤ 1 / (1, 5] / > 5, PDF < 1 / [1, 5) / ≥ 5 — genau an den
    // Grenzen zeigten beide verschiedene Farben.
    it('Grenzen: 1 % ist noch gut, 5 % noch prüfen', () => {
        expect(bilanzStufe(0)).toBe('gut');
        expect(bilanzStufe(1)).toBe('gut');
        expect(bilanzStufe(1.01)).toBe('pruefen');
        expect(bilanzStufe(5)).toBe('pruefen');
        expect(bilanzStufe(5.01)).toBe('kritisch');
        expect(bilanzStufe(-5.8)).toBe('kritisch');
    });
    it('die Kachel im Fenster folgt derselben Regel', () => {
        expect(getContinuityClass(1)).toBe('kpi-success');
        expect(getContinuityClass(5)).toBe('kpi-warning');
        expect(getContinuityClass(-5.8)).toBe('kpi-danger');
    });
});
