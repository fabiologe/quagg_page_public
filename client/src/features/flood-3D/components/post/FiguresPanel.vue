<template>
  <section class="f3d-figures">
    <article v-for="entry in entries" :key="entry.runId" class="f3d-card">
      <header class="f3d-card-head"><h3>{{ entry.runId }}</h3></header>
      <p v-if="entry.error" class="f3d-error">
        Abbildungen nicht abrufbar: {{ entry.error }}
      </p>
      <p v-else-if="!entry.figures.length" class="f3d-muted">Keine Abbildungen vorhanden.</p>
      <div class="f3d-figure-grid">
        <figure v-for="fig in entry.figures" :key="fig.id" class="f3d-figure">
          <img :src="pngUrl(entry.runId, fig)" :alt="fig.caption" loading="lazy" />
          <figcaption>
            {{ fig.caption }}
            <span class="f3d-figure-links">
              <a :href="pngUrl(entry.runId, fig)" target="_blank" rel="noopener">PNG</a>
              <!-- Im Browser gerechnete Karten haben kein SVG: sie
                   entstehen auf einem Canvas, nicht in matplotlib. -->
              <a v-if="fig.quelle !== 'client'" :href="svgUrl(entry.runId, fig)"
                 target="_blank" rel="noopener">SVG</a>
              <button v-if="fig.quelle === 'client'" class="f3d-figure-weg"
                      type="button" title="Abbildung aus dem Bericht entfernen"
                      @click="entfernen(entry.runId, fig.id)">entfernen</button>
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
const stand = ref(0)          // erzwingt ein Neuladen nach dem Entfernen

async function entfernen(runId, figId) {
  if (!globalThis.confirm(`Abbildung „${figId}" aus dem Bericht entfernen?`)) {
    return
  }
  await flood3dApi.abbildungLoeschen(runId, figId)
  stand.value++
}
const svgUrl = (runId, fig) => flood3dApi.figureUrl(runId, `${fig.id}.svg`)

watchEffect(async () => {
  const ids = [...store.selectedRunIds]
  void stand.value                       // nach dem Entfernen neu laden
  entries.value = await Promise.all(ids.map(async (runId) => {
    try {
      // Serverseitig gerenderte UND im Browser gerechnete zusammen: die
      // Laubkarten entstehen im Client und liegen deshalb in einer
      // eigenen Datei neben result.json (die wird beim Auswerten neu
      // geschrieben).
      const a = await flood3dApi.abbildungen(runId)
      return { runId, figures: [...(a.figures ?? []), ...(a.client ?? [])] }
    } catch (e) {
      // Fehler NICHT zu „keine Abbildungen" machen — ein 500er sah
      // vorher aus wie ein Lauf ohne Bilder
      return { runId, figures: [], error: e.message }
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
/* Entfernen sieht aus wie die Links daneben, ist aber ein Knopf — es
   ändert etwas, statt nur zu öffnen. */
.f3d-figure-weg {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--f3d-text-2);
  cursor: pointer;
}
.f3d-figure-weg:hover { color: var(--f3d-bad); }
</style>
