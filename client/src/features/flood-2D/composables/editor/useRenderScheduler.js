/**
 * useRenderScheduler.js
 *
 * Entscheidet pro Frame, ob der Editor überhaupt neu zeichnen muss. Vorher lief
 * MapEditor3D stur mit 60 fps, auch wenn sich nichts bewegte — dauerhafte GPU-Last
 * (Lüfter/Akku) und genau die Frame-Zeit, die beim Zeichnen fehlte.
 *
 * Ein Bild wird gezeichnet, wenn EINES davon zutrifft:
 *   1. die Kamera hat sich bewegt — das meldet OrbitControls.update() selbst per
 *      Rückgabewert und deckt damit auch das Ausklingen des Dampings ab;
 *   2. jemand hat requestRender() gerufen (Layer-Rebuild, Werkzeug-Vorschau, Auswahl …);
 *   3. wir sind im Aktivitätsfenster nach einer Eingabe (deckt mehrstufige Interaktionen
 *      und asynchrone Nachläufer ab, ohne dass jedes Werkzeug sich melden muss);
 *   4. Sicherheitsnetz: seit `heartbeatMs` wurde gar nicht gezeichnet.
 *
 * Zu (4): Sollte irgendwo eine Render-Anforderung fehlen, veraltet das Bild dadurch
 * höchstens eine Sekunde, statt dauerhaft einzufrieren. Ein eingefrorenes Ansichtsfenster
 * wäre schlimmer als die ~1 fps Grundlast, die dieses Netz kostet.
 *
 * Die Zeit wird hereingereicht (`now`), damit die Logik ohne Timer testbar bleibt.
 */

export function useRenderScheduler({ heartbeatMs = 1000 } = {}) {
    let requested = true;    // allererstes Bild immer zeichnen
    let activeUntil = 0;
    let lastRender = -Infinity;
    const stats = { rendered: 0, skipped: 0 };

    /**
     * Bild anfordern.
     * @param {number} [holdMs=0]  zusätzlich so lange durchgehend zeichnen (Nachläufer)
     * @param {number} [now]
     */
    function request(holdMs = 0, now = nowMs()) {
        requested = true;
        if (holdMs > 0) activeUntil = Math.max(activeUntil, now + holdMs);
    }

    /**
     * Einmal pro Frame aufrufen. Liefert true, wenn gezeichnet werden soll — und
     * quittiert in dem Fall die offene Anforderung.
     * @param {boolean} cameraMoved  Rückgabewert von controls.update()
     * @param {number} [now]
     */
    function tick(cameraMoved, now = nowMs()) {
        const due = !!cameraMoved
            || requested
            || now < activeUntil
            || (now - lastRender) >= heartbeatMs;
        if (due) {
            requested = false;
            lastRender = now;
            stats.rendered++;
        } else {
            stats.skipped++;
        }
        return due;
    }

    /** Nur für Tests/Diagnose: gezeichnete vs. übersprungene Frames. */
    function getStats() { return { ...stats }; }

    return { request, tick, getStats };
}

function nowMs() {
    return (typeof performance !== 'undefined' && performance.now)
        ? performance.now() : Date.now();
}
