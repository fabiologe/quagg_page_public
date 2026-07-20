<template>
  <Transition name="slide-up">
    <div v-if="element" class="info-panel">
      <div class="info-header" :style="{ background: headerGradient }">
        <h3>{{ title }}</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
      <div class="info-body">
        <div class="info-row">
          <span class="lbl">ID</span>
          <span class="val">{{ element.id }}</span>
        </div>

        <!-- ─── Haltung / Pipe ──────────────────────────────────────── -->
        <template v-if="isEdge">
          <div class="info-row">
            <span class="lbl">Profil</span>
            <span class="val">{{ profileName }}</span>
          </div>
          <div class="info-row" v-if="element.profile?.height">
            <span class="lbl">Dimension</span>
            <span class="val">{{ (element.profile.height * 1000).toFixed(0) }} mm</span>
          </div>
          <div class="info-row" v-if="element.length">
            <span class="lbl">Länge</span>
            <span class="val">{{ element.length.toFixed(2) }} m</span>
          </div>
          <div class="info-row" v-if="element.z1 != null">
            <span class="lbl">SH Anfang</span>
            <span class="val">{{ element.z1?.toFixed(2) }} m</span>
          </div>
          <div class="info-row" v-if="element.z2 != null">
            <span class="lbl">SH Ende</span>
            <span class="val">{{ element.z2?.toFixed(2) }} m</span>
          </div>
        </template>

        <!-- ─── Fläche / Area ──────────────────────────────────────── -->
        <template v-else-if="isArea">
          <div class="info-row">
            <span class="lbl">Größe</span>
            <span class="val">{{ element.size?.toFixed(4) }} ha</span>
          </div>
          <div class="info-row" v-if="element.runoffCoeff != null">
            <span class="lbl">Abflussbeiwert</span>
            <span class="val">{{ element.runoffCoeff }}</span>
          </div>
        </template>

        <!-- ─── Knoten / Node ──────────────────────────────────────── -->
        <template v-else>
          <!-- Common node fields -->
          <div class="info-row" v-if="element.z != null">
            <span class="lbl">Sohlhöhe</span>
            <span class="val">{{ element.z?.toFixed(2) }} m</span>
          </div>
          <div class="info-row" v-if="element.coverZ">
            <span class="lbl">Deckelhöhe</span>
            <span class="val">{{ element.coverZ?.toFixed(2) }} m</span>
          </div>
          <div class="info-row" v-if="element.depth">
            <span class="lbl">Tiefe</span>
            <span class="val">{{ element.depth?.toFixed(2) }} m</span>
          </div>
          <div class="info-row" v-if="element.diameter">
            <span class="lbl">Durchmesser</span>
            <span class="val">{{ (element.diameter * 1000).toFixed(0) }} mm</span>
          </div>

          <!-- Fiktiver Knoten — always shown first, overrides bwType badges -->
          <template v-if="element.status === 2">
            <div class="type-badge fictive">◌ Fiktiv</div>
          </template>

          <!-- Pumpwerk (bwType 1) -->
          <template v-else-if="bwType === 1">
            <div class="type-badge pumpwerk">⚙ Pumpwerk</div>
            <div class="info-row" v-if="element.pumpRate">
              <span class="lbl">Förderleistung</span>
              <span class="val">{{ element.pumpRate }} l/s</span>
            </div>
            <div class="info-row" v-if="element.onDepth != null">
              <span class="lbl">Ein-Tiefe</span>
              <span class="val">{{ element.onDepth }} m</span>
            </div>
            <div class="info-row" v-if="element.offDepth != null">
              <span class="lbl">Aus-Tiefe</span>
              <span class="val">{{ element.offDepth }} m</span>
            </div>
          </template>

          <!-- Pumpe (bwType 6) — Sonderbauwerk-Knoten (hell lila) -->
          <template v-else-if="bwType === 6">
            <div class="type-badge sonderbauwerk">⚙ Pumpe</div>
            <div class="info-row" v-if="element.pumpRate">
              <span class="lbl">Förderleistung</span>
              <span class="val">{{ element.pumpRate }} l/s</span>
            </div>
            <div class="info-row" v-if="element.onDepth != null">
              <span class="lbl">Ein-Tiefe</span>
              <span class="val">{{ element.onDepth }} m</span>
            </div>
            <div class="info-row" v-if="element.offDepth != null">
              <span class="lbl">Aus-Tiefe</span>
              <span class="val">{{ element.offDepth }} m</span>
            </div>
          </template>

          <!-- Wehr (bwType 7) — Sonderbauwerk-Knoten (hell lila) -->
          <template v-else-if="bwType === 7">
            <div class="type-badge sonderbauwerk">〰 Wehr / Überlauf</div>
            <div class="info-row" v-if="element.weirHeight">
              <span class="lbl">Wehrhöhe</span>
              <span class="val">{{ element.wehrHeight?.toFixed(2) ?? element.weirHeight?.toFixed(2) }} m</span>
            </div>
            <div class="info-row" v-if="element.weirWidth || element.bauwerkData?.wehrLaenge">
              <span class="lbl">Wehrlänge</span>
              <span class="val">{{ (element.bauwerkData?.wehrLaenge ?? element.weirWidth)?.toFixed(2) }} m</span>
            </div>
            <div class="info-row" v-if="element.dischargeCoeff">
              <span class="lbl">Beiwert Cw</span>
              <span class="val">{{ element.dischargeCoeff }}</span>
            </div>
          </template>

          <!-- Becken / Speicher (bwType 2, 3, 4, 12, 13) -->
          <template v-else-if="[2, 3, 4, 12, 13].includes(bwType)">
            <div class="type-badge becken">▭ Becken / Speicher</div>
            <div class="info-row" v-if="element.volume">
              <span class="lbl">Volumen</span>
              <span class="val">{{ element.volume }} m³</span>
            </div>
            <div class="info-row" v-if="element.maxDepth">
              <span class="lbl">Max. Tiefe</span>
              <span class="val">{{ element.maxDepth }} m</span>
            </div>
          </template>

          <!-- Drossel / Schieber (bwType 8, 9) — Sonderbauwerk-Knoten (hell lila) -->
          <template v-else-if="bwType === 8 || bwType === 9">
            <div class="type-badge sonderbauwerk">⊘ {{ bwType === 8 ? 'Drossel' : 'Schieber' }}</div>
            <div class="info-row" v-if="element.maxOutflow">
              <span class="lbl">Max. Abfluss</span>
              <span class="val">{{ element.maxOutflow }} l/s</span>
            </div>
          </template>

          <!-- Auslass (bwType 5) -->
          <template v-else-if="bwType === 5 || element.type === 'Auslass'">
            <div class="type-badge outfall">▽ Auslass</div>
          </template>
        </template>

        <!-- ─── Simulationsergebnis ───────────────────────────────────── -->
        <template v-if="result">
          <div class="result-header">Simulationsergebnis</div>

          <!-- Node results -->
          <template v-if="!isEdge && !isArea">
            <div class="info-row" v-if="result.overflow">
              <span class="lbl">Status</span>
              <span class="val res-bad">⚠ Überstau / Einstau</span>
            </div>
            <div class="info-row" v-else-if="result.surcharged">
              <span class="lbl">Status</span>
              <span class="val res-warn">↑ Druckabfluss</span>
            </div>
            <div class="info-row" v-else>
              <span class="lbl">Status</span>
              <span class="val res-ok">✓ Normal</span>
            </div>
            <div class="info-row" v-if="result.reportedMaxDepth != null">
              <span class="lbl">Max. Wasserstand</span>
              <span class="val">{{ result.reportedMaxDepth?.toFixed(2) ?? '–' }} m</span>
            </div>
            <div class="info-row" v-if="result.maxTotalInflow">
              <span class="lbl">Max. Zufluss</span>
              <span class="val">{{ result.maxTotalInflow.toFixed(1) }} l/s</span>
            </div>
            <div class="info-row" v-if="result.floodingVolume">
              <span class="lbl">Überflutungsvolumen</span>
              <span class="val res-bad">{{ result.floodingVolume.toFixed(1) }} m³</span>
            </div>
          </template>

          <!-- Pumpwerk-Betrieb (aus systemStats.pumpingSummary der zugehörigen Haltung) -->
          <template v-if="pumpSummary">
            <div class="info-row">
              <span class="lbl">Pumpe: Nutzung</span>
              <span class="val">{{ pumpSummary.percentUtilized?.toFixed(1) }} %</span>
            </div>
            <div class="info-row">
              <span class="lbl">Pumpe: Starts</span>
              <span class="val">{{ pumpSummary.startUps }}</span>
            </div>
            <div class="info-row" v-if="pumpSummary.totalEnergy != null">
              <span class="lbl">Energie</span>
              <span class="val">{{ pumpSummary.totalEnergy.toFixed(2) }} kWh</span>
            </div>
          </template>

          <!-- Knoten→Link-Verweis für Pumpe/Wehr/Drossel/Schieber ohne eigenes Ergebnis -->
          <div v-if="relatedLinkId && !pumpSummary" class="link-hint">
            ⚙ Ergebnis siehe Haltung <strong>{{ relatedLinkId }}</strong>
          </div>

          <!-- Edge results -->
          <template v-if="isEdge">
            <div class="info-row">
              <span class="lbl">Auslastung</span>
              <span class="val" :class="edgeUtilClass">{{ edgeUtil }}%</span>
            </div>
            <div class="info-row" v-if="result.maxFlow != null">
              <span class="lbl">Max. Abfluss</span>
              <span class="val">{{ result.maxFlow.toFixed(2) }} l/s</span>
            </div>
            <div class="info-row" v-if="result.maxVelocity != null">
              <span class="lbl">Max. Geschw.</span>
              <span class="val">{{ result.maxVelocity.toFixed(2) }} m/s</span>
            </div>
          </template>
        </template>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue';
import { getNodeBwType } from './useSceneBuilder.js';
import { LINK_BAUWERKSTYPEN } from '../../../utils/mappings.js';

const props = defineProps({
  element: { type: Object, default: null },
  result:  { type: Object, default: null },
  edges:   { type: Map,    default: () => new Map() },
  systemStats: { type: Object, default: () => ({}) },
});
defineEmits(['close']);

const isEdge = computed(() => props.element && (props.element.fromNodeId || props.element.from));
const isArea = computed(() => props.element && Array.isArray(props.element.points));
const bwType = computed(() => (!props.element || isEdge.value || isArea.value) ? 0 : getNodeBwType(props.element));

// Pumpe/Wehr/Drossel/Schieber sind in SWMM LINKS — benannt nach der ausgehenden
// Haltung dieses Knotens. Das reale Hydraulik-Ergebnis liegt dort, nicht am
// Knoten; informativer Hinweis + (für Pumpen) direkte Kennzahlen aus dem Report.
const relatedLinkId = computed(() => {
  if (!props.element || isEdge.value || isArea.value || !LINK_BAUWERKSTYPEN.has(bwType.value)) return null;
  const edge = Array.from(props.edges.values()).find(e => e.fromNodeId === props.element.id);
  return edge?.id ?? null;
});

const pumpSummary = computed(() => {
  if (bwType.value !== 1 && bwType.value !== 6) return null;
  const id = relatedLinkId.value;
  if (!id) return null;
  return props.systemStats?.pumpingSummary?.find(p => p.id === id) ?? null;
});

const TITLES = {
  1: 'Pumpwerk (3D)', 2: 'Becken / Speicher (3D)', 3: 'Kläranlage (3D)',
  4: 'Regenüberlauf (3D)', 5: 'Auslass (3D)', 6: 'Pumpe (3D)',
  7: 'Wehr / Überlauf (3D)', 8: 'Drossel (3D)', 9: 'Schieber (3D)',
  12: 'Versickerung (3D)', 13: 'Zisterne (3D)',
};

const title = computed(() => {
  if (isEdge.value) return 'Haltung (3D)';
  if (isArea.value) return 'Fläche (3D)';
  if (!props.element) return '';
  if (props.element.status === 2) return 'Fiktiv (3D)';
  return TITLES[bwType.value] ?? 'Schacht (3D)';
});

// Pumpe/Wehr/Drossel/Schieber (6/7/8/9): einheitliches helles Lila, da sie in
// Realität/ISYBAU ein Knotenelement sind — ein Blick soll "Sonderbauwerk"
// signalisieren statt vier unterschiedliche Farben je Subtyp zu erfordern.
const SONDERBAUWERK_GRADIENT = 'linear-gradient(135deg,#7c5295,#c9a0dc)';
const HEADER_GRADIENTS = {
  1: 'linear-gradient(135deg,#b45309,#d97706)',   // Pumpwerk orange
  6: SONDERBAUWERK_GRADIENT,
  2: 'linear-gradient(135deg,#0f766e,#14b8a6)',   // Becken teal
  3: 'linear-gradient(135deg,#0f766e,#14b8a6)',
  4: 'linear-gradient(135deg,#0f766e,#14b8a6)',
  12:'linear-gradient(135deg,#0f766e,#14b8a6)',
  13:'linear-gradient(135deg,#0f766e,#14b8a6)',
  5: 'linear-gradient(135deg,#065f46,#059669)',   // Auslass green
  7: SONDERBAUWERK_GRADIENT,
  8: SONDERBAUWERK_GRADIENT,
  9: SONDERBAUWERK_GRADIENT,
};
const headerGradient = computed(() => {
  if (isEdge.value)  return 'linear-gradient(135deg,#1e3a5f,#2563eb)';
  if (isArea.value)  return 'linear-gradient(135deg,#1e3a5f,#2980b9)';
  if (props.element?.status === 2) return 'linear-gradient(135deg,#7f1d1d,#ef4444)'; // fictive red
  return HEADER_GRADIENTS[bwType.value] ?? 'linear-gradient(135deg,#040647,#594491)';
});

const PROFILE_NAMES = {
  0: 'Kreisprofil', 1: 'Eiprofil', 2: 'Maulprofil',
  3: 'Rechteck (geschl.)', 4: 'Trapez', 5: 'Rechteck (offen)', 8: 'Trapez (breit)',
};
const profileName = computed(() =>
  isEdge.value && props.element?.profile
    ? (PROFILE_NAMES[props.element.profile.type] ?? `Typ ${props.element.profile.type}`)
    : '-'
);

const edgeUtil = computed(() => {
  if (!props.result) return 0;
  const u = props.result.utilization ?? (props.result.depthRatio != null ? props.result.depthRatio * 100 : 0);
  return Math.round(u);
});
const edgeUtilClass = computed(() => {
  const u = edgeUtil.value;
  if (u > 90) return 'res-bad';
  if (u > 75) return 'res-warn';
  if (u > 50) return 'res-yellow';
  return 'res-ok';
});
</script>

<style scoped>
.info-panel {
  position: absolute;
  top: 1rem; right: 1rem;
  width: 280px;
  background: rgba(6, 9, 58, 0.92);
  border: 1px solid #594491;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  overflow: hidden;
  z-index: 20;
  backdrop-filter: blur(8px);
}

.info-header {
  padding: 0.75rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.info-header h3 {
  margin: 0;
  font-size: 0.75rem;
  color: #fff;
  font-family: 'Press Start 2P', monospace;
}
.close-btn {
  background: none; border: none; color: #a0aec0;
  font-size: 1.4rem; cursor: pointer; line-height: 1; padding: 0;
}
.close-btn:hover { color: #fff; }

.info-body { padding: 0.75rem 1rem; }

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.3rem 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  font-size: 0.82rem;
}
.info-row:last-child { border-bottom: none; }
.lbl { color: #718096; }
.val { color: #e2e8f0; font-weight: 600; text-align: right; }

.type-badge {
  margin: 0.4rem 0 0.6rem;
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 700;
  display: inline-block;
}
.type-badge.pumpwerk { background: rgba(217,119,6,0.2);  color: #fbbf24; border: 1px solid #d97706; }
.type-badge.sonderbauwerk { background: rgba(201,160,220,0.2); color: #e9d5f5; border: 1px solid #c9a0dc; }
.type-badge.becken   { background: rgba(20,184,166,0.2); color: #5eead4; border: 1px solid #14b8a6; }
.type-badge.outfall  { background: rgba(5,150,105,0.2);  color: #6ee7b7; border: 1px solid #059669; }
.type-badge.fictive  { background: rgba(239,68,68,0.2);  color: #fca5a5; border: 1px solid #ef4444; }

.slide-up-enter-active, .slide-up-leave-active { transition: all 0.25s ease; }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(12px); opacity: 0; }

.result-header {
  margin: 0.6rem 0 0.3rem;
  padding: 0.2rem 0;
  border-top: 1px solid rgba(255,255,255,0.1);
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #4a5568;
  font-family: monospace;
}

.link-hint {
  margin-top: 0.4rem;
  padding: 0.35rem 0.5rem;
  background: rgba(37,99,235,0.15);
  border: 1px solid #2563eb;
  border-radius: 4px;
  font-size: 0.72rem;
  color: #bfdbfe;
}

.res-bad    { color: #fc8181; }
.res-warn   { color: #fbd38d; }
.res-yellow { color: #faf089; }
.res-ok     { color: #68d391; }
</style>
