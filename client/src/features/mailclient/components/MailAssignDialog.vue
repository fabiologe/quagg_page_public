<template>
  <Teleport to="body">
    <div class="mail-dialog-hintergrund" @pointerdown.self="schliessen">
      <div class="mail-dialog">
        <header class="mail-dialog-kopf">
          <MailIcon name="zuweisen" :size="18" />
          <span>Einem Projekt zuweisen</span>
          <button class="mail-btn ist-klein" title="Schließen" @click="schliessen">
            <MailIcon name="schliessen" :size="16" />
          </button>
        </header>

        <div class="mail-dialog-inhalt">
          <p class="mail-zuweisen-mail">
            <strong>{{ mail.subject || '(kein Betreff)' }}</strong><br>
            <span>{{ mail.sender }}</span>
          </p>

          <label class="mail-feld">
            Projektordner
            <input
              ref="suchFeld"
              v-model="suche"
              class="mail-eingabe"
              type="text"
              placeholder="Nummer oder Name tippen …"
              autocomplete="off"
              @keydown.enter.prevent="waehleErsten"
            >
          </label>

          <div v-if="ladeStatus === 'laedt'" class="mail-hinweis"><MailIcon name="laedt" :size="16" class="mail-drehend" /> Lade Projekte …</div>
          <div v-else-if="ladeStatus === 'fehler'" class="mail-hinweis ist-fehler"><MailIcon name="warnung" :size="16" /> {{ ladeFehler }}</div>

          <ul v-else class="mail-zuweisen-liste">
            <li v-for="p in treffer" :key="p">
              <button
                class="mail-zuweisen-eintrag"
                :class="{ 'ist-aktiv': p === gewaehlt }"
                @click="gewaehlt = p"
              >
                <MailIcon name="projekt" :size="16" />
                <span>{{ p }}</span>
              </button>
            </li>
            <li v-if="treffer.length === 0" class="mail-zuweisen-leer">Kein Projekt passt zu „{{ suche }}".</li>
          </ul>

          <div class="mail-hinweis">
            <MailIcon name="info" :size="16" />
            <span>Die .eml und die sauberen Anhänge werden physisch in <code>&lt;Projekt&gt;/E-Mails/</code> verschoben. Quarantäne-Dateien bleiben liegen.</span>
          </div>

          <div v-if="fehler" class="mail-hinweis ist-fehler">
            <MailIcon name="warnung" :size="16" />
            <span>{{ fehler }}</span>
          </div>
        </div>

        <footer class="mail-dialog-fuss">
          <button class="mail-btn" :disabled="laeuft" @click="schliessen">Abbrechen</button>
          <button class="mail-btn ist-primaer" :disabled="!gewaehlt || laeuft" @click="zuweisen">
            <MailIcon :name="laeuft ? 'laedt' : 'ok'" :size="16" :class="{ 'mail-drehend': laeuft }" />
            Zuweisen
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import MailIcon from './MailIcon.vue'
import { useMailStore } from '../stores/useMailStore'
import { mailApi, fehlerText } from '../services/mailApi'

const store = useMailStore()
const mail = store.zuweisenMail

const projekte = ref([])
const ladeStatus = ref('laedt')
const ladeFehler = ref('')
const suche = ref('')
const gewaehlt = ref('')
const laeuft = ref(false)
const fehler = ref('')
const suchFeld = ref(null)

const treffer = computed(() => {
  const q = suche.value.trim().toLowerCase()
  const liste = q ? projekte.value.filter(p => p.toLowerCase().includes(q)) : projekte.value
  return liste.slice(0, 60)
})

onMounted(async () => {
  suchFeld.value?.focus()
  try {
    const liste = await mailApi.projektOrdner()
    projekte.value = [...liste].sort((a, b) => b.localeCompare(a, 'de', { numeric: true }))
    ladeStatus.value = 'fertig'
  } catch (err) {
    ladeStatus.value = 'fehler'
    ladeFehler.value = fehlerText(err, 'Projektliste konnte nicht geladen werden.')
  }
})

function waehleErsten() {
  if (treffer.value.length) gewaehlt.value = treffer.value[0]
}

function schliessen() {
  if (laeuft.value) return
  store.zuweisenMail = null
}

async function zuweisen() {
  if (!gewaehlt.value) return
  laeuft.value = true
  fehler.value = ''
  try {
    await store.weiseZu(mail.id, gewaehlt.value)
    store.zuweisenMail = null
  } catch (err) {
    fehler.value = fehlerText(err, 'Zuweisung fehlgeschlagen.')
  } finally {
    laeuft.value = false
  }
}
</script>

<style scoped>
.mail-zuweisen-mail { margin: 0; font-size: 13px; color: var(--mail-text-dim); }
.mail-zuweisen-mail strong { color: var(--mail-text); }
.mail-zuweisen-liste {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 280px;
  overflow: auto;
  border: 1px solid var(--mail-rand);
  border-radius: var(--mail-radius-klein);
  background: var(--mail-papier);
}
.mail-zuweisen-eintrag {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 36px;
  padding: 0 10px;
  border: 0;
  background: transparent;
  color: var(--mail-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.mail-zuweisen-eintrag:hover { background: var(--mail-flaeche-2); }
.mail-zuweisen-eintrag.ist-aktiv { background: var(--mail-akzent-weich); color: var(--mail-akzent); font-weight: 600; }
.mail-zuweisen-leer { padding: 10px; font-size: 13px; color: var(--mail-text-dim); }
.mail-hinweis code { font-family: var(--mail-schrift-mono); font-size: 12px; }
</style>
