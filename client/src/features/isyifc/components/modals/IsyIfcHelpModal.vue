<template>
  <DraggableModal 
    :is-open="isOpen" 
    initial-width="800px" 
    initial-height="600px"
    @close="$emit('close')"
  >
    <div class="help-container">
      <div class="modal-header">
        <h3>ℹ️ ISYIFC Viewer Hilfe</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
      
      <div class="modal-body">
        <div class="help-content">
          <div class="content-section">
            <h4>Über ISYIFC</h4>
            <p>
              Der <strong>ISYIFC Viewer</strong> ist ein Werkzeug zur Visualisierung von ISYBAU-Daten in 3D.
            </p>
            <ul>
              <li><strong>Import:</strong> Drag & Drop von ISYBAU-XML Dateien.</li>
              <li><strong>3D Ansicht:</strong> Interaktive Darstellung von Schächten (Knoten) und Haltungen (Kanten).</li>
              <li><strong>Eigenschaften:</strong> Selektieren Sie Elemente, um Details einzusehen.</li>
            </ul>
            
            <h5>Steuerung 3D</h5>
            <ul>
                <li><strong>Drehen:</strong> Linke Maustaste gedrückt halten + Bewegen</li>
                <li><strong>Verschieben:</strong> Rechte Maustaste gedrückt halten (oder Shift + Links)</li>
                <li><strong>Zoom:</strong> Mausrad</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </DraggableModal>
</template>

<script setup>
import DraggableModal from '../common/DraggableModal.vue';

defineProps({
  isOpen: Boolean
});

defineEmits(['close']);
</script>

<style scoped>
.help-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: 'Inter', sans-serif;
  color: #2c3e50;
  background: #fff;
}

.modal-header {
  padding: 1rem;
  border-bottom: 1px solid #dce4e8;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f1f5f9;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #334155;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: #94a3b8;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #ef4444;
}

.modal-body {
  flex: 1;
  overflow: hidden; 
  display: flex;
}

.help-content {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
}

.content-section h4 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1.25rem;
  color: #1e293b;
  border-bottom: 2px solid #f1f5f9;
  padding-bottom: 0.5rem;
}

.content-section h5 {
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
  font-size: 1rem;
  color: #475569;
  font-weight: 700;
}

.content-section p, .content-section li {
  line-height: 1.6;
  color: #475569;
  font-size: 0.95rem;
}

.content-section ul {
  padding-left: 1.5rem;
}
</style>
