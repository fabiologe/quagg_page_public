// Typregister des Editors: je Backend-Typ, was der Client für ihn kann —
// Marker in der Szene, Griffe, Vorlage im Objektbaum — und wo er BEWUSST
// nichts kann, mit Grund.
//
// Bis 2026-09-22 stand dieses Wissen in drei Stringlisten (marker.js,
// objektZugriff.js, PropertyPanel.vue), die jeden Typ exakt verglichen:
// die Drossel (outflow_constant) hatte deshalb keinen Marker, keine Griffe
// und kein Fenster-Werkzeug, der Graben keine Griffe, und niemand prüfte
// die Listen gegen das Modell (Audit C4, E4c). Hier ist EIN Ort, und
// `typRegister.test.js` hält ihn gegen das JSON-Schema der casespec: ein
// neuer Backend-Typ ohne Eintrag fällt im Test auf, statt still ohne
// Marker zu bleiben.
//
// Felder je Eintrag:
//   kind        Objektart des Editors (KIND_PATHS / Auswahl)
//   marker      'eigen' = eigener Marker in marker.js, 'koerper' = der
//               Bauwerkskörper vom Server ist das Klickziel, 'raster' =
//               nur im Geländeraster sichtbar, null = nichts
//   griffe      true = handleAccess liefert Griffe
//   vorlage     true = Vorlage in preTemplates.js
//   bewusstOhne { marker | griffe | vorlage: 'Grund' } — dokumentierte Lücke

export const TYPEN = {
  // --- Bauwerke -------------------------------------------------------------
  wall:     { kind: 'structure', marker: 'koerper', griffe: true, vorlage: true },
  screen:   { kind: 'structure', marker: 'eigen', griffe: true, vorlage: true },
  culvert:  { kind: 'structure', marker: 'koerper', griffe: true, vorlage: true },
  weir:     { kind: 'structure', marker: 'koerper', griffe: true, vorlage: true },
  pier:     { kind: 'structure', marker: 'koerper', griffe: true, vorlage: true,
    bewusstOhne: { griffe: 'rund/tropfen/rechteck: nur der Mittelpunkt ist '
      + 'greifbar, Maße und Drehung im Panel' } },
  basin:    { kind: 'structure', marker: 'koerper', griffe: true, vorlage: true },
  imported: { kind: 'structure', marker: 'koerper', griffe: true, vorlage: false,
    bewusstOhne: { vorlage: 'entsteht nur über den Import' } },
  schacht:  { kind: 'structure', marker: 'koerper', griffe: true, vorlage: true,
    bewusstOhne: { griffe: 'nur der Mittelpunkt, auch bei Rechteck' } },
  kammer:   { kind: 'structure', marker: 'koerper', griffe: true, vorlage: true },
  graben:   { kind: 'structure', marker: 'koerper', griffe: true, vorlage: true },

  // --- Geländeoperationen ---------------------------------------------------
  // Acht Operationen haben kein Klickziel in der Szene: sie sind nur über
  // den Objektbaum wählbar, Griffe erscheinen nach der Auswahl (E4c-Rest)
  channel_carve:  { kind: 'terrain_op', marker: 'raster', griffe: true, vorlage: true,
    bewusstOhne: { marker: 'nur im Raster sichtbar, Auswahl über den Baum' } },
  pad:            { kind: 'terrain_op', marker: 'raster', griffe: true, vorlage: true,
    bewusstOhne: { marker: 'nur im Raster sichtbar, Auswahl über den Baum' } },
  raise_lower:    { kind: 'terrain_op', marker: 'raster', griffe: true, vorlage: true,
    bewusstOhne: { marker: 'nur im Raster sichtbar, Auswahl über den Baum' } },
  smooth:         { kind: 'terrain_op', marker: 'raster', griffe: true, vorlage: true,
    bewusstOhne: { marker: 'nur im Raster sichtbar, Auswahl über den Baum' } },
  ramp:           { kind: 'terrain_op', marker: 'raster', griffe: true, vorlage: true,
    bewusstOhne: { marker: 'nur im Raster sichtbar, Auswahl über den Baum' } },
  embankment:     { kind: 'terrain_op', marker: 'raster', griffe: true, vorlage: true,
    bewusstOhne: { marker: 'nur im Raster sichtbar, Auswahl über den Baum' } },
  replace_region: { kind: 'terrain_op', marker: 'raster', griffe: true, vorlage: true,
    bewusstOhne: { marker: 'nur im Raster sichtbar, Auswahl über den Baum' } },
  set_level:      { kind: 'terrain_op', marker: 'raster', griffe: true, vorlage: true,
    bewusstOhne: { marker: 'nur im Raster sichtbar, Auswahl über den Baum' } },
  bruchkante:     { kind: 'terrain_op', marker: 'eigen', griffe: true, vorlage: true },
  boeschung:      { kind: 'terrain_op', marker: 'eigen', griffe: true, vorlage: true,
    bewusstOhne: { griffe: 'nur die Oberkante ist greifbar' } },
  aussenkante:    { kind: 'terrain_op', marker: 'eigen', griffe: true, vorlage: true,
    bewusstOhne: { marker: 'nur mit Rahmenpolygon; ohne führt sie die '
      + 'Bezugskante fort und hat nichts zu zeigen' } },

  // --- Ränder ---------------------------------------------------------------
  inflow_hydrograph:   { kind: 'boundary', marker: 'eigen', griffe: true, vorlage: true },
  inflow_constant:     { kind: 'boundary', marker: 'eigen', griffe: true, vorlage: true },
  outflow_fixed_level: { kind: 'boundary', marker: 'eigen', griffe: true, vorlage: true },
  outflow_free:        { kind: 'boundary', marker: 'eigen', griffe: true, vorlage: true },
  outflow_constant:    { kind: 'boundary', marker: 'eigen', griffe: true, vorlage: true },
  atmosphere:          { kind: 'boundary', marker: null, griffe: false, vorlage: false,
    bewusstOhne: { marker: 'der Deckel des Gebiets — hat keine Lage',
      griffe: 'nichts zu ziehen', vorlage: 'genau eine je Fall, vorbelegt' } },

  // --- Verfeinerung ---------------------------------------------------------
  box:     { kind: 'refinement', marker: 'eigen', griffe: true, vorlage: true },
  surface: { kind: 'refinement', marker: null, griffe: false, vorlage: true,
    bewusstOhne: { marker: 'hängt an einer Fläche, die schon ihren Marker hat',
      griffe: 'nichts zu ziehen — Ziel und Stufe stehen im Panel' } },

  // --- Vorfüllung -----------------------------------------------------------
  vorfuellung: { kind: 'vorfuellung', marker: 'eigen', griffe: true, vorlage: true },

  // --- Bearbeitungen an Bauwerken (kind 'edit', Unterobjekte) ---------------
  aussparung: { kind: 'edit', marker: 'eigen', griffe: true, vorlage: false },
  schnitt:    { kind: 'edit', marker: 'eigen', griffe: true, vorlage: false,
    bewusstOhne: { marker: 'nur mit Achse z sichtbar; x/y-Schnitte '
      + 'erscheinen nicht (E4c-Rest)' } },
  auf_gebiet: { kind: 'edit', marker: null, griffe: false, vorlage: false,
    bewusstOhne: { marker: 'Schnitt am Gebietsrand — der Rand ist der Marker' } },
  transform:  { kind: 'edit', marker: null, griffe: false, vorlage: false,
    bewusstOhne: { marker: 'wirkt auf den Körper selbst, der ist der Marker' } },
  heilen:     { kind: 'edit', marker: null, griffe: false, vorlage: false,
    bewusstOhne: { marker: 'keine Lage — repariert das Netz' } },
  gelaende:   { kind: 'edit', marker: null, griffe: false, vorlage: false,
    bewusstOhne: { marker: 'Einbindung ins Gelände — keine eigene Lage' } },
}

// Ränder mit Zu-/Abfluss: sie haben eine Lage (Fläche + Fenster), Marker,
// Griffe und das Fenster-Werkzeug. Die Atmosphäre hat nichts davon.
export const RAND_ZULAUF = Object.freeze(
  Object.keys(TYPEN).filter((t) => t.startsWith('inflow')))
export const RAND_ABLAUF = Object.freeze(
  Object.keys(TYPEN).filter((t) => t.startsWith('outflow')))
export const RAND_MIT_FENSTER = Object.freeze([...RAND_ZULAUF, ...RAND_ABLAUF])

export function istZulauf(type) { return RAND_ZULAUF.includes(type) }
export function istAblauf(type) { return RAND_ABLAUF.includes(type) }

// Dokumentierte Lücken — für Tests und Berichte
export function luecken() {
  return Object.entries(TYPEN)
    .filter(([, e]) => e.bewusstOhne)
    .map(([type, e]) => ({ type, kind: e.kind, ...e.bewusstOhne }))
}
