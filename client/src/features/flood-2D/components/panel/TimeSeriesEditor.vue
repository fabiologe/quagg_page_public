<template>
  <div class="time-series-visual-editor">
    
    <div class="header">
      <span class="title">Visual Hydrograph</span>
      <small class="hint">Draw the flow curve. Double-click to remove points.</small>
    </div>

    <div 
      class="editor-canvas" 
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
        <!-- GRID & AXES -->
        <g class="grid">
             <!-- X Axis Base -->
             <line :x1="padding.left" :y1="height - padding.bottom" :x2="width - padding.right" :y2="height - padding.bottom" stroke="#7f8c8d" stroke-width="1" />
             <!-- Y Axis Base -->
             <line :x1="padding.left" :y1="padding.top" :x2="padding.left" :y2="height - padding.bottom" stroke="#7f8c8d" stroke-width="1" />
        </g>

        <!-- PATH -->
        <path 
            :d="pathD" 
            fill="none" 
            stroke="#3498db" 
            stroke-width="2" 
            class="data-line"
        />

        <!-- AREA (Optional fill) -->
        <path 
            :d="areaD" 
            fill="rgba(52, 152, 219, 0.2)" 
            stroke="none"
        />

        <!-- INTERACTIVE POINTS -->
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
        <text v-if="draggingIndex !== -1" :x="10" :y="20" fill="#ecf0f1" font-size="10">
            T: {{ formatTime(localPoints[draggingIndex].t) }} | V: {{ localPoints[draggingIndex].v.toFixed(2) }}
        </text>

      </svg>
    </div>
    
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  duration: { type: Number, default: 7200 } // Default 2h view if not specified
});

const emit = defineEmits(['update:modelValue']);

// Layout
const width = ref(400); // Responsive via ResizeObserver later? Fixed for now or use 100% wrapper
const height = ref(200);
const padding = { top: 20, right: 20, bottom: 20, left: 40 };

const canvasRef = ref(null);
const localPoints = ref([]);
const draggingIndex = ref(-1);

// X Scaling (Time)
const maxTime = computed(() => {
    // Use prop duration or max point time
    const maxPt = localPoints.value.length > 0 ? localPoints.value[localPoints.value.length-1].t : 0;
    return Math.max(props.duration, maxPt, 60);
});

// Y Scaling (Value)
const maxValue = computed(() => {
    if (localPoints.value.length === 0) return 10;
    const maxV = Math.max(...localPoints.value.map(p => p.v));
    return Math.max(maxV * 1.2, 5); // Add headroom
});

// --- COORD TRANSFORM ---
const valToPxX = (t) => {
    const safeT = Math.max(0, Math.min(maxTime.value, t));
    const range = width.value - padding.left - padding.right;
    return padding.left + (safeT / maxTime.value) * range;
};

const valToPxY = (v) => {
    const range = height.value - padding.top - padding.bottom;
    // Invert Y
    return (height.value - padding.bottom) - (v / maxValue.value) * range;
};

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

// --- DATA SYNC ---
watch(() => props.modelValue, (newVal) => {
    // Only update if not dragging to avoid loops
    if (draggingIndex.value === -1) {
        // Deep copy
        localPoints.value = newVal ? JSON.parse(JSON.stringify(newVal)) : [];
        if (localPoints.value.length === 0) {
             localPoints.value.push({ t: 0, v: 0 });
        }
        // Ensure sorted
        localPoints.value.sort((a,b) => a.t - b.t);
    }
}, { immediate: true, deep: true });

onMounted(() => {
    // Simple responsive width
    if (canvasRef.value) {
        const rect = canvasRef.value.getBoundingClientRect();
        width.value = rect.width || 400; // Init
        
        // ResizeObserver
        const ro = new ResizeObserver(entries => {
            for (let entry of entries) {
                width.value = entry.contentRect.width;
            }
        });
        ro.observe(canvasRef.value);
    }
});

// --- INTERACTION ---

const handleMouseDown = (index) => {
    draggingIndex.value = index;
};

const handleMouseUp = () => {
    if (draggingIndex.value !== -1) {
        draggingIndex.value = -1;
        emitUpdate();
    }
};

const handleMouseMove = (e) => {
    if (draggingIndex.value === -1) return;
    
    // Calculate new values
    const rect = canvasRef.value.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    
    let newT = pxToValX(cursorX);
    let newV = pxToValY(cursorY);
    
    // CONSTRAINTS
    const idx = draggingIndex.value;
    const prev = localPoints.value[idx - 1];
    const next = localPoints.value[idx + 1];
    
    // Time constraint
    if (prev && newT <= prev.t) newT = prev.t + 1; // 1s buffer
    if (next && newT >= next.t) newT = next.t - 1;
    
    // Start node usually t=0
    if (idx === 0) newT = 0; 
    
    localPoints.value[idx].t = newT;
    localPoints.value[idx].v = newV;
};

const handleCanvasClick = (e) => {
    // Only add point if clicked on empty space (not on circle)
    // Actually simpler: Raycast to line closest point?
    // Or just "Append" if > max time?
    // User requested "Click on line adds point".
    
    // Simple implementation: Add point at cursor T, interpolated V (or 0)
    // Find where cursor fits in T
    if (draggingIndex.value !== -1) return; // Ignore click during drag/release
    if (e.target.tagName === 'circle') return; // Clicked on existing point

    const rect = canvasRef.value.getBoundingClientRect();
    const t = pxToValX(e.clientX - rect.left);
    const v = pxToValY(e.clientY - rect.top);
    
    // Insert sorted
    const pts = localPoints.value;
    let spliceIdx = pts.length;
    for(let i=0; i<pts.length; i++) {
        if (pts[i].t > t) {
            spliceIdx = i;
            break;
        }
    }
    
    localPoints.value.splice(spliceIdx, 0, { t, v });
    emitUpdate();
};

const removePoint = (index) => {
    if (localPoints.value.length <= 2) return; // Keep at least 2 points
    localPoints.value.splice(index, 1);
    emitUpdate();
};

const emitUpdate = () => {
    emit('update:modelValue', localPoints.value);
};

// --- PATH GENERATION ---
const pathD = computed(() => {
    if (localPoints.value.length === 0) return '';
    const d = localPoints.value.map((p, i) => {
        const cmd = i === 0 ? 'M' : 'L';
        return `${cmd} ${valToPxX(p.t)} ${valToPxY(p.v)}`;
    });
    return d.join(' ');
});

const areaD = computed(() => {
    const line = pathD.value;
    if (!line) return '';
    const startX = valToPxX(localPoints.value[0].t);
    const endX = valToPxX(localPoints.value[localPoints.value.length-1].t);
    const groundY = height.value - padding.bottom;
    
    return `${line} L ${endX} ${groundY} L ${startX} ${groundY} Z`;
});

const formatTime = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
};

</script>

<style scoped>
.time-series-visual-editor {
    display: flex; flex-direction: column;
    background: #233140;
    border-radius: 6px;
    padding: 10px;
    user-select: none;
}

.header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 10px;
}
.title { color: #ecf0f1; font-weight: bold; font-size: 0.9rem; }
.hint { color: #7f8c8d; font-size: 0.75rem; }

.editor-canvas {
    background: #1a252f;
    border: 1px solid #34495e;
    border-radius: 4px;
    height: 200px;
    cursor: crosshair;
    position: relative;
    overflow: hidden;
}

.control-point {
    fill: #ecf0f1;
    stroke: #34495e;
    stroke-width: 1px;
    cursor: grab;
    transition: r 0.1s;
}
.control-point:hover { r: 8; fill: #e74c3c; }
.control-point.active { fill: #e74c3c; cursor: grabbing; r: 8; }

.data-line {
    pointer-events: none; /* Let clicks pass to canvas */
}
</style>
