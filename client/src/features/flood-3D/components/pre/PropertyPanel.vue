<template>
  <section class="f3d-props f3d-card" v-if="draft">
    <header class="f3d-card-head">
      <h3>{{ draft.id }}</h3>
      <span class="f3d-muted f3d-small">{{ TYPE_LABELS[draft.type ?? draft.kind] ?? '' }}</span>
      <button class="f3d-jsonschalter" :class="{ aktiv: hilfe }"
              :title="hilfe ? 'Erklärtexte ausblenden'
                : 'Erklärtexte zu diesem Objekttyp einblenden'"
              @click="hilfe = !hilfe">ℹ</button>
      <button class="f3d-jsonschalter" :class="{ aktiv: experte }"
              :title="experte
                ? 'Expertenmodus aus (JSON-Schalter verbergen)'
                : 'Expertenmodus: Felder als rohes JSON bearbeiten'"
              @click="experte = !experte">{ }</button>
    </header>

    <!-- EINE Struktur für alle Objekte (auch Modellgebiet und Gelände):
         oben die Maße und Wahlen des Typs — das IST seine Spezifik —,
         alles Weitere in gleichförmigen Aufklappern. -->

    <p v-if="wirkungJetzt" class="f3d-wirkung" :class="wirkungJetzt.art">
      <strong>{{ wirkungJetzt.titel }}</strong> {{ wirkungJetzt.text }}
    </p>

    <p v-if="hilfe && draft.type === 'bruchkante'" class="f3d-muted f3d-small">
      <strong>Ziehen, Abgraben, Aufschütten</strong> wirken auf einen
      Schlauch der Wirkungsbreite um die <em>Linie</em> — das Innere einer
      geschlossenen Kante bleibt dabei so liegen, wie es der Import
      hinterlassen hat. <strong>Ebnen</strong> und <strong>stufenfrei
      ergänzen</strong> füllen die <em>Fläche</em> innerhalb der Kante und
      brauchen deshalb eine geschlossene (ist der Schlusspunkt vergessen,
      wird sie gedanklich geschlossen). Ebnen legt die Ausgleichsebene
      durch die Kantenhöhen — für Planum, Beckensohle, Parkfläche. Ergänzen
      folgt auch einer geneigten Kante und schließt am Rand bündig an.
    </p>
    <p v-if="hilfe && draft.type === 'aussenkante'" class="f3d-muted f3d-small">
      Außerhalb der äußersten Vermessungslinie ist nichts gemessen — dort
      führt der Import die NÄCHSTGELEGENE bekannte Höhe fort. Die kann
      höher liegen als jede gemessene Oberkante und über den Gebietsdeckel
      hinauswachsen. Diese Operation führt stattdessen die Bezugskante mit
      dem angegebenen Gefälle bis an den Gebietsrand weiter (0 = Plateau
      auf Kronenhöhe). Wer die Ecken selbst setzen will, legt ein Polygon
      an — dann wird zwischen Kante und Rahmen übergeblendet, und die Ecken
      lassen sich in der Szene ziehen (Strg = Höhe).
    </p>
    <div v-if="draft.type === 'terrain'" class="f3d-row">
      <button class="f3d-btn"
              :class="{ 'f3d-btn-primary': store.sculptAktiv }"
              :disabled="!!store.spec?.terrain?.base?.koerper && !store.sculptAktiv"
              :title="store.spec?.terrain?.base?.koerper
                ? 'Das Gelände ist ein fertiger Volumenkörper (STL) — das Höhenraster ist nicht die Quelle, der Pinsel greift nicht'
                : 'Pinsel im 3D-Fenster: heben, senken, glätten, an Bruchkanten anpassen — beim Erdkörper wird auf der Höhenfläche geformt, der Körper folgt daraus'"
              @click="store.sculptAktiv = !store.sculptAktiv">
        {{ store.sculptAktiv ? '✓ Formen beenden' : '🖌 Gelände formen' }}
      </button>
    </div>
    <p v-if="hilfe && draft.type === 'terrain'" class="f3d-muted f3d-small">
      Normalerweise ist das Gelände eine offene Höhenfläche — der Vernetzer
      schneidet daran ab. Sobald etwas DURCH das Erdreich gehen soll (Rohr
      durch den Damm, Schacht, Kammer), muss daraus ein geschlossener
      Körper werden: ein Höhenfeld hat ein z je Punkt und kann keinen
      Hohlraum tragen. Der Erdkörper-Schalter unten steuert das. Der
      seitliche Überstand ist kein Schönheitsfehler: eine Körperwand genau
      auf der Gebietsfläche schneidet snappyHexMesh gegen sich selbst.
    </p>
    <p v-if="hilfe && wirkungJetzt?.art === 'aushub'" class="f3d-muted f3d-small">
      Ein Aushub bekommt keine eigene Fläche im Netz — seine Wandungen
      gehören zum Gelände, und dort greift auch die Verfeinerung. Das
      Gelände wird dafür als Erdkörper gebaut, denn ein Höhenfeld hat ein z
      je Punkt und kann keinen Hohlraum tragen. Die Maße sind lichte Maße;
      die Wandstärke gräbt der Bagger mit aus, damit das Bauteil hineinpasst.
    </p>
    <p v-if="hilfe && draft.type === 'culvert'" class="f3d-muted f3d-small">
      Das Gelände ist ein Höhenfeld — ein z je Punkt — und kann von sich aus
      keinen Tunnel haben: ein Rohr im Damm wird beim Vernetzen zugeschüttet,
      seine Mündung bekommt dann keine einzige Fläche. „Durch das Gelände
      bohren" baut das Gelände stattdessen als Erdkörper und schneidet die
      Rohrbohrung heraus (kostet etwas Zeit beim Fallaufbau). Liegt das Rohr
      ohnehin frei, bleibt der Schalter aus.
    </p>

    <!-- MASSE & WAHLEN -->
    <div v-for="field in felderMasse" :key="field.key" class="f3d-prop">
      <label>{{ field.label }}</label>
      <select v-if="field.widget === 'enum'" v-model="draft[field.key]"
              class="f3d-select">
        <option v-for="opt in field.enums" :key="opt" :value="opt">
          {{ enumLabel(field.key, opt) }}
        </option>
      </select>
      <input v-else-if="field.widget === 'number'" type="number" step="any"
             v-model.number="draft[field.key]" class="f3d-num f3d-grow" />
      <input v-else-if="field.widget === 'zahl_optional'" type="number"
             step="any" class="f3d-num f3d-grow" placeholder="automatisch"
             :value="draft[field.key] ?? ''"
             @change="setzeOptional(field.key, $event.target.value)" />
      <select v-else-if="field.widget === 'raster'" v-model="draft[field.key]"
              class="f3d-select">
        <option value="">— Raster wählen —</option>
        <option v-for="r in store.rasterDateien" :key="r.name" :value="r.name">
          {{ r.name }}{{ r.basis ? ' (Basisgelände)' : '' }} · {{ r.mb }} MB
        </option>
      </select>
      <input v-else-if="field.widget === 'text'" type="text"
             v-model="draft[field.key]" class="f3d-num f3d-grow" />
      <input v-else-if="field.widget === 'check'" type="checkbox"
             v-model="draft[field.key]" />
      <select v-else-if="field.widget === 'referenz'" class="f3d-select"
              v-model="draft[field.key]">
        <option value="" disabled>— {{ field.quellname }} wählen —</option>
        <option v-for="o in field.optionen" :key="o" :value="o">{{ o }}</option>
      </select>
      <div v-else-if="field.widget === 'zahlen'" class="f3d-zahlen">
        <label v-for="(nm, i) in field.namen" :key="i" class="f3d-zahl">
          <span>{{ nm }}</span>
          <input type="number" step="any" class="f3d-num"
                 :value="draft[field.key][i]"
                 @change="setzeZahl(field.key, i, $event.target.value)" />
        </label>
      </div>
      <textarea v-else v-model="jsonDrafts[field.key]" rows="3"
                class="f3d-json" spellcheck="false"></textarea>
      <button v-if="field.umschaltbar && (experte || jsonModus[field.key])"
              class="f3d-jsonschalter"
              :title="jsonModus[field.key]
                ? 'zurück zur Eingabemaske' : 'als JSON bearbeiten'"
              @click="jsonUmschalten(field.key)">
        {{ jsonModus[field.key] ? '↩ Maske' : '{ } JSON' }}
      </button>
    </div>

    <!-- GEOMETRIE: Stützpunkte; bearbeitet wird primär in der Szene -->
    <details v-if="felderGeometrie.length" class="f3d-klapper">
      <summary>Geometrie ({{ punkteGesamt }} Stützpunkte)</summary>
      <div v-for="field in felderGeometrie" :key="field.key" class="f3d-prop">
        <label>{{ field.label }}</label>
        <PunktListe v-if="!jsonModus[field.key]"
                    v-model="draft[field.key]" :dim="field.dim"
                    :min="field.min" :geschlossen="field.geschlossen" />
        <textarea v-else v-model="jsonDrafts[field.key]" rows="3"
                  class="f3d-json" spellcheck="false"></textarea>
        <button v-if="experte || jsonModus[field.key]" class="f3d-jsonschalter"
                @click="jsonUmschalten(field.key)">
          {{ jsonModus[field.key] ? '↩ Maske' : '{ } JSON' }}
        </button>
      </div>
    </details>

    <!-- UNTERGRUPPEN (Profil, Achse, Widerstand …) -->
    <details v-for="field in felderUntergruppen" :key="field.key"
             class="f3d-klapper" :open="field.key === 'profile'">
      <summary>{{ field.label }}</summary>
      <div class="f3d-prop">
        <UnterGruppe v-model="draft[field.key]" :labels="labelsFuer(field.key)"
                     :typ="draft.type" :gruppe="field.key"
                     :verbergen="VERBERGEN[field.key] ?? []" />
      </div>
    </details>

    <!-- FENSTER (nur Zu-/Abflüsse) -->
    <div v-if="isFlowBc" class="f3d-row">
      <button class="f3d-btn" :disabled="store.loading"
              title="Randbedingung auf die nächste Gebietsseite legen (x_min → y_min → x_max → y_max); das Fenster wird auf der neuen Seite mittig eingesetzt"
              @click="seiteWechseln">
        ⇄ Seite wechseln <span class="f3d-mono">({{ aktuelleSeite }})</span>
      </button>
    </div>
    <details v-if="isFlowBc" class="f3d-klapper">
      <summary>Fenster ({{ windowKind || 'ganze Fläche' }})</summary>
      <div class="f3d-prop">
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
        <p v-if="hilfe" class="f3d-muted f3d-small">
          Nur das Fenster ist Zu-/Ablauf, der Rest der Fläche wird Wand.
          Kreis und Trapez sind frei in der Höhe (auch über dem Gelände —
          Freistrahl); gekoppelt folgt das Fenster dem Gerinnequerschnitt
          am Gebietsrand.
        </p>
        <div v-if="feldWindow" class="f3d-prop">
          <UnterGruppe v-model="draft.window" :labels="labelsFuer('window')"
                       :typ="draft.type" gruppe="window"
                       :verbergen="VERBERGEN.window ?? []" />
        </div>
        <button v-if="windowKind && !windowKind.startsWith('follow:')"
                class="f3d-btn" @click="addWindowRefinement">
          ＋ Verfeinerungsbox ans Fenster
        </button>
      </div>
    </details>

    <!-- BEARBEITUNGEN (nur Körper): der Stapel samt Zeichenknöpfen -->
    <details v-if="hatKoerper" class="f3d-klapper">
      <summary>Bearbeitungen ({{ draft.edits?.length ?? 0 }})</summary>
      <div class="f3d-prop">
        <div class="f3d-openrow">
          <button class="f3d-btn f3d-grow" :class="{ active: zeichnet === 'bohrung' }"
                  @click="zeichnen('bohrung')">✎ Bohrung</button>
          <button class="f3d-btn f3d-grow" :class="{ active: zeichnet === 'oeffnung' }"
                  @click="zeichnen('oeffnung')">✎ Öffnung</button>
          <button class="f3d-btn f3d-grow" :class="{ active: zeichnet === 'schnitt' }"
                  @click="zeichnen('schnitt')">✎ Zuschnitt</button>
        </div>
        <div class="f3d-openrow">
          <button class="f3d-btn f3d-grow" @click="addEdit('gelaende')">＋ Gelände</button>
          <button class="f3d-btn f3d-grow" @click="addEdit('auf_gebiet')">＋ Auf Gebiet</button>
          <button class="f3d-btn f3d-grow" @click="addEdit('transform')">＋ Lage</button>
          <button class="f3d-btn f3d-grow" @click="addEdit('heilen')">＋ Heilen</button>
        </div>
        <p v-if="hilfe" class="f3d-muted f3d-small">
          Wird der Reihe nach auf den Körper angewandt. Die drei mit ✎ werden
          in die Szene <strong>gezeichnet</strong>: auf den Körper zeigen,
          Mausrad ändert das Maß, Klick stanzt. <strong>Gelände</strong>
          bindet ein, <strong>Auf Gebiet</strong> stutzt Überstände,
          <strong>Lage</strong> verschiebt/dreht/skaliert,
          <strong>Heilen</strong> schließt Löcher importierter Netze.
        </p>
        <EditListe v-if="feldEdits" v-model="draft.edits"
                   :labels="FIELD_LABELS" :typ-labels="TYP_LABELS" />
      </div>
    </details>

    <!-- MATERIAL & KRÄFTE (nur Körper) -->
    <details v-if="hatKoerper" class="f3d-klapper">
      <summary>Material &amp; Kräfte{{ materialDraft ? ` (${materialDraft})` : '' }}</summary>
      <div class="f3d-prop">
        <label>Material (Wandrauheit)</label>
        <select class="f3d-select" v-model="materialDraft">
          <option value="">— glatt (Standard) —</option>
          <option v-for="m in MATERIALS" :key="m" :value="m">
            {{ MATERIAL_LABELS[m] }}
          </option>
        </select>
        <input type="number" step="any" min="0" class="f3d-num"
               v-model.number="ksDraft" placeholder="k_s eigene (m), leer = Katalogwert" />
        <label class="f3d-check">
          <input type="checkbox" :checked="kraefteAn" @change="kraefteUmschalten" />
          Kräfte und Kippmoment auswerten
        </label>
        <p v-if="hilfe" class="f3d-muted f3d-small">
          k_s = äquivalente Sandrauheit der Wandfunktion auf diesem Patch;
          die Kraftauswertung liefert Horizontalkraft, Auftrieb und das
          Kippmoment um die Fußmitte — die Größen des
          Standsicherheitsnachweises.
        </p>
      </div>
    </details>

    <div class="f3d-prop-actions">
      <button class="f3d-btn f3d-grow" :class="{ bereit: geaenderteFelder.length }"
              :disabled="store.loading" @click="apply">
        Übernehmen<template v-if="geaenderteFelder.length">
          ({{ geaenderteFelder.length }})</template>
      </button>
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
import PunktListe from './PunktListe.vue'
import UnterGruppe from './UnterGruppe.vue'
import EditListe from './EditListe.vue'
import {
  AUSHUB_TYPEN, FIELD_LABELS, GESCHLOSSEN, GRUPPEN_LABELS,
  OPTIONAL_ZAHLEN, QUELL_NAMEN, REFERENZ_QUELLEN, TYP_LABELS, VERBERGEN,
  enumFor, enumLabel, punktDim,
  referenzListe, widgetFor, zahlenNamen,
} from '../../utils/feldTypen'
import { TYPE_LABELS } from '../../utils/preTemplates'
import { MATERIALS, MATERIAL_LABELS } from '../../utils/importRollen'

const store = usePreStore()
const draft = ref(null)
// JSON-Rohbearbeitung ist Expertenwerkzeug: die Schalter erscheinen erst,
// wenn man sie einschaltet — der Normalweg sind Maske, Punktliste, Griffe
const experte = ref(false)
// Die Lehrtexte je Objekttyp sind wertvoll — aber nicht bei jedem Öffnen:
// eingeklappt, bis man sie ruft. Das Panel zeigt sonst mehr Prosa als Felder.
const hilfe = ref(false)
const jsonDrafts = reactive({})
// Felder, die der Nutzer bewusst als JSON bearbeitet
const jsonModus = reactive({})


const fields = computed(() => {
  if (!draft.value) return []
  // Bauwerke/Operationen unterscheidet `type`, Nachweiskriterien `kind`
  const typ = draft.value.type ?? draft.value.kind
  // leere Optionalfelder ergänzen — sonst fehlen sie im Formular, weil sie
  // als null gar nicht erst übertragen werden
  const eintraege = Object.entries(draft.value)
  for (const k of OPTIONAL_ZAHLEN[typ] ?? []) {
    if (!(k in draft.value)) eintraege.push([k, null])
  }
  return eintraege
    // herkunft/import_ref sind Herkunftsangaben des Systems, keine
    // Eingaben — sie editierbar zu zeigen hieße, die Rohdaten-Referenz
    // eines Imports zum freien Textfeld zu machen
    .filter(([k]) => !['id', 'type', 'kind', 'material',
      'material_ks', 'herkunft', 'import_ref'].includes(k))
    // Nicht gesetzte Felder ohne eigene Maske weglassen: sie erzeugten
    // bisher eine leere JSON-Textarea neben dem Bedienelement, das sie
    // eigentlich setzt (etwa `window` neben dem Fenster-Auswahlkasten)
    .filter(([k, v]) => (OPTIONAL_ZAHLEN[typ] ?? []).includes(k)
      || widgetFor(k, v, typ) !== 'leer')
    .map(([k, v]) => {
      const eigen = (OPTIONAL_ZAHLEN[typ] ?? []).includes(k)
        ? 'zahl_optional' : widgetFor(k, v, typ)
      const widget = jsonModus[k] ? 'json' : eigen
      return {
        key: k,
        eigen,
        label: TYP_LABELS[typ]?.[k] ?? FIELD_LABELS[k] ?? k,
        widget,
        // JSON bleibt als Rückfallebene erreichbar, aber nur dort, wo es
        // etwas zu sehen gibt — bei Zahlen und Text wäre der Schalter Unfug
        umschaltbar: !['number', 'text', 'check', 'enum', 'raster',
          'referenz'].includes(eigen),
        dim: punktDim(k, v, typ),
        min: GESCHLOSSEN.has(k) ? 3 : 2,
        geschlossen: GESCHLOSSEN.has(k),
        // Auswahlwerte am Objekttyp: `shape` heißt beim Pfeiler und beim
        // Schacht gleich und meint andere Formen
        enums: eigen === 'enum' ? enumFor(k, '', typ) : [],
        namen: Array.isArray(v) ? zahlenNamen(k, v.length) : [],
        optionen: eigen === 'referenz'
          ? referenzListe(store.spec, REFERENZ_QUELLEN[typ][k]) : [],
        quellname: eigen === 'referenz'
          ? QUELL_NAMEN[REFERENZ_QUELLEN[typ][k]] : '',
      }
    })
})


function labelsFuer(key) {
  return { ...FIELD_LABELS, ...(GRUPPEN_LABELS[key] ?? {}) }
}

// Leeres Feld heißt „Vorbelegung" — als null übernehmen, nicht als 0
function setzeOptional(key, wert) {
  const s = String(wert).trim()
  draft.value[key] = s === '' ? null : Number(s)
}

function setzeZahl(key, i, wert) {
  const z = Number(wert)
  const neu = [...draft.value[key]]
  neu[i] = Number.isFinite(z) ? z : 0
  draft.value[key] = neu
}

// Ein Feld zwischen Maske und JSON umschalten. Beim Zurückschalten wird
// der Text übernommen — sonst ginge eine Änderung still verloren.
function jsonUmschalten(key) {
  if (jsonModus[key]) {
    try {
      draft.value[key] = JSON.parse(jsonDrafts[key])
    } catch {
      store.melden(`Feld „${FIELD_LABELS[key] ?? key}": ungültiges JSON`,
        'fehler')
      return
    }
    delete jsonDrafts[key]
    delete jsonModus[key]
  } else {
    jsonDrafts[key] = JSON.stringify(draft.value[key])
    jsonModus[key] = true
  }
}

watch(() => [store.selection, store.selectedObject], () => {
  const obj = store.selectedObject
  draft.value = obj ? JSON.parse(JSON.stringify(obj)) : null
  for (const k of Object.keys(jsonDrafts)) delete jsonDrafts[k]
  for (const k of Object.keys(jsonModus)) delete jsonModus[k]
  if (draft.value) {
    for (const [k, v] of Object.entries(draft.value)) {
      // nur was keine eigene Maske hat, bleibt JSON-Text
      if (v !== null && typeof v === 'object'
          && widgetFor(k, v, draft.value.type ?? draft.value.kind) === 'json') {
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
// Seite der Randbedingung: die SERVER-Auflösung, sonst face, sonst die
// Vorbelegung nach Typ (meshgen._assign_faces)
const SEITEN_RUNDE = ['x_min', 'y_min', 'x_max', 'y_max']
const aktuelleSeite = computed(() => {
  const o = draft.value
  if (!o) return ''
  return store.aufgeloest?.bcFaces?.[o.id] ?? o.face
    ?? (o.type?.startsWith('inflow') ? 'x_min' : 'x_max')
})

// Ein Klick = nächste Gebietsseite. Das Fenster (span/center) wird auf
// der neuen Seite mittig eingesetzt (Breite bleibt). Liegen danach
// Zulauf und Ablauf auf derselben Seite, gibt es sofort eine Warnung —
// die Prüfung meldet den blockMesh-Konflikt zusätzlich als Fehler.
async function seiteWechseln() {
  const o = store.selectedObject
  const dom = store.spec?.domain
  if (!o || !dom) return
  const jetzt = aktuelleSeite.value
  const seite = SEITEN_RUNDE[
    (SEITEN_RUNDE.indexOf(jetzt) + 1) % SEITEN_RUNDE.length]
  const [x0, y0, x1, y1] = dom.extent
  const [lo, hi] = seite.startsWith('x') ? [y0, y1] : [x0, x1]
  const clone = JSON.parse(JSON.stringify(o))
  clone.face = seite
  const win = clone.window
  if (win && !win.follow) {
    const mitte = (lo + hi) / 2
    const r2 = (v) => Math.round(v * 100) / 100
    if (win.span) {
      const w = Math.min(Math.abs(win.span[1] - win.span[0]), hi - lo)
      win.span = [r2(mitte - w / 2), r2(mitte + w / 2)]
    }
    if (win.center != null) win.center = r2(mitte)
  }
  store.updateObject('boundary', o.id, clone)
  await store.saveCase()
  // Zulauf und Ablauf auf derselben Seite? Sofort sagen.
  const seiten = {}
  for (const b of store.spec?.boundaries ?? []) {
    const f = store.aufgeloest?.bcFaces?.[b.id] ?? b.face
      ?? (b.type?.startsWith('inflow') ? 'x_min'
        : b.type?.startsWith('outflow') ? 'x_max' : null)
    if (!f || f === 'z_max') continue
    ;(seiten[f] ??= []).push(b)
  }
  for (const [f, bs] of Object.entries(seiten)) {
    const zu = bs.some((b) => b.type?.startsWith('inflow'))
    const ab = bs.some((b) => b.type?.startsWith('outflow'))
    if (zu && ab) {
      store.melden(`Achtung: Zulauf und Ablauf liegen beide auf ${f} — `
        + 'blockMesh kann zwei Randbedingungen auf einer Seite nicht '
        + 'abbilden (siehe Prüfung).', 'warnung')
    }
  }
}

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
// Ein Rechen hat keinen eigenen Körper im Netz — er wirkt als poröse Zone.
// Bearbeitungen und Wandrauheit gingen dort ins Leere, also gar nicht erst
// anbieten (Widerstand und Stabgeometrie stehen in den Feldern darüber).
const kraefteAn = computed(() => (store.spec?.evaluation?.force_patches ?? [])
  .includes(draft.value?.patch))

function kraefteUmschalten(ev) {
  const patch = draft.value?.patch
  if (!patch || !store.spec) return
  const liste = [...(store.spec.evaluation.force_patches ?? [])]
  const i = liste.indexOf(patch)
  if (ev.target.checked && i < 0) liste.push(patch)
  if (!ev.target.checked && i >= 0) liste.splice(i, 1)
  store.setForcePatches(liste)
}

const hatKoerper = computed(() => isStructure.value
  && draft.value?.type !== 'screen')
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

// Aussparungen: nur Wand und Becken; neue Öffnung mittig auf der Achse
// und auf halber Bauteilhöhe, damit sie garantiert im Bauteil liegt
// Bearbeitungen gelten fuer JEDES Bauwerk, auch importierte



const zeichnet = computed(() =>
  store.platzierung?.id === draft.value?.id ? store.platzierung.art : null)

// Zeichnen statt tippen: der Editor zeigt die Bearbeitung am Körper und
// stanzt sie beim Klick ein. Vorher den Entwurf übernehmen, sonst gingen
// nicht übernommene Feldänderungen beim Zurückschreiben verloren.
function zeichnen(art) {
  if (zeichnet.value === art) { store.endPlatzierung(); return }
  apply()
  store.startPlatzierung(art, draft.value.id)
}

function addEdit(art) {
  const o = store.selectedObject
  if (!o) return
  const edits = [...(o.edits ?? [])]
  const ids = new Set(edits.map((e) => e.id))
  let id = art
  let n = 2
  while (ids.has(id)) id = `${art}_${n++}`
  const vorlagen = {
    gelaende: { id, type: 'gelaende', modus: 'auto', einbindetiefe: 0.3 },
    auf_gebiet: { id, type: 'auf_gebiet', rand: 0.0 },
    transform: { id, type: 'transform', verschieben: [0, 0, 0],
      drehen_deg: 0, skalieren: 1 },
    heilen: { id, type: 'heilen' },
  }
  const e = vorlagen[art]
  if (!e) return
  store.updateObject(store.selection.kind, store.selection.id,
    { ...o, edits: [...edits, e] })
}

// --- Wiederhergestellt nach der Aufräumrunde (e55de7f): der
// Block-Schnitt hinter den MATERIALS riss diese LEBENDEN
// Definitionen mit — das Panel crashte beim Rendern
// (Template-Compiler und Build merken freie Bezeichner nicht).
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
      delete jsonDrafts.window
      return
    }
    draft.value.window = v.startsWith('follow:')
      ? { follow: v.slice(7) }
      : windowTemplate(v)
    // kein jsonDrafts mehr: das Fenster hat eine eigene Maske, und ein
    // stehengebliebener Textstand würde sie beim Übernehmen überschreiben
    delete jsonDrafts.window
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

// --- Aushub oder Bauteil? -------------------------------------------------
// Bei `wirkung: auto` entscheidet die LAGE: liegt die Oberkante auf oder
// unter dem gewachsenen Gelände, ist der Körper eingegraben und wirkt als
// Grube. Der Server rechnet das maßgeblich; hier wird dieselbe Frage
// gestellt, damit man beim Schieben sieht, was gerade gilt.
const AUSHUB_BUENDIG = 0.05

function oberkanteVon(o) {
  if (o.top_level != null) return o.top_level
  if (o.type === 'graben' && Array.isArray(o.axis) && o.axis.length) {
    const h = o.profile?.kind === 'kreis'
      ? (o.profile?.width ?? 0) : (o.profile?.height ?? 0)
    return Math.max(...o.axis.map((p) => (p[2] ?? 0) + h))
  }
  return null
}

function grundrissPunkte(o) {
  if (Array.isArray(o.footprint) && o.footprint.length) return o.footprint
  if (Array.isArray(o.axis) && o.axis.length) return o.axis
  if (Array.isArray(o.center) && o.center.length >= 2) return [o.center]
  return []
}

const wirkungJetzt = computed(() => {
  const o = draft.value
  if (!o || !AUSHUB_TYPEN.has(o.type)) return null
  if (o.wirkung === 'bauteil') {
    return { art: 'bauteil', titel: 'Bauteil.',
      text: 'Fest eingestellt — der Körper wird als eigene Fläche vernetzt, '
        + 'egal wie er liegt.' }
  }
  if (o.wirkung === 'aushub') {
    return { art: 'aushub', titel: 'Aushub.',
      text: 'Fest eingestellt — der Körper wird aus dem Gelände '
        + 'herausgeschnitten, egal wie er liegt.' }
  }
  const oben = oberkanteVon(o)
  const pkte = grundrissPunkte(o)
  if (oben == null || !pkte.length || !store.terrain) return null
  const boden = Math.min(...pkte.map((p) => store.gelaendeZ(p[0], p[1])))
  const eingegraben = boden >= oben - AUSHUB_BUENDIG
  const d = Math.abs(oben - boden).toFixed(2).replace('.', ',')
  return eingegraben
    ? { art: 'aushub', titel: 'Aushub —',
      text: `die Oberkante liegt ${d} m unter dem Gelände, der Körper ist `
        + 'eingegraben und wird als Hohlraum ausgeschnitten. Höher schieben '
        + 'macht wieder ein Bauteil daraus.' }
    : { art: 'bauteil', titel: 'Bauteil —',
      text: `der Körper steht ${d} m über dem Gelände und wird als eigene `
        + 'Fläche vernetzt. Erst wenn die Oberkante bündig oder darunter '
        + 'liegt, wird daraus ein Aushub.' }
})

// Der Entwurf, wie ihn „Übernehmen" schreiben würde: Maske plus die als
// JSON bearbeiteten Felder. `null` heißt: ein JSON-Feld ist nicht lesbar.
function entwurf() {
  if (!draft.value) return null
  const result = JSON.parse(JSON.stringify(draft.value))
  for (const [k, text] of Object.entries(jsonDrafts)) {
    try {
      result[k] = JSON.parse(text)
    } catch {
      return null
    }
  }
  return result
}

// Welche Felder sich gegenüber dem gespeicherten Objekt unterscheiden.
// Damit weiß der Knopf, ob es etwas zu übernehmen gibt — und die
// Rückmeldung kann sagen, WAS übernommen wurde. Ohne das sah „Übernehmen"
// bei jeder Zahl gleich aus: nichts rührte sich sichtbar.
const geaenderteFelder = computed(() => {
  const neu = entwurf()
  const alt = store.selectedObject
  if (!neu || !alt) return []
  const namen = new Set([...Object.keys(neu), ...Object.keys(alt)])
  return [...namen].filter(
    (k) => JSON.stringify(neu[k]) !== JSON.stringify(alt[k]))
})

function apply() {
  const result = entwurf()
  if (result === null) {
    const kaputt = Object.keys(jsonDrafts).find((k) => {
      try { JSON.parse(jsonDrafts[k]); return false } catch { return true }
    })
    store.melden(`Feld „${FIELD_LABELS[kaputt] ?? kaputt}": ungültiges JSON`,
      'fehler')
    return
  }
  const felder = geaenderteFelder.value
  if (!felder.length) {
    store.melden('Nichts geändert', 'hinweis')
    return
  }
  const namen = felder.map((k) => TYP_LABELS[result.type ?? result.kind]?.[k]
    ?? FIELD_LABELS[k] ?? k)
  store.updateObject(store.selection.kind, store.selection.id, result)
  store.melden(`„${result.id}" übernommen: ${namen.join(', ')}`, 'erfolg')
}

// --- EINE Panel-Struktur: Maße oben, Rest in Aufklappern ------------------
// Die Partition folgt der Feldkunde: Zahlen/Wahlen sind die Spezifik des
// Typs und bleiben sichtbar; Punktlisten, Untergruppen und der
// Bearbeitungsstapel wandern in gleichförmige Klapper.
const felderMasse = computed(() => fields.value.filter(
  (f) => !['punkte', 'gruppe', 'edits'].includes(f.eigen)))
const felderGeometrie = computed(() => fields.value.filter(
  (f) => f.eigen === 'punkte'))
const felderUntergruppen = computed(() => fields.value.filter(
  (f) => f.eigen === 'gruppe' && f.key !== 'window'))
const feldWindow = computed(() => fields.value.some(
  (f) => f.eigen === 'gruppe' && f.key === 'window'))
const feldEdits = computed(() => fields.value.some(
  (f) => f.eigen === 'edits') || Array.isArray(draft.value?.edits))
const punkteGesamt = computed(() => felderGeometrie.value.reduce(
  (n, f) => n + (draft.value?.[f.key]?.length ?? 0), 0))

function remove() {
  store.loescheObjekt(store.selection.kind, store.selection.id)
}
</script>

<style scoped>
.f3d-klapper {
  border: 1px solid var(--f3d-border);
  border-radius: 8px;
  padding: 4px 8px;
}
.f3d-klapper > summary {
  cursor: pointer;
  color: var(--f3d-text-2);
  font-size: 0.75rem;
  padding: 3px 0;
  user-select: none;
}
.f3d-klapper[open] > summary { color: var(--f3d-text); }

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
.f3d-zahlen { display: flex; flex-wrap: wrap; gap: 4px; }
.f3d-zahl {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1 1 62px;
  min-width: 62px;
}
.f3d-zahl > span { color: var(--f3d-text-2); font-size: 0.64rem; }
.f3d-zahl .f3d-num { width: 100%; min-width: 0; }
.f3d-jsonschalter {
  align-self: flex-start;
  background: none;
  border: none;
  color: var(--f3d-text-2);
  cursor: pointer;
  font-size: 0.64rem;
  padding: 1px 0 0;
}
.f3d-jsonschalter:hover { color: var(--f3d-accent); }
.f3d-openrow { display: flex; gap: 6px; }
.f3d-prop-actions { display: flex; gap: 8px; margin-top: 4px; }
/* Der Knopf zeigt selbst an, ob es etwas zu übernehmen gibt */
.f3d-prop-actions .bereit {
  border-color: var(--f3d-accent, var(--f3d-accent));
  color: var(--f3d-accent, var(--f3d-accent));
}
.f3d-wirkung {
  margin: 0;
  padding: 4px 8px;
  border-left: 3px solid var(--f3d-border);
  font-size: 0.74rem;
  line-height: 1.35;
}
.f3d-wirkung.aushub { border-left-color: var(--f3d-warn); color: var(--f3d-warn); }
.f3d-wirkung.bauteil { border-left-color: var(--f3d-accent); color: var(--f3d-text-2); }
</style>
