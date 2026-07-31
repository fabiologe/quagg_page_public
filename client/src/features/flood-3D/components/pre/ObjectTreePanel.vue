<template>
  <aside class="f3d-objtree">
    <button class="f3d-btn f3d-objimport" @click="showImport = true">
      ⬇ Geometrie importieren (DXF/STL)
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
    </div>
  </aside>
</template>

<script setup>
// Objektbaum (Spez. Kap. 6.1): alle Objekte mit Typ und Validierungsstatus,
// Klick springt zum Objekt; "Neu anlegen" fügt Katalog-Vorlagen ein.
import { computed, reactive, ref } from 'vue'
import { usePreStore } from '../../stores/usePreStore'
import { TYPE_LABELS, TEMPLATES } from '../../utils/preTemplates'
import ImportModal from './ImportModal.vue'

const store = usePreStore()
const addChoice = reactive({})
const showImport = ref(false)

const groups = computed(() => {
  const s = store.spec
  if (!s) return []
  return [
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

function add(group) {
  const tpl = group.templates[addChoice[group.kind]]
  if (tpl) store.addObject(group.kind, JSON.parse(JSON.stringify(tpl)))
  addChoice[group.kind] = ''
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
