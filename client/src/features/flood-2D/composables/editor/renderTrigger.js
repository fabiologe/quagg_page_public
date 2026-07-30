/**
 * renderTrigger.js
 *
 * Winzige Brücke zwischen „irgendetwas hat die 3D-Szene verändert" und dem Render-Loop
 * des Editors — analog zu historyBridge.js, und aus demselben Grund ohne Store-/
 * Komponenten-Importe: die Renderer-Composables dürfen MapEditor3D nicht kennen.
 *
 * Hintergrund: MapEditor3D rendert nicht mehr stur mit 60 fps, sondern nur noch, wenn
 * es etwas Neues zu zeigen gibt (Performance-Audit 2026-07-27). Kamerabewegungen
 * erkennt der Loop selbst über den Rückgabewert von OrbitControls.update(); ALLE
 * übrigen Änderungen — Layer-Rebuilds, Netz-Auswahl, Werkzeug-Vorschauen — müssen sich
 * hier melden.
 *
 * Der Ergebnis-Viewer (useResultScene) rendert bewusst weiter kontinuierlich: dort
 * läuft die zeitabhängige Wasser-Animation (uTime), die jedes Bild braucht.
 *
 * Benutzung im Renderer:
 *     import { requestRender } from './renderTrigger.js';
 *     … Szene verändert …
 *     requestRender();
 */

let _requestFn = null;

/** Vom Host (MapEditor3D) einmalig registriert. */
export function registerRenderRequester(fn) {
    _requestFn = fn;
}

/** Host wieder abmelden (onUnmounted) — verhindert Aufrufe in eine tote Szene. */
export function unregisterRenderRequester(fn) {
    if (_requestFn === fn) _requestFn = null;
}

/**
 * Fordert ein neues Bild an.
 * @param {number} [holdMs=0]  Optional: so viele Millisekunden lang durchgehend rendern
 *   (für Änderungen, die über mehrere Frames nachlaufen — z. B. Textur-Uploads oder
 *   asynchrone Nachläufer). 0 = genau ein Bild.
 */
export function requestRender(holdMs = 0) {
    _requestFn?.(holdMs);
}
