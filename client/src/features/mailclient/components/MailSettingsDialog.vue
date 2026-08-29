<template>
  <Teleport to="body">
    <div class="mail-dialog-hintergrund" @pointerdown.self="schliessen">
      <div class="mail-dialog ist-breit">
        <header class="mail-dialog-kopf">
          <MailIcon name="einstellungen" :size="18" />
          <span>Einstellungen</span>
          <button class="mail-btn ist-klein" title="Schließen" @click="schliessen">
            <MailIcon name="schliessen" :size="16" />
          </button>
        </header>

        <nav class="mail-reiter" aria-label="Einstellungsbereiche">
          <button
            v-for="r in reiter"
            :key="r.id"
            class="mail-reiter-knopf"
            :class="{ 'ist-aktiv': aktiv === r.id }"
            @click="aktiv = r.id"
          >
            <MailIcon :name="r.icon" :size="15" /> {{ r.titel }}
          </button>
        </nav>

        <div class="mail-dialog-inhalt">
          <MailSignaturForm v-if="aktiv === 'signatur'" />

          <template v-else>
            <div class="mail-hinweis">
              <MailIcon name="info" :size="16" />
              <span>
                Der Abruf prüft jeden Anhang mit libmagic: Nur wenn Endung <em>und</em> erkannter MIME-Typ hier stehen,
                wird die Datei sauber abgelegt — sonst wandert sie in die Quarantäne. Die Prüfung greift beim nächsten Abruf.
              </span>
            </div>

            <div v-if="ladeStatus === 'laedt'" class="mail-hinweis"><MailIcon name="laedt" :size="16" class="mail-drehend" /> Lade …</div>
            <div v-else-if="ladeStatus === 'fehler'" class="mail-hinweis ist-fehler"><MailIcon name="warnung" :size="16" /> {{ fehler }}</div>

            <table v-else class="mail-typen">
              <thead>
                <tr><th>Endung</th><th>MIME-Typ</th><th>Beschreibung</th><th>Aktiv</th><th /></tr>
              </thead>
              <tbody>
                <tr v-for="t in typen" :key="t.id" :class="{ 'ist-inaktiv': !t.is_active }">
                  <td><code>{{ t.extension }}</code></td>
                  <td><code class="mail-typen-mime">{{ t.mime_type }}</code></td>
                  <td>{{ t.description || '—' }}</td>
                  <td>
                    <input type="checkbox" :checked="t.is_active" :disabled="laeuft === t.id" @change="umschalten(t, $event.target.checked)">
                  </td>
                  <td>
                    <button class="mail-btn ist-klein ist-gefaehrlich" title="Endgültig entfernen" :disabled="laeuft === t.id" @click="loeschen(t)">
                      <MailIcon name="loeschen" :size="14" />
                    </button>
                  </td>
                </tr>
                <tr v-if="typen.length === 0"><td colspan="5" class="mail-typen-leer">Noch keine Dateitypen freigegeben — dann landet JEDER Anhang in der Quarantäne.</td></tr>
              </tbody>
            </table>

            <form class="mail-typen-neu" @submit.prevent="anlegen">
              <label class="mail-feld">Endung<input v-model="neu.extension" class="mail-eingabe" placeholder=".dwg" required></label>
              <label class="mail-feld">MIME-Typ (wie libmagic ihn meldet)<input v-model="neu.mime_type" class="mail-eingabe" placeholder="image/vnd.dwg" required></label>
              <label class="mail-feld">Beschreibung<input v-model="neu.description" class="mail-eingabe" placeholder="AutoCAD-Zeichnung"></label>
              <button type="submit" class="mail-btn ist-primaer" :disabled="laeuft === 'neu'">
                <MailIcon name="plus" :size="16" /> Hinzufügen
              </button>
            </form>

            <div v-if="aktionFehler" class="mail-hinweis ist-fehler">
              <MailIcon name="warnung" :size="16" />
              <span>{{ aktionFehler }}</span>
            </div>
          </template>
        </div>

        <footer class="mail-dialog-fuss">
          <button class="mail-btn ist-primaer" @click="schliessen">Fertig</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import MailIcon from './MailIcon.vue'
import MailSignaturForm from './MailSignaturForm.vue'
import { useMailStore } from '../stores/useMailStore'
import { mailApi, fehlerText } from '../services/mailApi'

const store = useMailStore()
const typen = ref([])
const ladeStatus = ref('leer')
const fehler = ref('')
const aktionFehler = ref('')
const laeuft = ref(null)
const neu = reactive({ extension: '', mime_type: '', description: '' })

// Signatur pflegt jeder selbst; die Anhang-Allowlist wirkt firmenweit (ab MITARBEITER)
const reiter = computed(() => [
  { id: 'signatur', titel: 'Signatur', icon: 'verfassen' },
  ...(store.darfBearbeiten ? [{ id: 'dateitypen', titel: 'Anhänge', icon: 'anhang' }] : []),
])
const aktiv = ref('signatur')

async function laden() {
  if (typen.value.length || ladeStatus.value === 'laedt') return
  ladeStatus.value = 'laedt'
  try {
    typen.value = await mailApi.dateitypen()
    ladeStatus.value = 'fertig'
  } catch (err) {
    ladeStatus.value = 'fehler'
    fehler.value = fehlerText(err, 'Dateitypen konnten nicht geladen werden.')
  }
}
watch(aktiv, (r) => { if (r === 'dateitypen') laden() }, { immediate: true })

function schliessen() {
  store.einstellungenOffen = false
}

async function umschalten(t, aktivWert) {
  aktionFehler.value = ''
  laeuft.value = t.id
  try {
    const geaendert = await mailApi.dateitypAendern(t.id, { is_active: aktivWert })
    typen.value = typen.value.map(x => (x.id === t.id ? geaendert : x))
  } catch (err) {
    aktionFehler.value = fehlerText(err, 'Änderung fehlgeschlagen.')
  } finally {
    laeuft.value = null
  }
}

async function loeschen(t) {
  if (!window.confirm(`Dateityp ${t.extension} endgültig aus der Allowlist entfernen?`)) return
  aktionFehler.value = ''
  laeuft.value = t.id
  try {
    await mailApi.dateitypLoeschen(t.id)
    typen.value = typen.value.filter(x => x.id !== t.id)
  } catch (err) {
    aktionFehler.value = fehlerText(err, 'Löschen fehlgeschlagen.')
  } finally {
    laeuft.value = null
  }
}

async function anlegen() {
  aktionFehler.value = ''
  laeuft.value = 'neu'
  const ext = neu.extension.trim().toLowerCase()
  try {
    const angelegt = await mailApi.dateitypAnlegen({
      extension: ext.startsWith('.') ? ext : `.${ext}`,
      mime_type: neu.mime_type.trim().toLowerCase(),
      description: neu.description.trim() || null,
      is_active: true,
    })
    typen.value = [...typen.value, angelegt].sort((a, b) => a.extension.localeCompare(b.extension))
    neu.extension = ''
    neu.mime_type = ''
    neu.description = ''
  } catch (err) {
    aktionFehler.value = fehlerText(err, 'Anlegen fehlgeschlagen.')
  } finally {
    laeuft.value = null
  }
}
</script>

<style scoped>
.mail-reiter { display: flex; gap: 2px; padding: 0 12px; border-bottom: 1px solid var(--mail-rand); }
.mail-reiter-knopf {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--mail-text-dim);
  font: inherit;
  cursor: pointer;
}
.mail-reiter-knopf:hover { color: var(--mail-text); }
.mail-reiter-knopf.ist-aktiv { color: var(--mail-akzent); border-bottom-color: var(--mail-akzent); font-weight: 600; }

.mail-typen { width: 100%; border-collapse: collapse; font-size: 13px; }
.mail-typen th { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--mail-rand-stark); color: var(--mail-text-dim); font-weight: 600; }
.mail-typen td { padding: 4px 8px; border-bottom: 1px solid var(--mail-rand); vertical-align: middle; }
.mail-typen tr.ist-inaktiv td { color: var(--mail-text-dim); }
.mail-typen code { font-family: var(--mail-schrift-mono); font-size: 12px; }
.mail-typen-mime { word-break: break-all; }
.mail-typen-leer { color: var(--mail-warn); }
.mail-typen-neu {
  display: grid;
  grid-template-columns: 110px 1fr 1fr auto;
  gap: 8px;
  align-items: end;
  padding: 10px;
  border: 1px dashed var(--mail-rand-stark);
  border-radius: var(--mail-radius-klein);
}
@media (max-width: 640px) {
  .mail-typen-neu { grid-template-columns: 1fr; }
}
</style>
