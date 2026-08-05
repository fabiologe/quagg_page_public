<template>
  <section class="f3d-card f3d-meshpreview">
    <header class="f3d-card-head"><h3>Netz- und Kostenvorschau</h3></header>
    <div v-if="store.meshPreviewStale && !store.meshPreviewLoading"
         class="f3d-stale">
      <p>
        ⚠ Seit diesem Vorschaunetz hat sich die Geometrie geändert (Gebiet,
        Gelände, Bauwerk, Verfeinerung oder Randfenster). Die Zahlen unten und
        die Netzansicht zeigen den ALTEN Zustand.
      </p>
      <button class="f3d-btn" :disabled="store.loading"
              @click="store.runMeshPreview()">
        ↻ Vorschau neu ausführen
      </button>
    </div>
    <p v-if="store.meshPreviewLoading" class="f3d-muted">
      blockMesh + snappyHexMesh + checkMesh laufen im Container …
    </p>
    <dl v-else-if="p" class="f3d-stats">
      <div class="f3d-stat">
        <dt>Zellenzahl</dt>
        <dd>{{ p.cells?.toLocaleString('de-DE') }}</dd>
      </div>
      <div class="f3d-stat">
        <dt>checkMesh</dt>
        <dd :class="p.checkmesh_ok ? 'good' : 'bad'">
          {{ p.checkmesh_ok ? 'in Ordnung' : `fehlgeschlagen (${p.failed_checks})` }}
        </dd>
      </div>
      <div class="f3d-stat">
        <dt>Max. Nichtorthogonalität</dt>
        <dd :class="p.max_non_ortho > 65 ? 'bad' : ''">{{ fmt(p.max_non_ortho) }}°</dd>
      </div>
      <div class="f3d-stat">
        <dt>Max. Schiefe</dt>
        <dd :class="p.max_skewness > 4 ? 'bad' : ''">{{ fmt(p.max_skewness) }}</dd>
      </div>
      <div class="f3d-stat">
        <dt>Zeitschritt (geschätzt)</dt>
        <dd>{{ fmt(p.dt_estimate_s) }} s</dd>
      </div>
      <div class="f3d-stat">
        <dt>Laufzeit ({{ p.cores }} Kerne, geschätzt)</dt>
        <dd>{{ fmt(p.wall_time_estimate_h * 60) }} min</dd>
      </div>
      <div class="f3d-stat">
        <dt>Kosten (geschätzt)</dt>
        <dd>{{ p.cost_estimate_eur?.toFixed(2) }} €</dd>
      </div>
    </dl>
    <p v-if="p" class="f3d-muted f3d-small">{{ p.hinweis }}</p>
  </section>
</template>

<script setup>
// Netz- und Kostenvorschau (Spez. Kap. 6.1) — steht zwischen Bearbeitung
// und Absenden: erst wenn das Vorschaunetz in Ordnung ist, lohnt der Lauf.
import { computed } from 'vue'
import { usePreStore } from '../../stores/usePreStore'
import { fmt as fmtNum } from '../../utils/labels'

const store = usePreStore()
const p = computed(() => store.meshPreview)
const fmt = (v) => fmtNum(v)
</script>

<style scoped>
.f3d-stale {
  margin: 0 0 6px;
  color: var(--f3d-warn);
  font-size: 0.74rem;
  line-height: 1.35;
  border-left: 3px solid var(--f3d-warn);
  padding: 4px 8px;
}
.f3d-stale p { margin: 0 0 5px; }
.f3d-stats { display: flex; flex-direction: column; gap: 5px; margin: 0; }
.f3d-stat { display: flex; justify-content: space-between; gap: 12px; }
.f3d-stat dt { color: var(--f3d-text-2); font-size: 0.78rem; }
.f3d-stat dd {
  margin: 0;
  color: var(--f3d-text);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}
.f3d-stat dd.good { color: var(--f3d-good); }
.f3d-stat dd.bad { color: var(--f3d-bad); }
</style>
