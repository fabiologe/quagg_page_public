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
            
            <div class="form-group checkbox-group" style="margin-bottom: 1rem;">
                <label class="checkbox-label">
                    <input type="checkbox" v-model="formData.isManhole">
                    Ist ein Schachtbauwerk
                </label>
                <small v-if="!formData.isManhole" class="hint">Virtueller Netzknoten (Druckdicht, kein Einstieg)</small>
            </div>

            <div class="form-group">
               <label>Deckelhöhe (mNHN)</label>
               <input
                 v-model.number="formData.cover"
                 type="number" step="0.01" class="form-input" required
                 placeholder="z.B. 102.50" :disabled="!formData.isManhole"
                 @input="formData.demSuggested = false"
               />
               <small v-if="formData.demSuggested" class="hint">Vorschlag aus geladenem DGM — bitte prüfen</small>
            </div>

            <div class="form-group">
              <label>Sohlhöhe (mNHN)</label>
              <input v-model.number="formData.z" type="number" step="0.01" class="form-input" required />
            </div>
            
            <div class="form-group">
               <label>Durchmesser (m)</label>
               <input v-model.number="formData.diameter" type="number" step="0.1" class="form-input" :disabled="!formData.isManhole" />
             </div>

            <div class="form-group">
              <label>Schachttiefe (berechnet)</label>
              <input :value="calculatedDepth" type="number" step="0.01" class="form-input" disabled />
              <small class="hint">Deckelhöhe - Sohlhöhe</small>
            </div>
            
             <div class="form-group checkbox-group">
                <label class="checkbox-label">
                    <input type="checkbox" v-model="formData.canOverflow">
                    Deckel offen (Checked) / Druckdicht (Unchecked)
                </label>
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
               <label>Neigungsklasse</label>
               <select v-model.number="formData.slope" class="form-select">
                   <option v-for="(label, key) in Neigungsklasse" :key="key" :value="parseInt(key)">
                       {{ key }} - {{ label }}
                   </option>
               </select>
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
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import DraggableModal from '../common/DraggableModal.vue';
import { MaterialRoughness, getRoughness, Bauwerkstyp, Neigungsklasse } from '../../utils/mappings.js';

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
  return `${typeMap[props.mode] || 'Element'} erstellen`;
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

// Shoelace formula — recompute size from points to be independent of parent timing
const computeAreaFromPoints = (points) => {
    if (!points || points.length < 3) return 0;
    // Deduplicate consecutive identical points (double-click artifacts)
    const unique = points.filter((p, i) =>
        i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y
    );
    if (unique.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < unique.length; i++) {
        const p1 = unique[i];
        const p2 = unique[(i + 1) % unique.length];
        area += p1.x * p2.y - p2.x * p1.y;
    }
    return Math.abs(area / 2);
};

// Initialize form data on open/change
watch(() => props.isOpen, async (val) => {
  if (val) {
    outletType.value = 'node';
    outletEdgeId.value = null;
    await nextTick(); // Ensure all sibling props (mode, elementData) are propagated
    initForm();
  }
}, { immediate: true });

// Dieses Modal wird nur zum ERSTELLEN geöffnet — Bearbeiten läuft über
// ElementInfo.vue im 2D-Viewer.
const initForm = () => {
  {
    // Defaults for new elements
    const defaults = { id: generateId(props.mode) };
    if (props.mode === 'node') {
        // Default Cover 2.0m, Z 0m -> Depth 2.0m
        Object.assign(defaults, { type: "Schacht", z: 0, cover: 2.0, diameter: 1.0, depth: 2.0, canOverflow: true, isManhole: true });
    } else if (props.mode === 'edge') {
        const defaultMat = 'Beton';
        // Sohlhöhe der beiden angeklickten Schächte übernehmen (metaFromId/metaToId
        // kommen aus dem Zwei-Klick-Flow im Editor) — sonst bleibt hier null stehen
        // und der Solver/die Tabelle sehen eine Haltung "auf Höhe 0" statt auf
        // Höhe des Schachts.
        const fromNode = props.availableNodes.find(n => n.id === props.elementData?.metaFromId);
        const toNode = props.availableNodes.find(n => n.id === props.elementData?.metaToId);
        Object.assign(defaults, {
            profileType: 0,
            geom1: 0.3,
            material: defaultMat,
            roughness: getRoughness(defaultMat),
            z1: fromNode ? fromNode.z : null,
            z2: toNode ? toNode.z : null
        });
    } else if (props.mode === 'area') {
        Object.assign(defaults, { size: 0.1, runoffCoeff: 0.5, slope: 1, nodeId: null });
        if (props.elementData) Object.assign(defaults, props.elementData);
        // Always recompute from points — immune to timing and NaN from parent
        if (defaults.points && defaults.points.length >= 3) {
            const m2 = computeAreaFromPoints(defaults.points);
            if (m2 > 0) defaults.size = parseFloat((m2 / 10000).toFixed(4));
        }
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
  background: #040647;
  padding: 0.65rem 1rem;
  border-bottom: 2px solid #594491;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: move;
  flex-shrink: 0;
}

.modal-header h3 {
  margin: 0;
  font-family: 'Press Start 2P', monospace;
  font-size: 0.58rem;
  color: #2ecc71;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: #8f8be1; /* Slate 400 */
  transition: color 0.2s;
  padding: 0 0.5rem;
}

.close-btn:hover {
  color: #2ecc71; /* Red 500 */
}
.modal-body {
  padding: 1rem;
  overflow-y: auto;
  max-height: calc(90vh - 56px);
  background: #06093a;
  scrollbar-width: thin;
  scrollbar-color: #594491 #040647;
}
.modal-body::-webkit-scrollbar { width: 6px; }
.modal-body::-webkit-scrollbar-track { background: #040647; }
.modal-body::-webkit-scrollbar-thumb { background: #594491; border-radius: 3px; }
.modal-body::-webkit-scrollbar-thumb:hover { background: #8f8be1; }
.form-group { margin-bottom: 1rem; display: flex; flex-direction: column; }
.form-input, .form-select {
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}
.modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
.btn-primary {
  background: #040647;
  color: #2ecc71;
  border: 1px solid #594491;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 700;
  font-family: 'Press Start 2P', monospace;
  font-size: 0.52rem;
  letter-spacing: 0.06em;
  transition: background 0.15s, border-color 0.15s;
}
.btn-primary:hover { background: #594491; border-color: #8f8be1; color: #fff; }

.btn-secondary {
  background: transparent;
  color: #aeadd2;
  border: 1px solid #594491;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-family: 'Press Start 2P', monospace;
  font-size: 0.52rem;
  letter-spacing: 0.06em;
  transition: background 0.12s;
}
.btn-secondary:hover { background: #594491; color: #fff; }
.outlet-radio-group { display: flex; gap: 1rem; margin-bottom: 0.5rem; }
.radio-label { display: flex; align-items: center; gap: 0.3rem; font-size: 0.9rem; cursor: pointer; color: #aeadd2; }
.hint { font-size: 0.78rem; color: #8f8be1; margin-top: 0.2rem; }
.form-group label { font-size: 0.75rem; color: #aeadd2; margin-bottom: 3px; }
.form-input, .form-select {
  padding: 0.45rem 0.6rem;
  border: 1px solid #594491;
  border-radius: 5px;
  background: #0a0d5c;
  color: #fff;
  font-size: 0.88rem;
  outline: none;
  transition: border-color 0.15s;
}
.form-input:focus, .form-select:focus { border-color: #2ecc71; }
.form-input:disabled, .form-select:disabled { opacity: 0.4; cursor: not-allowed; }
.checkbox-group .checkbox-label { color: #aeadd2; font-size: 0.85rem; display: flex; align-items: center; gap: 0.4rem; }
.value-display { color: #2ecc71; font-weight: 600; padding: 0.35rem 0; }
.modal-actions { border-top: 1px solid #594491; padding-top: 0.75rem; margin-top: 0.5rem; }

/* ── Design Schema ────────────────────────────── */
.tab-btn {
  font-family: "Press Start 2P", monospace !important;
  font-size: 0.5rem !important;
  letter-spacing: 0.06em;
  background: transparent !important;
  border: 1px solid #594491 !important;
  color: #aeadd2 !important;
  border-radius: 5px !important;
  padding: 0.45rem 0.75rem !important;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.tab-btn:hover { background: #594491 !important; color: #fff !important; }
.tab-btn.active { background: #594491 !important; color: #fff !important; border-color: #8f8be1 !important; }

.primary-btn {
  background: #040647 !important;
  color: #fff !important;
  border: none !important;
  border-radius: 6px !important;
  font-weight: 700 !important;
  transition: background 0.15s;
}
.primary-btn:hover:not(:disabled) { background: #594491 !important; }
.primary-btn:disabled { background: #aeadd2 !important; cursor: default; }

.secondary-btn {
  background: #fff !important;
  border: 1px solid #aeadd2 !important;
  color: #040647 !important;
  border-radius: 6px !important;
  font-weight: 600 !important;
  transition: background 0.12s;
}
.secondary-btn:hover { background: #f3f2fb !important; }

.modal-body h3, .panel h3 {
  font-family: "Press Start 2P", monospace !important;
  font-size: 0.55rem !important;
  color: #594491 !important;
  letter-spacing: 0.06em;
  border-bottom: 1px solid #aeadd2 !important;
  padding-bottom: 0.4rem !important;
  margin-bottom: 0.75rem !important;
}


/* Häkchen/Radios im SaintV-Grün statt Browser-Blau */
input[type="checkbox"],
input[type="radio"] {
  accent-color: #2ecc71;
}
</style>
