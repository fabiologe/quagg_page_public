<template>
  <div 
    class="isybau-viewer" 
    :class="`mode-${mode}`"
    ref="container"
    @mousedown="handleMouseDown"
    @mousemove="pan"
    @mouseup="endPan"
    @mouseleave="endPan"
    @wheel.prevent="zoom"
    @click="handleMapClick"
    @dblclick="handleMapDblClick"
  >
    <!-- Always render SVG to capture clicks, even if empty -->
    <svg :viewBox="viewBox" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="grid1m" :x="gridOffsetX" :y="gridOffsetY" width="1" height="1" patternUnits="userSpaceOnUse">
          <!-- 1x1m Grid Line -->
          <path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgba(46, 204, 113, 0.4)" stroke-width="2" vector-effect="non-scaling-stroke"/>
        </pattern>
      </defs>
      
      <g :transform="transformString">
        <!-- Infinite Grid Background -->
        <rect v-if="showGrid" x="-5000" y="-5000" width="10000" height="10000" fill="url(#grid1m)" style="pointer-events: none;" />

        <!-- Areas (Catchments) -->
        <g class="areas">
          <polygon
            v-for="area in areas"
            :key="area.id"
            :points="getPolygonPoints(area.points)"
            class="area-polygon"
            @click.stop="selectElement(area, 'area', $event)"
          >
            <title>{{ area.id }}</title>
          </polygon>
        </g>

        <!-- Drawing Preview -->
        <g v-if="drawingPoints.length > 0" class="drawing-preview">
             <polyline
                :points="getPolygonPoints(drawingPoints)"
                fill="none"
                stroke="#e74c3c"
                stroke-width="2"
                stroke-dasharray="5, 5"
                vector-effect="non-scaling-stroke"
             />
             <!-- Draw vertices -->
             <circle 
                v-for="(p, i) in drawingPoints" :key="i"
                :cx="p.x - bounds.minX"
                :cy="bounds.maxY - p.y"
                :r="0.5 / scale"
                stroke="none"
                fill="#e74c3c"
                vector-effect="non-scaling-stroke"
             />
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
        <!-- Edges -->
        <g class="edges">
          <template v-for="edge in edgeArray" :key="edge.id">
            <!-- Render as Polyline if coords exist -->
            <polyline
              v-if="edge.coords && edge.coords.length > 1"
              :points="getPolygonPoints(edge.coords)"
              class="edge-line"
              vector-effect="non-scaling-stroke"
              :class="{ 'selected': selectedElement?.id === edge.id }"
              :style="{ stroke: getEdgeColor(edge.id) }"
              @click.stop="selectElement(edge, 'edge', $event)"
            />
            <!-- Fallback to straight line if no coords -->
            <line
              v-else-if="getNode(edge.fromNodeId) && getNode(edge.toNodeId)"
              :x1="getNode(edge.fromNodeId).x - bounds.minX"
              :y1="bounds.maxY - getNode(edge.fromNodeId).y"
              :x2="getNode(edge.toNodeId).x - bounds.minX"
              :y2="bounds.maxY - getNode(edge.toNodeId).y"
              class="edge-line"
              vector-effect="non-scaling-stroke"
              :class="{ 'selected': selectedElement?.id === edge.id }"
              :style="{ stroke: getEdgeColor(edge.id) }"
              @click.stop="selectElement(edge, 'edge', $event)"
            />
            
            <!-- Direction Arrow -->
            <path
              v-if="getEdgeArrow(edge)"
              d="M -3 -3 L 3 0 L -3 3 Z"
              class="edge-arrow"
              :transform="getEdgeArrowTransform(edge)"
              vector-effect="non-scaling-stroke"
            />
          </template>
        </g>

        <!-- Nodes -->
        <g class="nodes">
          <template v-for="node in nodeArray" :key="node.id">
            <g v-if="Number.isFinite(node.x) && Number.isFinite(node.y)">
                <circle
                :cx="node.x - bounds.minX"
                :cy="bounds.maxY - node.y"
                :r="node.diameter > 0 ? node.diameter / 2 : (2.0 * sizeMultiplier) / scale"
                class="node-circle"
                :class="{ 'selected': selectedElement?.id === node.id }"
                :style="{ fill: getNodeColor(node.id) }"
                @click.stop="selectElement(node, 'node', $event)"
                />
                <!-- Node Label -->
                <text
                v-if="scale > 0.001"
                :x="node.x - bounds.minX"
                :y="bounds.maxY - node.y"
                class="node-label"
                :dy="`${-5 * sizeMultiplier}`"
                text-anchor="middle"
                :transform="`scale(${1/scale})`"
                style="transform-box: fill-box; transform-origin: center;"
                :style="{ fontSize: `${4 * sizeMultiplier}px` }"
                >
                {{ node.id }}
                </text>
            </g>
          </template>
        </g>
      </g>
    </svg>
    
    <!-- Extracted Controls -->
    <ViewerControls 
        :mode="mode"
        :sizeMultiplier="sizeMultiplier"
        @set-mode="mode = $event"
        @update:sizeMultiplier="sizeMultiplier = $event"
        @reset-view="resetView"
    />

    <!-- Extracted Info Window (Popover) -->
    <ElementInfo
        v-if="selectedElement && (interactionMode === 'editProperties' || enablePopover)"
        :selectedElement="selectedElement"
        :hydraulics="hydraulics"
        :runoffDetails="runoffDetails"
        :getMapping="getMapping"
        :getAreaRunoff="getAreaRunoff"
        :nodeResults="nodeResults"
        :position="popoverPosition"
        @close="selectedElement = null"
        @update="updateElement"
        @save="$emit('save-element', $event)"
        @show-details="$emit('show-details', $event)"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { getMapping } from '../../utils/mappings.js';
import ViewerControls from './ViewerControls.vue';
import ElementInfo from './ElementInfo.vue';

const props = defineProps({
  nodes: {
    type: Map,
    required: true
  },
  edges: {
    type: Map,
    required: true
  },
  // Arrays for reliable v-for rendering
  nodeArray: {
     type: Array,
     default: () => []
  },
  edgeArray: {
     type: Array,
     default: () => []
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
  },
  showGrid: {
    type: Boolean,
    default: false
  },
  drawingPoints: {
      type: Array,
      default: () => []
  },
  interactionMode: {
      type: String,
          default: null
  },
  enablePopover: {
      type: Boolean,
      default: true
  },
  focusTarget: {
      type: String, 
      default: null
  }
});



const emit = defineEmits(['select-node', 'select-edge', 'select-area', 'update-element', 'save-element', 'map-click', 'map-dblclick', 'show-details']);

const container = ref(null); // Reference to root div

const getNode = (id) => props.nodes.get(id);

// Watch focusTarget to auto-zoom
watch(() => props.focusTarget, (newId) => {
    if(!newId) return;
    
    // Find the element
    let targetX, targetY;
    
    // Try Node
    const node = props.nodes.get(newId);
    if (node) {
        targetX = node.x;
        targetY = node.y;
        
        // Also select it
        selectElement(node, 'node'); 
    } else {
        // Try Edge
        // Try Area
        // (Implementation for edge center / area centroid could be added here if needed)
        // For 'Quick Win', supporting Nodes is the main request from the user (Schächte)
    }
    
    if (Number.isFinite(targetX)) {
        // Zoom to it
        // We want (targetX - bounds.minX) to be at center
        const bx = targetX - bounds.value.minX;
        const by = bounds.value.maxY - targetY; // Invert Y as per SVG logic
        
        // Target Scale
        const targetScale = 25; // Zoom in level
        
        // Calc translate needed
        // center = (bx + tx) * scale NOT quite. transform is translate(cx+tx...)
        
        // Simplified view reset:
        // desired view center = bx, by
        // center of viewport = bounds.cx, bounds.cy (approx)
        
        // Let's rely on standard pan logic:
        // We want the point (bx, by) to appear at the center of the SVG viewbox
        
        scale.value = targetScale;
        
        // Current center of viewbox (50, 50 mostly)
        const cx = bounds.value.centerX; // This is the rotation center too
        const cy = bounds.value.centerY;
        
        // We want (bx, by) to be at (cx, cy) after transform?
        // SVG viewbox is 0 0 W H. 
        // We display it in full div.
        
        // TranslateX/Y are applied before scale in the transform string?
        // transformString: translate(cx + tx, cy + ty) scale(s) translate(-cx, -cy)
        
        // This effectively scales around (cx, cy) then moves by (tx, ty).
        // So the point at (cx, cy) in world space stays at (cx, cy) + (tx, ty) * 1 ? No.
        
        // Let's just solve for tx, ty such that point P(bx, by) is at center of screen.
        // Actually, let's just approximate for now or logic it out.
        // If tx=0, ty=0, the point (cx, cy) is at the center of the viewport.
        // We want (bx, by) to be at the center.
        // So we need to shift the world so (bx, by) is at (cx, cy).
        // delta = (cx - bx), (cy - by)
        
        translateX.value = (cx - bx);
        translateY.value = (cy - by);
    }
});

// Scroll/Touch inputs might need more robust handling but this suffices for mouse
const getEventCoords = (clientX, clientY) => {
    const svg = container.value?.querySelector('svg');
    if(!svg) return null;
    
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    
    // Transform to SVG ViewBox coords
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    
    const cx = bounds.value.centerX;
    const cy = bounds.value.centerY;
    const tx = translateX.value;
    const ty = translateY.value;
    const s = scale.value;
    
    const rawX = (svgP.x - (cx + tx)) / s + cx;
    const rawY = (svgP.y - (cy + ty)) / s + cy;
    
    const worldX = rawX + bounds.value.minX;
    const worldY = bounds.value.maxY - rawY;
    
    return { x: worldX, y: worldY };
};

// Click Handler
const handleMapClick = (e) => {
    // Only trigger if not panning/dragging
    if (isDragging.value) return;
    
    console.log("IsybauViewer: Click Detected");
    const coords = getEventCoords(e.clientX, e.clientY);
    if(coords) {
         console.log("IsybauViewer: Emitting map-click", coords);
         emit('map-click', coords);
    }
};

const handleMapDblClick = (e) => {
    const coords = getEventCoords(e.clientX, e.clientY);
    if(coords) emit('map-dblclick', coords);
};

// Update mousedown to handleMouseDown
const handleMouseDown = (e) => {
    startPan(e);
};



// Mode State
const mode = ref('pan'); // 'pan' | 'select'

// Size State
const sizeMultiplier = ref(0.5);

// Selection State
const selectedElement = ref(null);

const popoverPosition = ref(null);

const selectElement = (element, type, event = null) => {
  if (mode.value !== 'select' && isDragging.value) return; // Prevent selection  // Allow selection in these modes:
  // 'view' (Hand): User expects to select on click, pan on drag
  // 'select' (Arrow): Standard selection
  // 'addEdge': Needs to select nodes to connect them
  // 'pan': Default internal fall back
  // 'delete': Needs to click elements to delete them
  // Trigger 'select' events even in delete mode, so parent can handle the deletion
  const allowableModes = ['view', 'select', 'addEdge', 'pan', 'delete'];
  if (!allowableModes.includes(mode.value)) return;
  
  if (event && container.value) {
      const rect = container.value.getBoundingClientRect();
      popoverPosition.value = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top
      };
      
      // Ensure we don't go offscreen-ish (basic guard)
      // ElementInfo handles centering above properties
  }
  
  selectedElement.value = element;
  if (type === 'node') emit('select-node', element);
  else if (type === 'edge') emit('select-edge', element);
  else if (type === 'area') emit('select-area', element);
};

const updateElement = (key, value) => {
  if (!selectedElement.value) return;
  
  const val = parseFloat(value);
  if (isNaN(val)) return;

  emit('update-element', {
    element: selectedElement.value,
    key,
    value: val
  });
};

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

  console.group('IsybauViewer Bounds Calc');
  console.log('Total Nodes:', props.nodes.size);
  let validNodes = 0;

  for (const [id, node] of props.nodes.entries()) {
    if (Number.isFinite(node.x) && Number.isFinite(node.y)) {
        validNodes++;
        if (node.x < minX) minX = node.x;
        if (node.y < minY) minY = node.y;
        if (node.x > maxX) maxX = node.x;
        if (node.y > maxY) maxY = node.y;
    } else {
        console.warn(`Invalid Node coords for ${id}:`, node.x, node.y);
    }
  }
  
  console.log('Valid Nodes:', validNodes);
  console.log('MinX:', minX, 'MaxX:', maxX);

  // If no valid nodes found, return default
  if (minX === Infinity || !Number.isFinite(minX)) {
      console.warn('Bounds invalid or infinite, using default');
      console.groupEnd();
      return { minX: 0, minY: 0, width: 100, height: 100, centerX: 50, centerY: 50, maxY: 10 };
  }
  
  console.groupEnd();

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

const viewBox = computed(() => {
  const b = bounds.value;
  return `0 0 ${b.width} ${b.height}`;
});

const gridOffsetX = computed(() => -(bounds.value.minX % 1));
const gridOffsetY = computed(() => (bounds.value.maxY % 1));

const transformString = computed(() => {
  const cx = Number.isFinite(bounds.value.centerX) ? bounds.value.centerX : 50;
  const cy = Number.isFinite(bounds.value.centerY) ? bounds.value.centerY : 50;
  
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
  const n1 = getNode(edge.fromNodeId);
  const n2 = getNode(edge.toNodeId);
  return n1 && n2;
};

const getEdgeArrowTransform = (edge) => {
  let x1, y1, x2, y2;

  if (edge.coords && edge.coords.length > 1) {
    // Polyline: Find middle segment
    const totalPoints = edge.coords.length;
    const midIndex = Math.floor((totalPoints - 1) / 2);
    
    // Use the middle segment
    const p1 = edge.coords[midIndex];
    const p2 = edge.coords[midIndex + 1];
    
    x1 = p1.x - bounds.value.minX;
    y1 = bounds.value.maxY - p1.y;
    x2 = p2.x - bounds.value.minX;
    y2 = bounds.value.maxY - p2.y;
    
  } else {
    // Straight Line Fallback
    const n1 = getNode(edge.fromNodeId);
    const n2 = getNode(edge.toNodeId);
    if (!n1 || !n2) return '';
    
    x1 = n1.x - bounds.value.minX;
    y1 = bounds.value.maxY - n1.y;
    x2 = n2.x - bounds.value.minX;
    y2 = bounds.value.maxY - n2.y;
  }
  
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  
  const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
  
  return `translate(${mx}, ${my}) rotate(${angle}) scale(${(1.0 * sizeMultiplier.value)/scale.value})`;
};

const getEdgeColor = (id) => {
  if (selectedElement.value?.id === id) return null; // Let CSS handle selection
  if (!props.hydraulics || !props.hydraulics.has(id)) return null;
  
  const res = props.hydraulics.get(id);
  const util = res.utilization || 0;
  
  if (util > 90) return '#e74c3c'; // Red (>90%)
  if (util >= 75) return '#f39c12'; // Orange (>75%)
  return null;
};

const getNodeColor = (id) => {
  if (selectedElement.value?.id === id) return null; // Let CSS handle selection
  if (!props.nodeResults || !props.nodeResults.has(id)) return null;
  
  const res = props.nodeResults.get(id);
  if (res.overflow || (res.pondedVolume && res.pondedVolume > 0)) return '#e74c3c'; // Red
  return null;
};

// Drag Detection
const isDragging = ref(false);
const dragThreshold = 3; // px
const accumulatedMove = ref(0);

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
  isPanning.value = false;
  setTimeout(() => {
    isDragging.value = false;
  }, 50); // Small delay to prevent click event processing
};

// Zoom Logic
const zoom = (e) => {
  const zoomFactor = 0.1;
  const delta = e.deltaY > 0 ? -zoomFactor : zoomFactor;
  const newScale = Math.max(0.1, Math.min(50, scale.value + delta));
  
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
  user-select: none; /* Prevent text selection during pan */
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

.isybau-viewer.mode-addEdge {
  cursor: crosshair;
}

/* When confirming a node in addEdge mode, give strong green feedback */
.isybau-viewer.mode-addEdge .node-circle:hover {
  fill: #2ecc71 !important;
  stroke: #2ecc71;
  stroke-width: 2px;
  cursor: cell; /* Often distinct from crosshair */
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

.node-label {
  fill: #2c3e50;
  pointer-events: none;
  text-shadow: 0px 0px 0.2px white;
  opacity: 0.8;
  transition: font-size 0.2s;
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

/* Info Window */
.info-window {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 300px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  overflow: hidden;
  z-index: 20;
}

.info-header {
  background: linear-gradient(135deg, #2c3e50, #34495e);
  color: white;
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  opacity: 0.8;
}

.close-btn:hover {
  opacity: 1;
}

.info-content {
  padding: 1rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  font-size: 0.95rem;
}

.label {
  color: #7f8c8d;
  font-weight: 500;
}

.value {
  text-align: right;
}

.edit-input {
  width: 80px;
  text-align: right;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 2px 4px;
  font-size: 0.9rem;
}

.edit-input:focus {
  border-color: #3498db;
  outline: none;
}

.separator {
  height: 1px;
  background: #eee;
  margin: 0.5rem 0;
}

.raw-details {
  margin-top: 1rem;
  border-top: 1px solid #eee;
  padding-top: 0.5rem;
}

.raw-details summary {
  cursor: pointer;
  color: #3498db;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.raw-details pre {
  background: #f8f9fa;
  padding: 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  overflow-x: auto;
  max-height: 200px;
}

/* Transitions */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(20px);
  opacity: 0;
}
</style>
