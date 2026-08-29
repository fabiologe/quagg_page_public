<template>
  <Teleport to="body">
    <div class="kal-dialog-hintergrund" @pointerdown.self="$emit('schliessen')">
      <div class="kal-dialog">
        <header class="kal-dialog-kopf">
          <KalenderIcon name="feed" :size="18" />
          <span>Kalender abonnieren (Outlook, Google, Apple)</span>
          <button class="kal-knopf ist-klein" title="Schließen" @click="$emit('schliessen')"><KalenderIcon name="schliessen" /></button>
        </header>
        <div class="kal-dialog-inhalt">
          <p class="kal-hinweis">
            Der Feed zeigt alle Termine und Fristen dieses Kalenders — schreibgeschützt, ohne Teilnehmerlisten.
            Wer den Link hat, kann den Kalender lesen. Deshalb: nicht weitergeben, bei Verdacht „Neu erzeugen".
          </p>
          <template v-if="feed?.url">
            <div class="kal-feld"><span>Link (einmalig sichtbar — jetzt kopieren)</span>
              <div class="kal-feed-url">{{ feed.url }}</div>
            </div>
            <div class="kal-zeile">
              <button class="kal-knopf" @click="kopiere(feed.url)"><KalenderIcon name="kopieren" /> https-Link kopieren</button>
              <button class="kal-knopf" @click="kopiere(feed.webcal)"><KalenderIcon name="kopieren" /> webcal-Link kopieren</button>
            </div>
            <p v-if="kopiert" class="kal-hinweis">Kopiert.</p>
          </template>
          <template v-else-if="feed?.aktiv">
            <p>Ein Feed-Link ist aktiv (erzeugt {{ formatDatum(feed.erstellt_am) }}<span v-if="feed.zuletzt_abgerufen_am">, zuletzt abgerufen {{ formatDatum(feed.zuletzt_abgerufen_am) }}</span>).
              Der Link selbst wird nur beim Erzeugen angezeigt — bei Bedarf neu erzeugen.</p>
          </template>
          <p v-else>Noch kein Feed-Link vorhanden.</p>

          <div class="kal-hinweis">
            <strong>Einrichten:</strong> Google Kalender → „Weitere Kalender" → „Per URL" (aktualisiert alle 12–24 h).
            Outlook → „Kalender hinzufügen" → „Aus dem Internet abonnieren" (alle ~3 h).
            Apple Kalender → „Ablage" → „Neues Kalenderabonnement".
          </div>
          <p v-if="fehler" class="kal-fehler">{{ fehler }}</p>
        </div>
        <footer class="kal-dialog-fuss">
          <button v-if="feed?.aktiv" class="kal-knopf ist-gefaehrlich" :disabled="laeuft" @click="widerrufen"><KalenderIcon name="absagen" /> Link ungültig machen</button>
          <span class="kal-platz" />
          <button class="kal-knopf ist-primaer" :disabled="laeuft" @click="neu">
            <KalenderIcon :name="laeuft ? 'laedt' : 'link'" /> {{ feed?.aktiv ? 'Neu erzeugen' : 'Link erzeugen' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import KalenderIcon from './KalenderIcon.vue'
import { useKalenderStore } from '../stores/useKalenderStore'
import { fehlerText } from '../services/kalenderApi'
import { formatDatum } from '../services/KalenderZeit'

defineEmits(['schliessen'])
const store = useKalenderStore()
const feed = computed(() => store.feed)
const laeuft = ref(false)
const fehler = ref('')
const kopiert = ref(false)

onMounted(() => { if (!store.feed) store.feedLaden() })

async function neu() {
  if (store.feed?.aktiv && !window.confirm('Der bisherige Link wird sofort ungültig. Fortfahren?')) return
  laeuft.value = true
  fehler.value = ''
  try { await store.feedNeu() } catch (err) { fehler.value = fehlerText(err, 'Link konnte nicht erzeugt werden.') } finally { laeuft.value = false }
}

async function widerrufen() {
  if (!window.confirm('Alle abonnierten Kalender verlieren den Zugriff. Fortfahren?')) return
  laeuft.value = true
  fehler.value = ''
  try { await store.feedWiderrufen() } catch (err) { fehler.value = fehlerText(err, 'Widerruf fehlgeschlagen.') } finally { laeuft.value = false }
}

async function kopiere(text) {
  try {
    await navigator.clipboard.writeText(text)
    kopiert.value = true
    setTimeout(() => { kopiert.value = false }, 2500)
  } catch {
    fehler.value = 'Zwischenablage nicht verfügbar — bitte den Link markieren und kopieren.'
  }
}
</script>
