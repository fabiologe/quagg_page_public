<template>
  <InternLayout>
    <div class="kal-root">
      <div class="kal-leiste">
        <h1>{{ titel }}</h1>
        <button class="kal-knopf ist-klein" title="Zurück" @click="store.gehe(-1)"><KalenderIcon name="zurueck" /></button>
        <button class="kal-knopf ist-klein" @click="store.heute()">Heute</button>
        <button class="kal-knopf ist-klein" title="Weiter" @click="store.gehe(1)"><KalenderIcon name="weiter" /></button>
        <div class="kal-sichten">
          <button v-for="s in SICHTEN" :key="s" :class="{ 'ist-aktiv': store.sicht === s }" @click="store.setzeSicht(s)">{{ SICHT_LABEL[s] }}</button>
        </div>
        <span class="kal-platz" />
        <button class="kal-knopf ist-klein" title="Zu-/Absagen aus dem Postfach verbuchen" :disabled="store.laedt" @click="store.antwortenAbholen()">
          <KalenderIcon name="aktualisieren" :class="{ 'kal-dreht': store.laedt }" /> Antworten abholen
        </button>
        <button class="kal-knopf ist-klein" title="Kalender in Outlook/Google abonnieren" @click="store.feedDialogOffen = true"><KalenderIcon name="feed" /> Abonnieren</button>
        <button v-if="darfSchreiben" class="kal-knopf ist-primaer" @click="store.oeffneDialog(null)"><KalenderIcon name="plus" /> Neuer Termin</button>
      </div>

      <p v-if="store.fehler" class="kal-fehler">{{ store.fehler }}</p>
      <p v-if="store.sync?.uebernommen" class="kal-hinweis">{{ store.sync.uebernommen }} Antwort(en) verbucht.</p>

      <Monatsraster v-if="store.sicht === 'monat'" :anker="store.anker" :termine="store.termine" :meilensteine="store.meilensteine"
                    @tag="neuAm" @termin="oeffne" @meilenstein="zurAkte" />
      <Wochenansicht v-else-if="store.sicht === 'woche'" :anker="store.anker" :termine="store.termine" :meilensteine="store.meilensteine"
                     @tag="neuAm" @termin="oeffne" @meilenstein="zurAkte" />
      <Terminliste v-else :von="store.bereich.von" :bis="store.bereich.bis" :termine="store.termine" :meilensteine="store.meilensteine"
                   @termin="oeffne" @meilenstein="zurAkte" />

      <TerminDialog
        v-if="store.dialog"
        :termin="store.dialog.termin"
        :vorgabe="store.dialog.vorgabe"
        :projekte="store.projekte"
        :laeuft="aktionLaeuft"
        :fehler="aktionFehler"
        @schliessen="store.schliesseDialog()"
        @speichern="speichern"
        @entfernen="entfernen"
      />
      <FeedLinkDialog v-if="store.feedDialogOffen" @schliessen="store.feedDialogOffen = false" />
    </div>
  </InternLayout>
</template>

<script setup>
/**
 * KalenderView — Monat/Woche/Liste über alle Projekte plus firmenweite Termine.
 * Fristen (Meilensteine) erscheinen als ◆ und führen in die Projektakte.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import InternLayout from '@/components/layout/InternLayout.vue'
import { useAuthStore } from '@/stores/useAuthStore'
import '@/features/projects/styles/theme.css'
import '../styles/theme.css'
import KalenderIcon from '../components/KalenderIcon.vue'
import Monatsraster from '../components/Monatsraster.vue'
import Wochenansicht from '../components/Wochenansicht.vue'
import Terminliste from '../components/Terminliste.vue'
import TerminDialog from '../components/TerminDialog.vue'
import FeedLinkDialog from '../components/FeedLinkDialog.vue'
import { useKalenderStore, SICHTEN } from '../stores/useKalenderStore'
import { fehlerText } from '../services/kalenderApi'
import { monatsTitel, wochenTitel, formatDatum, addTage } from '../services/KalenderZeit'

const SICHT_LABEL = { monat: 'Monat', woche: 'Woche', liste: 'Liste' }

const store = useKalenderStore()
const auth = useAuthStore()
const router = useRouter()
const aktionLaeuft = ref(false)
const aktionFehler = ref('')

const darfSchreiben = computed(() => auth.hatMindestens('MITARBEITER'))
const titel = computed(() => {
  if (store.sicht === 'monat') return monatsTitel(store.anker)
  if (store.sicht === 'woche') return wochenTitel(store.anker)
  return `${formatDatum(store.bereich.von)} – ${formatDatum(addTage(store.bereich.bis, -1))}`
})

onMounted(() => {
  document.title = 'Kalender – Quagg'
  store.lade()
  store.ladeProjekte()
})

function neuAm(tag) {
  if (!darfSchreiben.value) return
  const b = new Date(tag)
  b.setHours(9, 0, 0, 0)
  store.oeffneDialog(null, { beginn: b })
}

function oeffne(termin) {
  store.oeffneDialog(termin)
}

function zurAkte(m) {
  if (m.projekt_id) router.push(`/intern/projects/${m.projekt_id}`)
}

async function speichern({ felder, einladen, termin }) {
  aktionLaeuft.value = true
  aktionFehler.value = ''
  try {
    if (termin) {
      await store.aendern(termin.id, felder)
      if (einladen) await store.einladen(termin.id, {})
    } else {
      await store.anlegen(einladen ? { ...felder, einladung: {} } : felder)
    }
    store.schliesseDialog()
  } catch (err) {
    aktionFehler.value = fehlerText(err, 'Speichern fehlgeschlagen.')
  } finally {
    aktionLaeuft.value = false
  }
}

async function entfernen(termin) {
  aktionLaeuft.value = true
  aktionFehler.value = ''
  try {
    await store.entfernen(termin.id)
    store.schliesseDialog()
  } catch (err) {
    aktionFehler.value = fehlerText(err, 'Entfernen fehlgeschlagen.')
  } finally {
    aktionLaeuft.value = false
  }
}
</script>

<style scoped>
.kal-dreht { animation: kal-drehen 1s linear infinite; }
@keyframes kal-drehen { to { transform: rotate(360deg); } }
</style>
