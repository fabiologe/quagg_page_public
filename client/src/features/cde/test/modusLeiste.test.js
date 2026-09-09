/**
 * T3 — die Modus-Leiste: der Hinweis STEHT, solange der Modus an ist.
 *
 * Die flüchtige Meldung (3,5-s-Toast) war auf dem Tablet ein totes Ende:
 * kein Hover, kein Esc — nach dem Toast sah der Messmodus aus wie kaputt.
 * Deshalb trennt useMessen jetzt zwei Dinge: `hinweis` (was der nächste
 * Tipp tut — bleibt stehen) und `meldung` (Messwert, Fehlgriff — vergeht).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { readFileSync } from 'node:fs';
import { useMessen } from '../composables/useMessen.js';

function baueMessen(punktErgebnisse = []) {
    const antworten = [...punktErgebnisse];
    const engine = ref({
        enableMeasureMode: vi.fn(),
        disableMeasureMode: vi.fn(),
        addMeasurePoint: vi.fn(async () => antworten.shift() ?? { phase: 'no-hit' }),
        clearMeasurements: vi.fn(),
        updateMeasureHover: vi.fn(),
    });
    const ifc = { addMessung: vi.fn(), clearMessungen: vi.fn(), removeMessung: vi.fn() };
    const selection = () => ({ setMode: vi.fn() });
    return useMessen({ engine, ifc, selection });
}

describe('Der Hinweis steht, die Meldung vergeht', () => {
    beforeEach(() => vi.useRealTimers());

    it('Einschalten: „Ersten Punkt antippen" — und KEIN Timer räumt ihn weg', async () => {
        vi.useFakeTimers();
        const m = baueMessen();
        m.umschalten();
        expect(m.hinweis.value).toBe('Ersten Punkt antippen');
        vi.advanceTimersByTime(60_000);
        expect(m.hinweis.value).toBe('Ersten Punkt antippen');
    });

    it('nach dem ersten Punkt: „Zweiten Punkt antippen"', async () => {
        const m = baueMessen([{ phase: 'awaiting-second' }]);
        m.umschalten();
        await m.klick(10, 10);
        expect(m.hinweis.value).toBe('Zweiten Punkt antippen');
    });

    it('nach der vollständigen Messung beginnt die nächste — der Wert geht in die Meldung', async () => {
        const m = baueMessen([
            { phase: 'awaiting-second' },
            { phase: 'complete', p1: { x: 0, y: 0, z: 0 }, p2: { x: 3, y: 4, z: 0 }, dist: 5 },
        ]);
        m.umschalten();
        await m.klick(1, 1);
        await m.klick(2, 2);
        expect(m.hinweis.value).toBe('Ersten Punkt antippen');
        expect(m.meldung.value.text).toMatch(/Abstand/);
    });

    it('ein Fehlgriff ändert den Hinweis NICHT — er meldet nur', async () => {
        const m = baueMessen([{ phase: 'no-hit' }]);
        m.umschalten();
        await m.klick(1, 1);
        expect(m.hinweis.value).toBe('Ersten Punkt antippen');
        expect(m.meldung.value.text).toMatch(/Kein Treffer/);
    });

    it('Ausschalten räumt den Hinweis weg', () => {
        const m = baueMessen();
        m.umschalten();
        m.umschalten();
        expect(m.hinweis.value).toBeNull();
    });
});

describe('Die Leiste im Viewer', () => {
    const quelle = readFileSync(new URL('../components/IfcViewer.vue', import.meta.url), 'utf8');
    // Seit Teil XVI (S2) ist die Leiste eine Komponente: die Kontextleiste
    // zeigt Tipp-Werkzeuge UND die scharfe Bearbeitung. Der Vertrag bleibt.
    const leiste = readFileSync(new URL('../components/CdeKontextleiste.vue', import.meta.url), 'utf8');

    it('trägt den sichtbaren Ausgang — „Fertig" ist ein Knopf, keine Taste', () => {
        expect(leiste).toContain('modus-fertig');
        expect(leiste).toMatch(/\$emit\('fertig'\)/);
        expect(quelle).toMatch(/messen\.beenden\(\)/);
        expect(quelle).toMatch(/<CdeKontextleiste/);
    });

    it('zeigt sich für Messen UND Notizen — ein Element, zwei Modi', () => {
        expect(quelle).toMatch(/messen\.aktiv\.value \|\| annotationActive/);
    });

    it('„Alle zeigen" staffelt nach oben, wenn die Leiste seinen Platz braucht', () => {
        expect(quelle).toContain('hochgerueckt');
        expect(quelle).toMatch(/\.show-all-btn\.hochgerueckt\s*\{\s*bottom/);
    });
});
