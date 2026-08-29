<template>
  <div class="kal-liste">
    <p v-if="!gruppen.length" class="kal-hinweis">Keine Termine im Zeitraum.</p>
    <section v-for="g in gruppen" :key="g.schluessel" class="kal-liste-tag" :class="{ 'ist-heute': istHeute(g.tag) }">
      <h3>{{ formatDatumKurz(g.tag) }}{{ istHeute(g.tag) ? ' · heute' : '' }}</h3>
      <div v-for="m in g.meilensteine" :key="`m${m.id}`" class="kal-liste-eintrag" @click="$emit('meilenstein', m)">
        <span class="kal-liste-zeit">Frist</span>
        <span><span class="kal-liste-titel">◆ {{ m.bezeichnung || m.art }}</span><br><span class="kal-liste-meta">{{ m.projekt_name }}</span></span>
        <span />
      </div>
      <div
        v-for="t in g.termine"
        :key="t.id"
        class="kal-liste-eintrag"
        :class="{ 'ist-abgesagt': t.status === 'abgesagt' }"
        @click="$emit('termin', t)"
      >
        <span class="kal-liste-zeit">{{ t.ganztag ? 'ganztägig' : `${formatUhr(t.beginn)}–${formatUhr(t.ende)}` }}</span>
        <span>
          <span class="kal-liste-titel">{{ t.titel }}</span>
          <span v-if="t.quelle === 'einladung'" class="kal-badge ist-warn">Einladung</span>
          <br>
          <span class="kal-liste-meta">{{ [t.ort, t.projekt_name].filter(Boolean).join(' · ') }}</span>
        </span>
        <span class="kal-status">
          <StatusBadge v-for="p in (t.teilnehmer || []).slice(0, 4)" :key="p.email" :status="p.status" :titel="p.email">
            {{ p.name || p.email.split('@')[0] }}
          </StatusBadge>
          <span v-if="(t.teilnehmer || []).length > 4" class="kal-badge">+{{ t.teilnehmer.length - 4 }}</span>
        </span>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import StatusBadge from './StatusBadge.vue'
import { formatDatumKurz, formatUhr, istHeute, meilensteineJeTag, parseIso, tagSchluessel, termineJeTag } from '../services/KalenderZeit'

const props = defineProps({
  von: { type: Date, required: true },
  bis: { type: Date, required: true },
  termine: { type: Array, default: () => [] },
  meilensteine: { type: Array, default: () => [] },
})
defineEmits(['termin', 'meilenstein'])

const gruppen = computed(() => {
  const t = termineJeTag(props.termine, props.von, props.bis)
  const m = meilensteineJeTag(props.meilensteine)
  const schluessel = new Set([...t.keys(), ...m.keys()])
  return [...schluessel].sort().map(k => ({
    schluessel: k,
    tag: parseIso(k),
    termine: t.get(k) || [],
    meilensteine: (m.get(k) || []),
  })).filter(g => tagSchluessel(g.tag) >= tagSchluessel(props.von) && tagSchluessel(g.tag) < tagSchluessel(props.bis))
})
</script>
