<template>
  <div class="toolbar-container">
    
    <!-- Select Tool -->
    <ToolButton 
      @click="setMode('SELECT')"
      :active="mode === 'SELECT' && activeTool === 'DRAW'"
      title="Select & Edit"
    >
      <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"></path></svg>
    </ToolButton>

    <div class="separator"></div>

    <!-- Import / Export -->
    <ToolButton 
      @click="$emit('open-import')"
      :active="false"
      title="Import Data"
    >
        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
    </ToolButton>

    <div class="separator"></div>

    <!-- Draw Poly -->
    <ToolButton 
      @click="setMode('DRAW_POLY')"
      :active="mode === 'DRAW_POLY' && activeTool === 'DRAW'"
      title="Draw Building"
    >
      <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
    </ToolButton>

    <!-- Draw Line -->
    <ToolButton 
      @click="setMode('DRAW_LINE')"
      :active="mode === 'DRAW_LINE' && activeTool === 'DRAW'"
      title="Draw Wall/Dam"
    >
      <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
    </ToolButton>

    <!-- Draw Point -->
    <ToolButton 
      @click="setMode('DRAW_POINT')"
      :active="mode === 'DRAW_POINT' && activeTool === 'DRAW'"
      title="Add Source Point"
    >
      <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
    </ToolButton>
    
    <div class="separator"></div>

    <!-- SHOVEL Tool -->
    <ToolButton 
      @click="$emit('set-tool', 'SHOVEL')"
      :active="activeTool === 'SHOVEL'"
      title="Shovel (Modify Terrain)"
    >
       <!-- Shovel in Dirt Icon -->
       <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
         <!-- Shovel Group (Rotated -45deg) -->
         <g transform="rotate(-45 12 12)">
             <!-- Handle & Shaft -->
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v10m-3-10h6m-3 0v2"></path>
             <!-- Blade -->
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6v4c0 2-3 4-3 4s-3-2-3-4v-4z"></path>
         </g>
         <!-- Dirt Mound (Stationary) -->
         <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 21c2-2 4 0 6 0s4-2 6 0s4 0 6-2"></path>
       </svg> 
    </ToolButton>

    <!-- BOUNDARY Tool -->
    <ToolButton 
      @click="$emit('set-tool', 'BOUNDARY')"
      :active="activeTool === 'BOUNDARY'"
      title="Define Boundaries"
    >
       <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
    </ToolButton>

    <!-- CULVERT Tool (Durchlässe) -->
    <ToolButton 
      @click="$emit('set-tool', 'CULVERT')"
      :active="activeTool === 'CULVERT'"
      title="Create Culvert"
    >
       <!-- Arch/Tunnel Icon -->
       <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
         <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 21h18M5 21v-7a7 7 0 0114 0v7"></path>
       </svg>
    </ToolButton>
    
    <div class="separator"></div>

    <!-- PAN Tool -->
    <ToolButton 
      @click="$emit('set-tool', 'PAN')"
      :active="activeTool === 'PAN'"
      title="Pan View"
    >
       <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11"></path></svg>
    </ToolButton>

    <!-- INFO Tool -->
    <ToolButton 
      @click="$emit('set-tool', 'INFO')"
      :active="activeTool === 'INFO'"
      title="Inspect Terrain"
    >
       <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
    </ToolButton>

    <div class="separator"></div>

    <!-- VIEW MODE TOGGLES -->
    <ToolButton 
      @click="$emit('set-mode', 'SETUP')"
      :active="currentAppMode === 'SETUP'"
      title="2D Map Editor"
    >
      <span class="icon-txt">2D</span>
    </ToolButton>

    <ToolButton 
      @click="$emit('set-mode', 'IMPORT_TERRAIN')"
      :active="currentAppMode === 'IMPORT_TERRAIN'"
      title="3D Terrain Viewer"
    >
      <span class="icon-txt">3D</span>
    </ToolButton>

    <!-- Orthographic Views (Only valid in 3D) -->
    <div v-if="currentAppMode === 'IMPORT_TERRAIN'" class="sub-tools">
       <button @click="$emit('set-view', 'XY')" class="tool-btn-mini" title="Top View (XY)">XY</button>
       <button @click="$emit('set-view', 'XZ')" class="tool-btn-mini" title="Front View (XZ)">XZ</button>
       <button @click="$emit('set-view', 'YZ')" class="tool-btn-mini" title="Side View (YZ)">YZ</button>
    </div>

  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useScenarioStore } from '@/stores/scenarioStore';
import ToolButton from '../tools/ToolButton.vue'; // Import Component

const props = defineProps({
  currentAppMode: { type: String, default: 'SETUP' },
  activeTool: { type: String, default: 'DRAW' } // 'DRAW', 'PAN', 'INFO'
});

const store = useScenarioStore();
const mode = computed(() => store.editorMode);

// We forward these upwards to Flood2DMain
const emit = defineEmits(['set-mode', 'set-view', 'set-tool', 'open-import']);

const setMode = (m) => {
  store.editorMode = m;
  emit('set-tool', 'DRAW'); // Reset to Draw when tool changes
};
</script>

<style scoped>
.toolbar-container {
    width: 64px;
    height: 100%;
    background-color: white;
    border-right: 1px solid #e0e0e0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 1rem;
    gap: 0.5rem;
    box-shadow: 2px 0 5px rgba(0,0,0,0.05);
    z-index: 10;
}

/* Common button styles moved to ToolButton.vue */

.icon-txt {
   font-family: sans-serif;
}

.separator {
    width: 32px;
    height: 1px;
    background-color: #eee;
    margin: 0.5rem 0;
}

/* Mini Buttons for Views */
.sub-tools {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
    padding: 4px;
    background: #f9f9f9;
    border-radius: 4px;
}

.tool-btn-mini {
    width: 32px;
    height: 24px;
    font-size: 0.7rem;
    border: 1px solid #ddd;
    background: white;
    border-radius: 3px;
    cursor: pointer;
    color: #555;
    transition: all 0.2s;
}
.tool-btn-mini:hover {
    background: #eee;
    color: #000;
}
</style>
