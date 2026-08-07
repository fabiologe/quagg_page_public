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

    <!-- Wurzel 1 · ZEICHNUNG (CAD): die Quelle. Nur Kandidaten mit ihrer
         Zuordnung; was daraus wurde, steht als Sprung-Verweis — die Objekte
         selbst leben GENAU EINMAL in Geometrie bzw. Wirkung. Nach getaner
         Zuordnung zugeklappt: eine Zeile statt vierzehn. -->
    <section v-if="grundlagen.length" class="f3d-abschnitt">
      <h4 class="f3d-abschnitt-kopf">Zeichnung (CAD)</h4>
      <details v-for="g in grundlagen" :key="g.import_id"
               class="f3d-objgroup f3d-zeichnung">
        <summary class="f3d-objgroup-head">
          <span>🔒 {{ g.filename ?? g.import_id }}</span>
          <span class="f3d-muted f3d-small">{{ g.kandidaten.length }} CAD-Objekte</span>
        </summary>
        <div v-for="k in g.kandidaten" :key="k.id" class="f3d-kandidat">
          <div class="f3d-objrow">
            <span class="f3d-objitem f3d-kandidat-kopf">
              <span class="f3d-objname">{{ k.name }}</span>
              <span class="f3d-muted f3d-small">{{ k.cadArt }}</span>
            </span>
          </div>
          <div class="f3d-objrow f3d-gruppenteil" v-if="k.rollen">
            <select class="f3d-select f3d-grow f3d-small"
                    :value="k.rolle" :disabled="store.loading"
                    :title="'Zuordnung ändern leitet den Import neu ab'"
                    @change="zuordnen(g.import_id, k.id, $event.target.value)">
              <optgroup v-for="og in k.rollen" :key="og.titel" :label="og.titel">
                <option v-for="r in og.rollen" :key="r" :value="r">
                  {{ ROLE_LABELS[r] ?? r }}
                </option>
              </optgroup>
            </select>
          </div>
          <button v-for="item in k.objekte" :key="item.kind + item.id"
                  class="f3d-verweis f3d-gruppenteil"
                  title="zum Objekt springen"
                  @click="store.select(item.kind, item.id)">
            → {{ item.id }}
          </button>
        </div>
        <button v-if="g.wiederholbar" class="f3d-btn f3d-btn-s f3d-verknuepfen"
                :disabled="store.loading" @click="neuAbleiten(g.import_id)"
                title="Import mit den gespeicherten Einstellungen erneut ableiten — ersetzt die zugeordneten Objekte, Handarbeit bleibt unberührt.">
          ↻ Neu ableiten
        </button>
      </details>
    </section>

    <section v-for="a in abschnitte" :key="a.id" class="f3d-abschnitt">
      <h4 class="f3d-abschnitt-kopf">{{ a.label }}</h4>
      <div v-for="group in a.gruppen" :key="group.kind"
           class="f3d-objgroup">
        <div class="f3d-objgroup-head">
          <span>{{ group.label }}</span>
          <span class="f3d-muted f3d-small">{{ group.items.length }}</span>
          <button v-if="TEMPLATES[group.kind]" class="f3d-objplus"
                  :title="'Neu: ' + group.label"
                  @click="plusOffen = plusOffen === group.kind ? null : group.kind">
            ＋
          </button>
        </div>
        <div v-if="plusOffen === group.kind" class="f3d-plusmenu">
          <button v-for="name in Object.keys(TEMPLATES[group.kind])"
                  :key="name" class="f3d-objitem" @click="plusAnlegen(group.kind, name)">
            {{ name }}
          </button>
        </div>
        <div v-for="item in group.items" :key="item.id" class="f3d-objrow">
          <button class="f3d-objitem"
                  :class="{ selected: store.selection?.kind === group.kind
                    && store.selection?.id === item.id }"
                  @click="store.select(group.kind, item.id)">
            <span class="f3d-objstatus" :class="statusClass(item.id)">{{ statusIcon(item.id) }}</span>
            <!-- Wirkung spricht Wirkungssprache: WAS die Operation tut,
                 die Kennung darunter klein -->
            <span v-if="group.wirkung" class="f3d-objname">
              {{ typeLabel(item) }}
              <span class="f3d-muted f3d-small">{{ item.id }}{{
                item.aus_kanten?.length ? ' · aus ' + item.aus_kanten[0] : '' }}</span>
            </span>
            <span v-else class="f3d-objname">{{ item.id }}</span>
            <span v-if="herkunftBadge(item)" class="f3d-muted f3d-small"
                  :title="herkunftBadge(item).titel">{{ herkunftBadge(item).zeichen }}</span>
            <span v-if="group.kind === 'terrain' && store.terrainSolid"
                  class="f3d-muted f3d-small" :title="erdkoerperWarum">⬢ Erdkörper</span>
            <span v-if="!group.wirkung" class="f3d-muted f3d-small">{{ typeLabel(item) }}</span>
          </button>
          <button v-if="!['domain', 'terrain'].includes(group.kind)"
                  class="f3d-objloesch" title="löschen"
                  @click="loeschen({ kind: group.kind, id: item.id })">✕</button>
        </div>
        <template v-if="group.kind === 'structure'">
      <div v-for="g in rezeptGruppen" :key="g.gruppe" class="f3d-objgroup">
        <div class="f3d-objrow">
          <button class="f3d-objitem" @click="klappen(g.gruppe)">
            <span class="f3d-objstatus" :class="g.statusKlasse">{{ g.statusZeichen }}</span>
            <span class="f3d-objname">⚒ {{ g.gruppe }}</span>
            <span class="f3d-muted f3d-small">{{ g.items.length }} Teile
              {{ zu.has(g.gruppe) ? '▸' : '▾' }}</span>
          </button>
          <button class="f3d-objloesch" title="Bauwerk mit allen Teilen löschen"
                  @click="store.loescheGruppe(g.gruppe)">✕</button>
        </div>
        <template v-if="!zu.has(g.gruppe)">
          <div v-for="item in g.items" :key="item.kind + item.id"
               class="f3d-objrow f3d-gruppenteil">
            <button class="f3d-objitem"
                    :class="{ selected: store.selection?.kind === item.kind
                      && store.selection?.id === item.id }"
                    @click="store.select(item.kind, item.id)">
              <span class="f3d-objstatus" :class="statusClass(item.id)">{{ statusIcon(item.id) }}</span>
              <span class="f3d-objname">{{ item.id }}</span>
              <span class="f3d-muted f3d-small">{{ typeLabel(item) }}</span>
            </button>
            <button class="f3d-objloesch" title="nur dieses Teil löschen"
                    @click="loeschen(item)">✕</button>
          </div>
        </template>
      </div>
        </template>
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
import { computed, onMounted, ref } from 'vue'
import { KIND_PATHS, usePreStore } from '../../stores/usePreStore'
import {
  TYPE_LABELS, TEMPLATES, vorlageAnpassen, noetigeVerfeinerung,
} from '../../utils/preTemplates'
import {
  REFERENZ_QUELLEN, fehlendeBausteine, referenzListe,
} from '../../utils/feldTypen'
import ImportModal from './ImportModal.vue'
import { ROLE_LABELS, rollenFuerKind } from '../../utils/importRollen'

const store = usePreStore()

// --- EIN Anlegeweg --------------------------------------------------------
// Rezepte (Anordnungen in einem Zug) und Katalogvorlagen in EINER Auswahl.
// Vorher: ein eigener Select je Gruppe plus einer für Rezepte — acht
// Bedienelemente für dieselbe Handlung „etwas Neues anlegen".
const neuWahl = ref('')

const KATALOG_LABELS = {
  terrain_op: 'Geländeoperationen', structure: 'Bauwerksformen',
  refinement: 'Netzverfeinerungen', vorfuellung: 'Anfangszustand', boundary: 'Randbedingungen',
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

// ＋ am Gruppenkopf: dieselben Vorlagen wie der Katalog oben, nur
// direkt an der Gruppe — ein Klick, Vorlage wählen, fertig
const plusOffen = ref(null)

function plusAnlegen(kind, name) {
  add(kind, name)
  plusOffen.value = null
}

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

// --- Grundlagen (Schicht a): die Import-Pipeline --------------------------
// Lesbar von oben nach unten: CAD-Objekt (Netz/TIN, Polylinie, Kreis …) →
// Zuordnung (änderbar, leitet neu ab) → was daraus im Modell wurde.
// „daraus abgeleitet" sind die Produkte der Kantenverknüpfung
// (aus_kanten gesetzt).
const CAD_ART = { mesh: 'Netz / TIN', polyline: 'Polylinie', kreis: 'Kreis',
  raster: 'Raster', acis: '3D-Volumen (ACIS)' }

const grundlagen = computed(() => {
  const s = store.spec
  if (!s) return []
  // Objekte je (import_id, kandidat) einsammeln — als SPRUNG-Verweise;
  // die Objekte selbst stehen in Geometrie bzw. Wirkung
  const objekte = {}
  for (const [kind, pfad] of Object.entries(KIND_PATHS)) {
    for (const o of pfad(s) ?? []) {
      if (o.herkunft !== 'import' || !o.import_ref) continue
      const iid = o.import_ref.import_id
      const item = { kind, id: o.id, type: o.type ?? o.kind }
      ;((objekte[iid] ??= {})[o.import_ref.kandidat] ??= []).push(item)
    }
  }
  const ids = new Set([...Object.keys(objekte),
    ...Object.keys(store.importe)])
  const aus = []
  for (const iid of ids) {
    const imp = store.importe[iid]
    const entschieden = Object.fromEntries((imp?.anwendung?.decisions ?? [])
      .map((d) => [d.candidate, d.role]))
    const kandidaten = (imp?.candidates ?? [])
      .filter((c) => c.kind !== 'hinweis')
      .map((c) => ({
        id: c.id,
        name: c.name,
        cadArt: CAD_ART[c.kind] ?? c.kind,
        rolle: entschieden[c.id] ?? c.role_guess ?? 'ignorieren',
        // ohne gespeicherte Anwendung keine Auswahl anbieten — sonst
        // verspricht das Select etwas, das der Server nicht kann
        rollen: imp?.anwendung ? rollenFuerKind(c.kind) : null,
        objekte: objekte[iid]?.[c.id] ?? [],
      }))
    // Kandidatenliste unbekannt (alter Import / Verwaltung nicht ladbar):
    // wenigstens die Objekte zeigen
    if (!kandidaten.length && objekte[iid]) {
      for (const [cid, items] of Object.entries(objekte[iid])) {
        kandidaten.push({ id: cid, name: cid, cadArt: '', rolle: '',
          rollen: null, objekte: items })
      }
    }
    // Geländebasis unter ihrem Kandidaten zeigen
    const quelle = s.terrain?.base?.source ?? ''
    if (quelle.includes(iid)) {
      const ziel = kandidaten.find((k) => ['gelaende', 'gelaende_koerper',
        'bruchkante', 'boeschung_ok'].includes(k.rolle)) ?? kandidaten[0]
      ziel?.objekte.unshift({ kind: 'terrain', id: 'gelaende',
        type: 'terrain' })
    }
    aus.push({
      import_id: iid,
      filename: imp?.filename,
      wiederholbar: imp?.wiederholbar ?? false,
      kandidaten,
    })
  }
  return aus.filter((g) => g.kandidaten.length)
})

// Zuordnung ändern = Import mit geänderter Rolle neu ableiten
async function zuordnen(importId, kandidat, rolle) {
  for (const m of await store.importNeuAbleiten(importId,
    { [kandidat]: rolle })) {
    store.melden(m, m.startsWith('ACHTUNG') ? 'hinweis' : 'erfolg')
  }
}

// DER eine Löschweg (Rückfrage bei Import-Objekten sitzt im Store)
function loeschen(item) {
  store.loescheObjekt(item.kind, item.id)
}

// --- Eingesetzte Rezepte: eine Gruppe je Einsetzung -----------------------
const zu = ref(new Set())          // zugeklappte Gruppen
function klappen(gruppe) {
  const s = new Set(zu.value)
  if (s.has(gruppe)) s.delete(gruppe)
  else s.add(gruppe)
  zu.value = s
}

const rezeptGruppen = computed(() => {
  const s = store.spec
  if (!s) return []
  const je = {}
  for (const [kind, pfad] of Object.entries(KIND_PATHS)) {
    for (const o of pfad(s) ?? []) {
      if (!o.gruppe) continue
      const g = (je[o.gruppe] ??= { gruppe: o.gruppe, items: [] })
      g.items.push({ kind, id: o.id, type: o.type ?? o.kind })
    }
  }
  for (const g of Object.values(je)) {
    const stufen = g.items.map((i) => store.worstSeverity(i.id))
    const schlimmste = stufen.includes('fehler') ? 'fehler'
      : stufen.includes('warnung') ? 'warnung' : null
    g.statusKlasse = schlimmste ? `sev-${schlimmste}` : 'sev-ok'
    g.statusZeichen = { fehler: '✗', warnung: '⚠' }[schlimmste] ?? '✓'
  }
  return Object.values(je)
})



async function neuAbleiten(importId) {
  for (const z of await store.importNeuAbleiten(importId)) {
    store.melden(z, z.startsWith('ACHTUNG') ? 'hinweis' : 'erfolg')
  }
}

// Kur- und Rezept-Objekte tragen ihre Herkunft als kleines Zeichen
function herkunftBadge(item) {
  if (item.herkunft === 'import') {
    return { zeichen: '🔒',
      titel: 'aus dem Import — beim Neu-Ableiten ersetzt; Zuordnung in der Zeichnung ändern' }
  }
  if (item.herkunft === 'kur') return { zeichen: '⚕', titel: 'durch eine Kur angelegt' }
  if (item.herkunft === 'rezept') return { zeichen: '⚒', titel: 'Teil eines Bauwerksrezepts' }
  return null
}

// Warum das Gelände als Erdkörper gebaut wird (Badge-Tooltip)
const erdkoerperWarum = computed(() => {
  const grund = []
  if (store.spec?.terrain?.erdkoerper === 'an') grund.push('erzwungen (Schalter)')
  const bohr = store.terrainSolid?.bohrungen ?? []
  if (bohr.length) grund.push(`durchstoßen von ${bohr.join(', ')}`)
  return 'Das Gelände geht als geschlossener Erdkörper an den Vernetzer'
    + (grund.length ? ` — ${grund.join(' · ')}` : ' (automatisch)')
})

onMounted(() => { store.ladeRezepte(); store.ladeImporte() })

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
// Wurzel 2 GEOMETRIE = was im Modell liegt; Wurzel 3 WIRKUNG = was das
// Modell damit tut. Herkunft ist ein BADGE am Objekt, keine eigene Liste
// mehr — jedes Objekt steht genau einmal im Baum.
const ABSCHNITTE = [
  { id: 'geometrie', label: 'Geometrie',
    gruppen: ['domain', 'terrain', 'kante', 'structure',
      'section', 'gauge'] },
  { id: 'wirkung', label: 'Wirkung',
    gruppen: ['terrain_op', 'vorfuellung', 'boundary', 'refinement',
      'target'] },
]

const gruppenNachKind = computed(() => {
  const s = store.spec
  if (!s) return {}
  // Rezeptteile stehen als Bauwerks-Box in der structure-Gruppe
  const ohneGruppe = (liste) => (liste ?? []).filter((o) => !o.gruppe)
  return {
    domain: { kind: 'domain', label: 'Modellgebiet',
      items: s.domain ? [{ id: 'domain', type: 'domain' }] : [] },
    terrain: { kind: 'terrain', label: 'Gelände',
      items: s.terrain ? [{ id: 'gelaende', type: 'terrain' }] : [] },
    kante: { kind: 'kante', label: 'Vermessungskanten',
      verknuepfen: true, items: s.terrain?.kanten ?? [] },
    structure: { kind: 'structure', label: 'Bauwerke',
      items: ohneGruppe(s.structures) },
    section: { kind: 'section', label: 'Querschnitte',
      items: ohneGruppe(s.evaluation?.sections) },
    gauge: { kind: 'gauge', label: 'Pegelpunkte',
      items: ohneGruppe(s.evaluation?.gauges) },
    terrain_op: { kind: 'terrain_op', label: 'Geländeoperationen',
      wirkung: true, items: s.terrain?.operations ?? [] },
    vorfuellung: { kind: 'vorfuellung',
      label: 'Anfangszustand (Vorfüllung)', wirkung: true,
      items: ohneGruppe(s.solver?.vorfuellungen) },
    boundary: { kind: 'boundary', label: 'Randbedingungen',
      wirkung: true, items: ohneGruppe(s.boundaries) },
    refinement: { kind: 'refinement', label: 'Netzverfeinerungen',
      wirkung: true, items: ohneGruppe(s.mesh?.refinements) },
    target: { kind: 'target', label: 'Nachweiskriterien',
      wirkung: true, items: ohneGruppe(s.evaluation?.targets) },
  }
})

const abschnitte = computed(() => {
  const g = gruppenNachKind.value
  // Gruppen MIT Katalogvorlagen bleiben auch leer sichtbar — ihr
  // ＋-Knopf ist der direkte Anlegeweg (z. B. „+ Randbedingung" bei
  // null Rändern). Ohne Vorlagen (Kanten) verschwindet die leere Gruppe.
  const sichtbar = (gr) => gr && (gr.items.length
    || TEMPLATES[gr.kind] !== undefined
    || (gr.kind === 'structure' && rezeptGruppen.value.length))
  return ABSCHNITTE
    .map((a) => ({ ...a, gruppen: a.gruppen.map((k) => g[k]).filter(sichtbar) }))
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
function innenBelegen(obj) {
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
    if (obj.type === 'aussenkante') innenBelegen(obj)
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
.f3d-objplus {
  border: none;
  background: none;
  color: var(--f3d-accent, #4d9fff);
  cursor: pointer;
  font-size: 0.95rem;
  line-height: 1;
  padding: 0 0.3rem;
}
.f3d-objplus:hover { filter: brightness(1.3); }
.f3d-plusmenu {
  display: flex;
  flex-direction: column;
  margin: 0 0 0.25rem 1.1rem;
  border-left: 2px solid var(--f3d-accent, #4d9fff);
}
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
.f3d-objrow { display: flex; align-items: stretch; gap: 2px; }
.f3d-objrow .f3d-objitem { flex: 1; }
.f3d-objloesch {
  background: none;
  border: none;
  color: var(--f3d-text-2);
  cursor: pointer;
  padding: 0 6px;
  border-radius: 6px;
  opacity: 0;
  font-size: 0.75rem;
}
.f3d-objrow:hover .f3d-objloesch { opacity: 1; }
.f3d-objloesch:hover { color: var(--f3d-bad); background: rgba(255,255,255,0.05); }
.f3d-gruppenteil { margin-left: 14px; }
.f3d-kandidat { border-top: 1px dashed var(--f3d-border); padding-top: 4px; margin-top: 4px; }
.f3d-kandidat-kopf { cursor: default; }
.f3d-kandidat-kopf .f3d-objname { font-weight: 600; }
.f3d-verweis {
  display: block;
  background: none;
  border: none;
  color: var(--f3d-text-2);
  font-size: 0.72rem;
  cursor: pointer;
  padding: 1px 6px;
  text-align: left;
}
.f3d-verweis:hover { color: var(--f3d-accent); }
.f3d-zeichnung > summary { cursor: pointer; list-style: none; }
.f3d-zeichnung > summary::-webkit-details-marker { display: none; }
.f3d-objimport { width: 100%; margin-bottom: 4px; }
</style>
