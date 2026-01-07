<template>
  <div class="project-workspace">
    <!-- Sidebar -->
    <div class="workspace-sidebar">
      <FileTree 
        :items="projectStructure" 
        :selectedId="currentSelection.id"
        @select="handleSelection"
      />
    </div>

    <!-- Main Content -->
    <div class="workspace-main">
      <template v-if="currentSelection">
        <!-- Show Kanban for Root Projects -->
        <KanbanBoard 
          v-if="currentSelection.type === 'project'" 
        />
        
        <!-- Show FileBrowser for Folders -->
        <FileBrowser 
          v-else-if="currentSelection.type === 'folder'"
          :currentPath="currentSelection.path"
        />
        
        <div v-else class="empty-selection">
          Bitte wählen Sie ein Projekt oder einen Ordner aus.
        </div>
      </template>
      <div v-else class="empty-selection">
        Wählen Sie links ein Element aus.
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import FileTree from './components/FileTree.vue'
import KanbanBoard from './components/KanbanBoard.vue'
import FileBrowser from './components/FileBrowser.vue'

// Mock Data for Tree - Updated with HOAI LPH
const projectStructure = ref([
  { 
    id: 'p1', 
    name: 'Projekt A (Neubau)', 
    type: 'project',
    children: [
      { id: 'f01', name: '01_Grundlagen', type: 'folder', path: 'Projekt A/01_Grundlagen', lph: 1 },
      { id: 'f02', name: '02_Vorplanung', type: 'folder', path: 'Projekt A/02_Vorplanung', lph: 2 },
      { id: 'f03', name: '03_Entwurf', type: 'folder', path: 'Projekt A/03_Entwurf', lph: 3 },
      { id: 'f04', name: '04_Genehmigung', type: 'folder', path: 'Projekt A/04_Genehmigung', lph: 4 },
      { id: 'f05', name: '05_Ausfuehrung', type: 'folder', path: 'Projekt A/05_Ausfuehrung', lph: 5 },
      { id: 'f06', name: '06_Vorbereitung', type: 'folder', path: 'Projekt A/06_Vorbereitung', lph: 6 },
      { id: 'f07', name: '07_Mitwirkung', type: 'folder', path: 'Projekt A/07_Mitwirkung', lph: 7 },
      { id: 'f08', name: '08_Ueberwachung', type: 'folder', path: 'Projekt A/08_Ueberwachung', lph: 8 },
      { id: 'f09', name: '09_Dokumentation', type: 'folder', path: 'Projekt A/09_Dokumentation', lph: 9 },
      { id: 'f_other', name: 'Sonstiges', type: 'folder', path: 'Projekt A/Sonstiges' }
    ]
  },
  { 
    id: 'p2', 
    name: 'Projekt B (Sanierung)', 
    type: 'project',
    children: []
  }
])

// State
const currentSelection = ref({ 
  id: 'p1', 
  type: 'project', 
  name: 'Projekt A (Neubau)' 
})

const handleSelection = (item) => {
  currentSelection.value = item
}
</script>

<style scoped>
.project-workspace {
  display: flex;
  height: 100vh; /* Full viewport height or adjust as needed for layout */
  overflow: hidden;
  background: white;
}

.workspace-sidebar {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid #e2e8f0;
}

.workspace-main {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.empty-selection {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 1.1rem;
}
</style>
