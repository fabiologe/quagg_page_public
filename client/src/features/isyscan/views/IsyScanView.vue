<template>
  <div class="isyscan-container">
    <!-- Linke Seite: Controls -->
    <div class="controls-panel">
      <h2>IsyScan Konverter</h2>
      <p class="desc">Erzeugt ISYBAU XML aus Projektdaten.</p>

      <div class="actions">
        <button 
          @click="startConversion" 
          :disabled="isProcessing" 
          class="btn-primary"
        >
          {{ isProcessing ? 'Verarbeite...' : 'Start ISYBAU Konvertierung' }}
        </button>
      </div>

      <!-- Status Anzeige -->
      <div class="status-summary" v-if="logs.length > 0">
        <h3>Status Report</h3>
        <div class="stat-item">
          <span>Gesamt Logs:</span> <strong>{{ logs.length }}</strong>
        </div>
        <div class="stat-item">
          <span>Verarbeitung:</span> 
          <span :class="isProcessing ? 'status-pending' : 'status-done'">
            {{ isProcessing ? 'Läuft...' : 'Fertig' }}
          </span>
        </div>
      </div>

      <!-- Download Button -->
      <div class="download-section" v-if="downloadUrl">
        <a :href="downloadUrl" download="export_isybau.xml" class="btn-success">
          📥 XML Herunterladen
        </a>
      </div>
    </div>

    <!-- Rechte Seite: Live Konsole -->
    <div class="debug-panel">
      <div class="panel-header">
        <h3>System Protokoll</h3>
        <button @click="logs = []" class="btn-small">Clear</button>
      </div>

      <div class="logs-container" ref="logsContainer">
        <div 
          v-for="(log, index) in logs" 
          :key="index" 
          :class="['log-entry', log.status]"
        >
          <span class="timestamp">[{{ log.time }}]</span>
          <span class="type-badge">[{{ log.step }}]</span>
          <span class="message">{{ log.message }}</span>
        </div>
        
        <div v-if="logs.length === 0" class="empty-state">
          Bereit zum Starten...
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { IsyScanEngine } from '../utils/IsyScanEngine.js';

export default {
  name: 'IsyScanView',
  data() {
    return {
      isProcessing: false,
      logs: [],
      xmlResult: null,
      downloadUrl: null
    };
  },
  methods: {
    async startConversion() {
      // 1. Reset
      this.isProcessing = true;
      this.xmlResult = null;
      this.downloadUrl = null;
      this.logs = [];

      // 2. Engine Instantiieren & Starten
      const engine = new IsyScanEngine(this.onLog);

      try {
        const xml = await engine.run();
        
        if (!xml || xml.length === 0) {
            throw new Error("Leeres Ergebnis erhalten.");
        }

        // 3. Resultat verarbeiten
        this.xmlResult = xml;
        this.createDownload(xml);
        
        this.onLog('UI', `Prozess erfolgreich. XML Größe: ${(xml.length / 1024).toFixed(2)} KB.`, 'success');
        
        // Auto-Trigger Download
        this.downloadManually();

      } catch (error) {
        this.onLog('UI', `Fehler im Prozess: ${error.message}`, 'error');
        console.error(error);
      } finally {
        this.isProcessing = false;
      }
    },

    onLog(logData) {
        // Normalize log data
        let entry = {};
        if (typeof logData === 'object') {
            entry = {
                time: logData.timestamp || new Date().toLocaleTimeString(),
                step: logData.step || 'INFO',
                message: logData.message || '',
                status: logData.status || 'info'
            };
        } else {
            // Fallback for direct calls (type, message)
            entry = {
                time: new Date().toLocaleTimeString(),
                step: arguments[0] || 'LOG',
                message: arguments[1] || '',
                status: arguments[2] || 'info'
            };
        }

        this.logs.push(entry);

        // Auto-Scroll
        this.$nextTick(() => {
            const container = this.$refs.logsContainer;
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        });
    },

    createDownload(xmlString) {
        try {
            // Cleanup old url
            if (this.downloadUrl) window.URL.revokeObjectURL(this.downloadUrl);

            // FORCE BINARY STREAM -> Browser muss "Save As" machen
            const blob = new Blob([xmlString], { type: 'application/octet-stream' });
            this.downloadUrl = window.URL.createObjectURL(blob);
        } catch (e) {
            this.onLog('UI', 'Fehler beim Erstellen des Downloads: ' + e.message, 'error');
        }
    },

    downloadManually() {
        if (!this.downloadUrl) return;
        
        try {
            const link = document.createElement('a');
            link.href = this.downloadUrl;
            link.download = "export_isybau.xml";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error("Auto-Download failed:", e);
        }
    }
  },
  beforeUnmount() {
      if (this.downloadUrl) {
          window.URL.revokeObjectURL(this.downloadUrl);
      }
  }
};
</script>

<style scoped>
.isyscan-container {
  display: flex;
  height: calc(100vh - 80px); /* Annahme: Header Höhe */
  background: #f0f2f5;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  overflow: hidden;
}

/* --- Left: Controls --- */
.controls-panel {
  width: 350px;
  background: white;
  padding: 2rem;
  border-right: 1px solid #ddd;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  box-shadow: 4px 0 12px rgba(0,0,0,0.05);
  z-index: 10;
}

h2 {
  margin: 0;
  color: #1a1a1a;
  font-weight: 600;
}

.desc {
  color: #666;
  font-size: 0.9rem;
  margin-top: -10px;
}

/* Actions */
.btn-primary {
  background-color: #007bff;
  color: white;
  border: none;
  padding: 1rem;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  width: 100%;
  transition: background 0.2s;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.btn-primary:hover:not(:disabled) { background-color: #0056b3; }
.btn-primary:disabled { background-color: #ccc; cursor: not-allowed; }

.btn-success {
  display: block;
  background-color: #28a745;
  color: white;
  text-align: center;
  text-decoration: none;
  padding: 1rem;
  border-radius: 6px;
  font-weight: bold;
  box-shadow: 0 4px 6px rgba(40, 167, 69, 0.2);
  transition: transform 0.1s;
  cursor: pointer;
}
.btn-success:active { transform: scale(0.98); }

/* Status */
.status-summary {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  padding: 1rem;
  border-radius: 8px;
}
.stat-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}
.status-pending { color: #d39e00; font-weight: bold; }
.status-done { color: #28a745; font-weight: bold; }

/* --- Right: Debug Console --- */
.debug-panel {
  flex: 1;
  background: #1e1e1e;
  color: #e0e0e0;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  min-width: 0; /* Flexbox overflow fix */
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #333;
}
.panel-header h3 { margin: 0; font-weight: 400; font-size: 1.1rem; }

.btn-small {
  background: transparent;
  border: 1px solid #555;
  color: #888;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.btn-small:hover { color: white; border-color: white; }

/* Log Content */
.logs-container {
  flex: 1;
  overflow-y: auto;
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  background: #121212;
  border-radius: 4px;
  padding: 1rem;
  border-radius: 1px solid #333;
}

.log-entry {
  display: flex;
  gap: 12px;
  border-bottom: 1px solid #1f1f1f;
  padding: 2px 0;
}

.timestamp { color: #555; min-width: 70px; }
.type-badge { color: #aaa; font-weight: bold; min-width: 50px; }
.message { white-space: pre-wrap; word-break: break-word; }

/* Token Colors */
.log-entry.info .message { color: #eee; }
.log-entry.pending .message { color: #f0ad4e; }
.log-entry.success .message { color: #5cb85c; }
.log-entry.warning .message { color: #f0ad4e; }
.log-entry.error .message { color: #d9534f; font-weight: bold; }

.empty-state {
  text-align: center;
  color: #444;
  margin-top: 3rem;
  font-style: italic;
}

/* Scrollbar Customization */
.logs-container::-webkit-scrollbar { width: 8px; }
.logs-container::-webkit-scrollbar-track { background: #1e1e1e; }
.logs-container::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
.logs-container::-webkit-scrollbar-thumb:hover { background: #555; }
</style>
