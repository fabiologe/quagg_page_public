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

  // highlight darf ein einzelner Anker ODER ein Array sein (z.B. wenn ein
  // Step zwei gleichwertige Wege zeigt, wie "XML importieren" vs. "Neu starten").
  function apply(anchorOrAnchors) {
    const anchors = Array.isArray(anchorOrAnchors) ? anchorOrAnchors : [anchorOrAnchors];
    anchors.forEach((a) => applyOne(a));
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
