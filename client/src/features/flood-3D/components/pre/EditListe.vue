<template>
  <div class="f3d-edits">
    <div v-for="(e, i) in liste" :key="e.id ?? i" class="f3d-edit">
      <div class="f3d-edit-kopf">
        <button class="f3d-edit-auf" :title="offen === i ? 'zuklappen' : 'aufklappen'"
                @click="offen = offen === i ? -1 : i">
          {{ offen === i ? '▾' : '▸' }}
        </button>
        <span class="f3d-edit-nr">{{ i + 1 }}</span>
        <span class="f3d-edit-name">{{ e.id }}</span>
        <span class="f3d-muted f3d-small">{{ EDIT_LABELS[e.type] ?? e.type }}</span>
        <button class="f3d-edit-btn" :disabled="i === 0" title="nach oben"
                @click="schieben(i, -1)">↑</button>
        <button class="f3d-edit-btn" :disabled="i === liste.length - 1"
                title="nach unten" @click="schieben(i, 1)">↓</button>
        <button class="f3d-edit-btn f3d-edit-weg" title="entfernen"
                @click="entfernen(i)">✕</button>
      </div>
      <UnterGruppe v-if="offen === i" :model-value="e"
                   :labels="{ ...labels, ...(typLabels[e.type] ?? {}) }"
                   :typ="e.type" :gruppe="e.type" :verbergen="['id', 'type']"
                   @update:model-value="(v) => ersetzen(i, v)" />
    </div>
    <p v-if="!liste.length" class="f3d-muted f3d-small">
      keine Bearbeitungen — mit den Knöpfen darunter anlegen
    </p>
  </div>
</template>

<script setup>
// Bearbeitungsstapel eines Bauwerks als Liste statt als JSON-Text. Die
// Reihenfolge zählt (erst zuschneiden, dann bohren, dann heilen) — deshalb
// braucht die Liste ↑/↓ und nicht nur Anlegen und Löschen. Genau das war
// vorher nur über das Textfeld möglich.
import { computed, ref } from 'vue'
import UnterGruppe from './UnterGruppe.vue'

const EDIT_LABELS = {
  aussparung: 'Aussparung', schnitt: 'Zuschnitt (abschneiden)', gelaende: 'Gelände',
  auf_gebiet: 'Auf Gebiet', transform: 'Lage', heilen: 'Heilen',
}

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  labels: { type: Object, default: () => ({}) },
  // Beschriftungen, die nur für EINE Bearbeitungsart gelten: `radius` ist
  // bei der Aussparung die Eckenausrundung, anderswo eine Ausdehnung im
  // Grundriss. In eine gemeinsame Tabelle geschrieben überschreibt der
  // zweite Eintrag still den ersten.
  typLabels: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['update:modelValue'])

const offen = ref(-1)
const liste = computed(() => props.modelValue ?? [])

function schreiben(neu) {
  emit('update:modelValue', neu)
}

function ersetzen(i, wert) {
  const neu = [...props.modelValue]
  neu[i] = wert
  schreiben(neu)
}

function entfernen(i) {
  if (offen.value === i) offen.value = -1
  schreiben(props.modelValue.filter((_, k) => k !== i))
}

function schieben(i, d) {
  const neu = [...props.modelValue]
  const [x] = neu.splice(i, 1)
  neu.splice(i + d, 0, x)
  offen.value = offen.value === i ? i + d : offen.value
  schreiben(neu)
}
</script>

<style scoped>
.f3d-edits { display: flex; flex-direction: column; gap: 4px; }
.f3d-edit {
  border: 1px solid var(--f3d-border);
  border-radius: 3px;
  padding: 3px 4px;
}
.f3d-edit-kopf { display: flex; align-items: center; gap: 5px; }
.f3d-edit-nr {
  color: var(--f3d-text-2);
  font-size: 0.62rem;
  min-width: 12px;
}
.f3d-edit-name {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.72rem;
}
.f3d-edit-auf,
.f3d-edit-btn {
  background: none;
  border: none;
  color: var(--f3d-text-2);
  cursor: pointer;
  font-size: 0.72rem;
  line-height: 1;
  padding: 2px 3px;
}
.f3d-edit-btn:disabled { opacity: 0.3; cursor: default; }
.f3d-edit-btn:not(:disabled):hover { color: var(--f3d-text); }
.f3d-edit-weg:hover { color: var(--f3d-bad); }
</style>
