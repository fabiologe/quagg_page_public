import { watch, onUnmounted } from 'vue';
import { useTutorialGuide } from './useTutorialGuide.js';
import './tutorial.css';

const HIGHLIGHT_CLASS = 'sv-tutorial-highlight';

/**
 * Hebt das UI-Element des aktiven Tutorial-Steps hervor (Terminal-Glow).
 * Ziel-Elemente tragen ein data-tutorial="<anker>"-Attribut — mehr müssen
 * Komponenten vom Tutorial nicht wissen. In einem setup()-Kontext aufrufen.
 */
export function useHighlight() {
  const { activeStep } = useTutorialGuide();
  let current = null;
  let retryTimer = null;

  function clear() {
    clearTimeout(retryTimer);
    retryTimer = null;
    if (current) {
      current.classList.remove(HIGHLIGHT_CLASS);
      current = null;
    }
  }

  // Das Ziel kann in einer noch nicht gemounteten Ansicht liegen (v-if) —
  // ein paar kurze Retries überbrücken das, ohne einen MutationObserver.
  function apply(anchor, attempt = 0) {
    const el = document.querySelector(`[data-tutorial="${anchor}"]`);
    if (el) {
      el.classList.add(HIGHLIGHT_CLASS);
      current = el;
      return;
    }
    if (attempt < 5) {
      retryTimer = setTimeout(() => apply(anchor, attempt + 1), 300);
    }
  }

  watch(
    () => activeStep.value?.highlight,
    (anchor) => {
      clear();
      if (anchor) apply(anchor);
    },
    { immediate: true, flush: 'post' }
  );

  onUnmounted(clear);
}
