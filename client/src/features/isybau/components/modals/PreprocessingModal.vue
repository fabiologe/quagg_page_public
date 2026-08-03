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
                  <button v-if="undoState.action" @click="performUndo" class="undo-action-btn">Rückgängig</button>
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
                <div class="bulk-edit-header">
                    <h4>Massenbearbeitung ({{ selectedIds.length }} Elemente)</h4>
                    <button class="close-btn" @click="showBulkEdit = false">×</button>
                </div>

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

                        <!-- Dynamic Node Fields: sichtbar, wenn der gewählte Ziel-Typ ODER
                             mind. eine bereits selektierte Zeile den passenden Bestandstyp hat
                             (sonst war Wehrhöhe/Förderleistung nur bei einem gleichzeitigen
                             Typwechsel bearbeitbar — im Regelfall verdeckt). -->
                        <div class="bulk-field" v-if="parseInt(bulkForm.nodeType) === 7 || selectedTypes.has(7)">
                            <label>Wehrhöhe (m):</label>
                            <input type="number" v-model.number="bulkForm.weirHeight" step="0.01" class="bulk-input">
                        </div>
                         <div class="bulk-field" v-if="[1, 6].includes(parseInt(bulkForm.nodeType)) || selectedTypes.has(1) || selectedTypes.has(6)">
                            <label>Förderleistung (l/s):</label>
                            <input type="number" v-model.number="bulkForm.pumpRate" step="0.1" placeholder="Unverändert" class="bulk-input">
                        </div>

                        <div class="bulk-divider"></div>

                        <div class="bulk-field">
                            <label>Deckel druckdicht:</label>
                            <select v-model="bulkForm.canOverflow" class="bulk-select">
                                <option :value="null">- Unverändert -</option>
                                <option :value="false">Ja – druckdicht (kein Überlauf)</option>
                                <option :value="true">Nein – überlauffähig</option>
                            </select>
                            <span class="bulk-hint" v-if="bulkForm.canOverflow !== null">
                                {{ bulkForm.canOverflow === false ? '🔒 Deckel wird auf druckdicht gesetzt' : '🔓 Deckel wird auf überlauffähig gesetzt' }}
                            </span>
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
                    <th>Tiefe (m)</th>
                    <th>Sohle (m)</th>
                    <th>Druckdicht</th>
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
                    :data-row-id="node.id"
                    class="clickable-row"
                    :class="{ 'selected': selectedIds.includes(node.id) }"
                                  >
                    <td class="col-checkbox sticky-left-1" @click.stop>
                        <input type="checkbox" :value="node.id" v-model="selectedIds">
                    </td>
                    <td class="col-id sticky-left-2">
                        <div class="id-cell">
                            {{ node.id }}
                            <button class="locate-btn" @click.stop="locate(node.id)" title="Auf Karte zeigen">
                                <img src="/saintv1d/icons/Interface-Essential-Map--Streamline-Pixel.svg" alt="Karte" class="locate-icon" />
                            </button>
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
                      <input type="number" v-model.number="node.coverZ" step="0.01" class="small-input" @click.stop @change="onCoverZChange(node)" :class="{ 'invalid': node.coverZ <= node.z }" title="Sohle muss tiefer als Deckel liegen">
                    </td>
                    <td>
                      <input type="number" v-model.number="node.depth" step="0.01" class="small-input" @click.stop @change="onDepthChange(node)">
                    </td>
                    <td>
                      <input type="number" v-model.number="node.z" step="0.01" class="small-input" @click.stop @change="onZChange(node)" :class="{ 'invalid': node.z >= node.coverZ }" title="Sohle muss tiefer als Deckel liegen">
                    </td>
                    <td class="text-center">
                      <input type="checkbox" :checked="node.canOverflow === false" @change="node.canOverflow = !$event.target.checked" @click.stop>
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
                    <th>Validierung</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="node in filteredStructures"
                    :key="node.id"
                    :data-row-id="node.id"
                    class="clickable-row"
                    :class="{ 'selected': selectedIds.includes(node.id) }"
                                  >
                    <td class="col-checkbox sticky-left-1" @click.stop>
                        <input type="checkbox" :value="node.id" v-model="selectedIds">
                    </td>
                    <td class="col-id sticky-left-2">
                        <div class="id-cell">
                            {{ node.id }}
                            <button class="locate-btn" @click.stop="locate(node.id)" title="Auf Karte zeigen"><img src="/saintv1d/icons/Interface-Essential-Map--Streamline-Pixel.svg" alt="Karte" class="locate-icon" /></button>
                        </div>
                    </td>
                    <td>
                      <select v-model="node.type" class="small-select" @click.stop @change="handleTypeChange(node, 'Bauwerk')">
                        <option value="Standard">Schacht</option>
                        <option value="Bauwerk">Bauwerk (Allgemein)</option>
                        <option v-for="(label, key) in Bauwerkstyp" :key="key" :value="parseInt(key)">
                          {{ label }}
                        </option>
                        <option value="Divider">Verteiler (Divider)</option>
                      </select>
                      <span class="classify-badge" :title="classificationTitle(node)">
                          → {{ classifyPreview(node).linkSection || classifyPreview(node).section }}
                      </span>
                    </td>
                    <td>
                      <!-- Config inputs per Type -->
                      
                      <!-- 1, 6: Pumps (Pumpwerk / Pumpe) -->
                       <div v-if="[1, 6].includes(node.type)" class="input-group-col">
                        <div class="input-group">
                             <input type="number" v-model.number="node.pumpRate" step="0.1" class="small-input" @click.stop>
                             <span class="hint-text">Förderleistung (l/s)</span>
                        </div>
                        <div class="input-group">
                             <input type="number" v-model.number="node.pumpHead" step="0.1" class="small-input" @click.stop title="Förderhöhe für die Q-H-Kennlinie">
                             <span class="hint-text">Förderhöhe (m)</span>
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
                             <span class="hint-text">Max. Tiefe (m)</span>
                        </div>
                        <div class="input-group">
                              <input type="number" v-model.number="node.initDepth" step="0.1" class="small-input" @click.stop>
                             <span class="hint-text">Start-Tiefe (m)</span>
                        </div>
                        <div class="input-group">
                              <select v-model="node.storageShape" class="small-select" @click.stop
                                      title="Flächenverlauf über die Tiefe — Gesamtvolumen bleibt erhalten">
                                  <option value="PRISMATIC">Prismatisch (konstante Fläche)</option>
                                  <option value="CONICAL">Trichterförmig (linear)</option>
                                  <option value="PYRAMIDAL">Pyramidal (quadratisch)</option>
                                  <option value="TABULAR">Tabellarisch (Tiefe/Fläche-Kurve)</option>
                              </select>
                             <span class="hint-text">Form</span>
                        </div>
                        <div class="input-group">
                             <input type="number" v-model.number="node.evapFactor" step="0.05" min="0" max="1" class="small-input" @click.stop title="Anteil der potentiellen Verdunstung, der auf die Speicherfläche angesetzt wird">
                             <span class="hint-text">Verdunstung (0-1)</span>
                        </div>
                        <div v-if="node.storageShape === 'TABULAR'" class="input-group-col">
                             <span class="hint-text">Tiefe/Fläche-Stützstellen</span>
                             <CurveTableEditor
                                 v-model:points="node.storageCurve"
                                 x-key="depth" y-key="area"
                                 x-label="Tiefe (m)" y-label="Fläche (m²)"
                             />
                        </div>
                      </div>

                       <!-- 7: Weir (Überlauf) -->
                       <div v-if="node.type === 7" class="input-group-col">
                        <div class="input-group">
                             <input type="number" v-model.number="node.weirHeight" step="0.01" class="small-input" @click.stop>
                             <span class="hint-text">Wehrhöhe (m)</span>
                        </div>
                         <div class="input-group">
                             <input type="number" v-model.number="node.wehrWidth" step="0.01" class="small-input" @click.stop>
                             <span class="hint-text">Breite (m)</span>
                        </div>
                        <div class="input-group">
                              <select v-model="node.weirType" class="small-select" @click.stop title="Wehrform (Kammer-Geometrie)">
                                  <option value="TRANSVERSE">Frontal (Transverse)</option>
                                  <option value="SIDEFLOW">Seitlich (Sideflow)</option>
                                  <option value="V-NOTCH">Dreiecksüberfall (V-Notch)</option>
                              </select>
                             <span class="hint-text">Wehrform</span>
                        </div>
                        <div class="input-group">
                            <label class="checkbox-label">
                                <input type="checkbox" v-model="node.gated" @click.stop>
                                Rückschlagklappe
                            </label>
                        </div>
                        <div class="input-group" style="grid-column: span 2;">
                             <select class="weir-preset-select" :value="presetKeyFor(node.dischargeCoeff)" @change="node.dischargeCoeff = parseFloat($event.target.value)" @click.stop title="Überfallbeiwert μ → Cw = (2/3)·μ·√(2g)">
                                 <option value="">— Kronenform wählen —</option>
                                 <option v-for="p in weirPresets" :key="p.cw" :value="p.cw">{{ p.label }}</option>
                             </select>
                             <span class="hint-text">Kronenform</span>
                        </div>
                        <div class="input-group">
                             <input type="number" v-model.number="node.dischargeCoeff" step="0.01" class="small-input" @click.stop>
                             <span class="hint-text">Beiwert Cw</span>
                        </div>
                      </div>

                       <!-- 8: Orifice/Throttle (Drossel) -->
                       <div v-if="node.type === 8" class="input-group-col">
                        <div class="input-group">
                             <input type="number" v-model.number="node.maxOutflow" step="0.1" class="small-input" @click.stop>
                             <span class="hint-text">Max. Abfluss (l/s)</span>
                        </div>
                        <div class="input-group">
                              <select v-model="node.orificeType" class="small-select" @click.stop title="Lage der Öffnung im Schacht">
                                  <option value="BOTTOM">Sohle (Bottom)</option>
                                  <option value="SIDE">Seitlich (Side)</option>
                              </select>
                             <span class="hint-text">Lage</span>
                        </div>
                        <div class="input-group">
                            <label class="checkbox-label">
                                <input type="checkbox" v-model="node.gated" @click.stop>
                                Rückschlagklappe
                            </label>
                        </div>
                       </div>

                        <!-- 9: Gate (Schieber) -->
                       <div v-if="node.type === 9" class="input-group-col">
                         <div class="input-group">
                             <input type="number" v-model.number="node.initialOpening" step="0.1" max="1" class="small-input" @click.stop>
                             <span class="hint-text">Öffnung (0-1)</span>
                        </div>
                         <div class="input-group">
                             <input type="number" v-model.number="node.gateWidth" step="0.05" class="small-input" @click.stop>
                             <span class="hint-text">Schieberbreite (m)</span>
                        </div>
                        <div class="input-group">
                              <select v-model="node.orificeType" class="small-select" @click.stop title="Lage der Öffnung im Schacht">
                                  <option value="BOTTOM">Sohle (Bottom)</option>
                                  <option value="SIDE">Seitlich (Side)</option>
                              </select>
                             <span class="hint-text">Lage</span>
                        </div>
                        <div class="input-group">
                            <label class="checkbox-label">
                                <input type="checkbox" v-model="node.gated" @click.stop>
                                Rückschlagklappe
                            </label>
                        </div>
                      </div>

                       <!-- 14: Inlet (Einlaufbauwerk) + 10, 11 Misc -->
                       <div v-if="[10, 11, 14].includes(node.type)" class="input-group-col">
                        <div class="input-group">
                          <input type="number" v-model.number="node.constantInflow" step="0.1" class="small-input" @click.stop>
                          <span class="hint-text">Zufluss (l/s)</span>
                        </div>
                        <div class="input-group">
                          <input type="number" v-model.number="node.lossCoeff" step="0.1" min="0" class="small-input" @click.stop :title="lossCoeffHint(node.type)">
                          <span class="hint-text">Verlustbeiwert (Eintritt)</span>
                        </div>
                      </div>

                      <!-- Divider: Verteiler -->
                      <div v-if="node.type === 'Divider'" class="input-group-col">
                        <div class="input-group">
                          <select
                            :value="effectiveDividerLinkId(node)"
                            @change="node.dividerLinkId = $event.target.value"
                            class="small-select" @click.stop
                            title="Welche ausgehende Haltung wird abgezweigt? Vorbelegt nach höherer Sohlhöhe (Überlauf liegt konventionell höher als die Hauptleitung)"
                          >
                            <option value="">— wählen —</option>
                            <option v-for="e in dividerOutgoingEdges(node)" :key="e.id" :value="e.id">{{ e.id }}</option>
                          </select>
                          <span class="hint-text">Abgezweigte Haltung</span>
                        </div>
                        <div class="input-group">
                          <select v-model="node.dividerType" class="small-select" @click.stop>
                            <option value="OVERFLOW">Überlauf (Overflow)</option>
                            <option value="CUTOFF">Abflussgrenze (Cutoff)</option>
                          </select>
                          <span class="hint-text">Divider-Typ</span>
                        </div>
                        <div class="input-group" v-if="node.dividerType === 'CUTOFF'">
                          <input type="number" v-model.number="node.dividerCutoffFlow" step="0.1" min="0" class="small-input" @click.stop>
                          <span class="hint-text">Abflussgrenze (l/s)</span>
                        </div>
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
                             <span class="hint-text">Volumen (m³)</span>
                         </div>
                         <div class="input-group">
                             <input type="number" v-model.number="node.constantInflow" step="0.1" class="small-input" @click.stop>
                             <span class="hint-text">Zufluss (l/s)</span>
                         </div>
                         <div class="input-group" v-if="node.outflowType === 'throttled'">
                             <input type="number" v-model.number="node.constantOutflow" step="0.1" class="small-input" @click.stop>
                             <span class="hint-text">Max. Abfluss (l/s)</span>
                         </div>
                      </div>

                      <!-- Generic Bauwerk -->
                      <div v-if="node.type === 'Bauwerk'" class="input-group-col">
                         <div class="input-group">
                             <input type="number" v-model.number="node.volume" step="1" class="small-input" @click.stop>
                             <span class="hint-text">Volumen (m³)</span>
                         </div>
                         <div class="input-group">
                             <input type="number" v-model.number="node.constantInflow" step="0.1" class="small-input" @click.stop>
                             <span class="hint-text">Zufluss (l/s)</span>
                         </div>
                         <div class="input-group">
                             <input type="number" v-model.number="node.constantOutflow" step="0.1" class="small-input" @click.stop>
                             <span class="hint-text">Abfluss (l/s)</span>
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
                    <td><input type="number" v-model.number="node.coverZ" step="0.01" class="small-input" @click.stop @change="onCoverZChange(node)" :class="{ 'invalid': node.coverZ <= node.z }"></td>
                    <td><input type="number" v-model.number="node.z" step="0.01" class="small-input" @click.stop @change="onZChange(node)" :class="{ 'invalid': node.z >= node.coverZ }"></td>
                    <td class="text-center">
                      <input type="checkbox" :checked="node.canOverflow === false" @change="node.canOverflow = !$event.target.checked" @click.stop>
                    </td>
                    <td>
                        <span v-for="msg in structureWarnings(node)" :key="msg" class="error-badge" style="display:block; margin-bottom:2px;">{{ msg }}</span>
                    </td>
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
                    <th title="Tiefe des Rohranschlusses unter Deckel (Von-Knoten)">T1 (m)</th>
                    <th title="Tiefe des Rohranschlusses unter Deckel (Nach-Knoten)">T2 (m)</th>
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
                      <th></th>
                      <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="edge in filteredEdges"
                    :key="edge.id"
                    :data-row-id="edge.id"
                    class="clickable-row"
                    :class="{ 'selected': selectedIds.includes(edge.id) }"
                                  >
                   <td class="col-checkbox sticky-left-1" @click.stop>
                        <input type="checkbox" :value="edge.id" v-model="selectedIds">
                    </td>
                    <td class="col-id sticky-left-2">
                        <div class="id-cell">
                            {{ edge.id }}
                            <button class="locate-btn" @click.stop="locate(edge.id)" title="Auf Karte zeigen"><img src="/saintv1d/icons/Interface-Essential-Map--Streamline-Pixel.svg" alt="Karte" class="locate-icon" /></button>
                        </div>
                    </td>
                    <td class="small-text">{{ edge.fromNodeId }} -> {{ edge.toNodeId }}</td>
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
                    <td class="small-text" :title="`Deckel ${edge.fromNodeId}: ${nodeCoverZ(edge.fromNodeId)?.toFixed(2) ?? '-'} m`">{{ depthBelowCover(edge.fromNodeId, edge.z1)?.toFixed(2) ?? '-' }}</td>
                    <td class="small-text" :title="`Deckel ${edge.toNodeId}: ${nodeCoverZ(edge.toNodeId)?.toFixed(2) ?? '-'} m`">{{ depthBelowCover(edge.toNodeId, edge.z2)?.toFixed(2) ?? '-' }}</td>
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
                      <th>Neigungsklasse</th>
                      <th>Anschluss 1</th>
                      <th>Anschluss 2 / Split (%)</th>
                      <th>Schmutzfracht</th>
                    </tr>
                  </thead>
                   <tbody>
                    <tr v-for="area in filteredAreas" :key="area.id" :data-row-id="area.id" class="clickable-row" :class="{ 'selected': selectedIds.includes(area.id) }" >
                        <td class="col-checkbox sticky-left-1" @click.stop>
                            <input type="checkbox" :value="area.id" v-model="selectedIds">
                        </td>
                        <td class="col-id sticky-left-2">
                            <div class="id-cell">
                                {{ area.id }}
                                <button class="locate-btn" @click.stop="locate(area.id)" title="Auf Karte zeigen"><img src="/saintv1d/icons/Interface-Essential-Map--Streamline-Pixel.svg" alt="Karte" class="locate-icon" /></button>
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
                        <td>
                             <div class="split-cell">
                                <select v-model.number="area.slope" class="medium-select" @click.stop>
                                    <option :value="null" disabled>– wählen –</option>
                                    <option v-for="(label, key) in Neigungsklasse" :key="key" :value="parseInt(key)">
                                        {{ key }} - {{ label }}
                                    </option>
                                </select>
                                <button type="button" class="pick-btn" @click.stop="suggestSlope(area)" :disabled="!store.terrain" :title="store.terrain ? 'Neigung aus DGM ermitteln' : 'Kein DGM geladen'">
                                    <img src="/saintv1d/icons/Health-Brain-1--Streamline-Pixel.svg" alt="Neigung ermitteln" class="pick-icon" />
                                </button>
                             </div>
                        </td>
                        <td>
                            <div class="split-cell">
                                <input type="text" v-model="area.nodeId" class="medium-input" placeholder="Knoten 1" @click.stop>
                                <button type="button" class="pick-btn" @click.stop="pickNodeInto(area, 'nodeId')" title="Knoten im Viewer wählen">
                                    <img src="/saintv1d/icons/Interface-Essential-Cursor-Click-Point--Streamline-Pixel.svg" alt="Wählen" class="pick-icon" />
                                </button>
                            </div>
                        </td>
                        <td>
                             <div class="split-cell">
                                <input type="text" v-model="area.nodeId2" placeholder="Knoten 2" class="medium-input" @click.stop>
                                <button type="button" class="pick-btn" @click.stop="pickNodeInto(area, 'nodeId2')" title="Knoten im Viewer wählen">
                                    <img src="/saintv1d/icons/Interface-Essential-Cursor-Click-Point--Streamline-Pixel.svg" alt="Wählen" class="pick-icon" />
                                </button>
                                <input type="number" v-model.number="area.splitRatio" placeholder="%" class="small-input" v-if="area.nodeId2" @click.stop  title="Anteil zu Knoten 1 (%)">
                             </div>
                        </td>
                        <td>
                            <button type="button" class="sf-btn" @click.stop="schmutzfrachtTarget = area; showSchmutzfrachtDialog = true"
                                    :title="area.schmutzfracht ? 'Schmutzfracht-Daten bearbeiten' : 'Schmutzfracht-Daten hinzufügen'">
                                {{ area.schmutzfracht ? '✓' : '+' }}
                            </button>
                        </td>
                    </tr>
                   </tbody>
                 </table>
            </div>
          </div>
        </div>

        <SchmutzfrachtDialog
            :is-open="showSchmutzfrachtDialog"
            :model-value="schmutzfrachtTarget?.schmutzfracht"
            :area-size="schmutzfrachtTarget?.size ?? 0"
            @close="showSchmutzfrachtDialog = false"
            @update:modelValue="v => { if (schmutzfrachtTarget) schmutzfrachtTarget.schmutzfracht = v; }"
        />

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
import { ref, watch, computed, nextTick } from 'vue';
import DraggableModal from '../common/DraggableModal.vue';
import CurveTableEditor from '../common/CurveTableEditor.vue';
import SchmutzfrachtDialog from '../common/SchmutzfrachtDialog.vue';
import { getMapping, getRoughness, getRunoffCoeff, MaterialRoughness, Bauwerkstyp, Profilart, Flaechenfunktion, Neigungsklasse, classifyPreview, WeirCrestPresets, lossCoeffHint, LossCoeffDefaults } from '../../utils/mappings.js';
import { checkPumpDepths, checkPumpHead, checkNodeInitDepth, checkStorageCurveSequence, checkStorageCurveHasEnoughPoints } from '../../utils/preSolveValidation.js';
import { depthFromCoverAndZ, coverZFromZAndDepth } from '../../utils/heightCoupling.js';
import { suggestSlopeClassFromTerrain } from '../../utils/slopeSuggestion.js';
import * as XLSX from 'xlsx';

const props = defineProps({
  isOpen: Boolean,
  network: Object,
  hydraulics: Object
});

const emit = defineEmits(['close', 'apply', 'select-element']);

const store = useIsybauStore();

// === UI State ===
const showBulkEdit = ref(false);
const schmutzfrachtTarget = ref(null);
const showSchmutzfrachtDialog = ref(false);

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
// Vorgemerkte Löschungen (werden erst mit "Übernehmen" wirksam)
const deletedIds = ref({ nodes: [], edges: [] });

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

// Welche Bauwerkstypen sind unter den aktuell selektierten Zeilen? Steuert die
// Bulk-Edit-Sichtbarkeit (Wehrhöhe/Förderleistung sollen bearbeitbar sein, wenn
// mind. eine ausgewählte Zeile bereits vom passenden Typ ist — nicht nur, wenn
// man gleichzeitig den Typ ändert).
const selectedTypes = computed(() => new Set(
    nodes.value.filter(n => selectedIds.value.includes(n.id)).map(n => n.type)
));

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

// Wehr-Kronenform-Presets: siehe utils/mappings.js (WeirCrestPresets) — gemeinsam
// mit ElementInfo.vue genutzt. presetKeyFor() erlaubt ein v-model-artiges
// Verhalten (Auswahl bleibt nach Neu-Öffnen des Modals sichtbar).
const weirPresets = WeirCrestPresets;
const presetKeyFor = (cw) => {
    const match = weirPresets.find(p => Math.abs(p.cw - cw) < 0.005);
    return match ? match.cw : '';
};

// === Klassifizierungs-Vorschau (welche SWMM-Sektion bekommt dieser Knoten?) ===
// Zeigt bei Pumpe/Wehr/Drossel/Schieber die KONKRET betroffene Haltungs-ID (die
// erste ausgehende, siehe SwmmBuilder.addLinks()) — macht die Node↔Haltung-
// Kopplung beim Typ-Wechsel Schacht→Pumpe sofort sichtbar, ohne zu simulieren.
const classificationTitle = (node) => {
    const { section, linkSection } = classifyPreview(node);
    if (!linkSection) return `Knoten → ${section}`;
    const outgoing = edges.value.filter(e => e.fromNodeId === node.id);
    if (outgoing.length === 0) return `Knoten → ${section}, ausgehende Haltung → ${linkSection} (fehlt!)`;
    const extra = outgoing.length > 1 ? ` (+${outgoing.length - 1} weitere bleiben Kanal)` : '';
    return `Knoten → ${section}, Haltung ${outgoing[0].id} → ${linkSection}${extra}`;
};

// === Flow-Divider: welche Haltung wird abgezweigt? ===
// Auto-Vorschlag nur bei genau 2 Kandidaten eindeutig (Konvention: Überlauf-/
// Nebenleitung liegt höher als die Hauptleitung) — Dropdown bleibt änderbar,
// SwmmBuilder.addDividers() wendet dieselbe Fallback-Logik nochmal an, falls der
// Nutzer die Auswahl nie geöffnet hat.
const dividerOutgoingEdges = (node) => edges.value.filter(e => e.fromNodeId === node.id);
const autoDividerLinkId = (node) => {
    const outgoing = dividerOutgoingEdges(node);
    if (outgoing.length !== 2) return null;
    const z1 = (e) => e.z1 ?? node.z ?? 0;
    return z1(outgoing[0]) >= z1(outgoing[1]) ? outgoing[0].id : outgoing[1].id;
};
const effectiveDividerLinkId = (node) => {
    const outgoing = dividerOutgoingEdges(node);
    if (node.dividerLinkId && outgoing.some(e => e.id === node.dividerLinkId)) return node.dividerLinkId;
    return autoDividerLinkId(node) ?? '';
};

// === Proaktive Validierung für die Bauwerke-Tabelle (analog zur Schächte-Tab-Badge) ===
const structureWarnings = (node) => {
    const warnings = [];
    if (node.z >= node.coverZ) warnings.push('Sohle >= Deckel');

    if (node.type === 7 && !(node.weirHeight > 0)) warnings.push('Wehrhöhe fehlt');
    if ([1, 6].includes(node.type) && !(node.pumpRate > 0)) warnings.push('Förderleistung fehlt');
    if ([2, 3, 4, 12, 13].includes(node.type) && !(node.volume > 0)) warnings.push('Volumen fehlt');
    if (node.type === 8 && !(node.maxOutflow > 0)) warnings.push('Max. Abfluss fehlt');

    // Harte Solver-Abbrüche (ERR_122/138/171) vorab erkennen — dieselben
    // Prüf-Funktionen wie die Vorab-Validierung vor dem Simulationsstart
    // (siehe utils/preSolveValidation.js), damit Badge und Startsperre nicht
    // auseinanderlaufen können.
    [checkPumpDepths, checkPumpHead, checkNodeInitDepth, checkStorageCurveSequence, checkStorageCurveHasEnoughPoints].forEach(check => {
        const finding = check(node);
        if (finding) warnings.push(finding.message);
    });

    const outgoingEdges = edges.value.filter(e => e.fromNodeId === node.id);
    if ([1, 6, 7, 8, 9].includes(node.type) && outgoingEdges.length === 0) {
        warnings.push('Kein Zielknoten (fehlende Haltung)');
    }
    // Pumpe/Wehr/Drossel/Schieber: nur die ERSTE ausgehende Haltung wird zum
    // Sonderlink (siehe SwmmBuilder.addLinks()) — ein Knoten mit Verzweigung, der
    // per Typ-Dropdown zu Pumpe/Wehr/etc. gewechselt wird, würde sonst überraschend
    // nur eine von mehreren Haltungen hydraulisch wirksam übersetzen.
    if ([6, 7, 8, 9].includes(node.type) && outgoingEdges.length > 1) {
        warnings.push('Mehrere ausgehende Haltungen (nur eine wird zum Sonderlink)');
    }
    if (node.type === 'Divider') {
        if (outgoingEdges.length < 2) {
            warnings.push('Verteiler braucht ≥2 ausgehende Haltungen');
        } else if (!effectiveDividerLinkId(node)) {
            warnings.push('Abgezweigte Haltung fehlt');
        }
    }
    return warnings;
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

    // Rechen/Sieb/Einlaufbauwerk: Verlustbeiwert startet sonst bei 0 (= kein
    // [LOSSES]-Eintrag, Nutzer weiß oft nicht welcher Wert plausibel ist) —
    // sinnvollen Richtwert vorbelegen, überschreibt keinen bereits gesetzten Wert.
    if (!node.lossCoeff && LossCoeffDefaults[newType] != null) {
        node.lossCoeff = LossCoeffDefaults[newType];
    }
};

// Knoten im Viewer wählen statt Text-ID eintippen — setzt den Editor kurz in
// einen Pick-Modus (store.editor.mode='pickNodeRef'), der nächste Knoten-Klick
// im Viewer schreibt seine ID zurück in area[field]. Der Nutzer kann das
// Modal (DraggableModal, kein Klick-Backdrop) einfach zur Seite ziehen, um an
// den Viewer zu kommen.
const pickNodeInto = (area, field) => {
    store.startPickRef('node', (id) => { area[field] = id; });
};

// Neigungsklasse aus dem geladenen DGM vorschlagen (nur Button-getriggert).
const suggestSlope = (area) => {
    if (!store.terrain || !area.points) return;
    const result = suggestSlopeClassFromTerrain(area.points, store.terrain);
    if (result) {
        area.slope = result.slopeClass;
    } else {
        console.warn(`Neigung aus DGM: keine gültigen Höhendaten innerhalb der Fläche ${area.id} gefunden.`);
    }
};

// === Deckelhöhe/Sohlhöhe/Tiefe-Kopplung (coverZ - z = depth) ===
// Deckelhöhe geändert -> Tiefe neu (Sohle bleibt Referenz)
const onCoverZChange = (node) => {
    const d = depthFromCoverAndZ(node.coverZ, node.z);
    if (d != null) node.depth = d;
};
// Tiefe geändert -> Deckelhöhe neu (Sohle bleibt Referenz)
const onDepthChange = (node) => {
    const c = coverZFromZAndDepth(node.z, node.depth);
    if (c != null) node.coverZ = c;
};
// Sohlhöhe geändert -> Deckelhöhe neu (Tiefe bleibt Referenz — Deckel folgt
// der neuen Sohle). Bewusst NICHT stattdessen depth aus coverZ-z neu
// berechnen, sonst "springen" bei einer Sohl-Änderung Tiefe UND Deckel
// gleichzeitig.
const onZChange = (node) => {
    const c = coverZFromZAndDepth(node.z, node.depth);
    if (c != null) node.coverZ = c;
};


// === Bulk Edit ===
const emptyBulkForm = () => ({ material: '', nodeType: '', profileType: null, profileHeight: null, profileWidth: null, profileSlope: null, weirHeight: null, pumpRate: null, runoffCoeff: null, canOverflow: null });
const bulkForm = ref(emptyBulkForm());

const openBulkEdit = () => {
    bulkForm.value = emptyBulkForm();
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
        nodes.value.forEach(n => {
            if (!selectedIds.value.includes(n.id)) return;
            let changed = false;

            if (bulkForm.value.nodeType !== '') {
                n.type = bulkForm.value.nodeType;
                changed = true;
            }
            if (bulkForm.value.weirHeight && n.type === 7) {
                n.weirHeight = bulkForm.value.weirHeight;
                changed = true;
            }
            if (bulkForm.value.pumpRate && [1, 6].includes(n.type)) {
                n.pumpRate = bulkForm.value.pumpRate;
                changed = true;
            }

            if (bulkForm.value.canOverflow !== null) {
                n.canOverflow = bulkForm.value.canOverflow;
                changed = true;
            }

            if (changed) updateCount++;
        });
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
    if (!confirm(`Sicher, dass du ${selectedIds.value.length} Elemente löschen möchtest? Wird erst mit "Übernehmen" endgültig.`)) return;

    // Lokal entfernen UND als gelöscht vormerken — beim Übernehmen räumt
    // store.updateNetworkData die Elemente dann wirklich aus dem Store.
    if (activeTab.value === 'nodes' || activeTab.value === 'structures') {
        deletedIds.value.nodes.push(...selectedIds.value);
        nodes.value = nodes.value.filter(n => !selectedIds.value.includes(n.id));
    } else if (activeTab.value === 'edges') {
        deletedIds.value.edges.push(...selectedIds.value);
        edges.value = edges.value.filter(e => !selectedIds.value.includes(e.id));
    } else if (activeTab.value === 'areas') {
        // Flächen werden beim Apply komplett ersetzt — lokales Entfernen genügt
        areas.value = areas.value.filter(a => !selectedIds.value.includes(a.id));
    }

    selectedIds.value = [];
    isDirty.value = true;
};

// Grobe PRISMATIC-Näherung als Startpunkt für den TABULAR-Kurven-Editor,
// falls ein Knoten (Legacy-Projekt ohne storageCurve) noch keine Stützstellen hat.
const defaultStorageCurve = (depth, volume) => {
    const d = depth > 0 ? depth : 3.0;
    const a = volume > 0 ? volume / d : 10.0;
    return [{ depth: 0, area: a }, { depth: d / 2, area: a }, { depth: d, area: a }];
};

// === Initialization ===
watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    isDirty.value = false;
    // Reset selections on open
    selectedIds.value = [];
    deletedIds.value = { nodes: [], edges: [] };
    
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
        initDepth: n.initDepth || 0,
        storageShape: n.storageShape || 'PRISMATIC',
        evapFactor: n.evapFactor || 0,
        // Pumpe
        pumpRate:  n.pumpRate  || (bd.pumpPower && bd.pumpHead
                    ? parseFloat(((bd.pumpPower * 1000 * 0.7) / (1000 * 9.81 * bd.pumpHead) * 1000).toFixed(1))
                    : 0),
        pumpHead:  n.pumpHead  || bd.pumpHead || 0,
        onDepth:   n.onDepth   || 0,
        offDepth:  n.offDepth  || 0,
        // Wehr — Domain-Feld heißt weirHeight (die Zeilen-Inputs binden darauf)
        weirHeight:     n.weirHeight     || (bd.wehrSchwelle != null ? Math.max(0, bd.wehrSchwelle - n.z) : 0),
        wehrWidth:      n.wehrWidth      || bd.wehrLaenge || 0,
        dischargeCoeff: n.dischargeCoeff || 0,
        weirType: n.weirType || 'TRANSVERSE',
        gated: n.gated || false,
        // Drossel / Schieber
        maxOutflow: n.maxOutflow || bd.nennleistung || 0,
        orificeType: n.orificeType || 'BOTTOM',
        initialOpening: n.initialOpening ?? 1.0,
        gateWidth: n.gateWidth || bd.schieberBreite || 0,
        // Rechen/Sieb/Einlaufbauwerk
        lossCoeff: n.lossCoeff || 0,
        // TABULAR-Speicherkurve
        storageCurve: (Array.isArray(n.storageCurve) && n.storageCurve.length >= 2)
          ? n.storageCurve
          : defaultStorageCurve(n.maxDepth || bd.maxDepth || 0, n.volume || bd.volume || 0),
        // Flow-Divider
        dividerType: n.dividerType || 'OVERFLOW',
        dividerLinkId: n.dividerLinkId || null,
        dividerCutoffFlow: n.dividerCutoffFlow || 0,
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
          slope: [1, 2, 3, 4, 5].includes(a.slope) ? a.slope : null,
    }));

    // Fokus-Sprung aus ElementInfo („In Tabelle bearbeiten"): richtigen Tab
    // wählen, Zeile selektieren und hinscrollen.
    const focusId = store.ui.preprocessingFocusId;
    const focusType = store.ui.preprocessingFocusType;
    if (focusId) {
        store.ui.preprocessingFocusId = null;
        store.ui.preprocessingFocusType = null;
        focusElement(focusId, focusType);
    }
  }
}, { immediate: true });

// function-Deklaration (gehoistet): wird vom isOpen-Watcher mit { immediate: true }
// schon während des Setups aufgerufen — eine const wäre dort noch nicht initialisiert.
//
// `type` ist Pflicht für den Regelfall: In ISYBAU-Daten teilt sich eine Haltung
// oft die ID mit ihrem Zulaufknoten (z.B. beide "06001"). Ohne expliziten Typ
// würde die Suche immer zuerst im Knoten-Array fündig und fälschlich zum
// Schacht statt zur Haltung springen. `type` fehlt nur bei alten/externen
// Aufrufern — dafür bleibt die Rate-Reihenfolge als Fallback erhalten.
function focusElement(id, type) {
    let tab = null;
    if (type === 'edge') {
        tab = edges.value.some(e => e.id === id) ? 'edges' : null;
    } else if (type === 'area') {
        tab = areas.value.some(a => a.id === id) ? 'areas' : null;
    } else if (type === 'node') {
        const node = nodes.value.find(n => n.id === id);
        tab = node ? (node.type === 'Standard' ? 'nodes' : 'structures') : null;
    } else {
        // Fallback ohne Typangabe: bisherige Rate-Priorität Knoten > Haltung > Fläche
        const node = nodes.value.find(n => n.id === id);
        if (node) tab = node.type === 'Standard' ? 'nodes' : 'structures';
        else if (edges.value.some(e => e.id === id)) tab = 'edges';
        else if (areas.value.some(a => a.id === id)) tab = 'areas';
    }
    if (!tab) return;

    activeTab.value = tab;
    selectedIds.value = [id];
    nextTick(() => {
        const row = document.querySelector(`[data-row-id="${CSS.escape(id)}"]`);
        if (row) {
            row.scrollIntoView({ block: 'center', behavior: 'smooth' });
            row.classList.add('row-flash');
            setTimeout(() => row.classList.remove('row-flash'), 2500);
        }
    });
};


const updateRoughness = (edge) => { edge.roughness = getRoughness(edge.material); };
const onProfileChange = (edge) => {
    if (edge.profile.type === 8) { edge.material = 'Erde'; edge.roughness = 25; }
    // Add default dims based on profile?
};
const calculateSlope = (edge) => {
     if (!edge.length) return 0;
     return (((edge.z1 - edge.z2) / edge.length) * 100).toFixed(2);
};

// T1/T2: wie tief liegt der Rohranschluss unter dem Deckel des jeweiligen Knotens
// (rein informativ — Deckelhöhe wird im Schächte/Bauwerke-Tab gepflegt, nicht hier).
const nodeCoverZ = (nodeId) => nodes.value.find(n => n.id === nodeId)?.coverZ;
const depthBelowCover = (nodeId, z) => {
    const coverZ = nodeCoverZ(nodeId);
    if (coverZ == null || z == null) return null;
    return coverZ - z;
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
    const structHeaders = [
        'ID', 'Typ', 'Deckel (m)', 'Sohle (m)', 'Druckdicht',
        'Volumen (m³)', 'Max. Tiefe (m)', 'Start-Tiefe (m)', 'Form', 'Verdunstung (0-1)',
        'Zufluss (l/s)',
        'Wehrhöhe (m)', 'Wehrbreite (m)', 'Beiwert Cw', 'Wehrform', 'Rückschlagklappe',
        'Max. Abfluss (l/s)', 'Lage (Orifice)',
        'Förderleistung (l/s)', 'Förderhöhe (m)', 'Einschalt (m)', 'Ausschalt (m)',
        'Öffnung (0-1)', 'Schieberbreite (m)',
        'Auslauftyp', 'Gedr. Max. Abfluss (l/s)', 'Als Senke',
        'Verlustbeiwert (Eintritt)'
    ];
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
            n.initDepth ?? '',
            n.storageShape ?? '',
            n.evapFactor ?? '',
            n.constantInflow ?? '',
            n.weirHeight ?? '',
            n.wehrWidth ?? '',
            n.dischargeCoeff ?? '',
            n.weirType ?? '',
            n.gated ? 'Ja' : 'Nein',
            n.maxOutflow ?? '',
            n.orificeType ?? '',
            n.pumpRate ?? '',
            n.pumpHead ?? '',
            n.onDepth ?? '',
            n.offDepth ?? '',
            n.initialOpening ?? '',
            n.gateWidth ?? '',
            n.outflowType ?? '',
            n.constantOutflow ?? '',
            n.is_sink ? 'Ja' : 'Nein',
            n.lossCoeff ?? ''
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
    const areaHeaders = ['ID', 'Fläche (ha)', 'Versiegelungsgrad', 'Funktion', 'Anschluss 1', 'Anschluss 2', 'Split (%)',
        'Gebietsname', 'Kommentar', 'Einwohnerwerte (E)', 'Einwohnerdichte (E/ha)', 'Wasserverbrauch (l/E·d)', 'Tagesspitzenfaktor', 'Trockenwetterkennung'];
    const areaRows = areas.value.map(a => {
        const sf = a.schmutzfracht;
        return [
            a.id,
            a.size != null ? parseFloat(a.size.toFixed(4)) : '',
            a.runoffCoeff ?? '',
            a.function != null ? (Flaechenfunktion[a.function] ?? a.function) : '',
            a.nodeId ?? '',
            a.nodeId2 ?? '',
            a.nodeId2 ? (a.splitRatio ?? 50) : '',
            sf?.gebietsname ?? '',
            sf?.kommentar ?? '',
            sf?.einwohnerwerte ?? '',
            sf?.einwohnerdichte != null ? parseFloat(sf.einwohnerdichte.toFixed(2)) : '',
            sf?.wasserverbrauch ?? '',
            sf?.tagesspitzenfaktor ?? '',
            sf?.trockenwetterkennung ?? ''
        ];
    });
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
        areas: areas.value,
        deletedNodeIds: deletedIds.value.nodes,
        deletedEdgeIds: deletedIds.value.edges
    });
};
</script>

<style scoped src="./shared/modalBase.css"></style>
<style scoped>
/* Cleaned up styles for DraggableModal */
.modal-header { padding: 0.65rem 1rem; background: var(--isy-pixel-bg, #040647); cursor: move; }
.header-left { display: flex; gap: 1rem; align-items: center; }
.bulk-btns { display: flex; gap: 0.5rem; }
.bulk-btn-link { background: none; border: none; font-family: var(--isy-pixel-font); font-size: 0.48rem; color: var(--isy-pixel-border, #4a4844); cursor: pointer; text-decoration: underline; padding: 0 5px; }
.bulk-btn-link.text-red { color: var(--isy-pixel-danger, #e74c3c); }
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
.data-table th { background: var(--isy-pixel-border, #4a4844); color: var(--isy-pixel-green-bright, #18a34a); position: sticky; top: 0; z-index: 10; padding: 0.5rem; border-bottom: 2px solid #ddd; text-align: left; }
.data-table td { padding: 0.5rem; border-bottom: 1px solid var(--isy-pixel-text-dim, #4a4a4a); background: white; }

/* Sticky Columns */
.sticky-left-1 { position: sticky; left: 0; z-index: 21; background: var(--isy-pixel-text, #fff); width: 30px; border-right: 1px solid #eee; box-shadow: 2px 0 5px rgba(0,0,0,0.05); }
.sticky-left-2 { position: sticky; left: 30px; z-index: 20; background: var(--isy-pixel-text, #fff); min-width: 80px; box-shadow: 2px 0 5px rgba(0,0,0,0.05); }

.data-table th.sticky-left-1 { z-index: 31 !important; background: #f8f9fa !important; }
.data-table th.sticky-left-2 { z-index: 30 !important; background: #f8f9fa !important; }

.sortable { cursor: pointer; user-select: none; }
.sortable:hover { background: #eee; }

.clickable-row:hover td { background-color: #f1f8ff !important; }
.clickable-row.selected td { background-color: #e3f2fd !important; }

/* Fokus-Sprung aus ElementInfo: Zeile kurz aufblinken lassen */
.row-flash td { animation: row-flash-anim 2.5s ease-out; }
@keyframes row-flash-anim {
    0%   { background-color: var(--isy-pixel-border-hover, #65625c) !important; }
    100% { background-color: #e3f2fd; }
}

/* Bauwerke: Parameter-Zellen (input-group/-col, hint-text, checkbox-label waren
   bisher komplett unstyled — Ergänzung, damit die neuen Phase-2-Felder nicht noch
   inkonsistenter wirken als der Rest der Tabelle). */
.input-group-col { display: grid; grid-template-columns: repeat(2, minmax(90px, 1fr)); gap: 0.4rem 0.6rem; align-items: end; }
.input-group { display: flex; flex-direction: column; gap: 2px; }
.hint-text { font-size: 0.68rem; color: #7f7d99; white-space: nowrap; }
.checkbox-label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; color: var(--isy-pixel-border, #4a4844); white-space: nowrap; }

/* Klassifizierungs-Badge (welche SWMM-Sektion bekommt dieser Knoten?) */
.classify-badge { display: block; margin-top: 3px; font-size: 0.68rem; color: var(--isy-pixel-border, #4a4844); font-family: monospace; }

/* Inputs & Dropdowns — dasselbe dunkle Feld-Design wie ElementInfo.vue
   .full-input/.full-select und ElementPropertiesModal.vue .form-input/
   .form-select (Navy-Fill var(--isy-pixel-bg-alt, #0a0d5c), Lila-Rahmen, Limetten-Fokusring), statt der
   vorherigen hellen Variante — Formularfelder sollen app-weit gleich aussehen,
   unabhängig davon, ob sie in einem Modal-Formular oder einer Tabellenzelle sitzen. */
input[type="checkbox"] { accent-color: var(--isy-pixel-green, #219653); }
.small-input, .medium-input, .filter-input,
.small-select, .medium-select, .weir-preset-select {
  border: 1px solid var(--isy-pixel-border, #4a4844);
  border-radius: 4px;
  background: var(--isy-pixel-bg-alt, #0a0d5c);
  color: var(--isy-pixel-text, #fff);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.small-input, .medium-input { width: 70px; padding: 4px; }
.medium-input { width: 100px; }
.medium-select { width: 150px; padding: 4px; }
.filter-input { width: 100%; padding: 4px; font-size: 0.8rem; }
.small-select { padding: 3px 4px; font-size: 0.82rem; }
.weir-preset-select { width: 100%; padding: 3px 4px; font-size: 0.78rem; box-sizing: border-box; }
.sf-btn {
  border: 1px solid var(--isy-pixel-border, #4a4844);
  border-radius: 4px;
  background: var(--isy-pixel-bg-alt, #0a0d5c);
  color: var(--isy-pixel-green, #219653);
  width: 28px;
  height: 26px;
  padding: 0;
  cursor: pointer;
  font-weight: 700;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.sf-btn:hover { border-color: var(--isy-pixel-green, #219653); box-shadow: 0 0 0 2px rgba(46, 204, 113, 0.2); }
.small-input:focus, .medium-input:focus, .filter-input:focus,
.small-select:focus, .medium-select:focus, .weir-preset-select:focus {
  outline: none;
  border-color: var(--isy-pixel-green, #219653);
  box-shadow: 0 0 0 2px rgba(46, 204, 113, 0.2);
}
.small-input:disabled, .medium-input:disabled, .filter-input:disabled,
.small-select:disabled, .medium-select:disabled, .weir-preset-select:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.split-cell { display: flex; gap: 5px; align-items: center; }
.invalid { border-color: var(--isy-pixel-danger, #e74c3c) !important; background: rgba(231, 76, 60, 0.25) !important; }
.text-red { color: var(--isy-pixel-danger, #e74c3c); font-weight: bold; }
.error-badge { font-size: 0.7rem; color: var(--isy-pixel-text, #fff); background: var(--isy-pixel-danger, #e74c3c); padding: 2px 4px; border-radius: 4px; }

/* Locate Button */
.id-cell { display: flex; align-items: center; justify-content: space-between; gap: 5px; }
.locate-btn { border: none; background: none; cursor: pointer; opacity: 0.5; padding: 0; line-height: 0; }
.locate-btn:hover { opacity: 1; transform: scale(1.1); }
.locate-icon { width: 16px; height: 16px; display: block; }

/* Pick Button (Knoten/Haltung im Viewer wählen) */
.pick-btn { border: none; background: none; cursor: pointer; opacity: 0.5; padding: 0; line-height: 0; flex-shrink: 0; }
.pick-btn:hover { opacity: 1; transform: scale(1.1); }
.pick-btn:disabled { opacity: 0.2; cursor: not-allowed; }
.pick-btn:disabled:hover { transform: none; }
.pick-icon { width: 16px; height: 16px; display: block; }

/* Undo & Bulk */
.undo-toast { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); background: var(--isy-pixel-bg, #040647); border: 1px solid var(--isy-pixel-border, #4a4844); color: var(--isy-pixel-green, #219653); padding: 10px 20px; border-radius: 20px; display: flex; gap: 10px; align-items: center; box-shadow: 0 4px 10px rgba(4,6,71,0.4); z-index: 1000; }
.undo-toast.info { background: var(--isy-pixel-border, #4a4844); }
.undo-action-btn {
  background: transparent; border: 1px solid var(--isy-pixel-border-hover, #65625c); color: var(--isy-pixel-green, #219653);
  border-radius: 4px; padding: 0.35rem 0.6rem;
  font-family: var(--isy-pixel-font); font-size: 0.46rem; cursor: pointer;
  transition: background 0.15s;
}
.undo-action-btn:hover { background: var(--isy-pixel-border, #4a4844); }
.undo-toast .close-toast {
  background: none; border: none; color: var(--isy-pixel-text-dim, #4a4a4a); font-size: 1.2rem; line-height: 1;
  cursor: pointer; padding: 0 0.2rem; transition: color 0.2s;
}
.undo-toast .close-toast:hover { color: var(--isy-pixel-green, #219653); }

/* Bulk Edit Modal — eigenständiges PopUp, daher komplettes eigenes
   Lila/Limetten-Pixel-Header wie das Hauptmodal, statt der alten weißen
   Bootstrap-Karte ohne Header/Close-Button. */
.bulk-edit-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(4,6,71,0.55); z-index: 500; display: flex; justify-content: center; align-items: center; }
.bulk-edit-modal { background: var(--isy-pixel-text, #fff); border: 1px solid var(--isy-pixel-border, #4a4844); border-radius: 8px; width: 400px; box-shadow: 0 4px 25px rgba(4,6,71,0.35); overflow: hidden; }
.bulk-edit-header {
  display: flex; justify-content: space-between; align-items: center;
  background: var(--isy-pixel-bg, #040647); padding: 0.65rem 1rem; border-bottom: 2px solid var(--isy-pixel-border, #4a4844);
}
.bulk-edit-header h4 {
  margin: 0; font-family: var(--isy-pixel-font); font-size: 0.55rem;
  color: var(--isy-pixel-green, #219653); letter-spacing: 0.06em; text-transform: uppercase;
}
.bulk-controls { display: flex; flex-direction: column; gap: 1rem; margin: 1.5rem 0; padding: 0 1.5rem; }
.bulk-field { display: flex; flex-direction: column; gap: 5px; }
.bulk-field-row { display: flex; gap: 1rem; }
.bulk-select, .bulk-input {
  padding: 8px; border: 1px solid var(--isy-pixel-border, #4a4844); border-radius: 4px; width: 100%;
  box-sizing: border-box; background: var(--isy-pixel-bg-alt, #0a0d5c); color: var(--isy-pixel-text, #fff);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.bulk-select:focus, .bulk-input:focus {
  outline: none; border-color: var(--isy-pixel-green, #219653); box-shadow: 0 0 0 2px rgba(46, 204, 113, 0.2);
}
.bulk-buttons { display: flex; gap: 1rem; justify-content: flex-end; padding: 0 1.5rem 1.5rem; }
.bulk-divider { border: none; border-top: 1px solid var(--isy-pixel-text-dim, #4a4a4a); margin: 0.25rem 0; }
.bulk-hint { font-size: 0.75rem; color: var(--isy-pixel-border, #4a4844); font-style: italic; }

.modal-footer { align-items: center; }
.export-btn { background: white; border: 1px solid var(--isy-pixel-green, #219653); color: var(--isy-pixel-green, #219653); padding: 0.55rem 1rem; border-radius: 6px; cursor: pointer; font-family: var(--isy-pixel-font); font-size: 0.48rem; transition: background 0.15s, color 0.15s; }
.export-btn:hover { background: var(--isy-pixel-green, #219653); color: white; }
.danger-btn { background: var(--isy-pixel-danger, #e74c3c); color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }

/* Tabs */
.tabs { display: flex; gap: 5px; border-bottom: 2px solid var(--isy-pixel-border, #4a4844); padding-bottom: 5px; background: var(--isy-pixel-bg, #040647); padding: 0.4rem 0.75rem; }
.tab-btn { background: transparent; border: 1px solid var(--isy-pixel-border, #4a4844); padding: 0.35rem 0.75rem; cursor: pointer; font-family: var(--isy-pixel-font); font-size: 0.48rem; color: var(--isy-pixel-text-dim, #4a4a4a); border-radius: 5px; letter-spacing: 0.05em; }
.tab-btn.active { background: var(--isy-pixel-border, #4a4844); color: var(--isy-pixel-text, #fff); border-color: var(--isy-pixel-border-hover, #65625c); }

.header-actions { display: flex; gap: 0.5rem; }
.icon-btn { background: none; border: none; font-size: 1.2rem; cursor: pointer; }

.modal-header h3 {
  font-family: var(--isy-pixel-font);
  font-size: 0.6rem;
  color: var(--isy-pixel-green, #219653);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0;
}

/* Single source of truth for these two — vorher gab es zwei konkurrierende
   .primary-btn/.secondary-btn Definitionen (eine schlicht, eine mit !important
   pixel-Look), die sich Eigenschaften gegenseitig wegschnappten. */
.primary-btn {
  background: var(--isy-pixel-bg, #040647);
  color: var(--isy-pixel-text, #fff);
  border: none;
  border-radius: 6px;
  padding: 0.55rem 1rem;
  font-family: var(--isy-pixel-font);
  font-size: 0.52rem;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: background 0.15s;
}
.primary-btn:hover { background: var(--isy-pixel-border, #4a4844); }

.secondary-btn {
  background: transparent;
  border: 1px solid var(--isy-pixel-border, #4a4844);
  color: var(--isy-pixel-text-dim, #4a4a4a);
  border-radius: 6px;
  padding: 0.55rem 1rem;
  font-family: var(--isy-pixel-font);
  font-size: 0.52rem;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: background 0.15s;
}
.secondary-btn:hover { background: var(--isy-pixel-content-bg, #f3f2fb); }
</style>
