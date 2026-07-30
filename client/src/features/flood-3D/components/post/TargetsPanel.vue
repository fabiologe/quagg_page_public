<template>
  <section class="f3d-targets">
    <article v-for="entry in entries" :key="entry.runId" class="f3d-card">
      <header class="f3d-card-head">
        <h3>{{ entry.runId }}</h3>
        <span v-if="entry.regelwerk?.length" class="f3d-muted">
          Regelwerk: {{ entry.regelwerk.join(', ') }}
        </span>
      </header>

      <p v-if="entry.error" class="f3d-error">{{ entry.error }}</p>

      <div v-else class="f3d-table-wrap">
        <table class="f3d-table">
          <thead>
            <tr>
              <th>Nachweiskriterium</th>
              <th>Kennwert</th>
              <th>Grenzwert</th>
              <th>Ausnutzung</th>
              <th>Bewertung</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in entry.targets" :key="t.id">
              <td>
                <div class="f3d-target-name">{{ KIND_LABELS[t.kind] ?? t.kind }}</div>
                <div class="f3d-muted f3d-small">{{ t.id }}</div>
              </td>
              <td>
                {{ fmt(t.value, t.unit) }}
                <div v-if="t.time_of_occurrence != null" class="f3d-muted f3d-small">
                  bei t = {{ fmt(t.time_of_occurrence, 's') }}
                </div>
              </td>
              <td>
                <template v-if="t.limit_max != null">≤ {{ fmt(t.limit_max, t.unit) }}</template>
                <template v-else-if="t.limit_min != null">≥ {{ fmt(t.limit_min, t.unit) }}</template>
                <template v-else>–</template>
              </td>
              <td>
                <div v-if="t.utilisation != null" class="f3d-util">
                  <div class="f3d-util-bar">
                    <div class="f3d-util-fill"
                         :class="{ over: t.utilisation > 1 }"
                         :style="{ width: `${Math.min(t.utilisation, 1) * 100}%` }"></div>
                  </div>
                  <span>{{ fmtPercent(t.utilisation) }}</span>
                </div>
                <span v-else>–</span>
              </td>
              <td>
                <span class="f3d-badge" :class="`res-${t.result}`">
                  {{ badgeIcon(t.result) }} {{ RESULT_LABELS[t.result] ?? t.result }}
                </span>
                <div v-if="t.message" class="f3d-muted f3d-small">{{ t.message }}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>

    <p v-if="!entries.length" class="f3d-muted">Keinen Lauf ausgewählt.</p>
  </section>
</template>

<script setup>
import { ref, watchEffect } from 'vue'
import { usePostStore } from '../../stores/usePostStore'
import { KIND_LABELS, RESULT_LABELS, fmt, fmtPercent } from '../../utils/labels'

const store = usePostStore()
const entries = ref([])

function badgeIcon(result) {
  return { erfuellt: '✓', nicht_erfuellt: '✗', informativ: 'ℹ', nicht_auswertbar: '—' }[result] ?? ''
}

watchEffect(async () => {
  const ids = [...store.selectedRunIds]
  entries.value = await Promise.all(ids.map(async (runId) => {
    try {
      const result = await store.ensureResult(runId)
      return {
        runId,
        targets: result.targets ?? [],
        regelwerk: result.nachweis?.regelwerk ?? [],
      }
    } catch (e) {
      return { runId, targets: [], error: e.message }
    }
  }))
})
</script>

<style scoped>
.f3d-targets { display: flex; flex-direction: column; gap: 16px; }
.f3d-target-name { font-weight: 600; color: var(--f3d-text); }
.f3d-util { display: flex; align-items: center; gap: 8px; }
.f3d-util-bar {
  width: 90px;
  height: 6px;
  border-radius: 3px;
  background: var(--f3d-border);
  overflow: hidden;
}
.f3d-util-fill { height: 100%; background: var(--f3d-good); }
.f3d-util-fill.over { background: var(--f3d-bad); }
</style>
