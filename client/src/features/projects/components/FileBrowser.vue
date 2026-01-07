<template>
  <div class="file-browser" @click.self="clearSelection">
    <div class="browser-toolbar">
      <div class="path-display">
        / {{ currentPath }}
      </div>
      <div class="view-controls">
        <button>Grid</button>
        <button>List</button>
      </div>
    </div>

    <div class="grid-container">
      <div 
        v-for="file in files" 
        :key="file.id"
        class="file-card"
        @contextmenu.prevent="openContextMenu($event, file)"
      >
        <div class="file-icon">
          {{ getFileIcon(file.name) }}
        </div>
        <div class="file-name">{{ file.name }}</div>
        <div class="file-size">{{ file.size }}</div>
      </div>
    </div>

    <!-- Context Menu -->
    <div 
      v-if="contextMenu.show"
      class="context-menu"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
    >
      <div class="menu-item" @click="handleMakeTask">
        📝 Zu Aufgabe machen
      </div>
      <div class="menu-item delete">
        🗑️ Löschen
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  currentPath: {
    type: String,
    default: 'Root'
  }
})

// Mock Files
const files = ref([
  { id: 1, name: 'Rechnung_Dezember.pdf', size: '2.4 MB' },
  { id: 2, name: 'Grundriss_EG.dxf', size: '12 MB' },
  { id: 3, name: 'Baustellenfoto_01.jpg', size: '4.1 MB' },
  { id: 4, name: 'Baustellenfoto_02.jpg', size: '3.8 MB' },
  { id: 5, name: 'Notizen.txt', size: '12 KB' },
])

const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  targetFile: null
})

const getFileIcon = (name) => {
  if (name.endsWith('.pdf')) return '📄'
  if (name.endsWith('.jpg')) return '🖼️'
  if (name.endsWith('.dxf')) return '📐'
  return '📃'
}

const openContextMenu = (event, file) => {
  contextMenu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY,
    targetFile: file
  }
}

const clearSelection = () => {
  contextMenu.value.show = false
}

const handleMakeTask = () => {
  if (contextMenu.value.targetFile) {
    let message = `Erstelle Aufgabe für: ${contextMenu.value.targetFile.name}`
    
    // Smart Context: Extract LPH from path
    const lphMatch = props.currentPath.match(/(\d{2})_/)
    if (lphMatch) {
      const lphIndex = parseInt(lphMatch[1], 10)
      message += `\nAutomatisch zugeordnet zu LPH ${lphIndex}`
    }
    
    alert(message)
    // TODO: Emit event or call API with { file: ..., lph: lphIndex }
  }
  contextMenu.value.show = false
}

// Close context menu on global click
const closeMenu = () => {
  contextMenu.value.show = false
}

onMounted(() => {
  window.addEventListener('click', closeMenu)
})

onUnmounted(() => {
  window.removeEventListener('click', closeMenu)
})
</script>

<style scoped>
.file-browser {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: white;
}

.browser-toolbar {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
}

.path-display {
  font-family: monospace;
  color: #475569;
  background: #f1f5f9;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.grid-container {
  flex: 1;
  padding: 1.5rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 1.5rem;
  align-content: start;
}

.file-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 1rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.file-card:hover {
  background: #f1f5f9;
}

.file-icon {
  font-size: 3rem;
  margin-bottom: 0.5rem;
}

.file-name {
  font-size: 0.9rem;
  color: #334155;
  word-break: break-all;
  line-height: 1.4;
  margin-bottom: 0.25rem;
}

.file-size {
  font-size: 0.75rem;
  color: #94a3b8;
}

.context-menu {
  position: fixed;
  z-index: 1000;
  background: white;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  min-width: 180px;
  overflow: hidden;
}

.menu-item {
  padding: 0.75rem 1rem;
  cursor: pointer;
  font-size: 0.9rem;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.menu-item:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.menu-item.delete {
  color: #dc2626;
  border-top: 1px solid #f1f5f9;
}

.menu-item.delete:hover {
  background: #fef2f2;
}
</style>
