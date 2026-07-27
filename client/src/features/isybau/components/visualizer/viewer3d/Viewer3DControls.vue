<template>
  <div class="controls-3d">
    <button class="ctrl-btn" @click="$emit('reset-view')" title="Ansicht zurücksetzen">↺</button>

    <div class="ctrl-divider" />

    <label class="ctrl-toggle" title="Schächte ein-/ausblenden">
      <input type="checkbox" :checked="showNodes" @change="$emit('update:showNodes', $event.target.checked)" />
      <span class="toggle-dot" />
      <span class="toggle-label">Schächte</span>
    </label>
    <label class="ctrl-toggle" title="Haltungen ein-/ausblenden">
      <input type="checkbox" :checked="showEdges" @change="$emit('update:showEdges', $event.target.checked)" />
      <span class="toggle-dot" />
      <span class="toggle-label">Haltungen</span>
    </label>
    <label class="ctrl-toggle" title="Flächen ein-/ausblenden">
      <input type="checkbox" :checked="showAreas" @change="$emit('update:showAreas', $event.target.checked)" />
      <span class="toggle-dot" />
      <span class="toggle-label">Flächen</span>
    </label>
    <label v-if="hasTerrain" class="ctrl-toggle" title="Gelände (DGM) ein-/ausblenden">
      <input type="checkbox" :checked="showTerrain" @change="$emit('update:showTerrain', $event.target.checked)" />
      <span class="toggle-dot" />
      <span class="toggle-label">Gelände</span>
    </label>

    <div class="ctrl-divider" />

    <div class="ctrl-zscale">
      <span class="zscale-label">Z ×{{ zScale }}</span>
      <input
        type="range" min="1" max="20" step="1"
        :value="zScale"
        @input="$emit('update:zScale', Number($event.target.value))"
        title="Vertikale Überhöhung"
      />
    </div>

    <template v-if="hasResults">
      <div class="ctrl-divider" />
      <label class="ctrl-toggle result-toggle" title="Simulationsergebnisse ein-/ausblenden">
        <input type="checkbox" :checked="showResults" @change="$emit('update:showResults', $event.target.checked)" />
        <span class="toggle-dot result-dot" />
        <span class="toggle-label">Ergebnisse</span>
      </label>

      <label v-if="showResults" class="ctrl-toggle water-toggle" title="Wasserstand ein-/ausblenden">
        <input type="checkbox" :checked="showWaterLevel" @change="$emit('update:showWaterLevel', $event.target.checked)" />
        <span class="toggle-dot water-dot" />
        <span class="toggle-label">↳ Wasserstand</span>
      </label>

      <transition name="legend-fade">
        <div v-if="showResults" class="result-legend">
          <div class="legend-title">Legende</div>
          <div class="legend-row"><span class="dot" style="background:#c0392b" />Überstau / Einstau</div>
          <div class="legend-row"><span class="dot" style="background:#e67e22" />Druckabfluss</div>
          <div class="legend-row"><span class="dot" style="background:#3498db;opacity:0.75" />Wasserstand</div>
          <div class="legend-sep">Haltungen</div>
          <div class="legend-row"><span class="dot" style="background:#c0392b" />&gt; 90% Kapazität</div>
          <div class="legend-row"><span class="dot" style="background:#e67e22" />&gt; 75% Kapazität</div>
          <div class="legend-row"><span class="dot" style="background:#f1c40f" />&gt; 50% Kapazität</div>
          <div class="legend-row"><span class="dot" style="background:#2980b9" />≤ 50% Kapazität</div>
        </div>
      </transition>
    </template>
  </div>
</template>

<script setup>
defineProps({
  showNodes:      { type: Boolean, default: true  },
  showEdges:      { type: Boolean, default: true  },
  showAreas:      { type: Boolean, default: true  },
  showTerrain:    { type: Boolean, default: true  },
  hasTerrain:     { type: Boolean, default: false },
  showResults:    { type: Boolean, default: false },
  showWaterLevel: { type: Boolean, default: true  },
  zScale:         { type: Number,  default: 1     },
  hasResults:     { type: Boolean, default: false },
});
defineEmits(['reset-view', 'update:showNodes', 'update:showEdges', 'update:showAreas', 'update:showTerrain', 'update:showResults', 'update:showWaterLevel', 'update:zScale']);
</script>

<style scoped>
.controls-3d {
  position: absolute;
  bottom: 1rem;
  left: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  background: rgba(6, 9, 58, 0.85);
  border: 1px solid #2ecc71;
  border-radius: 8px;
  padding: 0.6rem;
  backdrop-filter: blur(6px);
  z-index: 10;
  min-width: 130px;
}

.ctrl-btn {
  background: transparent;
  border: 1px solid #594491;
  border-radius: 4px;
  color: #2ecc71;
  font-size: 1.2rem;
  width: 32px;
  height: 32px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  transition: background 0.15s;
}
.ctrl-btn:hover { background: #594491; }

.ctrl-divider {
  height: 1px;
  background: rgba(255,255,255,0.1);
  margin: 0.2rem 0;
}

.ctrl-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.75rem;
  color: #a0aec0;
}
.ctrl-toggle input { display: none; }
.toggle-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  background: #374151;
  border: 1px solid #594491;
  flex-shrink: 0;
  transition: background 0.15s;
}
.ctrl-toggle input:checked + .toggle-dot { background: #2ecc71; }
.ctrl-toggle:hover .toggle-label { color: #fff; }

.ctrl-zscale {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.zscale-label {
  font-size: 0.7rem;
  color: #a0aec0;
  font-family: monospace;
}
.ctrl-zscale input[type=range] {
  width: 100%;
  accent-color: #2ecc71;
  cursor: pointer;
}

.result-toggle .toggle-label { color: #f1c40f; }
.result-dot { border-color: #f1c40f !important; }
.ctrl-toggle input:checked + .result-dot { background: #f1c40f !important; }

.water-toggle { padding-left: 0.6rem; }
.water-toggle .toggle-label { color: #3498db; font-size: 0.7rem; }
.water-dot { border-color: #3498db !important; }
.ctrl-toggle input:checked + .water-dot { background: #3498db !important; }

.result-legend {
  margin-top: 0.2rem;
  padding: 0.5rem 0.4rem;
  background: rgba(0,0,0,0.3);
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.08);
}
.legend-title {
  font-size: 0.44rem;
  color: #aeadd2;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.4rem;
  font-family: 'Press Start 2P', monospace;
}
.legend-sep {
  font-size: 0.6rem;
  color: #4a5568;
  margin: 0.3rem 0 0.2rem;
  border-top: 1px solid rgba(255,255,255,0.06);
  padding-top: 0.25rem;
}
.legend-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.66rem;
  color: #a0aec0;
  padding: 0.1rem 0;
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}

.legend-fade-enter-active, .legend-fade-leave-active { transition: all 0.2s ease; }
.legend-fade-enter-from, .legend-fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
