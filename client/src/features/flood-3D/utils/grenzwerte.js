// EINE Quelle für die Bewertungs-Grenzwerte der Ergebnis-Panels
// (Audit U15): vorher rechneten die Panels mit eigenen Literalen NEBEN den
// Fall-Kriterien her — ein geändertes Kriterium im Fall änderte die
// Panel-Ampel nicht. Regel: steht im Ergebnis ein passendes Kriterium,
// GEWINNT es; sonst gelten die hier benannten Vorbelegungen.

// Vorbelegungen (fachliche Faustwerte; Herkunft je Wert)
export const VORBELEGUNG = {
  // Kurzschlusskennzahl t10/τ: unter 0,3 gilt der Durchfluss als
  // Kurzschluss, ab 0,5 als gut durchmischt (ATV/DWA-Praxis)
  kurzschluss_schlecht: 0.3,
  kurzschluss_gut: 0.5,
  // y+ der Wandfunktionen: über ~500 verlässt die Standard-Wandfunktion
  // ihren Gültigkeitsbereich
  y_plus_max: 500,
  // Massenbilanz: Speicheränderungs-Restfehler relativ zum Zufluss
  bilanz_warn: 0.02,
  bilanz_schlecht: 0.05,
}

// Grenzwert aus den Fall-Kriterien eines Ergebnisses ziehen — `kind` wie
// in casespec (kurzschluss, massenbilanz, …), Feld limit_min/limit_max.
export function ausKriterium(result, kind, feld) {
  for (const t of result?.targets ?? []) {
    if (t.kind === kind && t[feld] != null) return t[feld]
  }
  return null
}

// Kurzschluss-Schwellen: Kriterium (limit_min) gewinnt gegen Vorbelegung.
// Die „gut"-Schwelle bleibt Vorbelegung — das Kriterium kennt nur EINE
// Grenze, die Ampel braucht zwei Stufen.
export function kurzschlussSchwellen(result) {
  const limit = ausKriterium(result, 'kurzschluss', 'limit_min')
  return {
    schlecht: limit ?? VORBELEGUNG.kurzschluss_schlecht,
    gut: Math.max(limit ?? 0, VORBELEGUNG.kurzschluss_gut),
  }
}

// Massenbilanz-Schwellen: massenbilanz-Kriterium (limit_max) gewinnt.
export function bilanzSchwellen(result) {
  const limit = ausKriterium(result, 'massenbilanz', 'limit_max')
  return {
    warn: limit ?? VORBELEGUNG.bilanz_warn,
    schlecht: limit != null ? limit * 2.5 : VORBELEGUNG.bilanz_schlecht,
  }
}
