<template>
  <InternLayout>
    <div class="triage-inbox-view">
      <div class="header-section">
        <div class="title-area">
          <h1>Triage Inbox</h1>
          <p class="subtitle">Globale, noch nicht zugewiesene E-Mails aus info@quagg-engineering.org</p>
        </div>
        <div class="actions-area">
          <button class="btn-secondary" @click="fetchMails" :disabled="isLoading">
            <span v-if="isLoading">⏳ Lade...</span>
            <span v-else>🔄 Aktualisieren</span>
          </button>
        </div>
      </div>

      <div class="content-section">
        <div v-if="errorMsg" class="error-banner">
          {{ errorMsg }}
        </div>

        <!-- Smart Wrapper um die Dumb Table -->
        <EmailListTable 
          :emails="unassignedMails"
          :allow-assign="authStore.canManageGlobalInbox"
          :allow-quarantine="authStore.canManageGlobalInbox"
          :show-project-badge="false"
          @assign="handleAssign"
        />
        
      </div>
    </div>
  </InternLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import InternLayout from '@/components/layout/InternLayout.vue'
import EmailListTable from '@/components/emails/EmailListTable.vue'
import { useAuthStore } from '@/stores/useAuthStore'
import { emailApi } from '@/services/emailApi'

const authStore = useAuthStore()

const unassignedMails = ref([])
const isLoading = ref(false)
const errorMsg = ref('')

const fetchMails = async () => {
  isLoading.value = true
  errorMsg.value = ''
  try {
    const response = await emailApi.getUnassigned(0, 50)
    // FastAPI gibt direkt die Liste auf der Root-Ebene der Response zurück 
    // oder unter response.data (Axios-Standard)
    unassignedMails.value = response.data || []
  } catch (error) {
    console.error('Fehler beim Laden der Inbox:', error)
    errorMsg.value = 'Mails konnten nicht geladen werden. Bitte prüfen Sie Ihre Verbindung.'
  } finally {
    isLoading.value = false
  }
}

const handleAssign = async ({ emailId, projectId }) => {
  if (!projectId) return

  try {
    isLoading.value = true
    await emailApi.assignToProject(emailId, projectId)
    
    // Nach Erfolg: Mail aus Liste werfen
    unassignedMails.value = unassignedMails.value.filter(m => m.id !== emailId)
    
    // Optional: Toast/Notification
    alert(`E-Mail erfolgreich zu Projekt ${projectId} zugewiesen.`)
  } catch (error) {
    console.error('Zuweisungs-Fehler:', error)
    alert(error.response?.data?.detail || 'Fehler beim Zuweisen der E-Mail.')
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  if (authStore.canManageGlobalInbox) {
    fetchMails()
  } else {
    errorMsg.value = 'Sie haben keine Berechtigung, die globale Inbox einzusehen.'
  }
})
</script>

<style scoped>
.triage-inbox-view {
  height: 100%;
  padding: 2rem;
  box-sizing: border-box;
  background-color: #f8fafc;
  max-width: 1400px;
  margin: 0 auto;
}

.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.title-area h1 {
  color: #1e293b;
  margin: 0 0 0.5rem 0;
  font-size: 2rem;
}

.subtitle {
  color: #64748b;
  margin: 0;
  font-size: 1rem;
}

.btn-secondary {
  background-color: white;
  color: #475569;
  border: 1px solid #cbd5e1;
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.btn-secondary:hover:not(:disabled) {
  background-color: #f1f5f9;
  color: #1e293b;
}

.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-banner {
  background: #fee2e2;
  color: #991b1b;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  border: 1px solid #fca5a5;
  font-weight: 500;
}
</style>
