<template>
  <section class="sig">
    <p class="sig-erklaerung">
      Diese Angaben stehen unter jeder Mail, die du verschickst. Firmenname, Anschrift und Logo kommen
      automatisch dazu — du pflegst nur deinen persönlichen Teil.
    </p>

    <div v-if="ladeFehler" class="sig-fehler">{{ ladeFehler }}</div>
    <p v-else-if="!geladen" class="sig-erklaerung">Lade …</p>

    <template v-else>
      <form class="sig-form" @submit.prevent="speichern">
        <label class="sig-feld">Name<input v-model="form.anzeigename" type="text" placeholder="Vorname Nachname" maxlength="120"></label>
        <label class="sig-feld">Titel / akad. Grad<input v-model="form.titel" type="text" placeholder="M.Sc." maxlength="60"></label>
        <label class="sig-feld">Funktion<input v-model="form.funktion" type="text" placeholder="Projektleiter" maxlength="80"></label>
        <label class="sig-feld">Telefon<input v-model="form.telefon" type="text" placeholder="0631 123456-12" maxlength="60"></label>
        <label class="sig-feld">Mobil<input v-model="form.mobil" type="text" placeholder="0170 1234567" maxlength="60"></label>
        <label class="sig-feld sig-breit">Eigene Zusatzzeilen
          <textarea v-model="form.signatur_zusatz" rows="3" placeholder="z. B. Sprechzeiten Mo–Do 9–16 Uhr" maxlength="2000" />
          <small>Eine Zeile je Angabe. Erscheint unter den Kontaktdaten.</small>
        </label>
        <div class="sig-aktionen">
          <button type="submit" class="mail-btn ist-primaer" :disabled="laeuft || !geaendert">
            {{ laeuft ? 'Speichere …' : 'Speichern' }}
          </button>
          <button type="button" class="mail-btn ist-umrandet" :disabled="laeuft || !geaendert" @click="zuruecksetzen">Verwerfen</button>
          <span v-if="gespeichert" class="sig-ok">Gespeichert.</span>
          <span v-if="fehler" class="sig-fehler">{{ fehler }}</span>
        </div>
      </form>

      <MailSignaturVorschau :vorschau="daten?.vorschau" :veraltet="geaendert" />

      <MailFirmensignaturForm v-if="daten?.darf_firma_bearbeiten" :daten="daten" @gespeichert="uebernimm" />
      <p v-else-if="daten" class="sig-erklaerung">
        Firmenblock: <strong>{{ daten.firma.firma || '— nicht gesetzt —' }}</strong>{{ ortZeile }}.
        Änderungen daran nimmt ein Admin vor.
      </p>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import MailSignaturVorschau from './MailSignaturVorschau.vue'
import MailFirmensignaturForm from './MailFirmensignaturForm.vue'
import { signaturApi, fehlerText } from '../services/signaturApi'
import { useAuthStore } from '@/stores/useAuthStore'

const FELDER = ['anzeigename', 'titel', 'funktion', 'telefon', 'mobil', 'signatur_zusatz']

const auth = useAuthStore()
const daten = ref(null)
const geladen = ref(false)
const ladeFehler = ref('')
const fehler = ref('')
const gespeichert = ref(false)
const laeuft = ref(false)
const form = reactive(Object.fromEntries(FELDER.map(f => [f, ''])))

const gespeicherterStand = ref('')
const geaendert = computed(() => JSON.stringify(form) !== gespeicherterStand.value)
const ortZeile = computed(() => {
  const f = daten.value?.firma
  const ort = [f?.plz, f?.ort].filter(Boolean).join(' ')
  return ort ? `, ${ort}` : ''
})

function uebernimm(antwort) {
  daten.value = antwort
  for (const f of FELDER) form[f] = antwort.person[f] ?? ''
  gespeicherterStand.value = JSON.stringify(form)
}

onMounted(async () => {
  try {
    uebernimm(await signaturApi.lesen())
  } catch (err) {
    ladeFehler.value = fehlerText(err, 'Signatur konnte nicht geladen werden.')
  } finally {
    geladen.value = true
  }
})

function zuruecksetzen() {
  if (daten.value) uebernimm(daten.value)
}

async function speichern() {
  laeuft.value = true
  fehler.value = ''
  gespeichert.value = false
  try {
    const antwort = await signaturApi.eigeneSpeichern({ ...form })
    uebernimm(antwort)
    // Anzeigename wandert auch in die Kopfzeile der App
    if (auth.user) auth.setzeUser({ ...auth.user, anzeigename: antwort.person.anzeigename })
    gespeichert.value = true
    setTimeout(() => { gespeichert.value = false }, 3000)
  } catch (err) {
    fehler.value = fehlerText(err, 'Speichern fehlgeschlagen.')
  } finally {
    laeuft.value = false
  }
}
</script>

<style scoped>
.sig { display: flex; flex-direction: column; gap: 12px; }
.sig-erklaerung { margin: 0; font-size: 13px; color: var(--mail-text-dim, #6d757e); }
.sig-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 10px; }
.sig-feld { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--mail-text-dim, #6d757e); }
.sig-feld small { font-size: 12px; opacity: .85; }
.sig-feld input, .sig-feld textarea {
  padding: 6px 8px;
  border: 1px solid var(--mail-rand-stark, #b9b5ac);
  border-radius: var(--mail-radius-klein, 5px);
  background: var(--mail-papier, #fff);
  color: var(--mail-text, #22262b);
  font: inherit;
}
.sig-feld textarea { resize: vertical; }
.sig-breit { grid-column: 1 / -1; }
.sig-aktionen { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sig-ok { color: var(--mail-ok, #15803d); font-size: 13px; }
.sig-fehler { color: var(--mail-fehler, #b91c1c); font-size: 13px; }

/* Fallback-Knopf, falls die Komponente ausserhalb des Mail-Clients steht */
.mail-btn { padding: 6px 12px; border: 1px solid transparent; border-radius: 5px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
</style>
