import { ref, computed, unref } from 'vue';

/**
 * Einheitliches Hover-Einklappen für alle Tool-Panels (Referenz: ShovelTool).
 *
 * Verhalten:
 *  - Im Ruhezustand ist nur die Header-Pille sichtbar; Hover klappt den Inhalt aus.
 *  - Klappt auch WÄHREND der Bearbeitung ein, sobald die Maus das Panel verlässt,
 *    damit das Panel den Viewport nicht dauerhaft verdeckt.
 *  - `forceOpen` hält das Panel nur für echte modale Momente offen (Bestätigen/
 *    Review-Popups) — nicht fürs normale Zeichnen/Editieren.
 *
 * @param {Object}   [opts]
 * @param {number}   [opts.closeDelay=200]  ms bis zum Einklappen nach mouseleave
 * @param {Ref|Function|boolean} [opts.forceOpen]  hält das Panel offen (z.B. Review)
 * @returns {{ hovered, onPanelEnter, onPanelLeave, panelVisible }}
 */
export function useCollapsiblePanel(opts = {}) {
  const { closeDelay = 200, forceOpen = false } = opts;

  const hovered = ref(false);
  let closeTimer = null;

  const onPanelEnter = () => {
    clearTimeout(closeTimer);
    hovered.value = true;
  };
  const onPanelLeave = () => {
    closeTimer = setTimeout(() => { hovered.value = false; }, closeDelay);
  };

  const isForced = () =>
    typeof forceOpen === 'function' ? !!forceOpen() : !!unref(forceOpen);

  const panelVisible = computed(() => hovered.value || isForced());

  return { hovered, onPanelEnter, onPanelLeave, panelVisible };
}
