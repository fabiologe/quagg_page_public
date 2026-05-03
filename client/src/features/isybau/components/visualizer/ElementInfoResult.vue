<template>
  <Transition name="slide-up">
    <div v-if="selectedElement" class="info-window" @click.stop>

      <!-- Header -->
      <div class="info-header">
        <div class="info-title">
          <span class="info-type-badge">{{ typeLabel }}</span>
          <strong class="info-id">{{ selectedElement.id }}</strong>
        </div>
        <button @click="$emit('close')" class="close-btn" title="Schließen">×</button>
      </div>

      <!-- Content -->
      <div class="info-content">

        <!-- ── Haltung ── -->
        <template v-if="elementType === 'edge'">
          <div class="info-grid">
            <span class="lbl">Von → Nach</span>
            <span>{{ selectedElement.from }} → {{ selectedElement.to }}</span>
            <span class="lbl">Profil</span>
            <span>{{ profileLabel }}</span>
            <span class="lbl">DN / B×H</span>
            <span>{{ dnLabel }}</span>
            <span class="lbl">Material</span>
            <span>{{ selectedElement.material || '-' }}</span>
            <span class="lbl">Länge</span>
            <span>{{ selectedElement.length?.toFixed(2) }} m</span>
          </div>

          <template v-if="edgeResult">
            <div class="info-divider"></div>
            <div class="section-title">Simulationsergebnisse</div>
            <div class="info-grid">
              <span class="lbl">Gefälle</span>
              <span>{{ edgeResult.slope?.toFixed(2) }} ‰</span>
              <span class="lbl">Qvoll</span>
              <span>{{ edgeResult.capacity?.toFixed(1) }} l/s</span>
              <span class="lbl">Max. Q</span>
              <span>{{ edgeResult.maxFlow?.toFixed(1) }} l/s</span>
              <span class="lbl">Q/Qvoll</span>
              <span :class="utilizationClass(edgeResult.utilization)">
                {{ edgeResult.utilization?.toFixed(0) ?? '-' }} %
              </span>
              <span class="lbl">h/hvoll</span>
              <span :class="utilizationClass(edgeResult.depthRatio)">
                {{ edgeResult.depthRatio?.toFixed(0) ?? '-' }} %
              </span>
              <span class="lbl">Max. v</span>
              <span>{{ edgeResult.maxVelocity?.toFixed(2) ?? '-' }} m/s</span>
            </div>
            <div v-if="edgeResult.utilization > 90" class="status-badge status-red">
              ⚠ Überlastet — Q/Qvoll {{ edgeResult.utilization?.toFixed(0) }}%
            </div>
            <div v-else-if="edgeResult.utilization >= 75" class="status-badge status-orange">
              ⚠ Teilweise ausgelastet
            </div>
          </template>
          <div v-else class="no-results">Keine Simulationsergebnisse verfügbar</div>
        </template>

        <!-- ── Knoten ── -->
        <template v-else-if="elementType === 'node'">
          <div class="info-grid">
            <span class="lbl">Sohlhöhe</span>
            <span>{{ selectedElement.z?.toFixed(2) }} m</span>
            <span class="lbl">Deckelhöhe</span>
            <span>{{ coverZ }}</span>
            <span class="lbl">Bautiefe</span>
            <span>{{ selectedElement.depth?.toFixed(2) }} m</span>
          </div>

          <template v-if="nodeResult">
            <div class="info-divider"></div>
            <div class="section-title">Simulationsergebnisse</div>
            <div class="info-grid">
              <span class="lbl">Max. HGL</span>
              <span>{{ nodeResult.maxHGL?.toFixed(2) }} m ü. NHN</span>
              <span class="lbl">Max. Tiefe</span>
              <span>{{ nodeResult.maxDepth?.toFixed(2) }} m</span>
              <span class="lbl">Max. Zufluss</span>
              <span>{{ nodeResult.maxTotalInflow?.toFixed(1) }} l/s</span>
              <template v-if="(nodeResult.floodingVolume || 0) > 0.001">
                <span class="lbl val-red">Überflutung</span>
                <span class="val-red">{{ nodeResult.floodingVolume?.toFixed(3) }} m³</span>
              </template>
            </div>
            <div v-if="nodeResult.overflow" class="status-badge status-red">⚠ Überflutet</div>
            <div v-else-if="nodeResult.surcharged" class="status-badge status-orange">⚠ Eingestaut</div>
          </template>
          <div v-else class="no-results">Keine Simulationsergebnisse verfügbar</div>
        </template>

        <!-- ── Fläche ── -->
        <template v-else-if="elementType === 'area'">
          <div class="info-grid">
            <span class="lbl">Größe</span>
            <span>{{ selectedElement.size?.toFixed(4) }} ha</span>
            <span class="lbl">Abflussbeiwert</span>
            <span>{{ selectedElement.runoffCoeff }}</span>
            <span class="lbl">Anschluss</span>
            <span>{{ selectedElement.nodeId || '-' }}</span>
          </div>

          <template v-if="areaRunoff">
            <div class="info-divider"></div>
            <div class="section-title">Simulationsergebnisse</div>
            <div class="info-grid">
              <span class="lbl">Max. Abfluss</span>
              <span>{{ areaRunoff.maxFlow.toFixed(2) }} l/s</span>
              <span class="lbl">Volumen</span>
              <span>{{ areaRunoff.totalVolume.toFixed(2) }} m³</span>
              <span class="lbl">tc</span>
              <span>{{ areaRunoff.tc.toFixed(2) }} min</span>
            </div>
          </template>
          <div v-else class="no-results">Keine Simulationsergebnisse verfügbar</div>
        </template>

        <button @click="$emit('show-details', selectedElement)" class="details-btn">
          Details im Ergebnisfenster →
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue';
import { getMapping } from '../../utils/mappings.js';

const props = defineProps({
  selectedElement: Object,
  nodeResults:   { type: Map,   default: () => new Map() },
  hydraulics:    { type: Map,   default: () => new Map() },
  runoffDetails: { type: Array, default: () => [] },
  nodes:         { type: Map,   default: () => new Map() },
});

const emit = defineEmits(['close', 'show-details']);

const elementType = computed(() => {
  if (!props.selectedElement) return null;
  if (props.selectedElement.from || props.selectedElement.fromNodeId) return 'edge';
  if (props.selectedElement.points) return 'area';
  return 'node';
});

const typeLabel = computed(() => {
  switch (elementType.value) {
    case 'edge': return 'Haltung';
    case 'area': return 'Fläche';
    default:     return 'Knoten';
  }
});

const profileLabel = computed(() => {
  const p = props.selectedElement?.profile;
  if (!p) return '-';
  return getMapping('Profilart', p.type);
});

const dnLabel = computed(() => {
  const p = props.selectedElement?.profile;
  if (!p) return '-';
  const h = (p.height * 1000).toFixed(0);
  if (p.type === 0) return `DN ${h} mm`;
  return `${h} × ${(p.width * 1000).toFixed(0)} mm`;
});

const coverZ = computed(() => {
  const el = props.selectedElement;
  if (!el) return '-';
  const cz = el.coverZ ?? (el.z + (el.depth || 0));
  return Number.isFinite(cz) ? cz.toFixed(2) + ' m' : '-';
});

const edgeResult = computed(() =>
  elementType.value === 'edge' ? (props.hydraulics?.get(props.selectedElement.id) ?? null) : null
);

const nodeResult = computed(() =>
  elementType.value === 'node' ? (props.nodeResults?.get(props.selectedElement.id) ?? null) : null
);

const areaRunoff = computed(() => {
  if (elementType.value !== 'area') return null;
  const details = props.runoffDetails.filter(d => d.areaId === props.selectedElement.id);
  if (!details.length) return null;
  return {
    maxFlow:     details.reduce((s, d) => s + d.maxFlow, 0),
    totalVolume: details.reduce((s, d) => s + d.totalVolume, 0),
    tc:          details[0].tc,
  };
});

const utilizationClass = (val) => {
  if (val == null) return '';
  if (val > 90)  return 'val-red';
  if (val >= 75) return 'val-orange';
  return 'val-green';
};
</script>

<style scoped>
.info-window {
  position: absolute;
  bottom: 5rem;
  right: 1rem;
  width: 270px;
  max-height: 55vh;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.97);
  backdrop-filter: blur(8px);
  border-radius: 10px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  border: 1px solid #e8e8e8;
  z-index: 20;
  scrollbar-width: thin;
}

/* Slide-up transition */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.28s cubic-bezier(0.34, 1.2, 0.64, 1), opacity 0.2s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(calc(100% + 5rem));
  opacity: 0;
}

.info-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid #f0f0f0;
  background: #fafafa;
  border-radius: 10px 10px 0 0;
  position: sticky;
  top: 0;
  z-index: 1;
}

.info-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.info-type-badge {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: #e8f0fe;
  color: #3367d6;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
}

.info-id {
  font-size: 0.95rem;
  color: #1a1a1a;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  line-height: 1;
  color: #999;
  cursor: pointer;
  padding: 0 2px;
}
.close-btn:hover { color: #e74c3c; }

.info-content {
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.section-title {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #3367d6;
  margin-bottom: 0.1rem;
}

.info-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 0.6rem;
  font-size: 0.82rem;
}

.lbl {
  color: #888;
  white-space: nowrap;
}

.info-divider {
  height: 1px;
  background: #f0f0f0;
  margin: 0.25rem 0;
}

.val-red    { color: #e74c3c; font-weight: 600; }
.val-orange { color: #f39c12; font-weight: 600; }
.val-green  { color: #27ae60; font-weight: 600; }

.status-badge {
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  margin-top: 0.25rem;
  text-align: center;
}
.status-red    { background: #fef2f2; color: #b91c1c; border: 1px solid #fca5a5; }
.status-orange { background: #fffbeb; color: #b45309; border: 1px solid #fcd34d; }

.no-results {
  font-size: 0.8rem;
  color: #aaa;
  text-align: center;
  padding: 0.5rem 0;
  font-style: italic;
}

.details-btn {
  margin-top: 0.5rem;
  width: 100%;
  background: none;
  border: 1px solid #3498db;
  color: #3498db;
  border-radius: 5px;
  padding: 0.35rem 0.5rem;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  text-align: center;
}
.details-btn:hover {
  background: #3498db;
  color: white;
}
</style>
