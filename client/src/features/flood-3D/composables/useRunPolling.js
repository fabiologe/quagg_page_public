// Wiederkehrendes Nachladen, solange Läufe aktiv sind: EIN Intervall,
// das mit dem Aktiv-Zustand an- und ausgeht und beim Unmount sicher
// aufgeräumt wird. Vorher stand dieselbe watch/setInterval/clearInterval-
// Mechanik dreimal (RunListPanel, RunLogPanel, CaseRunsPanel) — jede
// Kopie eine Gelegenheit, das Aufräumen zu vergessen.
import { onBeforeUnmount, watch } from 'vue'

/**
 * @param {import('vue').Ref|import('vue').ComputedRef} aktivRef
 *   solange truthy, läuft das Intervall
 * @param {Function} tick  wird je Intervallschritt aufgerufen
 * @param {number} intervallMs
 */
export function useRunPolling(aktivRef, tick, intervallMs) {
  let timer = null

  const stop = () => {
    clearInterval(timer)
    timer = null
  }

  watch(aktivRef, (aktiv) => {
    stop()
    if (aktiv) timer = setInterval(tick, intervallMs)
  }, { immediate: true })

  onBeforeUnmount(stop)
}
