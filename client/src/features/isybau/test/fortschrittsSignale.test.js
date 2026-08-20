import { describe, it, expect } from 'vitest';
import { leseFortschrittsSignale } from '../tutorial/fortschrittsSignale.js';
import { EXERCISE_STEPS, makeSnapshot } from '../tutorial/tutorialExercise.js';

/**
 * Der Wächter über den Fortschritts-Signalen.
 *
 * Was hier schiefgehen kann: Ein Schritt prüft ein Store-Feld, das der Watcher
 * im Maskottchen nicht beobachtet. Dann wird der Schritt nie neu bewertet, die
 * Ratte bleibt stehen, und im UI sieht es aus wie eine kaputte Prüfung.
 *
 * Der Vorgänger dieses Tests las die .vue-Datei als Zeichenkette und verglich
 * sie mit NEUN von Hand gepflegten Feldnamen — er maß also etwas anderes als
 * das, was bricht, und deckte nur einen Teil ab. Ein neuer Schritt mit neuem
 * Feld lief daran vorbei.
 *
 * Stattdessen wird hier BEIDES mit demselben Messgerät gemessen: ein Proxy
 * protokolliert jeden Store-Pfad, den eine Funktion anfasst. Einmal über alle
 * `check`/`requires` der Schritte, einmal über den Signal-Leser. Was die
 * Schritte lesen, muss der Leser beobachten. Von Hand gepflegt wird nichts
 * mehr — neue Schritte sind automatisch mit abgedeckt.
 */

const istEinfachesObjekt = (v) => v !== null
    && typeof v === 'object'
    && !Array.isArray(v)
    && !(v instanceof Map)
    && !(v instanceof Set);

/**
 * Store-Attrappe, die jeden gelesenen Pfad mitschreibt.
 *
 * Nur einfache Objekte werden weiter eingepackt; Arrays, Maps und Sets kommen
 * roh zurück. Das ist Absicht und deckt sich mit dem, was der Watcher kann:
 * Er beobachtet Sammlungen als Ganzes (`areas.length`, `nodes.size`), nicht
 * einzelne Elemente darin. Ein roher Wert hält ausserdem `instanceof Map` und
 * `Array.isArray` intakt, auf die sich toArray()/getNode() verlassen.
 */
function rekorder(rohdaten) {
    const pfade = new Set();
    const einpacken = (ziel, praefix) => new Proxy(ziel, {
        get(obj, prop) {
            if (typeof prop === 'symbol') return obj[prop];
            const pfad = praefix ? `${praefix}.${prop}` : prop;
            pfade.add(pfad);
            const wert = obj[prop];
            return istEinfachesObjekt(wert) ? einpacken(wert, pfad) : wert;
        },
    });
    return { store: einpacken(rohdaten, ''), pfade };
}

/**
 * Zwei Ausgangslagen, weil Prüfungen verzweigen: `showElementModal === true &&
 * elementModal.mode === 'area'` erreicht den zweiten Pfad nur, wenn der erste
 * zutrifft. Mit nur einer Vorlage bliebe die Hälfte der Pfade ungesehen.
 */
const LEER = () => ({
    areas: [],
    nodes: new Map(),
    edges: new Map(),
    inspections: [],
    terrain: null,
    history: { undoStack: [], redoStack: [] },
    ui: {
        demImportPanelOpen: false,
        showElementModal: false,
        elementModal: { mode: 'node', data: {} },
        showPreprocessingModal: false,
        showKostraModal: false,
    },
    rain: { method: 'model', intensity: 0, kostraData: null },
    simulation: { status: 'idle', error: null, preSolveWarnings: [] },
});

const VOLL = () => ({
    areas: [{ id: 'F1', runoffCoeff: 0.2, slope: 3, edgeId: 'R_019' }],
    nodes: new Map([
        ['AL1_RBB', { id: 'AL1_RBB', bauwerkstyp: 5 }],
        ['AL2_RRB', { id: 'AL2_RRB', bauwerkstyp: 5 }],
    ]),
    edges: new Map([['R_019', { id: 'R_019' }]]),
    inspections: [],
    terrain: { ncols: 10, nrows: 10 },
    history: { undoStack: [{}], redoStack: [] },
    ui: {
        demImportPanelOpen: true,
        showElementModal: true,
        elementModal: { mode: 'area', data: {} },
        showPreprocessingModal: true,
        showKostraModal: true,
    },
    rain: { method: 'kostra', intensity: 120, kostraData: { 5: { RN_001A: 200 } } },
    simulation: { status: 'success', error: null, preSolveWarnings: [{ id: 'A' }] },
});

/** Alle Pfade, die `fn` über beide Ausgangslagen hinweg anfasst. */
function gelesenePfade(fn) {
    const alle = new Set();
    for (const vorlage of [LEER, VOLL]) {
        const { store, pfade } = rekorder(vorlage());
        try {
            fn(store);
        } catch {
            // Eine Prüfung, die auf einer Attrappe stolpert, hat ihre Pfade
            // bis dahin schon hinterlassen — die zählen trotzdem.
        }
        pfade.forEach(p => alle.add(p));
    }
    return alle;
}

describe('Fortschritts-Signale decken ab, was die Schritte prüfen', () => {
    const gebraucht = gelesenePfade((store) => {
        const snapshot = makeSnapshot(store);
        for (const step of EXERCISE_STEPS) {
            if (typeof step.check === 'function') step.check(store, snapshot);
            if (typeof step.requires === 'function') step.requires(store, snapshot);
        }
    });

    const beobachtet = gelesenePfade(leseFortschrittsSignale);

    it('das Messgerät funktioniert überhaupt', () => {
        // Schutz vor dem stillen Totalausfall: ein Proxy, der nichts
        // aufzeichnet, liesse jede folgende Prüfung durchgehen.
        expect(gebraucht.size).toBeGreaterThan(5);
        expect(beobachtet.size).toBeGreaterThan(5);
        expect(gebraucht).toContain('ui.showKostraModal');
        expect(beobachtet).toContain('simulation.status');
    });

    it('jeder Pfad, den eine Prüfung liest, wird auch beobachtet', () => {
        const blind = Array.from(gebraucht).filter(p => !beobachtet.has(p)).sort();
        expect(blind, `Nicht beobachtet -> der Schritt bliebe stumm haengen: ${blind.join(', ')}`)
            .toEqual([]);
    });

    /**
     * Sammelmelder: Änderungen INNERHALB einer Sammlung (ein geänderter
     * Abflussbeiwert) verändern weder `areas.length` noch `nodes.size`. Der
     * Pfadvergleich oben kann das nicht sehen — er endet an der Sammlung.
     * Aufgefangen wird es von `history.undoStack.length`, weil jede mutierende
     * Store-Aktion saveHistory() ruft. Fällt der Sammelmelder weg, hakt es
     * genau bei den Aufgaben, die Werte an bestehenden Elementen einfordern
     * (ex-runoff-coeff, ex-slope).
     */
    it('für Änderungen innerhalb der Sammlungen gibt es den Sammelmelder', () => {
        const sammlungen = ['areas', 'nodes', 'edges'];
        const benutzt = sammlungen.filter(s => gebraucht.has(s));
        expect(benutzt.length).toBeGreaterThan(0);
        expect(beobachtet).toContain('history.undoStack');
    });
});
