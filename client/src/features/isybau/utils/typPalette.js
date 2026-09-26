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

import { ENTWAESSERUNGSART_COLOR, ENTWAESSERUNGSART_DEFAULT_COLOR } from './mappings.js';
export const zahl = (hex) => parseInt(hex.slice(1), 16);

/**
 * Auslastungsklassen einer Haltung — Auslastung = Q/Qvoll (maximaler Abfluss durch
 * Vollfüllungsabfluss), wie in den Arbeitshilfen Abwasser und im PDF-Bericht. Vorher
 * färbten Karte, 3D und Reiter nach h/hvoll (Füllungsgrad): eine eingestaute Haltung
 * mit 17 % Q/Qvoll stand dort als „> 90 %" (Entscheidung Fabio 2026-09-26: Q/Qvoll,
 * Einstau getrennt → haltungEingestaut).
 *
 * Reihenfolge ist Teil des Vertrags: die erste Stufe, deren Schwelle
 * überschritten wird, gewinnt. Schwellen durchgehend „größer als".
 */
export const AUSLASTUNG_STUFEN = [
  { ueber: 100, farbe: '#c0392b', text: '> 100 % Qvoll (überlastet)', status: 'überlastet' },
  { ueber: 90,  farbe: '#e67e22', text: '> 90 % Qvoll',               status: '> 90 %' },
  { ueber: 75,  farbe: '#f1c40f', text: '> 75 % Qvoll',               status: '> 75 %' },
  { ueber: 50,  farbe: '#5dade2', text: '> 50 % Qvoll',               status: '> 50 %' },
  { ueber: -Infinity, farbe: '#2980b9', text: '≤ 50 % Qvoll',         status: '≤ 50 %' },
];

export const auslastungsStufe = (auslastung) =>
  AUSLASTUNG_STUFEN.find((s) => (auslastung ?? 0) > s.ueber);

export const auslastungsFarbe = (auslastung) => auslastungsStufe(auslastung).farbe;

/** Füllungsgrad h/hvoll, ab dem eine Haltung als eingestaut (voll) gilt. SWMM druckt h/hvoll
 *  zweistellig, „1,00" kommt also schon ab 0,995 — 0,99 fängt das sicher. */
export const EINSTAU_H_HVOLL = 0.99;

/**
 * Auslastung Q/Qvoll in % — aus dem exakten Qvoll des Rechenkerns (capacity, l/s,
 * siehe ResultsAssembler), sonst aus SWMMs zweistelliger Q/Qvoll-Spalte. Wehre und
 * Drosseln haben kein Qvoll → null.
 */
export const auslastungProzent = (res) => {
  if (!res || ['WEIR', 'ORIFICE', 'OUTLET'].includes(res.type)) return null;
  if (res.capacity > 0 && Number.isFinite(res.maxFlow)) return (Math.abs(res.maxFlow) / res.capacity) * 100;
  if (Number.isFinite(res.flowCapacityRatio)) return res.flowCapacityRatio * 100;
  return null;
};

/** SWMM druckt in „Conduit Surcharge Summary" jede Dauer mindestens als 0,01 h
 *  (statsrpt.c: t = MAX(0.01, t)) — 0,01 heißt „unter der Auflösung", nicht „voll". */
export const SWMM_DAUER_UNTERGRENZE_H = 0.01;

/** Eingestaut: Haltung lief voll (h/hvoll ≥ 0,99 oder an beiden Enden länger als SWMMs
 *  Untergrenze voll) — eigene Achse neben Q/Qvoll. Nur unten voll (Rückstau vom Unterlieger)
 *  zählt nicht: R_002 im Übungsnetz, unten 2,8 h voll, h/hvoll 0,58. */
export const haltungEingestaut = (res) => !!res
  && ((res.depthRatio ?? 0) >= EINSTAU_H_HVOLL
    || (res.surcharge?.hoursFullBoth ?? 0) > SWMM_DAUER_UNTERGRENZE_H);

/**
 * Ergebniszustand einer Haltung für alle Anzeigen (2D, 3D, Reiter, Info-Fenster, PDF).
 * status: 'überlastet' (Q/Qvoll > 1) vor 'eingestaut' vor den Auslastungsstufen.
 * @returns {{auslastung:number|null, stufe:object|null, eingestaut:boolean, status:string, farbe:string|null}}
 */
export const haltungsZustand = (res) => {
  const auslastung = auslastungProzent(res);
  const stufe = auslastung == null ? null : auslastungsStufe(auslastung);
  const eingestaut = haltungEingestaut(res);
  const status = stufe === AUSLASTUNG_STUFEN[0] ? 'überlastet'
    : eingestaut ? 'eingestaut'
      : stufe ? stufe.status : '–';
  return { auslastung, stufe, eingestaut, status, farbe: stufe ? stufe.farbe : null };
};

/** Ergebniszustände eines Knotens. Eigene Achse, nicht die der Auslastung. */
export const KNOTEN_ZUSTAND = {
  // Weinrot: eigene Farbe, nicht das Rot der Auslastung „> 90 %" (#c0392b) — beide standen
  // in derselben Legende (2026-09-26, Wunsch Fabio: dunkelrot/weinrot).
  ueberstau:    '#7b1e3a',
  druckabfluss: '#e67e22',
  wasserstand:  '#3498db',
};

/**
 * Ergebniszustand eines Knotens — EINE Regel für 2D, 3D, Reiter, Info-Fenster und PDF
 * (vorher: Überflutungsvolumen > 0,001 m³ im Reiter/PDF, `overflow` in 3D, dazu
 * `pondedVolume`, das der Parser nie setzt).
 *   'überstaut'  – Wasser trat über den Deckel aus: SWMM-Tabelle „Node Flooding" oder
 *                  max. Wasserspiegel über Deckelhöhe (ResultsAssembler, `overflow`)
 *   'eingestaut' – Wasserspiegel über dem Scheitel der höchsten Haltung, unter dem Deckel
 *                  (SWMM „Node Surcharge Summary")
 *   'ok'
 */
export const knotenZustand = (res) => {
  if (!res) return 'ok';
  if (res.overflow || (res.floodingVolume ?? 0) > 0) return 'überstaut';
  if (res.surcharged) return 'eingestaut';
  return 'ok';
};

/** Ist ein Knoten überstaut? (2D-Ring, 3D-Farbe, Legende) */
export const knotenUeberstaut = (res) => knotenZustand(res) === 'überstaut';

/** Weinrot, hell genug für dunkle Hintergründe (Dunkelmodus, 3D-Szene): #7b1e3a hatte dort
 *  nur 1,9 : 1 Kontrast (Browserprüfung 2026-09-26). */
export const UEBERSTAU_HELL = '#d0527a';

/** 2D-Karte und Legende: Theme-Token (theme.css: hell = KNOTEN_ZUSTAND.ueberstau,
 *  dunkel = UEBERSTAU_HELL). PDF (Papier) nimmt KNOTEN_ZUSTAND.ueberstau direkt. */
export const UEBERSTAU_CSS = 'var(--isy-ueberstau, #7b1e3a)';

/** Einstau-Strichelung über der Auslastungsfarbe: Textfarbe des Themes (hebt sich von jeder Stufe ab). */
export const EINSTAU_CSS = 'var(--isy-pixel-text, #222)';

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
  // Türkis (2026-09-26, Wunsch Fabio): vorher #e74c3c — in 3D neben dem Weinrot des Überstaus
  // kaum zu unterscheiden und ohne Legende. Blau ist schon Fläche/Wasserstand/„≤ 50 %", Grün die Auswahl.
  fiktiv:        '#139a9a',   // vom Import erzeugter Knoten
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

/**
 * Legende der 2D-Karte. Ohne Ergebnisse: Kanaltyp (Standardfärbung). Mit Ergebnissen
 * färbt der Viewer nach Auslastung (auslastungsFarbe) und Überstau — die Legende zeigte
 * trotzdem weiter „Kanaltyp" (Browserprüfung 2026-09-26, doc/09 S2).
 */
export const legendenEintraege = (hatErgebnisse) => (hatErgebnisse
  ? {
      titel: 'Auslastung',
      eintraege: [
        ...AUSLASTUNG_STUFEN.map((s) => ({ label: s.text, color: s.farbe })),
        { label: 'Haltung eingestaut (gestrichelt)', color: EINSTAU_CSS, gestrichelt: true },
        { label: 'Schacht überstaut', color: UEBERSTAU_CSS },
      ],
    }
  : {
      titel: 'Kanaltyp',
      eintraege: [
        { label: 'Regenwasser', color: ENTWAESSERUNGSART_COLOR.KR },
        { label: 'Schmutzwasser', color: ENTWAESSERUNGSART_COLOR.KS },
        { label: 'Mischwasser', color: ENTWAESSERUNGSART_COLOR.KM },
        { label: 'Unbekannt', color: ENTWAESSERUNGSART_DEFAULT_COLOR },
      ],
    });
