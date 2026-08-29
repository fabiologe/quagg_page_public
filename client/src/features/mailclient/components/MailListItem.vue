<template>
  <button
    class="mail-eintrag"
    :class="{ 'ist-ungelesen': !mail.is_read, 'ist-aktiv': aktiv }"
    :data-mail-id="mail.id"
    @click="$emit('oeffnen', mail.id)"
  >
    <span class="mail-eintrag-avatar" :style="{ background: avatarFarbe }">{{ initialen(anzeigeAdresse) }}</span>
    <span class="mail-eintrag-text">
      <span class="mail-eintrag-zeile">
        <span class="mail-eintrag-absender">{{ absenderName(anzeigeAdresse) }}</span>
        <span class="mail-eintrag-datum">{{ formatDatum(mail.received_at) }}</span>
      </span>
      <span class="mail-eintrag-betreff">{{ mail.subject || '(kein Betreff)' }}</span>
      <span class="mail-eintrag-marken">
        <span v-if="mail.attachment_count > 0" class="mail-badge" :title="`${mail.attachment_count} Anhang/Anhänge`">
          <MailIcon name="anhang" :size="12" />{{ mail.attachment_count }}
        </span>
        <span v-if="mail.hat_termin" class="mail-badge ist-akzent" title="Enthält einen Termin">
          <MailIcon name="zeit" :size="12" />
        </span>
        <span v-if="mail.has_quarantined_files" class="mail-badge ist-warn" title="Anhang in Quarantäne">
          <MailIcon name="quarantaene" :size="12" />
        </span>
        <span v-if="mail.project_id" class="mail-badge ist-akzent" :title="`Projekt ${mail.project_id}`">
          <MailIcon name="projekt" :size="12" />{{ mail.project_id }}
        </span>
      </span>
    </span>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import MailIcon from './MailIcon.vue'
import { absenderName, initialen, formatDatum } from '../services/MailText'

const props = defineProps({
  mail: { type: Object, required: true },
  aktiv: { type: Boolean, default: false },
})
defineEmits(['oeffnen'])

// Gesendete Mails zeigen den Empfänger, eingegangene den Absender
const anzeigeAdresse = computed(() => props.mail.folder === 'sent' ? props.mail.recipient : props.mail.sender)

const FARBEN = ['#0f766e', '#b45309', '#1d4ed8', '#7c3aed', '#be185d', '#15803d', '#0e7490']
const avatarFarbe = computed(() => {
  const s = String(anzeigeAdresse.value || '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return FARBEN[h % FARBEN.length]
})
</script>

<style scoped>
.mail-eintrag {
  display: flex;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid var(--mail-rand);
  background: transparent;
  color: var(--mail-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.mail-eintrag:hover { background: var(--mail-flaeche-2); }
.mail-eintrag.ist-aktiv { background: var(--mail-akzent-weich); }
.mail-eintrag-avatar {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.mail-eintrag-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.mail-eintrag-zeile { display: flex; align-items: baseline; gap: 8px; }
.mail-eintrag-absender { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mail-eintrag-datum { flex-shrink: 0; font-size: 12px; color: var(--mail-text-dim); }
.mail-eintrag-betreff {
  color: var(--mail-text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mail-eintrag.ist-ungelesen .mail-eintrag-absender { font-weight: 700; }
.mail-eintrag.ist-ungelesen .mail-eintrag-betreff { color: var(--mail-text); font-weight: 600; }
.mail-eintrag.ist-ungelesen .mail-eintrag-datum { color: var(--mail-akzent); font-weight: 600; }
.mail-eintrag-marken { display: flex; gap: 4px; flex-wrap: wrap; min-height: 0; }
.mail-eintrag-marken:empty { display: none; }
</style>
