// Feldkunde der casespec: welches Feld ist eine Stützpunktliste, welches
// eine Zahlenreihe, welches eine Auswahl. Steht hier und nicht im
// Eigenschaftspanel, weil dieselbe Zuordnung auch in Untergruppen gilt
// (Profil, Widerstand, Fenster, Achse) — die Regeln dürfen nicht an zwei
// Stellen auseinanderlaufen.

// Auswahlfelder für Formvarianten (Werte = casespec-Literale)
export const ENUM_OPTIONS = {
  modus: ['ziehen', 'absenken', 'anheben'],
  behalten: ['unter', 'ueber'],
  achse: ['x', 'y', 'z'],
  profile_type: ['trapez', 'breitkronig', 'scharfkantig', 'rundkronig'],
  bar_shape: ['rechteck', 'rund', 'tropfen'],
  shape: ['polygon', 'rechteck', 'rund', 'tropfen'],
  falloff: ['smooth', 'linear', 'constant'],
  face: ['x_min', 'x_max', 'y_min', 'y_max', 'z_max'],
  component: ['x', 'y', 'z', 'magnitude'],
  // nur in Untergruppen: Durchlassprofil und Widerstandsmodell
  kind: ['circular', 'rectangular', 'arch'],
  model: ['darcy_forchheimer'],
}

export const ENUM_LABELS = {
  trapez: 'Trapez (Dachwehr)', breitkronig: 'breitkronig',
  scharfkantig: 'scharfkantig (Platte)', rundkronig: 'rundkronig',
  rechteck: 'Rechteck', rund: 'rund', tropfen: 'Tropfen', polygon: 'Polygon',
  smooth: 'weich', linear: 'linear', constant: 'konstant',
  circular: 'Kreis', rectangular: 'Rechteck', arch: 'Maulprofil',
  kreis: 'Kreis (Rohrmündung)',
  darcy_forchheimer: 'Darcy-Forchheimer',
}

// Auswahlwerte, die nur INNERHALB einer Untergruppe gelten — `shape` heißt
// beim Pfeiler etwas anderes als beim Randfenster
const GRUPPEN_ENUMS = {
  window: { shape: ['rechteck', 'kreis', 'trapez', 'polygon'] },
}

export function enumFor(key, gruppe) {
  return GRUPPEN_ENUMS[gruppe]?.[key] ?? ENUM_OPTIONS[key]
}

// --- Stützpunktlisten -----------------------------------------------------
// Ob eine Liste Höhen trägt, hängt am Feld UND am Objekttyp: die Polylinie
// eines Gerinnes ist ein Grundriss, die einer Bruchkante trägt die
// Vermessungshöhe je Punkt.
export const PUNKT_FELDER = new Set(['polyline', 'polygon', 'oberkante',
  'unterkante', 'axis', 'footprint', 'crest_polyline', 'plane_polygon',
  'points'])
const IMMER_3D = new Set(['oberkante', 'unterkante', 'axis',
  'crest_polyline', 'plane_polygon', 'points'])
export const GESCHLOSSEN = new Set(['polygon', 'footprint', 'plane_polygon'])

export function punktDim(key, v, typ) {
  if (Array.isArray(v) && v.length && Array.isArray(v[0])) return v[0].length
  if (IMMER_3D.has(key)) return 3
  if (key === 'polyline') return typ === 'bruchkante' ? 3 : 2
  if (key === 'polygon') return typ === 'aussenkante' ? 3 : 2
  return 2
}

export function istPunktListe(key, v) {
  if (!Array.isArray(v)) return false
  if (!v.length) return PUNKT_FELDER.has(key)
  return v.every((p) => Array.isArray(p) && p.length >= 2
    && p.every((n) => typeof n === 'number'))
}

// --- flache Zahlenreihen (Ausdehnung, Mittelpunkt, Richtung …) ------------
const ZAHL_NAMEN = {
  extent: { 4: ['x0', 'y0', 'x1', 'y1'],
    6: ['x0', 'y0', 'z0', 'x1', 'y1', 'z1'] },
  span: { 2: ['von', 'bis'] },
  center: { 2: ['x', 'y'], 3: ['x', 'y', 'z'] },
  point: { 2: ['x', 'y'], 3: ['x', 'y', 'z'] },
  direction: { 2: ['x', 'y'], 3: ['x', 'y', 'z'] },
  verschieben: { 3: ['x', 'y', 'z'] },
  insert_point: { 3: ['x', 'y', 'z'] },
  d: { 3: ['x', 'y', 'z'] },
  f: { 3: ['x', 'y', 'z'] },
}

export function istZahlenreihe(v) {
  return Array.isArray(v) && v.length > 0 && v.length <= 6
    && v.every((n) => typeof n === 'number')
}

export function zahlenNamen(key, n) {
  return ZAHL_NAMEN[key]?.[n]
    ?? Array.from({ length: n }, (_, i) => String(i + 1))
}

// Objekte, die als Untergruppe mit eigenen Feldern dargestellt werden —
// statt als JSON-Text
export const UNTERGRUPPEN = new Set(['profile', 'resistance', 'alignment',
  'window'])

// --- Verweise auf andere Objekte des Falls --------------------------------
// Ein Nachweiskriterium zeigt auf einen Pegel, einen Querschnitt, ein
// Bauwerk oder eine Verfeinerungsbox. Als Freitext getippt blockiert eine
// falsche Kennung das Speichern — das Backend prüft hart.
export const REFERENZ_QUELLEN = {
  max_level: { at: 'gauge' },
  max_force: { at: 'patch' },
  discharge_ratio: { of: 'section', to: 'section' },
  min_bed_shear: { region: 'box' },
  max_bed_shear: { region: 'box' },
  overfall_cd: { weir: 'weir', section: 'section', gauge: 'gauge' },
  head_difference: { upstream: 'section', downstream: 'section' },
}

export const QUELL_NAMEN = {
  gauge: 'Pegelpunkt', section: 'Querschnitt', patch: 'Bauwerk',
  box: 'Verfeinerungsbox', weir: 'Wehr',
}

export function referenzListe(spec, quelle) {
  if (!spec) return []
  if (quelle === 'gauge') return (spec.evaluation?.gauges ?? []).map((g) => g.id)
  if (quelle === 'section') return (spec.evaluation?.sections ?? []).map((s) => s.id)
  if (quelle === 'patch') return (spec.structures ?? []).map((s) => s.patch)
  if (quelle === 'weir') {
    return (spec.structures ?? []).filter((s) => s.type === 'weir').map((s) => s.id)
  }
  if (quelle === 'box') {
    return (spec.mesh?.refinements ?? []).filter((r) => r.type === 'box')
      .map((r) => r.id)
  }
  return []
}

// Was fehlt, damit ein Kriterium dieser Art überhaupt gesetzt werden kann?
export function fehlendeBausteine(spec, kind) {
  const noetig = REFERENZ_QUELLEN[kind] ?? {}
  const fehlt = new Set()
  for (const quelle of Object.values(noetig)) {
    if (!referenzListe(spec, quelle).length) fehlt.add(QUELL_NAMEN[quelle])
  }
  return [...fehlt]
}

export function widgetFor(key, v, typ) {
  if (REFERENZ_QUELLEN[typ]?.[key]) return 'referenz'
  if (key === 'source' && typ === 'replace_region') return 'raster'
  if (ENUM_OPTIONS[key]) return 'enum'
  if (typeof v === 'number') return 'number'
  if (typeof v === 'boolean') return 'check'
  if (typeof v === 'string') return 'text'
  if (istPunktListe(key, v)) return 'punkte'
  if (istZahlenreihe(v)) return 'zahlen'
  if (v !== null && typeof v === 'object' && !Array.isArray(v)
      && UNTERGRUPPEN.has(key)) return 'gruppe'
  return 'json'
}
