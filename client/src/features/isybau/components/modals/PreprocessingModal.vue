<template>
  <DraggableModal :is-open="isOpen" initial-width="1100px" initial-height="85vh" initial-left="center" initial-top="50">
      <!-- Old modal-content inner structure preserved but styles adapted -->
        <div class="modal-header">
          <div class="header-left">
            <h3>Daten bearbeiten</h3>
          </div>
          
          <div class="header-actions">
              <!-- Side View logic might conflict with draggable. Disable split for now or adapt? 
                   User wanted "draggable". Split screen usually implies docked.
                   Let's keep the button but make it effective only if Draggable allows? 
                   actually draggable is superior. -->
              <!-- <button class="icon-btn" @click="toggleSideView" title="Split Screen / Side Panel">
                  {{ isSideView ? '⤢' : '◫' }}
              </button> -->
              <button class="close-btn" @click="close">×</button>
          </div>
        </div>

        <div class="modal-body">
          <div class="tabs">
            <button 
              v-for="tab in tabs" 
              :key="tab.id"
              :class="['tab-btn', { active: activeTab === tab.id }]"
              @click="switchTab(tab.id)"
            >
              {{ tab.label }}
            </button>
          </div>

          <!-- Undo Toast -->
          <Transition name="fade">
              <div v-if="undoState.show" class="undo-toast" :class="undoState.type">
                  <span>{{ undoState.message }}</span>
                  <button v-if="undoState.action" @click="performUndo">Rückgängig</button>
                  <button @click="dismissUndo" class="close-toast">×</button>
              </div>
          </Transition>

          <!-- Floating Bulk Action Bar -->
          <Transition name="fade">
              <div v-if="selectedIds.length > 0" class="bulk-actions-bar">
                  <span class="bulk-count">{{ selectedIds.length }} ausgewählt</span>
                  <div class="bulk-btns">
                      <button class="bulk-btn-link" @click="openBulkEdit">✎ Bearbeiten</button>
                      <button class="bulk-btn-link text-red" @click="deleteSelected">🗑️ Löschen</button>
                      <button class="bulk-btn-link" @click="selectedIds = []">Deselektieren</button>
                  </div>
              </div>
          </Transition>

          <!-- Bulk Edit Overlay - Needs to be scoped to this DOM or fixed relative? 
               If absolute inside draggable, it works! -->
          <div v-if="showBulkEdit" class="bulk-edit-overlay">
              <div class="bulk-edit-modal">
                <h4>Massenbearbeitung ({{ selectedIds.length }} Elemente)</h4>
                
                <div class="bulk-controls">
                    <!-- Edges Bulk Edit -->
                    <template v-if="activeTab === 'edges'">
                        <div class="bulk-field">
                            <label>Material:</label>
                            <select v-model="bulkForm.material" class="bulk-select">
                                <option value="">- Unverändert -</option>
                                <option v-for="(kst, mat) in MaterialRoughness" :key="mat" :value="mat">{{ mat }}</option>
                            </select>
                        </div>
                        <div class="bulk-field">
                            <label>Profiltyp:</label>
                            <select v-model="bulkForm.profileType" class="bulk-select">
                                <option :value="null">- Unverändert -</option>
                                <option :value="0">Kreisprofil</option>
                                <option :value="1">Eiprofil</option>
                                <option :value="3">Rechteck</option>
                                <option :value="8">Trapezprofil</option>
                                <option :value="13">Andere</option>
                            </select>
                        </div>
                        
                        <!-- Dynamic Profile Dimensions -->
                        <div class="bulk-field-row" v-if="bulkForm.profileType !== null">
                             <div class="bulk-field">
                                <label>{{ bulkForm.profileType === 8 ? 'Höhe' : 'Höhe/DN' }} (mm):</label>
                                <input type="number" v-model.number="bulkForm.profileHeight" placeholder="Unverändert" class="bulk-input">
                            </div>
                            <div class="bulk-field" v-if="bulkForm.profileType !== 0">
                                <label>Breite (mm):</label>
                                <input type="number" v-model.number="bulkForm.profileWidth" placeholder="Unverändert" class="bulk-input">
                            </div>
                        </div>
                        <div class="bulk-field" v-if="bulkForm.profileType === 8">
                            <label>Böschungsneigung (1:n):</label>
                            <input type="number" v-model.number="bulkForm.profileSlope" placeholder="z.B. 1.5" step="0.1" class="bulk-input">
                        </div>
                    </template>

                    <!-- Nodes/Structures Bulk Edit -->
                    <template v-if="activeTab === 'nodes' || activeTab === 'structures'">
                         <div class="bulk-field">
                            <label>Typ ändern:</label>
                            <select v-model="bulkForm.nodeType" class="bulk-select">
                                <option value="">- Unverändert -</option>
                                <option value="Standard">Standard (Schacht)</option>
                                <option value="Bauwerk">Bauwerk (Allgemein)</option>
                                <option v-for="(label, key) in Bauwerkstyp" :key="key" :value="parseInt(key)">
                                  {{ label }}
                                </option>
                            </select>
                        </div>
                        
                        <!-- Dynamic Node Fields -->
                        <div class="bulk-field" v-if="parseInt(bulkForm.nodeType) === 7">
                            <label>Wehrhöhe (m):</label>
                            <input type="number" v-model.number="bulkForm.weirHeight" step="0.01" class="bulk-input">
                        </div>
                         <div class="bulk-field" v-if="parseInt(bulkForm.nodeType) === 1">
                            <label>Förderleistung (l/s)? (Zukunft):</label>
                            <input disabled placeholder="Feature kommt..." class="bulk-input">
                        </div>
                    </template>

                    <!-- Areas Bulk Edit -->
                     <template v-if="activeTab === 'areas'">
                        <div class="bulk-field">
                            <label>Abflussbeiwert (0.0 - 1.0):</label>
                            <input type="number" v-model.number="bulkForm.runoffCoeff" step="0.1" placeholder="Unverändert" class="bulk-input">
                        </div>
                    </template>
                </div>

                <div class="bulk-buttons">
                    <button @click="applyBulkEdit" class="primary-btn">Anwenden</button>
                    <button @click="showBulkEdit = false" class="secondary-btn">Abbrechen</button>
                </div>
            </div>
          </div>

          <div class="tab-content">
            <!-- SCHÄCHTE TAB -->
            <div v-if="activeTab === 'nodes'" class="table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th class="col-checkbox sticky-left-1"><input type="checkbox" @change="toggleSelectAll($event, filteredNodes)"></th>
                    <th class="col-id sticky-left-2 sortable" @click="sortBy('id')">
                        ID <span v-if="sortKey==='id'">{{ sortOrder===1 ? '▲' : '▼' }}</span>
                    </th>
                    <th class="sortable" @click="sortBy('type')">Typ</th>
                    <th>Zufluss (l/s)</th>
                    <th>Deckel (m)</th>
                    <th>Sohle (m)</th>
                    <th>Druckdicht</th>
                    <th>Validierung</th>
                  </tr>
                  <!-- Filter Row -->
                  <tr class="filter-row">
                      <th class="col-checkbox sticky-left-1"></th>
                      <th class="col-id sticky-left-2"><input v-model="filters.id" placeholder="Suche..." class="filter-input"></th>
                      <th></th>
                      <th></th>
                      <th></th>
                      <th></th>
                      <th></th>
                      <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr 
                    v-for="node in filteredNodes" 
                    :key="node.id" 
                    class="clickable-row"
                    :class="{ 'selected': selectedIds.includes(node.id) }"
                    @click="handleRowClick(node, $event)"
                  >
                    <td class="col-checkbox sticky-left-1" @click.stop>
                        <input type="checkbox" :value="node.id" v-model="selectedIds">
                    </td>
                    <td class="col-id sticky-left-2">
                        <div class="id-cell">
                            {{ node.id }}
                            <button class="locate-btn" @click.stop="locate(node.id)" title="Auf Karte zeigen">🎯</button>
                        </div>
                    </td>
                    <td>
                      <select v-model="node.type" class="small-select" @click.stop @change="handleTypeChange(node, 'Standard')">
                        <option value="Standard">Standard</option>
                        <option value="Bauwerk">Bauwerk</option>
                      </select>
                    </td>
                    <td>
                      <input type="number" v-model.number="node.constantInflow" step="0.1" class="small-input" @click.stop>
                    </td>
                    <td>
                      <input type="number" v-model.number="node.coverZ" step="0.01" class="small-input" @click.stop :class="{ 'invalid': node.coverZ <= node.z }">
                    </td>
                    <td>
                      <input type="number" v-model.number="node.z" step="0.01" class="small-input" @click.stop :class="{ 'invalid': node.z >= node.coverZ }">
                    </td>
                    <td class="text-center">
                      <input type="checkbox" :checked="node.canOverflow === false" @change="updateNodeOverflow(node, !$event.target.checked)" @click.stop>
                    </td>
                    <td>
                         <span v-if="node.z >= node.coverZ" class="error-badge" title="Sohle muss tiefer als Deckel liegen">Sohle >= Deckel</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- BAUWERKE TAB -->
            <div v-if="activeTab === 'structures'" class="table-wrapper">
               <table class="data-table">
                <thead>
                  <tr>
                    <th class="col-checkbox sticky-left-1"><input type="checkbox" @change="toggleSelectAll($event, filteredStructures)"></th>
                    <th class="col-id sticky-left-2 sortable" @click="sortBy('id')">ID</th>
                    <th class="sortable" @click="sortBy('type')">Typ</th>
                    <th>Parameter</th>
                    <th>Deckel (m)</th>
                    <th>Sohle (m)</th>
                    <th>-</th>
                  </tr>
                </thead>
                <tbody>
                  <tr 
                    v-for="node in filteredStructures" 
                    :key="node.id"
                    class="clickable-row"
                    :class="{ 'selected': selectedIds.includes(node.id) }"
                    @click="handleRowClick(node, $event)"
                  >
                    <td class="col-checkbox sticky-left-1" @click.stop>
                        <input type="checkbox" :value="node.id" v-model="selectedIds">
                    </td>
                    <td class="col-id sticky-left-2">
                        <div class="id-cell">
                            {{ node.id }}
                            <button class="locate-btn" @click.stop="locate(node.id)">🎯</button>
                        </div>
                    </td>
                    <td>
                      <select v-model="node.type" class="small-select" @click.stop @change="handleTypeChange(node, 'Bauwerk')">
                        <option value="Standard">Schacht</option>
                        <option value="Bauwerk">Bauwerk (Allgemein)</option>
                        <option v-for="(label, key) in Bauwerkstyp" :key="key" :value="parseInt(key)">
                          {{ label }}
                        </option>
                      </select>
                    </td>
                    <td>
                      <!-- Config inputs -->
                       <div v-if="[1, 6, 14].includes(node.type)" class="input-group">
                        <input type="number" v-model.number="node.constantInflow" step="0.1" class="small-input" @click.stop>
                        <span class="hint-text">Zufluss</span>
                      </div>
                       <div v-if="node.type === 7" class="input-group">
                        <input type="number" v-model.number="node.weirHeight" step="0.01" class="small-input" @click.stop>
                        <span class="hint-text">Wehrhöhe</span>
                      </div>
                    </td>
                    <td><input type="number" v-model.number="node.coverZ" class="small-input" @click.stop></td>
                    <td><input type="number" v-model.number="node.z" class="small-input" @click.stop></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- HALTUNGEN TAB -->
            <div v-if="activeTab === 'edges'" class="table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th class="col-checkbox sticky-left-1"><input type="checkbox" @change="toggleSelectAll($event, filteredEdges)"></th>
                    <th class="col-id sticky-left-2 sortable" @click="sortBy('id')">ID</th>
                    <th>Von -> Nach</th>
                    <th class="sortable" @click="sortBy('material')">Material</th>
                    <th>Rauheit</th>
                    <th>Profil</th>
                    <th class="sortable" @click="sortBy('length')">Länge</th>
                    <th>Neigung %</th>
                    <th>H (mm)</th>
                    <th>B (mm)</th>
                    <th>Z1</th>
                    <th>Z2</th>
                  </tr>
                   <tr class="filter-row">
                      <th class="col-checkbox sticky-left-1"></th>
                      <th class="col-id sticky-left-2"><input v-model="filters.id" placeholder="Filter..." class="filter-input"></th>
                      <th></th>
                      <th><input v-model="filters.material" placeholder="Filter..." class="filter-input"></th>
                      <th></th>
                      <th></th>
                      <th></th>
                      <th></th>
                      <th></th>
                      <th></th>
                      <th></th>
                      <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr 
                    v-for="edge in filteredEdges" 
                    :key="edge.id"
                    class="clickable-row"
                    :class="{ 'selected': selectedIds.includes(edge.id) }"
                    @click="handleRowClick(edge, $event)"
                  >
                   <td class="col-checkbox sticky-left-1" @click.stop>
                        <input type="checkbox" :value="edge.id" v-model="selectedIds">
                    </td>
                    <td class="col-id sticky-left-2">
                        <div class="id-cell">
                            {{ edge.id }}
                            <button class="locate-btn" @click.stop="locate(edge.id)">🎯</button>
                        </div>
                    </td>
                    <td class="small-text">{{ edge.from }} -> {{ edge.to }}</td>
                    <td>
                      <select v-model="edge.material" @change="updateRoughness(edge)" class="small-select" @click.stop>
                        <option v-for="(kst, mat) in MaterialRoughness" :key="mat" :value="mat">{{ mat }}</option>
                        <option v-if="edge.material && !MaterialRoughness[edge.material]" :value="edge.material">{{ edge.material }}</option>
                      </select>
                    </td>
                    <td>
                      <input type="number" v-model.number="edge.roughness" class="small-input" @click.stop>
                    </td>
                    <td>
                      <select v-model.number="edge.profile.type" @change="onProfileChange(edge)" class="small-select" @click.stop>
                        <option v-for="(label, key) in Profilart" :key="key" :value="parseInt(key)">{{ label }}</option>
                      </select>
                    </td>
                    <td>{{ edge.length.toFixed(2) }}</td>
                    <td>
                        <span :class="{ 'text-red': calculateSlope(edge) < 0 }">{{ calculateSlope(edge) }}</span>
                    </td>
                    <td>
                        <input type="number" v-model.number="edge.profile.height" class="small-input" @click.stop :class="{ 'invalid': edge.profile.height <= 0 }">
                    </td>
                    <td>
                        <input type="number" v-model.number="edge.profile.width" class="small-input" :disabled="edge.profile.type === 0" @click.stop :class="{ 'invalid': edge.profile.type !== 0 && edge.profile.width <= 0 }">
                    </td>
                    <td><input type="number" v-model.number="edge.z1" step="0.01" class="small-input" @click.stop></td>
                    <td><input type="number" v-model.number="edge.z2" step="0.01" class="small-input" @click.stop></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- FLÄCHEN TAB -->
            <div v-if="activeTab === 'areas'" class="table-wrapper">
                 <table class="data-table">
                  <thead>
                    <tr>
                      <th class="col-checkbox sticky-left-1"><input type="checkbox" @change="toggleSelectAll($event, filteredAreas)"></th>
                      <th class="col-id sticky-left-2">ID</th>
                      <th>Fläche (ha)</th>
                      <th>Abflussbeiwert</th>
                      <th>Funktion (Horton)</th>
                      <th>Anschluss 1</th>
                      <th>Anschluss 2 / Split (%)</th>
                    </tr>
                  </thead>
                   <tbody>
                    <tr v-for="area in filteredAreas" :key="area.id" class="clickable-row" :class="{ 'selected': selectedIds.includes(area.id) }" @click="handleRowClick(area, $event)">
                        <td class="col-checkbox sticky-left-1" @click.stop>
                            <input type="checkbox" :value="area.id" v-model="selectedIds">
                        </td>
                        <td class="col-id sticky-left-2">
                            <div class="id-cell">
                                {{ area.id }}
                                <button class="locate-btn" @click.stop="locate(area.id)">🎯</button>
                            </div>
                        </td>
                        <td>{{ area.size.toFixed(4) }}</td>
                        <td>
                            <input type="number" v-model.number="area.runoffCoeff" step="0.1" class="small-input" @click.stop :class="{ 'invalid': area.runoffCoeff < 0 || area.runoffCoeff > 1 }">
                        </td>
                        <td>
                             <select v-model.number="area.function" class="medium-select" @click.stop>
                                <option v-for="(label, key) in Flaechenfunktion" :key="key" :value="parseInt(key)">
                                    {{ key }} - {{ label }}
                                </option>
                            </select>
                        </td>
                        <td><input type="text" v-model="area.nodeId" class="medium-input" placeholder="Knoten 1" @click.stop></td>
                        <td>
                             <div class="split-cell">
                                <input type="text" v-model="area.nodeId2" placeholder="Knoten 2" class="medium-input" @click.stop>
                                <input type="number" v-model.number="area.splitRatio" placeholder="%" class="small-input" v-if="area.nodeId2" @click.stop  title="Anteil zu Knoten 1 (%)">
                             </div>
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
  </DraggableModal>
</template>

<script setup>
import { useIsybauStore } from '../../store/index.js';
import { ref, watch, computed } from 'vue';
import DraggableModal from '../common/DraggableModal.vue';
import { getMapping, getRoughness, getRunoffCoeff, MaterialRoughness, Bauwerkstyp, Profilart, Flaechenfunktion } from '../../utils/mappings.js';

const props = defineProps({
  isOpen: Boolean,
  network: Object,
  hydraulics: Object
});

const emit = defineEmits(['close', 'apply', 'select-element']);

// === UI State ===
const isSideView = ref(false);
const showBulkEdit = ref(false);
const toggleSideView = () => isSideView.value = !isSideView.value;

const activeTab = ref('nodes');
const tabs = [
  { id: 'nodes', label: 'Schächte' },
  { id: 'structures', label: 'Bauwerke' },
  { id: 'edges', label: 'Haltungen' },
  { id: 'areas', label: 'Flächen' }
];

const switchTab = (tab) => {
    activeTab.value = tab;
    selectedIds.value = []; // Clear selection on tab switch
    filters.value = { id: '', material: '' }; // Reset filters
};

// === Data State ===
const nodes = ref([]);
const edges = ref([]);
const areas = ref([]);
const isDirty = ref(false);

const selectedIds = ref([]);
const sortKey = ref('id');
const sortOrder = ref(1); // 1 = asc, -1 = desc
const filters = ref({
    id: '',
    material: ''
});

// === Undo State ===
const undoState = ref({ show: false, message: '', action: null, type: '' });
let undoTimeout = null;

const triggerUndo = (msg, action, type = '') => {
    undoState.value = { show: true, message: msg, action, type };
    if (undoTimeout) clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => dismissUndo(), 5000);
};

const performUndo = () => {
    if (undoState.value.action) undoState.value.action();
    dismissUndo();
};

const dismissUndo = () => {
    undoState.value = { show: false, message: '', action: null, type: '' };
};


// === Computed Lists & Filtering ===

const filterList = (list) => {
    return list.filter(item => {
        if (filters.value.id && !item.id.toLowerCase().includes(filters.value.id.toLowerCase())) return false;
        if (filters.value.material && item.material && !item.material.toLowerCase().includes(filters.value.material.toLowerCase())) return false;
        return true;
    });
};

const sortList = (list) => {
    return list.sort((a, b) => {
        let valA = a[sortKey.value];
        let valB = b[sortKey.value];
        // Handle undefined safe
        if (valA === undefined) valA = '';
        if (valB === undefined) valB = '';
        
        if (typeof valA === 'string') {
             return valA.localeCompare(valB) * sortOrder.value;
        }
        return (valA - valB) * sortOrder.value;
    });
};

const processedNodes = computed(() => sortList(filterList(nodes.value)));
const filteredNodes = computed(() => processedNodes.value.filter(n => n.type === 'Standard'));
const filteredStructures = computed(() => processedNodes.value.filter(n => n.type !== 'Standard'));

const processedEdges = computed(() => sortList(filterList(edges.value)));
const filteredEdges = computed(() => processedEdges.value);

const processedAreas = computed(() => sortList(filterList(areas.value)));
const filteredAreas = computed(() => processedAreas.value);


// === Helpers ===

const sortBy = (key) => {
    if (sortKey.value === key) {
        sortOrder.value = sortOrder.value * -1;
    } else {
        sortKey.value = key;
        sortOrder.value = 1;
    }
};

const toggleSelectAll = (e, list) => {
    if (e.target.checked) {
        selectedIds.value = list.map(i => i.id);
    } else {
        selectedIds.value = [];
    }
};

const locate = (id) => {
    emit('select-element', { id: id, type: 'any' }); // 'any' for viewer to figure out, or specific
};

const handleRowClick = (item, e) => {
    // If multiselect modifier (Shift/Ctrl), handle logic? 
    // Simplify: Click selects/deselects if not clicking input
    // But we have a specific checkbox.
    // Let's just highlight row or maybe select input?
    // Emitting locate on click might be annoying if trying to edit.
};

const handleTypeChange = (node, previousCategory) => {
    // Logic: If I change a Standard Node to Bauwerk, it moves to the other tab!
    // Undo required.
    const oldType = previousCategory === 'Standard' ? 'Standard' : 'Bauwerk'; 
    const newType = node.type; // already updated model
    
    // We can't really "undo" model change easily without snapshot, 
    // but the reactive change happens immediately.
    // The previousCategory arg was my expected 'source' tab.
    
    // Actually simpler:
    // If in Node Tab and change to Bauwerk -> it disappears.
    if (activeTab.value === 'nodes' && newType !== 'Standard') {
        triggerUndo(`${node.id} zu Bauwerke verschoben.`, () => {
            node.type = 'Standard';
        });
    }
    if (activeTab.value === 'structures' && newType === 'Standard') {
        triggerUndo(`${node.id} zu Schächte verschoben.`, () => {
            node.type = 'Bauwerk'; // or whatever it was. 'Bauwerk' generic.
        });
    }
};


// === Bulk Edit ===
const bulkForm = ref({ material: '', nodeType: '', profileType: null, profileHeight: null, profileWidth: null, profileSlope: null, weirHeight: null, runoffCoeff: null });

const openBulkEdit = () => { 
    // Reset form
    bulkForm.value = { material: '', nodeType: '', profileType: null, profileHeight: null, profileWidth: null, profileSlope: null, weirHeight: null, runoffCoeff: null };
    showBulkEdit.value = true; 
};

const applyBulkEdit = () => {
    let updateCount = 0;
    if (activeTab.value === 'edges') {
        edges.value.forEach(e => {
            if (selectedIds.value.includes(e.id)) {
                if (bulkForm.value.material) {
                    e.material = bulkForm.value.material;
                    updateRoughness(e);
                }
                if (bulkForm.value.profileType !== null && bulkForm.value.profileType !== '') {
                    e.profile.type = bulkForm.value.profileType;
                    // Reset dims/inherit defaults?
                    onProfileChange(e);
                }
                if (bulkForm.value.profileHeight) e.profile.height = bulkForm.value.profileHeight;
                if (bulkForm.value.profileWidth) e.profile.width = bulkForm.value.profileWidth;
                if (bulkForm.value.profileSlope) e.profile.slope = bulkForm.value.profileSlope;
                updateCount++;
            }
        });
    } else if (activeTab.value === 'nodes' || activeTab.value === 'structures') {
        if (bulkForm.value.nodeType !== '') {
            nodes.value.forEach(n => {
                if (selectedIds.value.includes(n.id)) {
                    n.type = bulkForm.value.nodeType;
                    // Apply special props
                    if (n.type === 7 && bulkForm.value.weirHeight) n.weirHeight = bulkForm.value.weirHeight;
                    updateCount++;
                }
            });
             // Trigger undo is too complex for bulk move, just let it happen (user saw explicit option)
        } else if (bulkForm.value.weirHeight) {
             // Just update weir height if types match?
             nodes.value.forEach(n => {
                if (selectedIds.value.includes(n.id) && n.type === 7) {
                    n.weirHeight = bulkForm.value.weirHeight;
                    updateCount++;
                }
             });
        }
    } else if (activeTab.value === 'areas') {
        if (bulkForm.value.runoffCoeff !== null && bulkForm.value.runoffCoeff !== '') {
            areas.value.forEach(a => {
                if (selectedIds.value.includes(a.id)) {
                    a.runoffCoeff = bulkForm.value.runoffCoeff;
                    updateCount++;
                }
            });
        }
    }

    showBulkEdit.value = false;
    selectedIds.value = [];
    
    // Warn/Info User
    triggerUndo(`${updateCount} Elemente aktualisiert. "Übernehmen" zum Speichern klicken!`, null, 'info');
};

const deleteSelected = () => {
    if (!confirm(`Sicher, dass du ${selectedIds.value.length} Elemente löschen möchtest? Dies kann nicht rückgängig gemacht werden (außer durch Neuladen).`)) return;
    
    // Naive delete from Local State
    if (activeTab.value === 'nodes' || activeTab.value === 'structures') {
        nodes.value = nodes.value.filter(n => !selectedIds.value.includes(n.id));
    } else if (activeTab.value === 'edges') {
        edges.value = edges.value.filter(e => !selectedIds.value.includes(e.id));
    } else if (activeTab.value === 'areas') {
        areas.value = areas.value.filter(a => !selectedIds.value.includes(a.id));
    }
    
    selectedIds.value = [];
    isDirty.value = true;
};

// === Initialization ===
watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    isDirty.value = false;
    // Reset selections on open
    selectedIds.value = [];
    
    // Init Nodes
    nodes.value = Array.from(props.network.nodes.values()).map(n => ({
      ...n,
      type: n.type === 'Schacht' ? 'Standard' : (n.type === 'Bauwerk' ? 'Bauwerk' : (typeof n.type === 'number' ? n.type : 'Standard')), 
      constantInflow: n.constantInflow || 0,
      coverZ: n.coverZ !== undefined ? n.coverZ : (n.z + (n.depth || 0)),
      z: n.z !== undefined ? n.z : 0
    }));

    // Init Edges
    edges.value = Array.from(props.network.edges.values()).map(e => {
      let material = e.material;
      let roughness = e.roughness;
      if (e.profile.type === 8 && !material) { material = 'Erde'; roughness = 25; }
      if (!roughness) roughness = getRoughness(material);
      
      return {
        ...e,
        material,
        roughness,
        profile: { 
            ...e.profile,
            height: (e.profile.height || 0) * 1000, 
            width: (e.profile.width || 0) * 1000
        },
        z1: e.z1 || 0, z2: e.z2 || 0
      };
    });

    // Init Areas
    areas.value = props.hydraulics.areas.map(a => ({
        ...a,
          runoffCoeff: a.runoffCoeff || getRunoffCoeff(a.property, a.function, a.slope),
          nodeId: a.nodeId || '',
    }));
  }
}, { immediate: true });


const updateNodeOverflow = (node, checked) => { node.canOverflow = checked; };
const updateRoughness = (edge) => { edge.roughness = getRoughness(edge.material); };
const onProfileChange = (edge) => {
    if (edge.profile.type === 8) { edge.material = 'Erde'; edge.roughness = 25; }
    // Add default dims based on profile?
};
const calculateSlope = (edge) => {
     if (!edge.length) return 0;
     return (((edge.z1 - edge.z2) / edge.length) * 100).toFixed(2);
};

const close = () => { emit('close'); };
const apply = () => {
    // Normalization back to store
    emit('apply', {
        nodes: nodes.value,
        edges: edges.value.map(e => ({
            ...e,
            profile: { ...e.profile, height: e.profile.height / 1000, width: e.profile.width / 1000 }
        })),
        areas: areas.value
    });
};
</script>

<style scoped>
/* Cleaned up styles for DraggableModal */
.modal-header { padding: 1rem; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; cursor: move; }
.header-left { display: flex; gap: 1rem; align-items: center; }
.bulk-btns { display: flex; gap: 0.5rem; }
.bulk-btn-link { background: none; border: none; font-size: 0.9rem; color: #3498db; cursor: pointer; text-decoration: underline; padding: 0 5px; }
.bulk-btn-link.text-red { color: #e74c3c; }

.modal-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; padding: 1rem; position: relative; }

.tab-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.table-wrapper { 
    flex: 1; /* Grow to fill */
    overflow-y: auto; 
    position: relative; 
    scrollbar-width: thin;
    scrollbar-color: #bbb #f1f1f1;
}
.table-wrapper::-webkit-scrollbar { width: 8px; height: 8px; }
.table-wrapper::-webkit-scrollbar-track { background: #f1f1f1; }
.table-wrapper::-webkit-scrollbar-thumb { background: #bbb; border-radius: 4px; }
.table-wrapper::-webkit-scrollbar-thumb:hover { background: #999; }

.data-table { width: 100%; border-collapse: separate; font-size: 0.9rem; border-spacing: 0; }
.data-table th { background: #f8f9fa; position: sticky; top: 0; z-index: 10; padding: 0.5rem; border-bottom: 2px solid #ddd; text-align: left; }
.data-table td { padding: 0.5rem; border-bottom: 1px solid #eee; background: white; }

/* Sticky Columns */
.sticky-left-1 { position: sticky; left: 0; z-index: 21; background: #fff; width: 30px; border-right: 1px solid #eee; box-shadow: 2px 0 5px rgba(0,0,0,0.05); }
.sticky-left-2 { position: sticky; left: 30px; z-index: 20; background: #fff; min-width: 80px; box-shadow: 2px 0 5px rgba(0,0,0,0.05); }

.data-table th.sticky-left-1 { z-index: 31 !important; background: #f8f9fa !important; }
.data-table th.sticky-left-2 { z-index: 30 !important; background: #f8f9fa !important; }

.sortable { cursor: pointer; user-select: none; }
.sortable:hover { background: #eee; }

.clickable-row:hover td { background-color: #f1f8ff !important; }
.clickable-row.selected td { background-color: #e3f2fd !important; }

/* Inputs */
.small-input { width: 70px; padding: 4px; border: 1px solid #ddd; border-radius: 4px; }
.medium-input { width: 100px; padding: 4px; border: 1px solid #ddd; border-radius: 4px; }
.medium-select { width: 150px; padding: 4px; border: 1px solid #ddd; border-radius: 4px; }
.split-cell { display: flex; gap: 5px; align-items: center; }
.filter-input { width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.8rem; }
.invalid { border-color: #e74c3c !important; background: #fff5f5; }
.text-red { color: #e74c3c; font-weight: bold; }
.error-badge { font-size: 0.7rem; color: #fff; background: #e74c3c; padding: 2px 4px; border-radius: 4px; }

/* Locate Button */
.id-cell { display: flex; align-items: center; justify-content: space-between; gap: 5px; }
.locate-btn { border: none; background: none; cursor: pointer; opacity: 0.5; font-size: 1rem; }
.locate-btn:hover { opacity: 1; transform: scale(1.1); }

/* Undo & Bulk */
.undo-toast { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); background: #2c3e50; color: white; padding: 10px 20px; border-radius: 20px; display: flex; gap: 10px; align-items: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); z-index: 1000; }
.undo-toast.info { background: #2980b9; }

/* Bulk Edit Modal */
.bulk-edit-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 500; display: flex; justify-content: center; align-items: center; }
.bulk-edit-modal { background: white; padding: 2rem; border-radius: 8px; width: 400px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
.bulk-controls { display: flex; flex-direction: column; gap: 1rem; margin: 1.5rem 0; }
.bulk-field { display: flex; flex-direction: column; gap: 5px; }
.bulk-field-row { display: flex; gap: 1rem; }
.bulk-select, .bulk-input { padding: 8px; border: 1px solid #ddd; border-radius: 4px; width: 100%; box-sizing: border-box; }
.bulk-buttons { display: flex; gap: 1rem; justify-content: flex-end; }

.modal-footer { padding: 1rem; border-top: 1px solid #eee; display: flex; justify-content: flex-end; gap: 1rem; }
.primary-btn { background: #3498db; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
.secondary-btn { background: white; border: 1px solid #ddd; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
.danger-btn { background: #e74c3c; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }

/* Tabs */
.tabs { display: flex; gap: 5px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
.tab-btn { background: none; border: none; padding: 0.5rem 1rem; cursor: pointer; font-weight: 500; color: #7f8c8d; border-radius: 4px; }
.tab-btn.active { background: #e8f4f8; color: #3498db; }

.header-actions { display: flex; gap: 0.5rem; }
.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: #94a3b8; /* Slate 400 */
  transition: color 0.2s;
  padding: 0 0.5rem;
}

.close-btn:hover {
  color: #ef4444; /* Red 500 */
}
.icon-btn { background: none; border: none; font-size: 1.2rem; cursor: pointer; }
</style>
