<template>
  <InternLayout>
    <div class="projects-view">
      <!-- Dashboard Section -->
      <div class="dashboard-container">
        <h1>Projekt Übersicht</h1>
        <div class="dashboard-actions">
          <button class="btn-primary" @click="openExplorer()">
            <span class="icon">📂</span>
            Dateimanager öffnen
          </button>
        </div>
        
        <div class="dashboard-stats">
          <div class="stat-card clickable" @click="openExplorer('01_Laufend')">
            <h3>Aktive Projekte</h3>
            <p class="stat-value">12</p>
            <span class="card-hint">Ordner öffnen →</span>
          </div>
          <div class="stat-card clickable" @click="openExplorer('00_Angebote')">
            <h3>Offene Angebote</h3>
            <p class="stat-value">5</p>
            <span class="card-hint">Ordner öffnen →</span>
          </div>
          <div class="stat-card clickable" @click="openExplorer('03_Abgeschlossen')">
            <h3>Abgeschlossen</h3>
            <p class="stat-value">8</p>
            <span class="card-hint">Ordner öffnen →</span>
          </div>
        </div>
      </div>

      <!-- File Explorer Modal -->
      <div v-if="showExplorer" class="modal-overlay explorer-overlay" @click.self="closeExplorer">
        <div class="modal-content explorer-modal">
          <div class="modal-header">
            <span class="modal-title">Dateimanager</span>
            <button class="btn-close" @click="closeExplorer">×</button>
          </div>
          <div class="modal-body">
            <FileExplorer :initial-path="explorerPath" @open-file="handleOpenFile" />
          </div>
        </div>
      </div>
      
      <!-- Document Viewer Modal (Higher z-index) -->
      <div v-if="selectedFile" class="modal-overlay doc-overlay" @click.self="closeFile">
        <div class="modal-content doc-modal">
          <div class="modal-header">
            <span class="doc-title">{{ selectedFile.name }}</span>
            <button class="btn-close" @click="closeFile">×</button>
          </div>
          <div class="modal-body">
            <DocReader
              v-if="isPdf(selectedFile.name)"
              :src="fileUrl"
              :title="selectedFile.name"
              :save-endpoint="`/projects/save?path=${encodeURIComponent(selectedFile.path)}`"
              :is-embedded="true"
              @close="closeFile"
            />
            <div v-else class="unsupported-file">
              <p>Diese Datei kann nicht direkt angezeigt werden.</p>
              <a :href="fileUrl" download class="btn-download">Herunterladen</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </InternLayout>
</template>

<script setup>
import { ref, computed } from 'vue'
import InternLayout from '@/components/layout/InternLayout.vue'
import FileExplorer from '@/features/projects/components/FileExplorer.vue'
import DocReader from '@/features/documents/components/DocReader.vue'
import api from '@/services/api'

const showExplorer = ref(false)
const explorerPath = ref('')
const selectedFile = ref(null)

const fileUrl = computed(() => {
  if (!selectedFile.value) return ''
  return `${api.defaults.baseURL}/projects/file?path=${encodeURIComponent(selectedFile.value.path)}`
})

const openExplorer = (path = '') => {
  explorerPath.value = path
  showExplorer.value = true
}

const closeExplorer = () => {
  showExplorer.value = false
}

const handleOpenFile = (file) => {
  selectedFile.value = file
}

const closeFile = () => {
  selectedFile.value = null
}

const isPdf = (filename) => {
  return filename.toLowerCase().endsWith('.pdf')
}
</script>

<style scoped>
.projects-view {
  height: 100%;
  padding: 2rem;
  box-sizing: border-box;
  background-color: #f8fafc;
}

.dashboard-container {
  max-width: 1200px;
  margin: 0 auto;
}

.dashboard-container h1 {
  color: #1e293b;
  margin-bottom: 2rem;
}

.dashboard-actions {
  margin-bottom: 3rem;
}

.btn-primary {
  background-color: #3b82f6;
  color: white;
  border: none;
  padding: 1rem 2rem;
  border-radius: 8px;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: background-color 0.2s;
  box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.5);
}

.btn-primary:hover {
  background-color: #2563eb;
}

.dashboard-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 2rem;
}

.stat-card {
  background: white;
  padding: 1.5rem;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;
  display: flex;
  flex-direction: column;
}

.stat-card.clickable {
  cursor: pointer;
}

.stat-card.clickable:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

.stat-card h3 {
  color: #64748b;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}

.stat-value {
  font-size: 2.5rem;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 0.5rem;
}

.card-hint {
  font-size: 0.85rem;
  color: #3b82f6;
  font-weight: 500;
  margin-top: auto;
  opacity: 0;
  transform: translateX(-10px);
  transition: all 0.2s;
}

.stat-card:hover .card-hint {
  opacity: 1;
  transform: translateX(0);
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0; /* Remove padding for full screen feel */
  box-sizing: border-box;
  backdrop-filter: blur(4px);
  z-index: 1000;
}

.explorer-overlay {
  z-index: 1000;
}

.doc-overlay {
  z-index: 1100; /* Higher than explorer */
}

.modal-content {
  background: white;
  /* Full screen on mobile/PWA, slightly smaller on desktop */
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  border-radius: 0; /* No radius for full screen */
  display: flex;
  flex-direction: column;
  box-shadow: none;
  overflow: hidden;
}

@media (min-width: 768px) {
  .modal-content {
    width: 95%;
    height: 95%;
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  }
  
  .modal-overlay {
    padding: 1rem;
  }
}

.modal-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f8fafc;
}

.modal-title, .doc-title {
  font-weight: 600;
  color: #334155;
  font-size: 1.1rem;
}

.btn-close {
  background: none;
  border: none;
  font-size: 2rem;
  line-height: 1;
  color: #94a3b8;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-close:hover {
  color: #ef4444;
  background-color: #fee2e2;
}

.modal-body {
  flex: 1;
  overflow: hidden;
  position: relative;
  background: white;
}

.unsupported-file {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #64748b;
  gap: 1rem;
}

.btn-download {
  background: #3b82f6;
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  text-decoration: none;
  font-weight: 500;
  transition: background 0.2s;
}

.btn-download:hover {
  background: #2563eb;
}
</style>
