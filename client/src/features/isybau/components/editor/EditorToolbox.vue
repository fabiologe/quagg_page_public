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
        <img class="tb-ic" src="/saintv1d/icons/Content-Files-Write-Note--Streamline-Pixel.svg" />
      </button>

      <button 
        class="tool-btn" 
        :class="{ active: store.editor.mode === 'addNode' }"
        @click="setMode('addNode')"
        title="Schacht hinzufügen"
      >
        <svg viewBox="0 0 24 24" fill="none" class="icon-svg" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="9" stroke="#2ecc71" stroke-width="2" fill="#2ecc71" fill-opacity="0.15"/>
            <circle cx="12" cy="12" r="3" stroke="#2ecc71" stroke-width="2"/>
            <path d="M12 3V21" stroke="#2ecc71" stroke-width="1.5"/>
            <path d="M3 12H21" stroke="#2ecc71" stroke-width="1.5"/>
        </svg>
      </button>
       <button 
        class="tool-btn" 
        :class="{ active: store.editor.mode === 'addEdge' }"
        @click="setMode('addEdge')"
        title="Haltung zeichnen"
      >
        <svg viewBox="0 0 24 24" fill="none" class="icon-svg" xmlns="http://www.w3.org/2000/svg">
            <rect x="6" y="8" width="12" height="15" fill="#2ecc71" fill-opacity="0.2" stroke="#2ecc71" stroke-width="1.5"/>
            <rect x="7" y="8" width="2" height="15" fill="#2ecc71" fill-opacity="0.35" stroke="none"/>
            <rect x="4" y="3" width="16" height="5" fill="#2ecc71" fill-opacity="0.2" stroke="#2ecc71" stroke-width="1.5"/>
            <rect x="5" y="3.5" width="2" height="4" fill="#2ecc71" fill-opacity="0.35" stroke="none"/>
        </svg>
      </button>
       <button 
        class="tool-btn" 
        :class="{ active: store.editor.mode === 'addArea' }"
        @click="setMode('addArea')"
        title="Fläche zeichnen"
      >
        <span style="font-weight: 900; font-family: 'Press Start 2P', monospace; font-size: 0.6rem; color: #2ecc71;">m²</span>
      </button>

      <div class="separator-v" style="margin: 0 4px; border-left: 1px solid #594491;"></div>

      <button 
        class="tool-btn" 
        :class="{ active: store.editor.mode === 'splitEdge' }"
        @click="setMode('splitEdge')"
        title="Knoten in Haltung einbauen (Haltung teilen)"
      >
        <img class="tb-ic" src="/saintv1d/icons/Interface-Essential-Scisor--Streamline-Pixel.svg" />
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
        <img class="tb-ic flip-h" src="/saintv1d/icons/Interface-Essential-Synchronize-Arrows-Square-2--Streamline-Pixel.svg" />
      </button>
      <button 
        class="tool-btn" 
        @click="store.redo()"
        :disabled="store.history.redoStack.length === 0"
        title="Wiederholen"
      >
        <img class="tb-ic" src="/saintv1d/icons/Interface-Essential-Synchronize-Arrows-Square-2--Streamline-Pixel.svg" />
      </button>

      <button 
        class="tool-btn danger" 
        :class="{ active: store.editor.mode === 'delete' }"
        @click="setMode('delete')"
        title="Löschen-Modus"
      >
        <img class="tb-ic" src="/saintv1d/icons/Interface-Essential-Link-Broken-2--Streamline-Pixel.svg" />
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
        case 'splitEdge': return "Klicken Sie auf eine Haltung, um sie zu teilen";
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
    background: #040647;
    padding: 0.35rem;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(4,6,71,0.4);
    border: 1px solid #594491;
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
    border: 1px solid #594491;
    background: transparent;
    border-radius: 5px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
    outline: none;
}

.tool-btn:hover:not(:disabled) {
    background: #594491;
}

.tool-btn.active {
    background: #594491;
    border-color: #8f8be1;
    box-shadow: 0 0 0 1px #8f8be1;
}

.tool-btn.danger {
    border-color: #e74c3c;
}
.tool-btn.danger:hover:not(:disabled) {
    background: #e74c3c;
}
.tool-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

.separator-h {
    width: 1px;
    background: #594491;
}

/* Icons */
.tb-ic {
    width: 18px;
    height: 18px;
    image-rendering: pixelated;
    filter: invert(63%) sepia(36%) saturate(736%) hue-rotate(103deg) brightness(99%) contrast(96%);
}
.tb-ic.flip-h {
    transform: scaleX(-1);
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
