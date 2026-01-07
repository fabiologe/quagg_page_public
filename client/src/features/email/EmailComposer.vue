<template>
  <div class="email-composer">
    <div class="composer-header">
      <h3>{{ isNewEmail ? '✍️ Neue E-Mail' : '↩️ Antworten' }}</h3>
      <button class="btn-close-composer" @click="handleClose">×</button>
    </div>
    
    <div class="composer-form">
      <div v-if="isNewEmail" class="form-field">
        <label>An:</label>
        <input
          v-model="recipient"
          type="email"
          placeholder="empfaenger@example.com"
          class="input-field"
        >
      </div>
      
      <div v-if="isNewEmail" class="form-field">
        <label>Betreff:</label>
        <input
          v-model="subject"
          type="text"
          placeholder="E-Mail Betreff"
          class="input-field"
        >
      </div>
      
      <div v-else class="reply-info">
        <span>Antwort an: <strong>{{ replyTo }}</strong></span>
      </div>
      
      <div class="form-field form-field-content">
        <label>Nachricht:</label>
        <textarea
          v-model="content"
          placeholder="Ihre Nachricht..."
          class="textarea-field"
          rows="10"
        ></textarea>
      </div>
      
      <div class="composer-actions">
        <button class="btn-send" @click="handleSend" :disabled="!canSend">
          📤 Senden
        </button>
        <button class="btn-cancel" @click="handleClose">
          Abbrechen
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useEmailStore } from './stores/useEmailStore'

const props = defineProps({
  emailId: {
    type: Number,
    default: null
  }
})

const emailStore = useEmailStore()
const { selectedEmailData } = storeToRefs(emailStore)

const recipient = ref('')
const subject = ref('')
const content = ref('')

const isNewEmail = computed(() => props.emailId === null)

const replyTo = computed(() => {
  if (!selectedEmailData.value) return ''
  return `${selectedEmailData.value.from} <${selectedEmailData.value.fromEmail}>`
})

const canSend = computed(() => {
  if (isNewEmail.value) {
    return recipient.value.trim() !== '' && 
           subject.value.trim() !== '' && 
           content.value.trim() !== ''
  }
  return content.value.trim() !== ''
})

function handleSend() {
  if (!canSend.value) return
  
  if (isNewEmail.value) {
    // New email logic (future implementation)
    alert('Neue E-Mail wird gesendet...\n(Backend-Integration folgt)')
    handleClose()
  } else {
    // Reply logic
    emailStore.sendReply(props.emailId, content.value)
    content.value = ''
  }
}

function handleClose() {
  emailStore.closeComposer()
  recipient.value = ''
  subject.value = ''
  content.value = ''
}
</script>

<style scoped>
.email-composer {
  display: flex;
  flex-direction: column;
  background: white;
  height: 100%;
}

.composer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.composer-header h3 {
  margin: 0;
  color: #1e293b;
  font-size: 1.1rem;
}

.btn-close-composer {
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

.btn-close-composer:hover {
  color: #ef4444;
  background-color: #fee2e2;
}

.composer-form {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-field-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.form-field label {
  font-weight: 600;
  color: #475569;
  font-size: 0.9rem;
}

.input-field {
  padding: 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s;
}

.input-field:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.textarea-field {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.95rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
  resize: vertical;
  min-height: 200px;
}

.textarea-field:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.reply-info {
  padding: 0.75rem;
  background: #f1f5f9;
  border-radius: 6px;
  font-size: 0.9rem;
  color: #475569;
}

.reply-info strong {
  color: #1e293b;
}

.composer-actions {
  display: flex;
  gap: 0.75rem;
  padding-top: 0.5rem;
}

.btn-send {
  flex: 1;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
}

.btn-send:hover:not(:disabled) {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  box-shadow: 0 4px 8px rgba(59, 130, 246, 0.4);
  transform: translateY(-1px);
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-cancel {
  background: white;
  color: #64748b;
  border: 1px solid #cbd5e1;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: #f8fafc;
  border-color: #94a3b8;
}

@media (max-width: 768px) {
  .composer-header {
    padding: 0.75rem 1rem;
  }
  
  .composer-form {
    padding: 1rem;
  }
  
  .textarea-field {
    min-height: 150px;
  }
}
</style>
