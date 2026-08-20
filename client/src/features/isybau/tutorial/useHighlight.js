import { watch, onUnmounted } from 'vue';
import { useTutorialGuide } from './useTutorialGuide.js';
import { resolveStepHighlight } from './tutorialExercise.js';
import './tutorial.css';

const HIGHLIGHT_CLASS = 'sv-tutorial-highlight';

/**
 * Hebt das UI-Element des aktiven Tutorial-Steps hervor (Terminal-Glow).
 * Ziel-Elemente tragen ein data-tutorial="<anker>"-Attribut — mehr müssen
 * Komponenten vom Tutorial nicht wissen. In einem setup()-Kontext aufrufen.
 *
 * @param {object} store Der isybau-Store. Nötig, weil `highlight` eine
 *        Funktion des Zustands sein darf (siehe resolveStepHighlight): der
 *        Watcher unten liest den Store IM Getter, Vue verfolgt die Zugriffe,
 *        und das Leuchten wandert mit, wenn der Nutzer mitten im Schritt
 *        ein Fenster schließt.
 */
export function useHighlight(store) {
  const { activeStep } = useTutorialGuide();
  let currentEls = [];
  let retryTimers = [];

  function clear() {
    retryTimers.forEach(clearTimeout);
    retryTimers = [];
    currentEls.forEach((el) => el.classList.remove(HIGHLIGHT_CLASS));
    currentEls = [];
  }

  // Das Ziel kann in einer noch nicht gemounteten Ansicht liegen (v-if) —
  // ein paar kurze Retries überbrücken das, ohne einen MutationObserver.
  function applyOne(anchor, attempt = 0) {
    const el = document.querySelector(`[data-tutorial="${anchor}"]`);
    if (el) {
      el.classList.add(HIGHLIGHT_CLASS);
      currentEls.push(el);
      return;
    }
    if (attempt < 5) {
      retryTimers.push(setTimeout(() => applyOne(anchor, attempt + 1), 300));
    }
  }

  // resolveStepHighlight liefert IMMER eine Liste (oder null) — ein Step darf
  // auch zwei gleichwertige Wege zeigen, wie "XML importieren" vs. "Neu starten".
  // Der Getter liest den Store nur dort, wo ein Schritt es wirklich tut: bei
  // festen Ankern hängt er allein am activeStep, bei einer highlight-Funktion
  // zusätzlich an genau den Feldern, die sie anfasst (z.B. ui.showKostraModal).
  // Vue verfolgt das von selbst — es braucht also weder `deep` noch eine
  // Signalliste, und unbeteiligte Store-Schreibvorgänge lösen nichts aus.
  watch(
    () => resolveStepHighlight(activeStep.value, store),
    (anchors) => {
      clear();
      anchors?.forEach((a) => applyOne(a));
    },
    { immediate: true, flush: 'post' }
  );

  onUnmounted(clear);
}
