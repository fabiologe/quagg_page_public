<template>
  <section class="f3d-figures">
    <article v-for="entry in entries" :key="entry.runId" class="f3d-card">
      <header class="f3d-card-head"><h3>{{ entry.runId }}</h3></header>
      <p v-if="!entry.figures.length" class="f3d-muted">Keine Abbildungen vorhanden.</p>
      <div class="f3d-figure-grid">
        <figure v-for="fig in entry.figures" :key="fig.id" class="f3d-figure">
          <img :src="pngUrl(entry.runId, fig)" :alt="fig.caption" loading="lazy" />
          <figcaption>
            {{ fig.caption }}
            <span class="f3d-figure-links">
              <a :href="pngUrl(entry.runId, fig)" target="_blank" rel="noopener">PNG</a>
              <a :href="svgUrl(entry.runId, fig)" target="_blank" rel="noopener">SVG</a>
            </span>
          </figcaption>
        </figure>
      </div>
    </article>
    <p v-if="!entries.length" class="f3d-muted">Keinen Lauf ausgewählt.</p>
  </section>
</template>

<script setup>
// Abbildungsexport (Spez. Kap. 8): die serverseitig gerenderten
// Berichtsabbildungen mit Laufkennung in der Bildunterschrift, als PNG und
// SVG abrufbar.
import { ref, watchEffect } from 'vue'
import { flood3dApi } from '../../services/api'
import { usePostStore } from '../../stores/usePostStore'

const store = usePostStore()
const entries = ref([])

const pngUrl = (runId, fig) => flood3dApi.figureUrl(runId, `${fig.id}.png`)
const svgUrl = (runId, fig) => flood3dApi.figureUrl(runId, `${fig.id}.svg`)

watchEffect(async () => {
  const ids = [...store.selectedRunIds]
  entries.value = await Promise.all(ids.map(async (runId) => {
    try {
      const result = await store.ensureResult(runId)
      return { runId, figures: result.figures ?? [] }
    } catch {
      return { runId, figures: [] }
    }
  }))
})
</script>

<style scoped>
.f3d-figures { display: flex; flex-direction: column; gap: 16px; }
.f3d-figure-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
}
.f3d-figure {
  margin: 0;
  background: var(--f3d-bg);
  border: 1px solid var(--f3d-border);
  border-radius: 8px;
  overflow: hidden;
}
.f3d-figure img { display: block; width: 100%; height: auto; background: #fff; }
.f3d-figure figcaption {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  color: var(--f3d-text-2);
  font-size: 0.75rem;
}
.f3d-figure-links { display: flex; gap: 8px; }
.f3d-figure-links a { color: var(--f3d-accent); text-decoration: none; }
</style>
