<template>
  <Teleport to="body">
    <div class="mail-dialog-hintergrund" @pointerdown.self="abbrechen">
      <form class="mail-dialog ist-breit mail-composer" @submit.prevent="senden" @dragover.prevent="ziehtDrueber = true" @dragleave="ziehtDrueber = false" @drop.prevent="beiDrop">
        <header class="mail-dialog-kopf">
          <MailIcon name="verfassen" :size="18" />
          <span>{{ titel }}</span>
          <button type="button" class="mail-btn ist-klein" title="Schließen" @click="abbrechen">
            <MailIcon name="schliessen" :size="16" />
          </button>
        </header>

        <div class="mail-dialog-inhalt" :class="{ 'zieht-drueber': ziehtDrueber }">
          <div class="mail-composer-von">Von: <strong>{{ store.konto || '—' }}</strong></div>

          <label class="mail-feld">
            An
            <input ref="anFeld" v-model="form.to" class="mail-eingabe" type="text" placeholder="name@firma.de, weitere@firma.de" required autocomplete="off">
          </label>
          <label class="mail-feld">
            Cc
            <input v-model="form.cc" class="mail-eingabe" type="text" placeholder="optional" autocomplete="off">
          </label>
          <label class="mail-feld">
            Betreff
            <input v-model="form.subject" class="mail-eingabe" type="text" placeholder="Betreff">
          </label>
          <label class="mail-feld mail-composer-text">
            Nachricht
            <textarea ref="textFeld" v-model="form.body" class="mail-eingabe" rows="12" />
          </label>

          <div class="mail-composer-termin">
            <label class="mail-composer-termin-schalter">
              <input v-model="terminAn" type="checkbox"> Termin anhängen (Einladung mit Zusagen/Absagen im Kalender der Empfänger)
            </label>
            <div v-if="terminAn" class="mail-composer-termin-felder">
              <label class="mail-feld">Titel<input v-model="termin.titel" class="mail-eingabe" type="text" :placeholder="form.subject || 'Terminbezeichnung'"></label>
              <label class="mail-feld mail-composer-check"><input v-model="termin.ganztag" type="checkbox"> Ganztägig</label>
              <label class="mail-feld">Beginn
                <input v-if="termin.ganztag" v-model="termin.beginnTag" class="mail-eingabe" type="date" required>
                <input v-else v-model="termin.beginn" class="mail-eingabe" type="datetime-local" required>
              </label>
              <label class="mail-feld">Ende
                <input v-if="termin.ganztag" v-model="termin.endeTag" class="mail-eingabe" type="date">
                <input v-else v-model="termin.ende" class="mail-eingabe" type="datetime-local" required>
              </label>
              <label class="mail-feld">Ort<input v-model="termin.ort" class="mail-eingabe" type="text" placeholder="optional"></label>
              <label class="mail-feld">Besprechungslink<input v-model="termin.besprechungslink" class="mail-eingabe" type="url" placeholder="https://…"></label>
              <p class="mail-composer-termin-tipp">Empfänger aus „An" und „Cc" werden Teilnehmer. Der Termin erscheint auch in unserem Kalender. Dateianhänge sind bei Einladungen nicht möglich.</p>
            </div>
          </div>

          <div v-if="!terminAn" class="mail-composer-anhaenge">
            <div class="mail-composer-anhaenge-kopf">
              <label class="mail-btn ist-klein ist-umrandet">
                <MailIcon name="anhang" :size="16" /> Anhang hinzufügen
                <input type="file" multiple hidden @change="beiDateiwahl">
              </label>
              <span class="mail-composer-groesse" :class="{ 'ist-zu-gross': zuGross }">
                {{ dateien.length }} Datei(en) · {{ formatGroesse(gesamtGroesse) }} / 25 MB
              </span>
            </div>
            <ul v-if="dateien.length" class="mail-composer-dateien">
              <li v-for="(d, i) in dateien" :key="i">
                <MailIcon name="datei" :size="14" />
                <span class="mail-composer-datei-name">{{ d.name }}</span>
                <span class="mail-composer-datei-groesse">{{ formatGroesse(d.size) }}</span>
                <button type="button" class="mail-btn ist-klein" title="Entfernen" @click="entferne(i)">
                  <MailIcon name="schliessen" :size="14" />
                </button>
              </li>
            </ul>
            <p v-else class="mail-composer-drop-tipp">Dateien hierher ziehen oder auswählen.</p>
          </div>

          <div v-if="fehler" class="mail-hinweis ist-fehler">
            <MailIcon name="warnung" :size="16" />
            <span>{{ fehler }}</span>
          </div>
        </div>

        <footer class="mail-dialog-fuss">
          <button type="button" class="mail-btn" :disabled="sendet" @click="abbrechen">Verwerfen</button>
          <button type="submit" class="mail-btn ist-primaer" :disabled="sendet || zuGross || !form.to.trim()">
            <MailIcon :name="sendet ? 'laedt' : 'senden'" :size="16" :class="{ 'mail-drehend': sendet }" />
            {{ sendet ? 'Sende …' : 'Senden' }}
          </button>
        </footer>
      </form>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import MailIcon from './MailIcon.vue'
import { useMailStore } from '../stores/useMailStore'
import { fehlerText } from '../services/mailApi'
import { formatGroesse, parseAdressListe } from '../services/MailText'
import { kalenderApi } from '@/features/kalender/services/kalenderApi'
import { ausLokalInput, zuLokalInput } from '@/features/kalender/services/KalenderZeit'

const MAX_BYTES = 25 * 1024 * 1024
const MAX_DATEIEN = 10

const store = useMailStore()
const vorgabe = store.composer ?? {}

const form = reactive({
  to: vorgabe.to ?? '',
  cc: vorgabe.cc ?? '',
  subject: vorgabe.subject ?? '',
  body: vorgabe.body ?? '',
})
const replyToId = vorgabe.replyToId ?? null
const dateien = ref([])
const sendet = ref(false)
const fehler = ref('')
const ziehtDrueber = ref(false)
const anFeld = ref(null)
const textFeld = ref(null)

const titel = computed(() => ({
  neu: 'Neue Nachricht',
  antwort: 'Antworten',
  alle: 'Allen antworten',
}[vorgabe.modus] ?? 'Neue Nachricht'))

const gesamtGroesse = computed(() => dateien.value.reduce((s, d) => s + d.size, 0))
const zuGross = computed(() => gesamtGroesse.value > MAX_BYTES || dateien.value.length > MAX_DATEIEN)

// „Termin anhängen": statt /emails/send geht die Mail als Einladung über den Kalender
const terminAn = ref(false)
function naechsteVolleStunde() {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d
}
const _b = naechsteVolleStunde()
const termin = reactive({
  titel: '', ganztag: false,
  beginn: zuLokalInput(_b), ende: zuLokalInput(new Date(_b.getTime() + 3600000)),
  beginnTag: zuLokalInput(_b).slice(0, 10), endeTag: zuLokalInput(_b).slice(0, 10),
  ort: '', besprechungslink: '',
})

onMounted(() => {
  // Bei Antworten steht der Cursor VOR dem Zitat, bei neuen Mails im An-Feld
  if (replyToId && textFeld.value) {
    textFeld.value.focus()
    textFeld.value.setSelectionRange(0, 0)
  } else {
    anFeld.value?.focus()
  }
})

function fuegeHinzu(liste) {
  fehler.value = ''
  const neu = Array.from(liste || [])
  dateien.value = [...dateien.value, ...neu]
  if (dateien.value.length > MAX_DATEIEN) fehler.value = `Höchstens ${MAX_DATEIEN} Anhänge pro Mail.`
  else if (gesamtGroesse.value > MAX_BYTES) fehler.value = 'Anhänge zu groß (max. 25 MB insgesamt).'
}
function beiDateiwahl(ev) {
  fuegeHinzu(ev.target.files)
  ev.target.value = ''
}
function beiDrop(ev) {
  ziehtDrueber.value = false
  fuegeHinzu(ev.dataTransfer?.files)
}
function entferne(i) {
  dateien.value = dateien.value.filter((_, j) => j !== i)
  if (!zuGross.value) fehler.value = ''
}

function abbrechen() {
  if (sendet.value) return
  store.schliesseComposer()
}

async function sendeEinladung() {
  const teilnehmer = [...parseAdressListe(form.to), ...parseAdressListe(form.cc)]
    .map(a => ({ email: a.adresse, name: a.name || '' }))
  if (!teilnehmer.length) throw new Error('Mindestens ein Empfänger ist nötig.')
  const felder = {
    titel: termin.titel.trim() || form.subject.trim() || 'Termin',
    ganztag: termin.ganztag,
    beginn: termin.ganztag ? termin.beginnTag : ausLokalInput(termin.beginn),
    ende: termin.ganztag ? (termin.endeTag || termin.beginnTag) : ausLokalInput(termin.ende),
    ort: termin.ort.trim(), besprechungslink: termin.besprechungslink.trim(), beschreibung: '',
    projekt_id: null, teilnehmer,
    einladung: { betreff: form.subject.trim() || null, nachricht: form.body || null },
  }
  await kalenderApi.anlegen(felder)
  if (store.ordner === 'sent') await store.ladeListe()
}

async function senden() {
  if (sendet.value || zuGross.value) return
  sendet.value = true
  fehler.value = ''
  if (terminAn.value) {
    try {
      await sendeEinladung()
      store.schliesseComposer()
    } catch (err) {
      fehler.value = err?.response ? fehlerText(err, 'Einladung fehlgeschlagen.') : (err?.message || 'Einladung fehlgeschlagen.')
    } finally {
      sendet.value = false
    }
    return
  }
  const fd = new FormData()
  fd.append('to', form.to)
  if (form.cc.trim()) fd.append('cc', form.cc)
  fd.append('subject', form.subject)
  fd.append('body_text', form.body)
  if (replyToId) fd.append('reply_to_id', String(replyToId))
  for (const d of dateien.value) fd.append('files', d, d.name)
  try {
    await store.sendeMail(fd)
    store.schliesseComposer()
  } catch (err) {
    fehler.value = fehlerText(err, 'Senden fehlgeschlagen.')
  } finally {
    sendet.value = false
  }
}
</script>

<style scoped>
.mail-composer { max-height: min(92vh, 860px); }
.mail-composer-von { font-size: 13px; color: var(--mail-text-dim); }
.mail-composer-text textarea { font-family: var(--mail-schrift); }
.mail-dialog-inhalt.zieht-drueber { outline: 2px dashed var(--mail-akzent); outline-offset: -6px; }
.mail-composer-anhaenge {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px dashed var(--mail-rand-stark);
  border-radius: var(--mail-radius-klein);
}
.mail-composer-anhaenge-kopf { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.mail-composer-groesse { font-size: 12px; color: var(--mail-text-dim); }
.mail-composer-groesse.ist-zu-gross { color: var(--mail-fehler); font-weight: 600; }
.mail-composer-dateien { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.mail-composer-dateien li { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.mail-composer-datei-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mail-composer-datei-groesse { color: var(--mail-text-dim); font-size: 12px; }
.mail-composer-drop-tipp { margin: 0; font-size: 12px; color: var(--mail-text-dim); }
.mail-composer-termin { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px dashed var(--mail-rand-stark); border-radius: var(--mail-radius-klein); }
.mail-composer-termin-schalter { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.mail-composer-termin-felder { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.mail-composer-termin-felder .mail-composer-check { flex-direction: row; align-items: center; gap: 6px; }
.mail-composer-termin-tipp { grid-column: 1 / -1; margin: 0; font-size: 12px; color: var(--mail-text-dim); }
</style>
