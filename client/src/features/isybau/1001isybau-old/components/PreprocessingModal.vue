<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click.self="close">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Daten bearbeiten</h3>
          <button class="close-btn" @click="close">×</button>
        </div>

        <div class="modal-body">
          <div class="tabs">
            <button 
              v-for="tab in tabs" 
              :key="tab.id"
              :class="['tab-btn', { active: activeTab === tab.id }]"
              @click="activeTab = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>

          <div class="tab-content">
            <!-- Schächte Tab -->
            <div v-if="activeTab === 'nodes'" class="table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Typ</th>
                    <th>Konst. Zufluss (l/s)</th>
                    <th>Deckelhöhe (m)</th>
                    <th>Sohlhöhe (m)</th>
                    <th>Druckdichter Deckel</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="node in manholes" :key="node.id">
                    <td>{{ node.id }}</td>
                    <td>
                      <select v-model="node.type" class="small-select">
                        <option value="Standard">Standard</option>
                        <option value="Bauwerk">Bauwerk</option>
                      </select>
                    </td>
                    <td>
                      <input type="number" v-model.number="node.constantInflow" step="0.1" class="small-input">
                    </td>
                    <td>
                      <input type="number" v-model.number="node.coverZ" step="0.01" class="small-input">
                    </td>
                    <td>
                      <input type="number" v-model.number="node.z" step="0.01" class="small-input">
                    </td>
                    <td class="text-center">
                      <input 
                          type="checkbox" 
                          :checked="node.canOverflow === false" 
                          @change="updateNodeOverflow(node, !$event.target.checked)"
                      >
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Bauwerke Tab -->
            <div v-if="activeTab === 'structures'" class="table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Typ</th>
                    <th>Parameter</th>
                    <th>Deckelhöhe (m)</th>
                    <th>Sohlhöhe (m)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="node in structures" :key="node.id">
                    <td>{{ node.id }}</td>
                    <td>
                      <select v-model="node.type" class="small-select">
                        <option value="Standard">Schacht</option>
                        <option value="Bauwerk">Bauwerk (Allgemein)</option>
                        <option v-for="(label, key) in Bauwerkstyp" :key="key" :value="parseInt(key)">
                          {{ label }}
                        </option>
                      </select>
                    </td>
                    <td>
                      <!-- 1, 6, 14: Constant Inflow -->
                      <div v-if="[1, 6, 14].includes(node.type)" class="input-group">
                        <input type="number" v-model.number="node.constantInflow" step="0.1" class="small-input">
                        <span class="hint-text">Zufluss (l/s)</span>
                      </div>

                      <!-- 2: Volume + Weir Height -->
                      <div v-if="node.type === 2" class="input-group-col">
                        <div class="input-group">
                            <input type="number" v-model.number="node.volume" step="1" class="small-input">
                            <span class="hint-text">Volumen (m³)</span>
                        </div>
                        <div class="input-group">
                            <input type="number" v-model.number="node.weirHeight" step="0.01" class="small-input">
                            <span class="hint-text">Überlaufhöhe (m)</span>
                        </div>
                      </div>

                      <!-- 3, 4, 12, 13: Volume -->
                      <div v-if="[3, 4, 12, 13].includes(node.type)" class="input-group">
                        <input type="number" v-model.number="node.volume" step="1" class="small-input">
                        <span class="hint-text">Volumen (m³)</span>
                      </div>

                      <!-- 5: Outflow Type + Value -->
                      <div v-if="node.type == 5" class="input-group-col">
                        <select v-model="node.outflowType" class="small-select">
                            <option value="free">Freier Auslauf</option>
                            <option value="constant">Konstant</option>
                        </select>
                        <div v-if="node.outflowType === 'constant'" class="input-group">
                            <input type="number" v-model.number="node.constantOutflow" step="0.1" class="small-input">
                            <span class="hint-text">Abfluss (l/s)</span>
                        </div>
                        <div class="input-group">
                            <input type="number" v-model.number="node.volume" step="1" class="small-input">
                            <span class="hint-text">Volumen (m³)</span>
                        </div>
                        <div class="input-group">
                            <input type="number" v-model.number="node.constantInflow" step="0.1" class="small-input">
                            <span class="hint-text">Zufluss (l/s)</span>
                        </div>
                      </div>

                      <!-- 7: Weir Height -->
                      <div v-if="node.type === 7" class="input-group">
                        <input type="number" v-model.number="node.weirHeight" step="0.01" class="small-input">
                        <span class="hint-text">Wehrhöhe (m)</span>
                      </div>

                      <!-- 8, 9: Constant Outflow -->
                      <div v-if="[8, 9].includes(node.type)" class="input-group">
                        <input type="number" v-model.number="node.constantOutflow" step="0.1" class="small-input">
                        <span class="hint-text">Abfluss (l/s)</span>
                      </div>
                      
                      <!-- Standard/Schacht fallback -->
                      <div v-if="node.type === 'Standard'" class="input-group">
                         <input type="number" v-model.number="node.constantInflow" step="0.1" class="small-input">
                         <span class="hint-text">Zufluss (l/s)</span>
                      </div>

                      <!-- Bauwerk (Generic) -->
                      <div v-if="node.type === 'Bauwerk'" class="input-group-col">
                         <div class="input-group">
                             <input type="number" v-model.number="node.constantInflow" step="0.1" class="small-input">
                             <span class="hint-text">Zufluss (l/s)</span>
                         </div>
                         <div class="input-group">
                             <input type="number" v-model.number="node.volume" step="1" class="small-input">
                             <span class="hint-text">Volumen (m³)</span>
                         </div>
                         <div class="input-group">
                             <input type="number" v-model.number="node.constantOutflow" step="0.1" class="small-input">
                             <span class="hint-text">Abfluss (l/s)</span>
                         </div>
                         <div class="input-group">
                            <input 
                                type="checkbox" 
                                :checked="node.is_sink" 
                                @change="node.is_sink = $event.target.checked"
                            >
                            <span class="hint-text">Ist Auslauf?</span>
                         </div>
                      </div>
                    </td>
                    <td>
                      <input type="number" v-model.number="node.coverZ" step="0.01" class="small-input">
                    </td>
                    <td>
                      <input type="number" v-model.number="node.z" step="0.01" class="small-input">
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Edges Tab -->
            <div v-if="activeTab === 'edges'" class="table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Von -> Nach</th>
                    <th>Material</th>
                    <th>Rauheit (kst)</th>
                    <th>Profil</th>
                    <th>Länge (m)</th>
                    <th>Neigung (%)</th>
                    <th>Querschnitt (m²)</th>
                    <th>H (mm)</th>
                    <th>B (mm)</th>
                    <th>Zusatz</th>
                    <th>Z1 (m)</th>
                    <th>Z2 (m)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="edge in edges" :key="edge.id">
                    <td>{{ edge.id }}</td>
                    <td class="small-text">{{ edge.from }} -> {{ edge.to }}</td>
                    <td>
                      <select v-model="edge.material" @change="updateRoughness(edge)" class="small-select">
                        <option v-if="edge.material && !MaterialRoughness[edge.material]" :value="edge.material">
                          {{ edge.material }}
                        </option>
                        <option v-for="(kst, mat) in MaterialRoughness" :key="mat" :value="mat">
                          {{ mat }}
                        </option>
                      </select>

                    </td>
                    <td>
                      <input type="number" v-model.number="edge.roughness" class="small-input">
                    </td>
                    <td>
                      <select v-model.number="edge.profile.type" @change="onProfileChange(edge)" class="small-select">
                        <option :value="0">Kreisprofil</option>
                        <option :value="1">Eiprofil</option>
                        <option :value="2">Maulprofil</option>
                        <option :value="3">Rechteck (geschlossen)</option>
                        <option :value="5">Rechteck (offen)</option>
                        <option :value="8">Trapezprofil</option>
                        <option :value="13">Andere</option>
                      </select>
                    </td>
                    <td>
                      {{ edge.length.toFixed(2) }}
                    </td>
                    <td>
                      {{ calculateSlope(edge) }}
                    </td>
                    <td>
                      {{ calculateArea(edge) }}
                    </td>
                    <td>
                      <div class="input-group">
                        <input type="number" v-model.number="edge.profile.height" class="small-input">
                        <span v-if="edge.profile.type === 8" class="hint-text">Höhe</span>
                      </div>
                    </td>
                    <td>
                      <div class="input-group">
                        <input type="number" v-model.number="edge.profile.width" class="small-input" :disabled="edge.profile.type === 0">
                         <span v-if="edge.profile.type === 8" class="hint-text">Sohlbreite</span>
                      </div>
                    </td>
                    <td>
                      <div class="input-group">
                        <input v-if="edge.profile.type === 8" type="number" v-model.number="edge.profile.slope" class="small-input" placeholder="1.5">
                        <span v-if="edge.profile.type === 8" class="hint-text">Neigung (1:n)</span>
                         <input v-else type="number" v-model.number="edge.z1" step="0.01" class="small-input">
                      </div>
                    </td>
                    <td>
                      <input v-if="edge.profile.type === 8" type="number" v-model.number="edge.z1" step="0.01" class="small-input">
                       <input v-else type="number" v-model.number="edge.z2" step="0.01" class="small-input">
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Areas Tab -->
            <div v-if="activeTab === 'areas'" class="table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Typ</th>
                    <th>Eigenschaft</th>
                    <th>Funktion</th>
                    <th>Nutzung</th>
                    <th>Verschmutzung</th>
                    <th>Neigung</th>
                    <th>Fläche (ha)</th>
                    <th>Abflussbeiwert</th>
                    <th>Anschluss 1</th>
                    <th>Anschluss 2</th>
                    <th>Aufteilung (%)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="area in areas" :key="area.id">
                    <td>{{ area.id }}</td>
                    <td>{{ getMapping('Flaechenart', area.type) }}</td>
                    <td>{{ getMapping('Flaecheneigenschaft', area.property) }}</td>
                    <td>{{ getMapping('Flaechenfunktion', area.function) }}</td>
                    <td>{{ getMapping('Flaechennutzung', area.usage) }}</td>
                    <td>{{ getMapping('Verschmutzungsklasse', area.pollution) }}</td>
                    <td>{{ getMapping('Neigungsklasse', area.slope) }}</td>
                    <td>{{ area.size.toFixed(4) }}</td>
                    <td>
                      <input type="number" v-model.number="area.runoffCoeff" step="0.05" min="0" max="1" class="small-input">
                    </td>
                    <td>
                      <input type="text" v-model="area.nodeId" class="medium-input" placeholder="Knoten 1">
                    </td>
                    <td>
                      <input type="text" v-model="area.nodeId2" class="medium-input" placeholder="Knoten 2">
                    </td>
                    <td>
                      <input type="number" v-model.number="area.splitRatio" min="0" max="100" class="small-input" placeholder="50">
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>


        </div>

        <div class="modal-footer">
          <button class="secondary-btn" @click="close">Abbrechen</button>

          <button class="primary-btn" @click="apply">Übernehmen</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { getMapping, getRoughness, getRunoffCoeff, MaterialRoughness, Bauwerkstyp } from '../utils/mappings';




const props = defineProps({
  isOpen: Boolean,
  network: Object, // { nodes, edges }
  hydraulics: Object // { catchments, areas }
});

const emit = defineEmits(['close', 'apply']);

const activeTab = ref('nodes');
const tabs = [
  { id: 'nodes', label: 'Schächte' },
  { id: 'structures', label: 'Bauwerke' },
  { id: 'edges', label: 'Haltungen' },
  { id: 'areas', label: 'Flächen' }
];

// Local state for editing
const nodes = ref([]);
const edges = ref([]);
const areas = ref([]);

// Computed properties for filtering nodes
// Computed properties for filtering nodes
const manholes = computed(() => nodes.value.filter(n => n.type === 'Standard'));
const structures = computed(() => nodes.value.filter(n => n.type !== 'Standard'));

// Initialize local state from props when modal opens
watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    // Deep copy to avoid mutating store directly before apply
    // Nodes
    nodes.value = Array.from(props.network.nodes.values()).map(n => ({
      ...n,
      type: n.type === 'Schacht' ? 'Standard' : (n.type === 'Bauwerk' ? 'Bauwerk' : (typeof n.type === 'number' ? n.type : 'Standard')), 
      constantInflow: n.constantInflow || 0,
      volume: n.volume || 0,
      weirHeight: n.weirHeight || 0,
      constantOutflow: n.constantOutflow || 0,
      outflowType: n.outflowType || 'free',
      coverZ: n.z, // Original 'z' is now 'coverZ'
      z: n.sohlhoehe !== undefined ? n.sohlhoehe : n.z // Original 'sohlhoehe' is now 'z', default to original 'z' if missing
    }));

    // Edges
    edges.value = Array.from(props.network.edges.values()).map(e => {
      const fromNode = props.network.nodes.get(e.from);
      const toNode = props.network.nodes.get(e.to);
      
      let material = e.material;
      let roughness = e.roughness;

      // Smart Filling on Load
      if (e.profile.type === 8 && !material) { // Trapezprofil
          material = 'Erde';
          roughness = 25;
      } else if (e.profile.type === 13) { // Andere
          roughness = 95;
      }

      if (!roughness) {
          roughness = getRoughness(material);
      }

      return {
        ...e,
        material,
        roughness,
        profile: { 
            ...e.profile,
            height: (e.profile.height || 0) * 1000, // Convert m to mm for display
            width: (e.profile.width || 0) * 1000    // Convert m to mm for display
        },
        z1: e.z1 !== undefined ? e.z1 : (fromNode ? (fromNode.sohlhoehe !== undefined ? fromNode.sohlhoehe : fromNode.z) : 0),
        z2: e.z2 !== undefined ? e.z2 : (toNode ? (toNode.sohlhoehe !== undefined ? toNode.sohlhoehe : toNode.z) : 0)
      };
    });

    // Areas
    // We want to show ALL areas (polygons) and allow assigning them to nodes
    // If catchments exist, we might want to merge that info, but for now let's prioritize the visual areas
    // and allow defining the connection.
    areas.value = props.hydraulics.areas.map(a => {
        // Auto-assign nodes if edgeId is present
        let nodeId = a.nodeId || '';
        let nodeId2 = a.nodeId2 || '';
        let splitRatio = a.splitRatio || 50;

        if (!nodeId && a.edgeId) {
            // Try to find Edge
            const edge = props.network.edges.get(a.edgeId);
            if (edge) {
                nodeId = edge.from;
                nodeId2 = edge.to;
                splitRatio = 50; // Default split
            } else {
                // Try to find Node (Direct connection to Schacht)
                const node = props.network.nodes.get(a.edgeId);
                if (node) {
                    nodeId = node.id;
                    // Single connection
                }
            }
        }

        return {
            ...a,
            runoffCoeff: a.runoffCoeff || getRunoffCoeff(a.property, a.function, a.slope),
            nodeId,
            nodeId2,
            splitRatio
        };
    });
  }
});

const updateNodeCover = (node, value) => {
    node.coverLevel = parseFloat(value);
};

const updateNodeOverflow = (node, checked) => {
    node.canOverflow = checked;
};

const close = () => {
  emit('close');
};

const apply = () => {
  emit('apply', {
    nodes: nodes.value,
    edges: edges.value.map(e => ({
        ...e,
        profile: {
            ...e.profile,
            height: e.profile.height / 1000, // Convert mm back to m
            width: e.profile.width / 1000    // Convert mm back to m
        }
    })),
    areas: areas.value

  });
  close();

};

const calculateSlope = (edge) => {
    if (!edge.length || edge.length === 0) return '0.00';
    const slope = ((edge.z1 - edge.z2) / edge.length) * 100;
    return slope.toFixed(2);
};

const calculateArea = (edge) => {
    const h = edge.profile.height / 1000; // Convert mm to m
    const w = edge.profile.width / 1000;  // Convert mm to m
    let area = 0;

    switch (edge.profile.type) {
        case 0: // Kreisprofil
            // h is diameter
            area = Math.PI * Math.pow(h / 2, 2);
            break;
        case 3: // Rechteck (geschlossen)
        case 5: // Rechteck (offen)
            area = h * w;
            break;
        case 8: // Trapezprofil
            // w is bottom width (short side), slope 1:1.5
            // Area = (b + 1.5*h) * h
            area = (w + 1.5 * h) * h;
            break;
        case 13: // Andere
            return '10.000';
        default:
            return '-';
    }
    return area.toFixed(3);
};

const updateRoughness = (edge) => {
    edge.roughness = getRoughness(edge.material);
};

const onProfileChange = (edge) => {
    if (edge.profile.type === 8) { // Trapezprofil
        edge.material = 'Erde';
        edge.roughness = 25;
    } else if (edge.profile.type === 13) { // Andere
        edge.roughness = 95;
    }
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.modal-content {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 900px;
  height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
}

.modal-header {
  padding: 1rem;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  color: #2c3e50;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #7f8c8d;
}

.modal-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 1rem;
}

.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.5rem;
}

.tab-btn {
  padding: 0.5rem 1rem;
  border: none;
  background: none;
  cursor: pointer;
  font-weight: 500;
  color: #7f8c8d;
  border-radius: 4px;
}

.tab-btn.active {
  background: #e8f4f8;
  color: #3498db;
}

.tab-content {
  flex: 1;
  overflow: auto;
  border: 1px solid #eee;
  border-radius: 4px;
}

.table-wrapper {
  height: 100%;
  overflow: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.data-table th, .data-table td {
  padding: 0.5rem;
  border: 1px solid #eee;
  text-align: left;
}

.data-table th {
  background: #f8f9fa;
  position: sticky;
  top: 0;
  z-index: 1;
}

.data-table tr:nth-child(even) {
  background: #fcfcfc;
}

.small-input {
  width: 80px;
  padding: 0.25rem;
  border: 1px solid #ddd;
  border-radius: 3px;
}

.medium-input {
  width: 120px;
  padding: 0.25rem;
  border: 1px solid #ddd;
  border-radius: 3px;
}

.small-select {
  padding: 0.25rem;
  border: 1px solid #ddd;
  border-radius: 3px;
}

.small-text {
  font-size: 0.8rem;
  color: #666;
}

.modal-footer {
  padding: 1rem;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}

.primary-btn {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}

.secondary-btn {
  background: white;
  border: 1px solid #ddd;
  color: #7f8c8d;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}

.input-group {
    display: flex;
    align-items: center;
    gap: 4px;
}

.hint-text {
    font-size: 0.7rem;
    color: #666;
    white-space: nowrap;
}

.input-group-col {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
</style>
