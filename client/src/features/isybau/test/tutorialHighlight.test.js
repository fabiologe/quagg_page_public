// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { effectScope, reactive, nextTick } from 'vue';
import { useHighlight } from '../tutorial/useHighlight.js';
import { useTutorialGuide } from '../tutorial/useTutorialGuide.js';
import { EXERCISE_STEPS } from '../tutorial/tutorialExercise.js';

/**
 * Beweist die Reaktivitaet, auf der die Kur beruht: useHighlight loest den
 * Anker in einem watch-Getter auf, Vue verfolgt dabei die Store-Zugriffe der
 * highlight-Funktion — das Leuchten wandert also mit, wenn der Nutzer MITTEN
 * im Schritt sein Fenster schliesst.
 *
 * Ohne diesen Test waere die Kur nur plausibel: wer den Anker spaeter beim
 * Schrittwechsel einmalig zwischenspeichert (statt ihn im Getter zu lassen),
 * bekaeme wieder gruene Unit-Tests fuer resolveStepHighlight — und den alten
 * Fehler zurueck.
 */

const KLASSE = 'sv-tutorial-highlight';

const ankerSetzen = (...namen) => {
    document.body.innerHTML = namen.map(n => `<button data-tutorial="${n}"></button>`).join('');
};
const leuchtet = () => Array.from(document.querySelectorAll(`.${KLASSE}`))
    .map(el => el.dataset.tutorial)
    .sort();

describe('useHighlight folgt dem Zustand, nicht nur dem Schritt', () => {
    let scope;
    let store;
    let guide;

    beforeEach(() => {
        guide = useTutorialGuide();
        guide.resetGuideState();
        store = reactive({ ui: { showKostraModal: true, showPreprocessingModal: true } });
        ankerSetzen(
            'kostra-uebernehmen', 'kostra-oeffnen',
            'preprocessing-uebernehmen', 'daten-bearbeiten',
            'sidebar',
        );
        scope = effectScope();
        scope.run(() => useHighlight(store));
    });

    afterEach(() => {
        scope.stop();
        guide.resetGuideState();
        document.body.innerHTML = '';
    });

    it('fester Anker leuchtet wie bisher', async () => {
        guide.activeStep.value = { id: 'test', highlight: 'sidebar' };
        await nextTick();
        expect(leuchtet()).toEqual(['sidebar']);
    });

    it('das Leuchten wandert, wenn sich der Zustand unter dem Schritt aendert', async () => {
        // Der echte Schritt, an dem der Fehler auftrat.
        const step = EXERCISE_STEPS.find(s => s.id === 'ex-rain-uebernehmen');
        guide.activeStep.value = { ...step };
        await nextTick();
        expect(leuchtet()).toEqual(['kostra-uebernehmen']);

        // Nutzer schliesst das KOSTRA-Fenster — der Schritt bleibt stehen,
        // weil er den Endzustand prueft und bewusst kein `requires` hat.
        store.ui.showKostraModal = false;
        await nextTick();
        expect(leuchtet()).toEqual(['kostra-oeffnen']);

        // ...und wieder zurueck.
        store.ui.showKostraModal = true;
        await nextTick();
        expect(leuchtet()).toEqual(['kostra-uebernehmen']);
    });

    it('dasselbe fuer die Auslaesse in der Datenbearbeitung', async () => {
        const step = EXERCISE_STEPS.find(s => s.id === 'ex-outfalls-uebernehmen');
        guide.activeStep.value = { ...step };
        await nextTick();
        expect(leuchtet()).toEqual(['preprocessing-uebernehmen']);

        store.ui.showPreprocessingModal = false;
        await nextTick();
        expect(leuchtet()).toEqual(['daten-bearbeiten']);
    });

    it('ohne Schritt leuchtet nichts', async () => {
        guide.activeStep.value = { id: 'test', highlight: 'sidebar' };
        await nextTick();
        guide.activeStep.value = null;
        await nextTick();
        expect(leuchtet()).toEqual([]);
    });
});
