<template>
  <div class="result-legend">
    <div class="legend-title">{{ cfg.title }}<span v-if="cfg.unit"> ({{ cfg.unit }})</span></div>
    <div class="legend-body">
      <div class="legend-gradient" :style="{ background: cfg.gradient }"></div>
      <div class="legend-ticks">
        <span v-for="(t, i) in ticks" :key="i">{{ t }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  // Aktiver Ergebnis-Layer (id wie in availableLayers)
  layerId: { type: String, default: 'depth' },
  // Unteres/oberes Ende der Farbskala (bei 'depth'/Heatmaps i. d. R. 0 … robustMax)
  min: { type: Number, default: 0 },
  max: { type: Number, default: 1 },
});

// CSS-Verläufe — exakt zu den Shadern in useWaterSurface (to top = klein → groß).
const RAMPS = {
  depth:    'linear-gradient(to top, #00e5ff, #0078d7, #00008b)',                 // cyan → blau → navy
  velocity: 'linear-gradient(to top, #0a33b3, #00bfff, #ffe600, #d90d0d)',        // blau → cyan → gelb → rot
  heat:     'linear-gradient(to top, #f2d9ff, #9933e6, #400080)',                 // weiß → violett → dunkel (Mode 2)
};

// Pro Layer: Titel, Einheit, Verlauf. Heatmap-Layer (max/hazard/…) nutzen den Mode-2-Verlauf.
const LAYERS = {
  depth:        { title: 'Wassertiefe',        unit: 'm',    ramp: 'depth' },
  flow:         { title: 'Wassertiefe',        unit: 'm',    ramp: 'depth' },
  streamlines:  { title: 'Wassertiefe',        unit: 'm',    ramp: 'depth' },
  velocity:     { title: 'Geschwindigkeit',    unit: 'm/s',  ramp: 'velocity' },
  max_depth:    { title: 'Max. Wassertiefe',   unit: 'm',    ramp: 'heat' },
  max_elev:     { title: 'Wasserspiegel',      unit: 'm',    ramp: 'heat' },
  max_velocity: { title: 'Max. Geschwindigk.', unit: 'm/s',  ramp: 'heat' },
  // Hazard Rating HR = d·(v+1.5) (DEFRA 2006, ALD) — vom Solver berechnet (util.cpp:211),
  // NICHT H·v. Einheit m²/s, wird üblicherweise als dimensionslose Klasse interpretiert.
  hazard:       { title: 'Gefährdung d·(v+1.5)', unit: 'm²/s', ramp: 'heat' },
  arrival:      { title: 'Ankunftszeit',       unit: 'time', ramp: 'heat' },
  duration:     { title: 'Überflutungsdauer',  unit: 'time', ramp: 'heat' },
};

const cfg = computed(() => {
  const l = LAYERS[props.layerId] || LAYERS.depth;
  return { ...l, gradient: RAMPS[l.ramp] || RAMPS.depth };
});

// Zeitwerte (Ankunft/Dauer) liegen in Sekunden → groß lieber in Minuten/Stunden.
function fmtTime(s) {
  if (!isFinite(s)) return '–';
  if (s >= 7200) return (s / 3600).toFixed(1) + ' h';
  if (s >= 120)  return Math.round(s / 60) + ' min';
  return Math.round(s) + ' s';
}
function fmtVal(v) {
  if (cfg.value.unit === 'time') return fmtTime(v);
  const span = Math.abs(props.max - props.min);
  const dec = span >= 20 ? 0 : span >= 2 ? 1 : 2;
  return v.toFixed(dec);
}

// 5 Ticks von min … max (von unten nach oben gerendert via column-reverse)
const ticks = computed(() => {
  const lo = props.min || 0;
  const hi = props.max > lo ? props.max : lo + 1;
  return [0, 0.25, 0.5, 0.75, 1].map((f) => fmtVal(lo + (hi - lo) * f));
});
</script>

<style scoped>
.result-legend {
  background: rgba(15, 15, 30, 0.88);
  backdrop-filter: blur(12px);
  border-radius: 10px;
  padding: 12px 14px;
  min-width: 48px;
  border: 1px solid rgba(79, 195, 247, 0.15);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.legend-title {
  font-size: 0.7rem;
  color: #90a4ae;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  text-align: center;
  white-space: nowrap;
}

.legend-body {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.legend-gradient {
  width: 20px;
  height: 160px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.legend-ticks {
  display: flex;
  flex-direction: column-reverse;
  justify-content: space-between;
  height: 160px;
  pointer-events: none;
}

.legend-ticks span {
  font-size: 0.65rem;
  color: #b0bec5;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
</style>
