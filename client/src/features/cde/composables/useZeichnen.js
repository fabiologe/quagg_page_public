/**
 * useZeichnen — einen Zug setzen und daraus ein Bauteil machen (Stufe 9.4).
 *
 * SEIT TEIL XVI (S3) EINE HÜLLE über `useEingabe`, dem Eingabe-Motor: er
 * kann alles, was das Zeichnen konnte — Zug im Lageplan, Höhe aus dem
 * Gelände, Vorbelegung aus dem Zug, EIN Eintrag beim Abschliessen — und
 * dazu Gesten an Feldern und den Zug im Raum. Zwei Eingabepfade wären
 * derselbe Fehler wie zwei Antworten auf „was ist möglich".
 *
 * Der Name bleibt, weil die Verträge bleiben: `zeichnen.test.js` prüft
 * diese Schnittstelle und ist der Wächter dafür, dass der Motor nichts
 * verlernt hat.
 */

import { useEingabe } from './useEingabe.js';

export function useZeichnen(opts = {}) {
    return useEingabe(opts);
}
