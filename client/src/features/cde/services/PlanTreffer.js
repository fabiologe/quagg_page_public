/**
 * TREFFER IM LAGEPLAN IN BILDSCHIRMPIXELN (Teil XXXII, K3/R3).
 *
 * Bis hierher galt „sechs Papier-Millimeter": was nah heisst, hing vom ZOOM ab — bei 50 % Lupe traf der Finger nur
 * noch 7 px um den Griff, bei 400 % griff er 60 px daneben noch zu. Im Raum gilt seit Teil XXXI (T2): Griff GRIFF_PX,
 * Trefferfläche TREFFER_PX — auf dem Schirm, in jeder Zoomstufe. Jetzt auch hier, mit DENSELBEN Zahlen.
 *
 * Mit der Maus (feiner Zeiger) die Hälfte: ein Mauszeiger ist ein Punkt, und ein Lageplan trägt viele Schächte dicht.
 */
import { GRIFF_PX, TREFFER_PX } from './IfcOverlay.js';

/** Radius eines gezeichneten Griffs in CSS-Pixeln. */
export const planGriffPx = (grob) => (grob ? GRIFF_PX : GRIFF_PX / 2);
/** Radius der Trefferfläche in CSS-Pixeln. */
export const planTrefferPx = (grob) => (grob ? TREFFER_PX : TREFFER_PX / 2);

/**
 * Bildschirmpixel → Weltmeter: px / (px je Papier-mm) = Papier-mm, × Massstab / 1000 = Meter.
 * @returns {number} Meter (0, wenn Zoom oder Massstab fehlen)
 */
export function pxInMetern(px, { pxProMm, massstab } = {}) {
    if (!(pxProMm > 0) || !(massstab > 0) || !Number.isFinite(px)) return 0;
    return (px / pxProMm) * massstab / 1000;
}
