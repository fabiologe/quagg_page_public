<template>
  <section class="f3d-props f3d-card" v-if="draft">
    <header class="f3d-card-head">
      <h3>{{ draft.id }}</h3>
      <span class="f3d-muted f3d-small">{{ TYPE_LABELS[draft.type ?? draft.kind] ?? '' }}</span>
    </header>

    <div v-for="field in fields" :key="field.key" class="f3d-prop">
      <label>{{ field.label }}</label>
      <select v-if="field.widget === 'enum'" v-model="draft[field.key]"
              class="f3d-select">
        <option v-for="opt in ENUM_OPTIONS[field.key]" :key="opt" :value="opt">
          {{ ENUM_LABELS[opt] ?? opt }}
        </option>
      </select>
      <input v-else-if="field.widget === 'number'" type="number" step="any"
             v-model.number="draft[field.key]" class="f3d-num f3d-grow" />
      <input v-else-if="field.widget === 'text'" type="text"
             v-model="draft[field.key]" class="f3d-num f3d-grow" />
      <input v-else-if="field.widget === 'check'" type="checkbox"
             v-model="draft[field.key]" />
      <textarea v-else v-model="jsonDrafts[field.key]" rows="3"
                class="f3d-json" spellcheck="false"></textarea>
    </div>

    <div v-if="isFlowBc" class="f3d-prop">
      <label>Fenster (Öffnung auf der Randfläche)</label>
      <select class="f3d-select" v-model="windowKind">
        <option value="">— ganze Fläche —</option>
        <option value="rechteck">Rechteck</option>
        <option value="kreis">Kreis (Rohrmündung)</option>
        <option value="trapez">Trapez (Gerinnequerschnitt)</option>
        <option value="polygon">Polygon (frei zeichnen)</option>
        <option value="ei">Eiprofil</option>
        <option value="maul">Maulprofil</option>
        <option value="tropfen">Tropfenprofil</option>
        <option v-for="ch in channels" :key="ch.id" :value="'follow:' + ch.id">
          an Gerinne „{{ ch.id }}“ gekoppelt
        </option>
        <option v-for="c in pipes" :key="'p' + c.id" :value="'follow:' + c.id">
          an Stutzen/Durchlass „{{ c.id }}“ gekoppelt
        </option>
      </select>
      <p class="f3d-muted f3d-small">
        Nur das Fenster ist Zu-/Ablauf, der Rest der Fläche wird Wand.
        Kreis und Trapez sind frei in der Höhe (auch über dem Gelände —
        Freistrahl); gekoppelt folgt das Fenster dem Gerinnequerschnitt
        am Gebietsrand.
      </p>
      <button v-if="windowKind && !windowKind.startsWith('follow:')"
              class="f3d-btn" @click="addWindowRefinement">
        ＋ Verfeinerungsbox ans Fenster
      </button>
    </div>

    <div v-if="isStructure" class="f3d-prop">
      <label>Material (Wandrauheit)</label>
      <select class="f3d-select" v-model="materialDraft">
        <option value="">— glatt (Standard) —</option>
        <option v-for="m in MATERIALS" :key="m" :value="m">
          {{ MATERIAL_LABELS[m] }}
        </option>
      </select>
      <input type="number" step="any" min="0" class="f3d-num"
             v-model.number="ksDraft" placeholder="k_s eigene (m), leer = Katalogwert" />
      <p class="f3d-muted f3d-small">
        Setzt die äquivalente Sandrauheit k_s der Wandfunktion auf diesem
        Bauwerks-Patch (nutkRoughWallFunction); der eigene Wert in m
        überschreibt den Katalogwert des Materials.
      </p>
    </div>

    <p v-if="parseError" class="f3d-error">{{ parseError }}</p>

    <div class="f3d-prop-actions">
      <button class="f3d-btn f3d-grow" @click="apply">Übernehmen</button>
      <button class="f3d-btn" @click="remove" title="Objekt löschen">🗑</button>
    </div>
    <p class="f3d-muted f3d-small">
      Übernehmen ändert den Entwurf — erst „Speichern" oben schreibt den Fall
      und aktualisiert Geometrie und Prüfung.
    </p>
  </section>
  <section v-else class="f3d-card f3d-muted">
    Kein Objekt gewählt — Klick in Szene oder Objektbaum.
  </section>
</template>

<script setup>
// Eigenschaftspanel (Spez. Kap. 6.1): Formular je Objekttyp. Skalare Felder
// als Eingaben, Geometriefelder (Polylinien, Polygone, Profile) als JSON —
// numerische Eingabe ist laut Spez gleichwertig zur Mausbedienung, weil
// Koordinaten regelmäßig aus dem CAD übernommen werden.
import { computed, reactive, ref, watch } from 'vue'
import { usePreStore } from '../../stores/usePreStore'
import { TYPE_LABELS } from '../../utils/preTemplates'

const store = usePreStore()
const draft = ref(null)
const jsonDrafts = reactive({})
const parseError = ref('')

const FIELD_LABELS = {
  polyline: 'Polylinie [[x,y],…]', polygon: 'Polygon [[x,y],…]',
  invert_start: 'Sohlhöhe Anfang (m)', invert_end: 'Sohlhöhe Ende (m)',
  bottom_width: 'Sohlbreite (m)', depth: 'Tiefe (m)',
  side_slope: 'Böschungsneigung 1:n', level: 'Höhe (m NHN)',
  crest_level: 'Kronenhöhe (m)', crest_width: 'Kronenbreite (m)',
  center: 'Mittelpunkt [x,y]', radius: 'Radius (m)', strength: 'Stärke',
  falloff: 'Abklingfunktion', direction: 'Richtung [x,y]',
  level_start: 'Höhe Anfang (m)', level_end: 'Höhe Ende (m)',
  blend_width: 'Übergangsbreite (m)', source: 'Quelldatei',
  height: 'Höhe (m)', thickness: 'Dicke (m)', alignment: 'Achse (kind, points)',
  window: 'Fenster — shape: rechteck (span, z_min/z_max) | '
    + 'kreis (center, z_center, diameter) | '
    + 'trapez (center, bottom_width, top_width, z_min, z_max)',
  footprint: 'Grundriss [[x,y],…]', invert_level: 'Sohlhöhe (m)',
  invert_slope: 'Sohlgefälle', wall_height: 'Wandhöhe (m)',
  wall_thickness: 'Wanddicke (m)',
  axis: 'Achse [[x,y,z],…]', profile: 'Profil (kind, Abmessungen)',
  plane_polygon: 'Rechenebene [[x,y,z],…]', bar_spacing: 'Stabteilung (m)',
  bar_thickness: 'Stabdicke (m)', approach_angle_deg: 'Anströmwinkel (°)',
  resistance: 'Widerstand (d, f, Verlegungsgrad)',
  base_level: 'Fußhöhe (m)', top_level: 'Kopfhöhe (m)',
  extent: 'Ausdehnung [x0,y0,z0,x1,y1,z1]', target: 'Ziel-Bauwerk (patch)',
  q: 'Zufluss (m³/s)', face: 'Gebietsrand', patch: 'Patchname',
  column_time: 'Zeitspalte', column_q: 'Durchflussspalte',
  point: 'Punkt [x,y]', at: 'Pegel/Bauwerk', of: 'Zähler-Querschnitt',
  to: 'Nenner-Querschnitt', limit_max: 'Grenzwert max.',
  limit_min: 'Grenzwert min.', component: 'Komponente', region: 'Region',
  batter_deg: 'Neigung (°)', cutwater: 'Anlauf (veraltet)',
  rotation_deg: 'Drehung (°)', insert_point: 'Einfügepunkt [x,y,z]',
  crest_polyline: 'Kronenachse [[x,y,zKrone],…]',
  slope_upstream: 'Neigung Oberwasser 1:n', slope_downstream: 'Neigung Unterwasser 1:n',
  profile_type: 'Wehrprofil', bar_shape: 'Stabform', bar_depth: 'Stabtiefe (m)',
  approach_angle_deg: 'Anströmwinkel (°, 90 = frontal)',
  shape: 'Grundrissform', length: 'Länge (m)', width: 'Breite/Ø (m)',
}

// Auswahlfelder für Formvarianten (Werte = casespec-Literale)
const ENUM_OPTIONS = {
  profile_type: ['trapez', 'breitkronig', 'scharfkantig', 'rundkronig'],
  bar_shape: ['rechteck', 'rund', 'tropfen'],
  shape: ['polygon', 'rechteck', 'rund', 'tropfen'],
  falloff: ['smooth', 'linear', 'constant'],
  face: ['x_min', 'x_max', 'y_min', 'y_max', 'z_max'],
  component: ['x', 'y', 'z', 'magnitude'],
}
const ENUM_LABELS = {
  trapez: 'Trapez (Dachwehr)', breitkronig: 'breitkronig',
  scharfkantig: 'scharfkantig (Platte)', rundkronig: 'rundkronig',
  rechteck: 'Rechteck', rund: 'rund', tropfen: 'Tropfen', polygon: 'Polygon',
  smooth: 'weich', linear: 'linear', constant: 'konstant',
}

const fields = computed(() => {
  if (!draft.value) return []
  return Object.entries(draft.value)
    .filter(([k]) => !['id', 'type', 'kind', 'material',
      'material_ks'].includes(k))
    .map(([k, v]) => ({
      key: k,
      label: FIELD_LABELS[k] ?? k,
      widget: ENUM_OPTIONS[k] ? 'enum'
        : typeof v === 'number' ? 'number'
          : typeof v === 'boolean' ? 'check'
            : typeof v === 'string' ? 'text' : 'json',
    }))
})

watch(() => [store.selection, store.selectedObject], () => {
  parseError.value = ''
  const obj = store.selectedObject
  draft.value = obj ? JSON.parse(JSON.stringify(obj)) : null
  for (const k of Object.keys(jsonDrafts)) delete jsonDrafts[k]
  if (draft.value) {
    for (const [k, v] of Object.entries(draft.value)) {
      if (v !== null && typeof v === 'object') {
        jsonDrafts[k] = JSON.stringify(v)
      }
    }
  }
}, { immediate: true, deep: false })

// Zu-/Ablauf-Fenster (Form oder Gerinne-Kopplung). Der Select schreibt
// draft UND jsonDrafts — apply() lässt sonst den alten Textarea-Stand
// gewinnen. Vorlagen mit brauchbaren Startwerten, Feintuning über das
// JSON-Feld oder die Handles im 3D.
const isFlowBc = computed(() => ['inflow_hydrograph', 'inflow_constant',
  'outflow_fixed_level', 'outflow_free'].includes(draft.value?.type))
const channels = computed(() => (store.spec?.terrain?.operations ?? [])
  .filter((o) => o.type === 'channel_carve'))
const pipes = computed(() => (store.spec?.structures ?? [])
  .filter((o) => o.type === 'culvert'))

function windowTemplate(kind) {
  const dom = store.spec?.domain
  if (!dom) return null
  const [x0, y0, x1, y1] = dom.extent
  // Kante wie meshgen-Vorbelegung: Zufluss x_min, Abfluss x_max
  const face = draft.value.face
    ?? (['inflow_hydrograph', 'inflow_constant'].includes(draft.value.type)
      ? 'x_min' : 'x_max')
  const [e0, e1] = face.startsWith('x') ? [y0, y1] : [x0, x1]
  const mid = Math.round((e0 + e1) / 2 * 100) / 100
  const len = e1 - e0
  const cell = store.spec?.mesh?.base_cell ?? 0.5
  const zMid = Math.round((dom.z_min + dom.z_max) / 2 * 100) / 100
  if (kind === 'kreis') {
    return { shape: 'kreis', center: mid, z_center: zMid,
      diameter: Math.max(4 * cell, 1) }
  }
  if (kind === 'trapez') {
    return { shape: 'trapez', center: mid,
      bottom_width: Math.max(4 * cell, 1),
      top_width: Math.max(8 * cell, 2),
      z_min: zMid, z_max: Math.round((zMid + (dom.z_max - dom.z_min) / 4) * 100) / 100 }
  }
  if (['polygon', 'ei', 'maul', 'tropfen'].includes(kind)) {
    return { shape: 'polygon',
      points: profilePolygon(kind, mid, zMid, Math.max(4 * cell, 1)) }
  }
  return { span: [Math.round((e0 + len / 3) * 100) / 100,
    Math.round((e1 - len / 3) * 100) / 100] }
}

// Profil-Vorlagen als editierbare Eckpunkt-Polygone in (Kante, Höhe):
// Sohle auf zBase, Breite B — danach frei verziehbar wie beim Rechen
function profilePolygon(kind, mid, zBase, B) {
  const r2 = (v) => Math.round(v * 100) / 100
  const pts = []
  if (kind === 'ei') {                    // b:h ≈ 2:3, unten schmaler
    const H = 1.5 * B
    for (let k = 0; k < 12; k++) {
      const th = (2 * Math.PI * k) / 12
      const u = (1 - Math.cos(th)) / 2    // 0 Sohle … 1 Scheitel
      pts.push([r2(mid + (B / 2) * Math.sin(th) * (0.55 + 0.45 * u)),
        r2(zBase + H * u)])
    }
    return pts
  }
  if (kind === 'maul') {                  // flache Sohle, gedrückter Bogen
    const H = 0.75 * B
    pts.push([r2(mid - B / 2), r2(zBase)], [r2(mid + B / 2), r2(zBase)])
    for (let k = 1; k < 8; k++) {
      const th = (Math.PI * k) / 8
      pts.push([r2(mid + (B / 2) * Math.cos(th)), r2(zBase + H * Math.sin(th))])
    }
    return pts
  }
  if (kind === 'tropfen') {               // Kreis unten, Spitze oben
    const R = B / 2
    const H = 1.6 * B
    for (const deg of [150, 180, 210, 240, 270, 300, 330, 0, 30]) {
      const th = (deg * Math.PI) / 180
      pts.push([r2(mid + R * Math.cos(th)), r2(zBase + R + R * Math.sin(th))])
    }
    pts.push([r2(mid), r2(zBase + H)])
    return pts
  }
  return [[r2(mid - B / 2), r2(zBase)], [r2(mid + B / 2), r2(zBase)],
    [r2(mid + B / 2), r2(zBase + B)], [r2(mid - B / 2), r2(zBase + B)]]
}

// Bauwerks-Material -> Wandrauheit (eigener Select statt Generikfeld,
// darum ist `material` oben aus fields() ausgenommen)
const isStructure = computed(() => store.selection?.kind === 'structure')
const MATERIALS = ['stahl', 'beton_glatt', 'beton', 'mauerwerk', 'holz',
  'erde', 'steinschuettung']
const MATERIAL_LABELS = {
  stahl: 'Stahl (k_s 0,1 mm)', beton_glatt: 'Beton glatt (0,5 mm)',
  beton: 'Beton (2 mm)', mauerwerk: 'Mauerwerk (5 mm)',
  holz: 'Holz (0,8 mm)', erde: 'Erde (30 mm)',
  steinschuettung: 'Steinschüttung (100 mm)',
}
const materialDraft = computed({
  get: () => draft.value?.material ?? '',
  set: (v) => {
    if (v) draft.value.material = v
    else delete draft.value.material
  },
})
const ksDraft = computed({
  get: () => draft.value?.material_ks ?? null,
  set: (v) => {
    if (typeof v === 'number' && v > 0) draft.value.material_ks = v
    else delete draft.value.material_ks
  },
})

const windowKind = computed({
  get: () => {
    const w = draft.value?.window
    if (!w) return ''
    if (w.follow) return 'follow:' + w.follow
    return w.shape ?? 'rechteck'
  },
  set: (v) => {
    if (!v) {
      draft.value.window = null
      jsonDrafts.window = 'null'
      return
    }
    draft.value.window = v.startsWith('follow:')
      ? { follow: v.slice(7) }
      : windowTemplate(v)
    jsonDrafts.window = JSON.stringify(draft.value.window)
  },
})

// Ein-Klick-Verfeinerung: Box (Level 2) um das Fenster, 2 Zellen Rand,
// 2 Zellen tief ins Gebiet — die Prüfung empfiehlt das bei kleinen Öffnungen
function addWindowRefinement() {
  const dom = store.spec?.domain
  const w = draft.value?.window
  if (!dom || !w) return
  const [x0, y0, x1, y1] = dom.extent
  const face = draft.value.face
    ?? (['inflow_hydrograph', 'inflow_constant'].includes(draft.value.type)
      ? 'x_min' : 'x_max')
  let lo, hi, zlo, zhi
  if (w.shape === 'kreis') {
    if (w.center == null || w.diameter == null || w.z_center == null) return
    lo = w.center - w.diameter / 2; hi = w.center + w.diameter / 2
    zlo = w.z_center - w.diameter / 2; zhi = w.z_center + w.diameter / 2
  } else if (w.shape === 'trapez') {
    if (w.center == null || w.z_min == null) return
    const h2 = Math.max(w.bottom_width ?? 0, w.top_width ?? 0) / 2
    lo = w.center - h2; hi = w.center + h2; zlo = w.z_min; zhi = w.z_max
  } else if (w.shape === 'polygon') {
    if (!w.points?.length) return
    const as = w.points.map((q) => q[0])
    const zs = w.points.map((q) => q[1])
    lo = Math.min(...as); hi = Math.max(...as)
    zlo = Math.min(...zs); zhi = Math.max(...zs)
  } else if (w.span) {
    [lo, hi] = [...w.span].sort((a, b) => a - b)
    zlo = w.z_min ?? dom.z_min; zhi = w.z_max ?? dom.z_max
  } else return
  const m = 2 * (store.spec?.mesh?.base_cell ?? 0.5)
  zlo = Math.max(zlo - m, dom.z_min)
  zhi = Math.min(zhi + m, dom.z_max)
  let ext
  if (face === 'x_min') ext = [x0, lo - m, zlo, x0 + 2 * m, hi + m, zhi]
  else if (face === 'x_max') ext = [x1 - 2 * m, lo - m, zlo, x1, hi + m, zhi]
  else if (face === 'y_min') ext = [lo - m, y0, zlo, hi + m, y0 + 2 * m, zhi]
  else ext = [lo - m, y1 - 2 * m, zlo, hi + m, y1, zhi]
  const ids = new Set((store.spec?.mesh?.refinements ?? []).map((o) => o.id))
  let rid = `vf_${draft.value.id}`
  let n = 2
  while (ids.has(rid)) rid = `vf_${draft.value.id}_${n++}`
  store.addObject('refinement', { id: rid, type: 'box',
    extent: ext.map((v) => Math.round(v * 100) / 100), level: 2 })
}

function apply() {
  parseError.value = ''
  const result = JSON.parse(JSON.stringify(draft.value))
  for (const [k, text] of Object.entries(jsonDrafts)) {
    try {
      result[k] = JSON.parse(text)
    } catch {
      parseError.value = `Feld „${FIELD_LABELS[k] ?? k}": ungültiges JSON`
      return
    }
  }
  store.updateObject(store.selection.kind, store.selection.id, result)
}

function remove() {
  store.removeObject(store.selection.kind, store.selection.id)
}
</script>

<style scoped>
.f3d-props { display: flex; flex-direction: column; gap: 8px; }
.f3d-prop { display: flex; flex-direction: column; gap: 3px; }
.f3d-prop > label { color: var(--f3d-text-2); font-size: 0.72rem; }
.f3d-json {
  background: var(--f3d-bg);
  color: var(--f3d-text);
  border: 1px solid var(--f3d-border);
  border-radius: 6px;
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
  padding: 6px;
  resize: vertical;
}
.f3d-prop-actions { display: flex; gap: 8px; margin-top: 4px; }
</style>
