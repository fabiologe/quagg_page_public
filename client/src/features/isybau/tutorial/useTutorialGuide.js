import { ref } from 'vue';
import { WELCOME_STEP, REACTIVE_STEPS, EXIT_CONFIRM_STEP, KILL_STEPS } from './tutorialSteps.js';
import { EXERCISE_STEPS, isStepComplete, makeSnapshot } from './tutorialExercise.js';

// Module-level (singleton) state: any component or store watcher can import
// this composable and call trigger(name) — the mascot reacts wherever it's
// mounted, without prop-drilling a "current step" through the view tree.
const activeStep = ref(null); // { ...step, message: <resolved string>, isTour, kind? }
// „Die Tour“ ist seit dem Umbau nur noch die Begrüßung. Das Flag bleibt
// trotzdem gebraucht: es hält reaktive Kommentare zurück, solange das Angebot
// „Tutorial starten“ steht (siehe trigger()).
const tourActive = ref(false);
const killed = ref(false); // Ratte wurde „erschossen" — Ruhe bis zum nächsten Seitenladen
const infoOpen = ref(false); // „Mehr dazu"-Lernkarte sichtbar?
// ── Übungs-Modus (interaktive Werkstatt, siehe tutorialExercise.js) ──────────
const exerciseActive = ref(false);
const exerciseIndex = ref(0);
const exerciseDone = ref(false); // aktueller Schritt erfüllt?
let exerciseSnapshot = null;     // Ausgangszustand bei Übungsstart
let exerciseStore = null;        // Store der laufenden Übung (für `requires`)
let firedOnce = new Set(); // once:true-Steps, die diese Sitzung schon liefen
let killTimer = null;

function resolveMessage(step, context) {
  return typeof step.message === 'function' ? step.message(context) : step.message;
}

// Jede Step-Änderung läuft hier durch — die Lernkarte gehört immer zum
// aktuellen Step und schließt daher bei jedem Wechsel automatisch.
function setActiveStep(value) {
  infoOpen.value = false;
  activeStep.value = value;
}

function toggleInfo() {
  if (!activeStep.value?.info) return;
  infoOpen.value = !infoOpen.value;
}

function startTour() {
  if (killed.value) return; // erschossen bleibt erschossen (bis Reload/Reset)
  clearTimeout(killTimer);
  tourActive.value = true;
  setActiveStep({ ...WELCOME_STEP, message: resolveMessage(WELCOME_STEP), isTour: true });
}

function finishTour() {
  tourActive.value = false;
  setActiveStep(null);
}

// [Weiter] gibt es nur im Übungs-Modus — die Begrüßung bietet ausschließlich
// „Tutorial starten“ und „Tour beenden“ an.
function next() {
  if (exerciseActive.value) nextExercise();
}

// ── Übungs-Modus ────────────────────────────────────────────────────────────
// Anders als die Tour schaltet hier nicht ein Ereignis weiter, sondern der
// tatsächliche Zustand des Netzes (check(store, snapshot) in tutorialExercise).

// Erzählschritte (Begrüßung, Orientierung) zählen NICHT als Aufgabe — sonst
// stünde bei der ersten echten Aufgabe „5 von 11“ und der Fortschritt wirkte
// größer, als er ist. Gezählt wird nur, was der Nutzer wirklich tun muss.
// `optional: true` schließt Schritte aus, die zwar von selbst weiterschalten,
// aber keine Aufgabe sind (z.B. das DGM-Angebot — Ablehnen ist kein Fehler).
const TASK_STEPS = EXERCISE_STEPS.filter((s) => typeof s.check === 'function' && !s.optional);

function showExerciseStep() {
  const step = EXERCISE_STEPS[exerciseIndex.value];
  exerciseDone.value = false;
  const taskIndex = TASK_STEPS.indexOf(step);
  setActiveStep({
    ...step,
    message: resolveMessage(step),
    isTour: false,
    kind: 'exercise',
    // nur auf Aufgaben-Schritten gesetzt (sonst null -> Anzeige bleibt leer)
    taskNumber: taskIndex >= 0 ? taskIndex + 1 : null,
    taskCount: TASK_STEPS.length,
  });
}

/**
 * Startet die Übung. Das Netz wird NICHT hier geladen — der Aufrufer
 * (TutorialMascot) lädt es vorher, damit der Ausgangszustand korrekt
 * eingefroren werden kann.
 */
function startExercise(store) {
  if (killed.value) return;
  clearTimeout(killTimer);
  tourActive.value = false;
  exerciseActive.value = true;
  exerciseIndex.value = 0;
  exerciseSnapshot = makeSnapshot(store);
  exerciseStore = store;
  showExerciseStep();
}

function finishExercise() {
  exerciseActive.value = false;
  exerciseSnapshot = null;
  exerciseStore = null;
  setActiveStep(null);
}

// Ein Schritt mit `requires` gilt nur in einem bestimmten Zustand. Fehlt der,
// wird er übersprungen statt ins Leere zu zeigen: wer das DGM-Angebot ausschlägt,
// darf nicht auf einem Schritt landen, der zu einem "Importieren"-Knopf lotst,
// den es gar nicht gibt.
function stepApplies(step) {
  return typeof step?.requires !== 'function' || !!step.requires(exerciseStore, exerciseSnapshot);
}

// Ist der Schritt schon erfüllt, bevor die Ratte ihn überhaupt ausspricht?
// Passiert regelmäßig: der Nutzer füllt ein Formular in einem Rutsch aus, oder
// das Übungsnetz bringt einen Wert bereits mit. Ihn dann trotzdem einzufordern,
// wäre gelogen — also überspringen. Schritte mit `autoAdvance: false` wollen
// ausdrücklich stehen bleiben und sind ausgenommen.
function alreadyDone(step) {
  return typeof step?.check === 'function'
    && step.autoAdvance !== false
    && isStepComplete(step, exerciseStore, exerciseSnapshot);
}

function nextExercise() {
  if (!exerciseActive.value) return;
  let i = exerciseIndex.value + 1;
  while (i < EXERCISE_STEPS.length
      && (!stepApplies(EXERCISE_STEPS[i]) || alreadyDone(EXERCISE_STEPS[i]))) i += 1;
  if (i >= EXERCISE_STEPS.length) {
    finishExercise();
    return;
  }
  exerciseIndex.value = i;
  showExerciseStep();
}

/**
 * Vom Store-Watcher bei jeder Netzänderung aufgerufen: prüft, ob die aktuelle
 * Aufgabe erledigt ist. Erzählschritte (ohne `check`) bleiben unberührt.
 */
function evaluateExercise(store) {
  if (!exerciseActive.value) return;
  const step = EXERCISE_STEPS[exerciseIndex.value];
  if (!step || typeof step.check !== 'function') return;
  const done = isStepComplete(step, store, exerciseSnapshot);
  if (done === exerciseDone.value) return;
  exerciseDone.value = done;
  if (done && step.autoAdvance !== false) nextExercise();
}

// „Tour beenden" beendet nicht sofort, sondern stellt erst die Gretchenfrage.
function skipTour() {
  tourActive.value = false;
  setActiveStep({ ...EXIT_CONFIRM_STEP, kind: 'confirm', isTour: false });
}

// Rückfrage: „Ja, will dich wieder sehen" → Ratte verschwindet friedlich,
// reaktiver Modus bleibt an.
function confirmYes() {
  setActiveStep(null);
}

// „Nein" → Kill-Sequenz (Schuss + Platzhalter-Abgang), danach ist für den
// Rest der Sitzung Ruhe.
function confirmNo() {
  runKillStep(0);
}

function runKillStep(index) {
  if (index >= KILL_STEPS.length) {
    killed.value = true;
    setActiveStep(null);
    return;
  }
  const step = KILL_STEPS[index];
  setActiveStep({ ...step, kind: 'kill', isTour: false, message: null });
  killTimer = setTimeout(() => runKillStep(index + 1), step.duration);
}

// Neustart aus dem Hilfe-Modal (vergisst once-Merker und erweckt eine
// erschossene Ratte wieder zum Leben).
function resetAndStartTour() {
  firedOnce = new Set();
  killed.value = false;
  startTour();
}

/**
 * Zentraler Ereignis-Eingang für reaktive Kommentare auf Nutzer-Aktionen.
 * `context` (i.d.R. der Store) geht an message-Funktionen.
 */
function trigger(name, context) {
  if (killed.value) return;
  // Rückfrage/Kill-Sequenz nicht durch reaktive Kommentare unterbrechen
  if (activeStep.value?.kind) return;
  // Solange die Begrüßung steht, keine reaktiven Kommentare dazwischenfunken —
  // das Angebot "Tutorial starten" soll stehen bleiben, bis der Nutzer wählt.
  // (Früher wurde hier zusätzlich `advanceOn` ausgewertet, um die mehrstufige
  // Führung weiterzuschalten. Die ist entfallen, das Feld gibt es nicht mehr.)
  if (tourActive.value) return;
  const step = REACTIVE_STEPS[name];
  if (!step) return;
  if (step.once && firedOnce.has(step.id)) return;
  firedOnce.add(step.id);
  setActiveStep({ ...step, message: resolveMessage(step, context), isTour: false });
}

function dismiss() {
  if (activeStep.value?.kind === 'kill') return; // Sequenz läuft durch
  // [x] beendet still — die Rückfrage kommt nur über den „Tour beenden"-Button
  if (exerciseActive.value) {
    finishExercise();
    return;
  }
  if (tourActive.value) {
    finishTour();
    return;
  }
  setActiveStep(null);
}

// Kompletter Reset (Tests / Hot-Reload-Hygiene).
function resetGuideState() {
  clearTimeout(killTimer);
  activeStep.value = null;
  infoOpen.value = false;
  tourActive.value = false;
  exerciseActive.value = false;
  exerciseIndex.value = 0;
  exerciseDone.value = false;
  exerciseSnapshot = null;
  exerciseStore = null;
  killed.value = false;
  firedOnce = new Set();
}

/* Dieses Modul haelt Singleton-Zustand (die refs ganz oben). Beim Hot-Reload
   wuerde Vite es austauschen und dabei FRISCHE refs anlegen — Komponenten, die
   noch die alten halten (TutorialMascot ueber activeStep, useHighlight ueber
   denselben ref), horchen dann auf etwas, das niemand mehr beschreibt. Sichtbar
   wird das als "die Sprechblase laeuft, aber nichts leuchtet mehr gruen".
   Deshalb: bei Aenderung an dieser Datei die Seite komplett neu laden. */
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot.invalidate('Tutorial-Zustand ist ein Singleton — voller Reload noetig');
  });
}

export function useTutorialGuide() {
  return {
    activeStep,
    tourActive,
    killed,
    infoOpen,
    toggleInfo,
    startTour,
    // Übungs-Modus
    exerciseActive,
    exerciseDone,
    startExercise,
    evaluateExercise,
    finishExercise,
    next,
    skipTour,
    confirmYes,
    confirmNo,
    resetAndStartTour,
    trigger,
    dismiss,
    resetGuideState,
  };
}
