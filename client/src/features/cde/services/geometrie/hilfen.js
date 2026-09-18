/**
 * DAS HILFEN-FASS (Teil XXIII, A8; Befunde B12, B18) — was AUSSERHALB des
 * Kerns aus `geometrie/ops` genommen werden darf.
 *
 * Der Kern hat zwei Sorten Bausteine, und bis hierher war die Trennung nur
 * behauptet: OPERATIONEN mit Formen hinein und hinaus laufen über
 * `kernel.op(name, …)` (Worker, Server, Kosten, Formpaar-Prüfung);
 * HILFEN sind reine Rechnungen ohne Formvertrag — ein Prüfmass, ein Profil,
 * eine Fläche, ein Abtastwert. Sie stehen hier, und nur von hier darf man
 * sie holen (Wächter W4). Wer eine Form braucht, fragt den Kernel.
 *
 * `sweep`, `extrudiere`, `platte` stehen AUCH hier — für die SYNCHRONEN Wege,
 * die keinen Kernel haben: das Bauen eines Rezepts (`baue`) und die
 * Vorschau beim Zeichnen. Der Ableitungslauf nimmt sie über `kernel.op`.
 */
export {
    rasterAbtasten, pruefmassVon, pruefmassGleich, zellweiteVorschlag, achsmassAus, gleicherBezug,
} from './ops/Raster.js';
export { versetztePunkte, ringFlaeche } from './ops/Linien.js';
export { umrissFlaeche, grundrissAusMesh } from './ops/Umriss.js';
export { kreisProfil, trapezProfil, rechteckProfil, sweep, extrudiere, platte } from './ops/Sweep.js';
export { PROFIL_QUER, PROFIL_SCHRITT } from './ops/Profilkoerper.js';
