<template>
  <section class="f3d-sectionview f3d-card">
    <header class="f3d-card-head">
      <h3>Längsschnitt (Gelände)</h3>
      <select v-model="choice" class="f3d-select">
        <option value="">Linie wählen …</option>
        <option v-for="s in sections" :key="s.id" :value="s.id">
          Querschnitt {{ s.id }}
        </option>
        <option value="__frei">freie Linie</option>
      </select>
      <template v-if="choice === '__frei'">
        <input v-model="freeLine" class="f3d-num f3d-grow"
               placeholder="x1,y1 x2,y2" />
        <button class="f3d-btn" :disabled="busy" @click="loadProfile">Zeigen</button>
      </template>
    </header>
    <p v-if="error" class="f3d-error">{{ error }}</p>
    <UPlotChart v-if="series.length" :series="series" :height="200"
                ylabel="Höhe in m NHN" xlabel="Station in m"
                sync-key="f3d-schnitt" />
    <p v-else class="f3d-muted f3d-small">
      Der Längsschnitt prüft, ob Netzverfeinerung und Wasserspiegel
      vertikal zusammenpassen (Spez. Kap. 6.1).
    </p>
  </section>
</template>

<script setup>
// Schnittansicht (Spez. Kap. 6.1): Geländeprofil entlang einer wählbaren
// Linie, mit dem Anfangswasserspiegel als Hilfslinie.
import { computed, ref, watch } from 'vue'
import { flood3dApi } from '../../services/api'
import { usePreStore } from '../../stores/usePreStore'
import UPlotChart from '../post/UPlotChart.vue'

const store = usePreStore()
const choice = ref('')
const freeLine = ref('')
const series = ref([])
const error = ref('')
// Doppelklick soll nicht zwei Profilanfragen auslösen
const busy = ref(false)

const sections = computed(() => store.spec?.evaluation?.sections ?? [])

function currentPolyline() {
  if (choice.value === '__frei') {
    const pts = freeLine.value.trim().split(/\s+/)
      .map((p) => p.split(',').map(Number))
    return pts.length >= 2 && pts.every((p) => p.length === 2
      && p.every(Number.isFinite)) ? pts : null
  }
  return sections.value.find((s) => s.id === choice.value)?.polyline ?? null
}

async function loadProfile() {
  if (busy.value) return
  error.value = ''
  const polyline = currentPolyline()
  if (!polyline) { series.value = []; return }
  busy.value = true
  try {
    const p = await flood3dApi.caseProfile(store.activeCaseId, polyline)
    const out = [{ label: 'Gelände', t: p.s, v: p.ground, color: '#c98500' }]
    if (p.initial_level != null) {
      out.push({ label: 'Anfangswasserspiegel',
        t: [p.s[0], p.s[p.s.length - 1]],
        v: [p.initial_level, p.initial_level],
        color: '#3987e5', dash: [6, 4], width: 1.5 })
    }
    series.value = out
  } catch (e) {
    error.value = e.message
    series.value = []
  } finally {
    busy.value = false
  }
}

watch(choice, () => { if (choice.value !== '__frei') loadProfile() })
// nach Speichern (Geometrie neu) Profil aktualisieren
watch(() => store.geometryVersion, () => { if (choice.value) loadProfile() })
</script>

<style scoped>
.f3d-sectionview .f3d-card-head { gap: 8px; flex-wrap: wrap; }
</style>
