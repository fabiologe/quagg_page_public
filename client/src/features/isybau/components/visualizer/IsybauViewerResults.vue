<template>
  <div 
    class="isybau-viewer" 
    :class="`mode-${mode}`"
    ref="container"
    @mousedown="startPan"
    @mousemove="pan"
    @mouseup="endPan"
    @mouseleave="endPan"
    @wheel.prevent="zoom"
  >
    <div v-if="!nodes.size" class="empty-state">
      No network data to display.
    </div>
    <svg v-else :viewBox="viewBox" preserveAspectRatio="xMidYMid meet">
      <defs>
        <!-- Background Grid Line (1m or 10m based on gridSize) -->
        <pattern id="gridPattern" :x="gridOffsetX" :y="gridOffsetY" :width="scale * gridSize" :height="scale * gridSize" patternUnits="userSpaceOnUse">
          <path :d="`M ${scale * gridSize} 0 L 0 0 0 ${scale * gridSize}`" fill="none" stroke="rgba(46, 204, 113, 0.4)" stroke-width="1" />
        </pattern>
      </defs>
      <rect v-if="gridSize > 0" x="-50000" y="-50000" width="100000" height="100000" fill="url(#gridPattern)" style="pointer-events: none;" />
      
      <g :transform="transformString">
        <!-- Areas (Catchments) -->
        <g class="areas">
          <polygon
            v-for="area in areas"
            :key="area.id"
            :points="getPolygonPoints(area.points)"
            class="area-polygon"
            @click.stop="selectElement(area, 'area')"
          >
            <title>{{ area.id }}</title>
          </polygon>
        </g>

        <!-- Flow Paths (Runoff) -->
        <g class="flow-paths" v-if="flowPaths.length">
          <template v-for="(path, index) in flowPaths" :key="index">
            <line
              :x1="path.x1 - bounds.minX"
              :y1="bounds.maxY - path.y1"
              :x2="path.x2 - bounds.minX"
              :y2="bounds.maxY - path.y2"
              class="flow-line"
              vector-effect="non-scaling-stroke"
            />
          </template>
        </g>

        <!-- Edges -->
        <g class="edges">
          <template v-for="[id, edge] in edges" :key="id">
            <!-- Render as Polyline if coords exist -->
            <polyline
              v-if="edge.coords && edge.coords.length > 1"
              :points="getPolygonPoints(edge.coords)"
              class="edge-line"
              vector-effect="non-scaling-stroke"
              :class="{ 'selected': selectedElement?.id === id }"
              :style="{ stroke: getEdgeColor(id) }"
              @click.stop="selectElement(edge, 'edge')"
            />
            <!-- Fallback to straight line if no coords -->
            <line
              v-else-if="getNode(edge.from) && getNode(edge.to)"
              :x1="getNode(edge.from).x - bounds.minX"
              :y1="bounds.maxY - getNode(edge.from).y"
              :x2="getNode(edge.to).x - bounds.minX"
              :y2="bounds.maxY - getNode(edge.to).y"
              class="edge-line"
              vector-effect="non-scaling-stroke"
              :class="{ 'selected': selectedElement?.id === id }"
              :style="{ stroke: getEdgeColor(id) }"
              @click.stop="selectElement(edge, 'edge')"
            />
            
            <!-- Direction Arrow -->
            <path
              v-if="getEdgeArrow(edge)"
              d="M -3 -3 L 3 0 L -3 3 Z"
              class="edge-arrow"
              :transform="getEdgeArrowTransform(edge)"
              vector-effect="non-scaling-stroke"
              :style="{ fill: getEdgeColor(id) || '#666' }"
            />
          </template>
        </g>

        <!-- Selection ring for selected node (rendered below nodes layer) -->
        <circle
          v-if="selectedElement && nodes.has(selectedElement?.id)"
          :cx="selectedElement.x - bounds.minX"
          :cy="bounds.maxY - selectedElement.y"
          :r="selectedElement.diameter > 0
            ? selectedElement.diameter / 2 + (2.5 * baseUnit / scale)
            : (3.5 * baseUnit / scale)"
          class="selection-ring"
          vector-effect="non-scaling-stroke"
        />

        <!-- Nodes -->
        <g class="nodes">
          <template v-for="[id, node] in nodes" :key="id">
            <!-- Node representation -->
            <circle
              v-if="node.diameter > 0"
              :cx="node.x - bounds.minX"
              :cy="bounds.maxY - node.y"
              :r="node.diameter / 2"
              class="node-circle"
              :class="{ 'selected': selectedElement?.id === id }"
              :style="{ fill: getNodeColor(id) }"
              @click.stop="selectElement(node, 'node')"
            />

            <!-- Dimensionless nodes as X mark -->
            <g v-else @click.stop="selectElement(node, 'node')" style="cursor: pointer;">
              <!-- Invisible circle for hit area -->
              <circle
                :cx="node.x - bounds.minX"
                :cy="bounds.maxY - node.y"
                :r="(2.0 * baseUnit) / scale"
                fill="transparent"
              />
              <!-- X lines -->
              <line
                :x1="(node.x - bounds.minX) - ((1.0 * baseUnit) / scale)"
                :y1="(bounds.maxY - node.y) - ((1.0 * baseUnit) / scale)"
                :x2="(node.x - bounds.minX) + ((1.0 * baseUnit) / scale)"
                :y2="(bounds.maxY - node.y) + ((1.0 * baseUnit) / scale)"
                class="node-x"
                :class="{ 'selected': selectedElement?.id === id }"
                :style="{ stroke: getNodeColor(id) || '#2c3e50' }"
                vector-effect="non-scaling-stroke"
              />
              <line
                :x1="(node.x - bounds.minX) + ((1.0 * baseUnit) / scale)"
                :y1="(bounds.maxY - node.y) - ((1.0 * baseUnit) / scale)"
                :x2="(node.x - bounds.minX) - ((1.0 * baseUnit) / scale)"
                :y2="(bounds.maxY - node.y) + ((1.0 * baseUnit) / scale)"
                class="node-x"
                :class="{ 'selected': selectedElement?.id === id }"
                :style="{ stroke: getNodeColor(id) || '#2c3e50' }"
                vector-effect="non-scaling-stroke"
              />
            </g>

            <!-- Guide Line for Dragged Label -->
            <line
              v-if="labelOffsets.has(id) && (labelOffsets.get(id).x !== 0 || labelOffsets.get(id).y !== 0)"
              :x1="node.x - bounds.minX"
              :y1="bounds.maxY - node.y"
              :x2="(node.x - bounds.minX) + getLabelLineEndpoint(id).x"
              :y2="(bounds.maxY - node.y) - getLabelLineEndpoint(id).y"
              class="label-guide-line"
              vector-effect="non-scaling-stroke"
            />

            <!-- Node Label -->
            <g v-if="scale > 0.001" :transform="`translate(${(node.x - bounds.minX) + (labelOffsets.get(id)?.x || 0)}, ${(bounds.maxY - node.y) - (labelOffsets.get(id)?.y || 0)}) scale(${1/scale})`">
              <text
                x="0"
                y="0"
                class="node-label"
                :class="{ 'dragging': draggingLabelId === id }"
                :dy="`${-5 * textSizeMultiplier * baseUnit}`"
                text-anchor="middle"
                :style="{ fontSize: `${4 * textSizeMultiplier * baseUnit}px` }"
                @mousedown.stop.prevent="startLabelDrag(id, node, $event)"
              >
                {{ id }}
              </text>
            </g>
          </template>
        </g>
      </g>
    </svg>
    
    <!-- Controls -->
    <ViewerControls 
        :mode="mode"
        :textSizeMultiplier="textSizeMultiplier"
        :arrowSizeMultiplier="arrowSizeMultiplier"
        @set-mode="mode = $event"
        @update:textSizeMultiplier="textSizeMultiplier = $event"
        @update:arrowSizeMultiplier="arrowSizeMultiplier = $event"
        @reset-view="resetView"
    />

    <!-- Color Legend -->
    <div class="color-legend">
      <div class="legend-row"><span class="dot dot-red"></span> Überflutet / h/hvoll &gt; 90%</div>
      <div class="legend-row"><span class="dot dot-orange"></span> Eingestaut / h/hvoll 75–90%</div>
      <div class="legend-row"><span class="dot dot-gray"></span> OK</div>
    </div>

    <!-- Info Panel -->
    <ElementInfoResult
      :selectedElement="selectedElement"
      :nodeResults="nodeResults"
      :hydraulics="hydraulics"
      :runoffDetails="runoffDetails"
      :nodes="nodes"
      @close="selectedElement = null"
      @show-details="$emit('show-details', $event)"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount, reactive } from 'vue';
import ViewerControls from './ViewerControls.vue';
import ElementInfoResult from './ElementInfoResult.vue';

const props = defineProps({
  nodes: {
    type: Map,
    required: true
  },
  edges: {
    type: Map,
    required: true
  },
  areas: {
    type: Array,
    default: () => []
  },
  hydraulics: {
    type: Map,
    default: () => new Map()
  },
  runoffDetails: {
    type: Array,
    default: () => []
  },
  nodeResults: {
    type: Map,
    default: () => new Map()
  }
});



const emit = defineEmits(['select-node', 'select-edge', 'show-details']);

const getNode = (id) => props.nodes.get(id);



// Mode State
const mode = ref('select'); // Default to select for better interactivity

// Size State
const textSizeMultiplier = ref(0.25);
const arrowSizeMultiplier = ref(0.5);
const gridSize = ref(1); // 1 = 1x1m, 10 = 10x10m, 0 = Off

// Selection State
const selectedElement = ref(null);

const selectElement = (element, type) => {
  if (isDragging.value) return; // Prevent selection if dragging was detected
  
  // Allow selection in any mode (simple viewer behavior)
  selectedElement.value = element;
  if (type === 'node') emit('select-node', element);
  else if (type === 'edge') emit('select-edge', element);
};

// No updates allowed in results view


// Viewport State
const translateX = ref(0);
const translateY = ref(0);
const scale = ref(1);
const isPanning = ref(false);
const startX = ref(0);
const startY = ref(0);

// Calculate initial bounds
const bounds = computed(() => {
  if (!props.nodes.size) return { minX: 0, minY: 0, width: 100, height: 100 };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const node of props.nodes.values()) {
    if (node.x < minX) minX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.x > maxX) maxX = node.x;
    if (node.y > maxY) maxY = node.y;
  }

  const padding = 5;
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxY: maxY + padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
    centerX: (maxX - minX + padding * 2) / 2,
    centerY: (maxY - minY + padding * 2) / 2
  };
});

// Base Unit for Universal Visual Scaling
const baseUnit = computed(() => {
  const w = bounds.value.width || 0;
  const h = bounds.value.height || 0;
  if (w === 0 && h === 0) return 1;
  const maxDim = Math.max(w, h);
  // Using 1000 as a standard assumed canvas width.
  // This means across 1000 "standard" pixels, elements look properly sized.
  return maxDim / 1000;
});

const viewBox = computed(() => {
  const b = bounds.value;
  return `0 0 ${b.width} ${b.height}`;
});
const gridOffsetX = computed(() => {
  if (gridSize.value === 0) return 0;
  const cx = Number.isFinite(bounds.value.centerX) ? bounds.value.centerX : 50;
  const screenOriginX = (cx + translateX.value) - (cx * scale.value);
  const moduloOffset = -(bounds.value.minX % gridSize.value) * scale.value;
  return screenOriginX + moduloOffset;
});

const gridOffsetY = computed(() => {
  if (gridSize.value === 0) return 0;
  const cy = Number.isFinite(bounds.value.centerY) ? bounds.value.centerY : 50;
  const screenOriginY = (cy + translateY.value) - (cy * scale.value);
  const moduloOffset = (bounds.value.maxY % gridSize.value) * scale.value;
  return screenOriginY + moduloOffset;
});

const transformString = computed(() => {
  const cx = bounds.value.centerX;
  const cy = bounds.value.centerY;
  
  return `translate(${cx + translateX.value}, ${cy + translateY.value}) scale(${scale.value}) translate(${-cx}, ${-cy})`;
});

const getPolygonPoints = (points) => {
  const b = bounds.value;
  return points.map(p => `${p.x - b.minX},${b.maxY - p.y}`).join(' ');
};

// Flow Paths Calculation
const flowPaths = computed(() => {
  if (!props.runoffDetails.length) return [];
  
  return props.runoffDetails.map(detail => {
    const area = props.areas.find(a => a.id === detail.areaId);
    const node = props.nodes.get(detail.nodeId);
    
    if (!area || !node) return null;
    
    // Calculate Centroid
    let cx = 0, cy = 0;
    if (area.points && area.points.length) {
      area.points.forEach(p => {
        cx += p.x;
        cy += p.y;
      });
      cx /= area.points.length;
      cy /= area.points.length;
    }
    
    return {
      x1: cx,
      y1: cy,
      x2: node.x,
      y2: node.y,
      tc: detail.tc
    };
  }).filter(p => p !== null);
});

const getAreaRunoff = (areaId) => {
  const details = props.runoffDetails.filter(d => d.areaId === areaId);
  if (!details.length) return null;
  
  return {
    maxFlow: details.reduce((sum, d) => sum + d.maxFlow, 0),
    totalVolume: details.reduce((sum, d) => sum + d.totalVolume, 0),
    tc: details[0].tc // Use first one (usually same for area)
  };
};

const getEdgeArrow = (edge) => {
  const n1 = getNode(edge.from);
  const n2 = getNode(edge.to);
  return n1 && n2;
};

const getEdgeArrowTransform = (edge) => {
  const n1 = getNode(edge.from);
  const n2 = getNode(edge.to);
  if (!n1 || !n2) return '';
  
  const x1 = n1.x - bounds.value.minX;
  const y1 = bounds.value.maxY - n1.y;
  const x2 = n2.x - bounds.value.minX;
  const y2 = bounds.value.maxY - n2.y;
  
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  
  const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
  
  // Scale correction: scale(1/scale) to keep size constant
  return `translate(${mx}, ${my}) rotate(${angle}) scale(${(2.0 * arrowSizeMultiplier.value * baseUnit.value)/scale.value})`;
};

const getEdgeColor = (id) => {
  if (selectedElement.value?.id === id) return null; // Let CSS handle selection
  if (!props.hydraulics || !props.hydraulics.has(id)) return null;
  
  const res = props.hydraulics.get(id);
  const util = res.utilization || 0;
  
  // Utilization is likely percentage (0-100+) based on modal display
  if (util > 90) return '#e74c3c'; // Red
  if (util >= 75) return '#f39c12'; // Orange
  return null;
};

const getNodeColor = (id) => {
  if (selectedElement.value?.id === id) return null; // Let CSS handle selection
  if (!props.nodeResults || !props.nodeResults.has(id)) return null;

  const res = props.nodeResults.get(id);
  if (res.overflow || (res.floodingVolume && res.floodingVolume > 0)) return '#e74c3c'; // Rot: Überflutung
  if (res.surcharged) return '#f39c12'; // Orange: Eingestaut
  return null;
};

// Drag Detection
const isDragging = ref(false);
const dragThreshold = 3; // px
const accumulatedMove = ref(0);

// Label Dragging State
const labelOffsets = reactive(new Map());
const draggingLabelId = ref(null);
const startLabelX = ref(0);
const startLabelY = ref(0);

// Helper to get world coords from event (simplistic implementation missing getScreenCTM offset)
const getEventCoords = (clientX, clientY) => {
    const svg = container.value?.querySelector('svg');
    if(!svg) return null;
    
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    
    const cx = bounds.value.centerX;
    const cy = bounds.value.centerY;
    const tx = translateX.value;
    const ty = translateY.value;
    const s = scale.value;
    
    const rawX = (svgP.x - (cx + tx)) / s + cx;
    const rawY = (svgP.y - (cy + ty)) / s + cy;
    
    return { 
      x: rawX + bounds.value.minX, 
      y: bounds.value.maxY - rawY 
    };
};

const startLabelDrag = (id, node, e) => {
    if (e.button !== 0) return; // Only left click
    draggingLabelId.value = id;
    
    const coords = getEventCoords(e.clientX, e.clientY);
    if (coords) {
        startLabelX.value = coords.x;
        startLabelY.value = coords.y;
    }
    selectElement(node, 'node');
};

const getLabelLineEndpoint = (nodeId) => {
  const currentOffset = labelOffsets.get(nodeId);
  if (!currentOffset) return { x: 0, y: 0 };
  
  const dx = currentOffset.x;
  const dy = currentOffset.y;

  // The text is placed at: x = NodeX + dx, y = NodeY - dy
  // Then an SVG dy shifts it permanently: dy="-5 * textSizeMultiplier"
  // The bounding box center is at approx y - 6 * textSizeMultiplier
  // It scales around its center by 1/scale.
  // We want the line to end exactly at the text's bottom edge, plus a 2px visual gap.
  
  const tsm = textSizeMultiplier.value;
  const bu = baseUnit.value;
  const s = scale.value;
  
  // Inside the text's <g>, scale is 1/scale.
  // The bottom edge of the text is roughly 1 * baseUnit down from the baseline.
  // The baseline is at -5 * tsm * baseUnit.
  // Therefore the visual bottom is at -4 * tsm * baseUnit.
  // To leave a 1 * baseUnit visual gap, target Y inside <g> is:
  const localTargetY = -4 * tsm * bu + 1 * bu;
  
  // Convert into world space so the map-space drawing line hits it correctly
  const worldTargetYOffset = localTargetY / s;
  
  return {
      x: dx,
      y: dy - worldTargetYOffset
  };
};

// Pan Logic
const startPan = (e) => {
  // Allow pan if mode is 'pan' (left click) OR Middle Click (button 1)
  const isLeftClick = e.button === 0;
  const isMiddleClick = e.button === 1;

  if (!isMiddleClick && (mode.value !== 'pan' || !isLeftClick)) return;
  
  if (isMiddleClick) e.preventDefault();
  
  isPanning.value = true;
  isDragging.value = false;
  accumulatedMove.value = 0;
  startX.value = e.clientX;
  startY.value = e.clientY;
};

const pan = (e) => {
  if (draggingLabelId.value) {
      const coords = getEventCoords(e.clientX, e.clientY);
      if (coords) {
          const dx = coords.x - startLabelX.value;
          const dy = coords.y - startLabelY.value;
          
          const current = labelOffsets.get(draggingLabelId.value) || { x: 0, y: 0 };
          labelOffsets.set(draggingLabelId.value, {
              x: current.x + dx,
              y: current.y + dy
          });
          
          startLabelX.value = coords.x;
          startLabelY.value = coords.y;
      }
      return;
  }

  if (!isPanning.value) return;
  
  const dx = e.clientX - startX.value;
  const dy = e.clientY - startY.value;
  
  accumulatedMove.value += Math.abs(dx) + Math.abs(dy);
  if (accumulatedMove.value > dragThreshold) {
    isDragging.value = true;
  }
  
  const sensitivity = bounds.value.width / 800; 
  
  translateX.value += dx * sensitivity / scale.value;
  translateY.value += dy * sensitivity / scale.value;
  
  startX.value = e.clientX;
  startY.value = e.clientY;
};

const endPan = () => {
  if (draggingLabelId.value) {
      draggingLabelId.value = null;
  }

  isPanning.value = false;
  setTimeout(() => {
    isDragging.value = false;
  }, 50);
};

// Zoom Logic
const zoom = (e) => {
  const zoomFactor = 0.1;
  let delta = e.deltaY > 0 ? -zoomFactor : zoomFactor;

  // Make zooming proportional
  const newScale = Math.max(0.1, Math.min(50, scale.value * (1 + delta)));
  if (newScale === scale.value) return;

  const svg = container.value?.querySelector('svg');
  if(!svg) {
    scale.value = newScale;
    return;
  }
  
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  
  // Transform screen coordinate to SVG viewport coordinate (svgP.x, svgP.y)
  const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
  
  const cx = Number.isFinite(bounds.value.centerX) ? bounds.value.centerX : 50;
  const cy = Number.isFinite(bounds.value.centerY) ? bounds.value.centerY : 50;
  
  // Find the exact coordinate on the original map that lies under the cursor
  const rawX = (svgP.x - (cx + translateX.value)) / scale.value + cx;
  const rawY = (svgP.y - (cy + translateY.value)) / scale.value + cy;
  
  // Adjust transform so that the same map coordinate stays under the cursor at the new scale
  translateX.value += (rawX - cx) * (scale.value - newScale);
  translateY.value += (rawY - cy) * (scale.value - newScale);
  
  scale.value = newScale;
};

const resetView = () => {
  translateX.value = 0;
  translateY.value = 0;
  scale.value = 1;
  selectedElement.value = null;
};

// Reset when data changes
watch(() => props.nodes, () => {
  resetView();
}, { deep: true });

</script>

<style scoped>
.isybau-viewer {
  width: 100%;
  height: 100%;
  background: #f8f9fa;
  border: 1px solid #ddd;
  overflow: hidden;
  position: relative;
  cursor: default;
  user-select: none;
}

.isybau-viewer.mode-pan {
  cursor: grab;
}

.isybau-viewer.mode-pan:active {
  cursor: grabbing;
}

.isybau-viewer.mode-select {
  cursor: default;
}

svg {
  width: 100%;
  height: 100%;
  display: block; 
}

/* Areas */
.area-polygon {
  fill: rgba(52, 152, 219, 0.2);
  stroke: rgba(52, 152, 219, 0.5);
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
  cursor: pointer;
  transition: fill 0.2s;
}

.area-polygon:hover {
  fill: rgba(52, 152, 219, 0.4);
}

.area-polygon.selected {
  fill: rgba(231, 76, 60, 0.3);
  stroke: #e74c3c;
  stroke-width: 2px;
}

/* Flow Paths */
.flow-line {
  stroke: #3498db;
  stroke-width: 1.5px;
  stroke-dasharray: 5, 5;
  opacity: 0.8;
  pointer-events: none;
}

.flow-label {
  font-size: 12px;
  fill: #2980b9;
  font-weight: bold;
  pointer-events: none;
  text-shadow: 0px 0px 2px white;
}

/* Edges */
.edge-line {
  stroke: #666;
  stroke-width: 2px; 
  vector-effect: non-scaling-stroke; 
  transition: stroke 0.2s, stroke-width 0.2s;
  cursor: pointer;
  fill: none;
}

.edge-line:hover {
  stroke: #42b983;
  stroke-width: 4px;
}

.edge-line.selected {
  stroke: #e74c3c;
  stroke-width: 4px;
}

.edge-arrow {
  fill: #666;
  pointer-events: none;
}

/* Nodes */
.node-circle {
  fill: #2c3e50;
  transition: fill 0.2s, r 0.2s;
  cursor: pointer;
}

.node-circle:hover {
  fill: #42b983;
}

.node-circle.selected {
  fill: #e74c3c;
  stroke: white;
  stroke-width: 0.1;
}

.node-x {
  stroke-width: 2px;
  transition: stroke 0.2s;
  pointer-events: none;
}

.node-x.selected {
  stroke: #e74c3c !important;
  stroke-width: 3px;
}

.node-label {
  fill: #2c3e50;
  pointer-events: all;
  cursor: grab;
  text-shadow: 0px 0px 0.2px white;
  opacity: 0.8;
  transition: font-size 0.2s;
}

.node-label.dragging {
  cursor: grabbing;
  font-weight: bold;
  opacity: 1;
}

.label-guide-line {
  stroke: #f39c12; /* Orange */
  stroke-width: 1px;
  stroke-dasharray: 4, 4;
  opacity: 0.7;
  pointer-events: none;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
}

.controls {
  position: absolute;
  bottom: 1rem;
  left: 1rem;
  background: white;
  padding: 0.5rem;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 10;
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.mode-toggle {
  display: flex;
  gap: 0.25rem;
}

.size-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.5rem;
}

.size-control input[type="range"] {
  width: 80px;
  cursor: pointer;
}

.controls button {
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  width: 32px;
  height: 32px;
  cursor: pointer;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.controls button.active {
  background: #e3f2fd;
  border-color: #2196F3;
  color: #2196F3;
}

.separator-v {
  width: 1px;
  height: 24px;
  background: #eee;
}

.controls button:hover {
  background: #f0f0f0;
  transform: scale(1.05);
}


/* ── Selection ring pulse (SVG node highlight) ── */
@keyframes ring-pulse {
  0%   { stroke-opacity: 0.9; stroke-width: 2px; }
  50%  { stroke-opacity: 0.25; stroke-width: 5px; }
  100% { stroke-opacity: 0.9; stroke-width: 2px; }
}

.selection-ring {
  fill: none;
  stroke: #e74c3c;
  pointer-events: none;
  animation: ring-pulse 1.4s ease-in-out infinite;
}

/* ── Selected edge pulse ── */
@keyframes edge-pulse {
  0%, 100% { stroke-width: 4px; }
  50%       { stroke-width: 7px; }
}

.edge-line.selected {
  stroke: #e74c3c;
  animation: edge-pulse 1.4s ease-in-out infinite;
}


/* Color Legend */
.color-legend {
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(6px);
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  font-size: 0.78rem;
  color: #444;
  z-index: 10;
  pointer-events: none;
}

.legend-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.25rem;
}

.legend-row:last-child { margin-bottom: 0; }

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-red    { background: #e74c3c; }
.dot-orange { background: #f39c12; }
.dot-gray   { background: #666; }
</style>
