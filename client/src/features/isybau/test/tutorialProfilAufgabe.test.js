/**
 * Profil-Aufgabe am echten Weg: Übungsnetz (Beispiel_Tutorial.xml, drei
 * Haltungen mit Höhe 0) → echter Store → runSimulation() → Vorab-Prüfung →
 * Übungs-Guide. Nur die Web-Worker-Grenze ist ersetzt (helpers/workerImProzess.js),
 * der zweite Lauf rechnet mit echtem WASM-SWMM.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setActivePinia, createPinia } from 'pinia';
import { JSDOM } from 'jsdom';

globalThis.DOMParser ??= new JSDOM('').window.DOMParser;

vi.mock('../core/worker/WorkerController.js', async () => ({
    WorkerController: (await import('./helpers/workerImProzess.js')).WorkerImProzess
}));

const { useIsybauStore } = await import('../store/index.js');
const { parseIsybauXML } = await import('../utils/xmlParser.js');
const { useTutorialGuide } = await import('../tutorial/useTutorialGuide.js');
const { EXERCISE_STEPS, alleProfileGueltig, allAreasHaveRunoffCoeff } = await import('../tutorial/tutorialExercise.js');

const XML = readFileSync(fileURLToPath(new URL('../../../../public/saintv1d/tutorial/Beispiel_Tutorial.xml', import.meta.url)), 'latin1');
const KAPUTT = ['R-0030', '80454891V1', '80454893V2'];

function netz() {
    setActivePinia(createPinia());
    const store = useIsybauStore();
    store.loadParsedData(parseIsybauXML(XML));
    return store;
}

/** Guide bis ex-run vorspulen, ohne den Zustand anzufassen. */
function guideBisLauf(store) {
    const guide = useTutorialGuide();
    guide.resetGuideState();
    guide.startExercise(store);
    for (let i = 0; i <= EXERCISE_STEPS.length && guide.activeStep.value?.id !== 'ex-run'; i++) guide.next();
    expect(guide.activeStep.value?.id).toBe('ex-run');
    return guide;
}

describe('Übung: Profile mit Höhe 0 reparieren (echter Store)', () => {
    // Die Übungsdatei hat keinen <Abflussbeiwert>. Seit ψ nicht mehr still ergänzt
    // wird (Area: fehlt = null), bleibt die Aufgabe „Abflussbeiwert eintragen“ offen.
    it('das Übungsnetz kommt ohne Abflussbeiwerte — die Aufgabe dazu bleibt offen', () => {
        const store = netz();
        expect(store.areaArray.length).toBe(38);
        expect(store.areaArray.every(a => a.runoffCoeff === null)).toBe(true);
        expect(allAreasHaveRunoffCoeff(store)).toBe(false);
    });

    it('das Übungsnetz bringt genau die drei kaputten Profile mit', () => {
        const store = netz();
        expect(alleProfileGueltig(store)).toBe(false);
        for (const id of KAPUTT) expect(store.edges.get(id).profile.height).toBe(0);
    });

    it('Lauf scheitert an ERR_119 → öffnen → korrigieren → neu rechnen → Abschluss', async () => {
        const store = netz();
        const guide = guideBisLauf(store);

        await store.runSimulation();
        expect(store.simulation.status).toBe('error');
        expect(store.simulation.fehlerCode).toBe('ERR_119');
        guide.evaluateExercise(store);
        expect(guide.activeStep.value.id).toBe('ex-profil-oeffnen');

        // „→ Element öffnen“ macht genau das:
        store.openPreprocessingFor(store.simulation.invalidElementId, store.simulation.invalidElementType);
        guide.evaluateExercise(store);
        expect(guide.activeStep.value.id).toBe('ex-profil-korrigieren');

        // Zwei von drei reichen nicht.
        store.edges.get('R-0030').profile.height = 0.5;
        store.edges.get('80454891V1').profile.height = 0.3;
        store.saveHistory();
        guide.evaluateExercise(store);
        expect(guide.activeStep.value.id).toBe('ex-profil-korrigieren');
        store.edges.get('80454893V2').profile.height = 0.3;
        store.saveHistory(); // wie „Übernehmen“ (updateNetworkData): der Sammelmelder schlägt an
        guide.evaluateExercise(store);
        expect(guide.activeStep.value.id).toBe('ex-run-2');

        // Der alte Fehler steht noch im Store: das allein schaltet NICHT weiter.
        guide.evaluateExercise(store);
        expect(guide.activeStep.value.id).toBe('ex-run-2');

        await store.runSimulation();
        expect(store.simulation.status, store.simulation.error).toBe('success');
        guide.evaluateExercise(store);
        expect(guide.activeStep.value?.id ?? null).not.toBe('ex-run-2');
    }, 120_000);
});
