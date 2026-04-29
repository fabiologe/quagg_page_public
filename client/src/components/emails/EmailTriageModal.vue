<template>
  <div class="triage-modal-overlay" @click.self="$emit('close')">
    <div class="triage-modal">
      <div class="modal-header">
        <div class="title-area">
          <h3>Triage Inbox (info@quagg-engineering.org)</h3>
          <span class="subtitle">Zuweisung offener E-Mails</span>
        </div>
        <div class="actions-area">
          <button class="btn-refresh" @click="fetchMails" :disabled="isLoading">
            <span v-if="isLoading">⏳ Lade...</span>
            <span v-else>🔄 Aktualisieren</span>
          </button>
          <button class="btn-close" @click="$emit('close')">×</button>
        </div>
      </div>

      <div class="modal-body">
        <div v-if="errorMsg" class="error-banner">
          {{ errorMsg }}
        </div>

        <EmailListTable 
          :emails="unassignedMails"
          :projects-list="projectIds"
          :allow-assign="authStore.canManageGlobalInbox"
          :allow-quarantine="authStore.canManageGlobalInbox"
          :show-project-badge="false"
          @assign="handleAssign"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import EmailListTable from '@/components/emails/EmailListTable.vue'
import { useAuthStore } from '@/stores/useAuthStore'
import { emailApi } from '@/services/emailApi'
import { projectApi } from '@/services/projectApi'

const authStore = useAuthStore()

const unassignedMails = ref([])
const projectIds = ref([])
const isLoading = ref(false)
const errorMsg = ref('')

defineEmits(['close'])

const fetchMails = async () => {
  isLoading.value = true
  errorMsg.value = ''
  try {
    const [emailRes, projRes] = await Promise.all([
      emailApi.getUnassigned(0, 50),
      projectApi.getAllIds()
    ])
    unassignedMails.value = emailRes.data || []
    projectIds.value = projRes.data || []
  } catch (error) {
    console.error('Fehler beim Laden der API Daten:', error)
    errorMsg.value = 'Daten konnten nicht geladen werden.'
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
.triage-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050;
  padding: 1rem;
}

.triage-modal {
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 1200px;
  height: 85vh;
  max-height: 850px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8fafc;
}

.title-area h3 {
  color: #1e293b;
  margin: 0 0 0.25rem 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.subtitle {
  color: #64748b;
  font-size: 0.9rem;
}

.actions-area {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.btn-refresh {
  background-color: white;
  color: #475569;
  border: 1px solid #cbd5e1;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-refresh:hover:not(:disabled) {
  background-color: #f1f5f9;
  color: #1e293b;
}

.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-close {
  background: transparent;
  border: none;
  font-size: 1.8rem;
  line-height: 1;
  color: #94a3b8;
  cursor: pointer;
  padding: 0 0.5rem;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-close:hover {
  color: #ef4444;
  background-color: #fee2e2;
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1;
  background: #f1f5f9;
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

@media (max-width: 768px) {
  .triage-modal {
    height: 100vh;
    max-height: 100vh;
    border-radius: 0;
  }
  .triage-modal-overlay {
    padding: 0;
  }
}
</style>
