<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h3>Use Data Importer</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>

      <div class="tabs">
        <button
          :class="{ active: activeTab === 'BATHYMETRY' }"
          @click="activeTab = 'BATHYMETRY'"
        >
          Vermessungspunkte
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
        <button
          :class="{ active: activeTab === 'SURFACE' }"
          @click="activeTab = 'SURFACE'"
        >
          Oberflächen (.json)
        </button>
      </div>

      <div class="tab-content">

        <!-- BATHYMETRY PREPROCESSING -->
        <div v-if="activeTab === 'BATHYMETRY'" class="import-panel bathy-panel">
          <BathymetryImportTab @stage1-done="$emit('close')" />
        </div>

        <!-- Kanalnetz-Import wandert in den Netz-Tab (NetworkImportButton, ISYBAU/IFC →
             useNetworkStore) — der Legacy-XML-Import in geoStore.nodes wurde entfernt. -->

        <div v-if="activeTab === 'BUILDINGS'" class="import-panel">
          <p class="description">
            Importiere Gebäudeumringe als GeoJSON Features.
            <br><small>Polygone werden als Gebäude (Typ: building, Höhe: 10m) normalisiert.</small>
          </p>

          <label class="file-drop-zone">
            <input type="file" accept=".json,.geojson" @change="handleFileSelect" :disabled="importing">
            <span v-if="!importing"><SvEmoji emoji="📁" :size="13" /> Wähle Gebäudedaten (.json)</span>
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
            <span v-if="!importing"><SvEmoji emoji="📁" :size="13" /> Wähle Grenzen (.json)</span>
            <span v-else>Importiere...</span>
          </label>
        </div>

        <!-- SURFACE IMPORT -->
        <div v-if="activeTab === 'SURFACE'" class="import-panel">
          <p class="description">
            Importiere Oberflächen-Materialien (Polygone/Linien) als GeoJSON.
            <br><small>Die Flächen werden auf das Terrain-Raster (Surface Grid) projiziert.</small>
          </p>

          <div class="material-select-wrapper" v-if="surfaceStore.isInitialized">
             <label for="materialSelect">Ziel-Material:</label>
             <select id="materialSelect" v-model.number="selectedSurfaceMaterial" class="material-select">
                <option v-for="mat in surfaceStore.materials" :key="mat.id" :value="mat.id">
                   {{ mat.name }} (n={{ mat.manning }})
                </option>
             </select>
          </div>
          <div v-else class="status-warn">
              <SvEmoji emoji="⚠" :size="13" /> Terrain Grid ist noch nicht initialisiert. Bitte erst im Editor öffnen.
          </div>

          <label class="file-drop-zone" :class="{ disabled: !surfaceStore.isInitialized }">
            <input type="file" accept=".json,.geojson" @change="handleFileSelect" :disabled="importing || !surfaceStore.isInitialized">
            <span v-if="!importing"><SvEmoji emoji="📁" :size="13" /> Wähle Oberflächen (.json)</span>
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
import SvEmoji from '../common/SvEmoji.vue';
import { ref } from 'vue';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore';
import { useSurfaceStore } from '@/features/flood-2D/stores/useSurfaceStore';
import { BoundaryTools } from '@/features/flood-2D/middleware/BoundaryTools.js';
import BathymetryImportTab from './BathymetryImportTab.vue';

// Import parsers
import { parseGeoJSONBuildings, parseGeoJSONBoundaries, parseGeoJSONSurfaces } from '@/features/flood-2D/middleware/importers/GeoJSONParser.js';

const emit = defineEmits(['close']);
const geoStore = useGeoStore();
const surfaceStore = useSurfaceStore();

const activeTab = ref('BATHYMETRY'); // BATHYMETRY | BUILDINGS | BOUNDARIES | SURFACE
const importing = ref(false);
const feedback = ref(null);
const selectedSurfaceMaterial = ref(1); // Default is Asphalt

const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    importing.value = true;
    feedback.value = null;

    try {
        const name = file.name.toLowerCase();
        let result = null;

        if (activeTab.value === 'BUILDINGS') {
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

        } else if (activeTab.value === 'SURFACE') {
            if (!surfaceStore.isInitialized) throw new Error("Surface Grid nicht geladen. Bitte im Editor aktivieren.");
            if (!(name.endsWith('.json') || name.endsWith('.geojson'))) throw new Error("Bitte eine .json/.geojson Datei wählen.");
            
            const text = await file.text();
            const json = JSON.parse(text);
            const features = parseGeoJSONSurfaces(json);
            
            const terrain = geoStore.terrain.header || geoStore.terrain;
            if (!terrain) throw new Error("Kein Terrain Header gefunden.");

            const { cellsize, xllcorner, yllcorner, xll, yll } = terrain;
            const originX = xllcorner !== undefined ? xllcorner : xll;
            const originY = yllcorner !== undefined ? yllcorner : yll;

            let cellCount = 0;

            features.forEach(feature => {
                if (!feature.geometry || !feature.geometry.coordinates) return;
                const type = feature.geometry.type;
                const matId = selectedSurfaceMaterial.value;

                let cellsToPaint = [];

                if (type === 'Polygon') {
                    // Extract main ring for BoundaryTools
                    const coords = feature.geometry.coordinates[0];
                    cellsToPaint = BoundaryTools.getCellsInPolygon(coords, cellsize, originX, originY);
                } else if (type === 'MultiPolygon') {
                    for (const poly of feature.geometry.coordinates) {
                        const coords = poly[0];
                        cellsToPaint.push(...BoundaryTools.getCellsInPolygon(coords, cellsize, originX, originY));
                    }
                } else if (type === 'LineString') {
                    cellsToPaint = BoundaryTools.discretizePolyline(feature.geometry.coordinates, cellsize, originX, originY);
                } else if (type === 'MultiLineString') {
                    for (const line of feature.geometry.coordinates) {
                        cellsToPaint.push(...BoundaryTools.discretizePolyline(line, cellsize, originX, originY));
                    }
                }

                cellsToPaint.forEach(c => {
                    // Important: Data Grid has origin bottom-left => gridRow = y is already bottom-up
                    surfaceStore.setCellMaterial(c.x, c.y, matId);
                    cellCount++;
                });
            });

            if (cellCount > 0) {
                // Bulk update the stats and visual sync
                surfaceStore.calculateCoverage(); 
            }

            result = { type: 'SURFACE', count: cellCount };
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
    background: var(--sv-bg-2);
    color: var(--sv-text);
    width: 660px;
    border: 1px solid var(--sv-border);
    border-radius: var(--sv-radius);
    box-shadow: 0 10px 25px rgba(0,0,0,0.5), var(--sv-glow-violet);
    overflow: hidden;
    font-family: var(--sv-font);
}

.modal-header {
    background: var(--sv-bg);
    padding: 1rem 1.5rem;
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px solid var(--sv-border);
}
.modal-header h3 {
    margin: 0; font-size: 1.1rem;
    color: var(--sv-text-violet);
    text-shadow: var(--sv-glow-violet);
    text-transform: uppercase; letter-spacing: 1px;
}
.close-btn {
    background: none; border: none; color: var(--sv-text-dim); font-size: 1.5rem; cursor: pointer;
}
.close-btn:hover { color: var(--sv-lime); }

/* TABS */
.tabs {
    display: flex;
    background: var(--sv-bg);
}
.tabs button {
    flex: 1;
    padding: 1rem;
    background: transparent;
    border: none;
    color: var(--sv-text-dim);
    font-family: var(--sv-font);
    font-weight: 600;
    cursor: pointer;
    border-bottom: 3px solid transparent;
    transition: all 0.2s;
}
.tabs button:hover { background: rgba(139, 92, 246, 0.12); color: var(--sv-text); }
.tabs button.active {
    color: var(--sv-lime);
    border-bottom-color: var(--sv-lime);
    background: var(--sv-bg-2);
}

.tab-content { padding: 1.5rem; text-align: center; }
.bathy-panel { text-align: left; }

.description { margin-bottom: 1.5rem; color: var(--sv-text); line-height: 1.5; font-size: 0.95rem; }
.description small { color: var(--sv-text-dim); }

/* DROP ZONE */
.file-drop-zone {
    display: block;
    border: 2px dashed var(--sv-border);
    border-radius: var(--sv-radius);
    padding: 2rem;
    cursor: pointer;
    transition: all 0.2s;
    background: var(--sv-surface-2);
}
.file-drop-zone:hover {
    border-color: var(--sv-lime);
    background: rgba(139, 92, 246, 0.15);
    box-shadow: var(--sv-glow-lime);
}
.file-drop-zone input { display: none; }
.file-drop-zone span { font-weight: bold; color: var(--sv-text); }

/* FEEDBACK */
.feedback-msg {
    margin: 0 1.5rem 1.5rem;
    padding: 0.75rem;
    border-radius: 4px;
    font-size: 0.9rem;
    text-align: center;
}
.feedback-msg.success { background: rgba(163, 230, 53, 0.12); color: var(--sv-lime); border: 1px solid var(--sv-border-lime); }
.feedback-msg.error { background: rgba(231, 76, 60, 0.15); color: #e74c3c; border: 1px solid rgba(231, 76, 60, 0.45); }
.feedback-msg.warning { background: rgba(243, 156, 18, 0.15); color: #f39c12; border: 1px solid rgba(243, 156, 18, 0.45); }
.feedback-msg.info { background: rgba(139, 92, 246, 0.15); color: var(--sv-text-violet); border: 1px solid var(--sv-border); }

/* MISC */
.material-select-wrapper { margin-bottom: 20px; }
.material-select-wrapper label { color: var(--sv-text-dim); font-size: 0.85rem; padding-right: 10px; }
.material-select { padding: 4px; border-radius: 4px; background: var(--sv-bg); color: var(--sv-text-lime); border: 1px solid var(--sv-border); font-family: var(--sv-font); }
.status-warn { color: #f39c12; margin-bottom: 10px; font-size: 0.85rem; font-weight: bold; }
.file-drop-zone.disabled { opacity: 0.5; cursor: not-allowed; }

</style>
