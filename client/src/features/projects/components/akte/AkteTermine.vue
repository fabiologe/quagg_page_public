<template>
  <ProjektKarte titel="Termine" icon="termin">
    <template #aktionen>
      <button type="button" class="prj-knopf prj-knopf-klein" title="Zu-/Absagen aus dem Postfach verbuchen" @click="abholen">
        <ProjektIcon name="aktualisieren" :size="13" /> Antworten abholen
      </button>
      <button v-if="darfSchreiben" type="button" class="prj-knopf prj-knopf-primaer prj-knopf-klein" @click="dialog = { termin: null }">
        <ProjektIcon name="plus" :size="13" /> Neuer Termin
      </button>
    </template>

    <p v-if="hinweis" class="prj-hinweis">{{ hinweis }}</p>
    <LeerHinweis v-if="!termine.length" text="Noch keine Termine — Fristen stehen in der Übersicht." />
    <ul v-else class="prj-liste">
      <li v-for="t in termine" :key="t.id" :class="{ 'prj-erledigt': t.status === 'abgesagt' }">
        <span class="prj-titel">
          {{ t.titel }}
          <small v-if="t.status === 'abgesagt'"> · abgesagt</small>
          <small v-else-if="t.einladung_offen"> · Änderung nicht versendet</small>
          <small v-else-if="t.eingeladen_am"> · eingeladen</small>
        </span>
        <span class="prj-datum">{{ formatSpanne(t) }}</span>
        <span class="akte-termin-status">
          <StatusBadge v-for="p in (t.teilnehmer || [])" :key="p.email" :status="p.status" :titel="p.email">{{ p.name || p.email.split('@')[0] }}</StatusBadge>
        </span>
        <button v-if="darfSchreiben" type="button" class="prj-knopf prj-knopf-klein" title="Bearbeiten" @click="dialog = { termin: t }">
          <ProjektIcon name="bearbeiten" :size="13" />
        </button>
      </li>
    </ul>

    <TerminDialog
      v-if="dialog"
      :termin="dialog.termin"
      :vorgabe="{ projekt_id: akte.id }"
      :projekt-fest="true"
      :vorschlaege="vorschlaege"
      :laeuft="laeuft"
      :fehler="fehler"
      @schliessen="dialog = null"
      @speichern="speichern"
      @entfernen="entfernen"
    />
  </ProjektKarte>
</template>

<script setup>
// AkteTermine — Termine mit Uhrzeit und Teilnehmern je Projekt; Fristen (Meilensteine) bleiben in der Übersicht.
import { computed, ref } from 'vue'
import LeerHinweis from '../ui/LeerHinweis.vue'
import ProjektIcon from '../ui/ProjektIcon.vue'
import ProjektKarte from '../ui/ProjektKarte.vue'
import StatusBadge from '@/features/kalender/components/StatusBadge.vue'
import TerminDialog from '@/features/kalender/components/TerminDialog.vue'
import '@/features/kalender/styles/theme.css'
import { formatSpanne } from '@/features/kalender/services/KalenderZeit'
import { kalenderApi } from '@/features/kalender/services/kalenderApi'
import { useAuthStore } from '@/stores/useAuthStore'
import { useProjekteStore } from '../../stores/useProjekteStore'

const props = defineProps({ akte: { type: Object, required: true } })
const store = useProjekteStore()
const auth = useAuthStore()
const dialog = ref(null)
const laeuft = ref(false)
const fehler = ref('')
const hinweis = ref('')

const darfSchreiben = computed(() => auth.hatMindestens('MITARBEITER'))
const termine = computed(() => props.akte.termine || [])

// Beteiligte mit E-Mail im Kontaktfeld als Teilnehmer-Vorschläge
const vorschlaege = computed(() => (props.akte.beteiligte || []).flatMap(b => {
  const m = String(b.kontakt || '').match(/[^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+/)
  return m ? [{ email: m[0].toLowerCase(), name: b.name || '' }] : []
}))

async function speichern({ felder, einladen, termin }) {
  laeuft.value = true
  fehler.value = ''
  const ok = termin
    ? await store.terminAendern(props.akte.id, termin.id, felder) && (!einladen || await store.terminEinladen(props.akte.id, termin.id, {}))
    : await store.terminAnlegen(props.akte.id, einladen ? { ...felder, einladung: {} } : felder)
  laeuft.value = false
  if (ok) dialog.value = null
  else fehler.value = store.fehler || 'Speichern fehlgeschlagen.'
}

async function entfernen(termin) {
  laeuft.value = true
  const ok = await store.terminEntfernen(props.akte.id, termin.id)
  laeuft.value = false
  if (ok) dialog.value = null
  else fehler.value = store.fehler || 'Entfernen fehlgeschlagen.'
}

async function abholen() {
  hinweis.value = ''
  try {
    const z = await kalenderApi.antwortenVerarbeiten()
    hinweis.value = z.uebernommen ? `${z.uebernommen} Antwort(en) verbucht.` : 'Keine neuen Antworten.'
    await store.ladeAkte(props.akte.id)
  } catch {
    hinweis.value = 'Antworten konnten nicht abgeholt werden.'
  }
}
</script>

<style scoped>
.akte-termin-status { display: inline-flex; flex-wrap: wrap; gap: .3rem; }
.prj-hinweis { margin: 0 0 .5rem; font-size: .9rem; opacity: .8; }
</style>
