<template>
  <div class="editor-toolbox">
    
    <div class="tools-group">
      <!-- Edit Mode / Properties -->
       <button 
        class="tool-btn" 
        :class="{ active: store.editor.mode === 'editProperties' }"
        @click="setMode('editProperties')"
        title="Eigenschaften bearbeiten"
      >
        📝
      </button>

      <button 
        class="tool-btn" 
        :class="{ active: store.editor.mode === 'addNode' }"
        @click="setMode('addNode')"
        title="Schacht hinzufügen"
      >
        <svg viewBox="0 0 24 24" fill="none" class="icon-svg" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="9" stroke="#5D4037" stroke-width="2" fill="#8D6E63" fill-opacity="0.2"/>
            <circle cx="12" cy="12" r="3" stroke="#5D4037" stroke-width="2"/>
            <path d="M12 3V21" stroke="#5D4037" stroke-width="1.5"/>
            <path d="M3 12H21" stroke="#5D4037" stroke-width="1.5"/>
        </svg>
      </button>
       <button 
        class="tool-btn" 
        :class="{ active: store.editor.mode === 'addEdge' }"
        @click="setMode('addEdge')"
        title="Haltung zeichnen"
      >
        <svg viewBox="0 0 24 24" fill="none" class="icon-svg" xmlns="http://www.w3.org/2000/svg">
            <rect x="6" y="8" width="12" height="15" fill="#43A047" stroke="#1B5E20" stroke-width="1.5"/>
            <rect x="7" y="8" width="2" height="15" fill="#81C784" fill-opacity="0.5" stroke="none"/>
            <rect x="4" y="3" width="16" height="5" fill="#43A047" stroke="#1B5E20" stroke-width="1.5"/>
            <rect x="5" y="3.5" width="2" height="4" fill="#81C784" fill-opacity="0.5" stroke="none"/>
        </svg>
      </button>
       <button 
        class="tool-btn" 
        :class="{ active: store.editor.mode === 'addArea' }"
        @click="setMode('addArea')"
        title="Fläche zeichnen"
      >
        <span style="font-weight: 900; font-family: sans-serif; font-size: 1.1rem; color: #333;">m²</span>
      </button>
    </div>

    <div class="separator-h"></div>

    <div class="tools-group">
      <button 
        class="tool-btn" 
        @click="store.undo()"
        :disabled="store.history.undoStack.length === 0"
        title="Rückgängig"
      >
        ↩️
      </button>
      <button 
        class="tool-btn" 
        @click="store.redo()"
        :disabled="store.history.redoStack.length === 0"
        title="Wiederholen"
      >
        ↪️
      </button>

      <button 
        class="tool-btn danger" 
        :class="{ active: store.editor.mode === 'delete' }"
        @click="setMode('delete')"
        title="Löschen-Modus"
      >
        🗑️
      </button>
    </div>
    
    <div v-if="hint" class="tool-hint">{{ hint }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useIsybauStore } from '../../store/index.js';

const store = useIsybauStore();

const setMode = (mode) => {
    // Toggle functionality: If clicking the active tool, deactivate it (back to view)
    if (store.editor.mode === mode) {
         store.editor.mode = 'view';
    } else {
         store.editor.mode = mode;
    }

    // Reset edge creation state if we leave addEdge mode
    if(store.editor.mode !== 'addEdge') {
        store.editor.edgeStartNode = null; 
    }
};


const hint = computed(() => {
    switch(store.editor.mode) {
        case 'editProperties': return "Element klicken zum Bearbeiten";
        case 'addNode': return "Klicken zum Platzieren";
        case 'addEdge': return "Start- & Endknoten wählen";
        case 'addArea': return "Punkte klicken (Doppelklick fertig)";
        default: return "";
    }
});
</script>

<style scoped>
.editor-toolbox {
    position: absolute;
    top: 60px;
    left: 50%;
    transform: translateX(-50%);
    background: #ffffff;
    padding: 0.35rem;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    border: 1px solid #e0e0e0;
    display: flex;
    gap: 0.5rem;
    z-index: 1000;
}

.tools-group {
    display: flex;
    gap: 0.25rem;
}

.tool-btn {
    width: 36px;
    height: 36px;
    border: 1px solid #ddd;
    background: #f8f9fa;
    border-radius: 4px;
    font-size: 1.2rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    outline: none; /* Remove default focus ring */
}

.tool-btn:hover:not(:disabled) {
    background: #eee;
    transform: translateY(-1px);
}

.tool-btn.active {
    background: #e3f2fd;
    border-color: #2196F3;
    color: #2196F3;
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);
}

.tool-btn.danger {
    color: #e74c3c;
}
.tool-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.separator-h {
    width: 1px;
    background: #eee;
}

.tool-hint {
    position: absolute;
    bottom: -30px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.7);
    color: white;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.8rem;
    white-space: nowrap;
    pointer-events: none;
}

.icon-svg {
    width: 24px;
    height: 24px;
}
</style>
