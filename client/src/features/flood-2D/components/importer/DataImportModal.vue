<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h3>Use Data Importer</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>

      <div class="tabs">
        <button 
          :class="{ active: activeTab === 'NODES' }" 
          @click="activeTab = 'NODES'"
        >
          Kanalnetz (.xml)
        </button>
        <button 
          :class="{ active: activeTab === 'BUILDINGS' }" 
          @click="activeTab = 'BUILDINGS'"
        >
          Gebäude (.json)
        </button>
        <button 
          :class="{ active: activeTab === 'BOUNDARIES' }" 
          @click="activeTab = 'BOUNDARIES'"
        >
          Grenzen (.json)
        </button>
      </div>

      <div class="tab-content">
        <!-- NODE IMPORT -->
        <div v-if="activeTab === 'NODES'" class="import-panel">
          <p class="description">
            Importiere Schächte und Einläufe aus ISYBAU/XML Daten.
            <br><small>Erwartet Tag: &lt;AbwassertechnischeAnlage&gt;</small>
          </p>
          
          <label class="file-drop-zone">
            <input type="file" accept=".xml" @change="handleFileSelect" :disabled="importing">
            <span v-if="!importing">📁 Wähle .XML Datei</span>
            <span v-else>Importiere...</span>
          </label>
        </div>

        <div v-if="activeTab === 'BUILDINGS'" class="import-panel">
          <p class="description">
            Importiere Gebäudeumringe als GeoJSON Features.
            <br><small>Polygone werden als Gebäude (Typ: building, Höhe: 10m) normalisiert.</small>
          </p>

          <label class="file-drop-zone">
            <input type="file" accept=".json,.geojson" @change="handleFileSelect" :disabled="importing">
            <span v-if="!importing">📁 Wähle Gebäudedaten (.json)</span>
            <span v-else>Importiere...</span>
          </label>
        </div>

        <!-- BOUNDARY IMPORT -->
        <div v-if="activeTab === 'BOUNDARIES'" class="import-panel">
          <p class="description">
            Importiere hydraulische Randbedingungen (Linien) als GeoJSON.
            <br><small>Linien (LineStrings) werden als hydraulische Grenzen importiert.</small>
          </p>

          <label class="file-drop-zone">
            <input type="file" accept=".json,.geojson" @change="handleFileSelect" :disabled="importing">
            <span v-if="!importing">📁 Wähle Grenzen (.json)</span>
            <span v-else>Importiere...</span>
          </label>
        </div>
      </div>

      <!-- FEEDBACK -->
      <div v-if="feedback" class="feedback-msg" :class="feedback.type">
        {{ feedback.message }}
      </div>

      <div class="modal-actions">
        <!-- Optional: Close button or actions -->
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore';
// Import parsers
import { parseXMLNodes } from '@/features/flood-2D/middleware/importers/XMLNodeParser.js';
import { parseGeoJSONBuildings, parseGeoJSONBoundaries } from '@/features/flood-2D/middleware/importers/GeoJSONParser.js';

const emit = defineEmits(['close']);
const geoStore = useGeoStore();

const activeTab = ref('NODES'); // NODES | BUILDINGS | BOUNDARIES
const importing = ref(false);
const feedback = ref(null);

const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    importing.value = true;
    feedback.value = null;

    try {
        const name = file.name.toLowerCase();
        let result = null;

        if (activeTab.value === 'NODES') {
            if (!name.endsWith('.xml')) throw new Error("Bitte eine .xml Datei für Kanalnetz wählen.");
            
            const text = await file.text();
            const nodes = await parseXMLNodes(text); // Assume parser returns array
            
            let count = 0;
            if (nodes && nodes.length) {
                nodes.forEach(n => geoStore.addNode(n));
                count = nodes.length;
            }
            result = { type: 'XML', count };
            
        } else if (activeTab.value === 'BUILDINGS') {
            if (!(name.endsWith('.json') || name.endsWith('.geojson'))) throw new Error("Bitte eine .json/.geojson Datei wählen.");
            
            const text = await file.text();
            const json = JSON.parse(text);
            const features = parseGeoJSONBuildings(json); // Assume returns array of features
            
            let count = 0;
            if (features && features.length) {
                features.forEach(f => geoStore.addBuilding(f));
                count = features.length;
            }
            result = { type: 'GEOJSON', count };

        } else if (activeTab.value === 'BOUNDARIES') {
            if (!(name.endsWith('.json') || name.endsWith('.geojson'))) throw new Error("Bitte eine .json/.geojson Datei wählen.");
            
            const text = await file.text();
            const json = JSON.parse(text);
            const features = parseGeoJSONBoundaries(json); // Assume returns array or similar
            
             let count = 0;
            if (features && features.length) {
                features.forEach(f => geoStore.addBoundary(f));
                count = features.length;
            }
            result = { type: 'GEOJSON', count };
        }

        if (result && result.count > 0) {
            feedback.value = { type: 'success', message: `${result.count} Objekte importiert.` };
        } else {
            feedback.value = { type: 'warning', message: "Keine validen Daten gefunden." };
        }

    } catch (e) {
        console.error(e);
        feedback.value = { type: 'error', message: e.message };
    } finally {
        importing.value = false;
        event.target.value = ''; 
    }
};
</script>

<style scoped>
.modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000;
}

.modal-content {
    background: #2c3e50;
    color: #ecf0f1;
    width: 500px;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    overflow: hidden;
    font-family: 'Segoe UI', sans-serif;
}

.modal-header {
    background: #34495e;
    padding: 1rem 1.5rem;
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px solid #465c71;
}
.modal-header h3 { margin: 0; font-size: 1.1rem; color: #fff; }
.close-btn { 
    background: none; border: none; color: #95a5a6; font-size: 1.5rem; cursor: pointer; 
}
.close-btn:hover { color: #fff; }

/* TABS */
.tabs {
    display: flex;
    background: #233140;
}
.tabs button {
    flex: 1;
    padding: 1rem;
    background: transparent;
    border: none;
    color: #95a5a6;
    font-weight: 600;
    cursor: pointer;
    border-bottom: 3px solid transparent;
    transition: all 0.2s;
}
.tabs button:hover { background: #2c3e50; color: #bdc3c7; }
.tabs button.active {
    color: #3498db;
    border-bottom-color: #3498db;
    background: #2c3e50;
}

.tab-content { padding: 2rem; text-align: center; }

.description { margin-bottom: 1.5rem; color: #bdc3c7; line-height: 1.5; font-size: 0.95rem; }
.description small { color: #7f8c8d; }

/* DROP ZONE */
.file-drop-zone {
    display: block;
    border: 2px dashed #465c71;
    border-radius: 8px;
    padding: 2rem;
    cursor: pointer;
    transition: all 0.2s;
    background: #34495e;
}
.file-drop-zone:hover {
    border-color: #3498db;
    background: #3b536b;
}
.file-drop-zone input { display: none; }
.file-drop-zone span { font-weight: bold; color: #ecf0f1; }

/* FEEDBACK */
.feedback-msg {
    margin: 0 1.5rem 1.5rem;
    padding: 0.75rem;
    border-radius: 4px;
    font-size: 0.9rem;
    text-align: center;
}
.feedback-msg.success { background: rgba(46, 204, 113, 0.2); color: #2ecc71; border: 1px solid #2ecc71; }
.feedback-msg.error { background: rgba(231, 76, 60, 0.2); color: #e74c3c; border: 1px solid #e74c3c; }
.feedback-msg.warning { background: rgba(243, 156, 18, 0.2); color: #f39c12; border: 1px solid #f39c12; }
.feedback-msg.info { background: rgba(52, 152, 219, 0.2); color: #3498db; border: 1px solid #3498db; }

</style>
