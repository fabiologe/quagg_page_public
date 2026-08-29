<template>
  <div class="mail-termin" :class="`ist-${art}`">
    <div class="mail-termin-kopf">
      <MailIcon name="zeit" :size="18" />
      <strong>{{ ueberschrift }}</strong>
      <span v-if="ical.wiederholend" class="mail-badge ist-warn" title="Wiederholende Termine werden nur angezeigt, nicht übernommen">Serie</span>
    </div>

    <dl class="mail-termin-daten">
      <dt>Titel</dt><dd>{{ ical.summary || '(ohne Titel)' }}</dd>
      <dt>Wann</dt><dd>{{ spanne }}</dd>
      <template v-if="ical.ort"><dt>Wo</dt><dd>{{ ical.ort }}</dd></template>
      <template v-if="ical.organizer?.email"><dt>Organisator</dt><dd>{{ ical.organizer.name ? `${ical.organizer.name} <${ical.organizer.email}>` : ical.organizer.email }}</dd></template>
      <template v-if="ical.attendees?.length"><dt>Teilnehmer</dt>
        <dd class="mail-termin-teilnehmer">
          <span v-for="a in ical.attendees" :key="a.email" class="mail-badge" :class="badgeKlasse(a.partstat)" :title="a.email">
            {{ a.name || a.email }} · {{ STATUS_LABEL[a.partstat] || a.partstat }}
          </span>
        </dd>
      </template>
      <template v-if="ical.kommentar"><dt>Kommentar</dt><dd>{{ ical.kommentar }}</dd></template>
    </dl>

    <template v-if="art === 'einladung'">
      <div v-if="ical.antwort" class="mail-hinweis ist-ok">
        <MailIcon name="ok" :size="16" />
        <span>{{ ANTWORT_TEXT[ical.antwort.status] }} am {{ formatDatumLang(ical.antwort.am) }}<span v-if="ical.antwort.termin_id"> · im Kalender übernommen</span></span>
      </div>
      <div v-else-if="store.darfBearbeiten" class="mail-termin-aktionen">
        <label class="mail-termin-check"><input v-model="uebernehmen" type="checkbox"> in unseren Kalender übernehmen</label>
        <input v-model="kommentar" class="mail-eingabe" type="text" placeholder="Kommentar an den Organisator (optional)">
        <div class="mail-termin-knoepfe">
          <button class="mail-btn ist-primaer" :disabled="laeuft" @click="antworte('ACCEPTED')"><MailIcon name="ok" :size="16" /> Zusagen</button>
          <button class="mail-btn ist-umrandet" :disabled="laeuft" @click="antworte('TENTATIVE')">Vielleicht</button>
          <button class="mail-btn ist-umrandet ist-gefaehrlich" :disabled="laeuft" @click="antworte('DECLINED')"><MailIcon name="schliessen" :size="16" /> Absagen</button>
        </div>
        <div v-if="fehler" class="mail-hinweis ist-fehler"><MailIcon name="warnung" :size="16" /><span>{{ fehler }}</span></div>
      </div>
    </template>
  </div>
</template>

<script setup>
/**
 * MailTerminKarte — Kalenderteil einer Mail (iMIP) als Kärtchen: fremde
 * Einladung mit Zusagen/Vielleicht/Absagen, Antwort eines Teilnehmers,
 * Absage, oder unsere eigene versendete Einladung.
 */
import { computed, ref, watch } from 'vue'
import MailIcon from './MailIcon.vue'
import { useMailStore } from '../stores/useMailStore'
import { fehlerText } from '../services/mailApi'
import { formatDatumLang } from '../services/MailText'
import { formatSpanne, STATUS_LABEL } from '@/features/kalender/services/KalenderZeit'

const ANTWORT_TEXT = { ACCEPTED: 'Zugesagt', DECLINED: 'Abgesagt', TENTATIVE: 'Unter Vorbehalt zugesagt' }

const props = defineProps({ mail: { type: Object, required: true } })
const store = useMailStore()

const ical = computed(() => props.mail.ical || {})
const art = computed(() => {
  const m = (ical.value.methode || '').toUpperCase()
  const eigene = (store.konto || '').toLowerCase()
  const org = (ical.value.organizer?.email || '').toLowerCase()
  if (m === 'REQUEST') return org && org !== eigene && props.mail.folder !== 'sent' ? 'einladung' : 'eigene'
  if (m === 'REPLY') return 'antwort'
  if (m === 'COUNTER') return 'gegenvorschlag'
  if (m === 'CANCEL') return 'absage'
  return 'sonstiges'
})

const ueberschrift = computed(() => {
  const a = art.value
  if (a === 'einladung') return 'Einladung'
  if (a === 'eigene') return 'Unsere Einladung'
  if (a === 'absage') return 'Termin abgesagt'
  if (a === 'gegenvorschlag') return 'Gegenvorschlag'
  if (a === 'antwort') {
    const t = ical.value.attendees?.[0]
    const wer = t?.name || t?.email || 'Teilnehmer'
    const was = { ACCEPTED: 'hat zugesagt', DECLINED: 'hat abgesagt', TENTATIVE: 'hat unter Vorbehalt zugesagt' }[t?.partstat] || 'hat geantwortet'
    return `${wer} ${was}`
  }
  return 'Kalendereintrag'
})

const spanne = computed(() => formatSpanne({ ganztag: ical.value.ganztag, beginn: ical.value.beginn, ende: ical.value.ende }))

const uebernehmen = ref(true)
const kommentar = ref('')
const laeuft = ref(false)
const fehler = ref('')
watch(() => props.mail.id, () => { kommentar.value = ''; fehler.value = '' })

function badgeKlasse(partstat) {
  return { ACCEPTED: 'ist-ok', DECLINED: 'ist-fehler-badge', TENTATIVE: 'ist-warn' }[partstat] || ''
}

async function antworte(status) {
  laeuft.value = true
  fehler.value = ''
  try {
    await store.beantworteEinladung(props.mail.id, { status, kommentar: kommentar.value, uebernehmen: uebernehmen.value })
  } catch (err) {
    fehler.value = fehlerText(err, 'Antwort konnte nicht gesendet werden.')
  } finally {
    laeuft.value = false
  }
}
</script>

<style scoped>
.mail-termin {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--mail-rand-stark);
  border-left: 4px solid var(--mail-akzent);
  border-radius: var(--mail-radius-klein);
  background: var(--mail-papier);
  user-select: text;
}
.mail-termin.ist-absage { border-left-color: var(--mail-fehler); }
.mail-termin.ist-antwort, .mail-termin.ist-gegenvorschlag { border-left-color: var(--mail-ok); }
.mail-termin-kopf { display: flex; align-items: center; gap: 8px; }
.mail-termin-daten { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 0; font-size: 13px; }
.mail-termin-daten dt { color: var(--mail-text-dim); }
.mail-termin-daten dd { margin: 0; overflow-wrap: anywhere; }
.mail-termin-teilnehmer { display: flex; flex-wrap: wrap; gap: 4px; }
.mail-badge.ist-fehler-badge { background: var(--mail-fehler-weich); color: var(--mail-fehler); }
.mail-termin-aktionen { display: flex; flex-direction: column; gap: 6px; }
.mail-termin-check { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.mail-termin-knoepfe { display: flex; gap: 6px; flex-wrap: wrap; }
</style>
