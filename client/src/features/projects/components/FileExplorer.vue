<template>
  <div class="file-explorer">
    <div class="explorer-header">
      <div class="breadcrumbs">
        <span 
          class="breadcrumb-item" 
          @click="navigateTo('')"
          :class="{ active: currentPath === '' }"
        >
          Projekte
        </span>
        <template v-for="(part, index) in pathParts" :key="index">
          <span class="separator">/</span>
          <span 
            class="breadcrumb-item" 
            @click="navigateTo(getPathUpTo(index))"
            :class="{ active: index === pathParts.length - 1 }"
          >
            {{ part }}
          </span>
        </template>
      </div>
      <div class="actions">
        <button class="btn-refresh" @click="loadContent" title="Aktualisieren">↻</button>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Lade Inhalte...</p>
    </div>

    <div v-else-if="error" class="error-state">
      {{ error }}
    </div>

    <div v-else class="explorer-content">
      <div v-if="items.length === 0" class="empty-state">
        Dieser Ordner ist leer.
      </div>
      
      <div 
        v-for="item in items" 
        :key="item.path" 
        class="explorer-item"
        :class="item.type"
        @click="handleItemClick(item)"
      >
        <div class="item-icon">
          <span v-if="item.type === 'directory'">📁</span>
          <span v-else-if="isPdf(item.name)">📄</span>
          <span v-else>📃</span>
        </div>
        <div class="item-details">
          <div class="item-name">{{ item.name }}</div>
          <div class="item-meta" v-if="item.type === 'file'">
            {{ formatSize(item.size) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import api from '@/services/api'

const props = defineProps({
  initialPath: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['open-file'])

const currentPath = ref(props.initialPath)
const items = ref([])
const loading = ref(false)
const error = ref(null)

const pathParts = computed(() => {
  if (!currentPath.value) return []
  return currentPath.value.split('/')
})

const getPathUpTo = (index) => {
  return pathParts.value.slice(0, index + 1).join('/')
}

const loadContent = async () => {
  loading.value = true
  error.value = null
  try {
    const res = await api.get('/projects/list', {
      params: { path: currentPath.value }
    })
    items.value = res.data
  } catch (err) {
    console.error(err)
    error.value = 'Fehler beim Laden der Inhalte.'
  } finally {
    loading.value = false
  }
}

const navigateTo = (path) => {
  currentPath.value = path
}

const handleItemClick = (item) => {
  if (item.type === 'directory') {
    currentPath.value = item.path
  } else {
    emit('open-file', item)
  }
}

const isPdf = (filename) => {
  return filename.toLowerCase().endsWith('.pdf')
}

const formatSize = (bytes) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

watch(() => props.initialPath, (newPath) => {
  currentPath.value = newPath
})

watch(currentPath, () => {
  loadContent()
})

onMounted(() => {
  loadContent()
})
</script>

<style scoped>
.file-explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.explorer-header {
  padding: 1rem;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.breadcrumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.breadcrumb-item {
  cursor: pointer;
  color: #64748b;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  transition: all 0.2s;
}

.breadcrumb-item:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.breadcrumb-item.active {
  color: #0f172a;
  font-weight: 600;
  cursor: default;
}

.breadcrumb-item.active:hover {
  background: transparent;
}

.separator {
  color: #cbd5e1;
}

.btn-refresh {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #64748b;
  padding: 0.25rem;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-refresh:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.explorer-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 1rem;
  align-content: start;
}

.explorer-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 1rem;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.explorer-item:hover {
  background: #f1f5f9;
  border-color: #e2e8f0;
}

.item-icon {
  font-size: 3rem;
  margin-bottom: 0.5rem;
}

.item-name {
  font-size: 0.9rem;
  color: #334155;
  word-break: break-word;
  line-height: 1.4;
}

.item-meta {
  font-size: 0.75rem;
  color: #94a3b8;
  margin-top: 0.25rem;
}

.loading-state, .error-state, .empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #64748b;
  padding: 2rem;
}

.spinner {
  width: 30px;
  height: 30px;
  border: 3px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
