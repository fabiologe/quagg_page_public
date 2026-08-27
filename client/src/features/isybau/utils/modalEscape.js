/**
 * modalEscape.js — welches Modal bei Escape weicht.
 *
 * Als reine Funktion getrennt vom Listener, damit die Reihenfolge geprueft
 * werden kann, ohne elf Modals zu rendern. Verdrahtet wird sie in
 * components/modals/IsybauModals.vue.
 *
 * Die Reihenfolge ist der eigentliche Inhalt: oben stehen die Dialoge, die
 * UEBER anderen erscheinen koennen - Bestaetigungen und Auswahldialoge. Je
 * Tastendruck weicht genau eines, wie man es von einem Modal-Stapel erwartet.
 */

export const ESC_REIHENFOLGE = [
  'showEzgCrsModal',              // Bestaetigung waehrend eines Imports
  'showNewProjectLocationModal',  // Standortwahl beim Neustart
  'showElementModal',             // Element-Formular, oft ueber der Liste
  'showDebugModal',
  'showProjectManager',
  'showHelpModal',
  'showResultsModal',
  'showRainModal',
  'showKostraModal',
  'showPreprocessingModal',       // die grosse Datenmaske, meist die unterste
];

/** Name des Sichtbarkeits-Flags, das Escape schliessen soll - oder null. */
export function obersteOffene(ui) {
  if (!ui) return null;
  return ESC_REIHENFOLGE.find((flag) => ui[flag]) ?? null;
}
