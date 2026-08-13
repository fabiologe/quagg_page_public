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
