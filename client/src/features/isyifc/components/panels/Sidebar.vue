<template>
  <div class="sidebar" :style="{ width: width + 'px' }">
    <h2>ISYIFC Import</h2>
    
    <div class="upload-section">
      <label for="file-upload" class="file-upload-label">
        <span class="file-upload-btn">Datei auswählen</span>
        <span class="file-upload-text">{{ store.metadata.fileName || 'Keine ausgewählt' }}</span>
      </label>
      <input 
        id="file-upload"
        type="file" 
        accept=".xml" 
        @change="handleFileUpload" 
        class="file-upload-input"
      />
    </div>

    <div v-if="hasData" class="data-view">
      <IsyIfcDataPanel />
    </div>

    <div v-if="hasData" class="actions" style="border-top: 1px solid #ddd; padding-top: 10px;">
      <button @click="exportIfc" class="export-btn">💾 IFC Export (Beta)</button>
      <!-- Slot for Simulation Controls or other panels -->
      <slot></slot>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useIsyIfcStore } from '../../store/index.js';
import IsyIfcDataPanel from './IsyIfcDataPanel.vue';

const props = defineProps({
  width: {
    type: Number,
    default: 300
  }
});

const store = useIsyIfcStore();
// Adapt to new Store structure (graph.nodes is Map)
const hasData = computed(() => store.graph && store.graph.nodes && store.graph.nodes.size > 0);
const inspectionsCount = computed(() => store.inspections ? store.inspections.length : 0);

const handleFileUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const text = await file.text();
  try {
      // Use new Store Action that handles parsing and worker delegation internally
      await store.processImport(text);
      
      // Update metadata (Store might overwrite it, so maybe merge or set after?)
      // processImport parses metadata from XML. If we want to keep Filename:
      store.metadata = { ...store.metadata, fileName: file.name };
      
  } catch (e) {
      console.error("Import Error", e);
      alert("Fehler beim Import: " + e.message);
  }
};

const exportIfc = async () => {
    if (!hasData.value) return;
    
    try {
        const { IsybauToIfc } = await import('../../core/export/IfcWriter.js');
        const writer = new IsybauToIfc(store.graph.nodes, store.graph.edges);
        const ifcData = writer.generate();
        
        const blob = new Blob([ifcData], { type: 'application/x-step' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const fname = (store.metadata.fileName || 'isotest').replace('.xml', '') + '_' + new Date().toISOString().split('T')[0] + '.ifc';
        a.download = fname;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error("Export Error", e);
        alert("Fehler beim IFC Export: " + e.message);
    }
};
</script>

<style scoped>
.sidebar {
  padding: 1rem;
  background: #fff;
  border-right: 1px solid #ddd;
  overflow-y: auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.upload-section {
  display: flex;
  flex-direction: column;
}

.file-upload-label {
    display: inline-block;
    padding: 10px 20px;
    background-color: #f0f0f0;
    border: 1px solid #ccc;
    cursor: pointer;
    border-radius: 4px;
    text-align: center;
}
.file-upload-input {
    display: none;
}
.file-upload-text {
    display: block;
    margin-top: 5px;
    font-size: 0.8em;
    color: #666;
}

.meta-card {
    background: #f9f9f9;
    border: 1px solid #eee;
    border-radius: 5px;
    padding: 0.5rem;
    margin-bottom: 0.5rem;
}

.stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
}
.stat-item {
    text-align: center;
    padding: 0.5rem;
    background: white;
    border-radius: 4px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.stat-val {
    display: block;
    font-weight: bold;
    font-size: 1.1rem;
}
.stat-label {
    font-size: 0.8rem;
    color: #777;
}
.data-view {
    flex: 1;
    overflow: hidden;
    border: 1px solid #eee;
    border-radius: 4px;
}
.export-btn {
    width: 100%;
    padding: 10px;
    background-color: #3498db;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    margin-bottom: 10px;
}
.export-btn:hover {
    background-color: #2980b9;
}
</style>
