<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click.self="close">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Channel-Querschnitt</h3>
          <button class="close-btn" @click="close">&times;</button>
        </div>

        <div class="modal-body">
          <div class="form-col">
            <label class="control-label">Form</label>
            <div class="toggle-group">
              <button :class="{ active: shape === 'trapezoid' }" @click="shape = 'trapezoid'">Trapez</button>
              <button :class="{ active: shape === 'rect' }" @click="shape = 'rect'">Rechteck</button>
            </div>

            <div class="form-group">
              <label>Sohlbreite [m]</label>
              <input type="number" min="0.1" step="0.1" v-model.number="bedWidth" />
            </div>
            <div class="form-group">
              <label>Tiefe [m]</label>
              <input type="number" min="0.1" step="0.1" v-model.number="depth" />
            </div>
            <div class="form-group" v-if="shape === 'trapezoid'">
              <label>Böschungsneigung 1 : {{ sideSlope }}</label>
              <input type="number" min="0.1" step="0.1" v-model.number="sideSlope" />
            </div>
            <div class="form-group">
              <label>Manning n [Rauheit]</label>
              <input type="number" min="0.005" step="0.005" v-model.number="manningN" />
            </div>

            <div class="hint">
              Offener Querschnitt (kein Deckel). Die Sohle liegt {{ depth.toFixed(2) }} m unter dem
              Gelände entlang der gezeichneten Linie.
            </div>
          </div>

          <div class="preview-col">
            <svg :viewBox="viewBox" class="section-svg" preserveAspectRatio="xMidYMid meet">
              <line :x1="-halfTop * 1.3" y1="0" :x2="halfTop * 1.3" y2="0" class="ground-line" />
              <polyline :points="profilePoints" class="section-outline" />
            </svg>
            <div class="preview-legend">
              <span>Sohle {{ bedWidth.toFixed(1) }} m</span>
              <span v-if="shape === 'trapezoid'">Oben {{ (halfTop * 2).toFixed(1) }} m</span>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="secondary-btn" @click="close">Abbrechen</button>
          <button class="primary-btn" @click="apply">Einbauen</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  isOpen: Boolean,
});

const emit = defineEmits(['close', 'apply']);

const shape = ref('rect'); // 'trapezoid' | 'rect'
const bedWidth = ref(2);
const depth = ref(1);
const sideSlope = ref(1.5);
const manningN = ref(0.03);

const halfBed = computed(() => Math.max(0, bedWidth.value) / 2);
const halfTop = computed(() => shape.value === 'rect'
  ? halfBed.value
  : halfBed.value + Math.max(0, sideSlope.value) * Math.max(0, depth.value));

// SVG-Koordinaten: y wächst nach unten — passt direkt zur "Tiefe unter Gelände".
const profilePoints = computed(() => {
  const hb = halfBed.value, ht = halfTop.value, d = Math.max(0, depth.value);
  if (shape.value === 'rect') {
    return `${-hb},0 ${-hb},${d} ${hb},${d} ${hb},0`;
  }
  return `${-ht},0 ${-hb},${d} ${hb},${d} ${ht},0`;
});

const viewBox = computed(() => {
  const ht = Math.max(halfTop.value, 0.5);
  const d = Math.max(depth.value, 0.5);
  const padX = ht * 0.3 + 0.3;
  const padY = d * 0.3 + 0.3;
  const w = ht * 2 + padX * 2;
  const h = d + padY * 2;
  return `${-w / 2} ${-padY} ${w} ${h}`;
});

const close = () => emit('close');

const apply = () => {
  emit('apply', {
    shape: shape.value,
    bedWidth: bedWidth.value,
    depth: depth.value,
    sideSlope: shape.value === 'trapezoid' ? sideSlope.value : 0,
    manningN: manningN.value,
  });
};
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6);
  z-index: 2000; display: flex; justify-content: center; align-items: center;
  backdrop-filter: blur(2px);
}
.modal-content {
  background: var(--sv-bg-2); width: 560px; border-radius: var(--sv-radius);
  display: flex; flex-direction: column; overflow: hidden;
  color: var(--sv-text); font-family: var(--sv-font);
  border: 1px solid var(--sv-border);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), var(--sv-glow-violet);
}

.modal-header {
  padding: 0.9rem 1.1rem; border-bottom: 1px solid var(--sv-border);
  display: flex; justify-content: space-between; align-items: center;
  background: var(--sv-bg);
}
.modal-header h3 { margin: 0; font-size: 1rem; color: var(--sv-text-lime); }
.close-btn { background: none; border: none; font-size: 1.4rem; cursor: pointer; color: var(--sv-text-dim); line-height: 1; }
.close-btn:hover { color: var(--sv-lime); }

.modal-body { display: flex; gap: 1.2rem; padding: 1.1rem; }
.form-col { flex: 1; min-width: 0; }
.preview-col { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }

.control-label {
  display: block; font-size: 0.74rem; color: var(--sv-text-dim);
  margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.05em;
}
.toggle-group { display: flex; gap: 5px; margin-bottom: 12px; }
.toggle-group button {
  flex: 1; border: 1px solid var(--sv-border); background: var(--sv-bg);
  color: var(--sv-text-dim); font-family: var(--sv-font); padding: 6px 4px;
  border-radius: 4px; cursor: pointer; font-size: 0.81rem;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.toggle-group button:hover:not(:disabled) { background: var(--sv-violet-dim); border-color: var(--sv-violet); color: #fff; }
.toggle-group button.active { background: var(--sv-violet); border-color: var(--sv-lime); color: #fff; font-weight: 600; }
.toggle-group button:disabled { opacity: 0.35; cursor: not-allowed; }

.form-group { margin-bottom: 0.9rem; }
.form-group label { display: block; margin-bottom: 0.35rem; font-size: 0.82rem; color: var(--sv-text); }
.form-group input {
  width: 100%; padding: 0.4rem 0.5rem; border: 1px solid var(--sv-border);
  border-radius: 4px; background: var(--sv-bg); color: var(--sv-text); font-family: var(--sv-font);
}
.form-group input:focus { outline: none; border-color: var(--sv-lime); }

.hint { font-size: 0.72rem; color: var(--sv-text-dim); line-height: 1.4; font-style: italic; }

.section-svg { width: 100%; max-width: 240px; height: 160px; }
.ground-line { stroke: var(--sv-text-dim); stroke-width: 0.04; stroke-dasharray: 0.12 0.1; }
.section-outline { fill: rgba(139, 92, 246, 0.25); stroke: var(--sv-lime); stroke-width: 0.06; stroke-linejoin: round; }
.preview-legend { display: flex; gap: 10px; margin-top: 8px; font-size: 0.72rem; color: var(--sv-text-dim); }

.modal-footer {
  padding: 0.9rem 1.1rem; border-top: 1px solid var(--sv-border);
  display: flex; justify-content: flex-end; gap: 0.7rem; background: var(--sv-bg);
}
.primary-btn {
  background: var(--sv-lime); color: #12121a; border: none; padding: 0.55rem 1.1rem;
  border-radius: 4px; cursor: pointer; font-weight: 700; font-family: var(--sv-font);
}
.primary-btn:hover { filter: brightness(1.08); box-shadow: var(--sv-glow-lime); }
.secondary-btn {
  background: transparent; color: var(--sv-text-dim); border: 1px solid var(--sv-border);
  padding: 0.55rem 1.1rem; border-radius: 4px; cursor: pointer; font-family: var(--sv-font);
}
.secondary-btn:hover { border-color: var(--sv-lime); color: var(--sv-text); }
</style>
