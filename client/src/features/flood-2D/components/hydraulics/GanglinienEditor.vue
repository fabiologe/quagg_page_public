<template>
  <div class="ganglinien-editor">
    
    <!-- HEADER / TABS -->
    <div class="editor-tabs">
      <button 
        class="tab-btn" 
        :class="{ active: mode === 'GRAPH' }" 
        @click="mode = 'GRAPH'"
      >
        📈 Grafik
      </button>
      <button 
        class="tab-btn" 
        :class="{ active: mode === 'TABLE' }" 
        @click="mode = 'TABLE'"
      >
        🔢 Tabelle
      </button>
    </div>

    <!-- GRAPH MODE -->
    <div v-show="mode === 'GRAPH'" class="mode-graph">
         <div class="canvas-wrapper" 
            ref="canvasRef"
            @mousemove="handleMouseMove"
            @mouseup="handleMouseUp"
            @mouseleave="handleMouseUp"
          >
            <svg 
              :width="width" 
              :height="height" 
              class="svg-content"
              @click="handleCanvasClick"
            >
              <!-- GRID & LABELS -->
              <g class="grid">
                  <!-- Axis Lines -->
                  <line :x1="padding.left" :y1="height - padding.bottom" :x2="width - padding.right" :y2="height - padding.bottom" stroke="#34495e" stroke-width="1" />
                  <line :x1="padding.left" :y1="padding.top" :x2="padding.left" :y2="height - padding.bottom" stroke="#34495e" stroke-width="1" />

                  <!-- X Grid & Labels -->
                  <g v-for="tick in xTicks" :key="'x-'+tick.val">
                      <line :x1="tick.x" :y1="padding.top" :x2="tick.x" :y2="height - padding.bottom" stroke="#2c3e50" stroke-width="1" stroke-dasharray="2,2" />
                      <text :x="tick.x" :y="height - 5" fill="#7f8c8d" font-size="10" text-anchor="middle">{{ tick.label }}</text>
                  </g>

                  <!-- Y Grid & Labels -->
                  <g v-for="tick in yTicks" :key="'y-'+tick.val">
                      <line :x1="padding.left" :y1="tick.y" :x2="width - padding.right" :y2="tick.y" stroke="#2c3e50" stroke-width="1" stroke-dasharray="2,2" />
                      <text :x="padding.left - 5" :y="tick.y + 4" fill="#7f8c8d" font-size="10" text-anchor="end">{{ tick.label }}</text>
                  </g>
              </g>

              <!-- DATA LINE -->
              <path :d="pathD" fill="none" stroke="#3498db" stroke-width="2" />
              <path :d="areaD" fill="rgba(52, 152, 219, 0.2)" stroke="none" />

              <!-- POINTS -->
              <circle 
                  v-for="(pt, index) in localPoints" 
                  :key="index"
                  :cx="valToPxX(pt.t)" 
                  :cy="valToPxY(pt.v)" 
                  r="6" 
                  class="control-point"
                  :class="{ active: draggingIndex === index }"
                  @mousedown.stop="handleMouseDown(index)"
                  @contextmenu.prevent="removePoint(index)"
                  @dblclick.stop="removePoint(index)"
              />
              
              <!-- Hover Info -->
              <text v-if="draggingIndex !== -1" :x="width - 100" :y="20" fill="#ecf0f1" font-size="10" text-anchor="end">
                  T: {{ Math.round(localPoints[draggingIndex].t) }}s | V: {{ localPoints[draggingIndex].v.toFixed(2) }}
              </text>
            </svg>
         </div>
         <div class="hint">Doppelklick zum Löschen, Klick zum Hinzufügen.</div>
    </div>

    <!-- TABLE MODE -->
    <div v-if="mode === 'TABLE'" class="mode-table">
        <div class="table-scroll">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Zeit (s)</th>
                        <th>Wert (m³/s)</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(pt, index) in localPoints" :key="index">
                        <td>
                            <input type="number" v-model.number="pt.t" @change="sortAndEmit" step="60" class="input-cell">
                        </td>
                        <td>
                            <input type="number" v-model.number="pt.v" @change="emitUpdate" step="0.1" class="input-cell">
                        </td>
                        <td>
                            <button class="btn-del-row" @click="removePoint(index)">×</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <button class="btn-add-row" @click="addPointRow">+ Zeile hinzufügen</button>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  duration: { type: Number, default: 7200 }
});

const emit = defineEmits(['update:modelValue']);

const mode = ref('GRAPH'); // GRAPH | TABLE
const localPoints = ref([]); // internal copy

// --- SYNC ---
watch(() => props.modelValue, (newVal) => {
    // We strictly follow prop changes.
    // If localPoints differs, we update it.
    if (JSON.stringify(newVal) !== JSON.stringify(localPoints.value)) {
        localPoints.value = newVal.map(p => ({ ...p })).sort((a,b) => a.t - b.t);
    }
}, { immediate: true, deep: true });

// Listen for mode change to force checking size
watch(mode, async (val) => {
    if (val === 'GRAPH') {
        await nextTick();
        if (resizeObserver && canvasRef.value) {
            // Force a read or just let observer handle it
            // Sometimes observer needs a nudge if display:none changed
        }
    }
});

const emitUpdate = () => {
    emit('update:modelValue', localPoints.value);
};

const sortAndEmit = () => {
    localPoints.value.sort((a,b) => a.t - b.t);
    emitUpdate();
};

// --- GRAPH LOGIC ---
const canvasRef = ref(null);
const width = ref(400);
const height = ref(250);
const padding = { top: 20, right: 20, bottom: 30, left: 40 };

const draggingIndex = ref(-1);

// Resize Observer
let resizeObserver = null;
onMounted(() => {
    // If we use v-show, canvasRef is available immediately
    if (canvasRef.value) {
        setupObserver();
    }
});

function setupObserver() {
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry.contentRect.width > 0) {
            width.value = entry.contentRect.width;
            height.value = entry.contentRect.height || 250;
        }
    });
    resizeObserver.observe(canvasRef.value);
}

onUnmounted(() => {
    if (resizeObserver) resizeObserver.disconnect();
});

// Scales
const maxTime = computed(() => {
    const pMax = localPoints.value.length ? localPoints.value[localPoints.value.length-1].t : 0;
    return Math.max(props.duration, pMax, 3600);
});
const maxValue = computed(() => {
    if (!localPoints.value.length) return 10;
    const maxV = Math.max(...localPoints.value.map(p => p.v));
    return maxV > 0 ? maxV * 1.1 : 10;
});

const valToPxX = (t) => padding.left + (t / maxTime.value) * (width.value - padding.left - padding.right);
const valToPxY = (v) => (height.value - padding.bottom) - (v / maxValue.value) * (height.value - padding.top - padding.bottom);

const pxToValX = (px) => {
    const range = width.value - padding.left - padding.right;
    const rel = (px - padding.left) / range;
    return Math.max(0, rel * maxTime.value);
};
const pxToValY = (py) => {
    const range = height.value - padding.top - padding.bottom;
    const rel = ((height.value - padding.bottom) - py) / range;
    return Math.max(0, rel * maxValue.value);
};

// Ticks
const xTicks = computed(() => {
    const ticks = [];
    const maxT = maxTime.value;
    const step = maxT <= 3600 ? 900 : maxT <= 7200 ? 1800 : 3600; // 15m, 30m, 1h
    
    for (let t = 0; t <= maxT; t += step) {
        ticks.push({ 
            val: t, 
            x: valToPxX(t), 
            label: (t/3600).toFixed(1) + 'h' 
        });
    }
    return ticks;
});

const yTicks = computed(() => {
    const ticks = [];
    const maxV = maxValue.value;
    const step = maxV / 5; // 5 steps
    
    for (let i = 0; i <= 5; i++) {
        const v = i * step;
        ticks.push({ 
            val: v, 
            y: valToPxY(v), 
            label: v.toFixed(1) 
        });
    }
    return ticks;
});

// Paths
const pathD = computed(() => {
    if (!localPoints.value.length) return '';
    return 'M' + localPoints.value.map(p => `${valToPxX(p.t)},${valToPxY(p.v)}`).join(' L');
});
const areaD = computed(() => {
    if (!localPoints.value.length) return '';
    const first = localPoints.value[0];
    const last = localPoints.value[localPoints.value.length-1];
    const ground = height.value - padding.bottom;
    return `M${valToPxX(first.t)},${ground} L${valToPxX(first.t)},${valToPxY(first.v)} ` +
           localPoints.value.map(p => `L${valToPxX(p.t)},${valToPxY(p.v)}`).join(' ') +
           ` L${valToPxX(last.t)},${ground} Z`;
});

// Interactions
const handleMouseDown = (index) => {
    draggingIndex.value = index;
};
const handleMouseMove = (e) => {
    if (draggingIndex.value === -1) return;
    const rect = canvasRef.value.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let newT = pxToValX(x);
    let newV = pxToValY(y);

    // Constraints
    const prev = localPoints.value[draggingIndex.value - 1];
    const next = localPoints.value[draggingIndex.value + 1];
    if (prev) newT = Math.max(newT, prev.t);
    if (next) newT = Math.min(newT, next.t);

    localPoints.value[draggingIndex.value] = { t: newT, v: newV };
};
const handleMouseUp = () => {
    if (draggingIndex.value !== -1) {
        draggingIndex.value = -1;
        sortAndEmit();
    }
};
const handleCanvasClick = (e) => {
    // Add point if not dragging
    // Need to differentiate distinct click vs drag-release. 
    // Usually handled by only clicking if draggingIndex was -1 keydown/up.
    // For simplicity: if target is svg (not circle), add point.
    if (e.target.tagName !== 'circle') {
        const rect = canvasRef.value.getBoundingClientRect();
        const t = pxToValX(e.clientX - rect.left);
        const v = pxToValY(e.clientY - rect.top);
        localPoints.value.push({ t, v });
        sortAndEmit();
    }
};
const removePoint = (index) => {
    localPoints.value.splice(index, 1);
    emitUpdate();
};

// --- TABLE LOGIC ---
const addPointRow = () => {
    const lastT = localPoints.value.length ? localPoints.value[localPoints.value.length-1].t : 0;
    localPoints.value.push({ t: lastT + 3600, v: 0 });
    emitUpdate();
};

</script>

<style scoped>
.ganglinien-editor {
    display: flex; flex-direction: column;
    height: 100%;
    background: #1e272e;
    border-radius: 4px;
    overflow: hidden;
}

/* TABS */
.editor-tabs {
    display: flex;
    background: #1a252f;
    border-bottom: 1px solid #34495e;
}
.tab-btn {
    flex: 1;
    background: transparent;
    color: #bdc3c7;
    border: none;
    padding: 8px;
    cursor: pointer;
    font-weight: 500;
    border-bottom: 2px solid transparent;
}
.tab-btn:hover { color: white; background: #2c3e50; }
.tab-btn.active { color: #3498db; border-bottom-color: #3498db; }

/* MODES */
.mode-graph, .mode-table {
    flex: 1;
    display: flex; flex-direction: column;
    overflow: hidden;
    position: relative;
}

/* GRAPH STYLES */
.canvas-wrapper {
    flex: 1;
    width: 100%;
    height: 100%; /* Ensure it fills parent */
    cursor: crosshair;
    overflow: hidden; /* Prevent SVG from pushing layout */
    display: flex; /* Centers if needed, but mostly for block context */
}
.svg-content {
    display: block; /* Removes inline gap */
}
.control-point {
    fill: #34495e; stroke: #3498db; stroke-width: 2; cursor: grab;
}
.control-point:hover { fill: #ecf0f1; r: 8; }
.control-point.active { fill: #e74c3c; stroke: white; cursor: grabbing; }

.hint { padding: 4px; font-size: 0.75rem; color: #7f8c8d; text-align: center; }

/* TABLE STYLES */
.table-scroll {
    flex: 1; overflow-y: auto; padding: 10px;
}
.data-table {
    width: 100%; border-collapse: collapse; color: #dfe6e9; font-size: 0.9rem;
}
.data-table th { text-align: left; color: #bdc3c7; padding: 4px; font-weight: normal; font-size: 0.8rem; }
.data-table td { padding: 4px; border-bottom: 1px solid #2d3436; }

.input-cell {
    width: 100%;
    background: #2d3436;
    border: 1px solid #34495e;
    color: white;
    padding: 4px;
    border-radius: 3px;
}
.input-cell:focus { border-color: #3498db; outline: none; }

.btn-del-row {
    background: none; border: none; color: #c0392b; cursor: pointer; font-size: 1.2rem;
}
.btn-del-row:hover { color: #e74c3c; }

.btn-add-row {
    margin: 10px; padding: 8px;
    background: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer;
}
.btn-add-row:hover { background: #2ecc71; }

</style>
