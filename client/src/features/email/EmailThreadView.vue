<template>
  <div class="email-thread-view">
    <div v-if="!selectedEmailData" class="empty-state">
      <div class="empty-icon">📬</div>
      <h3>Keine E-Mail ausgewählt</h3>
      <p>Wählen Sie eine E-Mail aus der Liste, um sie anzuzeigen</p>
    </div>
    
    <div v-else class="thread-container">
      <div class="thread-header">
        <h2>{{ selectedEmailData.subject }}</h2>
        <div class="thread-actions">
          <button class="btn-action" @click="handleReply" title="Antworten">
            ↩️ Antworten
          </button>
          <button class="btn-action btn-danger" @click="handleDelete" title="Löschen">
            🗑️
          </button>
        </div>
      </div>
      
      <div class="thread-messages">
        <div
          v-for="message in selectedEmailData.thread"
          :key="message.id"
          class="message"
          :class="{ 'message-own': message.from === 'Sie' }"
        >
          <div class="message-header">
            <div class="message-from">
              <span class="message-avatar">{{ getInitials(message.from) }}</span>
              <div class="message-info">
                <span class="message-name">{{ message.from }}</span>
                <span class="message-email">{{ message.fromEmail }}</span>
              </div>
            </div>
            <span class="message-date">{{ formatDateTime(message.date) }}</span>
          </div>
          
          <div class="message-content">
            {{ message.content }}
          </div>
          
          <div v-if="message.attachments && message.attachments.length > 0" class="message-attachments">
            <div class="attachments-label">📎 Anhänge:</div>
            <div
              v-for="attachment in message.attachments"
              :key="attachment.id"
              class="attachment-item"
              @click="handleAttachmentClick(attachment)"
            >
              <span class="attachment-icon">📄</span>
              <div class="attachment-info">
                <span class="attachment-name">{{ attachment.name }}</span>
                <span class="attachment-size">{{ formatSize(attachment.size) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Reply Composer -->
      <div v-if="composerOpen && replyToEmail === selectedEmailData.id" class="reply-section">
        <EmailComposer :email-id="selectedEmailData.id" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import { useEmailStore } from './stores/useEmailStore'
import EmailComposer from './EmailComposer.vue'

const emailStore = useEmailStore()
const { selectedEmailData, composerOpen, replyToEmail } = storeToRefs(emailStore)

function handleReply() {
  emailStore.openComposer(selectedEmailData.value.id)
}

function handleDelete() {
  if (confirm('Möchten Sie diese E-Mail wirklich löschen?')) {
    emailStore.deleteEmail(selectedEmailData.value.id)
  }
}

function handleAttachmentClick(attachment) {
  // Future: Open attachment preview
  alert(`Anhang-Vorschau für: ${attachment.name}\n(Wird in einer zukünftigen Version implementiert)`)
}

function getInitials(name) {
  if (!name) return '?'
  if (name === 'Sie') return 'Q'
  const parts = name.split(' ')
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.substring(0, 2).toUpperCase()
}

function formatDateTime(date) {
  const d = new Date(date)
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
</script>

<style scoped>
.email-thread-view {
  background: white;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  padding: 2rem;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.empty-state h3 {
  color: #64748b;
  margin: 0 0 0.5rem 0;
}

.empty-state p {
  margin: 0;
  font-size: 0.95rem;
}

.thread-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.thread-header {
  padding: 1.5rem;
  border-bottom: 2px solid #e2e8f0;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.thread-header h2 {
  margin: 0;
  color: #1e293b;
  font-size: 1.3rem;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.thread-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-action {
  background: white;
  border: 1px solid #cbd5e1;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
  color: #475569;
  font-weight: 500;
}

.btn-action:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}

.btn-danger:hover {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #dc2626;
}

.thread-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  background: #f8fafc;
}

.message {
  background: white;
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border: 1px solid #e2e8f0;
}

.message-own {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border-color: #bfdbfe;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
  gap: 1rem;
}

.message-from {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}

.message-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  font-weight: 600;
  flex-shrink: 0;
}

.message-own .message-avatar {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}

.message-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.message-name {
  font-weight: 600;
  color: #1e293b;
  font-size: 0.95rem;
}

.message-email {
  font-size: 0.85rem;
  color: #64748b;
}

.message-date {
  font-size: 0.85rem;
  color: #64748b;
  white-space: nowrap;
}

.message-content {
  color: #334155;
  line-height: 1.6;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.message-attachments {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e2e8f0;
}

.attachments-label {
  font-size: 0.85rem;
  color: #64748b;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.attachment-item:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.attachment-icon {
  font-size: 1.5rem;
}

.attachment-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.attachment-name {
  font-size: 0.9rem;
  color: #1e293b;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-size {
  font-size: 0.8rem;
  color: #64748b;
}

.reply-section {
  border-top: 2px solid #e2e8f0;
  background: white;
}

@media (max-width: 768px) {
  .thread-header {
    padding: 1rem;
    flex-direction: column;
    align-items: flex-start;
  }
  
  .thread-header h2 {
    font-size: 1.1rem;
  }
  
  .thread-actions {
    width: 100%;
    justify-content: flex-end;
  }
  
  .thread-messages {
    padding: 1rem;
  }
  
  .message {
    padding: 1rem;
  }
}
</style>
