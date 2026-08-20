import { ref, computed } from 'vue';

/**
 * Zeichen-Vorschau ("zeig mir, WO ich zeichnen soll").
 *
 * Singleton im Hausstil von useElementFocus.js: Modul-Level-Refs, damit
 * Tutorial (Setzer) und Viewer (Zeichner) sich nicht kennen müssen.
 *
 * Abgrenzung zu useElementFocus: der Fokus umkreist ein Element, das es
 * GIBT. Diese Vorschau zeigt einen Umriss, den es noch NICHT gibt — den
 * der Nutzer erst anlegen soll. Deshalb hält sie rohe Weltkoordinaten
 * statt einer Element-Referenz.
 *
 * Der Viewer zeichnet daraus einen gestrichelten Geisterumriss, der sich
 * in Schleife selbst nachzieht, plus nummerierte Klickpunkte. Die
 * eigentliche Bewegung macht CSS (stroke-dashoffset) — bewusst keine
 * rAF-Schleife: die Vorschau steht u.U. minutenlang, und eine Endlos-
 * Animation über JS würde dabei dauerhaft Rechenzeit ziehen.
 */
const hintPoints = ref(null); // [{x, y}, …] in Weltkoordinaten oder null
const hintToken = ref(0);     // erzwingt Neustart der Animation bei gleichem Umriss

/**
 * @param {Array<{x:number,y:number}>|null} points Mindestens 2 Punkte; alles
 *        andere löscht die Vorschau (statt einen kaputten Umriss zu zeigen).
 */
function showDrawingHint(points) {
    const valid = Array.isArray(points)
        ? points.filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y))
        : [];
    if (valid.length < 2) { clearDrawingHint(); return; }
    hintPoints.value = valid.map(p => ({ x: p.x, y: p.y }));
    hintToken.value += 1;
}

function clearDrawingHint() {
    hintPoints.value = null;
}

/** Für die Kamera: dieselbe Punktliste als Spotlight-Ziel (siehe spotlightTarget). */
const hintFocusTarget = computed(() =>
    hintPoints.value ? { type: 'points', points: hintPoints.value } : null);

/** Tests/Hot-Reload-Hygiene. */
function resetDrawingHint() {
    hintPoints.value = null;
    hintToken.value = 0;
}

// Singleton-Zustand überlebt Vite-HMR nicht (frische refs, alte Halter) —
// siehe gleichlautenden Kommentar in tutorial/useTutorialGuide.js.
if (import.meta.hot) {
    import.meta.hot.accept(() => {
        import.meta.hot.invalidate('Zeichen-Vorschau ist ein Singleton — voller Reload noetig');
    });
}

export function useDrawingHint() {
    return { hintPoints, hintToken, hintFocusTarget, showDrawingHint, clearDrawingHint, resetDrawingHint };
}
