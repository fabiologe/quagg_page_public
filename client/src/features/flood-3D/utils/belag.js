// Belagskarte — die Rechnungen hinter der Materialbibliothek.
//
// Bewusst hier und nicht in der Komponente: es sind Aussagen, keine
// Anzeige. Beim Belag-Pinsel hat sich gezeigt, wohin das führt, wenn man
// es vermischt — ein Test war grün, ohne etwas zu prüfen, weil die
// Rechnung nur über eine Zeigerkette erreichbar war.

/**
 * Manning-n aus der äquivalenten Sandrauheit (Strickler: n = k_s^(1/6)/26).
 *
 * NUR eine Brücke für den, der aus der 2D-Welt kommt: dort ist n die
 * gewohnte Größe, OpenFOAM kennt aber ausschließlich k_s in Metern.
 * Gegenprobe an Tabellenwerten — Beton 0,002 m ergibt 0,014, Erde
 * 0,03 m ergibt 0,021; beides deckt sich mit den üblichen Angaben.
 */
export function manningVon(ks) {
  return ks > 0 ? ks ** (1 / 6) / 26 : null
}

/** Zellen je Kennung, einschließlich 0 („kein Belag"). */
export function kennungZaehlen(ids) {
  const aus = new Map()
  if (!ids) return aus
  for (let k = 0; k < ids.length; k++) {
    const id = ids[k]
    aus.set(id, (aus.get(id) ?? 0) + 1)
  }
  return aus
}

/**
 * Flächenanteil einer Kennung an der Geländefläche — die Zahl, die man
 * beim Malen wirklich braucht: „habe ich alles erwischt?"
 */
export function anteilVon(zaehlung, id, gesamt) {
  if (!gesamt) return 0
  return (zaehlung.get(id) ?? 0) / gesamt
}

/**
 * Kennungen, die gemalt sind, zu denen aber kein Material gehört.
 *
 * Ohne diesen Hinweis wären sie ein stummes Loch: der Fallaufbau baut
 * für eine unbekannte Kennung keinen Patch, und die Fläche behielte
 * still das Grundmaterial des Geländes — man sähe es dem Ergebnis nicht
 * an.
 */
export function verwaisteKennungen(zaehlung, belaege) {
  const bekannt = new Set((belaege ?? []).map((b) => b.id))
  return [...zaehlung.keys()]
    .filter((id) => id > 0 && !bekannt.has(id))
    .sort((a, b) => a - b)
}

/**
 * Die kleinste freie Kennung. Kleinste statt „letzte + 1", damit eine
 * Lücke nach dem Löschen wieder aufgefüllt wird — die Kennungen sind auf
 * 1…99 begrenzt (casespec.Belag).
 */
export function freieKennung(belaege) {
  const belegt = new Set((belaege ?? []).map((b) => b.id))
  for (let id = 1; id <= 99; id++) if (!belegt.has(id)) return id
  return null
}
