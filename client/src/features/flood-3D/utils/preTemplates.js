// Vorlagen für "Neu anlegen" im Objektbaum (Katalog Spez. 6.2/6.3) und
// deutsche Typbezeichner. Die IDs werden beim Einfügen durchnummeriert.

export const TYPE_LABELS = {
  channel_carve: 'Gerinne einschneiden', pad: 'Planum', raise_lower: 'Anheben/Absenken',
  smooth: 'Glätten', ramp: 'Rampe', embankment: 'Dammschüttung',
  replace_region: 'Bereich ersetzen', set_level: 'Absoluthöhe',
  bruchkante: 'Bruchkante', boeschung: 'Böschung (OK/UK)',
  aussenkante: 'Außenkante (Gebietsrand)',
  wall: 'Wand', screen: 'Rechen', culvert: 'Durchlass', weir: 'Wehr',
  pier: 'Pfeiler', basin: 'Becken', imported: 'Importkörper',
  box: 'Box', surface: 'Fläche',
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
    // Der Rahmen wird beim Einfügen auf das Modellgebiet gesetzt und die
    // Höhen aus dem Gelände abgegriffen (siehe randVorlage im Objektbaum) —
    // ohne das stünde eine Außenkante irgendwo im Nichts.
    'Außenkante (Gebietsrand)': { id: 'aussenkante', type: 'aussenkante',
      polygon: [[0, 0, 100], [20, 0, 100], [20, 20, 100], [0, 20, 100]],
      innen: null },
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
  const spanne = Math.max(bx[1] - bx[0], by[1] - by[0])
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
