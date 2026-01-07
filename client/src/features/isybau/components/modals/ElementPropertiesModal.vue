<template>
  <DraggableModal :is-open="isOpen" initial-width="400px" initial-height="auto" initial-left="center" initial-top="100">
      <header class="modal-header">
        <h3>{{ title }}</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </header>
 
      <div class="modal-body">
        <form @submit.prevent="save">
          
          <!-- Common: ID -->
          <div class="form-group">
            <label>ID / Name</label>
            <input 
              v-model="formData.id" 
              type="text" 
              class="form-input" 
              :disabled="isEdit" 
              required
            />
          </div>

          <!-- Mode: NODE -->
          <template v-if="mode === 'node'">
            <div class="form-group">
              <label>Typ</label>
              <select v-model="formData.type" class="form-select">
                <option value="Schacht">Schacht (Standard)</option>
                <option disabled>──────────</option>
                <option v-for="(label, id) in Bauwerkstyp" :key="id" :value="Number(id)">
                    {{ label }}
                </option>
              </select>
            </div>
            
            <div class="form-group">
               <label>Deckelhöhe (mNHN)</label>
               <input v-model.number="formData.cover" type="number" step="0.01" class="form-input" required placeholder="z.B. 102.50" />
            </div>

            <div class="form-group">
              <label>Sohlhöhe (mNHN)</label>
              <input v-model.number="formData.z" type="number" step="0.01" class="form-input" required />
            </div>
            
            <div class="form-group">
               <label>Durchmesser (m)</label>
               <input v-model.number="formData.diameter" type="number" step="0.1" class="form-input" />
             </div>

            <div class="form-group">
              <label>Schachttiefe (berechnet)</label>
              <input :value="calculatedDepth" type="number" step="0.01" class="form-input" disabled />
              <small class="hint">Deckelhöhe - Sohlhöhe</small>
            </div>
          </template>

          <!-- Mode: EDGE -->
          <template v-if="mode === 'edge'">
            <div class="form-group">
              <label>Profil-Typ</label>
              <select v-model="formData.profileType" class="form-select">
                <option :value="0">Kreisprofil</option>
                <option :value="1">Ei-Profil</option>
                <option :value="3">Rechteck (geschl.)</option>
                <option :value="5">Rechteck (offen)</option>
                <option :value="8">Trapezprofil</option>
              </select>
            </div>
            <div class="form-group">
               <label>Höhe (m) / DN (m)</label>
               <input v-model.number="formData.geom1" type="number" step="0.001" class="form-input" required />
            </div>
            <div class="form-group" v-if="formData.profileType !== 0">
                <label>Breite (m)</label>
                <input v-model.number="formData.geom2" type="number" step="0.001" class="form-input" />
                <span v-if="formData.profileType === 8" class="hint">Sohlbreite</span>
            </div>
            <div class="form-group" v-if="formData.profileType === 8">
               <label>Böschungsneigung (1:n)</label>
               <input v-model.number="formData.slope" type="number" step="0.1" class="form-input" placeholder="z.B. 1.5" />
            </div>
            <div class="form-group">
                <label>Material</label>
                <select v-model="formData.material" @change="updateRoughness" class="form-select">
                    <option v-for="(kst, mat) in MaterialRoughness" :key="mat" :value="mat">
                        {{ mat }}
                    </option>
                </select>
            </div>
             <div class="form-group">
               <label>Rauheit (ks / n)</label>
               <input v-model.number="formData.roughness" type="number" step="0.001" class="form-input" />
               <small class="hint">Wird durch Material {{ formData.material }} gesetzt.</small>
            </div>
            <div class="form-group">
                <label>Anschlusshöhe Oben (mNHN)</label>
                <input v-model.number="formData.z1" type="number" step="0.01" class="form-input" placeholder="Optional" />
                <small class="hint">Leer lassen für Sohlhöhe von Startknoten</small>
            </div>
            <div class="form-group">
                <label>Anschlusshöhe Unten (mNHN)</label>
                <input v-model.number="formData.z2" type="number" step="0.01" class="form-input" placeholder="Optional" />
                <small class="hint">Leer lassen für Sohlhöhe von Endknoten</small>
            </div>
          </template>

          <!-- Mode: AREA -->
          <template v-if="mode === 'area'">
             <div class="form-group">
               <label>Größe (ha)</label>
               <input v-model.number="formData.size" type="number" step="0.0001" class="form-input" required />
             </div>
             <div class="form-group">
               <label>Befestigung (0.0 - 1.0)</label>
               <input v-model.number="formData.runoffCoeff" type="number" step="0.01" min="0" max="1" class="form-input" required />
             </div>
             <div class="form-group">
               <label>Neigung (%)</label>
               <input v-model.number="formData.slope" type="number" step="0.1" class="form-input" />
             </div>
             <div class="form-group">
               <label>Auslass</label>
               <div class="outlet-radio-group">
                   <label class="radio-label"><input type="radio" value="node" v-model="outletType"> Knoten</label>
                   <label class="radio-label"><input type="radio" value="edge" v-model="outletType"> Haltung</label>
               </div>
               
               <template v-if="outletType === 'node'">
                   <select v-model="formData.nodeId" class="form-select" required>
                     <option :value="null" disabled>Knoten wählen...</option>
                     <option v-for="node in availableNodes" :key="node.id" :value="node.id">
                       {{ node.id }}
                     </option>
                   </select>
               </template>
               <template v-else>
                   <select v-model="outletEdgeId" class="form-select" required>
                     <option :value="null" disabled>Haltung wählen...</option>
                     <option v-for="edge in availableEdges" :key="edge.id" :value="edge.id">
                       {{ edge.id }} ({{ edge.fromNodeId }} → {{ edge.toNodeId }})
                     </option>
                   </select>
                   <small v-if="formData.nodeId" class="hint">→ Fließt in Startknoten: {{ formData.nodeId }}</small>
               </template>
             </div>
          </template>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="$emit('close')">Abbrechen</button>
            <button type="submit" class="btn-primary">Speichern</button>
          </div>
        </form>
      </div>
  </DraggableModal>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import DraggableModal from '../common/DraggableModal.vue';
import { MaterialRoughness, getRoughness, Bauwerkstyp } from '../../utils/mappings.js';

const props = defineProps({
  isOpen: Boolean,
  mode: {
    type: String, // 'node', 'edge', 'area'
    required: true
  },
  elementData: {
    type: Object,
    default: () => ({})
  },
  isEdit: {
    type: Boolean,
    default: false
  },
  // Passing nodes for dropdown list
  availableNodes: {
    type: Array,
    default: () => []
  },
  availableEdges: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['close', 'save']);

const formData = ref({});
const outletType = ref('node');
const outletEdgeId = ref(null);

const calculatedDepth = computed(() => {
    if (props.mode === 'node' && formData.value.cover !== undefined && formData.value.z !== undefined) {
        const d = formData.value.cover - formData.value.z;
        return d > 0 ? parseFloat(d.toFixed(3)) : 0;
    }
    return formData.value.depth;
});

const title = computed(() => {
  const typeMap = { node: 'Schacht', edge: 'Haltung', area: 'Fläche' };
  const action = props.isEdit ? 'bearbeiten' : 'erstellen';
  return `${typeMap[props.mode] || 'Element'} ${action}`;
});

// Watch logic for Haltung Selection
// Watch logic for Haltung Selection
watch(outletEdgeId, (newId) => {
    if (newId && outletType.value === 'edge' && props.availableEdges) {
        const edge = props.availableEdges.find(e => e.id === newId);
        if (edge) {
            // Map Start Node -> Anschluss 1
            formData.value.nodeId = edge.fromNodeId;
            // Map End Node -> Anschluss 2
            formData.value.nodeId2 = edge.toNodeId;
            // Set default split ratio
            if (!formData.value.splitRatio) {
                formData.value.splitRatio = 50;
            }
            // Save edgeId reference
            formData.value.edgeId = edge.id;
        }
    }
});

// Initialize form data on open/change
watch(() => props.isOpen, (val) => {
  if (val) {
    outletType.value = 'node'; // Reset to default
    outletEdgeId.value = null;
    initForm();
  }
}, { immediate: true });

const initForm = () => {
  console.log("ElementPropertiesModal: initForm. elementData:", props.elementData);
  // Clone data or set defaults
  if (props.isEdit && props.elementData) {
    // Clone first
    formData.value = { ...props.elementData };
    
    // Fix: Flatten Profile Data for Form
    if (props.mode === 'edge' && props.elementData.profile) {
        const p = props.elementData.profile;
        
        // Map types: Ensure int
        const typeMap = { 'CIRCULAR': 0, 'EGG': 1, 'RECT_CLOSED': 3, 'RECT_OPEN': 5, 'TRAPEZOIDAL': 8 };
        let pType = p.type;
        if (typeof pType === 'string') pType = typeMap[pType] !== undefined ? typeMap[pType] : 0;
        else if (pType === undefined) pType = 0;
        
        formData.value.profileType = pType;
        formData.value.geom1 = p.height || 0.3;
        formData.value.geom2 = p.width || 0;
        if (pType === 8) {
            formData.value.slope = p.slope || 1.5;
        }

        if (!formData.value.material) {
             formData.value.material = 'Beton'; 
        }
    }
    
    // Fix: Node defaults if missing
    if (props.mode === 'node') {
        if (formData.value.diameter === undefined) formData.value.diameter = 1.0;
        // If cover is missing but depth exists, calc cover? Or just leave as is.
        if (formData.value.cover === undefined && formData.value.z !== undefined && formData.value.depth !== undefined) {
            formData.value.cover = formData.value.z + formData.value.depth;
        }
    }

  } else {
    // Defaults for new elements
    const defaults = { id: generateId(props.mode) };
    if (props.mode === 'node') {
        // Default Cover 2.0m, Z 0m -> Depth 2.0m
        Object.assign(defaults, { type: "Schacht", z: 0, cover: 2.0, diameter: 1.0, depth: 2.0 });
    } else if (props.mode === 'edge') {
        const defaultMat = 'Beton';
        Object.assign(defaults, { 
            profileType: 0, 
            geom1: 0.3, 
            material: defaultMat, 
            roughness: getRoughness(defaultMat),
            z1: null,
            z2: null
        });
    } else if (props.mode === 'area') {
        Object.assign(defaults, { size: 0.1, runoffCoeff: 0.5, slope: 0.5, nodeId: null });
        // Can inherit size from props.elementData if passed (e.g. calculated area)
        if (props.elementData) Object.assign(defaults, props.elementData);
    }
    
    // Generic merge for non-area modes too (like edge metadata)
    if (props.elementData && props.mode !== 'area') {
         Object.assign(defaults, props.elementData);
    }

    formData.value = defaults;
  }
};

const updateRoughness = () => {
    if (formData.value.material) {
        formData.value.roughness = getRoughness(formData.value.material);
    }
};

const generateId = (prefix) => {
    // Simple ID gen, user can override
    const typeStr = { node: 'S', edge: 'H', area: 'F' }[prefix] || 'E';
    return `${typeStr}_${Math.floor(Date.now() % 10000)}`;
};

const save = () => {
    const data = { ...formData.value };
    
    // Fix: Node Depth Calculation
    if (props.mode === 'node') {
       if (calculatedDepth.value !== undefined) {
           data.depth = calculatedDepth.value;
       }
       if (!data.diameter) data.diameter = 1.0;
    }

    // Fix: Reconstruct Profile Object for Edge
    if (props.mode === 'edge') {
        data.profile = {
            type: data.profileType,
            height: Number(data.geom1),
            width: Number(data.geom2 || 0)
        };
        if (data.profileType === 8) {
            data.profile.slope = Number(data.slope || 1.5);
        }
        
        // Clean up flat fields to avoid pollution (optional, but cleaner)
        delete data.profileType;
        delete data.geom1;
        delete data.geom2;
        delete data.slope;
    }

    emit('save', { mode: props.mode, data: data });
};
</script>

<style scoped>
/* Cleaned up styles */
.modal-header {
  padding: 1rem;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: move;
}
.close-btn { background: none; border: none; font-size: 1.5rem; cursor: pointer; }
.modal-body { padding: 1rem; }
.form-group { margin-bottom: 1rem; display: flex; flex-direction: column; }
.form-input, .form-select {
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}
.modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
.btn-primary { background: #2196F3; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
.btn-secondary { background: #ccc; color: black; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
.outlet-radio-group { display: flex; gap: 1rem; margin-bottom: 0.5rem; }
.radio-label { display: flex; align-items: center; gap: 0.3rem; font-size: 0.9rem; cursor: pointer; }
.hint { font-size: 0.8rem; color: #666; margin-top: 0.2rem; }
</style>
