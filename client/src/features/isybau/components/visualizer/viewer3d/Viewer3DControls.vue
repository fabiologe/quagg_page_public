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
    <label v-if="hasTerrain" class="ctrl-toggle" :title="terrainToggleTitle">
      <input type="checkbox" :checked="showTerrain" @change="$emit('update:showTerrain', $event.target.checked)" />
      <span class="toggle-dot" />
      <span class="toggle-label">Gelände{{ terrainSource === 'api' ? ' (API, ~30m)' : '' }}</span>
    </label>
    <label class="ctrl-toggle" title="Netz-Renderstyle: Solid (volle Körper) oder Drahtkörper (macht den Wasserstand im Rohr-/Schachtinneren sichtbar) — unabhängig davon, ob Ergebnisse angezeigt werden">
      <input type="checkbox" :checked="wireframeMode" @change="$emit('update:wireframeMode', $event.target.checked)" />
      <span class="toggle-dot" />
      <span class="toggle-label">Drahtkörper</span>
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
import { computed } from 'vue';

const props = defineProps({
  showNodes:      { type: Boolean, default: true  },
  showEdges:      { type: Boolean, default: true  },
  showAreas:      { type: Boolean, default: true  },
  showTerrain:    { type: Boolean, default: true  },
  hasTerrain:     { type: Boolean, default: false },
  // 'manual' (hochgeladenes DGM) | 'api' (Terrarium-Fallback, ~30m) | null
  terrainSource:  { type: String,  default: null  },
  showResults:    { type: Boolean, default: false },
  showWaterLevel: { type: Boolean, default: true  },
  wireframeMode:  { type: Boolean, default: false },
  zScale:         { type: Number,  default: 1     },
  hasResults:     { type: Boolean, default: false },
});
defineEmits(['reset-view', 'update:showNodes', 'update:showEdges', 'update:showAreas', 'update:showTerrain', 'update:showResults', 'update:showWaterLevel', 'update:wireframeMode', 'update:zScale']);

const terrainToggleTitle = computed(() => {
  if (props.terrainSource === 'api') {
    return 'Gelände ein-/ausblenden — automatisch aus Terrarium-Höhendaten (~30m, ungenau), kein eigenes DGM hochgeladen';
  }
  return 'Gelände (DGM) ein-/ausblenden';
});
</script>

<style scoped>
.controls-3d {
  position: absolute;
  bottom: 1rem;
  left: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  background: var(--isy-pixel-bg);
  border: 1px solid var(--isy-pixel-green);
  border-radius: 8px;
  padding: var(--isy-space-2);
  z-index: 10;
  min-width: 130px;
}

.ctrl-btn {
  background: transparent;
  border: 1px solid var(--isy-pixel-border);
  border-radius: 4px;
  color: var(--isy-pixel-green);
  font-size: var(--isy-fs-lg);
  width: 32px;
  height: 32px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  transition: background 0.15s;
}
.ctrl-btn:hover { background: var(--isy-pixel-border); }

.ctrl-divider {
  height: 1px;
  background: rgba(255,255,255,0.1);
  margin: var(--isy-space-1) 0;
}

.ctrl-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: var(--isy-fs-sm);
  color: var(--isy-pixel-text-dim);
}
.ctrl-toggle input { display: none; }
.toggle-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  background: var(--isy-pixel-bg-alt);
  border: 1px solid var(--isy-pixel-border);
  flex-shrink: 0;
  transition: background 0.15s;
}
.ctrl-toggle input:checked + .toggle-dot { background: var(--isy-pixel-green); }
.ctrl-toggle:hover .toggle-label { color: var(--isy-pixel-text); }

.ctrl-zscale {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.zscale-label {
  font-size: var(--isy-fs-sm);
  color: var(--isy-pixel-text-dim);
  font-family: monospace;
}
.ctrl-zscale input[type=range] {
  width: 100%;
  accent-color: var(--isy-pixel-green);
  cursor: pointer;
}

.result-toggle .toggle-label { color: var(--isy-pixel-warning-alt); }
.result-dot { border-color: var(--isy-pixel-warning-alt) !important; }
.ctrl-toggle input:checked + .result-dot { background: var(--isy-pixel-warning-alt) !important; }

.water-toggle { padding-left: var(--isy-space-2); }
.water-toggle .toggle-label { color: var(--isy-pixel-info); font-size: var(--isy-fs-sm); }
.water-dot { border-color: var(--isy-pixel-info) !important; }
.ctrl-toggle input:checked + .water-dot { background: var(--isy-pixel-info) !important; }

.result-legend {
  margin-top: var(--isy-space-1);
  padding: var(--isy-space-2) var(--isy-space-2);
  background: rgba(0,0,0,0.3);
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.08);
}
.legend-title {
  font-size: var(--isy-fs-pixel-sm);
  color: var(--isy-pixel-text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--isy-space-2);
  font-family: var(--isy-pixel-font);
}
.legend-sep {
  font-size: var(--isy-fs-pixel-md);
  color: var(--isy-pixel-text-dim);
  margin: var(--isy-space-1) 0 var(--isy-space-1);
  border-top: 1px solid rgba(255,255,255,0.06);
  padding-top: var(--isy-space-1);
}
.legend-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: var(--isy-fs-sm);
  color: var(--isy-pixel-text-dim);
  padding: var(--isy-space-1) 0;
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
