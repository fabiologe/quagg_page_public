<template>
  <div class="kal-woche" :style="{ '--kal-stunden': STUNDEN, '--kal-stundenhoehe': '3rem' }">
    <div class="kal-woche-kopf" />
    <div v-for="tag in tage" :key="tagSchluessel(tag)" class="kal-woche-kopf" :class="{ 'ist-heute': istHeute(tag) }">
      {{ formatDatumKurz(tag) }}
    </div>

    <div class="kal-woche-ganztag" />
    <div v-for="tag in tage" :key="`g${tagSchluessel(tag)}`" class="kal-woche-ganztag" @click="$emit('tag', tag)">
      <button
        v-for="t in ganztags(tag)"
        :key="t.id"
        class="kal-chip ist-ganztag"
        :class="{ 'ist-abgesagt': t.status === 'abgesagt' }"
        :title="t.titel"
        @click.stop="$emit('termin', t)"
      >{{ t.titel }}</button>
      <button
        v-for="m in (meilensteineJeTag.get(tagSchluessel(tag)) || [])"
        :key="`m${m.id}`"
        class="kal-chip ist-meilenstein"
        :title="m.projekt_name"
        @click.stop="$emit('meilenstein', m)"
      >◆ {{ m.bezeichnung || m.art }}</button>
    </div>

    <div>
      <div v-for="h in stunden" :key="h" class="kal-woche-zeit">{{ String(h).padStart(2, '0') }}:00</div>
    </div>
    <div v-for="tag in tage" :key="`s${tagSchluessel(tag)}`" class="kal-woche-spalte" @click="$emit('tag', tag)">
      <button
        v-for="t in zeitliche(tag)"
        :key="t.id"
        class="kal-woche-termin"
        :class="{ 'ist-abgesagt': t.status === 'abgesagt' }"
        :style="lage(t, tag)"
        :title="`${t.titel} · ${formatSpanne(t)}`"
        @click.stop="$emit('termin', t)"
      ><strong>{{ formatUhr(t.beginn) }}</strong> {{ t.titel }}</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { addTage, formatDatumKurz, formatSpanne, formatUhr, istHeute, meilensteineJeTag as gruppiereMeilensteine, parseIso, tagSchluessel, termineJeTag, wochenTage } from '../services/KalenderZeit'

const START = 6
const ENDE = 21
const STUNDEN = ENDE - START

const props = defineProps({
  anker: { type: Date, required: true },
  termine: { type: Array, default: () => [] },
  meilensteine: { type: Array, default: () => [] },
})
defineEmits(['tag', 'termin', 'meilenstein'])

const tage = computed(() => wochenTage(props.anker))
const stunden = Array.from({ length: STUNDEN }, (_, i) => START + i)
const jeTag = computed(() => termineJeTag(props.termine, tage.value[0], addTage(tage.value[6], 1)))
const meilensteineJeTag = computed(() => gruppiereMeilensteine(props.meilensteine))

const ganztags = tag => (jeTag.value.get(tagSchluessel(tag)) || []).filter(t => t.ganztag)
const zeitliche = tag => (jeTag.value.get(tagSchluessel(tag)) || []).filter(t => !t.ganztag)

/** Position im Stundenraster; Termine über Mitternacht werden am Tag gekappt. */
function lage(t, tag) {
  const b = parseIso(t.beginn)
  const e = parseIso(t.ende)
  const tagStart = tag.getTime()
  const tagEnde = addTage(tag, 1).getTime()
  const von = Math.max(b.getTime(), tagStart)
  const bis = Math.min(e.getTime(), tagEnde)
  const stundeVon = (von - tagStart) / 3600000 - START
  const stundeBis = (bis - tagStart) / 3600000 - START
  const oben = Math.max(0, stundeVon)
  const hoehe = Math.max(0.5, Math.min(STUNDEN, stundeBis) - oben)
  return { top: `calc(${oben} * var(--kal-stundenhoehe))`, height: `calc(${hoehe} * var(--kal-stundenhoehe) - 2px)` }
}
</script>
