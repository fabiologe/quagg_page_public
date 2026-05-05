<template>
  <DraggableModal :is-open="isOpen" initial-width="1100px" initial-height="85vh" initial-left="center" initial-top="50">
      <!-- Old modal-content inner structure preserved but styles adapted -->
        <div class="modal-header">
          <div class="header-left">
            <h3>Daten bearbeiten</h3>
          </div>
          
          <div class="header-actions">
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
                      <button class="bulk-btn-link text-red" @click="deleteSelected"><img class="ic-del" src="/saintv1d/icons/Interface-Essential-Scisor--Streamline-Pixel.svg" /> Löschen</button>
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
                            <label>Versiegelungsgrad (0.0 - 1.0):</label>
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
                      <input type="checkbox" :checked="node.canOverflow === false" @change="node.canOverflow = !$event.target.checked" @click.stop>
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
                    <th>Druckdicht</th>
                    <th>-</th>
                  </tr>
                </thead>
                <tbody>
                  <tr 
                    v-for="node in filteredStructures" 
                    :key="node.id"
                    class="clickable-row"
                    :class="{ 'selected': selectedIds.includes(node.id) }"
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
                      <!-- Config inputs per Type -->
                      
                      <!-- 1, 6: Pumps (Pumpwerk / Pumpe) -->
                       <div v-if="[1, 6].includes(node.type)" class="input-group-col">
                        <div class="input-group">
                             <input type="number" v-model.number="node.pumpRate" step="0.1" class="small-input" @click.stop>
                             <span class="hint-text">Förderleistung</span>
                        </div>
                        <div class="input-group">
                             <input type="number" v-model.number="node.onDepth" step="0.1" class="small-input" @click.stop>
                             <span class="hint-text">Einschalt (m)</span>
                        </div>
                         <div class="input-group">
                             <input type="number" v-model.number="node.offDepth" step="0.1" class="small-input" @click.stop>
                             <span class="hint-text">Ausschalt (m)</span>
                        </div>
                      </div>

                       <!-- 2, 3, 4, 12, 13: Storage/Basins (Becken, Klaeranlage, etc) -->
                       <div v-if="[2, 3, 4, 12, 13].includes(node.type)" class="input-group-col">
                        <div class="input-group">
                             <input type="number" v-model.number="node.volume" step="1" class="small-input" @click.stop>
                             <span class="hint-text">Volumen (m³)</span>
                        </div>
                        <div class="input-group">
                              <input type="number" v-model.number="node.maxDepth" step="0.1" class="small-input" @click.stop>
                             <span class="hint-text">Max. Tiefe</span>
                        </div>
                        <div class="input-group">
                              <input type="number" v-model.number="node.initDepth" step="0.1" class="small-input" @click.stop>
                             <span class="hint-text">Start-Tiefe</span>
                        </div>
                        <div class="input-group">
                              <select v-model="node.storageShape" class="small-select" @click.stop>
                                  <option value="FUNCTIONAL">Funktional</option>
                                  <option value="CYLINDRICAL">Zylindrisch</option>
                                  <option value="CONICAL">Konisch</option>
                                  <option value="PARABOLOID">Parabolisch</option>
                                  <option value="PYRAMIDAL">Pyramidal</option>
                              </select>
                             <span class="hint-text">Form</span>
                        </div>
                      </div>

                       <!-- 7: Weir (Überlauf) -->
                       <div v-if="node.type === 7" class="input-group-col">
                        <div class="input-group">
                             <input type="number" v-model.number="node.weirHeight" step="0.01" class="small-input" @click.stop>
                             <span class="hint-text">Wehrhöhe</span>
                        </div>
                         <div class="input-group">
                             <input type="number" v-model.number="node.weirWidth" step="0.1" class="small-input" @click.stop>
                             <span class="hint-text">Breite</span>
                        </div>
                        <div class="input-group">
                             <input type="number" v-model.number="node.dischargeCoeff" step="0.1" class="small-input" @click.stop>
                             <span class="hint-text">Beiwert</span>
                        </div>
                      </div>

                       <!-- 8: Orifice/Throttle (Drossel) -->
                       <div v-if="node.type === 8" class="input-group-col">
                        <div class="input-group">
                             <input type="number" v-model.number="node.maxOutflow" step="0.1" class="small-input" @click.stop>
                             <span class="hint-text">Max. Abfluss</span>
                        </div>
                       </div>
                       
                        <!-- 9: Gate (Schieber) -->
                       <div v-if="node.type === 9" class="input-group-col">
                         <div class="input-group">
                             <input type="number" v-model.number="node.initialOpening" step="0.1" max="1" class="small-input" @click.stop>
                             <span class="hint-text">Öffnung (0-1)</span>
                        </div>
                      </div>

                       <!-- 14: Inlet (Einlaufbauwerk) + 10, 11 Misc -->
                       <div v-if="[10, 11, 14].includes(node.type)" class="input-group">
                        <input type="number" v-model.number="node.constantInflow" step="0.1" class="small-input" @click.stop>
                        <span class="hint-text">Zufluss</span>
                      </div>

                      <!-- Type 5 (Auslaufbauwerk) Loose Check -->
                      <div v-if="node.type == 5" class="input-group-col">
                        <div class="input-group">
                             <select v-model="node.outflowType" class="small-select" @click.stop>
                                <option value="free">Freier Auslauf</option>
                                <option value="throttled">Gedrosselt</option>
                             </select>
                        </div>
                        <div class="input-group">
                             <input type="number" v-model.number="node.volume" step="1" class="small-input" @click.stop>
                             <span class="hint-text">Volumen</span>
                         </div>
                         <div class="input-group">
                             <input type="number" v-model.number="node.constantInflow" step="0.1" class="small-input" @click.stop>
                             <span class="hint-text">Zufluss</span>
                         </div>
                         <div class="input-group" v-if="node.outflowType === 'throttled'">
                             <input type="number" v-model.number="node.constantOutflow" step="0.1" class="small-input" @click.stop>
                             <span class="hint-text">Max. Abfluss</span>
                         </div>
                      </div>

                      <!-- Generic Bauwerk -->
                      <div v-if="node.type === 'Bauwerk'" class="input-group-col">
                         <div class="input-group">
                             <input type="number" v-model.number="node.volume" step="1" class="small-input" @click.stop>
                             <span class="hint-text">Volumen</span>
                         </div>
                         <div class="input-group">
                             <input type="number" v-model.number="node.constantInflow" step="0.1" class="small-input" @click.stop>
                             <span class="hint-text">Zufluss</span>
                         </div>
                         <div class="input-group">
                             <input type="number" v-model.number="node.constantOutflow" step="0.1" class="small-input" @click.stop>
                             <span class="hint-text">Abfluss</span>
                         </div>
                         <div class="input-group">
                            <label class="checkbox-label">
                                <input 
                                    type="checkbox" 
                                    :checked="node.is_sink" 
                                    @change="node.is_sink = $event.target.checked"
                                    @click.stop
                                >
                                Als Auslauf (Senke) nutzen
                            </label>
                         </div>
                      </div>
                    </td>
                    <td><input type="number" v-model.number="node.coverZ" class="small-input" @click.stop></td>
                    <td><input type="number" v-model.number="node.z" class="small-input" @click.stop></td>
                    <td class="text-center">
                      <input type="checkbox" :checked="node.canOverflow === false" @change="node.canOverflow = !$event.target.checked" @click.stop>
                    </td>
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
                      <th>Versiegelungsgrad (0-1)</th>
                      <th>Funktion (Horton)</th>
                      <th>Anschluss 1</th>
                      <th>Anschluss 2 / Split (%)</th>
                    </tr>
                  </thead>
                   <tbody>
                    <tr v-for="area in filteredAreas" :key="area.id" class="clickable-row" :class="{ 'selected': selectedIds.includes(area.id) }" >
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
          <button class="export-btn" @click="exportXlsx" title="Alle Tabs als Excel-Datei exportieren">
            ⬇ XLSX Export
          </button>
          <button class="primary-btn" @click="apply">Übernehmen</button>
        </div>
  </DraggableModal>
</template>

<script setup>
import { useIsybauStore } from '../../store/index.js';
import { ref, watch, computed } from 'vue';
import DraggableModal from '../common/DraggableModal.vue';
import { getMapping, getRoughness, getRunoffCoeff, MaterialRoughness, Bauwerkstyp, Profilart, Flaechenfunktion } from '../../utils/mappings.js';
import * as XLSX from 'xlsx';

const props = defineProps({
  isOpen: Boolean,
  network: Object,
  hydraulics: Object
});

const emit = defineEmits(['close', 'apply', 'select-element']);

// === UI State ===
const showBulkEdit = ref(false);

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


const handleTypeChange = (node, previousCategory) => {
    // Logic: If I change a Standard Node to Bauwerk, it moves to the other tab!
    // Undo required.
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
    nodes.value = Array.from(props.network.nodes.values()).map(n => {
      // Effektiven Typ auflösen: 'Schacht'→'Standard', Bauwerk mit bauwerkstyp→Integer, sonst 'Standard'
      let type;
      if (n.type === 'Schacht' || n.type === 'Standard') {
        type = 'Standard';
      } else if (n.bauwerkstyp != null) {
        type = n.bauwerkstyp; // Integer aus XML → Dropdown-Wert
      } else if (typeof n.type === 'number') {
        type = n.type;
      } else if (n.type === 'Bauwerk' || n.type === 'Anschlusspunkt') {
        type = 'Bauwerk';
      } else {
        type = 'Standard';
      }

      const bd = n.bauwerkData ?? {};
      return {
        ...n,
        type,
        constantInflow: n.constantInflow || 0,
        coverZ: n.coverZ !== undefined ? n.coverZ : (n.z + (n.depth || 0)),
        z: n.z !== undefined ? n.z : 0,
        canOverflow: n.canOverflow !== undefined ? n.canOverflow : true,
        // Bauwerk-Felder mit XML-Werten vorbelegen (User kann überschreiben)
        volume:    n.volume    || bd.volume    || 0,
        maxDepth:  n.maxDepth  || bd.maxDepth  || 0,
        // Pumpe
        pumpRate:  n.pumpRate  || (bd.pumpPower && bd.pumpHead
                    ? parseFloat(((bd.pumpPower * 1000 * 0.7) / (1000 * 9.81 * bd.pumpHead) * 1000).toFixed(1))
                    : 0),
        onDepth:   n.onDepth   || 0,
        offDepth:  n.offDepth  || 0,
        // Wehr
        wehrHeight:     n.wehrHeight     || (bd.wehrSchwelle != null ? Math.max(0, bd.wehrSchwelle - n.z) : 0),
        wehrWidth:      n.wehrWidth      || bd.wehrLaenge || 0,
        dischargeCoeff: n.dischargeCoeff || 0,
        // Drossel
        maxOutflow: n.maxOutflow || bd.nennleistung || 0,
        // Schieber
        initialOpening: n.initialOpening ?? 1.0,
      };
    });

    // Init Edges
    edges.value = Array.from(props.network.edges.values()).map(e => {
      let material = e.material;
      let roughness = e.roughness;

      // Ensure we display Strickler (Kst) in UI
      // If roughness is provided but looks like Manning (<= 1.0), convert to Strickler
      if (roughness && roughness <= 1.0 && roughness > 0) {
          roughness = parseFloat((1.0 / roughness).toFixed(1)); 
      }
      
      // Fallback defaults
      if (e.profile.type === 8 && !material) { material = 'Erde'; roughness = 25; }
      if (!roughness || roughness <= 0) roughness = getRoughness(material);
      
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


const updateRoughness = (edge) => { edge.roughness = getRoughness(edge.material); };
const onProfileChange = (edge) => {
    if (edge.profile.type === 8) { edge.material = 'Erde'; edge.roughness = 25; }
    // Add default dims based on profile?
};
const calculateSlope = (edge) => {
     if (!edge.length) return 0;
     return (((edge.z1 - edge.z2) / edge.length) * 100).toFixed(2);
};

const exportXlsx = () => {
    const wb = XLSX.utils.book_new();

    // --- Schächte ---
    const nodeHeaders = ['ID', 'Typ', 'Zufluss (l/s)', 'Deckel (m)', 'Sohle (m)', 'Tiefe (m)', 'Druckdicht', 'Status'];
    const nodeRows = nodes.value
        .filter(n => n.type === 'Standard')
        .map(n => [
            n.id,
            n.type,
            n.constantInflow ?? 0,
            n.coverZ ?? '',
            n.z ?? '',
            n.depth ?? '',
            n.canOverflow === false ? 'Ja' : 'Nein',
            n.status ?? 0
        ]);
    const wsNodes = XLSX.utils.aoa_to_sheet([nodeHeaders, ...nodeRows]);
    XLSX.utils.book_append_sheet(wb, wsNodes, 'Schächte');

    // --- Bauwerke ---
    const structHeaders = ['ID', 'Typ', 'Deckel (m)', 'Sohle (m)', 'Druckdicht', 'Volumen (m³)', 'Max. Tiefe (m)', 'Zufluss (l/s)', 'Wehrhöhe (m)', 'Max. Abfluss (l/s)'];
    const structRows = nodes.value
        .filter(n => n.type !== 'Standard')
        .map(n => [
            n.id,
            typeof n.type === 'number' ? (Bauwerkstyp[n.type] ?? n.type) : n.type,
            n.coverZ ?? '',
            n.z ?? '',
            n.canOverflow === false ? 'Ja' : 'Nein',
            n.volume ?? '',
            n.maxDepth ?? '',
            n.constantInflow ?? '',
            n.weirHeight ?? '',
            n.maxOutflow ?? ''
        ]);
    const wsStructures = XLSX.utils.aoa_to_sheet([structHeaders, ...structRows]);
    XLSX.utils.book_append_sheet(wb, wsStructures, 'Bauwerke');

    // --- Haltungen ---
    const edgeHeaders = ['ID', 'Von', 'Nach', 'Material', 'Rauheit (kSt)', 'Profil', 'Länge (m)', 'Neigung (%)', 'Höhe (mm)', 'Breite (mm)', 'Z1 (m)', 'Z2 (m)'];
    const edgeRows = edges.value.map(e => [
        e.id,
        e.from ?? e.fromNodeId ?? '',
        e.to ?? e.toNodeId ?? '',
        e.material ?? '',
        e.roughness ?? '',
        e.profile ? (Profilart[e.profile.type] ?? e.profile.type) : '',
        e.length != null ? parseFloat(e.length.toFixed(2)) : '',
        e.length > 0 ? parseFloat(((e.z1 - e.z2) / e.length * 100).toFixed(2)) : '',
        e.profile?.height ?? '',
        e.profile?.width ?? '',
        e.z1 ?? '',
        e.z2 ?? ''
    ]);
    const wsEdges = XLSX.utils.aoa_to_sheet([edgeHeaders, ...edgeRows]);
    XLSX.utils.book_append_sheet(wb, wsEdges, 'Haltungen');

    // --- Flächen ---
    const areaHeaders = ['ID', 'Fläche (ha)', 'Versiegelungsgrad', 'Funktion', 'Anschluss 1', 'Anschluss 2', 'Split (%)'];
    const areaRows = areas.value.map(a => [
        a.id,
        a.size != null ? parseFloat(a.size.toFixed(4)) : '',
        a.runoffCoeff ?? '',
        a.function != null ? (Flaechenfunktion[a.function] ?? a.function) : '',
        a.nodeId ?? '',
        a.nodeId2 ?? '',
        a.nodeId2 ? (a.splitRatio ?? 50) : ''
    ]);
    const wsAreas = XLSX.utils.aoa_to_sheet([areaHeaders, ...areaRows]);
    XLSX.utils.book_append_sheet(wb, wsAreas, 'Flächen');

    // Auto column widths
    [wsNodes, wsStructures, wsEdges, wsAreas].forEach(ws => {
        const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
        const colWidths = [];
        for (let C = range.s.c; C <= range.e.c; C++) {
            let maxLen = 10;
            for (let R = range.s.r; R <= range.e.r; R++) {
                const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
                if (cell && cell.v != null) maxLen = Math.max(maxLen, String(cell.v).length + 2);
            }
            colWidths.push({ wch: Math.min(maxLen, 40) });
        }
        ws['!cols'] = colWidths;
    });

    const filename = `saintv1d_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
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
.modal-header { padding: 0.65rem 1rem; border-bottom: 2px solid #594491; background: #040647; display: flex; justify-content: space-between; align-items: center; cursor: move; }
.header-left { display: flex; gap: 1rem; align-items: center; }
.bulk-btns { display: flex; gap: 0.5rem; }
.bulk-btn-link { background: none; border: none; font-size: 0.9rem; color: #594491; cursor: pointer; text-decoration: underline; padding: 0 5px; }
.bulk-btn-link.text-red { color: #e74c3c; }
.ic-del { width: 13px; height: 13px; image-rendering: pixelated; filter: invert(35%) sepia(90%) saturate(700%) hue-rotate(330deg) brightness(90%); vertical-align: middle; }

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
.data-table th { background: #f3f2fb; position: sticky; top: 0; z-index: 10; padding: 0.5rem; border-bottom: 2px solid #ddd; text-align: left; }
.data-table td { padding: 0.5rem; border-bottom: 1px solid #aeadd2; background: white; }

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
.small-input { width: 70px; padding: 4px; border: 1px solid #aeadd2; border-radius: 4px; }
.medium-input { width: 100px; padding: 4px; border: 1px solid #aeadd2; border-radius: 4px; }
.medium-select { width: 150px; padding: 4px; border: 1px solid #aeadd2; border-radius: 4px; }
.split-cell { display: flex; gap: 5px; align-items: center; }
.filter-input { width: 100%; padding: 4px; border: 1px solid #aeadd2; border-radius: 4px; font-size: 0.8rem; }
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
.bulk-select, .bulk-input { padding: 8px; border: 1px solid #aeadd2; border-radius: 4px; width: 100%; box-sizing: border-box; }
.bulk-buttons { display: flex; gap: 1rem; justify-content: flex-end; }

.modal-footer { padding: 1rem; border-top: 1px solid #eee; display: flex; justify-content: flex-end; gap: 1rem; align-items: center; }
.export-btn { background: white; border: 1px solid #27ae60; color: #27ae60; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; font-weight: 500; transition: background 0.15s, color 0.15s; }
.export-btn:hover { background: #27ae60; color: white; }
.primary-btn { background: #040647; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
.secondary-btn { background: white; border: 1px solid #aeadd2; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
.danger-btn { background: #e74c3c; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }

/* Tabs */
.tabs { display: flex; gap: 5px; border-bottom: 2px solid #594491; padding-bottom: 5px; background: #040647; padding: 0.4rem 0.75rem; }
.tab-btn { background: transparent; border: 1px solid #594491; padding: 0.35rem 0.75rem; cursor: pointer; font-family: 'Press Start 2P', monospace; font-size: 0.48rem; color: #aeadd2; border-radius: 5px; letter-spacing: 0.05em; }
.tab-btn.active { background: #594491; color: #fff; border-color: #8f8be1; }

.header-actions { display: flex; gap: 0.5rem; }
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
.icon-btn { background: none; border: none; font-size: 1.2rem; cursor: pointer; }

.modal-header h3 {
  font-family: 'Press Start 2P', monospace;
  font-size: 0.6rem;
  color: #2ecc71;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0;
}

.primary-btn {
  background: #040647 !important;
  color: #fff !important;
  border: none !important;
  border-radius: 6px !important;
  font-weight: 700 !important;
  transition: background 0.15s;
}
.primary-btn:hover { background: #594491 !important; }

.secondary-btn {
  background: #fff !important;
  border: 1px solid #aeadd2 !important;
  color: #040647 !important;
  border-radius: 6px !important;
  font-weight: 600 !important;
}
.secondary-btn:hover { background: #f3f2fb !important; }
</style>
