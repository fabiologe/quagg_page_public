<template>
  <div class="isybau-map-container">
    <EditorToolbox />
    
    <IsybauViewer 
        :class="{
            'cursor-crosshair': isDrawMode || store.editor.mode === 'boxSelect',
            'cursor-edge': store.editor.mode === 'addEdge',
            'cursor-delete': store.editor.mode === 'delete',
            'cursor-split': store.editor.mode === 'splitEdge'
        }"
        :nodes="store.nodes" 
        :edges="store.edges"
        :areas="store.areaArray" 
        :node-array="store.nodeArray"
        :edge-array="store.edgeArray"
        :drawingPoints="store.editor.drawingPoints"
        :show-grid="true"
        :interactionMode="store.editor.mode"
        :enablePopover="['view', 'select', 'editProperties'].includes(store.editor.mode)"
        :focusTarget="focusTarget"
        @select-node="handleNodeSelect"
        @select-edge="handleEdgeSelect"
        @select-area="handleAreaSelect"
        @update-element="handleElementUpdate"
        @save-element="handleElementSave"
        @map-click="handleMapClick"
        @map-dblclick="handleMapDblClick"
        @delete-elements="handleDeleteElements"
    />
    <div v-if="store.editor.mode === 'addArea'" class="drawing-controls">
        <div class="drawing-tooltip">
            <span v-if="store.editor.drawingPoints.length === 0">Klicken, um Startpunkt zu setzen</span>
            <span v-else>Klicken für nächsten Punkt <br><small>Doppelklick oder Enter zum Abschließen</small></span>
        </div>
        <button 
            v-if="store.editor.drawingPoints.length >= 3" 
            class="finish-btn"
            @click="handleMapDblClick"
        >
            ✓ Fläche abschließen
        </button>
    </div>
  </div>
</template>

<script setup>
import { useIsybauStore } from '../../store/index.js';
import IsybauViewer from '../visualizer/IsybauViewer.vue';
import EditorToolbox from './EditorToolbox.vue';
import { computed, onMounted, onUnmounted } from 'vue';

const store = useIsybauStore();

const props = defineProps({
    focusTarget: String
});

const isDrawMode = computed(() => ['addNode', 'addEdge', 'addArea', 'splitEdge'].includes(store.editor.mode));

// Box-Select: Mehrfach-Löschen in EINEM Undo-Schritt
const handleDeleteElements = (ids) => {
    if (!ids?.length) return;
    if (!confirm(`${ids.length} Elemente löschen? (Haltungen an gelöschten Schächten werden mit entfernt)`)) return;
    store.removeMany(ids);
};

const emit = defineEmits(['select-node', 'select-edge', 'select-area', 'update-element', 'map-click', 'map-dblclick', 'show-details', 'create-area', 'create-edge', 'create-node', 'split-edge']);

// ...

const handleNodeSelect = (element) => {
    if (store.editor.mode === 'delete') {
        store.removeNode(element.id);
        return;
    }

    // Add Edge Mode logic
    if (store.editor.mode === 'addEdge') {
        if (!store.editor.edgeStartNode) {
            store.editor.edgeStartNode = element.id;
            // Visual Feedback: Select the start node
            store.editor.selectedId = element.id;
        } else {
            if (store.editor.edgeStartNode !== element.id) {
                // Emit Request to Parent (IsybauMain)
                console.log("IsybauEditor: Finishing Edge, emitting create-edge");
                emit('create-edge', {
                    from: store.editor.edgeStartNode,
                    to: element.id
                });
                
                store.editor.edgeStartNode = null;
                store.editor.selectedId = null;
            }
        }
        return;
    }

    store.editor.selectedId = element.id;
    store.editor.selectedType = 'node';
    console.log("Selected Node", element.id);
};

const handleEdgeSelect = (payload) => {
    // IsybauViewer now emits { element, mapCoords } for edges to support geometric tools
    const element = payload.element || payload;
    const mapCoords = payload.mapCoords || null;
    
    if (store.editor.mode === 'delete') {
        store.removeEdge(element.id);
        return;
    }
    
    if (store.editor.mode === 'splitEdge') {
        console.log("IsybauEditor: Splitting Edge", element.id, "at", mapCoords);
        emit('split-edge', { edgeId: element.id, coords: mapCoords });
        return;
    }
    
    if (!['select', 'view', 'editProperties'].includes(store.editor.mode)) return;
    store.editor.selectedId = element.id;
    store.editor.selectedType = 'edge';
};

const handleAreaSelect = (element) => {
    if (store.editor.mode === 'delete') {
        store.removeArea(element.id);
        return;
    }

    if (!['select', 'view', 'editProperties'].includes(store.editor.mode)) return;
    store.editor.selectedId = element.id;
    store.editor.selectedType = 'area';
};

const handleKeydown = (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        if (store.editor.selectedId) {
            store.removeSelection();
        }
    }
    
    // Quick Win: Enter to finish drawing
    if (e.key === 'Enter' && store.editor.mode === 'addArea') {
        handleMapDblClick();
    }
    // Escape to cancel
    if (e.key === 'Escape' && store.editor.mode === 'addArea') {
        store.resetDrawing();
    }
};

onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

const handleElementUpdate = ({ element, key, value }) => {
    if(element.id && store.nodes.has(element.id)) {
        store.moveNode(element.id, value.x || element.x, value.y || element.y);
    }
};

const handleElementSave = ({ id, type, data }) => {
    console.log("IsybauEditor: Save Element", id, type, data);
    if (type === 'node') {
        store.updateNode(id, data);
    } else if (type === 'edge') {
        store.updateEdge(id, data);
    } else if (type === 'area') {
        store.updateArea(id, data);
    }
};


const calculatePolygonArea = (points) => {
    if (points.length < 3) return 0;
    let area = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % n];
        area += (p1.x * p2.y) - (p2.x * p1.y);
    }
    return Math.abs(area / 2);
};

const handleMapClick = ({ x, y }) => {
    console.log("IsybauEditor: Map Click Received", x, y, "Mode:", store.editor.mode);
    if (store.editor.mode === 'addNode') {
        emit('create-node', { x, y });
    } else if (store.editor.mode === 'addArea') {
        store.addDrawingPoint({ x, y });
    }
};

const handleMapDblClick = () => {
    if (store.editor.mode === 'addArea') {
        if (store.editor.drawingPoints.length < 3) return;

        const points = [...store.editor.drawingPoints];
        const areaM2 = calculatePolygonArea(points);
        const sizeHa = areaM2 / 10000;

        emit('create-area', { points, size: sizeHa });
        store.resetDrawing();
    }
};

</script>

<style scoped>
.isybau-map-container {
    flex: 1;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    background: #eef2f5;
    position: relative;
    overflow: hidden;
}

.cursor-crosshair {
    cursor: crosshair !important;
}

.cursor-edge {
    cursor: url('data:image/svg+xml;utf8,<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="8" stroke="%232980b9" stroke-width="2" fill="rgba(255,255,255,0.2)"/><path d="M16 4V28M4 16H28" stroke="%232980b9" stroke-width="2"/></svg>') 16 16, crosshair !important;
}

.cursor-delete {
    cursor: url('data:image/svg+xml;utf8,<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18" stroke="%23e74c3c" stroke-width="4" stroke-linecap="round"/><path d="M6 6L18 18" stroke="%23e74c3c" stroke-width="4" stroke-linecap="round"/></svg>') 12 12, auto !important;
}

.cursor-split {
    cursor: url('data:image/svg+xml;utf8,<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 12L18 12" stroke="%23e67e22" stroke-width="3" stroke-dasharray="2 2" stroke-linecap="round"/><circle cx="12" cy="12" r="4" fill="%23d35400" stroke="white" stroke-width="2"/></svg>') 12 12, crosshair !important;
}

.drawing-controls {
    position: absolute;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    pointer-events: none; /* Let clicks pass through, but re-enable for button */
    z-index: 100;
}

.drawing-tooltip {
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-size: 0.9rem;
    text-align: center;
    backdrop-filter: blur(4px);
}

.finish-btn {
    pointer-events: auto;
    background: #040647;
    color: #2ecc71;
    border: 1px solid #594491;
    padding: 0.85rem 1.5rem;
    border-radius: 20px;
    font-family: 'Press Start 2P', monospace;
    font-size: 0.5rem;
    cursor: pointer;
    box-shadow: 0 4px 10px rgba(4,6,71,0.4);
    transition: transform 0.2s, background 0.2s;
}

.finish-btn:hover {
    background: #594491;
    color: #fff;
    transform: scale(1.05);
}
</style>
