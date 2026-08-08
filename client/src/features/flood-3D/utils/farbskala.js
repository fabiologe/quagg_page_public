// Grenzen der Farbskala, wenn der Nutzer sie „fixiert".
//
// Vorher standen lockMin/lockMax fest auf 0…1 und wurden beim Anhaken NIE
// aus dem aktuellen Bereich übernommen: Wer bei Sohlschubspannung 0…80
// N/m² auf „fixieren" klickte, bekam schlagartig 0…1 — die Karte wurde
// flächig gelb und sah aus wie ein Rechenfehler. Dazu kam: ein leeres
// Eingabefeld liefert NaN, und viridis(NaN) faellt auf das obere
// Skalenende zurueck — also ebenfalls alles gelb, ohne jede Meldung.

/** Grenzen beim Einschalten der Fixierung: der Bereich, den man sieht. */
export function uebernehmeBereich(auto) {
  const [lo, hi] = auto ?? [0, 1]
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1]
  // auf 3 signifikante Stellen — runde Zahlen lassen sich von Hand
  // nachjustieren, 0.30000000000000004 nicht
  const r = (v) => (v === 0 ? 0 : Number(v.toPrecision(3)))
  return [r(lo), r(hi)]
}

/**
 * Effektiver Bereich fuers Zeichnen. Faellt auf den Auto-Bereich zurueck,
 * wenn die Eingaben unbrauchbar sind (leer/NaN/min >= max) — lieber eine
 * sinnvolle Karte als eine einfarbige Flaeche ohne Erklaerung.
 */
export function wirksamerBereich(aktiv, min, max, auto) {
  if (!aktiv) return auto
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return auto
  return [min, max]
}

/** true, wenn die Eingaben unbrauchbar sind — fuer den Hinweis im UI. */
export function bereichUngueltig(aktiv, min, max) {
  if (!aktiv) return false
  return !Number.isFinite(min) || !Number.isFinite(max) || max <= min
}
