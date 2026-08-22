/**
 * typPalette.js — Farben, die etwas BEDEUTEN.
 *
 * Abzugrenzen von styles/theme.css: dort stehen Oberflächenfarben, die dem
 * Hell/Dunkel-Wechsel folgen. Hier stehen Datenfarben, die das NICHT dürfen.
 * Wenn Rot "über 90 % ausgelastet" heißt, muss es in beiden Modi dasselbe Rot
 * sein, sonst stimmt die Legende nicht mehr.
 *
 * Warum es diese Datei gibt: dieselbe Aussage wurde an bis zu vier Stellen
 * unabhängig eingefärbt, und die Stellen widersprachen sich.
 *
 *   "Auslastung > 90 %"   3D-Szene #c0392b, 2D-Viewer #e74c3c, Legende #c0392b
 *   "Auslastung > 50 %"   in 3D vorhanden, in 2D gar nicht
 *   "Sonderbauwerk"       3D hellviolett 0xc9a0dc, 2D und Abzeichen grau
 *
 * Die 3D-Szene schreibt Farben als 0x-Zahl (three.js). Diese Schreibweise
 * fällt durch jede CSS- und #-Suche — genau deshalb ist das Hellviolett der
 * Sonderbauwerke bei der Entfernung der Lila-Palette unentdeckt geblieben.
 * Deshalb steht hier alles als '#rrggbb', und `zahl()` rechnet um.
 */

export const zahl = (hex) => parseInt(hex.slice(1), 16);

/**
 * Auslastungsklassen einer Haltung. Reihenfolge ist Teil des Vertrags: die
 * erste Stufe, deren Schwelle unterschritten wird, gewinnt.
 *
 * Schwellen durchgehend "größer als", wie es die Legende schon sagte. Der
 * 2D-Viewer benutzte für die zweite Stufe ">= 75" — eine exakt zu 75,0 %
 * ausgelastete Haltung war dort orange und in 3D gelb.
 */
export const AUSLASTUNG_STUFEN = [
  { ueber: 90, farbe: '#c0392b', text: '> 90 % Kapazität' },
  { ueber: 75, farbe: '#e67e22', text: '> 75 % Kapazität' },
  { ueber: 50, farbe: '#f1c40f', text: '> 50 % Kapazität' },
  { ueber: -1, farbe: '#2980b9', text: '≤ 50 % Kapazität' },
];

export const auslastungsFarbe = (auslastung) =>
  AUSLASTUNG_STUFEN.find((s) => (auslastung ?? 0) > s.ueber).farbe;

/** Ergebniszustände eines Knotens. Eigene Achse, nicht die der Auslastung. */
export const KNOTEN_ZUSTAND = {
  ueberstau:    '#c0392b',
  druckabfluss: '#e67e22',
  wasserstand:  '#3498db',
};

/**
 * Bauwerke tragen KEINE Typfarbe mehr (Nutzer-Entscheidung).
 *
 * Vorher hatte jeder Typ seine eigene: Pumpwerk orange, Becken türkis,
 * Auslass grün, Sonderbauwerk hellviolett. Das kollidierte zweimal in
 * derselben 3D-Szene — Orange war zugleich "> 75 % ausgelastet" und
 * "Pumpwerk", Grün zugleich "Auslass" und "ausgewählt".
 *
 * Der Typ geht dabei nicht verloren: in 3D hat jeder Bauwerkstyp eine eigene
 * GEOMETRIE (Kegel für Auslass, Zylinder für Pumpwerk, Quader für Becken),
 * in 2D und im Infopanel steht er als Text daneben. Die Farbe war Doppelung.
 */
export const BAUWERK = '#65625c';

/** Datenqualität — kein Bauwerkstyp, sondern eine Aussage über den Datensatz. */
export const DATENQUALITAET = {
  fiktiv:        '#e74c3c',   // vom Import erzeugter Knoten
  ohneGeometrie: '#7f8c8d',   // Lage unbekannt
};

export const AUSWAHL       = '#2ecc71';
export const AUSWAHL_GLUT  = '#1a7a40';
export const FLAECHE       = '#2980b9';

/** Geländeschattierung nach Höhe (3D-Shader). */
export const GELAENDE = { tief: '#2d5f3f', mitte: '#8b7355', hoch: '#e8ddc8' };

/** Höhenlinien im 2D-Viewer. */
export const HOEHENLINIE = { aussen: '#8b5cf6', innen: '#adff2f' };

/**
 * Linienfarben der Ergebnisdiagramme. Benannt nach der GRÖSSE, die sie
 * zeigen, nicht nach dem Reiter — dieselbe Größe soll in jedem Diagramm
 * dieselbe Farbe haben.
 */
export const DIAGRAMM = {
  abfluss:      '#3b82f6',
  kapazitaet:   '#94a3b8',
  tiefe:        '#6366f1',
  zufluss:      '#10b981',
  volumen:      '#f59e0b',
  deckelhoehe:  '#ef4444',
  flaechenabfluss: '#8b5cf6',
};

/**
 * Entwässerungsart (KR/KS/KM) steht weiterhin in utils/mappings.js — dort
 * gehört sie hin, weil sie zusammen mit den übrigen ISYBAU-Schlüsseltabellen
 * gepflegt wird und sich schon vor dieser Datei als gemeinsame Quelle für
 * 2D-SVG und 3D-Szene verstanden hat. Hier nur der Verweis, damit niemand
 * eine zweite Fassung anlegt:
 *   import { ENTWAESSERUNGSART_COLOR } from './mappings.js';
 */
