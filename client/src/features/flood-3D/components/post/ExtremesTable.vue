<template>
  <section class="f3d-extremes">
    <article v-for="entry in entries" :key="entry.runId" class="f3d-card">
      <header class="f3d-card-head"><h3>{{ entry.runId }}</h3></header>
      <p v-if="entry.error" class="f3d-error">{{ entry.error }}</p>
      <div v-else class="f3d-table-wrap">
        <table class="f3d-table">
          <thead>
            <tr>
              <th>Ort</th>
              <th>Größe</th>
              <th>Art</th>
              <th>Extremwert</th>
              <th>Zeitpunkt</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(e, i) in entry.extremes" :key="i">
              <td>{{ e.location_id }}</td>
              <td>{{ QUANTITY_LABELS[e.quantity] ?? e.quantity }}
                <span v-if="e.component && e.component !== 'magnitude'"
                      class="f3d-muted"> ({{ e.component }})</span>
              </td>
              <td>{{ STAT_LABELS[e.stat] ?? e.stat ?? '–' }}</td>
              <td class="f3d-num">{{ fmt(e.value, e.unit) }}</td>
              <td class="f3d-num">{{ fmt(e.time_of_occurrence, 's') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
    <p v-if="!entries.length" class="f3d-muted">Keinen Lauf ausgewählt.</p>
  </section>
</template>

<script setup>
// Extremwerttabelle (Spez. Kap. 8) — direkter Zulieferer der Nachweistabelle.
import { ref, watchEffect } from 'vue'
import { usePostStore } from '../../stores/usePostStore'
import { QUANTITY_LABELS, STAT_LABELS, fmt } from '../../utils/labels'

const store = usePostStore()
const entries = ref([])

watchEffect(async () => {
  const ids = [...store.selectedRunIds]
  entries.value = await Promise.all(ids.map(async (runId) => {
    try {
      return { runId, extremes: await store.ensureExtremes(runId) }
    } catch (e) {
      return { runId, extremes: [], error: e.message }
    }
  }))
})
</script>

<style scoped>
.f3d-extremes { display: flex; flex-direction: column; gap: 16px; }
.f3d-num { font-variant-numeric: tabular-nums; }
</style>
