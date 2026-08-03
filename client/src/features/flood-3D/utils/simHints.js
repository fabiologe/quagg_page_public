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

export function kennwerte(spec, meshPreview = null) {
  const d = spec?.domain
  const m = spec?.mesh
  const s = spec?.solver
  if (!d || !m || !s) return null
  const [x0, y0, x1, y1] = d.extent
  const breite = x1 - x0
  const tiefe = y1 - y0
  const hoehe = d.z_max - d.z_min
  const flaeche = breite * tiefe
  const zellen = meshPreview?.cells
    ?? Math.round((breite / m.base_cell) * (tiefe / m.base_cell)
                  * (hoehe / m.base_cell) * 0.8)
  // Zulauf und daraus die erwartete Wassertiefe (wie die Backend-Regel)
  const q = (spec.boundaries ?? [])
    .filter((b) => b.type === 'inflow_constant')
    .reduce((a, b) => a + (b.q ?? 0), 0)
  const wassertiefe = flaeche > 0 ? (q * s.end_time) / flaeche : 0
  // grobe Laufzeit: kalibriert am Referenzlauf (117.596 Zellen, 6 s -> 40 min
  // auf 1 Kern), skaliert mit Zellen und Zeitschritten
  const kerne = 8
  const dt = 0.3 * m.base_cell / 6.0
  const schritte = s.end_time / Math.max(dt, 1e-6)
  const stunden = (zellen * schritte * 1.1e-7) / kerne
  const ausgaben = s.write_interval_fields > 0
    ? Math.floor(s.end_time / s.write_interval_fields) + 1 : 0
  return { breite, tiefe, hoehe, flaeche, zellen, q, wassertiefe,
    stunden, ausgaben, dt }
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
}

export function begrenzen(pfad, wert) {
  const g = GRENZEN[pfad]
  if (!g || !isFinite(wert)) return wert
  return Math.min(Math.max(wert, g[0]), g[1])
}

// --- Einordnung je Feld ---------------------------------------------------
// { text, level } — level: '' | 'warn' | 'bad'

export function hinweis(pfad, spec, meshPreview = null) {
  const k = kennwerte(spec, meshPreview)
  if (!k) return null
  const s = spec.solver
  const d = spec.domain

  switch (pfad) {
    case 'solver.end_time': {
      const t = `Geschätzt ${dauerText(k.stunden)} Rechenzeit auf 8 Kernen `
        + `(${int(k.zellen)} Zellen).`
      if (k.stunden > 12) {
        return { text: `${t} Das ist viel — Gebietshöhe und Basiszelle prüfen.`,
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
      if (s.write_interval_fields > s.end_time) {
        return { text: 'Größer als die Simulationsdauer — es entstünde kein '
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
      const n = Math.floor(s.end_time / Math.max(s.write_interval_series, 1e-9))
      return { text: `${int(n)} Messwerte je Pegel und Querschnitt. `
        + 'Zeitreihen sind billig — dichter abtasten kostet kaum etwas.',
      level: n < 20 ? 'warn' : '' }
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
      const zellenText = `${int(k.zellen)} Zellen, geschätzt `
        + `${dauerText(k.stunden)} auf 8 Kernen.`
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
