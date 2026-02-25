<template>
  <div class="ifc-metadata-panel">
    <div class="panel-header" @click="expanded = !expanded">
      <span class="panel-title">📋 ISYBAU Metadaten (M100-M108)</span>
      <span class="toggle">{{ expanded ? '▾' : '▸' }}</span>
    </div>
    
    <div v-if="expanded" class="panel-body">
      <!-- M100 Datenstatus -->
      <label class="field-label">
        <span class="field-name">M100 Datenstatus</span>
        <select :value="store.ifcMetadata.datenstatus" @change="update('datenstatus', $event.target.value)">
          <option value="1">1 — Bestandsdaten</option>
          <option value="2">2 — Erfassungsdaten</option>
          <option value="3">3 — Vorplanung</option>
          <option value="4">4 — Entwurfsplanung</option>
          <option value="5">5 — Genehmigungsplanung</option>
          <option value="6">6 — Ausführungsplanung</option>
          <option value="7">7 — Bauausführung</option>
          <option value="8">8 — Sonstiger Bestand</option>
        </select>
      </label>

      <!-- M101 Kollektivart -->
      <label class="field-label">
        <span class="field-name">M101 Kollektivart</span>
        <select :value="store.ifcMetadata.kollektivart" @change="update('kollektivart', $event.target.value)">
          <option value="1">1 — Stammdaten</option>
          <option value="2">2 — Zustandsdaten</option>
          <option value="3">3 — Hydraulikdaten</option>
        </select>
      </label>

      <!-- M102 Stammdatentyp -->
      <label class="field-label">
        <span class="field-name">M102 Stammdatentyp</span>
        <select :value="store.ifcMetadata.stammdatentyp" @change="update('stammdatentyp', $event.target.value)">
          <option value="1">1 — Bautechnischer Bestand</option>
          <option value="2">2 — Hydraulisches Ersatzsystem</option>
        </select>
      </label>

      <!-- M103 Zuständigkeit -->
      <label class="field-label">
        <span class="field-name">M103 Zuständigkeit</span>
        <select :value="store.ifcMetadata.zustaendigkeit" @change="update('zustaendigkeit', $event.target.value)">
          <option value="1">1 — Bund militärisch</option>
          <option value="2">2 — Bund zivil</option>
          <option value="4">4 — Land</option>
          <option value="5">5 — Fremdstreitkräfte</option>
        </select>
      </label>

      <!-- M104 Regelwerk -->
      <label class="field-label">
        <span class="field-name">M104 Regelwerk</span>
        <select :value="store.ifcMetadata.regelwerk" @change="update('regelwerk', $event.target.value)">
          <option value="6">6 — ISYBAU 2017</option>
          <option value="7">7 — BFR Abwasser 2024</option>
        </select>
      </label>

      <!-- M105 Abwasserbeseitigungspflicht -->
      <label class="field-label">
        <span class="field-name">M105 Abwasserbeseitigungspflicht</span>
        <select :value="store.ifcMetadata.abwasserbeseitigungspflicht" @change="update('abwasserbeseitigungspflicht', $event.target.value)">
          <option value="1">1 — Betreiber</option>
          <option value="2">2 — Kommune</option>
        </select>
      </label>

      <!-- M106 Ordnungseinheitentyp -->
      <label class="field-label">
        <span class="field-name">M106 Ordnungseinheitentyp</span>
        <select :value="store.ifcMetadata.ordnungseinheitentyp" @change="update('ordnungseinheitentyp', $event.target.value)">
          <option value="1">1 — Liegenschaft</option>
          <option value="2">2 — Wirtschaftseinheit</option>
          <option value="3">3 — Entwässerungsnetz</option>
        </select>
      </label>

      <!-- M108 Präsentationsdatentyp -->
      <label class="field-label">
        <span class="field-name">M108 Präsentationsdatentyp</span>
        <input 
          type="text" 
          :value="store.ifcMetadata.praesentationsdatentyp" 
          @input="update('praesentationsdatentyp', $event.target.value)"
          class="text-input"
        />
      </label>

      <!-- Ersteller -->
      <label class="field-label">
        <span class="field-name">Ersteller / Quelle</span>
        <input 
          type="text" 
          :value="store.ifcMetadata.ersteller" 
          @input="update('ersteller', $event.target.value)"
          class="text-input"
        />
      </label>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useIsyIfcStore } from '../../store/index.js';

const store = useIsyIfcStore();
const expanded = ref(false);

const update = (key, value) => {
    store.updateIfcMetadata(key, value);
};
</script>

<style scoped>
.ifc-metadata-panel {
    border: 1px solid #e1e5ea;
    border-radius: 6px;
    background: #f8f9fb;
    overflow: hidden;
}
.panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    cursor: pointer;
    user-select: none;
    font-size: 0.8rem;
    font-weight: 600;
    color: #444;
    background: #eef1f5;
}
.panel-header:hover {
    background: #e4e8ee;
}
.toggle {
    font-size: 0.9rem;
    color: #888;
}
.panel-body {
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.field-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.field-name {
    font-size: 0.7rem;
    font-weight: 600;
    color: #555;
}
.field-label select,
.text-input {
    padding: 4px 6px;
    border: 1px solid #ccd0d5;
    border-radius: 4px;
    font-size: 0.75rem;
    background: #fff;
    color: #333;
}
.field-label select:focus,
.text-input:focus {
    outline: none;
    border-color: #3498db;
    box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.15);
}
</style>
