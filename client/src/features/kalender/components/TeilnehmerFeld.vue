<template>
  <div class="kal-feld">
    <span>Teilnehmer</span>
    <div class="kal-chips" @click="feld?.focus()">
      <span v-for="(t, i) in modelValue" :key="t.email" class="kal-chip-person" :title="t.email">
        <StatusBadge v-if="t.status && t.status !== 'NEEDS-ACTION'" :status="t.status"><span /></StatusBadge>
        {{ t.name || t.email }}
        <button type="button" title="Entfernen" @click.stop="entferne(i)"><KalenderIcon name="schliessen" :size="12" /></button>
      </span>
      <input
        ref="feld"
        v-model="eingabe"
        type="text"
        placeholder="E-Mail eingeben, Enter oder Komma"
        autocomplete="off"
        @keydown.enter.prevent="uebernehmen"
        @keydown.,.prevent="uebernehmen"
        @keydown.backspace="beiBackspace"
        @blur="uebernehmen"
      >
    </div>
    <p v-if="fehler" class="kal-fehler">{{ fehler }}</p>
    <div v-if="offeneVorschlaege.length" class="kal-vorschlaege">
      <button v-for="v in offeneVorschlaege" :key="v.email" type="button" @click="hinzu(v)">+ {{ v.name || v.email }}</button>
    </div>
  </div>
</template>

<script setup>
// TeilnehmerFeld — Chips aus Freitext (E-Mail, optional "Name <mail>"), Vorschläge aus Projekt-Beteiligten.
import { computed, ref } from 'vue'
import KalenderIcon from './KalenderIcon.vue'
import StatusBadge from './StatusBadge.vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  vorschlaege: { type: Array, default: () => [] },   // [{email, name}]
})
const emit = defineEmits(['update:modelValue'])

const eingabe = ref('')
const fehler = ref('')
const feld = ref(null)
const RE = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/

const offeneVorschlaege = computed(() => {
  const drin = new Set(props.modelValue.map(t => t.email))
  return props.vorschlaege.filter(v => v.email && !drin.has(v.email.toLowerCase()))
})

function parse(roh) {
  const s = roh.trim().replace(/[;,]+$/, '').trim()
  if (!s) return null
  const m = s.match(/^"?([^"<]*?)"?\s*<([^>]+)>$/)
  const email = (m ? m[2] : s).trim().toLowerCase()
  const name = m ? m[1].trim() : ''
  if (!RE.test(email)) return { fehler: `„${email}" ist keine gültige Adresse.` }
  return { email, name }
}

function hinzu(t) {
  const email = String(t.email || '').toLowerCase()
  if (!email || props.modelValue.some(x => x.email === email)) return
  emit('update:modelValue', [...props.modelValue, { email, name: t.name || '', rolle: 'REQ-PARTICIPANT' }])
}

function uebernehmen() {
  fehler.value = ''
  if (!eingabe.value.trim()) return
  for (const teil of eingabe.value.split(/[;,]/)) {
    if (!teil.trim()) continue
    const p = parse(teil)
    if (!p) continue
    if (p.fehler) { fehler.value = p.fehler; return }
    hinzu(p)
  }
  eingabe.value = ''
}

function entferne(i) {
  emit('update:modelValue', props.modelValue.filter((_, j) => j !== i))
}

function beiBackspace() {
  if (!eingabe.value && props.modelValue.length) entferne(props.modelValue.length - 1)
}
</script>
