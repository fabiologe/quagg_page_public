<template>
  <div class="email-list-container">
    <table class="email-table">
      <thead>
        <tr>
          <th>Absender</th>
          <th>Betreff</th>
          <th>Zieldatum</th>
          <th>Anhänge</th>
          <th v-if="showProjectBadge">Projekt</th>
          <th v-if="allowAssign || allowQuarantine" class="actions-col">Aktionen</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="email in emails" :key="email.id">
          <!-- Zeile (kompakt) -->
          <tr 
            class="email-row" 
            :class="{ 'is-expanded': expandedId === email.id }"
            @click="toggleExpand(email.id)"
          >
            <td class="sender-col">
              <div class="sender-name">{{ formatSender(email.sender).name }}</div>
              <div class="sender-mail">{{ formatSender(email.sender).mail }}</div>
            </td>
            <td class="subject-col">
              <span class="subject-text">{{ email.subject || '(Kein Betreff)' }}</span>
            </td>
            <td class="date-col">
              {{ formatDate(email.received_at) }}
            </td>
            <td class="attach-col">
              <span v-if="email.attachments_json?.length" class="attach-badge">
                📎 {{ email.attachments_json.length }}
              </span>
              <span v-if="email.has_quarantined_files" class="quarantine-warn" title="Enthält blockierte Anhänge">
                ⚠️
              </span>
            </td>
            <td v-if="showProjectBadge" class="project-col">
              <span class="project-badge">{{ email.project_id || 'Offen' }}</span>
            </td>
            <td v-if="allowAssign || allowQuarantine" class="actions-col" @click.stop>
              <div class="action-buttons">
                <!-- Dropdown Wrapper for Assignment -->
                <div class="assign-wrapper" v-if="allowAssign">
                  <input 
                    type="text" 
                    v-model="assignInputs[email.id]" 
                    placeholder="Proj-Nr (z.B. 1337)"
                    class="assign-input"
                    list="projects-datalist"
                  />
                  <datalist id="projects-datalist" v-if="projectsList.length">
                    <option v-for="proj in projectsList" :key="proj" :value="proj"></option>
                  </datalist>
                  <button 
                    class="btn-action btn-assign" 
                    :disabled="!assignInputs[email.id]"
                    @click="$emit('assign', { emailId: email.id, projectId: assignInputs[email.id] })"
                  >
                    Zuweisen
                  </button>
                </div>
                <!-- Optional: Löschen / Triage Ablehnen -->
              </div>
            </td>
          </tr>
          
          <!-- Erweiterter Body (Akkordeon) -->
          <tr v-if="expandedId === email.id" class="email-details-row">
            <td :colspan="columnCount" class="details-cell">
              <div class="details-content">
                <div class="email-meta">
                  An: {{ email.recipient }} <br>
                  Erfasst am: {{ formatDate(email.ingested_at) }}
                </div>
                <div class="email-body">
                  <pre v-if="!email.body_html" class="body-text">{{ email.body_text }}</pre>
                  <iframe 
                    v-else 
                    class="body-html-frame" 
                    :srcdoc="email.body_html" 
                    sandbox="allow-same-origin"
                  ></iframe>
                </div>
                <div class="email-attachments" v-if="email.attachments_json?.length">
                  <h4>Gespeicherte Anhänge:</h4>
                  <ul>
                    <li v-for="(att, idx) in email.attachments_json" :key="idx">
                      {{ att.filename }} ({{ formatSize(att.size_bytes) }}) - <span class="path">{{ att.storage_path }}</span>
                    </li>
                  </ul>
                </div>
                <div class="email-quarantined" v-if="email.has_quarantined_files && email.quarantined_attachments_json">
                  <h4 class="text-danger">In Quarantäne verschoben (Gefahr):</h4>
                  <ul>
                    <li v-for="(q, idx) in email.quarantined_attachments_json" :key="idx">
                      {{ q.filename }} ({{ q.detected_mime_type }}) - {{ q.reason }}
                    </li>
                  </ul>
                </div>
              </div>
            </td>
          </tr>
        </template>
        
        <tr v-if="emails.length === 0">
          <td :colspan="columnCount" class="empty-state">
            Keine E-Mails gefunden.
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  emails: {
    type: Array,
    required: true,
    default: () => []
  },
  allowAssign: {
    type: Boolean,
    default: false
  },
  allowQuarantine: {
    type: Boolean,
    default: false
  },
  showProjectBadge: {
    type: Boolean,
    default: false
  },
  projectsList: {
    type: Array,
    default: () => []
  }
})

defineEmits(['assign', 'quarantine', 'delete'])

const expandedId = ref(null)
// Stores input values for assigning to keep track per row
const assignInputs = ref({})

const columnCount = computed(() => {
  let count = 4;
  if (props.showProjectBadge) count++;
  if (props.allowAssign || props.allowQuarantine) count++;
  return count;
})

const toggleExpand = (id) => {
  if (expandedId.value === id) {
    expandedId.value = null
  } else {
    expandedId.value = id
  }
}

// Helpers
const formatSender = (senderStr) => {
  if (!senderStr) return { name: 'Unbekannt', mail: '' }
  // Try to parse "Name <email@domain>"
  const match = senderStr.match(/(.*)<(.*)>/)
  if (match) {
    return { name: match[1].trim() || match[2], mail: match[2].trim() }
  }
  return { name: senderStr, mail: senderStr }
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

const formatSize = (bytes) => {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
</script>

<style scoped>
.email-list-container {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.email-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.email-table th {
  background-color: #f8fafc;
  padding: 1rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 2px solid #e2e8f0;
}

.email-row {
  cursor: pointer;
  transition: background-color 0.15s ease;
  border-bottom: 1px solid #f1f5f9;
}

.email-row:hover {
  background-color: #f8fafc;
}

.email-row.is-expanded {
  background-color: #eff6ff;
  border-bottom: none;
}

.email-row td {
  padding: 1rem;
  vertical-align: middle;
}

.sender-name {
  font-weight: 600;
  color: #1e293b;
}

.sender-mail {
  font-size: 0.85rem;
  color: #64748b;
}

.subject-text {
  color: #334155;
  font-weight: 500;
}

.date-col {
  color: #64748b;
  font-size: 0.9rem;
}

.attach-badge {
  background: #e2e8f0;
  color: #475569;
  padding: 0.2rem 0.5rem;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
}

.quarantine-warn {
  margin-left: 0.5rem;
  cursor: help;
}

.project-badge {
  background: #dbeafe;
  color: #1d4ed8;
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
}

/* Action Dropdown */
.assign-wrapper {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.assign-input {
  border: 1px solid #cbd5e1;
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  font-size: 0.9rem;
  width: 140px;
  outline: none;
  transition: border-color 0.2s;
}

.assign-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.btn-assign {
  background-color: #3b82f6;
  color: white;
  border: none;
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-assign:hover:not(:disabled) {
  background-color: #2563eb;
}

.btn-assign:disabled {
  background-color: #94a3b8;
  cursor: not-allowed;
}

/* Details Accordion */
.email-details-row {
  background-color: #fafaf9;
}

.details-cell {
  padding: 0;
  border-bottom: 2px solid #e2e8f0;
}

.details-content {
  padding: 1.5rem;
  padding-left: 3rem;
  border-left: 4px solid #3b82f6;
}

.email-meta {
  font-size: 0.85rem;
  color: #64748b;
  margin-bottom: 1.5rem;
}

.email-body {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.02);
}

.body-text {
  font-family: inherit;
  white-space: pre-wrap;
  color: #334155;
  line-height: 1.6;
  margin: 0;
}

.body-html-frame {
  width: 100%;
  min-height: 300px;
  border: none;
}

.email-attachments h4 {
  margin-top: 0;
  margin-bottom: 0.5rem;
  color: #334155;
  font-size: 1rem;
}

.email-attachments ul, .email-quarantined ul {
  list-style-type: none;
  padding-left: 0;
}

.email-attachments li, .email-quarantined li {
  padding: 0.5rem;
  background: #f1f5f9;
  border-radius: 6px;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  color: #475569;
}

.email-attachments li .path {
  color: #94a3b8;
  font-size: 0.8rem;
}

.text-danger {
  color: #ef4444 !important;
}

.email-quarantined li {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
}

.empty-state {
  text-align: center;
  padding: 3rem !important;
  color: #64748b;
  font-style: italic;
}
</style>
