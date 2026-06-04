import { ref } from 'vue';

/**
 * useToolStateMachine.js
 *
 * Wiederverwendbarer Lebenszyklus-Vertrag für Zeichenwerkzeuge im Map-Editor.
 * Kapselt die drei Zustände, in denen sich jedes Tool befindet, sowie eine
 * einheitliche Tastatur-Belegung (Escape/Enter/Backspace).
 *
 * Zustände:
 *   IDLE    – bereit, noch kein Punkt gesetzt
 *   DRAWING – Form wird aktiv gezeichnet (Punkte werden hinzugefügt)
 *   REVIEW  – Form fertig gezeichnet, Vorschau sichtbar, wartet auf commit/cancel
 *
 * Einheitliche Tastatur (über attachShortcuts gebunden):
 *   Escape    → onCancel  (REVIEW: verwerfen / DRAWING: abbrechen → IDLE)
 *   Enter     → onConfirm (DRAWING: abschließen → REVIEW)
 *   Backspace → onUndo    (DRAWING: letzten Punkt entfernen)
 *
 * Verwendung in einem Tool:
 *   const sm = useToolStateMachine();
 *   activate()   → sm.attachShortcuts({ onCancel, onConfirm, onUndo }); sm.setIdle();
 *   deactivate() → sm.detachShortcuts();
 *   sm.state wird nach außen exportiert, damit die UI mode-visibility zeigen kann.
 */
export const TOOL_STATE = {
    IDLE: 'IDLE',
    DRAWING: 'DRAWING',
    REVIEW: 'REVIEW',
};

export function useToolStateMachine(initial = TOOL_STATE.IDLE) {
    const state = ref(initial);

    const setIdle = () => { state.value = TOOL_STATE.IDLE; };
    const setDrawing = () => { state.value = TOOL_STATE.DRAWING; };
    const setReview = () => { state.value = TOOL_STATE.REVIEW; };

    let keyHandler = null;

    /**
     * Registriert einen window-keydown-Listener, der die einheitlichen
     * Tastenkürzel auf die übergebenen Callbacks mappt.
     * @param {{ onCancel?: Function, onConfirm?: Function, onUndo?: Function }} handlers
     */
    const attachShortcuts = (handlers = {}) => {
        detachShortcuts(); // Doppelte Registrierung vermeiden
        keyHandler = (e) => {
            // Tippt der User gerade in ein Eingabefeld? Dann nicht abfangen.
            const tag = e.target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                handlers.onCancel?.();
            } else if (e.key === 'Enter') {
                handlers.onConfirm?.();
            } else if (e.key === 'Backspace') {
                e.preventDefault(); // Browser-Zurück-Navigation verhindern
                handlers.onUndo?.();
            }
        };
        window.addEventListener('keydown', keyHandler);
    };

    const detachShortcuts = () => {
        if (keyHandler) {
            window.removeEventListener('keydown', keyHandler);
            keyHandler = null;
        }
    };

    return {
        state,
        TOOL_STATE,
        setIdle,
        setDrawing,
        setReview,
        attachShortcuts,
        detachShortcuts,
    };
}
