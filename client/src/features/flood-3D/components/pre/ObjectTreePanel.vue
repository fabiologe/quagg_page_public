<template>
  <aside class="f3d-objtree">
    <button class="f3d-btn f3d-objimport" @click="showImport = true">
      ⬇ Geometrie importieren (DXF/STL/Raster)
    </button>
    <ImportModal v-if="showImport" @close="showImport = false" />

    <!-- EIN Anlegeweg: Rezepte und Katalogvorlagen in einer Auswahl,
         statt einem Select-Schwarm über sieben Gruppen -->
    <div class="f3d-objgroup">
      <div class="f3d-objadd">
        <select v-model="neuWahl" class="f3d-select f3d-grow"
                :title="neuHilfe">
          <option disabled value="">＋ Neu anlegen …</option>
          <optgroup label="Bauwerke (in einem Zug)">
            <option v-for="r in store.rezepte" :key="r.id"
                    :value="'rezept:' + r.id">{{ r.label }}</option>
          </optgroup>
          <optgroup v-for="k in katalog" :key="k.kind" :label="k.label">
            <option v-for="name in k.namen" :key="name"
                    :value="k.kind + ':' + name">{{ name }}</option>
          </optgroup>
        </select>
        <button class="f3d-btn" :disabled="!neuWahl || store.loading"
                @click="neuAnlegen">+</button>
      </div>
      <p v-if="neuHilfe" class="f3d-muted f3d-small">{{ neuHilfe }}</p>
    </div>

    <!-- Schicht (a): aus Grundlagen abgeleitet. Nicht Handarbeit — beim
         Neu-Ableiten des Imports wird ersetzt, was hier steht. -->
    <section v-if="grundlagen.length" class="f3d-abschnitt">
      <h4 class="f3d-abschnitt-kopf">Grundlagen (Import)</h4>
      <div v-for="g in grundlagen" :key="g.import_id" class="f3d-objgroup">
        <div class="f3d-objgroup-head">
          <span>🔒 {{ g.filename ?? g.import_id }}</span>
          <span class="f3d-muted f3d-small">{{ g.items.length }}</span>
        </div>
        <button v-for="item in g.items" :key="item.kind + item.id"
                class="f3d-objitem"
                :class="{ selected: store.selection?.kind === item.kind
                  && store.selection?.id === item.id }"
                :title="'aus dem Import — beim Neu-Ableiten ersetzt; Lage über Bearbeitungen ändern'"
                @click="store.select(item.kind, item.id)">
          <span class="f3d-objstatus" :class="statusClass(item.id)">{{ statusIcon(item.id) }}</span>
          <span class="f3d-objname">{{ item.id }}</span>
          <span class="f3d-muted f3d-small">{{ typeLabel(item) }}</span>
        </button>
        <button v-if="g.wiederholbar" class="f3d-btn f3d-btn-s f3d-verknuepfen"
                :disabled="store.loading" @click="neuAbleiten(g.import_id)"
                title="Import mit den gespeicherten Einstellungen erneut ableiten — ersetzt die Objekte oben, Handarbeit bleibt unberührt.">
          ↻ Neu ableiten
        </button>
      </div>
    </section>

    <section v-for="a in abschnitte" :key="a.id" class="f3d-abschnitt">
      <h4 class="f3d-abschnitt-kopf">{{ a.label }}</h4>
      <div v-for="group in a.gruppen" :key="group.kind"
           class="f3d-objgroup" :class="{ tief: group.eingerueckt }">
        <div class="f3d-objgroup-head">
          <span>{{ group.label }}</span>
          <span class="f3d-muted f3d-small">{{ group.items.length }}</span>
        </div>
        <button v-for="item in group.items" :key="item.id"
                class="f3d-objitem"
                :class="{ selected: store.selection?.kind === group.kind
                  && store.selection?.id === item.id }"
                @click="store.select(group.kind, item.id)">
          <span class="f3d-objstatus" :class="statusClass(item.id)">{{ statusIcon(item.id) }}</span>
          <span class="f3d-objname">{{ item.id }}</span>
          <span v-if="herkunftBadge(item)" class="f3d-muted f3d-small"
                :title="herkunftBadge(item).titel">{{ herkunftBadge(item).zeichen }}</span>
          <span class="f3d-muted f3d-small">{{ typeLabel(item) }}</span>
        </button>
        <button v-if="group.verknuepfen && group.items.length"
                class="f3d-btn f3d-btn-s f3d-verknuepfen"
                :disabled="store.loading" @click="kantenVerknuepfen"
                title="Aus Rolle und Lage der Kanten ableiten, was daraus folgt: Böschungen, Sohlen, Kronen — und aus Mauer- und Überfallkanten Bauteile. Von Hand Angelegtes bleibt unangetastet.">
          ⇄ Kanten verknüpfen
        </button>
      </div>
    </section>
  </aside>
</template>

<script setup>
// Objektbaum (Spez. Kap. 6.1): alle Objekte mit Typ und Validierungsstatus,
// Klick springt zum Objekt; "Neu anlegen" fügt Katalog-Vorlagen ein.
import { computed, onMounted, ref, watch } from 'vue'
import { usePreStore } from '../../stores/usePreStore'
import {
  TYPE_LABELS, TEMPLATES, vorlageAnpassen, noetigeVerfeinerung,
} from '../../utils/preTemplates'
import {
  REFERENZ_QUELLEN, fehlendeBausteine, referenzListe,
} from '../../utils/feldTypen'
import ImportModal from './ImportModal.vue'
import { flood3dApi } from '../../services/api'

const store = usePreStore()

// --- EIN Anlegeweg --------------------------------------------------------
// Rezepte (Anordnungen in einem Zug) und Katalogvorlagen in EINER Auswahl.
// Vorher: ein eigener Select je Gruppe plus einer für Rezepte — acht
// Bedienelemente für dieselbe Handlung „etwas Neues anlegen".
const neuWahl = ref('')

const KATALOG_LABELS = {
  terrain_op: 'Geländeoperationen', structure: 'Bauwerksformen',
  refinement: 'Netzverfeinerungen', boundary: 'Randbedingungen',
  section: 'Querschnitte', gauge: 'Pegel', target: 'Nachweiskriterien',
}
const katalog = computed(() => Object.entries(TEMPLATES).map(
  ([kind, tpls]) => ({ kind, label: KATALOG_LABELS[kind] ?? kind,
    namen: Object.keys(tpls) })))

const neuHilfe = computed(() => {
  if (!neuWahl.value.startsWith('rezept:')) return ''
  const id = neuWahl.value.slice(7)
  return store.rezepte.find((r) => r.id === id)?.beschreibung ?? ''
})

async function neuAnlegen() {
  const [art, ...rest] = neuWahl.value.split(':')
  const name = rest.join(':')
  if (art === 'rezept') {
    for (const z of await store.rezeptEinsetzen(name)) {
      store.melden(z, z.startsWith('ACHTUNG') ? 'hinweis' : 'erfolg')
    }
  } else {
    add(art, name)
  }
  neuWahl.value = ''
}

// --- Grundlagen (Schicht a): was aus Importen stammt ----------------------
// Gruppiert je Import, mit „Neu ableiten" (gespeicherte Anwendung).
// Dateiname und Wiederholbarkeit kommen aus der Import-Verwaltung.
const importInfo = ref({})

async function ladeImportInfo() {
  if (!store.activeCaseId) return
  try {
    const res = await flood3dApi.listImports(store.activeCaseId)
    importInfo.value = Object.fromEntries(
      (res.imports ?? []).map((i) => [i.import_id, i]))
  } catch { importInfo.value = {} }
}

const grundlagen = computed(() => {
  const s = store.spec
  if (!s) return []
  const je = {}
  const sammle = (kind, items) => {
    for (const o of items ?? []) {
      if (o.herkunft !== 'import' || !o.import_ref) continue
      const iid = o.import_ref.import_id
      const g = (je[iid] ??= {
        import_id: iid,
        filename: importInfo.value[iid]?.filename,
        wiederholbar: importInfo.value[iid]?.wiederholbar ?? false,
        items: [],
      })
      g.items.push({ kind, id: o.id, type: o.type ?? o.kind,
        herkunft: o.herkunft })
    }
  }
  sammle('structure', s.structures)
  sammle('kante', s.terrain?.kanten)
  sammle('terrain_op', s.terrain?.operations)
  sammle('section', s.evaluation?.sections)
  return Object.values(je)
})

async function neuAbleiten(importId) {
  for (const z of await store.importNeuAbleiten(importId)) {
    store.melden(z, z.startsWith('ACHTUNG') ? 'hinweis' : 'erfolg')
  }
}

// Kur- und Rezept-Objekte tragen ihre Herkunft als kleines Zeichen
function herkunftBadge(item) {
  if (item.herkunft === 'kur') return { zeichen: '⚕', titel: 'durch eine Kur angelegt' }
  if (item.herkunft === 'rezept') return { zeichen: '⚒', titel: 'Teil eines Bauwerksrezepts' }
  return null
}

onMounted(() => { store.ladeRezepte(); ladeImportInfo() })
watch(() => store.activeCaseId, ladeImportInfo)

// Aus Rolle und Lage der Kanten die Geländeoperationen ableiten. Eine
// Sohle innerhalb eines Beckenrands ergibt die Böschung dazwischen und
// die ebene Sohle darin — gepaart wird über die LAGE, nicht den Namen.
async function kantenVerknuepfen() {
  const zeilen = await store.kantenVerknuepfen()
  zeilen.forEach((z, i) => store.melden(z, i === 0 ? 'erfolg' : 'hinweis'))
}

const showImport = ref(false)

// Gliederung des Objektbaums.
//
// Vorher standen acht gleichrangige Gruppen untereinander — darunter
// „Geländeoperationen", deren Bezugsobjekt (die Geländebasis: Quellraster,
// Auflösung, Volumenkörper) im Baum GAR NICHT vorkam. Es war nur in der
// Phase „Simulation" erreichbar, getrennt von den Operationen, die genau
// darauf wirken. Das Modellgebiet stand daneben, ohne erkennbaren
// Zusammenhang.
//
// Jetzt zwei Ebenen: Abschnitte nach der Rolle im Modell, und das Gelände
// ist ein eigenes Objekt mit seinen Operationen darunter.
const ABSCHNITTE = [
  { id: 'modell', label: 'Modell',
    gruppen: ['domain', 'terrain', 'kante', 'terrain_op'] },
  { id: 'bauwerke', label: 'Bauwerke', gruppen: ['structure'] },
  { id: 'netz', label: 'Netz', gruppen: ['refinement'] },
  { id: 'hydraulik', label: 'Hydraulik', gruppen: ['boundary'] },
  { id: 'auswertung', label: 'Auswertung',
    gruppen: ['section', 'gauge', 'target'] },
]

const gruppenNachKind = computed(() => {
  const s = store.spec
  if (!s) return {}
  // Import-Objekte stehen im Abschnitt „Grundlagen" — hier nur Handarbeit,
  // Kuren und Rezepte
  const ohneImport = (liste) => (liste ?? []).filter(
    (o) => o.herkunft !== 'import')
  return {
    domain: { kind: 'domain', label: 'Modellgebiet',
      items: s.domain ? [{ id: 'domain', type: 'domain' }] : [] },
    // Das fehlende Elternobjekt: Quellraster, Auflösung, Volumenkörper
    terrain: { kind: 'terrain', label: 'Gelände',
      items: s.terrain ? [{ id: 'gelaende', type: 'terrain' }] : [] },
    // Was in der ZEICHNUNG steht, mit seiner Rolle — getrennt von dem,
    // was daraus für das Gelände folgt
    kante: { kind: 'kante', label: 'Vermessungskanten', eingerueckt: true,
      verknuepfen: true, items: ohneImport(s.terrain?.kanten) },
    terrain_op: { kind: 'terrain_op', label: 'Geländeoperationen',
      eingerueckt: true,
      items: ohneImport(s.terrain?.operations), templates: TEMPLATES.terrain_op },
    structure: { kind: 'structure', label: 'Bauwerke',
      items: ohneImport(s.structures), templates: TEMPLATES.structure },
    refinement: { kind: 'refinement', label: 'Verfeinerungen',
      items: s.mesh?.refinements ?? [], templates: TEMPLATES.refinement },
    boundary: { kind: 'boundary', label: 'Randbedingungen',
      items: s.boundaries ?? [], templates: TEMPLATES.boundary },
    section: { kind: 'section', label: 'Querschnitte',
      items: ohneImport(s.evaluation?.sections), templates: TEMPLATES.section },
    gauge: { kind: 'gauge', label: 'Pegelpunkte',
      items: s.evaluation?.gauges ?? [], templates: TEMPLATES.gauge },
    target: { kind: 'target', label: 'Nachweiskriterien',
      items: s.evaluation?.targets ?? [], templates: TEMPLATES.target },
  }
})

const abschnitte = computed(() => {
  const g = gruppenNachKind.value
  return ABSCHNITTE
    .map((a) => ({ ...a, gruppen: a.gruppen.map((k) => g[k]).filter(Boolean) }))
    .filter((a) => a.gruppen.length)
})


function typeLabel(item) {
  return TYPE_LABELS[item.type ?? item.kind] ?? item.type ?? item.kind ?? ''
}

function statusClass(id) {
  const s = store.worstSeverity(id)
  return s ? `sev-${s}` : 'sev-ok'
}

function statusIcon(id) {
  return { fehler: '✗', warnung: '⚠', hinweis: 'ℹ' }[store.worstSeverity(id)] ?? '✓'
}

// Die Außenkante braucht ihre innere Bezugslinie — von dort läuft das
// Gelände nach außen. Einen Rahmen bekommt sie nur, wenn der Bearbeiter die
// Ecken selbst setzen will; der Regelfall ist die Fortführung der Kante.
function randRahmen(obj) {
  const ops = store.spec?.terrain?.operations ?? []
  obj.innen = (ops.find((o) => o.type === 'boeschung')
    ?? ops.find((o) => o.type === 'bruchkante'))?.id ?? null
}

// Nachweiskriterien verweisen auf Pegel, Querschnitte, Bauwerke oder
// Verfeinerungsboxen. Leere Verweise blockieren das Speichern, weil das
// Backend hart prüft — also gleich mit dem ersten vorhandenen belegen.
function verweiseFuellen(obj) {
  const quellen = REFERENZ_QUELLEN[obj.kind] ?? {}
  for (const [feld, quelle] of Object.entries(quellen)) {
    const liste = referenzListe(store.spec, quelle)
    if (!liste.length) continue
    // zwei Querschnitte eines Verhältnisses sollen nicht derselbe sein
    const belegt = Object.keys(quellen)
      .filter((k) => k !== feld && quellen[k] === quelle)
      .map((k) => obj[k])
    obj[feld] = liste.find((x) => !belegt.includes(x)) ?? liste[0]
  }
}

function add(kind, name) {
  const tpl = TEMPLATES[kind]?.[name]
  if (tpl) {
    const obj = JSON.parse(JSON.stringify(tpl))
    // Die Außenkante ist nur als Rahmen AM Gebietsrand sinnvoll: vier Ecken
    // mit der Höhe, die das Gelände dort heute hat — von da aus stellt der
    // Bearbeiter sie ein.
    if (obj.type === 'aussenkante') randRahmen(obj)
    // Vorlagen sind im Bezugsraum notiert (Gelände 95 m, Grundriss um 20 m).
    // Ohne Umrechnung landet jede Vorlage in einem importierten Fall weit
    // neben oder unter dem Gelände.
    else vorlageAnpassen(obj, store.spec, (x, y) => store.gelaendeZ(x, y))
    if (obj.kind) {
      const fehlt = fehlendeBausteine(store.spec, obj.kind)
      if (fehlt.length) {
        // Ohne Bezugsobjekt wäre das Kriterium nicht speicherbar — sagen,
        // was fehlt, statt einen kaputten Eintrag anzulegen
        store.melden(`„${name}" braucht zuerst: ${fehlt.join(', ')}`,
          'hinweis')
        return
      }
      verweiseFuellen(obj)
    }
    const neu = store.addObject(kind, obj)
    // Ein neues Bauteil ist meist dünner als die Basiszelle. Statt es in die
    // Prüfung laufen zu lassen, kommt die Verfeinerung gleich mit — sichtbar,
    // damit niemand über die Zellzahl stolpert. `neu` statt `obj`: id und
    // patch vergibt erst der Store.
    const fein = noetigeVerfeinerung(neu, store.spec)
    if (fein) {
      store.addObject('refinement', fein.refinement)
      // Ausgewählt bleibt das Bauteil, nicht die nachgezogene Verfeinerung
      store.select(kind, neu.id)
      store.melden(fein.text, 'hinweis')
    }
  }
}
</script>

<style scoped>
.f3d-objtree {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding: 12px;
}
.f3d-abschnitt { display: flex; flex-direction: column; gap: 6px; }
.f3d-abschnitt-kopf {
  margin: 6px 2px 0;
  color: var(--f3d-text);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--f3d-border);
  padding-bottom: 3px;
}
.f3d-objgroup {
  background: var(--f3d-surface);
  border: 1px solid var(--f3d-border);
  border-radius: 8px;
  padding: 8px;
}
/* Die Operationen wirken AUF das Gelände darüber — die Einrückung sagt das */
.f3d-verknuepfen { align-self: flex-start; margin-top: 4px; }
.f3d-objgroup.tief {
  margin-left: 12px;
  border-left: 2px solid var(--f3d-border-strong);
}
.f3d-objgroup-head {
  display: flex;
  justify-content: space-between;
  color: var(--f3d-text-2);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 4px 6px;
}
.f3d-objitem {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--f3d-text);
  font-size: 0.8rem;
  padding: 5px 6px;
  cursor: pointer;
  text-align: left;
}
.f3d-objitem:hover { background: rgba(255, 255, 255, 0.04); }
.f3d-objitem.selected { border-color: var(--f3d-accent); }
.f3d-objname { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.f3d-objstatus { width: 14px; text-align: center; }
.f3d-objstatus.sev-ok { color: var(--f3d-good); }
.f3d-objstatus.sev-fehler { color: var(--f3d-bad); }
.f3d-objstatus.sev-warnung { color: var(--f3d-warn); }
.f3d-objstatus.sev-hinweis { color: var(--f3d-accent); }
.f3d-objadd { display: flex; gap: 6px; margin-top: 6px; }
.f3d-objimport { width: 100%; margin-bottom: 4px; }
</style>
