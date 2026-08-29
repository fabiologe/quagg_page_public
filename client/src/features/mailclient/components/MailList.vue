<template>
  <section class="mail-liste">
    <header class="mail-liste-kopf">
      <h2 class="mail-liste-titel">{{ store.aktiverOrdner.label }}</h2>
      <span class="mail-liste-anzahl">{{ store.total }}</span>
    </header>

    <div class="mail-liste-suche">
      <MailIcon name="suche" :size="16" class="mail-liste-suche-icon" />
      <input
        v-model="suchtext"
        class="mail-eingabe"
        type="search"
        placeholder="Betreff oder Absender suchen"
        aria-label="Mails durchsuchen"
        @input="suchen"
      >
    </div>

    <div v-if="store.ladeStatus === 'fehler'" class="mail-hinweis ist-fehler mail-liste-hinweis">
      <MailIcon name="warnung" :size="16" />
      <span>{{ store.fehler }}</span>
    </div>

    <div ref="scroller" class="mail-liste-scroll" @scroll.passive="beiScroll">
      <MailListItem
        v-for="m in store.mails"
        :key="m.id"
        :mail="m"
        :aktiv="m.id === store.aktiveId"
        @oeffnen="store.oeffneMail"
      />

      <div v-if="store.ladeStatus === 'laedt' && store.mails.length === 0" class="mail-leer">
        <MailIcon name="laedt" :size="22" class="mail-drehend" />
        <span>Lade …</span>
      </div>
      <div v-else-if="store.ladeStatus === 'fertig' && store.mails.length === 0" class="mail-leer">
        <MailIcon name="posteingang" :size="28" />
        <strong>Keine Mails</strong>
        <span v-if="store.suche">Nichts zu „{{ store.suche }}" gefunden.</span>
        <span v-else>{{ leerText }}</span>
      </div>

      <button
        v-if="store.hatMehr"
        class="mail-btn ist-umrandet mail-liste-mehr"
        :disabled="store.ladeStatus === 'laedt'"
        @click="store.ladeMehr()"
      >
        <MailIcon :name="store.ladeStatus === 'laedt' ? 'laedt' : 'mehr'" :size="16" :class="{ 'mail-drehend': store.ladeStatus === 'laedt' }" />
        Mehr laden ({{ store.mails.length }} von {{ store.total }})
      </button>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import MailIcon from './MailIcon.vue'
import MailListItem from './MailListItem.vue'
import { useMailStore } from '../stores/useMailStore'

const store = useMailStore()
const suchtext = ref(store.suche)
const scroller = ref(null)

let suchTimer = null
function suchen() {
  clearTimeout(suchTimer)
  suchTimer = setTimeout(() => store.setzeSuche(suchtext.value), 300)
}

// Ordnerwechsel: Suche zurücksetzen und nach oben scrollen
watch(() => store.ordner, () => {
  suchtext.value = ''
  if (store.suche) store.suche = ''
  if (scroller.value) scroller.value.scrollTop = 0
})

function beiScroll() {
  const el = scroller.value
  if (!el || !store.hatMehr || store.ladeStatus === 'laedt') return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) store.ladeMehr()
}

const leerText = computed(() => ({
  inbox: 'Neue Mails erscheinen hier, sobald der Abruf sie geholt hat (alle 5 Minuten).',
  unassigned: 'Alle Mails sind einem Projekt zugeordnet.',
  quarantine: 'Keine Anhänge in Quarantäne.',
  sent: 'Noch nichts verschickt.',
}[store.ordner] ?? ''))
</script>

<style scoped>
.mail-liste {
  display: flex;
  flex-direction: column;
  background: var(--mail-flaeche);
  overflow: hidden;
}
.mail-liste-kopf {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 14px 14px 6px;
}
.mail-liste-titel { margin: 0; font-size: 16px; font-weight: 700; }
.mail-liste-anzahl { color: var(--mail-text-dim); font-size: 13px; }
.mail-liste-suche { position: relative; padding: 4px 12px 10px; }
.mail-liste-suche-icon {
  position: absolute;
  left: 22px;
  top: 14px;
  color: var(--mail-text-dim);
  pointer-events: none;
}
.mail-liste-suche .mail-eingabe { padding-left: 32px; }
.mail-liste-hinweis { margin: 0 12px 8px; }
.mail-liste-scroll { flex: 1; min-height: 0; overflow: auto; }
.mail-liste-mehr { width: calc(100% - 24px); margin: 10px 12px 14px; }
</style>
