<template>
  <div class="mail-root">
    <MailShell />
  </div>
</template>

<script setup>
/**
 * MailClientView — Route-Shell des Standalone-Mail-Clients (/mail).
 *
 * Importiert bewusst KEIN Layout: die Route läuft als eigener Vollbild-Tab
 * (Muster /pdf-editor, /office). Bewusst KEINE PWA/Service-Worker-Teile —
 * der Client wird später Teil der Gesamt-App. Der Theme-Modus wird auf
 * <html data-theme> gespiegelt (Teleport-Dialoge!) und beim Verlassen
 * wieder abgeräumt.
 */
import { watch, onMounted, onBeforeUnmount } from 'vue'
import MailShell from '../components/MailShell.vue'
import { useMailStore } from '../stores/useMailStore'
import '../styles/theme.css'

const POLL_MS = 120_000   // Worker holt alle 300 s ab — halb so oft nachsehen reicht

const store = useMailStore()
let pollTimer = null

watch(() => store.theme, (t) => {
  if (t === 'dark') document.documentElement.dataset.theme = 'dark'
  else delete document.documentElement.dataset.theme
}, { immediate: true })

watch(() => store.ungelesen, (n) => {
  document.title = n > 0 ? `(${n}) Quagg Mail` : 'Quagg Mail'
}, { immediate: true })

onMounted(async () => {
  await store.init()
  pollTimer = setInterval(() => {
    // Nicht mitten in einer Aktion die Liste unter dem Nutzer wegziehen
    if (!store.composer && !store.zuweisenMail && !store.einstellungenOffen) store.aktualisiere()
  }, POLL_MS)
})

onBeforeUnmount(() => {
  clearInterval(pollTimer)
  delete document.documentElement.dataset.theme
  store.schliesseDetail()
  store.schliesseComposer()
  store.zuweisenMail = null
  store.einstellungenOffen = false
})
</script>
