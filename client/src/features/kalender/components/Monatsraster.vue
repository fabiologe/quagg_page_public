<template>
  <div class="kal-monat">
    <div v-for="t in TAGE_KURZ" :key="t" class="kal-monat-kopf">{{ t }}</div>
    <div
      v-for="tag in tage"
      :key="tagSchluessel(tag)"
      class="kal-tag"
      :class="{ 'ist-fremd': tag.getMonth() !== monat, 'ist-heute': istHeute(tag) }"
      @click="$emit('tag', tag)"
    >
      <span class="kal-tag-nr">{{ tag.getDate() }}</span>
      <button
        v-for="m in (meilensteineJeTag.get(tagSchluessel(tag)) || [])"
        :key="`m${m.id}`"
        class="kal-chip ist-meilenstein"
        :title="`${m.bezeichnung || m.art} · ${m.projekt_name || ''}`"
        @click.stop="$emit('meilenstein', m)"
      >◆ {{ m.bezeichnung || m.art }}</button>
      <button
        v-for="t in sichtbar(tag)"
        :key="t.id"
        class="kal-chip"
        :class="{ 'ist-ganztag': t.ganztag, 'ist-abgesagt': t.status === 'abgesagt', 'ist-fremd-termin': t.quelle === 'einladung' }"
        :title="`${t.titel} · ${formatSpanne(t)}`"
        @click.stop="$emit('termin', t)"
      >{{ t.ganztag ? '' : formatUhr(t.beginn) + ' ' }}{{ t.titel }}</button>
      <span v-if="rest(tag) > 0" class="kal-mehr">+{{ rest(tag) }} weitere</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { TAGE_KURZ, formatSpanne, formatUhr, istHeute, meilensteineJeTag as gruppiereMeilensteine, monatsraster, tagSchluessel, termineJeTag } from '../services/KalenderZeit'

const props = defineProps({
  anker: { type: Date, required: true },
  termine: { type: Array, default: () => [] },
  meilensteine: { type: Array, default: () => [] },
  maxJeTag: { type: Number, default: 3 },
})
defineEmits(['tag', 'termin', 'meilenstein'])

const monat = computed(() => props.anker.getMonth())
const tage = computed(() => monatsraster(props.anker.getFullYear(), props.anker.getMonth()))
const jeTag = computed(() => termineJeTag(props.termine, tage.value[0], new Date(tage.value[41].getTime() + 86400000)))
const meilensteineJeTag = computed(() => gruppiereMeilensteine(props.meilensteine))

function sichtbar(tag) {
  return (jeTag.value.get(tagSchluessel(tag)) || []).slice(0, props.maxJeTag)
}
function rest(tag) {
  return Math.max(0, (jeTag.value.get(tagSchluessel(tag)) || []).length - props.maxJeTag)
}
</script>
