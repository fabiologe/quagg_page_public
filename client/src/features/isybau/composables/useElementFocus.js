/**
 * Element-Fokus: EIN Mechanismus, um im Viewer ein bestimmtes Netzelement
 * anzufahren und hervorzuheben.
 *
 * Module-level (Singleton) state wie useEzgLayer.js/useTutorialGuide.js — der
 * Auslöser (Preprocessing-Tabelle, Ergebnis-Liste, Tutorial-Ratte) und der
 * Viewer, der die Kamera bewegt, teilen sich denselben Zustand ohne
 * Prop-Drilling durch IsybauMain → IsybauEditor → IsybauViewer.
 *
 * Ersetzt den defekten `store.editor.focusTargetId`-Pfad, der nur Knoten
 * kannte, sich nach 500 ms selbst löschte und die Kamera falsch berechnete
 * (siehe utils/spotlightTarget.js für die korrigierte Mathematik).
 *
 * WICHTIG — „auswählen" heißt hier NICHT „Klick simulieren":
 * Der alte Pfad rief im Viewer `selectElement()` auf, was `emit('select-node')`
 * auslöste und damit den modusabhängigen Klick-Handler in IsybauEditor.vue —
 * im Löschmodus wurde der fokussierte Knoten dadurch GELÖSCHT. Der Verbraucher
 * muss die Auswahl deshalb direkt setzen (`selectedElement`), nicht über den
 * Klick-Pfad. `select: true` bleibt trotzdem der Normalfall, damit sich das
 * ElementInfo-Panel wie gewohnt öffnet.
 */
import { ref } from 'vue';

/**
 * @typedef {{type: 'node'|'edge'|'area', id: string}} ElementRef
 */

// { type, id, mode, select, animate, token } | null
const activeFocus = ref(null);

let clearTimer = null;
// Monoton steigend: erlaubt es, DASSELBE Element erneut zu fokussieren.
// Der alte Mechanismus reagierte nur auf Wertwechsel — zweimal dieselbe ID
// hintereinander war schlicht wirkungslos.
let sequence = 0;

const VALID_TYPES = new Set(['node', 'edge', 'area']);
// 'points' ist ein Ziel OHNE Element: eine rohe Punktliste, auf die die
// Kamera fahren soll (Tutorial-Zeichenvorschau — dort steht noch nichts, was
// eine ID haette). Auswaehlen laesst sich so ein Ziel naturgemaess nicht.
const GEOMETRY_TYPE = 'points';
const DEFAULT_HOLD_MS = 2800;

/**
 * Element anfahren und hervorheben.
 *
 * @param {ElementRef} target
 * @param {object} [options]
 * @param {'flash'|'sticky'} [options.mode='flash']  'flash' löst sich von
 *        selbst wieder auf, 'sticky' bleibt bis clearFocus() — für das
 *        Tutorial, das so lange markiert, wie es über das Element spricht.
 * @param {boolean} [options.select=true]  Element zusätzlich auswählen
 *        (ElementInfo öffnet sich). Das Tutorial setzt false, sonst
 *        verdeckt das Panel die Sprechblase.
 * @param {boolean} [options.animate=true]
 * @param {number}  [options.holdMs]  Standzeit im 'flash'-Modus.
 * @returns {boolean} ob der Fokus gesetzt wurde
 */
function focusElement(target, options = {}) {
    const istGeometrie = target?.type === GEOMETRY_TYPE;
    if (istGeometrie) {
        if (!Array.isArray(target.points) || target.points.length < 2) return false;
    } else if (!target || !VALID_TYPES.has(target.type) || target.id == null || target.id === '') {
        return false;
    }
    const {
        mode = 'flash',
        select = true,
        animate = true,
        holdMs = DEFAULT_HOLD_MS,
    } = options;

    clearTimeout(clearTimer);
    clearTimer = null;

    activeFocus.value = istGeometrie
        ? { type: GEOMETRY_TYPE, points: target.points, mode, select: false, animate, token: ++sequence }
        : { type: target.type, id: String(target.id), mode, select, animate, token: ++sequence };

    if (mode === 'flash') {
        clearTimer = setTimeout(() => { activeFocus.value = null; }, holdMs);
    }
    return true;
}

/** Hervorhebung beenden (Ring aus). Die Kamera bleibt, wo sie ist. */
function clearFocus() {
    clearTimeout(clearTimer);
    clearTimer = null;
    activeFocus.value = null;
}

/** Ist genau dieses Element gerade hervorgehoben? */
function isFocused(type, id) {
    const f = activeFocus.value;
    return !!f && f.type === type && f.id === String(id);
}

/** Kompletter Reset (Tests / Hot-Reload-Hygiene). */
function resetFocusState() {
    clearFocus();
    sequence = 0;
}

export function useElementFocus() {
    return { activeFocus, focusElement, clearFocus, isFocused, resetFocusState };
}
