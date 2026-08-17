// Laubkarten — Auswertung nach der Spezifikation „PostProzessing Laubkarten".
//
// Zwei Fragen, zwei Läufe, dieselbe Rasterebene:
//   Karte A  wo bleibt schwimmendes Laub beim LEERLAUFEN liegen
//            (Oberflächentracer, siehe utils/laubtracer.js)
//   Karte B  wo erzeugt ein SPÜLSCHWALL genug Sohlschubspannung
//   Karte C  der Verschnitt — die eigentliche Planungsaussage
//
// Hier stehen die reinen Rechenfunktionen. Sie kennen weder Vue noch Canvas
// und arbeiten auf den Rasterspalten des Viz-Gitters (`col = j*nx + i`, wie
// planFields in composables/useFieldCache.js).
//
// Der Kniff, der den τ_krit-Regler live macht: Karte B wird NICHT für einen
// festen Schwellwert aggregiert, sondern als ÜBERSCHREITUNGSKURVE je Zelle
// (wie lange lag τ über s, für ein Raster von s-Stufen). Daraus folgen die
// Überschreitungsdauer und das Spülintegral für JEDES τ_krit ohne die Daten
// noch einmal anzufassen — denn
//     ∫ (τ(t) − c)+ dt  =  ∫_c^∞ T(s) ds        mit T(s) = Dauer{ τ > s }.
// Ein Regler kostet damit einen Durchlauf über ein kleines Array statt eines
// erneuten Durchlaufs über alle Zeitschritte.

/**
 * Stufenraster für die Überschreitungskurve: logarithmisch, weil die
 * Sohlschubspannung über Größenordnungen streut (Ruhezone 0,01 Pa,
 * Strahlangriff 100 Pa+).
 */
export function erzeugeTauStufen(tauMax, anzahl = 24) {
  const obergrenze = Number.isFinite(tauMax) && tauMax > 0 ? tauMax : 1
  const untergrenze = obergrenze / 1000
  const stufen = new Float64Array(anzahl)
  for (let k = 0; k < anzahl; k++) {
    stufen[k] = untergrenze
      * Math.pow(obergrenze / untergrenze, k / (anzahl - 1))
  }
  stufen[0] = 0                      // die unterste Stufe ist „überhaupt Schub"
  return stufen
}

/**
 * Sammelbehälter für Karte B. `hist` zählt je Zelle, wie viel ZEIT in
 * welcher τ-Stufe verbracht wurde (Index = Anzahl Stufen unterhalb τ);
 * daraus wird am Ende die Überschreitungskurve als Suffixsumme.
 */
export function neueSpuelAggregation(nZellen, stufen) {
  const k = stufen.length
  return {
    stufen,
    nZellen,
    // Zeit je τ-Stufe …
    hist: new Float64Array(nZellen * (k + 1)),
    // … und die τ-gewichtete Zeit derselben Stufe. Erst dieses zweite Feld
    // macht das Spülintegral exakt: mit der Zeit allein müsste man die
    // Überschreitungskurve integrieren und verlöre an der Spitze rund ein
    // Fünftel (an der Handrechnung 12,5 statt 16 Pa·s gemessen).
    histTau: new Float64Array(nZellen * (k + 1)),
    tauMax: new Float32Array(nZellen),        // 0 = nie belastet
    benetzt: new Uint8Array(nZellen),         // war die Zelle je nass?
    dauer: 0,                                 // ausgewertete Ereignisdauer
  }
}

/**
 * Einen Zeitschritt einrechnen.
 *
 * `nass` maskiert: in luftgefüllten Randzellen ist die Wandschubspannung
 * physikalisch bedeutungslos und klein — ohne diese Maske entstehen
 * systematisch zu niedrige Werte an den Rändern des Schwalls (Spez. 4.2).
 */
export function spuelSchritt(agg, tau, nass, dt) {
  if (!(dt > 0)) return
  const k = agg.stufen.length
  agg.dauer += dt
  for (let col = 0; col < agg.nZellen; col++) {
    if (!nass[col]) continue
    agg.benetzt[col] = 1
    const t = tau[col]
    if (!Number.isFinite(t) || t <= 0) continue
    if (t > agg.tauMax[col]) agg.tauMax[col] = t
    let idx = 0
    while (idx < k && agg.stufen[idx] < t) idx++   // Stufen unterhalb τ
    const platz = col * (k + 1) + idx
    agg.hist[platz] += dt
    agg.histTau[platz] += t * dt
  }
}

/**
 * Zeitgewichte der Schreibzeitpunkte (Trapezregel): halbe Nachbarabstände,
 * an den Enden nur die halbe Seite.
 *
 * Klingt nach Kleinkram, ist aber die Stelle, an der eine Belastungsdauer
 * still falsch wird: mit „dt = Abstand zum Vorgänger" zählt der erste
 * Zeitpunkt gar nicht und der letzte doppelt, und die Summe der Gewichte
 * ist nicht mehr die Ereignisdauer. Für einen Schwall, dessen Spitze am
 * Anfang liegt, ist das genau der falsche Fehler.
 */
export function zeitGewichte(zeiten) {
  const n = zeiten.length
  const w = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const vor = i > 0 ? zeiten[i] - zeiten[i - 1] : 0
    const nach = i < n - 1 ? zeiten[i + 1] - zeiten[i] : 0
    w[i] = (vor + nach) / 2 || vor || nach
  }
  return w
}

/**
 * Karte B für EIN τ_krit auswerten — das ist der Aufruf hinter dem Regler.
 * Rückgabe je Zelle: Spitzenbelastung, Überschreitungsdauer, Spülintegral
 * (Pa·s) und ob die Zelle überhaupt benetzt war.
 *
 * Gerechnet wird stufenweise statt über eine interpolierte Kurve:
 *   t_exceed = Σ Zeit der Stufen, deren mittleres τ über τ_krit liegt
 *   I_spuel  = Σ (Στ·dt − τ_krit·Σdt) derselben Stufen
 * Für Stufen ganz oberhalb τ_krit ist das EXAKT; unscharf ist nur die eine
 * Stufe, in die τ_krit selbst fällt.
 */
export function spuelAuswerten(agg, tauKrit) {
  const k = agg.stufen.length
  const tExceed = new Float32Array(agg.nZellen)
  const iSpuel = new Float32Array(agg.nZellen)

  for (let col = 0; col < agg.nZellen; col++) {
    const basis = col * (k + 1)
    let dauer = 0
    let integral = 0
    for (let i = 0; i <= k; i++) {
      const zeit = agg.hist[basis + i]
      if (zeit <= 0) continue
      const mittel = agg.histTau[basis + i] / zeit      // mittleres τ der Stufe
      if (mittel <= tauKrit) continue
      dauer += zeit
      integral += agg.histTau[basis + i] - tauKrit * zeit
    }
    tExceed[col] = dauer
    iSpuel[col] = integral
  }
  return { tauMax: agg.tauMax, benetzt: agg.benetzt, tExceed, iSpuel,
           dauer: agg.dauer }
}

// ── Trockenfallzeit (Begleitfeld zu Karte A) ────────────────────────────────

/**
 * Wassertiefen-Stufen für die Trockenfallzeit, logarithmisch von 1 mm bis
 * 0,5 m. „Trockengefallen" ist keine Naturkonstante, sondern eine Setzung:
 * ein Millimeterfilm trocknet von selbst weg, eine 3-cm-Lache nicht.
 */
export function erzeugeTiefenStufen(anzahl = 10) {
  const lo = 0.001
  const hi = 0.5
  const stufen = new Float64Array(anzahl)
  for (let k = 0; k < anzahl; k++) {
    stufen[k] = lo * (hi / lo) ** (k / (anzahl - 1))
  }
  return stufen
}

/**
 * Je Rasterspalte der LETZTE Zeitpunkt, zu dem noch Wasser stand. Spät
 * trockenfallende Bereiche und Restpfützen sind die geometrisch zwingenden
 * Sammelstellen — sie sollen unabhängig vom Tracerergebnis sichtbar sein
 * (Spez. 3.3).
 *
 * Gespeichert wird nicht EIN Zeitpunkt je Zelle, sondern einer JE
 * TIEFENSTUFE — derselbe Kniff wie bei der τ-Überschreitungskurve. Damit
 * wird die Nass-Schwelle zum Regler: er wählt nur noch eine Spalte aus,
 * statt eine erneute Auswertung über alle Zeitschritte zu erzwingen.
 */
export function neueTrockenfall(nZellen, stufen = erzeugeTiefenStufen()) {
  return { nZellen, stufen,
           tLetzt: new Float32Array(nZellen * stufen.length).fill(NaN),
           t0: NaN, tEnde: NaN }
}

export function trockenfallSchritt(tf, tiefe, zeit) {
  if (!Number.isFinite(tf.t0)) tf.t0 = zeit
  tf.tEnde = zeit
  const k = tf.stufen.length
  for (let col = 0; col < tf.nZellen; col++) {
    const h = tiefe[col]
    // Die Stufen sind aufsteigend: bei der ersten, die nicht mehr erreicht
    // wird, ist Schluss. Trockene Zellen brechen sofort ab.
    for (let i = 0; i < k && h >= tf.stufen[i]; i++) {
      tf.tLetzt[col * k + i] = zeit
    }
  }
}

/**
 * Trockenfallzeit für EINE Nass-Schwelle: Sekunden seit Laufbeginn, zu
 * denen zuletzt Wasser über `hNass` stand. NaN = war nie so nass.
 *
 * Absolute Sekunden statt der früheren 0…1-Normierung: die versteckte,
 * dass „1" beim Beispiellauf 240 s heißt. Die Farbskala liest sich in
 * Sekunden von selbst richtig.
 */
export function trockenfallAuswerten(tf, hNass) {
  const k = tf.stufen.length
  // die größte Stufe, die die gewünschte Schwelle nicht überschreitet
  let idx = 0
  while (idx + 1 < k && tf.stufen[idx + 1] <= hNass) idx++
  const out = new Float32Array(tf.nZellen).fill(NaN)
  for (let col = 0; col < tf.nZellen; col++) {
    const t = tf.tLetzt[col * k + idx]
    if (Number.isFinite(t)) out[col] = t - tf.t0
  }
  return out
}

/**
 * Wo war überhaupt je Wasser? Bezugsfläche für die Flächenanteile.
 *
 * Bewusst aus der FEINSTEN Stufe und damit unabhängig vom Regler — sonst
 * sprängen die Prozentangaben in Karte C, sobald jemand an der
 * Nass-Schwelle für Karte A′ dreht.
 */
export function jeBenetzt(tf) {
  const k = tf.stufen.length
  const out = new Uint8Array(tf.nZellen)
  for (let col = 0; col < tf.nZellen; col++) {
    out[col] = Number.isFinite(tf.tLetzt[col * k]) ? 1 : 0
  }
  return out
}

// ── Welche Stellschraube wirkt auf welche Karte ─────────────────────────────
//
// Vorher standen alle Regler immer da, egal welche Karte gezeigt wurde: auf
// A und A′ bewirkte kein einziger etwas Sichtbares, und auf B stand die
// Ablagerungsschwelle direkt unter τ_krit, als gehöre sie dazu. Ein
// Bedienelement, das nichts tut, ist schlimmer als keins — es behauptet
// eine Wirkung.

export const REGLER_JE_KARTE = {
  A: ['ablagerung'],           // Schwelle dämpft, was Karte C aussortiert
  T: ['nass'],                 // ab welcher Tiefe gilt eine Fläche als nass
  B: ['tau'],
  Bt: ['tau'],
  C: ['tau', 'ablagerung', 'spuel'],
}

/** Die Regler, die auf die gezeigte Karte wirken — in fester Reihenfolge. */
export function reglerFuer(karte) {
  return REGLER_JE_KARTE[karte] ?? []
}

// ── Karte C: Verschnitt ─────────────────────────────────────────────────────

export const KLASSE = {
  UNKRITISCH: 0,     // wenig Ablagerung oder ausreichend gespült
  BEOBACHTEN: 1,     // viel Ablagerung, aber Spülung reicht
  KRITISCH: 2,       // viel Ablagerung, Spülung reicht nicht
  TOT: 3,            // viel Ablagerung, vom Schwall nie erreicht
}

export const KLASSEN_TEXT = [
  'unkritisch', 'beobachten', 'kritisch', 'tote Fläche',
]

/**
 * Verschnitt von Karte A und B. Die Schwellen sind Parameter, keine
 * Naturkonstanten — das ist der Grund, warum sie im Panel bedienbar sind
 * und mit dem Ergebnis angezeigt werden (Spez. 5).
 *
 * `iMin` ist das Spülintegral, ab dem die Spülwirkung als ausreichend
 * gilt; 0 heißt „jede Überschreitung von τ_krit genügt".
 */
export function klassenFeld(ablagerung, iSpuel, benetzt, aSchwelle, iMin = 0) {
  const n = ablagerung.length
  const out = new Uint8Array(n)
  for (let col = 0; col < n; col++) {
    const viel = ablagerung[col] >= aSchwelle
    if (!viel) { out[col] = KLASSE.UNKRITISCH; continue }
    if (!benetzt[col]) { out[col] = KLASSE.TOT; continue }
    out[col] = iSpuel[col] > iMin ? KLASSE.BEOBACHTEN : KLASSE.KRITISCH
  }
  return out
}

/**
 * Flächenanteile je Klasse — die eigentliche Kennzahl für einen Bericht.
 * `gueltig` blendet Zellen aus, die gar nicht zum Bauwerk gehören.
 */
export function flaechenanteile(klassen, zellflaeche, gueltig = null) {
  const zellen = [0, 0, 0, 0]
  let gesamt = 0
  for (let col = 0; col < klassen.length; col++) {
    if (gueltig && !gueltig[col]) continue
    zellen[klassen[col]]++
    gesamt++
  }
  return zellen.map((n, i) => ({
    klasse: i,
    text: KLASSEN_TEXT[i],
    zellen: n,
    flaeche: n * zellflaeche,
    anteil: gesamt > 0 ? n / gesamt : 0,
  }))
}

// ── Bildunterschrift für den Export ─────────────────────────────────────────

/** Beschriftung der Karten, an EINER Stelle (Panel und Export lesen sie). */
export const KARTEN_NAME = {
  A: 'Karte A — Ablagerung',
  T: 'Karte A′ — Trockenfallzeit',
  B: 'Karte B — Spülintegral',
  Bt: 'Karte B′ — Überschreitungsdauer',
  C: 'Karte C — Verschnitt',
}

/**
 * Die Zeilen, die in ein exportiertes Bild eingebrannt werden.
 *
 * Ohne sie ist eine Laubkarte im Bericht nicht nachvollziehbar: die
 * Schwellen SIND die Aussage. „3 % kritische Fläche" ohne τ_krit und
 * Ablagerungsschwelle ist keine Angabe, sondern eine Zahl.
 *
 * Genannt wird nur, was auf die gezeigte Karte auch wirkt (`reglerFuer`) —
 * ein τ_krit unter Karte A′ wäre eine falsche Fährte.
 *
 * @returns {string[]} zwei bis drei Zeilen, fertig zum Zeichnen
 */
export function bildunterschrift({ karte, leerlauf, schwall, tauKrit,
  tauHerkunft, aSchwelle, iMin, nassTiefe, anteile = [], bilanz = null,
  datum = '' }) {
  const z = (v, n = 2) => Number(v).toLocaleString('de-DE',
    { maximumFractionDigits: n })
  const wirkt = new Set(reglerFuer(karte))

  const kopf = [KARTEN_NAME[karte] ?? karte,
    `Leerlauf ${leerlauf}`, `Schwall ${schwall}`]
  if (datum) kopf.push(datum)

  const werte = []
  if (wirkt.has('tau')) {
    werte.push(`τ_krit ${z(tauKrit)} N/m²${tauHerkunft ? ` (${tauHerkunft})` : ''}`)
  }
  if (wirkt.has('ablagerung')) werte.push(`Ablagerung ab Faktor ${z(aSchwelle)}`)
  if (wirkt.has('spuel')) werte.push(`Spülintegral ≥ ${z(iMin)} N·s/m²`)
  if (wirkt.has('nass')) werte.push(`nass ab ${z(nassTiefe * 1000, 0)} mm`)

  const zeilen = [kopf.join(' · ')]
  if (werte.length) zeilen.push(werte.join(' · '))
  if (karte === 'C' && anteile.length) {
    zeilen.push(anteile
      .map((a) => `${a.text} ${z(a.anteil * 100, 1)} %`).join(' · '))
  }
  if (bilanz) {
    zeilen.push(`Laub: ${bilanz.gestrandet} trockengefallen · `
      + `${bilanz.restwasser} in Restpfützen · ${bilanz.draussen} hinaus`
      + (bilanz.stimmt ? '' : ' — BILANZ GEHT NICHT AUF'))
  }
  return zeilen
}
