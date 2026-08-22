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

<style scoped src="./shared/modalBase.css"></style>
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
  z-index: var(--isy-z-modal);
  backdrop-filter: blur(2px);
}

.modal-content {
  background: var(--isy-pixel-content-bg);
  border-radius: var(--isy-radius-lg);
  width: 90%;
  max-width: 1000px;
  height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--isy-elev-3);
}

.modal-header {
  padding: var(--isy-space-4);
  background: var(--isy-pixel-bg);
}

.modal-header h3 {
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0;
  color: var(--isy-pixel-text-dim);
}

.modal-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: var(--isy-space-4);
}

.tabs {
  display: flex;
  gap: var(--isy-space-2);
  margin-bottom: var(--isy-space-2);
  border-bottom: 1px solid var(--isy-pixel-text-dim);
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
    margin-bottom: var(--isy-space-2);
}

.copy-btn {
    padding: var(--isy-space-1) var(--isy-space-2);
    font-family: var(--isy-pixel-font);
    font-size: var(--isy-fs-pixel-sm);
    color: var(--isy-pixel-border);
    cursor: var(--isy-cursor-hand);
    background: var(--isy-pixel-content-bg);
    border: 1px solid var(--isy-pixel-text-dim);
    border-radius: var(--isy-radius-sm);
}

.code-view {
  flex: 1;
  background: var(--isy-pixel-content-bg);
  padding: var(--isy-space-4);
  border-radius: var(--isy-radius-sm);
  overflow: auto;
  font-family: monospace;
  font-size: var(--isy-fs-md);
  white-space: pre-wrap;
  border: 1px solid var(--isy-pixel-text-dim);
  margin: 0;
}

</style>
