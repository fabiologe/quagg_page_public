// Sicherheitsnetze für die Simulation-Phase.
//
// Grundgedanke: Jede Eingabe bekommt (a) harte Grenzen, damit gar nicht
// erst Unsinn entstehen kann, und (b) eine Einordnung, die den Wert in
// die Sprache des Falls übersetzt — also nicht „kleiner = feiner", sondern
// „0,20 m ergibt hier 724.000 Zellen, geschätzt 9 h". Alles rechnet live
// aus der aktuellen Spezifikation, damit die Aussage zum Fall passt und
// nicht allgemein bleibt.
//
// Die Prüfung im Backend bleibt maßgeblich; das hier ist die schnelle
// Rückmeldung beim Tippen.

const f1 = (v) => Number(v).toLocaleString('de-DE', { maximumFractionDigits: 1 })
const f2 = (v) => Number(v).toLocaleString('de-DE', { maximumFractionDigits: 2 })
const int = (v) => Math.round(v).toLocaleString('de-DE')

export function dauerText(stunden) {
  if (!isFinite(stunden) || stunden <= 0) return '–'
  if (stunden < 1 / 60) return '< 1 min'
  if (stunden < 1) return `${Math.round(stunden * 60)} min`
  if (stunden < 48) return `${f1(stunden)} h`
  return `${f1(stunden / 24)} Tage`
}

// --- abgeleitete Größen des Falls ----------------------------------------

export function kennwerte(spec, meshPreview = null, previewStale = false) {
  const d = spec?.domain
  const m = spec?.mesh
  const s = spec?.solver
  if (!d || !m || !s) return null
  const [x0, y0, x1, y1] = d.extent
  const breite = x1 - x0
  const tiefe = y1 - y0
  const hoehe = d.z_max - d.z_min
  const flaeche = breite * tiefe

  // FEINSTE Zelle, nicht die Grundzelle: jede Verfeinerungsstufe halbiert.
  // Ohne das rechnete der Fall unbemerkt mit 0,025 m, während im Panel
  // 0,2 m stand (gemeldet 2026-08-12) — und der Zeitschritt hängt an
  // dieser Zahl, nicht an der Einstellung.
  const stufen = (m.refinements ?? []).map((r) => r.level ?? 0)
  const maxStufe = stufen.length ? Math.max(0, ...stufen) : 0
  const feinsteZelle = m.base_cell / 2 ** maxStufe
  const feinstesAus = (m.refinements ?? [])
    .filter((r) => (r.level ?? 0) === maxStufe)
    .map((r) => (r.type === 'surface' ? (r.target ?? 'Fläche') : (r.id ?? 'Box')))

  // Zellzahl: gemessene Zahl nur, solange das Vorschaunetz zum Fall passt.
  // Ein stehengebliebener Messwert ist schlimmer als eine Schätzung — er
  // sieht nach Wahrheit aus und ändert sich nicht, wenn man an der
  // Grundzelle dreht.
  const gemessen = meshPreview?.cells != null && !previewStale
  const grundzellen = (breite / m.base_cell) * (tiefe / m.base_cell)
                      * (hoehe / m.base_cell) * 0.8
  // Verfeinerung ist der eigentliche Kostentreiber, und sie fehlte hier
  // ganz — daher lag die Schätzung 11-fach daneben.
  //
  // Modell: snappyHexMesh verfeinert eine SCHALE um die Fläche (rund drei
  // Zelllagen der feinsten Stufe), Boxen dagegen ihr ganzes Volumen.
  // Geeicht am gemessenen Netz des Falls Rentrisch_BetaTest06
  // (Grundzelle 0,2 m, Gelände Stufe 3, zwei Boxen Stufe 2 -> 943.370
  // Zellen); das Modell trifft das auf wenige Prozent.
  const SCHALE = 3
  let zusatz = 0
  for (const r of m.refinements ?? []) {
    const lvl = r.level ?? 0
    if (!lvl) continue
    const zelle = m.base_cell / 2 ** lvl
    if (r.type === 'box' && Array.isArray(r.extent) && r.extent.length === 6) {
      const [bx0, by0, bz0, bx1, by1, bz1] = r.extent
      const vol = Math.abs((bx1 - bx0) * (by1 - by0) * (bz1 - bz0))
      zusatz += vol / zelle ** 3
    } else {
      // Geländefläche = Grundfläche des Gebiets; Bauwerksflächen sind
      // dagegen klein, dafür steht eine bescheidene Annahme
      const flaecheR = r.target === 'terrain' ? breite * tiefe : 5
      zusatz += (flaecheR / zelle ** 2) * SCHALE
    }
  }
  const zellen = gemessen ? meshPreview.cells
    : Math.round(grundzellen + zusatz)
  // Wie lange der Lauf VORAUSSICHTLICH rechnet — dieselbe Regel wie
  // core/foamfields.py::schaetzdauer. Beim Leerlauf ist `end_time` nur die
  // Obergrenze; mit ihr zu schätzen hieße, für eine großzügige Reserve
  // Rechenzeit, Datenmenge und Kosten um Größenordnungen zu hoch
  // anzugeben.
  const dauer = s.abbruch?.erwartete_dauer_s ?? s.end_time

  // Zulauf und daraus die erwartete Wassertiefe (wie die Backend-Regel)
  const q = (spec.boundaries ?? [])
    .filter((b) => b.type === 'inflow_constant')
    .reduce((a, b) => a + (b.q ?? 0), 0)
  const wassertiefe = flaeche > 0 ? (q * dauer) / flaeche : 0
  // Zeitschritt aus der FEINSTEN Zelle und der eingestellten Courant-Grenze
  // (vorher: Grundzelle und eine feste 0,3 — dadurch war der Schritt 6-fach
  // zu groß). 6 m/s ist eine grobe Annahme für die maßgebliche
  // Geschwindigkeit; sie steckt in derselben Faustformel wie im Backend.
  const kerne = 8
  const dt = Math.min(s.max_co ?? 0.5, s.max_alpha_co ?? 0.5) * feinsteZelle / 6.0
  const schritte = dauer / Math.max(dt, 1e-9)
  // Durchsatz wie im Backend (core/runner.py durchsatz_je_kern) — beide
  // Schätzungen müssen dieselbe Größe messen, sonst widersprechen sich
  // Panel und Netzvorschau. Zwei Messpunkte auf derselben Maschine:
  // 117.596 Zellen -> 100.000 /Kern-s, 943.370 -> 42.000. Das ist ein
  // Potenzgesetz mit Exponent 0,42.
  const durchsatz = Math.max(8000, Math.min(100000,
    100000 * (zellen / 117596) ** -0.42))
  const stunden = (zellen * schritte) / durchsatz / kerne / 3600
  const ausgaben = s.write_interval_fields > 0
    ? Math.floor(dauer / s.write_interval_fields) + 1 : 0
  return { breite, tiefe, hoehe, flaeche, zellen, q, wassertiefe,
    stunden, ausgaben, dt, dauer, feinsteZelle, maxStufe, feinstesAus,
    gemessen }
}

// --- Grenzen je Feld ------------------------------------------------------
// [min, max] — die Eingabe wird darauf begrenzt, nicht nur gewarnt.

export const GRENZEN = {
  'solver.end_time': [0.1, 100000],
  'solver.max_co': [0.05, 2],
  'solver.max_alpha_co': [0.05, 2],
  'solver.write_interval_fields': [0.01, 100000],
  'solver.write_interval_series': [0.001, 100000],
  'mesh.base_cell': [0.01, 50],
  'terrain.base.resolution': [0.01, 50],
  // Leerlauf: die Grenzen sind dieselben wie im Backend-Modell
  // (core/casespec.py::Abbruch) — sonst kassiert der Server eine Eingabe,
  // die das Formular gerade noch zugelassen hat.
  'solver.abbruch.fenster_s': [0.1, 100000],
  'solver.abbruch.schwelle': [0.0001, 1],
  'solver.abbruch.mindest_abfall': [0, 0.99],
  'solver.abbruch.erwartete_dauer_s': [0.1, 100000],
}

export function begrenzen(pfad, wert) {
  const g = GRENZEN[pfad]
  if (!g || !isFinite(wert)) return wert
  return Math.min(Math.max(wert, g[0]), g[1])
}

// Anteile werden als Prozent BEDIENT und als Anteil GESPEICHERT. Die
// Umrechnung steht hier und nicht im Panel, damit ein Test sie festhält:
// „1 %" im Formular muss beim Solver als 0,01 ankommen, sonst wäre die
// Stagnationsschwelle hundertfach zu groß und jeder Leerlauf sofort fertig.
export const alsProzent = (anteil) => Math.round((anteil ?? 0) * 1000) / 10
export const ausProzent = (prozent) => Number(prozent) / 100

// Vorbelegung beim Umschalten auf „Leerlauf". Muss den Vorgabewerten von
// core/casespec.py::Abbruch entsprechen — sonst rechnet ein im Formular
// angelegter Fall mit einem anderen Kriterium als derselbe Fall aus der
// YAML. Ein Test vergleicht beide Quellen.
export const ABBRUCH_VORGABE = Object.freeze({
  art: 'stagnation',
  fenster_s: 30.0,
  schwelle: 0.01,
  mindest_abfall: 0.05,
  erwartete_dauer_s: null,
})

// --- Einordnung je Feld ---------------------------------------------------
// { text, level } — level: '' | 'warn' | 'bad'

export function hinweis(pfad, spec, meshPreview = null, previewStale = false) {
  const k = kennwerte(spec, meshPreview, previewStale)
  if (!k) return null
  const s = spec.solver
  const d = spec.domain

  switch (pfad) {
    case 'solver.end_time': {
      const t = `Geschätzt ${dauerText(k.stunden)} Rechenzeit auf 8 Kernen `
        + `(${int(k.zellen)} Zellen).`
      if (s.abbruch) {
        // Beim Leerlauf ist das die REISSLEINE, nicht die Dauer: der Lauf
        // endet früher, sobald nichts mehr abläuft. Geschätzt wird deshalb
        // die erwartete Dauer — und dazugesagt, worauf sich die Zahl
        // bezieht, sonst liest man sie als Versprechen.
        const bezug = s.abbruch.erwartete_dauer_s
          ? `für die erwartete Dauer von ${f2(k.dauer)} s`
          : 'für die volle Obergrenze — erwartete Dauer eintragen, dann '
            + 'wird die Schätzung ehrlich'
        return { text: `Obergrenze: so lange rechnet der Lauf HÖCHSTENS. `
          + `Normalerweise endet er früher, sobald nichts mehr abläuft. `
          + `${t} Gerechnet ${bezug}.`,
        level: s.abbruch.erwartete_dauer_s ? '' : 'warn' }
      }
      if (k.stunden > 12) {
        return { text: `${t} Das ist viel — Gebietshöhe und Basiszelle prüfen.`,
          level: 'warn' }
      }
      return { text: t, level: '' }
    }

    // --- Leerlauf (solver.abbruch) ------------------------------------
    // Der Lauf endet an einem ZUSTAND statt an der Uhr. Jede der drei
    // Stellschrauben kann ihn falsch beenden, deshalb sagt jeder Hinweis,
    // WAS bei einem falschen Wert passiert.

    case 'solver.abbruch.fenster_s': {
      const punkte = s.abbruch.fenster_s / Math.max(s.write_interval_series, 1e-9)
      const t = `Über dieses Fenster wird gemessen, ob sich das Restvolumen `
        + `noch bewegt — hier ${int(punkte)} Messwerte `
        + `(Zeitreihen alle ${f2(s.write_interval_series)} s).`
      // Dieselbe Bedingung wie die Backend-Prüfung (_pruefe_leerlauf):
      // beide messen die Zahl der Messpunkte im Fenster, sonst warnt eine
      // Seite und die andere nicht.
      if (s.abbruch.fenster_s < 2 * s.write_interval_series) {
        return { text: `${t} Das ist kaum mehr als ein Punkt — die `
          + 'Stagnation wäre Zufall. Fenster vergrößern oder Zeitreihen '
          + 'dichter schreiben.', level: 'warn' }
      }
      return { text: `${t} Kurze Fenster beenden den Lauf früher, sehen `
        + 'aber ein langsames Nachlaufen nicht mehr als Bewegung.',
      level: '' }
    }

    case 'solver.abbruch.schwelle': {
      const p = f2(s.abbruch.schwelle * 100)
      const t = `Bewegt sich das Restvolumen über das Fenster um weniger `
        + `als ${p} % des Startvolumens, gilt der Lauf als fertig.`
      if (s.abbruch.schwelle >= 0.05) {
        return { text: `${t} So großzügig endet der Lauf womöglich, während `
          + 'noch spürbar Wasser abläuft.', level: 'warn' }
      }
      if (s.abbruch.schwelle <= 0.001) {
        return { text: `${t} So streng läuft er bis zur Obergrenze weiter, `
          + 'sobald der Messwert auch nur leicht zappelt.', level: 'warn' }
      }
      return { text: t, level: '' }
    }

    case 'solver.abbruch.mindest_abfall': {
      const t = `Stagnation zählt erst, nachdem `
        + `${f2(s.abbruch.mindest_abfall * 100)} % des Startvolumens `
        + 'abgelaufen sind.'
      if (s.abbruch.mindest_abfall <= 0) {
        return { text: `${t} Ohne diese Anlaufsperre endet der Lauf bei `
          + 't ≈ 0: vor dem Anspringen des Auslasses steht das Wasser '
          + 'still, und Stillstand sieht aus wie Stagnation.',
        level: 'bad' }
      }
      return { text: `${t} Sie verhindert, dass der Stillstand VOR dem `
        + 'Anlaufen als „fertig" gelesen wird.', level: '' }
    }

    case 'solver.abbruch.erwartete_dauer_s': {
      if (!s.abbruch.erwartete_dauer_s) {
        return { text: 'Ohne Angabe schätzen Kosten, Datenmenge und '
          + 'Feldauflösung mit der Obergrenze — und das Ausgabegitter wird '
          + 'gröber, als der Fall es bräuchte.', level: 'warn' }
      }
      const t = `Grundlage für Kosten-, Datenmengen- und Gitterschätzung: `
        + `${dauerText(k.stunden)} Rechenzeit, ${k.ausgaben} Feldausgaben. `
        + 'Auf die Abbruchentscheidung hat der Wert keinen Einfluss.'
      if (s.abbruch.erwartete_dauer_s > s.end_time) {
        return { text: `${t} Größer als die Obergrenze — der Lauf würde `
          + 'abgeschnitten, bevor das Kriterium greifen kann.',
        level: 'warn' }
      }
      return { text: t, level: '' }
    }

    case 'solver.initial_level': {
      if (s.initial_level == null) {
        return { text: 'Leer = trockener Start; Wasser kommt nur über den '
          + 'Zufluss herein.', level: '' }
      }
      if (s.initial_level <= d.z_min || s.initial_level >= d.z_max) {
        return { text: `Muss zwischen ${f2(d.z_min)} und ${f2(d.z_max)} m `
          + 'liegen (Höhenbereich des Modellgebiets) — sonst startet der '
          + 'Lauf nicht.', level: 'bad' }
      }
      const ueber = s.initial_level - d.z_min
      return { text: `${f2(ueber)} m über der Gebietsunterkante. Alles `
        + 'darunter startet mit Wasser gefüllt — das spart die Zeit, bis '
        + 'sich das Gerinne über den Zufluss gefüllt hat.', level: '' }
    }

    case 'solver.turbulence':
      return { text: 'k-ω-SST ist der Standard im Wasserbau (gut an Wänden '
        + 'und bei Ablösungen). laminar spart etwa 15 % Rechenzeit, taugt '
        + 'aber nur für sehr langsame Strömung ohne Turbulenz.', level: '' }

    case 'solver.max_co': {
      const t = `Begrenzt den Zeitschritt im ganzen Gebiet. 0,5 ist der `
        + `übliche Wert; höher rechnet schneller, kann aber divergieren.`
      if (s.max_co > 1) {
        return { text: `${t} Über 1,0 ist für Zweiphasenströmung riskant.`,
          level: 'warn' }
      }
      return { text: t, level: '' }
    }

    case 'solver.max_alpha_co': {
      const t = 'Gilt an der Wasseroberfläche und bestimmt dort den '
        + 'Zeitschritt. 0,3 ist konservativ; bis 0,5 läuft meist stabil und '
        + 'rechnet rund 1,6× schneller.'
      if (s.max_alpha_co > 1) {
        return { text: `${t} Über 1,0 verschmiert die Oberfläche.`,
          level: 'warn' }
      }
      return { text: t, level: '' }
    }

    case 'solver.write_interval_fields': {
      // Verglichen wird mit der ERWARTETEN Dauer: beim Leerlauf endet der
      // Lauf vor der Obergrenze, ein Intervall dazwischen liefert also
      // trotz großzügiger Obergrenze keinen einzigen Zeitpunkt.
      if (s.write_interval_fields > k.dauer) {
        return { text: s.abbruch
          ? 'Größer als die erwartete Laufdauer — bis zum Leerlauf entstünde '
            + 'kein einziger Ausgabezeitpunkt.'
          : 'Größer als die Simulationsdauer — es entstünde kein '
            + 'einziger Ausgabezeitpunkt, der Lauf bräche am Ende ab.',
        level: 'bad' }
      }
      const mb = (k.zellen * 9 * 4) / 1e6
      const t = `${k.ausgaben} Ausgaben, zusammen grob `
        + `${f1((mb * k.ausgaben) / 1000)} GB. Aus diesen Zeitpunkten `
        + 'entstehen die 3D-Ansicht und der Zeitschieber.'
      if (k.ausgaben < 3) {
        return { text: `${t} Für einen Ablauf im Viewer sehr wenig.`,
          level: 'warn' }
      }
      if (k.ausgaben > 200) {
        return { text: `${t} Sehr viele — das bläht die Übertragung auf.`,
          level: 'warn' }
      }
      return { text: t, level: '' }
    }

    case 'solver.write_interval_series': {
      const n = Math.floor(k.dauer / Math.max(s.write_interval_series, 1e-9))
      const t = `${int(n)} Messwerte je Pegel und Querschnitt. `
        + 'Zeitreihen sind billig — dichter abtasten kostet kaum etwas.'
      if (s.abbruch) {
        // Beim Leerlauf hängt an dieser Zahl die Abbruchentscheidung: das
        // Beobachtungsfenster wird aus genau diesen Messwerten gebildet.
        return { text: `${t} Beim Leerlauf ist das zugleich die Auflösung, `
          + 'mit der die Stagnation erkannt wird.',
        level: n < 20 ? 'warn' : '' }
      }
      return { text: t, level: n < 20 ? 'warn' : '' }
    }

    case 'domain.z': {
      const gelaende = spec.terrain ? 'dem Gelände' : 'der Sohle'
      const t = `Gebietshöhe ${f2(k.hoehe)} m. Jede Zelle über ${gelaende} `
        + 'wird als Luft mitgerechnet.'
      if (k.wassertiefe > 0 && k.hoehe > 20 * Math.max(k.wassertiefe, 0.05)) {
        return { text: `${t} Bei erwarteten ${f2(k.wassertiefe)} m Wasser ist `
          + 'das sehr hoch — die Höhe zu kürzen ist der wirksamste Hebel '
          + 'gegen lange Rechenzeiten.', level: 'warn' }
      }
      return { text: t, level: '' }
    }

    case 'mesh.base_cell': {
      const herkunft = k.gemessen ? 'gemessen' : 'geschätzt'
      const zellenText = `${int(k.zellen)} Zellen (${herkunft}), `
        + `${dauerText(k.stunden)} auf 8 Kernen.`
      // Die feinste Zelle ist die Zahl, die wirklich zählt — sie bestimmt
      // Zeitschritt und Auflösung. Ohne diesen Satz rechnete der Fall
      // unbemerkt achtmal feiner als eingestellt.
      if (k.maxStufe > 0) {
        const wo = k.feinstesAus.slice(0, 2).join(', ')
        return { text: `${zellenText} ACHTUNG: durch Verfeinerung (Stufe `
          + `${k.maxStufe}: ${wo}) rechnet der Solver mit `
          + `${f2(k.feinsteZelle)} m — das ist die maßgebliche Zellgröße, `
          + 'nicht die eingestellte.', level: 'warn' }
      }
      if (k.wassertiefe > 0 && k.wassertiefe < 2 * spec.mesh.base_cell) {
        const noetig = k.wassertiefe / 2
        return { text: `${zellenText} Für die erwarteten `
          + `${f2(k.wassertiefe)} m Wassertiefe bräuchte es Zellen unter `
          + `${f2(noetig)} m — sonst bildet der Solver keine `
          + 'Wasseroberfläche ab.', level: 'warn' }
      }
      return { text: `${zellenText} Halbe Zellgröße = achtfache Zellzahl.`,
        level: '' }
    }

    case 'domain.extent':
      return { text: `${int(k.breite)} × ${int(k.tiefe)} m = `
        + `${int(k.flaeche)} m² Grundfläche. Kleiner ausschneiden spart `
        + 'quadratisch Rechenzeit.', level: '' }

    case 'terrain.base.resolution': {
      const r = spec.terrain?.base?.resolution ?? 0
      if (r > spec.mesh.base_cell) {
        return { text: `Gröber als die Basiszelle (${f2(spec.mesh.base_cell)} m) `
          + '— das Gelände wird dann treppig abgebildet.', level: 'warn' }
      }
      return { text: 'Auflösung des Höhenrasters. Feiner als die Basiszelle '
        + 'bringt nichts, weil das Netz es nicht mehr auflöst.', level: '' }
    }

    default:
      return null
  }
}
