<template>
  <div class="email-list">
    <div class="list-header">
      <h2>{{ currentFolderName }}</h2>
      <span class="email-count">{{ currentFolderEmails.length }} E-Mails</span>
    </div>
    
    <div v-if="currentFolderEmails.length === 0" class="empty-state">
      <p>📭 Keine E-Mails in diesem Ordner</p>
    </div>
    
    <div v-else class="email-items">
      <div
        v-for="email in currentFolderEmails"
        :key="email.id"
        class="email-item"
        :class="{ 
          active: email.id === selectedEmail, 
          unread: !email.read 
        }"
        @click="handleSelectEmail(email.id)"
      >
        <div class="email-header">
          <div class="email-from">
            <span class="from-avatar">{{ getInitials(email.from) }}</span>
            <span class="from-name">{{ email.from }}</span>
          </div>
          <span class="email-date">{{ formatDate(email.date) }}</span>
        </div>
        
        <div class="email-subject">
          <span v-if="!email.read" class="unread-dot">●</span>
          {{ email.subject }}
          <span v-if="email.hasAttachments" class="attachment-icon">📎</span>
        </div>
        
        <div class="email-preview">
          {{ email.preview }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useEmailStore } from './stores/useEmailStore'

const emailStore = useEmailStore()
const { currentFolderEmails, selectedEmail, selectedFolder, folders } = storeToRefs(emailStore)

const currentFolderName = computed(() => {
  const folder = folders.value.find(f => f.id === selectedFolder.value)
  return folder ? folder.name : 'E-Mails'
})

function handleSelectEmail(emailId) {
  emailStore.selectEmail(emailId)
}

function getInitials(name) {
  if (!name) return '?'
  const parts = name.split(' ')
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.substring(0, 2).toUpperCase()
}

function formatDate(date) {
  const now = new Date()
  const emailDate = new Date(date)
  const diffMs = now - emailDate
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 60) {
    return `vor ${diffMins}min`
  } else if (diffHours < 24) {
    return `vor ${diffHours}h`
  } else if (diffDays < 7) {
    return `vor ${diffDays}d`
  } else {
    return emailDate.toLocaleDateString('de-DE', { 
      day: '2-digit', 
      month: '2-digit' 
    })
  }
}
</script>

<style scoped>
.email-list {
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.list-header {
  padding: 1.5rem;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.list-header h2 {
  margin: 0;
  color: #1e293b;
  font-size: 1.3rem;
}

.email-count {
  color: #64748b;
  font-size: 0.9rem;
}

.email-items {
  flex: 1;
  overflow-y: auto;
}

.email-item {
  background: white;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  cursor: pointer;
  transition: all 0.2s;
}

.email-item:hover {
  background: #f8fafc;
}

.email-item.active {
  background: linear-gradient(90deg, #eff6ff 0%, #dbeafe 100%);
  border-left: 3px solid #3b82f6;
}

.email-item.unread {
  background: #fefefe;
}

.email-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.email-from {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}

.from-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 600;
  flex-shrink: 0;
}

.from-name {
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.email-item.unread .from-name {
  font-weight: 700;
}

.email-date {
  color: #64748b;
  font-size: 0.85rem;
  white-space: nowrap;
  margin-left: 0.5rem;
}

.email-subject {
  font-size: 0.95rem;
  color: #334155;
  margin-bottom: 0.4rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.email-item.unread .email-subject {
  font-weight: 600;
  color: #1e293b;
}

.unread-dot {
  color: #3b82f6;
  font-size: 0.6rem;
  line-height: 1;
}

.attachment-icon {
  font-size: 0.9rem;
  margin-left: auto;
}

.email-preview {
  font-size: 0.88rem;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 1rem;
}

.empty-state p {
  margin: 0;
}

@media (max-width: 768px) {
  .list-header {
    padding: 1rem;
  }
  
  .list-header h2 {
    font-size: 1.1rem;
  }
  
  .email-item {
    padding: 0.75rem 1rem;
  }
  
  .from-avatar {
    width: 32px;
    height: 32px;
    font-size: 0.75rem;
  }
}
</style>
