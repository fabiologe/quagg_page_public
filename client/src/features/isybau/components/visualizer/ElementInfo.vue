<template>
  <Transition name="slide-up">
    <div v-if="selectedElement" class="info-window" :style="styleObject" @click.stop>
      <div class="info-header" @mousedown="startDrag">
        <h3>{{ typeLabel }} Bearbeiten</h3>
        <button @click="$emit('close')" class="close-btn" @mousedown.stop>·×</button>
      </div>
      
      <div class="info-content">
        <!-- Common ID Display -->
        <div class="info-row">
          <span class="label">ID:</span>
          <span class="value">{{ localData.id }}</span>
        </div>

        <!-- ================= SIMULATION RESULTS ================= -->
        <div v-if="currentResult" class="info-group result-box">
             <div class="result-header">Simulation (Aktuell)</div>
             
             <!-- Warning Badge -->
             <div v-if="currentResult.floodWarning" class="flood-badge">
                 ⚠️ ÜBERFLUTUNG: {{ currentResult.floodVolume?.toFixed(3) }} m³ 
                 <div class="sub-text">(auf Gelände)</div>
             </div>

             <div class="info-row compact">
                 <span class="label">Tiefe:</span>
                 <span class="value" :class="{'text-red': currentResult.isFlooded}">
                     {{ currentResult.depth?.toFixed(3) }} m
                 </span>
             </div>
             <div class="info-row compact">
                 <span class="label">Volumen:</span>
                 <span class="value">{{ currentResult.volume?.toFixed(3) }} m³</span>
             </div>
             
             <!-- Link Specific Result: Utilization -->
             <div v-if="elementType === 'edge' && currentResult.utilizationText" class="info-row compact">
                 <span class="label">Auslastung:</span>
                 <span class="value" :style="currentResult.utilizationStyle">
                     {{ currentResult.utilizationText }}
                 </span>
             </div>
        </div>


        <!-- ================= EDGE EDITOR ================= -->
        <template v-if="elementType === 'edge'">
             <div class="info-group">
                <label>Material</label>
                <select v-model="localData.material" @change="updateRoughness" class="full-select">
                    <option v-for="(kst, mat) in MaterialRoughness" :key="mat" :value="mat">{{ mat }}</option>
                    <option v-if="localData.material && !MaterialRoughness[localData.material]" :value="localData.material">{{ localData.material }}</option>
                </select>
             </div>
             
             <div class="info-group">
                 <label>Rauheit (kst)</label>
                 <input type="number" v-model.number="localData.roughness" class="full-input">
             </div>

             <div class="info-group">
                 <label>Profil</label>
                 <select v-model.number="localData.profile.type" @change="onProfileChange" class="full-select">
                    <option :value="0">Kreisprofil</option>
                    <option :value="1">Eiprofil</option>
                    <option :value="2">Maulprofil</option>
                    <option :value="3">Rechteck (geschlossen)</option>
                    <option :value="5">Rechteck (offen)</option>
                    <option :value="8">Trapezprofil</option>
                    <option :value="13">Andere</option>
                 </select>
             </div>

             <div class="flex-row">
                 <div class="info-group half">
                     <label>{{ localData.profile.type === 8 ? 'Höhe' : 'Höhe/DN' }} (mm)</label>
                     <input type="number" v-model.number="localData.profile.height" class="full-input">
                 </div>
                 <div class="info-group half">
                     <label>Breite (mm)</label>
                     <input type="number" v-model.number="localData.profile.width" :disabled="localData.profile.type === 0" class="full-input">
                 </div>
             </div>

             <div v-if="localData.profile.type === 8" class="info-group">
                 <label>Böschungsneigung (1:n)</label>
                 <input type="number" v-model.number="localData.profile.slope" class="full-input" placeholder="1.5">
             </div>

             <div class="flex-row">
                 <div class="info-group half">
                     <label>Z1 (Einlauf)</label>
                     <input type="number" v-model.number="localData.z1" step="0.01" class="full-input">
                 </div>
                 <div class="info-group half">
                     <label>Z2 (Auslauf)</label>
                     <input type="number" v-model.number="localData.z2" step="0.01" class="full-input">
                 </div>
             </div>
        </template>

        <!-- ================= NODE EDITOR ================= -->
        <template v-else-if="elementType === 'node'">
            <div class="info-group">
                <label>Typ</label>
                <select v-model="localData.type" class="full-select">
                    <option value="Standard">Schacht (Standard)</option>
                    <option value="Bauwerk">Bauwerk (Allgemein)</option>
                    <option v-for="(label, key) in Bauwerkstyp" :key="key" :value="parseInt(key)">
                        {{ label }}
                    </option>
                </select>
            </div>

            <div class="flex-row">
                <div class="info-group half">
                    <label>Deckelhöhe (m)</label>
                    <input type="number" v-model.number="localData.coverZ" step="0.01" class="full-input">
                </div>
                <div class="info-group half">
                    <label>Sohlhöhe (m)</label>
                    <input type="number" v-model.number="localData.z" step="0.01" class="full-input">
                </div>
            </div>

            <!-- Conditional Inputs based on Type -->
             <div v-if="[1, 6, 14, 'Standard', 'Bauwerk'].includes(localData.type)" class="info-group">
                 <label>Konst. Zufluss (l/s)</label>
                 <input type="number" v-model.number="localData.constantInflow" step="0.1" class="full-input">
             </div>

             <div v-if="[2, 3, 4, 12, 13].includes(localData.type)" class="info-group">
                 <label>Speichervolumen (m³)</label>
                 <input type="number" v-model.number="localData.volume" step="1" class="full-input">
             </div>

             <div v-if="[2, 7].includes(localData.type)" class="info-group">
                 <label>Wehrhöhe (m)</label>
                 <input type="number" v-model.number="localData.weirHeight" step="0.01" class="full-input">
             </div>

            <div class="info-group checkbox-row">
                <input type="checkbox" id="canOverflow" v-model="localData.canOverflow">
                <label for="canOverflow">Kann überstauen (Deckel offen)</label>
            </div>
        </template>

        <!-- ================= AREA EDITOR ================= -->
        <template v-else-if="elementType === 'area'">
            <div class="info-group">
                <label>Fläche (ha)</label>
                <div class="value-display">{{ localData.size?.toFixed(4) }}</div>
            </div>
            
             <div class="info-group">
                 <label>Abflussbeiwert (0.0 - 1.0)</label>
                 <input type="number" v-model.number="localData.runoffCoeff" step="0.05" min="0" max="1" class="full-input">
             </div>

             <div class="info-group">
                 <label>Anschluss Knoten (ID)</label>
                 <input type="text" v-model="localData.nodeId" class="full-input" placeholder="Schacht ID">
             </div>
        </template>

      </div>
      
      <div class="info-footer">
          <button @click="save" class="primary-btn full-width">💾 Speichern</button>
          <button @click="$emit('show-details', selectedElement)" class="secondary-btn full-width" style="margin-top:0.5rem">📊 Ergebnisse</button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { getMapping, getRoughness, MaterialRoughness, Bauwerkstyp } from '../../utils/mappings.js';

const props = defineProps({
  selectedElement: Object,
  hydraulics: Map,
  nodeResults: Map,
  position: {
      type: Object, 
      default: null
  }
});

const emit = defineEmits(['close', 'save', 'show-details']);

// Local State Copy
const localData = ref({});



const elementType = computed(() => {
    if (!props.selectedElement) return null;
    if (props.selectedElement.from || props.selectedElement.fromNodeId) return 'edge';
    if (props.selectedElement.points) return 'area';
    return 'node';
});

const typeLabel = computed(() => {
    switch (elementType.value) {
        case 'edge': return 'Haltung';
        case 'area': return 'Fläche';
        case 'node': return 'Schacht/Bauwerk';
        default: return 'Element';
    }
});

function initLocalData(el) {
    // Deep Clone basic props
    const data = JSON.parse(JSON.stringify(el));
    
    // Normalization logic similar to PreprocessingModal
    if (elementType.value === 'edge') {
        // Ensure profile exists
        if (!data.profile) data.profile = { type: 0, height: 0, width: 0 };
        // Convert m -> mm for display if needed? 
        // Existing PreprocessingModal converts m to mm for display.
        // Let's assume store has meters. We want inputs in mm.
        data.profile.height = (data.profile.height || 0) * 1000;
        data.profile.width = (data.profile.width || 0) * 1000;
        
        if (!data.roughness) data.roughness = getRoughness(data.material);
    } 
    else if (elementType.value === 'node') {
        // Ensure standard fields
        if (data.coverZ === undefined) data.coverZ = data.z + (data.depth || 0);
        if (data.canOverflow === undefined) data.canOverflow = true; 
        if (!data.type || data.type === 'Schacht') data.type = 'Standard';
        
        // Map integer types to 'Standard'/'Bauwerk' string if needed for select fallback
        // But our select supports ints.
    }
    
    localData.value = data;
}

// Result Computation
const currentResult = computed(() => {
    // NODE LOGIC
    if (elementType.value === 'node') {
        if (!props.nodeResults || !props.selectedElement) return null;
        
        const res = props.nodeResults.get(props.selectedElement.id);
        if (!res) return null;

        const node = props.selectedElement;
        const maxDepth = node.depth || 0;
        const currentDepth = res.depth || 0;
        
        // Check for flooding
        const floodVolume = res.floodVolume || 0; // 10^6 ltr usually, Parser now extracts value
        
        // Volume Logic
        let currentVol = res.vol || 0; // SWMM Base Volume
        
        const isManhole = node.isManhole !== false; 
        
        if (currentDepth > maxDepth && isManhole) {
            const surcharge = currentDepth - maxDepth;
            const aPonded = node.apondedArea || 20.0;
            currentVol = res.vol + (surcharge * aPonded);
        }
        
        return {
            depth: currentDepth,
            volume: currentVol,
            isFlooded: currentDepth > maxDepth,
            floodWarning: floodVolume > 0,
            floodVolume: floodVolume * 1000 // Convert 10^6 L to m^3
        };
    }
    
    // EDGE LOGIC
    if (elementType.value === 'edge') {
        if (!props.hydraulics || !props.selectedElement) return null;
        const res = props.hydraulics.get(props.selectedElement.id);
        if(!res) return null;
        
        // Utilization Logic (Strict: Max/Full Depth, Capped at 100%)
        // User Requirement: "ES KANN NICHT ÜBER 100% SEIN"
        const depthRatio = res.depthRatio || 0;
        
        // Calculate raw percent
        let rawPercent = depthRatio * 100;
        
        // Hard Cap at 100%
        if (rawPercent > 100) rawPercent = 100;
        
        const displayVal = rawPercent;
        const displayText = `${displayVal.toFixed(0)}%`;
        let displayStyle = {};
        
        // Visuals
        if (displayVal >= 90) {
             displayStyle = { color: '#c0392b', fontWeight: 'bold' }; // Red (Full/High)
        } else if (displayVal >= 50) {
             displayStyle = { color: '#f39c12', fontWeight: 'bold' }; // Yellow
        } else {
             displayStyle = { color: '#27ae60', fontWeight: 'bold' }; // Green
        }

        return {
            depth: res.depth, 
            utilizationText: displayText,
            utilizationStyle: displayStyle,
        };
    }

    return null;
});

// Actions
const updateRoughness = () => {
    localData.value.roughness = getRoughness(localData.value.material);
};

const onProfileChange = () => {
    if (localData.value.profile.type === 8) { // Trapez
        localData.value.material = 'Erde';
        localData.value.roughness = 25;
    }
};


const save = () => {
    // Convert back to store format
    const payload = { ...localData.value };

    if (elementType.value === 'edge') {
        // Convert mm -> m
        payload.profile.height = payload.profile.height / 1000;
        payload.profile.width = payload.profile.width / 1000;
    }
    else if (elementType.value === 'node') {
        // Ensure Depth is calculated if Z changed?
        // Store expects z and coverZ usually.
        // If we update z and coverZ, depth is implicitly coverZ - z.
        // But store might use 'depth' property.
        payload.depth = payload.coverZ - payload.z;
    }

    emit('save', { id: payload.id, type: elementType.value, data: payload });
};


// Dragging Logic
const draggerPos = ref(null); // { x, y } overrides props.position if set
const isDragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });
const initialDragPos = ref({ x: 0, y: 0 });

const styleObject = computed(() => {
    // If we have a manually dragged position, use it
    if (draggerPos.value) {
        return {
            left: `${draggerPos.value.x}px`,
            top: `${draggerPos.value.y}px`,
            position: 'absolute',
             // Keep the transform to remain consistent with initial placement feeling, 
             // or remove it. Removing it might cause a jump on first drag.
             // Let's keep it and ensuring dragging accounts for it visually? 
             // Actually, if we use delta, it doesn't matter.
            transform: 'translate(-50%, -100%) translateY(-10px)',
            zIndex: 1000
        };
    }

    // Fallback to props
    if (!props.position) {
        return { top: '1rem', right: '1rem' };
    }
    return {
        left: `${props.position.x}px`,
        top: `${props.position.y}px`,
        transform: 'translate(-50%, -100%) translateY(-10px)',
        position: 'absolute',
        zIndex: 1000
    };
});

// Watch for selection changes to re-init
watch(() => props.selectedElement, (val) => {
    if (val) {
        initLocalData(val);
        // Reset drag position on new selection so it pops up at the clicked location
        draggerPos.value = null; 
    }
}, { immediate: true });

// Drag Handlers
const startDrag = (e) => {
    isDragging.value = true;
    dragStart.value = { x: e.clientX, y: e.clientY };
    
    // Initialize draggerPos if not set
    if (!draggerPos.value && props.position) {
        draggerPos.value = { ...props.position };
    } else if (!draggerPos.value) {
         // Fallback if no props.position (e.g. fixed top/right)
         // This case is tricky because we switched from 'top/right' to 'left/top'.
         // Let's assume typical usage has position.
         draggerPos.value = { x: 0, y: 0 }; // Should find actual element rect if needed
    }
    
    initialDragPos.value = { ...draggerPos.value };
    
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
};

const onDrag = (e) => {
    if (!isDragging.value) return;
    const dx = e.clientX - dragStart.value.x;
    const dy = e.clientY - dragStart.value.y;
    
    draggerPos.value = {
        x: initialDragPos.value.x + dx,
        y: initialDragPos.value.y + dy
    };
};

const stopDrag = () => {
    isDragging.value = false;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
};
</script>

<style scoped>
.info-window {
  position: absolute;
  width: 320px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  z-index: 500;
  max-height: 80vh; /* scrollable if too tall */
  overflow: hidden;
  border: 1px solid #ddd;
}

.info-header {
  background: #f8f9fa;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: move;
}

.info-header h3 {
  margin: 0;
  font-size: 1rem;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #888;
  cursor: pointer;
  line-height: 1;
}

.info-content {
  padding: 1rem;
  overflow-y: auto;
  flex: 1;
}

.info-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    color: #666;
}

.info-group {
    margin-bottom: 0.75rem;
}

.info-group label {
    display: block;
    font-size: 0.8rem;
    color: #555;
    margin-bottom: 2px;
}

.full-input, .full-select {
    width: 100%;
    padding: 6px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.9rem;
    box-sizing: border-box;
}

.flex-row {
    display: flex;
    gap: 0.5rem;
}

.half {
    flex: 1;
}

.checkbox-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.checkbox-row input {
    margin: 0;
}

.checkbox-row label {
    margin: 0;
    font-size: 0.9rem;
}

.info-footer {
    padding: 1rem;
    border-top: 1px solid #eee;
    background: #fcfcfc;
}

.primary-btn {
    background: #3498db;
    color: white;
    border: none;
    padding: 8px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
}

.primary-btn:hover {
    background: #2980b9;
}

.secondary-btn {
    background: white;
    border: 1px solid #ddd;
    color: #666;
    padding: 8px;
    border-radius: 4px;
    cursor: pointer;
}

.secondary-btn:hover {
    background: #f0f0f0;
}

.full-width {
    width: 100%;
}

/* Result Styles */
.result-box {
    background: #f0f7ff;
    border: 1px solid #cce5ff;
    padding: 8px;
    border-radius: 4px;
    margin-bottom: 12px;
}

.result-header {
    font-size: 0.8rem;
    font-weight: bold;
    color: #004085;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.flood-badge {
    background: #ffebee;
    border: 1px solid #ef5350;
    color: #c62828;
    padding: 6px;
    border-radius: 4px;
    font-weight: bold;
    text-align: center;
    margin-bottom: 8px;
    font-size: 0.9rem;
    animation: pulse 2s infinite;
}

.sub-text {
    font-size: 0.75rem;
    font-weight: normal;
    color: #d32f2f;
}

.compact {
    margin-bottom: 2px;
}

.text-red {
    color: #d32f2f;
    font-weight: bold;
}

@keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.02); }
    100% { transform: scale(1); }
}
</style>
