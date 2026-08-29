<template>
  <Teleport to="body">
    <div class="kal-dialog-hintergrund" @pointerdown.self="$emit('schliessen')">
      <form class="kal-dialog" @submit.prevent="speichern">
        <header class="kal-dialog-kopf">
          <KalenderIcon name="kalender" :size="18" />
          <span>{{ termin ? (fremd ? 'Einladung' : 'Termin bearbeiten') : 'Neuer Termin' }}</span>
          <button type="button" class="kal-knopf ist-klein" title="Schließen" @click="$emit('schliessen')"><KalenderIcon name="schliessen" /></button>
        </header>

        <div class="kal-dialog-inhalt">
          <p v-if="termin?.status === 'abgesagt'" class="kal-hinweis">Dieser Termin ist abgesagt.</p>
          <p v-if="fremd" class="kal-hinweis">
            Einladung von <strong>{{ termin.organisator_name || termin.organisator_email }}</strong>
            <span v-if="termin.unser_status"> · unsere Antwort: <StatusBadge :status="termin.unser_status" /></span>
          </p>

          <label class="kal-feld">Titel<input v-model.trim="form.titel" required :disabled="gesperrt" placeholder="Baubesprechung"></label>

          <label class="kal-check"><input v-model="form.ganztag" type="checkbox" :disabled="gesperrt"> Ganztägig</label>
          <div class="kal-zeile">
            <label class="kal-feld">Beginn
              <input v-if="form.ganztag" v-model="form.beginnTag" type="date" required :disabled="gesperrt">
              <input v-else v-model="form.beginn" type="datetime-local" required :disabled="gesperrt" @change="endeNachziehen">
            </label>
            <label class="kal-feld">Ende
              <input v-if="form.ganztag" v-model="form.endeTag" type="date" :disabled="gesperrt">
              <input v-else v-model="form.ende" type="datetime-local" required :disabled="gesperrt">
            </label>
          </div>

          <div class="kal-zeile">
            <label class="kal-feld">Ort<input v-model.trim="form.ort" :disabled="gesperrt" placeholder="Bauamt, Raum 204"></label>
            <label class="kal-feld">Besprechungslink<input v-model.trim="form.besprechungslink" type="url" :disabled="gesperrt" placeholder="https://teams.microsoft.com/…"></label>
          </div>

          <label v-if="!projektFest" class="kal-feld">Projekt
            <select v-model="form.projekt_id" :disabled="gesperrt">
              <option :value="null">— firmenweit —</option>
              <option v-for="p in projekte" :key="p.id" :value="p.id">{{ p.kurzname || p.name }}</option>
            </select>
          </label>

          <label class="kal-feld">Beschreibung<textarea v-model="form.beschreibung" :disabled="gesperrt" /></label>

          <TeilnehmerFeld v-if="!fremd" v-model="form.teilnehmer" :vorschlaege="vorschlaege" />
          <div v-else-if="termin.teilnehmer?.length" class="kal-feld">
            <span>Teilnehmer</span>
            <span class="kal-status"><StatusBadge v-for="p in termin.teilnehmer" :key="p.email" :status="p.status" :titel="p.email">{{ p.name || p.email }}</StatusBadge></span>
          </div>

          <p v-if="termin && !fremd && termin.eingeladen_am" class="kal-hinweis">
            Eingeladen am {{ formatDatum(termin.eingeladen_am) }}
            <span v-if="termin.einladung_offen"> — <strong>Änderungen noch nicht versendet.</strong></span>
          </p>
          <p v-if="fehler" class="kal-fehler">{{ fehler }}</p>
        </div>

        <footer class="kal-dialog-fuss">
          <template v-if="termin && !fremd && termin.status !== 'abgesagt'">
            <button type="button" class="kal-knopf ist-gefaehrlich" :disabled="laeuft" @click="entfernen">
              <KalenderIcon :name="termin.eingeladen_am ? 'absagen' : 'loeschen'" /> {{ termin.eingeladen_am ? 'Absagen' : 'Löschen' }}
            </button>
          </template>
          <span class="kal-platz" />
          <button type="button" class="kal-knopf" :disabled="laeuft" @click="$emit('schliessen')">Abbrechen</button>
          <button v-if="!gesperrt" type="submit" class="kal-knopf" :disabled="laeuft">Speichern</button>
          <button
            v-if="!gesperrt && (form.teilnehmer.length || termin?.teilnehmer?.length)"
            type="button"
            class="kal-knopf ist-primaer"
            :disabled="laeuft"
            :title="einladungTitel"
            @click="speichern({ einladen: true })"
          >
            <KalenderIcon :name="laeuft ? 'laedt' : 'senden'" /> {{ einladungLabel }}
          </button>
        </footer>
      </form>
    </div>
  </Teleport>
</template>

<script setup>
/**
 * TerminDialog — bewusst „dumm": sammelt das Formular und meldet Aktionen
 * (speichern / einladen / entfernen) an den Aufrufer; der bindet den
 * passenden Store (Kalender oder Projektakte).
 */
import { computed, reactive, ref } from 'vue'
import KalenderIcon from './KalenderIcon.vue'
import StatusBadge from './StatusBadge.vue'
import TeilnehmerFeld from './TeilnehmerFeld.vue'
import { ausLokalInput, formatDatum, ganztagBeginn, ganztagEndeInklusiv, zuLokalInput } from '../services/KalenderZeit'

const props = defineProps({
  termin: { type: Object, default: null },
  vorgabe: { type: Object, default: () => ({}) },
  projekte: { type: Array, default: () => [] },
  projektFest: { type: Boolean, default: false },
  vorschlaege: { type: Array, default: () => [] },
  laeuft: { type: Boolean, default: false },
  fehler: { type: String, default: '' },
})
const emit = defineEmits(['schliessen', 'speichern', 'einladen', 'entfernen'])

const fremd = computed(() => props.termin?.quelle === 'einladung')
const gesperrt = computed(() => fremd.value || props.termin?.status === 'abgesagt')

function rundeAufViertel(d) {
  const x = new Date(d)
  x.setSeconds(0, 0)
  x.setMinutes(Math.ceil(x.getMinutes() / 15) * 15)
  return x
}

function anfang() {
  const t = props.termin
  if (t) {
    return {
      titel: t.titel, ganztag: !!t.ganztag,
      beginn: zuLokalInput(t.beginn), ende: zuLokalInput(t.ende),
      beginnTag: ganztagBeginn(t.beginn), endeTag: ganztagEndeInklusiv(t.ende),
      ort: t.ort || '', besprechungslink: t.besprechungslink || '', beschreibung: t.beschreibung || '',
      projekt_id: t.projekt_id ?? null,
      teilnehmer: (t.teilnehmer || []).map(p => ({ email: p.email, name: p.name, rolle: p.rolle, status: p.status })),
    }
  }
  const v = props.vorgabe || {}
  const b = rundeAufViertel(v.beginn ? new Date(v.beginn) : new Date())
  const e = new Date(b.getTime() + 3600000)
  return {
    titel: v.titel || '', ganztag: !!v.ganztag,
    beginn: zuLokalInput(b), ende: zuLokalInput(e),
    beginnTag: zuLokalInput(b).slice(0, 10), endeTag: zuLokalInput(b).slice(0, 10),
    ort: '', besprechungslink: '', beschreibung: v.beschreibung || '',
    projekt_id: v.projekt_id ?? null,
    teilnehmer: (v.teilnehmer || []).map(p => ({ email: p.email, name: p.name || '', rolle: 'REQ-PARTICIPANT' })),
  }
}

const form = reactive(anfang())

function endeNachziehen() {
  // Ende folgt dem Beginn, wenn es davor läge
  if (form.beginn && (!form.ende || form.ende <= form.beginn)) {
    const b = new Date(form.beginn)
    form.ende = zuLokalInput(new Date(b.getTime() + 3600000))
  }
}

const einladungLabel = computed(() => {
  const t = props.termin
  if (!t || !t.eingeladen_am) return 'Einladung senden'
  const neue = (t.teilnehmer || []).some(p => !p.eingeladen_am)
  if (t.einladung_offen) return 'Update senden'
  return neue ? 'Neue Teilnehmer einladen' : 'Erneut senden'
})
const einladungTitel = computed(() => 'Speichert und schickt die Einladung (iCalendar) an alle Teilnehmer')

function nutzlast() {
  const p = {
    titel: form.titel, ganztag: form.ganztag, ort: form.ort, besprechungslink: form.besprechungslink,
    beschreibung: form.beschreibung, projekt_id: form.projekt_id,
    teilnehmer: form.teilnehmer.map(t => ({ email: t.email, name: t.name || '', rolle: t.rolle || 'REQ-PARTICIPANT' })),
  }
  if (form.ganztag) {
    p.beginn = form.beginnTag
    p.ende = form.endeTag || form.beginnTag
  } else {
    p.beginn = ausLokalInput(form.beginn)
    p.ende = ausLokalInput(form.ende)
  }
  return p
}

function speichern(opt = {}) {
  if (gesperrt.value) return
  emit('speichern', { felder: nutzlast(), einladen: !!opt.einladen, termin: props.termin })
}

function entfernen() {
  const t = props.termin
  const frage = t.eingeladen_am
    ? 'Termin absagen? Alle eingeladenen Teilnehmer bekommen eine Absage.'
    : 'Termin löschen?'
  if (window.confirm(frage)) emit('entfernen', t)
}
</script>
