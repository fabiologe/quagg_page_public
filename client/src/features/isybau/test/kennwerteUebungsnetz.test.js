/**
 * Messlatte der Modellannahmen am Übungsnetz (doc/GrenzenEvaluierung.md,
 * Fahrplan „Grenzen beheben“). Echter Rechenweg: Store → Worker-Code →
 * WASM-SWMM; gelesen wird der SWMM-Originalbericht (helpers/rptKennzahlen.js).
 *
 * Die Kennzahlen jedes Laufs werden ausgegeben — sie sind die Vorher/Nachher-
 * Zahlen in doc/09_befunde_intern.md.
 */
import { describe, it, expect, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { JSDOM } from 'jsdom';
import { KOSTRA, kostraZeile, uebungsnetzHerrichten, kennzahlen, psiEingabe } from './helpers/rptKennzahlen.js';

globalThis.DOMParser ??= new JSDOM('').window.DOMParser;

vi.mock('../core/worker/WorkerController.js', async () => ({
    WorkerController: (await import('./helpers/workerImProzess.js')).WorkerImProzess
}));

const { useIsybauStore } = await import('../store/index.js');
const { parseIsybauXML } = await import('../utils/xmlParser.js');
const { calculateBlockRain, calculateEulerType2 } = await import('../utils/RainModelService.js');
const { getRunoffCoeff } = await import('../utils/mappings.js');

const LAUFZEIT = 120_000;

const REGEN = {
    'Euler II 60 min, T = 3 a': (s) => s.setRainModel({
        type: 'euler2', series: calculateEulerType2(kostraZeile('RN_003A'), 60, 5),
        metadata: { duration: 60, interval: 5, returnPeriod: 'RN_003A' },
    }),
    'Block 15 min, T = 1 a': (s) => s.setRainModel({
        type: 'block', series: calculateBlockRain(KOSTRA['15'].RN_001A, 15, 5),
        metadata: { duration: 15, interval: 5 },
    }),
};

async function lauf(regen) {
    setActivePinia(createPinia());
    const store = uebungsnetzHerrichten(useIsybauStore(), { parseIsybauXML, getRunoffCoeff });
    // Festes Verfahren, damit Vorher/Nachher vergleichbar bleiben
    store.berechnung.ueberstauverfahren = 'SLOT';
    store.rain.duration = 3;
    REGEN[regen](store);
    await store.runSimulation();
    expect(store.simulation.status, store.simulation.error).toBe('success');
    const k = kennzahlen(store.simulation.results.report);
    const psi = psiEingabe(store.areaArray);
    console.log(`[Kennwerte] ${regen}: ψ_Eingabe ${psi.toFixed(3)} | ψ_eff ${k.psiEff.toFixed(3)} | Q_Auslässe ${k.qAuslaesse.toFixed(0)} l/s | Überstau ${k.ueberstau} Knoten | Volllauf ${k.volllauf} Haltungen | Bilanz ${k.bilanz} % | Kanalfließzeit ${store.simulation.results.systemStats.fliesszeit?.minuten.toFixed(1)} min (${store.simulation.results.systemStats.fliesszeit?.von} → ${store.simulation.results.systemStats.fliesszeit?.nach})`);
    return { k, psi, store };
}

describe('Kennwerte Übungsnetz (Messlatte)', () => {
    // Stufe 1: ψ ist ein Abflussbeiwert — SWMM muss genau diesen Anteil als
    // Oberflächenabfluss liefern. Vorher 0,737 bei ψ 0,493 (unbefestigter Rest
    // erzeugte über Horton zusätzlich Abfluss).
    it.each(Object.keys(REGEN))('%s: SWMM setzt das eingegebene ψ um (± 0,02)', async (regen) => {
        const { k, psi, store } = await lauf(regen);
        expect(k.niederschlag).toBeGreaterThan(5);
        // Stufe 2: Regen < 60 min → Hinweis nach DWA-A 118:2024 (5.5.1), ≥ 60 min → keiner
        const a118 = store.simulation.preSolveWarnings.filter(w => /DWA-A 118:2024/.test(w.text));
        expect(a118.length, regen).toBe(/15 min/.test(regen) ? 1 : 0);
        // Stufe 2: Kanalfließzeit liegt vor; das Übungsnetz ist klein → Empfehlung 60 min
        // Die Übungsdatei hatte 23 Rohrsohlen 1–5 cm unter der Schachtsohle (still angehoben);
        // sie ist korrigiert (2026-09-29) — kein Hinweis mehr, gleiche SWMM-Geometrie.
        expect(store.simulation.preSolveWarnings.some(w => /Rohrsohle unter der Schachtsohle/.test(w.text))).toBe(false);
        const tf = store.simulation.results.systemStats.fliesszeit;
        expect(tf.minuten).toBeGreaterThan(1);
        expect(tf.minuten).toBeLessThan(30);
        expect(Math.abs(k.psiEff - psi)).toBeLessThan(0.02);
        expect(Math.abs(k.bilanz)).toBeLessThan(5);
    }, LAUFZEIT);
});
