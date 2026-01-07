<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click.self="close">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Simulationsdaten (Debug)</h3>
          <button class="close-btn" @click="close">×</button>
        </div>

        <div class="modal-body">
          <div class="tabs">
            <button 
              :class="['tab-btn', { active: activeTab === 'input' }]"
              @click="activeTab = 'input'"
            >
              Input (.inp)
            </button>
            <button 
              :class="['tab-btn', { active: activeTab === 'report' }]"
              @click="activeTab = 'report'"
            >
              Report (.rpt)
            </button>
          </div>

          <div class="tab-content" v-if="activeTab === 'input'">
            <div class="actions-bar">
                <button class="copy-btn" @click="copyToClipboard(inputText)">Kopieren</button>
            </div>
            <pre class="code-view">{{ inputText }}</pre>
          </div>

          <div class="tab-content" v-if="activeTab === 'report'">
             <div class="actions-bar">
                <button class="copy-btn" @click="copyToClipboard(reportText)">Kopieren</button>
            </div>
            <pre class="code-view">{{ reportText }}</pre>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
  isOpen: Boolean,
  inputText: {
      type: String,
      default: ''
  },
  reportText: {
      type: String,
      default: ''
  }
});

const emit = defineEmits(['close']);

const activeTab = ref('report'); // Default to report as it shows results

const close = () => {
  emit('close');
};

const copyToClipboard = async (text) => {
    try {
        await navigator.clipboard.writeText(text);
        alert("In die Zwischenablage kopiert!");
    } catch (err) {
        console.error("Copy failed", err);
    }
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.modal-content {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 1000px;
  height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
}

.modal-header {
  padding: 1rem;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  color: #2c3e50;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: #94a3b8; /* Slate 400 */
  transition: color 0.2s;
  padding: 0 0.5rem;
}

.close-btn:hover {
  color: #ef4444; /* Red 500 */
}

.modal-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 1rem;
}

.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid #eee;
}

.tab-btn {
  padding: 0.5rem 1rem;
  border: none;
  background: none;
  cursor: pointer;
  font-weight: 500;
  color: #7f8c8d;
  border-bottom: 2px solid transparent;
}

.tab-btn.active {
  color: #3498db;
  border-bottom: 2px solid #3498db;
}

.tab-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}

.actions-bar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 0.5rem;
}

.copy-btn {
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
    cursor: pointer;
    background: #f8f9fa;
    border: 1px solid #ddd;
    border-radius: 3px;
}

.code-view {
  flex: 1;
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 4px;
  overflow: auto;
  font-family: monospace;
  font-size: 0.85rem;
  white-space: pre-wrap;
  border: 1px solid #eee;
  margin: 0;
}
</style>
