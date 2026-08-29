<template>
  <section class="fsig">
    <h4>Firmenblock <span class="fsig-nur-admin">nur Admin</span></h4>
    <p class="fsig-erklaerung">
      Gilt für alle Mitarbeiter. Anschrift und Telefon lassen sich aus den Firmendaten der Buchhaltung übernehmen —
      danach bleiben sie unverändert, bis du sie hier wieder änderst.
    </p>

    <form class="fsig-form" @submit.prevent="speichern">
      <label class="fsig-check fsig-breit">
        <input v-model="form.aktiv" type="checkbox"> Signatur an ausgehende Mails anhängen
      </label>
      <label class="fsig-feld">Firma<input v-model="form.firma" type="text" maxlength="120" placeholder="Quagg Engineering"></label>
      <label class="fsig-feld">Rechtsformzusatz
        <input v-model="form.rechtsform_zusatz" type="text" maxlength="80" placeholder="(erst ab Eintragung)">
        <small v-if="vorschlagRechtsform">In den Firmendaten steht „{{ vorschlagRechtsform }}" — erst nach Eintragung ins Handelsregister führen.</small>
      </label>
      <label class="fsig-feld">Straße<input v-model="form.strasse" type="text" maxlength="120"></label>
      <label class="fsig-feld">PLZ<input v-model="form.plz" type="text" maxlength="10"></label>
      <label class="fsig-feld">Ort<input v-model="form.ort" type="text" maxlength="80"></label>
      <label class="fsig-feld">Telefon (Zentrale)<input v-model="form.telefon" type="text" maxlength="60"></label>
      <label class="fsig-feld">E-Mail<input v-model="form.email" type="text" maxlength="120"></label>
      <label class="fsig-feld">Web<input v-model="form.web" type="text" maxlength="120" placeholder="quagg-engineering.org"></label>
      <label class="fsig-feld fsig-breit">Zusatzzeilen der Firma
        <textarea v-model="form.zusatz" rows="3" maxlength="2000" placeholder="Amtsgericht … HRB … · Geschäftsführer …" />
        <small>Ab Eintragung der UG sind Rechtsform, Sitz, Registergericht, HRB-Nummer und Geschäftsführer in Geschäftsmails Pflicht (§ 35a GmbHG).</small>
      </label>

      <div class="fsig-aktionen">
        <button type="submit" class="mail-btn ist-primaer" :disabled="laeuft">{{ laeuft ? 'Speichere …' : 'Firmenblock speichern' }}</button>
        <button type="button" class="mail-btn ist-umrandet" :disabled="laeuft" @click="ausFirmendaten">Aus Firmendaten übernehmen</button>
        <span v-if="hinweis" class="fsig-ok">{{ hinweis }}</span>
        <span v-if="fehler" class="fsig-fehler">{{ fehler }}</span>
      </div>
    </form>
  </section>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { signaturApi, fehlerText } from '../services/signaturApi'

const FELDER = ['aktiv', 'firma', 'rechtsform_zusatz', 'strasse', 'plz', 'ort', 'telefon', 'email', 'web', 'zusatz']

const props = defineProps({ daten: { type: Object, required: true } })
const emit = defineEmits(['gespeichert'])

const form = reactive(Object.fromEntries(FELDER.map(f => [f, props.daten.firma[f] ?? (f === 'aktiv' ? true : '')])))
const laeuft = ref(false)
const fehler = ref('')
const hinweis = ref('')
const vorschlagRechtsform = ref('')

function melde(text) {
  hinweis.value = text
  fehler.value = ''
  setTimeout(() => { if (hinweis.value === text) hinweis.value = '' }, 4000)
}

async function speichern() {
  laeuft.value = true
  fehler.value = ''
  try {
    emit('gespeichert', await signaturApi.firmaSpeichern({ ...form }))
    melde('Firmenblock gespeichert.')
  } catch (err) {
    fehler.value = fehlerText(err, 'Speichern fehlgeschlagen.')
  } finally {
    laeuft.value = false
  }
}

async function ausFirmendaten() {
  laeuft.value = true
  fehler.value = ''
  try {
    const v = await signaturApi.firmendatenVorschlag()
    for (const f of ['firma', 'strasse', 'plz', 'ort', 'telefon', 'email']) {
      if (v[f]) form[f] = v[f]
    }
    vorschlagRechtsform.value = v.rechtsform_zusatz_verfuegbar || ''
    melde('Übernommen — bitte prüfen und speichern.')
  } catch (err) {
    fehler.value = fehlerText(err, 'Firmendaten nicht erreichbar.')
  } finally {
    laeuft.value = false
  }
}
</script>

<style scoped>
.fsig {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px dashed var(--mail-rand-stark, #b9b5ac);
  border-radius: var(--mail-radius-klein, 8px);
}
.fsig h4 { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 14px; }
.fsig-nur-admin {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--mail-akzent-weich, rgba(15, 118, 110, .12));
  color: var(--mail-akzent, #0f766e);
}
.fsig-erklaerung { margin: 0; font-size: 12px; color: var(--mail-text-dim, #6d757e); }
.fsig-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 10px; }
.fsig-feld { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--mail-text-dim, #6d757e); }
.fsig-feld small { font-size: 11px; opacity: .9; }
.fsig-feld input, .fsig-feld textarea {
  padding: 6px 8px;
  border: 1px solid var(--mail-rand-stark, #b9b5ac);
  border-radius: var(--mail-radius-klein, 5px);
  background: var(--mail-papier, #fff);
  color: var(--mail-text, #22262b);
  font: inherit;
}
.fsig-feld textarea { resize: vertical; }
.fsig-breit { grid-column: 1 / -1; }
.fsig-check { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.fsig-aktionen { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fsig-ok { color: var(--mail-ok, #15803d); font-size: 12px; }
.fsig-fehler { color: var(--mail-fehler, #b91c1c); font-size: 12px; }
.mail-btn { padding: 6px 12px; border: 1px solid transparent; border-radius: 5px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
</style>
