<template>
  <div class="toolbar-container">
    
    <!-- Import / Export -->
    <ToolButton
      @click="$emit('open-import')"
      :active="false"
      title="Import Data"
    >
        <SvIcon name="Interface-Essential-Clound-Download--Streamline-Pixel" :size="20" color="currentColor" />
    </ToolButton>

    <!-- Projekt speichern (.flood2d) -->
    <ToolButton
      @click="onSaveProject"
      :active="false"
      :title="hasResults ? 'Projekt speichern (Pre + optional Ergebnisse)' : 'Projekt speichern (.flood2d)'"
    >
        <SvIcon name="Interface-Essential-Floppy-Disk--Streamline-Pixel" :size="20" color="currentColor" />
    </ToolButton>

    <!-- Projekt laden (.flood2d) -->
    <ToolButton
      @click="onLoadProjectClick"
      :active="false"
      title="Projekt laden (.flood2d)"
    >
        <SvIcon name="Content-Files-Folder-Open--Streamline-Pixel" :size="20" color="currentColor" />
    </ToolButton>
    <input ref="fileInput" type="file" accept=".flood2d,.zip" style="display:none" @change="onProjectFileChange" />

    <!-- Lade-Overlay für Speichern/Laden -->
    <LoadingOverlay :visible="projectBusy" :label="progressLabel" :percent="progressPercent" />

    <div class="separator"></div>

    <!-- Draw Poly -->
    <ToolButton 
      @click="setTool('DRAW_POLY')"
      :active="activeTool === 'DRAW_POLY' || activeTool === 'DRAW'" 
      title="Draw Building"
    >
      <SvIcon name="Building-Real-Eastate-House-2--Streamline-Pixel" :size="20" color="currentColor" />
    </ToolButton>

    <!-- WEIR Tool (Wehr / Überlauf) -->
    <ToolButton 
      @click="setTool('WEIR')"
      :active="activeTool === 'WEIR'"
      title="Wehr / Überlauf setzen"
    >
      <!-- Dam/Weir icon: horizontal wall with water arrows -->
      <SvIcon name="Weir.png" :size="20" color="currentColor" />
    </ToolButton>

    <div class="separator"></div>

    <!-- SHOVEL Tool -->
    <ToolButton 
      @click="setTool('SHOVEL')"
      :active="activeTool === 'SHOVEL'"
      title="Shovel (Modify Terrain)"
    >
       <!-- Shovel in Dirt Icon -->
       <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      @click="setTool('BOUNDARY')"
      :active="activeTool === 'BOUNDARY'"
      title="Define Boundaries"
    >
       <SvIcon name="Design-Artboard-Shapes--Streamline-Pixel" :size="20" color="currentColor" />
    </ToolButton>

    <!-- KANALNETZ: Schacht setzen -->
    <ToolButton
      @click="setTool('NET_NODE')"
      :active="activeTool === 'NET_NODE'"
      title="Kanalnetz: Schacht setzen"
    >
      <SvIcon name="Schacht.png" :size="20" color="currentColor" />
    </ToolButton>

    <!-- KANALNETZ: Haltung ziehen -->
    <ToolButton
      @click="setTool('NET_CONDUIT')"
      :active="activeTool === 'NET_CONDUIT'"
      title="Kanalnetz: Haltung ziehen (Schacht → Schacht)"
    >
      <SvIcon name="Haltung.png" :size="20" color="currentColor" />
    </ToolButton>

    <!-- BRIDGE Tool (Brückenbauwerk) -->
    <ToolButton
      @click="setTool('BRIDGE')"
      :active="activeTool === 'BRIDGE'"
      title="Brücke / Bridge setzen"
    >
      <SvIcon name="Bridge.png" :size="20" color="currentColor" />
    </ToolButton>

    <!-- TEXTURE Tool (Surface Roughness Painting) -->
    <ToolButton 
      @click="setTool('TEXTURE')"
      :active="activeTool === 'TEXTURE'"
      title="Texture Brush (Oberfläche bemalen)"
    >
       <!-- Paint Brush Icon -->
       <SvIcon name="Design-Color-Painting-Palette--Streamline-Pixel" :size="20" color="currentColor" />
    </ToolButton>

    <ToolButton
      @click="setTool('CROP')"
      :active="activeTool === 'CROP'"
      title="Terrain zuschneiden (Rechteck / Polygon)"
    >
      <SvIcon name="Interface-Essential-Scisor--Streamline-Pixel" :size="20" color="currentColor" />
    </ToolButton>
    
    <div class="separator"></div>

    <!-- BATHYMETRIE Preprocessing -->
    <ToolButton
      @click="$emit('open-bathymetry')"
      :active="false"
      title="Bathymetrie Preprocessing (DGM + Vermessung)"
    >
      <!-- Topo/Cross-section icon -->
      <SvIcon name="Interface-Essential-Stat--Streamline-Pixel" :size="20" color="currentColor" />
    </ToolButton>

    <div class="separator"></div>

    <!-- PAN Tool -->
    <ToolButton 
      @click="setTool('PAN')"
      :active="activeTool === 'PAN'"
      title="Pan View"
    >
       <SvIcon name="Interface-Essential-Move--Streamline-Pixel" :size="20" color="currentColor" />
    </ToolButton>

    <!-- INFO Tool -->
    <ToolButton 
      @click="setTool('INFO')"
      :active="activeTool === 'INFO'"
      title="Inspect Terrain"
    >
       <SvIcon name="Interface-Essential-Information-Circle-2--Streamline-Pixel" :size="20" color="currentColor" />
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
import { computed, ref, nextTick } from 'vue';
import { useSimulationStore } from '../../stores/useSimulationStore.js';
import { saveProject, loadProject, downloadBlob } from '../../composables/useProjectFile.js';
import ToolButton from '../tools/ToolButton.vue'; // Import Component
import SvIcon from '../common/SvIcon.vue';
import LoadingOverlay from '../common/LoadingOverlay.vue';

const props = defineProps({
  currentAppMode: { type: String, default: 'SETUP' },
});

// We don't use props for activeTool anymore, we sync with Store
const store = useSimulationStore();
const activeTool = computed(() => store.activeTool);

// ── Projekt speichern / laden (.flood2d) ────────────────────────────────────
const projectBusy = ref(false);
const progressLabel = ref('');
const progressPercent = ref(null);
const fileInput = ref(null);
const hasResults = computed(() => (store.totalFrameCount || 0) > 0);

const onProgress = (p) => { progressLabel.value = p.label; progressPercent.value = p.percent; };
// Garantiert, dass das Overlay gerendert ist, bevor ein synchroner Schritt blockiert.
const nextPaint = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

const onSaveProject = async () => {
  if (projectBusy.value) return;
  let includeResults = false;
  if (hasResults.value) {
    includeResults = window.confirm(
      'Simulationsergebnisse mit in die Datei packen?\n\n' +
      'OK = mit Ergebnissen (größer)\nAbbrechen = nur Projekt (Pre-Processing)'
    );
  }
  projectBusy.value = true;
  progressLabel.value = 'Projekt wird gespeichert…';
  progressPercent.value = null;
  await nextTick();
  await nextPaint();
  try {
    const blob = await saveProject({ includeResults, onProgress });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    downloadBlob(blob, `flood2d_${stamp}.flood2d`);
  } catch (e) {
    console.error('[Projekt] Speichern fehlgeschlagen:', e);
    alert('Speichern fehlgeschlagen: ' + (e?.message || e));
  } finally {
    projectBusy.value = false;
  }
};

const onLoadProjectClick = () => { if (!projectBusy.value) fileInput.value?.click(); };

const onProjectFileChange = async (ev) => {
  const file = ev.target.files?.[0];
  ev.target.value = ''; // erlaubt erneutes Laden derselben Datei
  if (!file) return;
  projectBusy.value = true;
  progressLabel.value = 'Projekt wird geladen…';
  progressPercent.value = null;
  await nextTick();
  await nextPaint();
  try {
    const info = await loadProject(file, onProgress);
    console.log('[Projekt] geladen:', info);
    if (info.hasResults) {
      alert(`Projekt geladen — inkl. ${info.frameCount} Ergebnis-Frames. Öffne den 3D-Viewer, um sie anzusehen.`);
    }
  } catch (e) {
    console.error('[Projekt] Laden fehlgeschlagen:', e);
    alert('Laden fehlgeschlagen: ' + (e?.message || e));
  } finally {
    projectBusy.value = false;
  }
};

const emit = defineEmits(['set-mode', 'set-view', 'set-tool', 'open-import', 'open-bathymetry']);

const setMode = (m) => {
  // Mode logic... 'SETUP' vs 'IMPORT_TERRAIN' is app level/Simulation level?
  // User Prompt 2 said: "UI State: activeTool".
  // EditorToolbar props: currentAppMode.
  // We keep emitting set-mode for parent to handle if it switched views (Flood2DMain likely handles Mode).
  // But activeTool is definitely SimStore.
  
  if (m === 'DRAW_POLY') {
      store.setActiveTool('DRAW_POLY');
  } else if (m === 'DRAW_LINE') {
      store.setActiveTool('DRAW_LINE');
  } else if (m === 'SELECT') {
      store.setActiveTool('SELECT');
  }
  
  // Also emit for legacy compatibility if parent relies on it? 
  // But we want to kill legacy.
  // EditorToolbar seems to emit 'set-tool' for everything.
  // Let's intercept emits and call store.
};

// We need to replace $emit('set-tool', ...) in template with store calls? 
// Or just let parent handle it? The parent is MapEditor3D?
// No, MapEditor3D is inside Flood2DMain probably.
// Let's assume Flood2DMain orchestrates.
// For now, replacing the store instance is key.

// Wait, the template uses 'mode' and 'activeTool'.
// activeTool is computed from store.
// mode... is 'SETUP' / 'IMPORT_TERRAIN'. Is this in simulation store?
// Simulation Store has 'status'.
// Maybe 'mode' is local UI state in Flood2DMain.
// Let's keep props.currentAppMode for Mode if it's top-level view switching.
// But activeTool should be store.

// Update emit handlers in template?
// The template does @click="$emit('set-tool', 'SHOVEL')".
// We can leave emits if the parent (Flood2DMain) updates the store.
// BUT Prompt 3 said: "Das ist der gefährliche Teil... MapEditor3D... Toolbar..."
// Prompt 1 Cluster 1: "EditorToolbar.vue ... Der Toolbar steuert nur activeTool und mode. Nutze hierfür ausschließlich den useSimulationStore."

// So I should replace emits with store actions.
const setTool = (tool) => {
    if (store.activeTool === tool) {
        // Toggle off if already active
        store.setActiveTool(null);
    } else {
        store.setActiveTool(tool);
    }
};

</script>

<style scoped>
.toolbar-container {
    width: 52px;
    height: 100%;
    background-color: var(--sv-bg-2);
    border-right: 1px solid var(--sv-border);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.5rem 0;
    gap: 3px;
    box-shadow: 2px 0 18px rgba(139, 92, 246, 0.18);
    z-index: 10;
    /* Fallback bei sehr niedrigen Fenstern: scrollen statt Buttons abschneiden */
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
}
.toolbar-container::-webkit-scrollbar { display: none; }

/* Common button styles moved to ToolButton.vue */

.icon-txt {
   font-family: var(--sv-font);
}

.separator {
    width: 28px;
    height: 1px;
    flex-shrink: 0;
    background-color: var(--sv-border);
    margin: 3px 0;
}

/* Mini Buttons for Views */
.sub-tools {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
    padding: 4px;
    background: var(--sv-surface-2);
    border-radius: 4px;
}

.tool-btn-mini {
    width: 32px;
    height: 24px;
    font-size: 0.7rem;
    border: 1px solid var(--sv-border);
    background: var(--sv-bg);
    border-radius: 3px;
    cursor: pointer;
    color: var(--sv-text-dim);
    font-family: var(--sv-font);
    transition: all 0.2s;
}
.tool-btn-mini:hover {
    background: rgba(139, 92, 246, 0.2);
    color: var(--sv-text-lime);
}
</style>
