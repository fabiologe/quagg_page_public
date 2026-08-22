/**
 * vFokus — setzt den Tastaturfokus auf ein Element, sobald es erscheint.
 *
 * Gedacht fuer das erste Eingabefeld eines Dialogs. Ohne das muss man erst
 * hineinklicken, bevor man tippen kann - bei einem Suchfeld wie in
 * NewProjectLocationModal ist das der ganze Zweck des Dialogs.
 *
 * Warum eine Direktive und nicht das autofocus-Attribut: die Modals werden per
 * v-if erzeugt und teilweise per <Teleport> woandershin gehaengt. autofocus
 * wirkt zuverlaessig nur beim ERSTEN Einfuegen eines Dokuments; wer denselben
 * Dialog zweimal oeffnet, bekaeme beim zweiten Mal keinen Fokus.
 *
 * preventScroll, damit das Fokussieren die Seite nicht verschiebt - besonders
 * in langen Formularen. Der Aufschub ueber requestAnimationFrame gibt einer
 * Einblend-Animation Zeit, sonst fokussiert man ein Element, das noch
 * display:none oder opacity:0 ist, und der Browser lehnt ab.
 *
 * Bewusst NICHT ueberall: PreprocessingModal hat 65 Felder, das erste ist eine
 * Tabellenzelle. Fokus darauf wuerde beim Oeffnen zu dieser Zeile springen.
 */
export const vFokus = {
  mounted(el, binding) {
    if (binding.value === false) return;
    requestAnimationFrame(() => {
      if (!el.isConnected) return;
      try { el.focus({ preventScroll: true }); } catch { el.focus?.(); }
    });
  },
};

export default vFokus;
