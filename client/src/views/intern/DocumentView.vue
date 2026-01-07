<template>
  <div class="document-view">
    <div v-if="loading" class="loading">
      <div class="spinner">↻</div>
      <p>Lade Dokument...</p>
    </div>
    <div v-else-if="error" class="error">
      {{ error }}
    </div>
    <DocReader
      v-else
      :src="docSrc"
      :title="docTitle"
      :doc-id="route.params.id"
      :save-endpoint="`/library/save/${route.params.id}`"
      :is-embedded="true"
      @close="closeTab"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import DocReader from '@/features/documents/components/DocReader.vue'

const route = useRoute()
const loading = ref(true)
const error = ref(null)
const docSrc = ref(null)
const docTitle = ref('')

const closeTab = () => {
  window.close()
}

const fetchDocument = async () => {
  const docId = route.params.id
  try {
    // 1. Get Metadata for title
    // We might need a separate endpoint for metadata if we want to avoid fetching the list
    // For now, we fetch the blob directly and use a generic title or fetch metadata if possible.
    // Let's try to fetch the blob.
    
    // Actually, we need the title. Let's assume we can get it from the list or add a metadata endpoint.
    // Since we don't have a specific "get metadata" endpoint yet (only list), 
    // we'll just fetch the file and use the filename from the header if possible, or just "Dokument".
    
    // Better: Fetch the blob.
    const res = await api.get(`/library/download/${docId}`, { 
      params: { t: Date.now() },
      responseType: 'blob' 
    })
    
    docSrc.value = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
    
    // Try to get filename from content-disposition if available, otherwise default
    const contentDisposition = res.headers['content-disposition']
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^"]+)"?/)
      if (match) docTitle.value = match[1]
    } else {
      docTitle.value = `Dokument ${docId}`
    }

  } catch (err) {
    console.error('Failed to load document', err)
    error.value = 'Dokument konnte nicht geladen werden.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchDocument()
})

onBeforeUnmount(() => {
  if (docSrc.value) {
    window.URL.revokeObjectURL(docSrc.value)
  }
})
</script>

<style scoped>
.document-view {
  width: 100vw;
  height: 100vh;
  background: #f5f5f5;
}

.loading, .error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #7f8c8d;
}

.spinner {
  font-size: 2rem;
  margin-bottom: 1rem;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
