// Welche zwei Läufe darf man verschneiden — und was sagt man dazu?
//
// Karte C legt eine Ablagerungskarte aus dem LEERLAUF über eine Spülkarte
// aus dem SCHWALL, Zelle auf Zelle.
//
// Bis 2026-08-17 entschied das EINE Kennung: gleicher `netz_hash` oder
// nichts. Die war zu streng — sie umfasste die Randbedingungen samt
// Zuflussmenge, und ein Leerlauf unterscheidet sich von einem Schwall per
// Definition genau darin. Das Kriterium schloss also aus, wofür es gebaut
// war (gemessen an Rentrich_BetaTest08 r006/r007: gleiches Netz, 29.010
// Zellen, identisches Ausgaberaster, einziger Unterschied q = 0,0 gegen
// 0,8 m³/s).
//
// Jetzt beantwortet der Server `/runs/vergleich` drei getrennte Fragen —
// deckt sich das Raster (hart), dasselbe Netz, dasselbe Bauwerk — und
// nennt die Unterschiede im Klartext. Hier steht nur noch, wie daraus ein
// Satz für die Bedienung wird.

/**
 * Läufe, die als Partner in Frage kommen: fertig gerechnet und nicht der
 * Lauf selbst.
 *
 * Bewusst OHNE Kennungsfilter. Ob ein Paar zusammenpasst, beantwortet der
 * Vergleich nach der Auswahl — vorher etwas auszugrauen hieße, den Nutzer
 * mit einer Zahl auszusperren, die er weder sieht noch ändern kann.
 */
export function paarKandidaten(runs, referenzId) {
  return (runs ?? [])
    .filter((r) => r.run_id !== referenzId && r.status === 'completed')
    .map((r) => ({ run_id: r.run_id, netz_hash: r.netz_hash ?? null }))
}

/** Kurzform eines Netz-Hashes für die Anzeige (wie im Laufprotokoll). */
export const netzKurz = (h) => (h ? String(h).slice(0, 12) : '–')

/** Menschenlesbare Fundstelle aus einem Vergleichspfad. */
export function unterschiedText(u) {
  const wert = (v) => (v === null || v === undefined ? '–' : String(v))
  return `${u.pfad}: ${wert(u.a)} → ${wert(u.b)}`
}

/**
 * Aus der Serverantwort die Ampel für die Bedienung.
 *
 * `rechenbar` hängt allein am Raster — eine rote Ampel warnt, sperrt aber
 * nicht. Genau das Sperren war der Fehler von vorher.
 *
 * @returns {{stufe: string, titel: string, text: string, rechenbar: boolean}}
 */
export function paarStufe(v) {
  if (!v) {
    return { stufe: '', titel: '', text: '', rechenbar: false }
  }
  if (!v.raster?.gleich) {
    return { stufe: 'rot', rechenbar: false,
      titel: 'Die Karten decken sich nicht',
      text: v.raster?.grund || 'Die Ausgaberaster passen nicht zusammen.' }
  }
  if (v.stufe === 'gruen') {
    return { stufe: 'gruen', rechenbar: true,
      titel: 'Gleiches Netz',
      text: 'Beide Läufe wurden auf derselben Vernetzung gerechnet — die '
        + 'Karten liegen Zelle auf Zelle übereinander.' }
  }
  if (v.geometrie?.stand === 'verschieden') {
    return { stufe: 'rot', rechenbar: true,
      titel: 'Verschiedene Bauwerke',
      text: 'Die Geometrie der beiden Läufe unterscheidet sich. Das '
        + 'Ausgaberaster passt zwar, der Verschnitt vergleicht dann aber '
        + 'zwei verschiedene Bauwerke — als Variantenvergleich brauchbar, '
        + 'als Planungsaussage nicht.' }
  }
  if (v.geometrie?.stand === 'unbekannt') {
    return { stufe: 'gelb', rechenbar: true,
      titel: 'Geometrie nicht prüfbar',
      text: 'Mindestens einer der beiden Läufe hat seine Geometrie nicht '
        + 'mitgesichert (Läufe vor dem 15.08.). Ob es dasselbe Bauwerk '
        + 'ist, lässt sich hier nicht feststellen — das Ausgaberaster '
        + 'passt.' }
  }
  return { stufe: 'gelb', rechenbar: true,
    titel: 'Gleiches Bauwerk, andere Randbedingungen',
    text: 'Bei einem Leerlauf-/Schwall-Paar ist das der Normalfall: die '
      + 'beiden unterscheiden sich gerade im Zufluss und im Wasserstand.' }
}

/**
 * Passen die AUSGABERASTER zweier Läufe Zelle auf Zelle zusammen?
 *
 * Die ENTSCHEIDUNG trifft der Server (`/runs/vergleich`); das hier ist die
 * Zusicherung nach dem Laden der beiden Gitter. Zwei Regeln an zwei Orten
 * wären genau die Falle, die diesen Umbau ausgelöst hat — deshalb steht
 * hier bewusst keine zweite Meinung, sondern nur ein Riegel gegen eine
 * veraltete Antwort.
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
