/**
 * MeasureMath — Kalibrierung und Messwerte.
 *
 * Alles rechnet im Seiten-Punktraum; die Kalibrierung ist EIN Faktor
 * `realProPt` (Meter je PDF-Punkt). Messwerte werden IMMER live aus der
 * aktuellen Kalibrierung gerechnet und nie in der Annotation eingefroren —
 * eine Neukalibrierung korrigiert alle Messungen mit (Plan, Stufe 5).
 *
 * Herkunft der Formeln: features/plan/components/PlanViewer.vue:327-364
 * (Hypot je Segment, Shoelace für Flächen), dort px-basiert — hier in
 * Punkten, damit Zoom die Werte nicht berührt.
 */

/** 1 PDF-Punkt = 1/72 Zoll = 25,4/72 mm Papier. */
import { volumenAusPolygon, formatVolumen } from './VolumenMath';

export const MM_PRO_PT = 25.4 / 72;

/**
 * Kalibrierung einer Seite: Seiteneintrag gewinnt, sonst Dokument-Standard.
 * @param {{standard: object|null, jeSeite: object}|null} kalibrierung
 * @returns {{realProPt: number, einheit: string}|null}
 */
export function kalibrierungFuerSeite(kalibrierung, seitenIndex) {
    if (!kalibrierung) return null;
    return kalibrierung.jeSeite?.[seitenIndex] ?? kalibrierung.standard ?? null;
}

/** „Maßstab 1:M" → Meter je Punkt (Papiermaß × M). */
export function realProPtAusMassstab(massstab) {
    return (MM_PRO_PT / 1000) * massstab;
}

/** Referenzstrecke: gemessene Länge (pt) entspricht realLaenge (m). */
export function realProPtAusStrecke(laengePt, realLaengeM) {
    return laengePt > 0 ? realLaengeM / laengePt : 0;
}

/** Polylinien-Länge in Punkten. points: [[x,y],...] */
export function streckeLaengePt(points) {
    let summe = 0;
    for (let i = 0; i < points.length - 1; i++) {
        summe += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
    }
    return summe;
}

/** Polygonfläche in Punkten² (Shoelace, Vorzeichen egal). */
export function polygonFlaechePt2(points) {
    let summe = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        summe += (points[j][0] + points[i][0]) * (points[j][1] - points[i][1]);
    }
    return Math.abs(summe / 2);
}

/** Schwerpunkt eines Polygons (fürs Flächen-Label). */
export function polygonSchwerpunkt(points) {
    let x = 0, y = 0;
    for (const [px, py] of points) { x += px; y += py; }
    return [x / points.length, y / points.length];
}

const DE = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const DE1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

/** Länge in Metern → lesbares Label (mm unter 1 m, sonst m). */
export function formatLaenge(meter) {
    if (!isFinite(meter)) return '—';
    if (meter < 1) return `${Math.round(meter * 1000)} mm`;
    if (meter < 100) return `${DE.format(meter)} m`;
    return `${DE1.format(meter)} m`;
}

/** Fläche in m² → lesbares Label (ha ab 10 000 m²). */
export function formatFlaeche(m2) {
    if (!isFinite(m2)) return '—';
    if (m2 >= 10000) return `${DE.format(m2 / 10000)} ha`;
    return `${DE.format(m2)} m²`;
}

/**
 * Label-Winkel (Grad, gegen den Uhrzeigersinn — jsPDF-Konvention) entlang
 * der Strecke, so gedreht, dass der Text nie kopfsteht.
 */
export function labelWinkel(p0, p1) {
    let grad = -(Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180) / Math.PI;
    if (grad > 90) grad -= 180;
    if (grad < -90) grad += 180;
    return grad;
}

/** Messwert-Label einer Messung — live aus der Kalibrierung. */
export function messwertLabel(annot, kal) {
    if (!kal) return 'unkalibriert';
    if (annot.kind === 'volumen') {
        // Aushubvolumen (Stufe 17) — Parameter aus der Annotation, Wert live.
        const e = volumenAusPolygon({
            points: annot.points, realProPt: kal.realProPt,
            tiefeM: annot.tiefeM, neigungN: annot.neigungN, modus: annot.modus,
        });
        if (!e) return '—';
        return e.schliesstSich ? 'Tiefe zu groß' : formatVolumen(e.V);
    }
    if (annot.kind === 'area') {
        const m2 = polygonFlaechePt2(annot.points) * kal.realProPt * kal.realProPt;
        return formatFlaeche(m2);
    }
    return formatLaenge(streckeLaengePt(annot.points) * kal.realProPt);
}
