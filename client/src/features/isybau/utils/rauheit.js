/**
 * Rauheit der Haltungen nach DWA-A 110 (2006) — „betriebliche Rauheit“ kb.
 *
 * Warum: SaintV-1D rechnete Manning mit kSt je Material (Kunststoff 95, Beton 80 …).
 * Das ist Wandrauheit; die Verluste an Schächten und Zuläufen fehlten, denn
 * `[LOSSES]` gibt es nur an Bauwerken. DWA-A 110, Gl. 6 fasst Wandreibung UND
 * örtliche Verluste zu λ_b zusammen; daraus die kb-Richtwerte (Abschn. 5.2.2):
 *   Transportkanäle 0,50 · Sammelkanäle mit Regelschächten 0,75 · Mauerwerk,
 *   Ortbeton, nicht genormte Rohre 1,50 · Drosselstrecken, Druckleitungen 0,25 mm.
 * kSt 95 entsprach kb ≈ 0,14–0,33 mm — Leistungsfähigkeit bis 16 % zu hoch
 * (doc/GrenzenEvaluierung.md B2, Fahrplan „Grenzen beheben“ Stufe 4).
 *
 * SWMM kennt für Freispiegelleitungen nur Manning. Deshalb wird je Haltung das n
 * bestimmt, bei dem Manning bei Vollfüllung denselben Abfluss liefert wie
 * Prandtl-Colebrook mit kb. Die Oberfläche bleibt, wie sie ist: das Material
 * wählt intern das kb; ein bewusst eingetragener kSt geht vor.
 *
 * Nicht unterschieden (dafür bräuchte es eine Eingabe): Transport- gegen
 * Sammelkanal — gerechnet wird mit 0,75 mm (Sammelkanal, der Regelfall).
 */
import { getRoughness } from './mappings.js';

export const KB_MM = { sammel: 0.75, transport: 0.50, sonder: 1.50, druck: 0.25 };

const G = 9.81;
const NU = 1.31e-6; // kinematische Zähigkeit bei 10 °C (DWA-A 110)
const MIN_GEFAELLE = 0.001;

/** Mauerwerk, Ortbeton, Ziegel: „nicht genormte Rohre ohne Nachweis der Wandrauheit“ → 1,50 mm. */
const MATERIAL_SONDER = new Set(['mauerwerk', 'ma', 'ob', 'ortbeton', 'zg', 'ziegel']);

/** Offene Gerinne (Rechteck offen, Trapez) behalten kSt aus dem Material — kein Kanal mit Schächten. */
export const offenesProfil = (profil) => [5, 8].includes(Number(profil?.type));

/** Hydraulischer Radius bei Vollfüllung (m). Kreis, Ei 3:2 (DIN 4263) und Rechteck exakt, sonst H/4. */
export function radiusVoll(profil) {
    const h = Number(profil?.height), b = Number(profil?.width);
    if (!(h > 0)) return null;
    switch (Number(profil?.type)) {
        case 0: case 4: return h / 4;
        case 1: return (0.5105 * h * h) / (2.643 * h);     // Ei 3:2: A = 4,594 r², U = 7,930 r, H = 3 r
        case 3: { const bb = b > 0 ? b : h; return (bb * h) / (2 * (bb + h)); }
        default: return h / 4;                              // Maul, Sonderprofile: Näherung (n hängt nur schwach vom Radius ab)
    }
}

/** Vollfüllgeschwindigkeit nach Prandtl-Colebrook mit d_h = 4 R (DWA-A 110, 4.1.1). */
export function vPrandtlColebrook(radius, gefaelle, kbMm) {
    const dh = 4 * radius;
    const s = Math.sqrt(2 * G * dh * gefaelle);
    return -2 * Math.log10((2.51 * NU) / (dh * s) + (kbMm / 1000) / (3.71 * dh)) * s;
}

/** Manning-n, das bei Vollfüllung denselben Abfluss liefert wie Prandtl-Colebrook mit kb. */
export function manningAusKb(profil, gefaelle, kbMm) {
    const R = radiusVoll(profil);
    if (!R) return null;
    const I = Math.max(Math.abs(Number(gefaelle) || 0), MIN_GEFAELLE);
    return (R ** (2 / 3) * Math.sqrt(I)) / vPrandtlColebrook(R, I, kbMm);
}

/**
 * Ein bewusst eingetragener kSt: Zahl > 0, die NICHT die Materialvorgabe ist.
 * (Alte Projekte speicherten die Materialvorgabe mit — die gilt als automatisch.)
 */
export function rauheitManuell(edge) {
    const r = Number(edge?.roughness);
    if (edge?.roughness == null || edge.roughness === '' || !(r > 0)) return null;
    if (r > 1 && r === getRoughness(edge.material)) return null;
    return r;
}

/** kb (mm) einer Haltung aus Material und Lage. */
export function kbFuerHaltung(edge, { druckleitung = false } = {}) {
    if (druckleitung) return KB_MM.druck;
    const m = String(edge?.material ?? '').trim().toLowerCase();
    if (MATERIAL_SONDER.has(m)) return KB_MM.sonder;
    return KB_MM.sammel;
}

/**
 * Manning-n, mit dem die Haltung gerechnet wird.
 * @returns {{ n: number, kSt: number, kb: number|null, quelle: 'manuell'|'gerinne'|'kb' }}
 */
export function manningN(edge, { druckleitung = false, gefaelle = 0 } = {}) {
    const manuell = rauheitManuell(edge);
    if (manuell) {
        const n = manuell > 1 ? 1 / manuell : manuell; // Werte ≤ 1: altes Manning-n
        return { n, kSt: 1 / n, kb: null, quelle: 'manuell' };
    }
    if (offenesProfil(edge?.profile)) {
        const kSt = getRoughness(edge?.material);
        return { n: 1 / kSt, kSt, kb: null, quelle: 'gerinne' };
    }
    const kb = kbFuerHaltung(edge, { druckleitung });
    const n = manningAusKb(edge?.profile, gefaelle, kb);
    if (!n) {
        const kSt = getRoughness(edge?.material);
        return { n: 1 / kSt, kSt, kb: null, quelle: 'gerinne' };
    }
    return { n, kSt: 1 / n, kb, quelle: 'kb' };
}

/** Gefälle einer Haltung aus Rohrsohlen (z1/z2), sonst Knotensohlen; Länge in m. */
export function haltungsGefaelle(edge, von, nach) {
    const L = Number(edge?.length);
    const z1 = Number.isFinite(Number(edge?.z1)) && edge?.z1 != null ? Number(edge.z1) : Number(von?.z);
    const z2 = Number.isFinite(Number(edge?.z2)) && edge?.z2 != null ? Number(edge.z2) : Number(nach?.z);
    if (!(L > 0) || !Number.isFinite(z1) || !Number.isFinite(z2)) return 0;
    return (z1 - z2) / L;
}

/** Bestandshaltung (ISYBAU-Status 0 „vorhanden“) — A 110: mit 95 % der Nennweite rechnen. */
export const istBestand = (edge) => Number(edge?.status ?? 0) === 0;
export const BESTAND_FAKTOR = 0.95;
