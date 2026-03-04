<template>
  <DraggableModal ref="modalComponent" :isOpen="true" initialWidth="1000px" initialHeight="700px" initialTop="80px" initialLeft="center" @close="closeViewer">
    <div class="ifc-viewer-wrapper">
      <div class="modal-header">
        <div class="header-title">🏗️ That Open Engine - IFC Viewer</div>
        <div class="header-controls">
          <button @click="toggleMinimize" class="header-btn" title="Minimieren">_</button>
          <button @click="toggleMaximize" class="header-btn" title="Vollbild">□</button>
          <button @click="closeViewer" class="header-close-btn" title="Viewer schließen">&times;</button>
        </div>
      </div>
      
      <div class="modal-body">
        <div class="ifc-viewer-container" ref="viewerContainer"></div>
        
        <!-- UI Overlay for file uploading etc -->
        <div class="viewer-ui">
          <div class="actions-group">
            <label class="action-btn primary-btn">
              <input type="file" accept=".ifc" @change="handleFileUpload" class="hidden-input" />
              <span>📁 Eigene IFC laden</span>
            </label>
            
            <div class="dropdown" ref="dropdownRef">
              <button class="action-btn secondary-btn" @click="toggleDropdown">
                <span>🏢 Beispiele laden ▾</span>
              </button>
              <div class="dropdown-content" :class="{ 'show-dropdown': isDropdownOpen }">
                <button @click="loadExample('Kanalbestand')">0_Kanalbestand.ifc</button>
                <button @click="loadExample('WRA')">WRA.ifc</button>
              </div>
            </div>
          </div>
          
          <div class="status-indicator" v-if="isLoading">
            <span class="spinner"></span> Modell wird geladen...
          </div>
        </div>
      </div>
    </div>
  </DraggableModal>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, shallowRef } from 'vue';
import DraggableModal from '@/features/isyifc/components/common/DraggableModal.vue';
import { IfcEngine } from '../services/IfcEngine.js';

// Import raw URLs to fetch them at runtime
import kanalbestandUrl from '../testdata/0_Kanalbestand.ifc?url';
import wraUrl from '../testdata/WRA.ifc?url';

const emit = defineEmits(['close']);

const viewerContainer = ref(null);
const modalComponent = ref(null);
const isLoading = ref(false);

const isDropdownOpen = ref(false);
const dropdownRef = ref(null);

const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value;
};

// Close dropdown on outside click
const handleClickOutside = (event) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    isDropdownOpen.value = false;
  }
};

const toggleMinimize = () => {
  if (modalComponent.value) modalComponent.value.toggleMinimize();
};

const toggleMaximize = () => {
  if (modalComponent.value) modalComponent.value.toggleMaximize();
};
// Use shallowRef to avoid deep reactivity overhead on complex 3D objects
const engine = shallowRef(null);

onMounted(async () => {
  document.addEventListener('click', handleClickOutside);
  if (viewerContainer.value) {
    engine.value = new IfcEngine();
    await engine.value.init(viewerContainer.value);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
  if (engine.value) {
    engine.value.dispose();
    engine.value = null;
  }
});

const handleFileUpload = async (event) => {
  const file = event.target.files[0];
  if (!file || !engine.value) return;

  isLoading.value = true;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const data = new Uint8Array(e.target.result);
    try {
      await engine.value.loadIfc(data);
    } catch (err) {
      console.error("Failed to load IFC:", err);
      alert("Fehler beim Laden der IFC-Datei.");
    } finally {
      isLoading.value = false;
      event.target.value = ''; // Reset for re-uploading the same file
    }
  };
  reader.readAsArrayBuffer(file);
};

const loadExample = async (name) => {
  isDropdownOpen.value = false;
  if (!engine.value) return;
  isLoading.value = true;
  
  let url = '';
  if (name === 'Kanalbestand') {
    url = kanalbestandUrl;
  } else if (name === 'WRA') {
    url = wraUrl;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Netzwerkfehler beim Laden des Beispiels.");
    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    await engine.value.loadIfc(data);
  } catch (err) {
    console.error("Failed to load example IFC:", err);
    alert("Fehler beim Laden der Beispiel-Datei.");
  } finally {
    isLoading.value = false;
  }
};

const closeViewer = () => {
  emit('close');
};
</script>

<style scoped>
.ifc-viewer-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background-color: #f0f0f0;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background-color: #2c3e50;
  color: white;
  user-select: none;
  cursor: grab;
  /* DraggableModal looks for .modal-header to enable dragging by default in many setups */
}

.modal-header:active {
  cursor: grabbing;
}

.header-title {
  font-weight: 600;
  font-size: 1.1rem;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.header-btn {
  background: none;
  border: none;
  color: #ecf0f1;
  font-size: 1.2rem;
  cursor: pointer;
  line-height: 1;
  padding: 0.25rem 0.5rem;
  transition: color 0.2s, background-color 0.2s;
  border-radius: 4px;
}

.header-btn:hover {
  background-color: rgba(255,255,255,0.1);
}

.header-close-btn {
  background: none;
  border: none;
  color: #ecf0f1;
  font-size: 1.5rem;
  cursor: pointer;
  line-height: 1;
  padding: 0.25rem 0.5rem;
  transition: color 0.2s, background-color 0.2s;
  border-radius: 4px;
}

.header-close-btn:hover {
  color: #e74c3c;
  background-color: rgba(231, 76, 60, 0.1);
}

.modal-body {
  position: relative;
  flex: 1;
  overflow: hidden;
}

.ifc-viewer-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: #f0f0f0;
  z-index: 10;
}

.viewer-ui {
  position: absolute;
  top: 1rem;
  left: 1rem;
  right: 1rem;
  z-index: 20;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.95);
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  backdrop-filter: blur(4px);
}

.actions-group {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.hidden-input {
  display: none;
}

.action-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.primary-btn {
  background-color: var(--primary, #3498db);
  color: white;
}

.primary-btn:hover {
  background-color: #2980b9;
  transform: translateY(-1px);
}

.secondary-btn {
  background-color: #e2e8f0;
  color: #2c3e50;
}

.secondary-btn:hover {
  background-color: #cbd5e1;
}

/* Dropdown styling */
.dropdown {
  position: relative;
  display: inline-block;
}

.dropdown-content {
  display: none;
  position: absolute;
  background-color: white;
  min-width: 180px;
  box-shadow: 0 8px 16px rgba(0,0,0,0.1);
  border-radius: 6px;
  z-index: 1;
  top: 100%;
  margin-top: 0.5rem;
  overflow: hidden;
}

.dropdown-content.show-dropdown {
  display: block;
  animation: fadeIn 0.2s ease-in-out;
}

.dropdown-content button {
  color: #333;
  padding: 0.75rem 1rem;
  text-decoration: none;
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.2s;
}

.dropdown-content button:hover {
  background-color: #f1f5f9;
  color: var(--primary, #3498db);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #e67e22;
  font-weight: 600;
  font-size: 0.95rem;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 3px solid rgba(230, 126, 34, 0.3);
  border-radius: 50%;
  border-top-color: #e67e22;
  animation: spin 1s ease-in-out infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
