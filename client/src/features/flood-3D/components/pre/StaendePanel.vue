<template>
  <section class="f3d-staende">
    <article class="f3d-card">
      <header class="f3d-card-head">
        <h3>Geometrie-Stände</h3>
        <input v-model="neuerName" class="f3d-select f3d-grow f3d-stand-input"
               placeholder="Name, z. B. „Wehr 30 cm höher“"
               :disabled="beschaeftigt"
               @keyup.enter="sichern" />
        <button class="f3d-btn" :disabled="!neuerName.trim() || beschaeftigt"
                title="Die aktuelle Geometrie unter diesem Namen sichern"
                @click="sichern">Sichern</button>
      </header>

      <p v-if="!store.staende.length" class="f3d-muted f3d-small">
        Noch kein Stand. Ein Stand ist eine benannte Vollkopie der
        Fallgeometrie auf dem Server — Gelände, Bauwerke, Importe und
        Geformtes. So lässt sich das Wehr verschieben, rechnen und danach
        zum alten Zustand zurückkehren. Jeder Lauf sichert seine Geometrie
        außerdem selbst mit (Liste der Läufe: „Geometrie als Stand“).
      </p>

      <div v-for="s in store.staende" :key="s.id" class="f3d-runrow">
        <div class="f3d-runrow-main">
          <span class="f3d-runrow-id">{{ s.name }}</span>
          <span class="f3d-muted f3d-small">{{ fmtZeitpunkt(s.erstellt) }}</span>
          <span class="f3d-chip" :class="{ 'status-completed': istAktuell(s) }"
                :title="hashTitel(s)">{{ kurzHash(s) }}</span>
          <span class="f3d-chip" :title="quelleTitel(s)">{{ quelle(s) }}</span>
          <span class="f3d-muted f3d-small">
            {{ fmtBytes((s.groesse_mb ?? 0) * 1e6) }}
          </span>
        </div>
        <div class="f3d-runrow-actions">
          <button class="f3d-btn" :disabled="beschaeftigt" @click="laden(s)">
            Laden
          </button>
          <button class="f3d-btn" :disabled="beschaeftigt" @click="loeschen(s)">
            Löschen
          </button>
        </div>
      </div>
    </article>
  </section>
</template>

<script setup>
// Phase „Läufe": die gesicherten Geometrie-Stände dieses Falls. Ein Stand
// ist serverseitig eine VOLLKOPIE (case.yaml + sculpt.npz + derived/ +
// imports/) — das Laden ersetzt die Arbeitsgeometrie, deshalb jedes Mal
// eine Rückfrage.
import { computed, onMounted, ref } from 'vue'
import { usePreStore } from '../../stores/usePreStore'
import { fmtBytes, fmtZeitpunkt } from '../../utils/labels'

const store = usePreStore()
const neuerName = ref('')

// Laden/Löschen/Sichern greifen alle auf dieselben Dateien zu — solange
// eines läuft, bleiben die Knöpfe zu.
const beschaeftigt = computed(() => store.staendeLoading || store.loading)

// Der Stempel des offenen Falls ist nur bekannt, wenn der Server ihn
// zuletzt zurückgegeben hat (Speichern, Stand laden). Ohne ihn bleibt der
// Chip neutral, statt eine Gleichheit zu behaupten, die niemand geprüft hat.
const istAktuell = (s) => Boolean(store.caseHash) && s.case_hash === store.caseHash
const kurzHash = (s) => (s.case_hash ? String(s.case_hash).slice(0, 8) : '—')
const hashTitel = (s) => (istAktuell(s)
  ? `Stand-Stempel ${s.case_hash} — entspricht der aktuellen Geometrie`
  : `Stand-Stempel ${s.case_hash ?? 'unbekannt'}`)

function quelle(s) {
  if (s.quelle === 'hand') return 'von Hand'
  if (s.quelle === 'auto') return 'automatisch'
  const lauf = String(s.quelle ?? '').match(/^lauf:(.+)$/)
  return lauf ? `aus Lauf ${lauf[1]}` : (s.quelle || 'unbekannt')
}

const quelleTitel = (s) => ({
  hand: 'Von Hand gesichert',
  auto: 'Automatisch gesichert, bevor ein anderer Stand geladen wurde',
}[s.quelle] ?? `Geometrie eines Rechenlaufs (${s.quelle})`)

async function sichern() {
  const name = neuerName.value.trim()
  if (!name) return
  if (await store.standSichern(name)) neuerName.value = ''
}

function laden(s) {
  if (!window.confirm(
    `Stand „${s.name}" laden?\n\n`
    + 'Die aktuelle Arbeitsgeometrie wird dabei ERSETZT — Gelände, '
    + 'Bauwerke, Importe und Geformtes kommen aus diesem Stand. Der '
    + 'bisherige Zustand wird vorher automatisch gesichert.')) return
  store.standLaden(s.id)
}

function loeschen(s) {
  if (!window.confirm(`Stand „${s.name}" endgültig löschen?`)) return
  store.standLoeschen(s.id)
}

onMounted(() => store.ladeStaende())
</script>

<style scoped>
.f3d-staende {
  max-width: 760px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
/* Die Kopfzeile ist auf Grundlinie ausgerichtet (f3d-card-head) — die
   Eingabe darf sie nicht auseinanderziehen */
.f3d-card-head { flex-wrap: wrap; align-items: center; }
.f3d-stand-input { min-width: 180px; }
</style>
