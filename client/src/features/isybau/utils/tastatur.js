/**
 * Gehört ein Tastendruck dem fokussierten Bedienelement statt der Karte?
 * Entf/Rücktaste löschten das gewählte Element auch, wenn eine Auswahlliste
 * (PixelSelect, role="combobox" auf einem <div>), ein Knopf oder ein Fenster den
 * Fokus hatte — geprüft wurden nur INPUT/TEXTAREA/SELECT.
 * @param {Element|null} el  document.activeElement
 */
export function fokusInBedienelement(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(el.tagName)) return true;
    if (el.isContentEditable) return true;
    return !!el.closest?.('[role="combobox"], [role="listbox"], [role="option"], [role="dialog"], [contenteditable="true"]');
}
