// Bemessung (Dimensionierung) zentraler Behandlungsanlagen im Trennverfahren
// nach DWA-A 102-2:2020, Abschnitt 6.2 + Anhang B.
//
// Reine, testbare Funktionen (kein Vue/Pinia). Validiert gegen Tabelle 7 des
// Anwendungsbeispiels (8/8/4 ha → A_RKB ≈ 222,5 m², V_RKB ≈ 445 m³).
//
// Formeln:
//   b_BÜ    = b_a · a_BÜ                                  (Frachtanteil Beckenüberlauf)
//   η_ges   = 1 − (280 − b_BÜ) / (b_a − b_BÜ)             (erf. Gesamtwirkungsgrad)
//   q_A,Bem = −8,333 · ln(η_ges) − 1,6629   [m/h]         (Bild 4, Regression)
//   Q_Bem,Tr = r_krit · A_b,a · f_D + Q_F   [l/s]         (Gl. B.2)
//   A_RKB   = 3,6 · Q_Bem,Tr / q_A,Bem      [m²]          (Gl. 10)
//   V_RKB   = A_RKB · h_RKB                 [m³]          (Gl. 11, h_RKB ≥ 2,0 m)
//   A_eff   = 3,6 · Q_Bem,Tr / q_A,max      [m²]          (Gl. 12, Schrägklärer)

import { ALLOWED_SPECIFIC_LOAD } from './dwaA102Categories.js'

// Regressionskoeffizienten der Beziehung q_A,Bem(η_ges) aus Bild 4 (SCHMITT 2018).
export const QA_REGRESSION = { a: -8.333, b: -1.6629 }

// Übliches Längen-/Breitenverhältnis nach DWA-A 166 (Mittel aus 3 … 4,5) für den Abmessungs-Hinweis.
export const LB_RATIO = 3.5

export const RKB_DEFAULTS = {
  overflowFraction: 0.10, // a_BÜ – Abfluss-/Frachtanteil über Beckenüberlauf (≈ 10 % bei r_krit = 15)
  rkrit: 15, // kritische Regenspende [l/(s·ha)]
  foreignWater: 0, // Q_F [l/s]
  fD: 1.0, // Abminderungsfaktor undurchlässige Teilflächen
  basinDepth: 2.0, // h_RKB [m] (Mindesttiefe)
  qAmax: 6 // q_A,max [m/h] für Schrägklärer
}

/**
 * Erforderlicher Gesamtwirkungsgrad η_ges des Regenklärbeckens.
 * Berücksichtigt den über den Beckenüberlauf unbehandelt abgeführten Frachtanteil.
 * @returns {number} η_ges als Anteil (0 … 1); 0, wenn keine Behandlung nötig.
 */
export function requiredOverallEfficiency(specificLoad, overflowFraction, allowed = ALLOWED_SPECIFIC_LOAD) {
  const ba = Number(specificLoad) || 0
  if (ba <= allowed) return 0
  const bBÜ = ba * overflowFraction
  const denom = ba - bBÜ
  if (denom <= 0) return 0
  return Math.max(0, 1 - (allowed - bBÜ) / denom)
}

/**
 * Bemessungswert der Oberflächenbeschickung q_A,Bem [m/h] aus η_ges (Bild 4).
 * Gültig nur für η_ges in (0, 1); kann ≤ 0 werden (dann RKB nicht darstellbar).
 */
export function surfaceLoadingRate(etaGes) {
  if (!(etaGes > 0) || etaGes >= 1) return NaN
  return QA_REGRESSION.a * Math.log(etaGes) + QA_REGRESSION.b
}

/**
 * Vollständige Regenklärbecken-Bemessung.
 * @param {object} p
 * @param {number} p.specificLoad b_a [kg/(ha·a)] – gebietsbezogener spez. Stoffabtrag
 * @param {number} p.totalAreaHa A_b,a [ha]
 * @param {number} [p.overflowFraction] a_BÜ
 * @param {number} [p.rkrit] r_krit [l/(s·ha)]
 * @param {number} [p.foreignWater] Q_F [l/s]
 * @param {number} [p.fD] Abminderungsfaktor
 * @param {number} [p.basinDepth] h_RKB [m]
 * @param {number} [p.allowed] zulässiger spez. Stoffaustrag [kg/(ha·a)]
 * @returns {object} Bemessungsergebnis inkl. feasible-Flag.
 */
export function designRetentionBasin(p) {
  const {
    specificLoad,
    totalAreaHa,
    overflowFraction = RKB_DEFAULTS.overflowFraction,
    rkrit = RKB_DEFAULTS.rkrit,
    foreignWater = RKB_DEFAULTS.foreignWater,
    fD = RKB_DEFAULTS.fD,
    basinDepth = RKB_DEFAULTS.basinDepth,
    allowed = ALLOWED_SPECIFIC_LOAD
  } = p

  const ba = Number(specificLoad) || 0
  const aba = Number(totalAreaHa) || 0
  const bBÜ = ba * overflowFraction
  const etaGes = requiredOverallEfficiency(ba, overflowFraction, allowed)
  const qABem = surfaceLoadingRate(etaGes)
  const qBemTr = rkrit * aba * fD + foreignWater // Q_Bem,Tr [l/s]

  // Darstellbarkeit: Regression liefert nur für η_ges < ~0,82 ein positives q_A,Bem.
  const feasible = Number.isFinite(qABem) && qABem > 0 && etaGes > 0

  let aRKB = null
  let vRKB = null
  let specificVolume = null
  let length = null
  let width = null
  if (feasible) {
    aRKB = (3.6 * qBemTr) / qABem
    vRKB = aRKB * basinDepth
    specificVolume = aba > 0 ? vRKB / aba : 0
    width = Math.sqrt(aRKB / LB_RATIO)
    length = LB_RATIO * width
  }

  return { ba, bBÜ, etaGes, qABem, qBemTr, aRKB, vRKB, specificVolume, length, width, feasible }
}

/**
 * Schrägklärer (optional): sedimentationswirksame Oberfläche A_eff (Gl. 12).
 * Speicherwirkung/η_ges sind hierfür per Schmutzfrachtsimulation zu ermitteln.
 */
export function designLamellaClarifier({ qBemTr, qAmax = RKB_DEFAULTS.qAmax }) {
  const q = Number(qAmax) || 0
  const aEff = q > 0 ? (3.6 * (Number(qBemTr) || 0)) / q : null
  return { aEff, qAmax: q }
}
