// Feldkunde der casespec: welches Feld ist eine Stützpunktliste, welches
// eine Zahlenreihe, welches eine Auswahl. Steht hier und nicht im
// Eigenschaftspanel, weil dieselbe Zuordnung auch in Untergruppen gilt
// (Profil, Widerstand, Fenster, Achse) — die Regeln dürfen nicht an zwei
// Stellen auseinanderlaufen.

// Auswahlfelder für Formvarianten (Werte = casespec-Literale)
export const ENUM_OPTIONS = {
  // Bruchkante: die ersten drei wirken auf einen Schlauch um die LINIE,
  // die letzten beiden auf die FLÄCHE innerhalb einer geschlossenen Kante
  modus: ['ziehen', 'absenken', 'anheben', 'ebnen', 'fuellen'],
  behalten: ['unter', 'ueber'],
  achse: ['x', 'y', 'z'],
  profile_type: ['trapez', 'breitkronig', 'scharfkantig', 'rundkronig'],
  bar_shape: ['rechteck', 'rund', 'tropfen'],
  shape: ['polygon', 'rechteck', 'rund', 'tropfen'],
  falloff: ['smooth', 'linear', 'constant'],
  face: ['x_min', 'x_max', 'y_min', 'y_max', 'z_max'],
  component: ['x', 'y', 'z', 'magnitude'],
  // Aushub oder Bauteil — Beton ist, was übrig bleibt
  wirkung: ['auto', 'bauteil', 'aushub'],
  // Was eine Vermessungskante im Bauwerk IST. Daraus und aus der Lage
  // leitet der Server ab, was daraus folgt. Die letzten beiden ergeben ein
  // BAUTEIL statt einer Geländeoperation.
  rolle: ['frei', 'sohle', 'beckenrand', 'boeschung_ok', 'boeschung_uk',
    'krone', 'mauer', 'wehrkrone'],
  // nur in Untergruppen: Durchlassprofil und Widerstandsmodell
  kind: ['circular', 'rectangular', 'arch'],
  model: ['darcy_forchheimer'],
}

export const ENUM_LABELS = {
  trapez: 'Trapez (Dachwehr)', breitkronig: 'breitkronig',
  scharfkantig: 'scharfkantig (Platte)', rundkronig: 'rundkronig',
  rechteck: 'Rechteck', rund: 'rund', tropfen: 'Tropfen', polygon: 'Polygon',
  smooth: 'weich', linear: 'linear', constant: 'konstant',
  ziehen: 'Gelände auf die Kante ziehen',
  absenken: 'nur abgraben', anheben: 'nur aufschütten',
  ebnen: 'innen ebnen (Ebene durch die Kante)',
  fuellen: 'innen stufenfrei ergänzen',
  circular: 'Kreis', rectangular: 'Rechteck', arch: 'Maulprofil',
  kreis: 'Kreis (Rohrmündung)',
  darcy_forchheimer: 'Darcy-Forchheimer',
  frei: 'freie Höhenkante', sohle: 'Sohle (Ankerfläche)',
  beckenrand: 'Beckenrand', boeschung_ok: 'Böschungsoberkante',
  boeschung_uk: 'Böschungsunterkante', krone: 'Krone',
  mauer: 'Mauerkrone → Wand (Bauteil)',
  wehrkrone: 'Überfallkante → Wehr (Bauteil)',
  zulauf: 'Zulauf', ablauf: 'Ablauf',
  auto: 'automatisch (Aushub, sobald eingegraben)',
  bauteil: 'immer Bauteil (wird vernetzt)',
  aushub: 'immer Aushub (Hohlraum im Gelände)',
  maul: 'Maulprofil',
}

// Auswahlwerte, die nur INNERHALB einer Untergruppe gelten — `shape` heißt
// beim Pfeiler etwas anderes als beim Randfenster
const GRUPPEN_ENUMS = {
  window: { shape: ['rechteck', 'kreis', 'trapez', 'polygon'] },
  // Bearbeitungen: eine Aussparung ist rund oder rechteckig, nichts sonst
  aussparung: { shape: ['kreis', 'rechteck'] },
}

// Auswahlwerte, die am TYP des übergeordneten Objekts hängen. `profile`
// heißt beim Durchlass und beim Graben gleich und meint etwas anderes —
// über den Feldnamen allein sind die beiden nicht zu unterscheiden.
const TYP_ENUMS = {
  // `rolle` heißt am Stutzen etwas anderes als an der Vermessungskante:
  // dort die Bedeutung im Gelände, hier wofür der Stutzen da ist. Über den
  // Feldnamen allein sind die beiden nicht zu unterscheiden.
  culvert: { kind: ['circular', 'rectangular', 'arch'],
    rolle: ['zulauf', 'ablauf'] },
  graben: { kind: ['trapez', 'rechteck', 'kreis', 'maul'] },
  schacht: { shape: ['rund', 'rechteck'] },
}

// Typen, die sich selbst als Aushub erkennen können. Bei allen anderen wäre
// „automatisch" sinnlos bis gefährlich: eine in den Boden geschobene Wand
// soll eine eingegrabene Wand bleiben und keine Grube werden.
export const AUSHUB_TYPEN = new Set(['schacht', 'kammer', 'graben'])

// --- Schema-Anbindung -----------------------------------------------------
// Das Backend-Schema (GET /cases/{id}/schema, Pydantic) ist die WAHRHEIT
// über Auswahlwerte je Objekttyp — die Tabellen oben bleiben (a) der
// Fallback, solange kein Schema geladen ist, und (b) die einzige Quelle
// für Kontexte, die das Schema nicht kennt (Untergruppen-Umdeutungen).
let SCHEMA_ENUMS = null

function _enumAus(prop) {
  if (!prop || typeof prop !== 'object') return null
  if (Array.isArray(prop.enum)) return prop.enum.filter((w) => w !== null)
  if (prop.const !== undefined) return [prop.const]
  for (const zweig of [...(prop.anyOf ?? []), ...(prop.allOf ?? [])]) {
    const e = _enumAus(zweig)
    if (e?.length) return e
  }
  return null
}

export function setzeSchema(schema) {
  const defs = schema?.$defs ?? schema?.definitions
  if (!defs) { SCHEMA_ENUMS = null; return }
  const proTyp = {}
  for (const def of Object.values(defs)) {
    const props = def?.properties
    if (!props) continue
    // Klassen ohne type/kind-Literal (Fenster, Bearbeitungs-Untertypen)
    // bleiben außen vor — dieselbe Feldkennung bedeutet dort je Kontext
    // anderes, das regeln GRUPPEN_ENUMS
    const typLit = _enumAus(props.type)?.[0] ?? _enumAus(props.kind)?.[0]
    if (!typLit) continue
    for (const [key, prop] of Object.entries(props)) {
      if (key === 'type' || key === 'kind') continue
      const werte = _enumAus(prop)
      if (!werte || werte.length < 2) continue
      ;(proTyp[typLit] ??= {})[key] = werte
    }
  }
  SCHEMA_ENUMS = proTyp
}

export function enumFor(key, gruppe, typ) {
  // „automatisch" nur dort anbieten, wo es etwas zu entscheiden gibt
  if (key === 'wirkung' && typ && !AUSHUB_TYPEN.has(typ)) {
    return ['bauteil', 'aushub']
  }
  // Untergruppen-Umdeutungen zuerst (kennt das Schema nicht), dann das
  // Schema je Objekttyp, dann die Tabellen
  return GRUPPEN_ENUMS[gruppe]?.[key]
    ?? SCHEMA_ENUMS?.[typ]?.[key]
    ?? TYP_ENUMS[typ]?.[key]
    ?? ENUM_OPTIONS[key]
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
// Bauwerk oder eine Verfeinerungsbox. Eine falsche Kennung ist ein BEFUND
// mit Kur — das Schema nimmt sie an, damit ein unfertiger Zwischenstand
// darstellbar und speicherbar bleibt.
export const REFERENZ_QUELLEN = {
  // Flächenverfeinerung: seit die Sohle verfeinerbar ist, gehört „terrain"
  // in dieselbe Auswahl wie die Bauwerke — als Freitext getippt war es
  // vorher ein Fehler
  surface: { target: 'flaeche' },
  // Die Außenkante braucht ihre innere Bezugslinie
  aussenkante: { innen: 'kante' },
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
  box: 'Verfeinerungsbox', weir: 'Wehr', flaeche: 'Fläche',
  kante: 'Bezugskante',
}

export function referenzListe(spec, quelle) {
  if (!spec) return []
  if (quelle === 'gauge') return (spec.evaluation?.gauges ?? []).map((g) => g.id)
  if (quelle === 'section') return (spec.evaluation?.sections ?? []).map((s) => s.id)
  if (quelle === 'patch') return (spec.structures ?? []).map((s) => s.patch)
  if (quelle === 'flaeche') {
    const patches = (spec.structures ?? []).map((s) => s.patch)
    return spec.terrain ? ['terrain', ...patches] : patches
  }
  if (quelle === 'kante') {
    return (spec.terrain?.operations ?? [])
      .filter((o) => ['boeschung', 'bruchkante'].includes(o.type))
      .map((o) => o.id)
  }
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

// Felder, die leer bleiben dürfen und dann eine Vorbelegung bedeuten. Sie
// fallen als `null` aus dem JSON heraus und wären im Panel gar nicht
// sichtbar — man könnte sie also nie setzen.
export const OPTIONAL_ZAHLEN = {
  berechnungskoerper: ['unterkante', 'ueberstand'],
}

export function widgetFor(key, v, typ) {
  if (REFERENZ_QUELLEN[typ]?.[key]) return 'referenz'
  if (key === 'source' && typ === 'replace_region') return 'raster'
  if (key === 'edits') return 'edits'
  if (enumFor(key, '', typ)) return 'enum'
  if (typeof v === 'number') return 'number'
  if (typeof v === 'boolean') return 'check'
  if (typeof v === 'string') return 'text'
  if (istPunktListe(key, v)) return 'punkte'
  if (istZahlenreihe(v)) return 'zahlen'
  if (v !== null && typeof v === 'object' && !Array.isArray(v)
      && UNTERGRUPPEN.has(key)) return 'gruppe'
  // Ein Feld, das auf null steht, ist NICHT GESETZT. Als JSON-Textarea
  // gerendert stünde daneben ein leeres Kästchen ohne Inhalt und ohne
  // Wirkung — etwa `window` (hat einen eigenen Auswahlkasten) oder `innen`.
  if (v === null || v === undefined) return 'leer'
  return 'json'
}


// --- Beschriftungen (aus PropertyPanel hierher gezogen: die Feldkunde
// steht an EINER Stelle, Untergruppen und Panel lesen dieselben Tabellen) --

// In der Untergruppe ausgeblendet, weil woanders bedient (Fensterform über
// den Select darüber) oder ohne Wirkung (Spline ist in der casespec
// vorgesehen, wird aber nirgends ausgewertet)
export const VERBERGEN = { window: ['shape', 'follow'], alignment: ['kind'] }

// Beschriftungen, die nur für einen Objekttyp gelten — `level` ist bei der
// Verfeinerungsbox eine Stufe, bei einer Geländeoperation eine Höhe
// Beschriftungen, die nur für EINEN Objekttyp gelten. Sie stehen hier und
// nicht in FIELD_LABELS, weil dort der zweite Eintrag den ersten still
// überschreibt: `unterkante` hieß am Ende „Sohle des Erdkörpers", auch an
// einer Böschung — dort ist es die untere Vermessungskante.
export const TYP_LABELS = {
  box: { level: 'Verfeinerungsstufe (1 = halbe Zelle)' },
  surface: { level: 'Verfeinerungsstufe (1 = halbe Zelle)' },
  berechnungskoerper: {
    unterkante: 'Sohle des Erdkörpers (m NHN, leer = automatisch)',
    ueberstand: 'Überstand über den Gebietsrand (m, leer = 2 Zellen)',
  },
  // `radius` heißt bei der Aussparung etwas anderes als bei „Anheben/
  // Absenken" — dort ist es die Ausdehnung im Grundriss, hier die
  // Ausrundung der Innenecken
  aussparung: { radius: 'Eckenausrundung (m)' },
  terrain: {
    source: 'Quelle (Raster oder flat:<Höhe>)',
    resolution: 'Rasterweite (m)',
    koerper: 'Volumenkörper (STL, leer = aus dem Raster aufgezogen)',
  },
  // Aushub-Grundtypen: die Maße sind LICHT, die Wandstärke kommt außen
  // herum dazu (beim Aushub gräbt der Bagger sie mit aus)
  schacht: { width: 'Lichte Weite / Durchmesser (m)',
    length: 'Lichte Länge (m, nur Rechteck)',
    invert_level: 'Sohle (m NHN)', shape: 'Grundrissform',
    wall_thickness: 'Wandstärke (m)' },
  kammer: { footprint: 'Lichter Grundriss',
    invert_level: 'Sohle (m NHN)', wall_thickness: 'Wandstärke (m)' },
  graben: { axis: 'Achse (z = Sohlhöhe je Punkt)',
    profile: 'Querschnitt', wall_thickness: 'Wandstärke (m)' },
}

export const FIELD_LABELS = {
  polyline: 'Polylinie', polygon: 'Polygon',
  oberkante: 'Oberkante (Höhe je Stützpunkt)',
  unterkante: 'Unterkante (Höhe je Stützpunkt)',
  kanten_breite: 'Kantenwirkung nach außen (m)',
  breite: 'Wirkungsbreite (m)', modus: 'Wirkung',
  einbindetiefe: 'Einbindetiefe unter Gelände (m)',
  innen: 'Innere Bezugskante (id einer Böschung/Bruchkante)',
  gefaelle: 'Gefälle nach außen (m je m; 0 = Plateau)',
  invert_start: 'Sohlhöhe Anfang (m)', invert_end: 'Sohlhöhe Ende (m)',
  bottom_width: 'Sohlbreite (m)', depth: 'Tiefe (m)',
  side_slope: 'Böschungsneigung 1:n', level: 'Höhe (m NHN)',
  crest_level: 'Kronenhöhe (m)', crest_width: 'Kronenbreite (m)',
  center: 'Mittelpunkt', radius: 'Radius (m)', strength: 'Stärke',
  falloff: 'Abklingfunktion', direction: 'Richtung',
  level_start: 'Höhe Anfang (m)', level_end: 'Höhe Ende (m)',
  blend_width: 'Übergangsbreite (m)', source: 'Quelldatei',
  height: 'Höhe (m)', thickness: 'Dicke (m)', alignment: 'Achse',
  edits: 'Bearbeitungen [{id, type, …}] — Reihenfolge zählt',
  window: 'Fenster (Öffnung auf der Randfläche)',
  footprint: 'Grundriss', invert_level: 'Sohlhöhe (m)',
  invert_slope: 'Sohlgefälle', wall_height: 'Wandhöhe (m)',
  wall_thickness: 'Wanddicke (m)',
  axis: 'Achse (z = Sohlhöhe je Punkt)', profile: 'Profil',
  durchstoesst_gelaende: 'Durch das Gelände bohren (Rohr steckt im Damm)',
  plane_polygon: 'Rechenebene', bar_spacing: 'Stabteilung (m)',
  bar_thickness: 'Stabdicke (m)',
  resistance: 'Widerstand',
  base_level: 'Fußhöhe (m)', top_level: 'Oberkante (m NHN)',
  wirkung: 'Wirkung im Modell',
  extent: 'Ausdehnung', target: 'Ziel-Bauwerk (patch)',
  q: 'Zufluss (m³/s)', face: 'Gebietsrand', patch: 'Patchname',
  column_time: 'Zeitspalte', column_q: 'Durchflussspalte',
  point: 'Punkt', at: 'Pegel/Bauwerk', of: 'Zähler-Querschnitt',
  to: 'Nenner-Querschnitt', limit_max: 'Grenzwert max.',
  limit_min: 'Grenzwert min.', component: 'Komponente', region: 'Region',
  batter_deg: 'Neigung (°)', cutwater: 'Anlauf (veraltet)',
  rotation_deg: 'Drehung (°)', insert_point: 'Einfügepunkt',
  crest_polyline: 'Kronenachse (z = Kronenhöhe)',
  slope_upstream: 'Neigung Oberwasser 1:n', slope_downstream: 'Neigung Unterwasser 1:n',
  profile_type: 'Wehrprofil', bar_shape: 'Stabform', bar_depth: 'Stabtiefe (m)',
  approach_angle_deg: 'Anströmwinkel (°, 90 = frontal)',
  shape: 'Grundrissform', length: 'Länge (m)', width: 'Breite/Ø (m)',
  // Felder in Untergruppen (Profil, Widerstand, Achse, Fenster)
  kind: 'Profilart', diameter: 'Durchmesser (m)', points: 'Stützpunkte',
  model: 'Widerstandsmodell', blockage_ratio: 'Verlegungsgrad (0…1)',
  z_min: 'Unterkante (m NHN)', z_max: 'Oberkante (m NHN)',
  z_center: 'Achshöhe (m NHN)', span: 'Lage entlang der Kante (von/bis)',
  follow: 'gekoppelt an', top_width: 'Breite Oberkante (m)',
  rolle: 'Rolle im Bauwerk', quelle: 'aus Layer',
  // Leeren löst das Objekt von seinen Kanten ab: es gilt dann als von Hand
  // angelegt und wird beim nächsten Verknüpfen nicht mehr überschrieben.
  aus_kanten: 'abgeleitet aus (leeren = von Hand übernehmen)',
  // Felder der Bearbeitungen (EditListe → UnterGruppe). Ohne sie kam der
  // rohe Feldname in der Oberfläche an — „behalten", „rand", „skalieren"
  // stehen dort ohne Einheit und ohne Erklärung.
  achse: 'Schnittachse', position: 'Schnitthöhe bzw. -lage (m)',
  behalten: 'Welche Seite bleibt stehen',
  rand: 'Abstand zum Gebietsrand (m)',
  verschieben: 'Verschieben (dx, dy, dz in m)',
  drehen_deg: 'Drehen um z (°)', skalieren: 'Maßstab (1 = unverändert)',
  station: 'Lage auf der Achse (m ab Anfang)',
  vertikal: 'Senkrecht durch Sohle/Decke statt durch die Wand',
}

// In der Untergruppe heißen Felder teils anders als oben: `center` ist im
// Randfenster die Lage ENTLANG der Kante, kein Mittelpunkt in x/y
export const GRUPPEN_LABELS = {
  window: { center: 'Lage entlang der Kante (m)',
    bottom_width: 'Breite unten (m)', top_width: 'Breite oben (m)' },
}
