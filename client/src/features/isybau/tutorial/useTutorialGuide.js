import { ref } from 'vue';
import { TOUR_STEPS, REACTIVE_STEPS, EXIT_CONFIRM_STEP, KILL_STEPS } from './tutorialSteps.js';

// Module-level (singleton) state: any component or store watcher can import
// this composable and call trigger(name) — the mascot reacts wherever it's
// mounted, without prop-drilling a "current step" through the view tree.
const activeStep = ref(null); // { ...step, message: <resolved string>, isTour, kind? }
const tourActive = ref(false);
const tourIndex = ref(0);
const killed = ref(false); // Ratte wurde „erschossen" — Ruhe bis zum nächsten Seitenladen
const infoOpen = ref(false); // „Mehr dazu"-Lernkarte sichtbar?
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

function showTourStep() {
  const step = TOUR_STEPS[tourIndex.value];
  setActiveStep({ ...step, message: resolveMessage(step), isTour: true });
}

function startTour() {
  if (killed.value) return; // erschossen bleibt erschossen (bis Reload/Reset)
  clearTimeout(killTimer);
  tourActive.value = true;
  tourIndex.value = 0;
  showTourStep();
}

function finishTour() {
  tourActive.value = false;
  setActiveStep(null);
}

function next() {
  if (!tourActive.value) return;
  if (tourIndex.value + 1 >= TOUR_STEPS.length) {
    finishTour();
    return;
  }
  tourIndex.value += 1;
  showTourStep();
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
 * Zentraler Ereignis-Eingang. Während der Tour zählen Trigger nur als
 * advanceOn-Signal des aktuellen Steps; danach zeigen sie den passenden
 * reaktiven Kommentar. `context` (i.d.R. der Store) geht an message-Funktionen.
 */
function trigger(name, context) {
  if (killed.value) return;
  // Rückfrage/Kill-Sequenz nicht durch reaktive Kommentare unterbrechen
  if (activeStep.value?.kind) return;
  if (tourActive.value) {
    if (activeStep.value?.advanceOn === name) next();
    return;
  }
  const step = REACTIVE_STEPS[name];
  if (!step) return;
  if (step.once && firedOnce.has(step.id)) return;
  firedOnce.add(step.id);
  setActiveStep({ ...step, message: resolveMessage(step, context), isTour: false });
}

function dismiss() {
  if (activeStep.value?.kind === 'kill') return; // Sequenz läuft durch
  // [x] beendet still — die Rückfrage kommt nur über den „Tour beenden"-Button
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
  tourIndex.value = 0;
  killed.value = false;
  firedOnce = new Set();
}

export function useTutorialGuide() {
  return {
    activeStep,
    tourActive,
    killed,
    infoOpen,
    toggleInfo,
    startTour,
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
