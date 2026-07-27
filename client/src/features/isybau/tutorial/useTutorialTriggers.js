import { watch } from 'vue';
import { useIsybauStore } from '../store/index.js';
import { useTutorialGuide } from './useTutorialGuide.js';
import { useEzgLayer } from '../composables/useEzgLayer.js';

/**
 * Beobachtet den isybau-Store und übersetzt Zustandsänderungen in
 * Tutorial-Trigger. Einmal im TutorialMascot gemountet — der Store selbst
 * bleibt komplett tutorial-frei (keine Kopplung in Actions, nichts davon
 * landet in Undo-Snapshots oder Projektdateien).
 *
 * In einem setup()-Kontext aufrufen, damit Vue die Watcher automatisch
 * beim Unmount aufräumt.
 */
export function useTutorialTriggers() {
  const store = useIsybauStore();
  const { trigger } = useTutorialGuide();

  // Netz-Größe: ein XML-/Projekt-Import lädt viele Knoten auf einmal,
  // der Editor fügt genau einen hinzu.
  watch(
    () => store.nodes.size,
    (size, oldSize) => {
      if (oldSize === 0 && size >= 2) trigger('xml-imported', store);
      else if (size === oldSize + 1) trigger('first-element-created', store);
    }
  );

  // Erste selbst gezeichnete Haltung zählt auch als "erstes Element".
  watch(
    () => store.edges.size,
    (size, oldSize) => {
      if (size === oldSize + 1 && store.nodes.size <= 3) {
        trigger('first-element-created', store);
      }
    }
  );

  watch(
    () => store.ui.importWarnings,
    (warnings) => {
      if (warnings && warnings.length > 0) trigger('import-warnings', store);
    }
  );

  watch(
    () => [store.rain.activeModelRain, store.rain.kostraData],
    ([modelRain, kostra], [oldModelRain, oldKostra]) => {
      const changed = modelRain !== oldModelRain || kostra !== oldKostra;
      if (changed && (modelRain || kostra)) trigger('rain-configured', store);
    }
  );

  watch(
    () => store.simulation.status,
    (status) => {
      if (status === 'running') trigger('simulation-running', store);
      else if (status === 'success') trigger('simulation-success', store);
      else if (status === 'error') trigger('simulation-error', store);
    }
  );

  // "Neu starten": Standort setzt den Georeferenz-Anker fuer ein leeres Projekt.
  watch(
    () => store.metadata.originAnchor,
    (anchor, oldAnchor) => {
      if (anchor && !oldAnchor) trigger('location-set', store);
    }
  );

  // Eigenes DGM ersetzt die grobe EZG-Hoehenlinien-Naeherung.
  watch(
    () => store.terrain,
    (terrain, oldTerrain) => {
      if (terrain && !oldTerrain) trigger('terrain-imported', store);
    }
  );

  // ezgLayer.enabled lebt als Modul-Singleton in useEzgLayer.js, nicht im Store.
  const ezgLayer = useEzgLayer();
  watch(ezgLayer.enabled, (enabled) => {
    if (enabled) trigger('ezg-enabled', store);
  });

  watch(
    () => store.ui.darkMode,
    () => trigger('theme-toggled', store)
  );
}
