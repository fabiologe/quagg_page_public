// Deutsche Bezeichner und Zahlformate für den Nachweis-Viewer.

export const QUANTITY_LABELS = {
  force: 'Kraft', moment: 'Moment', discharge: 'Durchfluss',
  level: 'Wasserspiegel', volume: 'Wasservolumen', residual: 'Residuum',
  courant: 'Courant-Zahl', timestep: 'Zeitschrittweite',
  continuity: 'Kontinuitätsfehler', bed_shear: 'Sohlschubspannung',
  energy_head: 'Energiehöhe', overfall_cd: 'Überfallbeiwert',
  tracer: 'Tracer-Konzentration',
}

export const KIND_LABELS = {
  max_level: 'Maximaler Einstau', discharge_ratio: 'Abflussaufteilung',
  max_force: 'Maximale Bauteillast', min_bed_shear: 'Minimale Sohlschubspannung',
  max_bed_shear: 'Sohlensicherung (max. Sohlschub)',
  head_difference: 'Örtliche Verlusthöhe',
  overfall_cd: 'Überfallbeiwert C_d',
  massenbilanz: 'Massenbilanz', kurzschluss: 'Kurzschluss-Anteil',
  verweilzeit_min: 'Mindest-Verweilzeit',
}

export const STAT_LABELS = {
  max: 'Maximum', min: 'Minimum', betrag_max: 'Betragsmaximum',
}

export const RESULT_LABELS = {
  erfuellt: 'erfüllt', nicht_erfuellt: 'nicht erfüllt',
  informativ: 'informativ', nicht_auswertbar: 'nicht auswertbar',
}

const nf3 = new Intl.NumberFormat('de-DE', { maximumSignificantDigits: 5 })

export function fmt(value, unit = '') {
  if (value == null || Number.isNaN(value)) return '–'
  const abs = Math.abs(value)
  const text = (abs !== 0 && (abs >= 1e5 || abs < 1e-3))
    ? value.toExponential(2).replace('.', ',')
    : nf3.format(value)
  return unit && unit !== '-' ? `${text} ${unit}` : text
}

export function fmtPercent(ratio) {
  if (ratio == null) return '–'
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })
    .format(ratio * 100)} %`
}

// Kompakte Zahl für Karten, Legenden und Cursor-Tabellen: 3 signifikante
// Stellen, ab 1000 ganzzahlig. Bewusst eine ZWEITE Funktion neben fmt():
// sie formatiert ohne Tausenderpunkte und ohne Exponenten — Grundriss und
// Raum (3D) zeigten so schon immer an, und das soll sich nicht still
// ändern (lebte dort als identische lokale Kopie).
export function fmtKurz(v) {
  if (v == null || Number.isNaN(v)) return '–'
  return Math.abs(v) >= 1000 ? v.toFixed(0) : v.toPrecision(3)
}

// Feste Nachkommastellen (Import-Dialog: Maße in Metern) — Spaltenwerte
// vergleichen sich so zeilenweise, anders als bei signifikanten Stellen.
export function fmtFest(v, stellen = 2) {
  return v == null ? '–' : Number(v).toFixed(stellen)
}

// Dateigrößen: unter 1 GB gerundete MB, darüber GB mit einer
// Nachkommastelle (vorher je eine Kopie in RunListPanel/SimulationPanel)
export function fmtBytes(bytes) {
  const mb = (bytes ?? 0) / 1e6
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`
}

// Zeitpunkte aus Epoch-SEKUNDEN (so liefert die API sie, nicht in
// Millisekunden) — kurzes deutsches Datum mit Uhrzeit für Listenzeilen.
export function fmtZeitpunkt(epochSekunden) {
  if (epochSekunden == null || !Number.isFinite(Number(epochSekunden))) {
    return '–'
  }
  return new Date(Number(epochSekunden) * 1000)
    .toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}

// Dauern menschenlesbar: Sekunden → s / min / h (ETA des lokalen Laufs)
export function fmtDauer(s) {
  if (s == null) return '?'
  if (s > 3600) return `${(s / 3600).toFixed(1)} h`
  if (s > 60) return `${Math.round(s / 60)} min`
  return `${Math.round(s)} s`
}
