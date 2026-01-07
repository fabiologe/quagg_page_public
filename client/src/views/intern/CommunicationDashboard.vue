<template>
  <InternLayout>
    <div class="communication-dashboard">
      <div class="dashboard-grid">
        <!-- Left: Folder Sidebar -->
        <div class="sidebar-column">
          <EmailSidebar />
        </div>
        
        <!-- Middle: Email List -->
        <div class="list-column">
          <EmailList />
        </div>
        
        <!-- Right: Thread View -->
        <div class="thread-column">
          <EmailThreadView />
        </div>
      </div>
      
      <!-- Composer Modal (for new emails) -->
      <div v-if="composerOpen && !replyToEmail" class="composer-modal-overlay" @click.self="handleCloseComposer">
        <div class="composer-modal">
          <EmailComposer />
        </div>
      </div>
    </div>
  </InternLayout>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import InternLayout from '@/components/layout/InternLayout.vue'
import EmailSidebar from '@/features/email/EmailSidebar.vue'
import EmailList from '@/features/email/EmailList.vue'
import EmailThreadView from '@/features/email/EmailThreadView.vue'
import EmailComposer from '@/features/email/EmailComposer.vue'
import { useEmailStore } from '@/features/email/stores/useEmailStore'

const emailStore = useEmailStore()
const { composerOpen, replyToEmail } = storeToRefs(emailStore)

function handleCloseComposer() {
  emailStore.closeComposer()
}
</script>

<style scoped>
.communication-dashboard {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
}

.dashboard-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 400px 1fr;
  gap: 0;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.sidebar-column,
.list-column,
.thread-column {
  height: 100%;
  overflow: hidden;
}

/* Composer Modal */
.composer-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.composer-modal {
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 700px;
  height: 80vh;
  max-height: 700px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Responsive Design */
@media (max-width: 1200px) {
  .dashboard-grid {
    grid-template-columns: 250px 350px 1fr;
  }
}

@media (max-width: 992px) {
  .dashboard-grid {
    grid-template-columns: 220px 300px 1fr;
  }
}

@media (max-width: 768px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
  
  .sidebar-column {
    display: none; /* Hide on mobile, could be toggle menu */
  }
  
  .list-column {
    border-right: none;
  }
  
  .thread-column {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 100;
    background: white;
    display: none; /* Show only when email selected */
  }
  
  /* Show thread when email is selected (handled via JS/class toggle in real app) */
  .thread-column.active {
    display: block;
  }
  
  .composer-modal {
    max-width: 100%;
    height: 100vh;
    max-height: 100vh;
    border-radius: 0;
  }
}

@media (max-width: 480px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
  
  .composer-modal-overlay {
    padding: 0;
  }
}
</style>
