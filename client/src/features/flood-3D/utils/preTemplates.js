// Vorlagen für "Neu anlegen" im Objektbaum (Katalog Spez. 6.2/6.3) und
// deutsche Typbezeichner. Die IDs werden beim Einfügen durchnummeriert.

export const TYPE_LABELS = {
  massenbilanz: 'Massenbilanz', kurzschluss: 'Kurzschlusskennzahl',
  verweilzeit_min: 'Mindest-Verweilzeit',
  channel_carve: 'Gerinne einschneiden', pad: 'Planum', raise_lower: 'Anheben/Absenken',
  smooth: 'Glätten', ramp: 'Rampe', embankment: 'Dammschüttung',
  replace_region: 'Bereich ersetzen', set_level: 'Absoluthöhe',
  bruchkante: 'Bruchkante', boeschung: 'Böschung (OK/UK)',
  aussenkante: 'Außenkante (Gebietsrand)',
  wall: 'Wand', screen: 'Rechen', culvert: 'Durchlass', weir: 'Wehr',
  pier: 'Pfeiler', basin: 'Becken', imported: 'Importkörper',
  schacht: 'Schacht', kammer: 'Kammer', graben: 'Graben/Stauraumkanal',
  box: 'Box', surface: 'Fläche',
  domain: 'Rechengebiet', terrain: 'Geländebasis',
  inflow_hydrograph: 'Zufluss (Ganglinie)', inflow_constant: 'Zufluss (konstant)',
  outflow_fixed_level: 'Ablauf (fester Pegel)', outflow_free: 'Ablauf (frei)',
  outflow_constant: 'Ablauf (Drossel, fester Q)',
  atmosphere: 'Atmosphäre',
  discharge_ratio: 'Abflussaufteilung', max_level: 'Max. Einstau',
  max_bed_shear: 'Max. Sohlschubspannung', overfall_cd: 'Überfallbeiwert',
  max_force: 'Max. Bauteillast', min_bed_shear: 'Min. Sohlschubspannung',
  head_difference: 'Verlusthöhe',
}

export const TEMPLATES = {
  terrain_op: {
    'Gerinne einschneiden': {
      id: 'gerinne', type: 'channel_carve', polyline: [[10, 10], [30, 10]],
      invert_start: 94.5, invert_end: 94.3, bottom_width: 2.0, depth: 1.5,
      side_slope: 1.5,
    },
    Planum: { id: 'planum', type: 'pad',
      polygon: [[10, 10], [20, 10], [20, 20], [10, 20]], level: 95.0 },
    'Anheben/Absenken': { id: 'huegel', type: 'raise_lower',
      center: [15, 15], radius: 5, strength: 1.0, falloff: 'smooth' },
    Glätten: { id: 'glatt', type: 'smooth', center: [15, 15], radius: 5,
      strength: 0.8 },
    Rampe: { id: 'rampe', type: 'ramp',
      polygon: [[10, 10], [20, 10], [20, 14], [10, 14]],
      level_start: 94.5, level_end: 95.5, direction: [1, 0] },
    Dammschüttung: { id: 'damm', type: 'embankment',
      polyline: [[10, 10], [30, 10]], crest_level: 97.0, crest_width: 2.0,
      side_slope: 2.0 },
    Bruchkante: { id: 'kante', type: 'bruchkante',
      polyline: [[10, 10, 96.0], [30, 10, 95.6]], breite: 1.0,
      modus: 'ziehen' },
    'Böschung (OK/UK)': { id: 'boeschung', type: 'boeschung',
      oberkante: [[10, 14, 97.0], [30, 14, 96.6]],
      unterkante: [[10, 10, 94.5], [30, 10, 94.2]], kanten_breite: 0 },
    // Regelfall ohne Rahmen: das Gelände läuft von der Bezugskante mit
    // `gefaelle` bis an den Gebietsrand weiter. Die Bezugskante wird beim
    // Einfügen aus dem Fall gesetzt (siehe randRahmen im Objektbaum).
    'Außenkante (Gebietsrand)': { id: 'aussenkante', type: 'aussenkante',
      gefaelle: 0.0, innen: null },
    'Bereich ersetzen': { id: 'ersatz', type: 'replace_region',
      polygon: [[10, 10], [20, 10], [20, 20], [10, 20]], source: '' },
    Absoluthöhe: { id: 'hoehe', type: 'set_level',
      polygon: [[10, 10], [20, 10], [20, 20], [10, 20]], level: 95.0,
      blend_width: 2.0 },
  },
  structure: {
    Wand: { id: 'wand', type: 'wall', patch: 'wand',
      alignment: { kind: 'polyline', points: [[10, 10, 97.0], [16, 10, 97.0]] },
      height: 2.0, thickness: 0.4 },
    Becken: { id: 'becken', type: 'basin', patch: 'becken',
      footprint: [[10, 10], [16, 10], [16, 16], [10, 16]],
      invert_level: 94.5, wall_height: 2.0, wall_thickness: 0.3 },
    Durchlass: { id: 'durchlass', type: 'culvert', patch: 'durchlass',
      axis: [[8, 12, 94.2], [16, 12, 94.0]],
      profile: { kind: 'circular', diameter: 1.0 } },
    Rechen: { id: 'rechen', type: 'screen', patch: 'rechen',
      plane_polygon: [[10, 10, 94.0], [10, 13, 94.0], [10, 13, 96.5], [10, 10, 96.5]],
      bar_spacing: 0.02, bar_thickness: 0.008, bar_depth: 0.06,
      bar_shape: 'rechteck', approach_angle_deg: 75,
      // d/f leer lassen -> Widerstand wird aus Stabform nach Kirschmer abgeleitet
      resistance: { model: 'darcy_forchheimer', d: [0, 0, 0], f: [0, 0, 0],
        blockage_ratio: 0.3 } },
    'Wehr (Trapez)': { id: 'wehr', type: 'weir', patch: 'wehr',
      crest_polyline: [[10, 10, 96.0], [16, 10, 96.0]],
      crest_width: 0.6, slope_upstream: 2.0, slope_downstream: 2.0,
      profile_type: 'trapez', base_level: 94.0 },
    'Wehr (rundkronig)': { id: 'wehr', type: 'weir', patch: 'wehr',
      crest_polyline: [[10, 10, 96.0], [16, 10, 96.0]],
      crest_width: 0.8, slope_upstream: 1.0, slope_downstream: 2.0,
      profile_type: 'rundkronig', base_level: 94.0 },
    'Pfeiler (Polygon)': { id: 'pfeiler', type: 'pier', patch: 'pfeiler',
      shape: 'polygon',
      footprint: [[12, 12], [13, 12], [13, 14], [12, 14]],
      base_level: 93.0, top_level: 97.0 },
    'Pfeiler (rund)': { id: 'pfeiler', type: 'pier', patch: 'pfeiler',
      shape: 'rund', center: [12, 12], width: 1.2,
      rotation_deg: 0, base_level: 93.0, top_level: 97.0 },
    'Pfeiler (Tropfen)': { id: 'pfeiler', type: 'pier', patch: 'pfeiler',
      shape: 'tropfen', center: [12, 12], width: 1.0, length: 3.0,
      rotation_deg: 0, base_level: 93.0, top_level: 97.0 },
    // Aushub-Grundtypen. Sie werden AUF dem Gelände abgesetzt (Sohle auf
    // Geländehöhe) und sind damit zunächst Bauteile. Erst wenn man sie in
    // den Boden schiebt, sodass die Oberkante bündig oder darunter liegt,
    // werden sie zum Aushub — das entscheidet `wirkung: auto` aus der Lage.
    // Wer beides zugleich braucht (Grube plus Betonring), nimmt ein Rezept.
    'Schacht (rund)': { id: 'schacht', type: 'schacht', patch: 'schacht',
      shape: 'rund', center: [12, 12], width: 1.0,
      invert_level: 95.0, top_level: 97.0, wall_thickness: 0.12,
      wirkung: 'auto' },
    Kammer: { id: 'kammer', type: 'kammer', patch: 'kammer',
      footprint: [[10, 10], [14, 10], [14, 13], [10, 13]],
      invert_level: 95.0, top_level: 97.5, wall_thickness: 0.3,
      wirkung: 'auto' },
    'Graben/Stauraumkanal': { id: 'graben', type: 'graben', patch: 'graben',
      axis: [[8, 12, 95.0], [20, 12, 94.9]],
      profile: { kind: 'trapez', width: 1.5, height: 1.2, side_slope: 1.5 },
      wall_thickness: 0.0, wirkung: 'auto' },
  },
  refinement: {
    Verfeinerungsbox: { id: 'box', type: 'box',
      extent: [10, 10, 93.0, 20, 20, 97.0], level: 2 },
    Flächenverfeinerung: { id: 'flaeche', type: 'surface', target: '', level: 2 },
  },
  boundary: {
    'Zufluss (konstant)': { id: 'zufluss', type: 'inflow_constant',
      patch: 'inlet2', q: 1.0 },
    'Zufluss (Ganglinie)': { id: 'zugang', type: 'inflow_hydrograph',
      patch: 'inlet2', source: 'zufluss.csv', column_time: 't', column_q: 'Q' },
    'Ablauf (fester Pegel)': { id: 'ablauf', type: 'outflow_fixed_level',
      patch: 'outlet2', level: 94.5 },
    'Ablauf (frei)': { id: 'frei', type: 'outflow_free', patch: 'outlet2' },
    'Ablauf (Drossel, fester Q)': { id: 'drossel', type: 'outflow_constant',
      patch: 'drossel', q: 0.03 },
  },
  section: {
    Querschnitt: { id: 'qs', polyline: [[10, 5], [10, 15]] },
  },
  gauge: {
    Pegelpunkt: { id: 'pegel', point: [12, 12] },
  },
  target: {
    'Massenbilanz (eingeschwungen)': { id: 'nw_bilanz',
      kind: 'massenbilanz', limit_max: 0.02 },
    'Kurzschluss (t10/τ)': { id: 'nw_kurzschluss',
      kind: 'kurzschluss', limit_min: 0.3 },
    'Verweilzeit (t50 mind.)': { id: 'nw_verweilzeit',
      kind: 'verweilzeit_min', limit_min: 1800.0 },
    'Max. Einstau': { id: 'einstau', kind: 'max_level', at: '', limit_max: 96.0 },
    Abflussaufteilung: { id: 'aufteilung', kind: 'discharge_ratio',
      of: '', to: '', limit_max: 0.35 },
    'Max. Bauteillast': { id: 'last', kind: 'max_force', at: '',
      component: 'magnitude' },
    'Min. Sohlschubspannung': { id: 'sohlschub_min', kind: 'min_bed_shear',
      region: '', limit_min: 0.5 },
    'Max. Sohlschubspannung': { id: 'sohlschub_max', kind: 'max_bed_shear',
      region: '', limit_max: 25.0 },
    'Überfallbeiwert': { id: 'cd_wehr', kind: 'overfall_cd', weir: '',
      section: '', gauge: '' },
    Verlusthöhe: { id: 'verlust', kind: 'head_difference', upstream: '',
      downstream: '', limit_max: 0.15 },
  },
}


// --- Vorlagen an den vorliegenden Fall anpassen ---------------------------
// Die Vorlagen sind in einem Bezugsraum notiert: Gelände auf 95,0 m,
// Grundrisse zwischen 8 und 30 m. Das passt zum leeren Standardfall und zu
// keinem einzigen importierten. Deshalb wird beim Einfügen umgerechnet:
// Grundriss in die Mitte des Modellgebiets, Höhen RELATIV zum Gelände
// übernommen — eine Wandkrone 2,0 m über dem Bezugsgelände bleibt 2,0 m
// über dem echten Gelände.

const REF_GELAENDE = 95.0

// Skalare, die eine absolute Höhe bezeichnen. Achtung bei `level`: bei
// einer Verfeinerung ist das die STUFE und keine Höhe — aus 2 würde sonst
// die Geländehöhe minus 93.
const HOEHEN_FELDER = new Set(['level', 'invert_level', 'invert_start',
  'invert_end', 'base_level', 'top_level', 'crest_level', 'level_start',
  'level_end', 'z_min', 'z_max', 'z_center'])
const KEINE_HOEHE = { box: ['level'], surface: ['level'] }
// Grenzwerte sind nur beim Einstau eine Höhe — bei Abflussaufteilung ein
// Verhältnis, bei der Sohlschubspannung N/m²
const HOEHEN_GRENZWERT = new Set(['max_level'])

// Felder, die einen Grundriss aufspannen
const ORT_FELDER = new Set(['polyline', 'polygon', 'oberkante', 'unterkante',
  'axis', 'footprint', 'crest_polyline', 'plane_polygon', 'center', 'point',
  'extent'])

// Skalare LÄNGENMASSE in der Ebene. Sie müssen denselben Faktor mitgehen wie
// der Grundriss — sonst behält ein auf ein Drittel geschrumpftes Becken
// seinen Radius von 5 m und quillt wieder über. Senkrechte Maße (Höhe,
// Tiefe, Wandhöhe) bleiben unangetastet: eine 2 m hohe Wand ist in einem
// kleinen Gebiet immer noch 2 m hoch.
const MASS_FELDER = new Set(['radius', 'bottom_width', 'crest_width',
  'thickness', 'wall_thickness', 'diameter', 'width', 'length', 'breite',
  'kanten_breite', 'blend_width'])

// Maße, an denen die Vernetzbarkeit hängt — die kleinste Abmessung eines
// Bauteils. Vier Zellen darüber sind die Faustregel, mit der auch die
// Backend-Prüfung und die Kur „Verfeinerung erhöhen" arbeiten.
const DUENNSTES = {
  wall: 'thickness', basin: 'wall_thickness', culvert: 'diameter',
  // Beim Aushub ist die lichte Weite maßgeblich (das Wasser muss hindurch),
  // beim Bauteil die Wandstärke — `noetigeVerfeinerung` entscheidet danach
  schacht: 'width', kammer: 'wall_thickness', graben: 'width',
}

function punktlisten(obj) {
  const raus = []
  for (const [k, v] of Object.entries(obj)) {
    if (!ORT_FELDER.has(k) || !Array.isArray(v)) continue
    if (Array.isArray(v[0])) raus.push([k, v])
    else if (typeof v[0] === 'number') raus.push([k, [v]])
  }
  if (obj.alignment?.points) raus.push(['alignment.points', obj.alignment.points])
  return raus
}

export function vorlageAnpassen(obj, spec, gelaendeZ) {
  const dom = spec?.domain
  if (!dom) return obj
  const [x0, y0, x1, y1] = dom.extent
  const listen = punktlisten(obj)
  const xs = []
  const ys = []
  for (const [k, liste] of listen) {
    for (const p of liste) {
      if (k === 'extent') { xs.push(p[0], p[3]); ys.push(p[1], p[4]) }
      else { xs.push(p[0]); ys.push(p[1]) }
    }
  }
  // ohne Grundriss (z. B. eine Randbedingung) bleibt nur die Höhenumrechnung
  const bx = xs.length ? [Math.min(...xs), Math.max(...xs)] : [0, 0]
  const by = ys.length ? [Math.min(...ys), Math.max(...ys)] : [0, 0]
  const mx = (bx[0] + bx[1]) / 2
  const my = (by[0] + by[1]) / 2
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  // nur verkleinern, nie vergrößern: eine 20-m-Wand passt nicht in ein
  // 9-m-Becken, umgekehrt soll die Vorlage ihre Maße behalten
  let spanne = Math.max(bx[1] - bx[0], by[1] - by[0])
  // Bei runden Operationen spannt nicht die Punktliste den Grundriss auf,
  // sondern der Radius: „Anheben/Absenken" hat nur einen Mittelpunkt und
  // wäre sonst in jedem Gebiet gleich groß.
  for (const k of Object.keys(obj)) {
    if (typeof obj[k] !== 'number') continue
    if (k === 'radius') spanne = Math.max(spanne, 2 * obj[k])
    else if (k === 'width' || k === 'length') spanne = Math.max(spanne, obj[k])
  }
  const platz = 0.5 * Math.min(x1 - x0, y1 - y0)
  const s = spanne > platz && spanne > 0 ? platz / spanne : 1
  const r2 = (v) => Number(v.toFixed(2))
  const ort = (px, py) => [r2(cx + (px - mx) * s), r2(cy + (py - my) * s)]

  for (const [k, liste] of listen) {
    for (const p of liste) {
      if (k === 'extent') {
        const [ax, ay] = ort(p[0], p[1])
        const [bxx, byy] = ort(p[3], p[4])
        const boden = gelaendeZ((ax + bxx) / 2, (ay + byy) / 2)
        p[0] = ax; p[1] = ay; p[3] = bxx; p[4] = byy
        // Verfeinerungsquader ins Modellgebiet klemmen — außerhalb wäre er
        // wirkungslos und die Prüfung meldete ihn sofort
        const klemm = (v) => r2(Math.min(Math.max(boden + (v - REF_GELAENDE),
          dom.z_min), dom.z_max))
        p[2] = klemm(p[2])
        p[5] = klemm(p[5])
        continue
      }
      const [nx, ny] = ort(p[0], p[1])
      const zAlt = p.length > 2 ? p[2] : null
      p[0] = nx; p[1] = ny
      if (zAlt !== null) p[2] = r2(gelaendeZ(nx, ny) + (zAlt - REF_GELAENDE))
    }
  }

  // Skalare Längenmaße gehen denselben Weg wie der Grundriss
  if (s !== 1) {
    for (const k of Object.keys(obj)) {
      if (MASS_FELDER.has(k) && typeof obj[k] === 'number') {
        obj[k] = r2(obj[k] * s)
      }
    }
    if (obj.profile?.diameter) obj.profile.diameter = r2(obj.profile.diameter * s)
    if (obj.profile?.width) obj.profile.width = r2(obj.profile.width * s)
    if (obj.profile?.height) obj.profile.height = r2(obj.profile.height * s)
  }

  // Skalare Höhen an das Gelände in der Mitte hängen
  const boden = gelaendeZ(cx, cy)
  const ausnahme = KEINE_HOEHE[obj.type] ?? []
  const grenzwerte = HOEHEN_GRENZWERT.has(obj.kind)
    ? ['limit_max', 'limit_min'] : []
  for (const k of Object.keys(obj)) {
    if ((HOEHEN_FELDER.has(k) || grenzwerte.includes(k))
        && !ausnahme.includes(k) && typeof obj[k] === 'number') {
      obj[k] = r2(boden + (obj[k] - REF_GELAENDE))
    }
  }
  return obj
}


// --- Verfeinerung, die ein neues Bauteil braucht --------------------------
// Die Standard-Basiszelle ist 1,0 m, eine Wand 0,40 m dick: der Neufall löst
// damit sofort genau die Prüfung aus, die die Spezifikation als wichtigste
// bezeichnet („Mindestabmessung gegen die lokale Zellgröße"). Die Abmessung
// ist dabei richtig — zu grob ist das Netz. Also kommt die Flächen-
// verfeinerung gleich mit, statt den Nutzer erst warnen und dann per Kur
// nachbessern zu lassen. Rückgabe: die anzulegende Verfeinerung oder null.

export function noetigeVerfeinerung(obj, spec) {
  const zelle = spec?.mesh?.base_cell
  const feld = DUENNSTES[obj?.type]
  if (!zelle || !feld) return null
  const mass = obj[feld] ?? obj.profile?.width ?? obj.profile?.diameter
  if (!(mass > 0)) return null
  // Ein Aushub hat keine eigene Fläche — seine Wandungen gehören nach dem
  // Ausschneiden zur Geländefläche, dort greift auch die Verfeinerung.
  // Beim Einfügen steht ein neues Bauwerk immer AUF dem Gelände, `auto`
  // heißt hier also Bauteil; wird es später eingegraben, meldet die Prüfung
  // die dann fällige Verfeinerung am Gelände.
  const ziel = obj.wirkung === 'aushub' ? 'terrain' : obj.patch

  // vorhandene Stufe an dieser Fläche zählt mit
  const vorhanden = (spec.mesh.refinements ?? [])
    .filter((r) => r.type === 'surface' && r.target === ziel)
    .reduce((a, r) => Math.max(a, r.level), 0)
  let stufe = vorhanden
  while (mass < (4 * zelle) / 2 ** stufe && stufe < 5) stufe += 1
  if (stufe <= vorhanden) return null

  const ids = new Set((spec.mesh.refinements ?? []).map((r) => r.id))
  let id = `fein_${ziel}`
  let n = 2
  while (ids.has(id)) { id = `fein_${ziel}_${n}`; n += 1 }
  return {
    refinement: { id, type: 'surface', target: ziel, level: stufe },
    text: `${mass.toFixed(2).replace('.', ',')} m gegen `
      + `${zelle.toString().replace('.', ',')} m Basiszelle — `
      + `Flächenverfeinerung Stufe ${stufe} an „${ziel}“ ergänzt, sonst löst `
      + 'das Netz das Bauwerk nicht auf',
  }
}
