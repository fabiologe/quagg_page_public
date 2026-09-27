/**
 * Schreibmaschinen-Effekt der Sprechblase.
 *
 * Eigene Datei, damit das Verhalten ohne Lottie/Audio testbar ist
 * (test/tippen.test.js). Rückmeldung aus der Lehre (2026-09-27): Das Mitlesen
 * im 32-ms-Takt war anstrengend. Jetzt schneller, ein Klick zeigt sofort alles,
 * und wer im System „Bewegung reduzieren“ eingestellt hat, bekommt den Text
 * ohne Tippen.
 */
import { ref } from 'vue';

export const ZEICHEN_MS = 14;

const bewegungReduziert = () => {
    try {
        return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
};

export function useTippen({ zeichenMs = ZEICHEN_MS } = {}) {
    const text = ref('');
    const fertig = ref(true);
    let ganz = '';
    let timer = null;

    function stop() {
        clearTimeout(timer);
        timer = null;
    }

    function zeigeAlles() {
        stop();
        text.value = ganz;
        fertig.value = true;
    }

    function tippe(nachricht) {
        stop();
        ganz = String(nachricht ?? '');
        if (!ganz || bewegungReduziert()) {
            zeigeAlles();
            return;
        }
        text.value = '';
        fertig.value = false;
        let i = 0;
        const schritt = () => {
            i += 1;
            text.value = ganz.slice(0, i);
            if (i < ganz.length) timer = setTimeout(schritt, zeichenMs);
            else fertig.value = true;
        };
        schritt();
    }

    function leeren() {
        stop();
        ganz = '';
        text.value = '';
        fertig.value = true;
    }

    return { text, fertig, tippe, zeigeAlles, leeren, stop };
}
