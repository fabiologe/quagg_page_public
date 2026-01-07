<template>
  <InternLayout>
    <div class="library-container">
      <div class="library-header">
        <h1>Bibliothek</h1>
        <button 
          @click="scanLibrary" 
          class="btn-primary"
          :disabled="scanning"
        >
          <span v-if="scanning" class="spinner">↻</span>
          {{ scanning ? 'Aktualisiere...' : 'Bibliothek aktualisieren' }}
        </button>
      </div>

      <div class="library-content">
        <!-- Sidebar Filters -->
        <div class="sidebar">
          <div class="card">
            <h3>Gewerke</h3>
            <div class="filter-list">
              <label class="filter-item">
                <input 
                  type="radio" 
                  v-model="selectedCategory" 
                  :value="null" 
                >
                <span>Alle</span>
              </label>
              <label 
                v-for="cat in categories" 
                :key="cat" 
                class="filter-item"
              >
                <input 
                  type="radio" 
                  v-model="selectedCategory" 
                  :value="cat" 
                >
                <span>{{ cat }}</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Main Content -->
        <div class="main-area">
          <!-- Search -->
          <div class="search-bar">
            <input 
              v-model="searchQuery" 
              @input="debouncedSearch"
              type="text" 
              placeholder="Suche nach Dokumenten..." 
            >
          </div>

          <!-- Document Grid -->
          <div v-if="loading" class="loading-state">
            <div class="spinner large">↻</div>
            <p>Lade Dokumente...</p>
          </div>

          <div v-else-if="documents.length === 0" class="empty-state">
            <p>Keine Dokumente gefunden.</p>
          </div>

          <div v-else class="document-grid">
            <div 
              v-for="doc in documents" 
              :key="doc.id" 
              class="document-card"
            >
              <div class="card-header">
                <div class="icon-pdf">PDF</div>
                <div class="card-info">
                  <h4 :title="doc.title">{{ doc.title }}</h4>
                  <p>{{ doc.category }}</p>
                </div>
              </div>
              
              <div class="card-footer">
                <span>{{ formatSize(doc.size_bytes) }}</span>
                <a 
                  href="#" 
                  @click.prevent="openDocument(doc)" 
                  class="link-open"
                >
                  Öffnen ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>


  </InternLayout>
</template>

<script setup>
import InternLayout from '@/components/layout/InternLayout.vue'
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'

const router = useRouter()

const documents = ref([])
const categories = ref([])
const selectedCategory = ref(null)
const searchQuery = ref('')
const loading = ref(false)
const scanning = ref(false)

// Reader State
const showReader = ref(false)
const currentDoc = ref(null)
const currentDocSrc = ref(null)

const fetchCategories = async () => {
  try {
    const res = await api.get('/library/categories')
    categories.value = res.data
  } catch (err) {
    console.error('Failed to fetch categories', err)
  }
}

const fetchDocuments = async () => {
  loading.value = true
  try {
    const params = {}
    if (selectedCategory.value) params.category = selectedCategory.value
    if (searchQuery.value) params.search = searchQuery.value
    
    const res = await api.get('/library/documents', { params })
    documents.value = res.data
  } catch (err) {
    console.error('Failed to fetch documents', err)
  } finally {
    loading.value = false
  }
}

const scanLibrary = async () => {
  scanning.value = true
  try {
    await api.post('/library/scan')
    await fetchCategories()
    await fetchDocuments()
  } catch (err) {
    alert('Scan failed: ' + (err.response?.data?.detail || err.message))
  } finally {
    scanning.value = false
  }
}

const openDocument = (doc) => {
  const url = router.resolve({ 
    name: 'document-view', 
    params: { id: doc.id } 
  }).href
  
  // Calculate center of screen
  const width = window.screen.width * 0.9
  const height = window.screen.height * 0.9
  const left = (window.screen.width - width) / 2
  const top = (window.screen.height - height) / 2
  
  window.open(
    url, 
    'QuaggReader', 
    `popup=yes,width=${width},height=${height},top=${top},left=${left},toolbar=no,menubar=no,location=no,status=no`
  )
}

const downloadDocument = async (doc) => {
  try {
    const res = await api.get(`/library/download/${doc.id}`, { 
      responseType: 'blob' 
    })
    
    // Create blob link to download
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', doc.filename)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  } catch (err) {
    console.error('Download failed', err)
    alert('Download failed: ' + (err.response?.status === 401 ? 'Unauthorized' : 'Error'))
  }
}

const formatSize = (bytes) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

let debounceTimeout
const debouncedSearch = () => {
  clearTimeout(debounceTimeout)
  debounceTimeout = setTimeout(fetchDocuments, 300)
}

watch(selectedCategory, fetchDocuments)

onMounted(() => {
  fetchCategories()
  fetchDocuments()
})
</script>

<style scoped>
.library-container {
  max-width: 1200px;
  margin: 0 auto;
}

.library-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.library-header h1 {
  font-size: 1.8rem;
  color: #2c3e50;
}

.btn-primary {
  background-color: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  transition: background-color 0.2s;
}

.btn-primary:hover {
  background-color: #2980b9;
}

.btn-primary:disabled {
  background-color: #95a5a6;
  cursor: not-allowed;
}

.library-content {
  display: flex;
  gap: 2rem;
}

.sidebar {
  width: 250px;
  flex-shrink: 0;
}

.card {
  background: white;
  padding: 1rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.card h3 {
  margin-bottom: 1rem;
  color: #34495e;
  font-size: 1.1rem;
}

.filter-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  color: #2c3e50;
}

.main-area {
  flex: 1;
}

.search-bar {
  margin-bottom: 2rem;
}

.search-bar input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s;
}

.search-bar input:focus {
  border-color: #3498db;
}

.document-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1rem;
}

.document-card {
  background: white;
  padding: 1rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  border: 1px solid #eee;
  display: flex;
  flex-direction: column;
  transition: transform 0.2s, box-shadow 0.2s;
}

.document-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.card-header {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.icon-pdf {
  background-color: #ffebee;
  color: #e74c3c;
  padding: 0.5rem;
  border-radius: 4px;
  font-weight: bold;
  font-size: 0.8rem;
  height: fit-content;
}

.card-info {
  flex: 1;
  min-width: 0;
}

.card-info h4 {
  font-size: 1rem;
  color: #2c3e50;
  margin: 0 0 0.25rem 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-info p {
  font-size: 0.85rem;
  color: #7f8c8d;
  margin: 0;
}

.card-footer {
  margin-top: auto;
  padding-top: 0.75rem;
  border-top: 1px solid #f0f0f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  color: #95a5a6;
}

.link-open {
  color: #3498db;
  text-decoration: none;
  font-weight: 500;
}

.link-open:hover {
  text-decoration: underline;
}

.loading-state, .empty-state {
  text-align: center;
  padding: 3rem;
  color: #7f8c8d;
}

.spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}

.spinner.large {
  font-size: 2rem;
  margin-bottom: 1rem;
  color: #3498db;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .library-content {
    flex-direction: column;
  }
  .sidebar {
    width: 100%;
  }
}
</style>
