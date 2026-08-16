// Welche zwei Läufe darf man überhaupt verschneiden?
//
// Karte C legt eine Ablagerungskarte aus dem LEERLAUF über eine
// Spülkarte aus dem SCHWALL — Zelle auf Zelle. Das ergibt nur dann eine
// Aussage, wenn beide dieselbe Rasterebene meinen. Zwei Hürden dabei,
// und die zweite ist die unangenehmere:
//
//  1. Gleiches NETZ. Der `netz_hash` ist die Identität der Vernetzung;
//     unterscheidet er sich, liegt schon das Gelände woanders.
//  2. Gleiches AUSGABERASTER. Das Viz-Gitter wird aus einem Datenbudget
//     abgeleitet und hängt damit an Laufdauer und Schreibintervall — zwei
//     Läufe auf demselben Netz können trotzdem verschieden fein
//     ausgegeben worden sein. Dann sind `col`-Indizes nicht dieselben
//     Orte, und ein Verschnitt wäre stiller Unsinn.
//
// Deshalb prüft das Panel beides: (1) beim Anbieten der Paare, (2) nach
// dem Laden der beiden Gitter, bevor gerechnet wird.

/**
 * Läufe, die als Partner zu `referenz` in Frage kommen: fertig gerechnet,
 * nicht der Lauf selbst, und auf demselben Netz.
 *
 * Läufe ohne `netz_hash` (vor 2026-08-16 gerechnet) werden NICHT
 * stillschweigend zugelassen — sonst verschneidet jemand zwei Altläufe und
 * erfährt es nie. Sie erscheinen mit `unbekannt: true`, damit das Panel
 * den Grund nennen kann.
 */
export function paarKandidaten(runs, referenzId) {
  const referenz = (runs ?? []).find((r) => r.run_id === referenzId)
  const hash = referenz?.netz_hash ?? null
  return (runs ?? [])
    .filter((r) => r.run_id !== referenzId && r.status === 'completed')
    .map((r) => ({
      run_id: r.run_id,
      netz_hash: r.netz_hash ?? null,
      unbekannt: !r.netz_hash || !hash,
      passt: !!hash && !!r.netz_hash && r.netz_hash === hash,
    }))
}

/** Kurzform eines Netz-Hashes für die Anzeige (wie im Laufprotokoll). */
export const netzKurz = (h) => (h ? String(h).slice(0, 12) : '–')

/**
 * Passen die AUSGABERASTER zweier Läufe Zelle auf Zelle zusammen?
 * Verglichen wird nur die Grundrissebene (nx, ny, Ursprung, Zellgröße) —
 * die Höhenschichtung darf sich unterscheiden, sie geht in die Karten
 * nicht ein.
 *
 * @returns {{passt: boolean, grund: string}}
 */
export function rasterVergleich(a, b) {
  if (!a || !b) return { passt: false, grund: 'Rasterangaben fehlen.' }
  const eps = 1e-6
  if (a.dims[0] !== b.dims[0] || a.dims[1] !== b.dims[1]) {
    return { passt: false,
      grund: `Verschieden große Ausgaberaster (${a.dims[0]}×${a.dims[1]} `
        + `gegen ${b.dims[0]}×${b.dims[1]} Zellen). Das Viz-Gitter folgt `
        + 'einem Datenbudget und hängt deshalb an Laufdauer und '
        + 'Schreibintervall — für ein Kartenpaar müssen beide Läufe darin '
        + 'übereinstimmen.' }
  }
  for (let d = 0; d < 2; d++) {
    if (Math.abs(a.origin[d] - b.origin[d]) > eps
        || Math.abs(a.spacing[d] - b.spacing[d]) > eps) {
      return { passt: false,
        grund: 'Die Ausgaberaster liegen verschoben oder haben verschiedene '
          + 'Zellgrößen — dieselbe Zellnummer meint in beiden Läufen einen '
          + 'anderen Ort.' }
    }
  }
  return { passt: true, grund: '' }
}
