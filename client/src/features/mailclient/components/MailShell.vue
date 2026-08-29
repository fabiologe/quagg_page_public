<template>
  <div class="mail-shell" :class="{ 'zeigt-detail': store.aktiveId !== null }">
    <MailSidebar class="mail-shell-sidebar" />
    <MailList class="mail-shell-liste" />
    <MailReadingPane class="mail-shell-lesen" />

    <MailComposer v-if="store.composer" />
    <MailAssignDialog v-if="store.zuweisenMail" />
    <MailSettingsDialog v-if="store.einstellungenOffen" />
  </div>
</template>

<script setup>
/**
 * MailShell — die eigentliche Layoutschale: Ordner | Liste | Lesebereich.
 * Dialoge und Composer hängen als v-if hier, gesteuert vom Store.
 */
import MailSidebar from './MailSidebar.vue'
import MailList from './MailList.vue'
import MailReadingPane from './MailReadingPane.vue'
import MailComposer from './MailComposer.vue'
import MailAssignDialog from './MailAssignDialog.vue'
import MailSettingsDialog from './MailSettingsDialog.vue'
import { useMailStore } from '../stores/useMailStore'

const store = useMailStore()
</script>

<style scoped>
.mail-shell {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: var(--mail-sidebar-breite) var(--mail-liste-breite) minmax(0, 1fr);
  height: 100%;
}
.mail-shell-sidebar,
.mail-shell-liste,
.mail-shell-lesen {
  min-height: 0;
  min-width: 0;
}
.mail-shell-sidebar { border-right: 1px solid var(--mail-rand); }
.mail-shell-liste { border-right: 1px solid var(--mail-rand); }

@media (max-width: 1100px) {
  .mail-shell { grid-template-columns: var(--mail-sidebar-breite) 320px minmax(0, 1fr); }
}

/* Schmal: Lesebereich legt sich über die Liste, sobald eine Mail offen ist */
@media (max-width: 900px) {
  .mail-shell { grid-template-columns: 200px minmax(0, 1fr); }
  .mail-shell-lesen {
    position: absolute;
    inset: 0;
    left: 200px;
    display: none;
    background: var(--mail-bg);
  }
  .mail-shell.zeigt-detail .mail-shell-lesen { display: flex; }
}
</style>
