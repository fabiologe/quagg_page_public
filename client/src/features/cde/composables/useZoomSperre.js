/**
 * Die Zoom-Sperre der CDE — und der Ausweg, wenn es doch passiert ist.
 *
 * DER BEFUND (2026-09-03, Fabio am Surface): Zwei Finger auf dem Bildschirm,
 * und die ganze Oberfläche war weg — nur noch das 3D-Raster, der Browser
 * meldete weiter 100 %. Das ist der VISUELLE Zoom des Browsers (Pinch), nicht
 * der Seitenzoom:
 *
 *   - Der Seitenzoom (Strg+Rad) rechnet das Layout NEU. Die Leisten wären
 *     dann grösser, aber da.
 *   - Der visuelle Zoom vergrössert nur den Ausschnitt. `.cde-view` ist
 *     `position: fixed; inset: 0` und hängt damit am LAYOUT-Viewport — man
 *     sieht ein Stück davon, und weil die Seite nicht scrollt, ist die
 *     Kopfzeile unerreichbar. Genau das Bild.
 *
 * Deshalb zwei Schlösser und ein Schlüssel:
 *   0. Zwei Finger, die den Browser vergrössern wollen (`touchmove` ab dem
 *      zweiten Finger) — das deckt auch TELEPORTIERTE Ebenen ab, die an
 *      `body` hängen und vom CSS unten nicht erreicht werden.
 *   1. `touch-action: pan-x pan-y` auf `.cde-view` (CSS, siehe CdeView.vue) —
 *      Ein-Finger-Scrollen in den Panels bleibt, der Zwei-Finger-Zoom geht
 *      nicht mehr an den Browser. Der Canvas hat weiter `touch-action: none`
 *      und bekommt seine eigenen Gesten; ein Kind darf strenger sein als der
 *      Vorfahr, nur nicht grosszügiger.
 *   2. Strg+Rad und die Safari-Gesten hier — das ist der Trackpad-Pinch.
 *   3. DER SCHLÜSSEL: Strg+0/+/− werden NICHT gesperrt, anders als in
 *      `flood-3D/composables/usePreventPageZoom.js` und der wortgleichen
 *      Kopie im PDF-Editor. Chrome merkt sich den Seitenzoom JE HERKUNFT:
 *      wer einmal gezoomt hat, lädt die Seite beim nächsten Mal gezoomt —
 *      und mit gesperrtem Strg+0 käme er nie wieder heraus. Ein Schloss, das
 *      auch von innen sperrt, ist eine Falle.
 *
 * Und weil man in einem vergrösserten Ausschnitt keine Meldung sieht, die im
 * Layout klebt: `leistenStil` verankert die Rettungsleiste am SICHTBAREN
 * Ausschnitt (visualViewport) und rechnet die Vergrösserung wieder heraus.
 *
 * Rein genug zum Prüfen: die Rechnung steht in `rettungsleistenStil`, ohne
 * Vue und ohne Browser.
 *
 * (Dritte Fassung im Haus, bewusst NICHT wortgleich — die Hebung der drei
 * nach `services/tinte/` steht als Vorschlag in Teil X des Plans.)
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

/** Ab hier gilt der Ausschnitt als vergrössert (Rundungsrauschen abgefangen). */
export const ZOOM_SCHWELLE = 1.02;

/**
 * Der Stil, der ein Element am sichtbaren Ausschnitt festmacht.
 *
 * `offsetLeft/offsetTop` sagen, wo der Ausschnitt im Layout liegt; `width`
 * ist seine Breite in CSS-Pixeln. Das Element wird auf `width · scale`
 * aufgezogen und mit `1/scale` wieder verkleinert — dann füllt es den
 * Ausschnitt und trägt trotzdem Schrift in normaler Grösse.
 *
 * @param {{scale, offsetLeft, offsetTop, width}|null} vv
 * @returns {object|null} null, wenn nicht vergrössert
 */
export function rettungsleistenStil(vv) {
    const skala = Number(vv?.scale) || 1;
    if (!(skala > ZOOM_SCHWELLE)) return null;
    return {
        left: `${vv.offsetLeft ?? 0}px`,
        top: `${vv.offsetTop ?? 0}px`,
        width: `${(vv.width ?? 0) * skala}px`,
        transform: `scale(${1 / skala})`,
        transformOrigin: 'top left',
    };
}

export function useZoomSperre({ fenster = (typeof window !== 'undefined' ? window : null) } = {}) {
    /** Der Zustand des sichtbaren Ausschnitts — nur gesetzt, wenn es ihn gibt. */
    const ausschnitt = ref(null);
    const vergroessert = computed(() => (Number(ausschnitt.value?.scale) || 1) > ZOOM_SCHWELLE);
    const skala = computed(() => Number(ausschnitt.value?.scale) || 1);
    const leistenStil = computed(() => rettungsleistenStil(ausschnitt.value));

    const radSperre = (e) => { if (e.ctrlKey) e.preventDefault(); };
    const gestenSperre = (e) => e.preventDefault();
    /**
     * Der zweite Riegel — und er schliesst eine Lücke, die das CSS nicht
     * schliessen kann: TELEPORTIERTE Ebenen (CdeDialog, Befehlspalette)
     * hängen an `body`, ausserhalb von `.cde-view`; dort greift dessen
     * `touch-action` nicht. Zwei Finger auf einem offenen Dialog hätten
     * also weiter den Browser vergrössert. Dieselbe Klasse wie die
     * Theme-Tokens, die deshalb auf `:root` stehen.
     *
     * NUR ab dem zweiten Finger: das Ein-Finger-Scrollen der Panels bleibt
     * unberührt, und die eigenen Zwei-Finger-Gesten des Lageplans laufen
     * über Pointer-Events — die sind zu diesem Zeitpunkt längst gefeuert.
     */
    const griffSperre = (e) => { if ((e.touches?.length ?? 0) > 1) e.preventDefault(); };
    const messen = () => {
        const vv = fenster?.visualViewport;
        ausschnitt.value = vv
            ? { scale: vv.scale, offsetLeft: vv.offsetLeft, offsetTop: vv.offsetTop, width: vv.width, height: vv.height }
            : null;
    };

    onMounted(() => {
        if (!fenster) return;
        fenster.addEventListener('wheel', radSperre, { passive: false });
        fenster.addEventListener('touchmove', griffSperre, { passive: false });
        fenster.addEventListener('gesturestart', gestenSperre);
        fenster.addEventListener('gesturechange', gestenSperre);
        fenster.visualViewport?.addEventListener('resize', messen);
        fenster.visualViewport?.addEventListener('scroll', messen);
        messen();
    });
    onBeforeUnmount(() => {
        if (!fenster) return;
        fenster.removeEventListener('wheel', radSperre);
        fenster.removeEventListener('touchmove', griffSperre);
        fenster.removeEventListener('gesturestart', gestenSperre);
        fenster.removeEventListener('gesturechange', gestenSperre);
        fenster.visualViewport?.removeEventListener('resize', messen);
        fenster.visualViewport?.removeEventListener('scroll', messen);
    });

    return { ausschnitt, vergroessert, skala, leistenStil, messen };
}
