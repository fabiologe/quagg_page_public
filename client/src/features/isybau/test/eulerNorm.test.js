/**
 * Befund 3 (doc/09): Modellregen Euler Typ II nach DWA-A 118 (2006), Abschn. 5.2.2.1:
 * „… Zeitpunkt für den Beginn des Regenintervalls mit der höchsten Niederschlags-
 * intensität beim 0,3-fachen der Modellregendauer … auf ein Vielfaches von 5 Minuten
 * abgerundet. Daran schließen sich auf der Zeitachse nach links die nächst niedrigeren
 * Intervalle an, bis der Zeitpunkt t = 0 erreicht ist. Die weiteren Regenintervalle
 * folgen auf der Zeitachse nach rechts im Anschluss an das Spitzenintervall …"
 *
 * Sollreihen von Hand nach diesem Wortlaut aus den KOSTRA-Werten des Beispielstandorts
 * gebildet (T = 3 a, Δt = 5 min), nicht aus der Implementierung.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calculateEulerType2 } from '../utils/RainModelService.js';

const KOSTRA = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/kostra_beispielstandort.json', import.meta.url)), 'utf8'));
const zeile = (T) => {
    const z = {};
    for (const d of Object.keys(KOSTRA)) if (KOSTRA[d]?.[T]) z[d] = KOSTRA[d][T];
    return z;
};
const hoehen = (D) => calculateEulerType2(zeile('RN_003A'), D, 5).map(s => Math.round(s.height_mm * 100) / 100);

describe('Euler Typ II nach DWA-A 118 Abschn. 5.2.2.1', () => {
    it('D = 15 min: Spitze bei 0,3·15 = 4,5 → 0 min, danach absteigend', () => {
        expect(hoehen(15)).toEqual([10.6, 2.4, 1.5]);
    });

    it('D = 60 min: Spitze beginnt bei 15 min; links die nächstniedrigeren bis t = 0, rechts der Rest', () => {
        // Blockhöhen absteigend: 10.6 2.4 1.5 1.37 1.2 1.14 0.78 0.63 0.5 0.34 0.23 0.13
        // Spitze Index 3; links (rückwärts) 2.4, 1.5, 1.37; rechts 1.2, 1.14, …
        expect(hoehen(60)).toEqual([1.37, 1.5, 2.4, 10.6, 1.2, 1.14, 0.78, 0.63, 0.5, 0.34, 0.23, 0.13]);
    });

    it('D = 120 min: Spitze beginnt bei 35 min, links steigend bis zur Spitze, rechts fallend', () => {
        const h = hoehen(120);
        const spitze = 7; // ⌊0,3·120 / 5⌋ · 5 = 35 min → Intervall 7
        expect(Math.max(...h)).toBe(h[spitze]);
        for (let i = 1; i <= spitze; i++) expect(h[i]).toBeGreaterThanOrEqual(h[i - 1]);
        for (let i = spitze + 2; i < h.length; i++) expect(h[i]).toBeLessThanOrEqual(h[i - 1]);
        // Links stehen genau die 7 nächstgrößeren Blöcke.
        const absteigend = [...h].sort((a, b) => b - a);
        expect([...h.slice(0, spitze)].sort((a, b) => b - a)).toEqual(absteigend.slice(1, spitze + 1));
    });

    it('Summe der Blöcke = KOSTRA-Regenhöhe hN(D)', () => {
        for (const D of [15, 60, 120]) {
            const summe = calculateEulerType2(zeile('RN_003A'), D, 5).reduce((s, b) => s + b.height_mm, 0);
            expect(summe).toBeCloseTo(KOSTRA[String(D)].HN_003A, 1);
        }
    });
});
