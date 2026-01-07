<template>
  <div class="email-sidebar">
    <div class="sidebar-header">
      <h3>📧 E-Mail</h3>
      <button class="btn-compose" @click="handleCompose">
        ✍️ Verfassen
      </button>
    </div>
    
    <div class="folder-list">
      <div
        v-for="folder in folders"
        :key="folder.id"
        class="folder-item"
        :class="{ active: folder.id === selectedFolder }"
        @click="handleSelectFolder(folder.id)"
      >
        <span class="folder-icon">{{ folder.icon }}</span>
        <span class="folder-name">{{ folder.name }}</span>
        <span v-if="folder.unread > 0" class="unread-badge">
          {{ folder.unread }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import { useEmailStore } from './stores/useEmailStore'

const emailStore = useEmailStore()
const { folders, selectedFolder } = storeToRefs(emailStore)

function handleSelectFolder(folderId) {
  emailStore.selectFolder(folderId)
}

function handleCompose() {
  emailStore.openComposer()
}
</script>

<style scoped>
.email-sidebar {
  background: white;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar-header {
  padding: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
}

.sidebar-header h3 {
  margin: 0 0 1rem 0;
  color: #1e293b;
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-compose {
  width: 100%;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
}

.btn-compose:hover {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  box-shadow: 0 4px 8px rgba(59, 130, 246, 0.4);
  transform: translateY(-1px);
}

.folder-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.folder-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  color: #475569;
  font-size: 0.95rem;
}

.folder-item:hover {
  background-color: #f1f5f9;
}

.folder-item.active {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  color: #1e40af;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(59, 130, 246, 0.1);
}

.folder-icon {
  font-size: 1.2rem;
  flex-shrink: 0;
}

.folder-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.unread-badge {
  background: #3b82f6;
  color: white;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.2rem 0.5rem;
  border-radius: 12px;
  min-width: 20px;
  text-align: center;
}

.folder-item.active .unread-badge {
  background: #1e40af;
}

@media (max-width: 768px) {
  .sidebar-header h3 {
    font-size: 1rem;
  }
  
  .btn-compose {
    font-size: 0.9rem;
    padding: 0.6rem 0.8rem;
  }
  
  .folder-item {
    padding: 0.6rem 0.8rem;
    font-size: 0.9rem;
  }
}
</style>
