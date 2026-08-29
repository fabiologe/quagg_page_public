<template>
  <section class="mail-lesen">
    <div v-if="store.aktiveId === null" class="mail-leer">
      <MailIcon name="gelesen" :size="34" />
      <strong>Keine Mail ausgewählt</strong>
      <span>Wähle links eine Nachricht aus.</span>
    </div>

    <div v-else-if="store.detailStatus === 'laedt' && !mail" class="mail-leer">
      <MailIcon name="laedt" :size="22" class="mail-drehend" />
      <span>Lade Nachricht …</span>
    </div>

    <div v-else-if="store.detailStatus === 'fehler'" class="mail-leer">
      <MailIcon name="warnung" :size="28" />
      <strong>Nachricht konnte nicht geladen werden</strong>
      <span>{{ store.detailFehler }}</span>
    </div>

    <template v-else-if="mail">
      <header class="mail-lesen-kopf">
        <div class="mail-lesen-aktionen">
          <button class="mail-btn ist-klein mail-lesen-zurueck" title="Zurück zur Liste" @click="store.schliesseDetail()">
            <MailIcon name="zurueck" :size="16" />
          </button>
          <button v-if="store.darfBearbeiten" class="mail-btn ist-klein" title="Antworten" @click="store.oeffneComposer('antwort', mail)">
            <MailIcon name="antworten" :size="16" /> Antworten
          </button>
          <button v-if="store.darfBearbeiten" class="mail-btn ist-klein" title="Allen antworten" @click="store.oeffneComposer('alle', mail)">
            <MailIcon name="allen" :size="16" /> Allen
          </button>
          <button
            v-if="mail.folder !== 'sent' && store.darfBearbeiten"
            class="mail-btn ist-klein"
            :disabled="mail.is_assigned"
            :title="mail.is_assigned ? 'Bereits zugewiesen — Umzuweisen folgt später' : 'Einem Projekt zuweisen (verschiebt die Dateien)'"
            @click="store.zuweisenMail = mail"
          >
            <MailIcon name="zuweisen" :size="16" /> Zuweisen
          </button>
          <span class="mail-lesen-platz" />
          <button class="mail-btn ist-klein" :title="mail.is_read ? 'Als ungelesen markieren' : 'Als gelesen markieren'" @click="store.setzeGelesen(mail.id, !mail.is_read)">
            <MailIcon :name="mail.is_read ? 'ungelesen' : 'gelesen'" :size="16" />
          </button>
          <button class="mail-btn ist-klein" title="Original (.eml) herunterladen" :disabled="!mail.eml_path" @click="ladeEml">
            <MailIcon name="herunterladen" :size="16" /> .eml
          </button>
        </div>

        <h1 class="mail-lesen-betreff">{{ mail.subject || '(kein Betreff)' }}</h1>

        <dl class="mail-lesen-meta">
          <dt>Von</dt><dd><MailAdresse :roh="mail.sender" /></dd>
          <dt>An</dt><dd><MailAdresse :roh="mail.recipient" /></dd>
          <template v-if="mail.cc"><dt>Cc</dt><dd><MailAdresse :roh="mail.cc" /></dd></template>
          <dt>Datum</dt><dd>{{ formatDatumLang(mail.received_at) }}</dd>
          <template v-if="mail.project_id">
            <dt>Projekt</dt>
            <dd><span class="mail-badge ist-akzent"><MailIcon name="projekt" :size="12" /> {{ mail.project_id }}</span></dd>
          </template>
        </dl>

        <div v-if="mail.attachments?.length" class="mail-lesen-anhaenge">
          <button
            v-for="(a, i) in mail.attachments"
            :key="i"
            class="mail-lesen-anhang"
            :title="`${a.original_filename} herunterladen`"
            :disabled="ladend.has(i)"
            @click="ladeAnhang(i, a)"
          >
            <MailIcon :name="ladend.has(i) ? 'laedt' : dateiIcon(a)" :size="16" :class="{ 'mail-drehend': ladend.has(i) }" />
            <span class="mail-lesen-anhang-name">{{ a.original_filename }}</span>
            <span class="mail-lesen-anhang-groesse">{{ formatGroesse(a.size_bytes) }}</span>
          </button>
        </div>

        <div v-if="mail.quarantined_attachments?.length" class="mail-hinweis ist-warn mail-lesen-quarantaene">
          <MailIcon name="quarantaene" :size="18" />
          <div>
            <strong>{{ mail.quarantined_attachments.length }} Anhang/Anhänge in Quarantäne</strong>
            <ul>
              <li v-for="(q, i) in mail.quarantined_attachments" :key="i">
                <span class="mail-lesen-q-name">{{ q.original_filename }}</span>
                <span class="mail-lesen-q-grund">{{ q.mime_type }} · {{ formatGroesse(q.size_bytes) }} — {{ q.reason }}</span>
              </li>
            </ul>
            <span class="mail-lesen-q-tipp">
              Dateityp in den Einstellungen freigeben — wirkt für künftige Mails, Bestandsdateien bleiben in <code>_quarantine</code>.
            </span>
          </div>
        </div>

        <MailTerminKarte v-if="mail.ical" :mail="mail" />

        <div v-if="anhangFehler" class="mail-hinweis ist-fehler">
          <MailIcon name="warnung" :size="16" />
          <span>{{ anhangFehler }}</span>
        </div>

        <div v-if="blockierteBilder > 0 && !bilderLaden" class="mail-hinweis mail-lesen-bilder">
          <MailIcon name="bilder" :size="16" />
          <span>{{ blockierteBilder }} externe Bilder blockiert (Schutz vor Tracking).</span>
          <button class="mail-btn ist-klein ist-umrandet" @click="bilderLaden = true">Bilder laden</button>
        </div>
      </header>

      <div class="mail-lesen-body">
        <iframe
          v-if="srcdoc"
          class="mail-lesen-frame"
          :srcdoc="srcdoc"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerpolicy="no-referrer"
          title="Nachrichteninhalt"
        />
        <div v-else class="mail-leer"><span>(kein Inhalt)</span></div>
      </div>
    </template>
  </section>
</template>

<script setup>
import { ref, computed, watch, h } from 'vue'
import MailIcon from './MailIcon.vue'
import MailTerminKarte from './MailTerminKarte.vue'
import { useMailStore } from '../stores/useMailStore'
import { mailApi, fehlerText, speichereBlob } from '../services/mailApi'
import { formatDatumLang, formatGroesse, parseAdressListe } from '../services/MailText'
import { sanitizeMailHtml, baueSrcdoc, textZuHtml } from '../services/MailHtml'

const store = useMailStore()
const mail = computed(() => store.detail)

const bilderLaden = ref(false)
const ladend = ref(new Set())
const anhangFehler = ref('')

watch(() => mail.value?.id, () => {
  bilderLaden.value = false
  anhangFehler.value = ''
  ladend.value = new Set()
})

// HTML entschärfen; Text-Mails werden ebenfalls über das sandboxed iframe
// gerendert, damit Links einheitlich in neuen Tabs aufgehen.
const gereinigt = computed(() => {
  const m = mail.value
  if (!m) return { html: '', blockierteBilder: 0 }
  if (m.body_html) return sanitizeMailHtml(m.body_html, { bilderLaden: bilderLaden.value })
  if (m.body_text) return { html: textZuHtml(m.body_text), blockierteBilder: 0 }
  return { html: '', blockierteBilder: 0 }
})
const blockierteBilder = computed(() => gereinigt.value.blockierteBilder)
const srcdoc = computed(() =>
  gereinigt.value.html ? baueSrcdoc(gereinigt.value.html, { dunkel: store.theme === 'dark' }) : '',
)

function dateiIcon(a) {
  const mime = String(a.mime_type || '')
  if (mime.startsWith('image/')) return 'datei-bild'
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv') return 'datei-tabelle'
  if (mime === 'application/zip') return 'datei-archiv'
  if (mime === 'application/pdf' || mime.startsWith('text/') || mime.includes('word')) return 'datei-text'
  return 'datei'
}

async function ladeAnhang(index, a) {
  anhangFehler.value = ''
  ladend.value = new Set([...ladend.value, index])
  try {
    const blob = await mailApi.anhangBlob(mail.value.id, index)
    speichereBlob(blob, a.original_filename)
  } catch (err) {
    anhangFehler.value = await blobFehler(err, 'Anhang konnte nicht geladen werden.')
  } finally {
    const s = new Set(ladend.value)
    s.delete(index)
    ladend.value = s
  }
}

async function ladeEml() {
  anhangFehler.value = ''
  try {
    const blob = await mailApi.emlBlob(mail.value.id)
    speichereBlob(blob, `${(mail.value.subject || 'mail').slice(0, 60)}.eml`)
  } catch (err) {
    anhangFehler.value = await blobFehler(err, '.eml konnte nicht geladen werden.')
  }
}

/** Bei responseType 'blob' kommt auch die Fehlermeldung als Blob — auspacken. */
async function blobFehler(err, fallback) {
  const daten = err?.response?.data
  if (daten instanceof Blob) {
    try {
      const json = JSON.parse(await daten.text())
      if (typeof json.detail === 'string') return json.detail
    } catch { /* kein JSON */ }
  }
  return fehlerText(err, fallback)
}

// Kleine Inline-Komponente: Adressliste als "Name <adresse>"-Chips
const MailAdresse = {
  props: { roh: { type: String, default: '' } },
  setup(props) {
    return () => {
      const liste = parseAdressListe(props.roh)
      if (!liste.length) return h('span', props.roh)
      return h('span', { class: 'mail-adressen' }, liste.map(a =>
        h('span', { class: 'mail-adresse', title: a.adresse }, a.name ? `${a.name} <${a.adresse}>` : a.adresse),
      ))
    }
  },
}
</script>

<style scoped>
.mail-lesen {
  display: flex;
  flex-direction: column;
  background: var(--mail-bg);
  overflow: hidden;
}
.mail-lesen-kopf {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 20px 14px;
  background: var(--mail-flaeche);
  border-bottom: 1px solid var(--mail-rand);
}
.mail-lesen-aktionen { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; }
.mail-lesen-platz { flex: 1; }
.mail-lesen-zurueck { display: none; }
.mail-lesen-betreff {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.3;
  user-select: text;
}
.mail-lesen-meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 12px;
  margin: 0;
  font-size: 13px;
  user-select: text;
}
.mail-lesen-meta dt { color: var(--mail-text-dim); }
.mail-lesen-meta dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.mail-lesen-meta :deep(.mail-adressen) { display: inline-flex; flex-wrap: wrap; gap: 4px 10px; }
.mail-lesen-anhaenge { display: flex; flex-wrap: wrap; gap: 6px; }
.mail-lesen-anhang {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--mail-rand-stark);
  border-radius: var(--mail-radius-klein);
  background: var(--mail-papier);
  color: var(--mail-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.mail-lesen-anhang:hover { border-color: var(--mail-akzent); color: var(--mail-akzent); }
.mail-lesen-anhang:disabled { opacity: 0.6; cursor: default; }
.mail-lesen-anhang-name { max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mail-lesen-anhang-groesse { color: var(--mail-text-dim); font-size: 12px; }
.mail-lesen-quarantaene ul { margin: 6px 0; padding-left: 18px; }
.mail-lesen-quarantaene li { margin-bottom: 4px; }
.mail-lesen-q-name { font-weight: 600; margin-right: 6px; }
.mail-lesen-q-grund { font-size: 12px; opacity: 0.85; }
.mail-lesen-q-tipp { font-size: 12px; opacity: 0.85; }
.mail-lesen-q-tipp code { font-family: var(--mail-schrift-mono); }
.mail-lesen-bilder { align-items: center; }
.mail-lesen-bilder span { flex: 1; }
.mail-lesen-body { flex: 1; min-height: 0; display: flex; padding: 12px 20px 16px; }
.mail-lesen-frame {
  flex: 1;
  width: 100%;
  height: 100%;
  border: 1px solid var(--mail-rand);
  border-radius: var(--mail-radius-klein);
  background: var(--mail-papier);
}

@media (max-width: 900px) {
  .mail-lesen-zurueck { display: inline-flex; }
}
</style>
