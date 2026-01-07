<template>
  <div class="sidebar" :style="{ width: width + 'px' }">
    <h2>ISYBAU Import</h2>
    
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

    <div v-if="hasData" class="actions">
      <!-- Slot for Simulation Controls or other panels -->
      <slot></slot>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useIsybauStore } from '../../store/index.js';
import { parseIsybauXML } from '../../utils/xmlParser.js';

const props = defineProps({
  width: {
    type: Number,
    default: 300
  }
});

const store = useIsybauStore();
const hasData = computed(() => store.nodes.size > 0);
const inspectionsCount = computed(() => store.inspections ? store.inspections.length : 0);

const handleFileUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const text = await file.text();
  try {
      const parsed = parseIsybauXML(text);
      // Inject Metadata from file info
      parsed.metadata.fileName = file.name;
      
      store.loadParsedData(parsed);
  } catch (e) {
      console.error("Parse Error", e);
      alert("Fehler beim Lesen der XML: " + e.message);
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
</style>
