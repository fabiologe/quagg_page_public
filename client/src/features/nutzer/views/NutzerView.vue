<template>
  <InternLayout>
    <div class="nutzer">
      <header class="nutzer-kopf">
        <div>
          <h1>Nutzer</h1>
          <p class="nutzer-hinweis">Konten, Rollen und Passwörter. Deaktivieren statt löschen — Audit-Spuren bleiben nachvollziehbar.</p>
        </div>
        <button class="nutzer-btn ist-primaer" @click="formOffen = !formOffen">{{ formOffen ? 'Abbrechen' : 'Neuer Nutzer' }}</button>
      </header>

      <section class="nutzer-rollen">
        <span v-for="r in ROLLEN" :key="r" class="nutzer-rolle-chip"><strong>{{ ROLLEN_LABEL[r] }}</strong> {{ ROLLEN_TEXT[r] }}</span>
      </section>

      <form v-if="formOffen" class="nutzer-form" @submit.prevent="anlegen">
        <label>Nutzername<input v-model="neu.username" required minlength="3" maxlength="40" pattern="[A-Za-z0-9._\-]+" autocomplete="off" placeholder="vorname.nachname"></label>
        <label>Anzeigename<input v-model="neu.anzeigename" placeholder="Max Mustermann"></label>
        <label>Rolle
          <select v-model="neu.rolle">
            <option v-for="r in ROLLEN" :key="r" :value="r">{{ ROLLEN_LABEL[r] }}</option>
          </select>
        </label>
        <label>Erst-Passwort<input v-model="neu.passwort" type="text" required minlength="10" autocomplete="off" placeholder="mind. 10 Zeichen"></label>
        <label class="nutzer-check"><input v-model="neu.muss_passwort_aendern" type="checkbox"> Beim ersten Login ändern lassen</label>
        <button type="submit" class="nutzer-btn ist-primaer" :disabled="laeuft === 'neu'">Anlegen</button>
        <p v-if="formFehler" class="nutzer-fehler">{{ formFehler }}</p>
      </form>

      <p v-if="store.fehler" class="nutzer-fehler">{{ store.fehler }}</p>
      <p v-if="aktionFehler" class="nutzer-fehler">{{ aktionFehler }}</p>
      <p v-if="aktionOk" class="nutzer-ok">{{ aktionOk }}</p>

      <table class="nutzer-tabelle">
        <thead>
          <tr><th>Nutzername</th><th>Anzeigename</th><th>Rolle</th><th>Aktiv</th><th>Passwort</th><th>Angelegt</th></tr>
        </thead>
        <tbody>
          <tr v-for="n in store.nutzer" :key="n.id" :class="{ 'ist-inaktiv': !n.is_active, 'ist-ich': n.id === auth.user?.id }">
            <td>
              <code>{{ n.username }}</code>
              <span v-if="n.id === auth.user?.id" class="nutzer-badge">ich</span>
              <span v-if="n.muss_passwort_aendern" class="nutzer-badge ist-warn" title="Muss beim nächsten Login ein neues Passwort setzen">Passwortwechsel offen</span>
            </td>
            <td>
              <input
                class="nutzer-inline"
                :value="n.anzeigename"
                placeholder="—"
                @change="aendern(n, { anzeigename: $event.target.value })"
              >
            </td>
            <td>
              <select
                :value="n.rolle"
                :disabled="n.id === auth.user?.id || laeuft === n.id"
                :title="n.id === auth.user?.id ? 'Eigene Rolle kann nur ein anderer Admin ändern' : ''"
                @change="aendern(n, { rolle: $event.target.value })"
              >
                <option v-for="r in ROLLEN" :key="r" :value="r">{{ ROLLEN_LABEL[r] }}</option>
              </select>
            </td>
            <td>
              <input
                type="checkbox"
                :checked="n.is_active"
                :disabled="n.id === auth.user?.id || laeuft === n.id"
                :title="n.id === auth.user?.id ? 'Eigenen Status kann nur ein anderer Admin ändern' : ''"
                @change="aendern(n, { is_active: $event.target.checked })"
              >
            </td>
            <td>
              <template v-if="resetFuer === n.id">
                <input v-model="resetPasswort" class="nutzer-inline" type="text" minlength="10" placeholder="neues Passwort (≥ 10)" autocomplete="off">
                <button class="nutzer-btn ist-klein ist-primaer" :disabled="laeuft === n.id" @click="passwortReset(n)">Setzen</button>
                <button class="nutzer-btn ist-klein" @click="resetFuer = null">Abbrechen</button>
              </template>
              <button v-else class="nutzer-btn ist-klein" :disabled="laeuft === n.id" @click="resetFuer = n.id; resetPasswort = ''">Zurücksetzen</button>
            </td>
            <td class="nutzer-datum">{{ formatDatum(n.erstellt_am) }}</td>
          </tr>
          <tr v-if="!store.laedt && store.nutzer.length === 0"><td colspan="6">Keine Nutzer.</td></tr>
        </tbody>
      </table>
    </div>
  </InternLayout>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import InternLayout from '@/components/layout/InternLayout.vue'
import { useAuthStore } from '@/stores/useAuthStore'
import { ROLLEN, ROLLEN_LABEL } from '@/services/rollen'
import { useNutzerStore } from '../stores/useNutzerStore'
import { fehlerText } from '../services/nutzerApi'

const ROLLEN_TEXT = {
  ADMIN: 'alles, Buchhaltung, Rechnungslegung, Nutzer',
  MITARBEITER: 'Projekte, Mails (auch senden), Dokumente, Werkzeuge',
  WERKSTUDENT: 'wie Mitarbeiter, Mails nur lesen',
  EXTERN: 'nur Kundenportal mit freigegebenen Projekten',
}

const auth = useAuthStore()
const store = useNutzerStore()

const formOffen = ref(false)
const neu = reactive({ username: '', anzeigename: '', rolle: 'MITARBEITER', passwort: '', muss_passwort_aendern: true })
const formFehler = ref('')
const aktionFehler = ref('')
const aktionOk = ref('')
const laeuft = ref(null)
const resetFuer = ref(null)
const resetPasswort = ref('')

onMounted(store.laden)

function meldeOk(text) {
  aktionOk.value = text
  aktionFehler.value = ''
  setTimeout(() => { if (aktionOk.value === text) aktionOk.value = '' }, 4000)
}

async function anlegen() {
  formFehler.value = ''
  laeuft.value = 'neu'
  try {
    const angelegt = await store.anlegen({ ...neu, username: neu.username.trim(), anzeigename: neu.anzeigename.trim() })
    meldeOk(`Nutzer ${angelegt.username} angelegt.`)
    Object.assign(neu, { username: '', anzeigename: '', rolle: 'MITARBEITER', passwort: '', muss_passwort_aendern: true })
    formOffen.value = false
  } catch (err) {
    formFehler.value = fehlerText(err, 'Anlegen fehlgeschlagen.')
  } finally {
    laeuft.value = null
  }
}

async function aendern(n, payload) {
  aktionFehler.value = ''
  laeuft.value = n.id
  try {
    await store.aendern(n.id, payload)
    meldeOk(`${n.username} aktualisiert.`)
  } catch (err) {
    aktionFehler.value = fehlerText(err, 'Änderung fehlgeschlagen.')
    await store.laden()   // Anzeige zurück auf den echten Stand
  } finally {
    laeuft.value = null
  }
}

async function passwortReset(n) {
  aktionFehler.value = ''
  laeuft.value = n.id
  try {
    await store.passwortReset(n.id, resetPasswort.value)
    meldeOk(`Passwort von ${n.username} zurückgesetzt — muss beim nächsten Login geändert werden.`)
    resetFuer.value = null
    resetPasswort.value = ''
  } catch (err) {
    aktionFehler.value = fehlerText(err, 'Zurücksetzen fehlgeschlagen.')
  } finally {
    laeuft.value = null
  }
}

function formatDatum(iso) {
  if (!iso) return '—'
  const d = new Date(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('de-DE')
}
</script>

<style scoped>
.nutzer { max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 1rem; }
.nutzer-kopf { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
.nutzer-kopf h1 { margin: 0 0 .25rem; }
.nutzer-hinweis { margin: 0; opacity: .75; font-size: .92rem; }
.nutzer-rollen { display: flex; flex-wrap: wrap; gap: .5rem; font-size: .85rem; }
.nutzer-rolle-chip { padding: .3rem .6rem; border: 1px solid currentColor; border-radius: 999px; opacity: .85; }
.nutzer-rolle-chip strong { margin-right: .3rem; }
.nutzer-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: .75rem; align-items: end; padding: 1rem; border: 1px dashed currentColor; border-radius: 6px; }
.nutzer-form label { display: flex; flex-direction: column; gap: .25rem; font-size: .88rem; }
.nutzer-form input, .nutzer-form select, .nutzer-inline, .nutzer-tabelle select { padding: .4rem .5rem; border: 1px solid #b9b5ac; border-radius: 4px; font: inherit; background: white; color: inherit; }
.nutzer-check { flex-direction: row !important; align-items: center; }
.nutzer-btn { padding: .5rem .9rem; border: 1px solid #b9b5ac; border-radius: 4px; background: white; color: inherit; font: inherit; cursor: pointer; }
.nutzer-btn.ist-primaer { background: #0f766e; border-color: #0f766e; color: white; }
.nutzer-btn.ist-klein { padding: .3rem .6rem; font-size: .85rem; }
.nutzer-btn:disabled { opacity: .5; cursor: default; }
.nutzer-fehler { margin: 0; padding: .6rem .8rem; border-radius: 4px; background: rgba(185, 28, 28, .1); color: #b91c1c; }
.nutzer-ok { margin: 0; padding: .6rem .8rem; border-radius: 4px; background: rgba(21, 128, 61, .12); color: #15803d; }
.nutzer-tabelle { width: 100%; border-collapse: collapse; font-size: .92rem; }
.nutzer-tabelle th { text-align: left; padding: .5rem; border-bottom: 2px solid #b9b5ac; }
.nutzer-tabelle td { padding: .45rem .5rem; border-bottom: 1px solid #d6d3cc; vertical-align: middle; }
.nutzer-tabelle tr.ist-inaktiv td { opacity: .55; }
.nutzer-tabelle tr.ist-ich td:first-child { font-weight: 600; }
.nutzer-badge { margin-left: .4rem; padding: .1rem .45rem; border-radius: 999px; background: #e2dfd9; font-size: .75rem; }
.nutzer-badge.ist-warn { background: rgba(180, 83, 9, .15); color: #b45309; }
.nutzer-inline { min-width: 9rem; }
.nutzer-datum { white-space: nowrap; opacity: .75; }
td .nutzer-btn { margin-left: .3rem; }
</style>
