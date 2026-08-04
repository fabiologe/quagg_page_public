<template>
  <aside class="f3d-objtree">
    <button class="f3d-btn f3d-objimport" @click="showImport = true">
      ⬇ Geometrie importieren (DXF/STL/Raster)
    </button>
    <ImportModal v-if="showImport" @close="showImport = false" />

    <div v-for="group in groups" :key="group.kind" class="f3d-objgroup">
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
        <span class="f3d-muted f3d-small">{{ typeLabel(item) }}</span>
      </button>
      <div class="f3d-objadd" v-if="group.templates">
        <select v-model="addChoice[group.kind]" class="f3d-select f3d-grow">
          <option disabled value="">Neu anlegen …</option>
          <option v-for="(tpl, name) in group.templates" :key="name" :value="name">
            {{ name }}
          </option>
        </select>
        <button class="f3d-btn" :disabled="!addChoice[group.kind]"
                @click="add(group)">+</button>
      </div>
      <p v-if="hinweis.kind === group.kind" class="f3d-objhinweis">
        {{ hinweis.text }}
      </p>
    </div>
  </aside>
</template>

<script setup>
// Objektbaum (Spez. Kap. 6.1): alle Objekte mit Typ und Validierungsstatus,
// Klick springt zum Objekt; "Neu anlegen" fügt Katalog-Vorlagen ein.
import { computed, reactive, ref } from 'vue'
import { usePreStore } from '../../stores/usePreStore'
import {
  TYPE_LABELS, TEMPLATES, vorlageAnpassen,
} from '../../utils/preTemplates'
import {
  REFERENZ_QUELLEN, fehlendeBausteine, referenzListe,
} from '../../utils/feldTypen'
import ImportModal from './ImportModal.vue'

// Höhe des Geländerasters an einer Stelle (bilinear, wie im Editor) — die
// Außenkante startet mit dem, was heute dort steht
function gelaendeZ(t, x, y) {
  if (!t) return 0
  const [ny, nx] = t.dims
  const fx = Math.min(nx - 1.001, Math.max(0, (x - t.x0) / t.resolution))
  const fy = Math.min(ny - 1.001, Math.max(0, (y - t.y0) / t.resolution))
  const i = Math.floor(fx); const j = Math.floor(fy)
  const dx = fx - i; const dy = fy - j
  const z = t.z
  return z[j * nx + i] * (1 - dx) * (1 - dy) + z[j * nx + i + 1] * dx * (1 - dy)
    + z[(j + 1) * nx + i] * (1 - dx) * dy + z[(j + 1) * nx + i + 1] * dx * dy
}

const store = usePreStore()
const addChoice = reactive({})
// Hinweis gehört zu genau der Gruppe, in der er ausgelöst wurde
const hinweis = ref({ kind: '', text: '' })
const showImport = ref(false)

const groups = computed(() => {
  const s = store.spec
  if (!s) return []
  return [
    // Das Modellgebiet steht bewusst ganz oben: es ist das Objekt, das man
    // am häufigsten zurechtrückt, und war bisher nur über Zahlen erreichbar.
    { kind: 'domain', label: 'Modellgebiet',
      items: s.domain ? [{ id: 'domain', type: 'domain' }] : [] },
    { kind: 'terrain_op', label: 'Geländeoperationen',
      items: s.terrain?.operations ?? [], templates: TEMPLATES.terrain_op },
    { kind: 'structure', label: 'Bauwerke',
      items: s.structures ?? [], templates: TEMPLATES.structure },
    { kind: 'refinement', label: 'Netzverfeinerungen',
      items: s.mesh?.refinements ?? [], templates: TEMPLATES.refinement },
    { kind: 'boundary', label: 'Randbedingungen',
      items: s.boundaries ?? [], templates: TEMPLATES.boundary },
    { kind: 'section', label: 'Querschnitte',
      items: s.evaluation?.sections ?? [], templates: TEMPLATES.section },
    { kind: 'gauge', label: 'Pegelpunkte',
      items: s.evaluation?.gauges ?? [], templates: TEMPLATES.gauge },
    { kind: 'target', label: 'Nachweiskriterien',
      items: s.evaluation?.targets ?? [], templates: TEMPLATES.target },
  ]
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

function add(group) {
  const tpl = group.templates[addChoice[group.kind]]
  if (tpl) {
    const obj = JSON.parse(JSON.stringify(tpl))
    // Die Außenkante ist nur als Rahmen AM Gebietsrand sinnvoll: vier Ecken
    // mit der Höhe, die das Gelände dort heute hat — von da aus stellt der
    // Bearbeiter sie ein.
    if (obj.type === 'aussenkante') randRahmen(obj)
    // Vorlagen sind im Bezugsraum notiert (Gelände 95 m, Grundriss um 20 m).
    // Ohne Umrechnung landet jede Vorlage in einem importierten Fall weit
    // neben oder unter dem Gelände.
    else vorlageAnpassen(obj, store.spec, (x, y) => gelaendeZ(store.terrain, x, y))
    if (obj.kind) {
      const fehlt = fehlendeBausteine(store.spec, obj.kind)
      if (fehlt.length) {
        // Ohne Bezugsobjekt wäre das Kriterium nicht speicherbar — sagen,
        // was fehlt, statt einen kaputten Eintrag anzulegen
        hinweis.value = {
          kind: group.kind,
          text: `„${addChoice[group.kind]}" braucht zuerst: ${fehlt.join(', ')}`,
        }
        setTimeout(() => { hinweis.value = { kind: '', text: '' } }, 8000)
        addChoice[group.kind] = ''
        return
      }
      verweiseFuellen(obj)
    }
    store.addObject(group.kind, obj)
  }
  addChoice[group.kind] = ''
}
</script>

<style scoped>
.f3d-objhinweis {
  margin: 2px 0 0;
  color: #e8b24a;
  font-size: 0.7rem;
  line-height: 1.3;
}
.f3d-objtree {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding: 12px;
}
.f3d-objgroup {
  background: var(--f3d-surface);
  border: 1px solid var(--f3d-border);
  border-radius: 8px;
  padding: 8px;
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
.f3d-objstatus.sev-warnung { color: #c98500; }
.f3d-objstatus.sev-hinweis { color: var(--f3d-accent); }
.f3d-objadd { display: flex; gap: 6px; margin-top: 6px; }
.f3d-objimport { width: 100%; margin-bottom: 4px; }
</style>
