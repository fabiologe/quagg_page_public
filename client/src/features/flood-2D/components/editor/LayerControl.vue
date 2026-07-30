<template>
  <div class="layer-control">
    <div class="layer-btn" :class="{ active: activeMode === 'CLASSIC' }" @click="selectMode('CLASSIC')" title="Klassische Höhen-Ansicht">
       <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>
    </div>
    <div class="layer-btn" :class="{ active: activeMode === 'SURFACE' }" @click="selectMode('SURFACE')" title="Oberflächen-Materialien (Textur)">
       <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
    </div>
    
    <!-- MORE DROPDOWN -->
    <div class="layer-more-wrapper">
        <div class="layer-btn" :class="{ active: ['SOLID', 'WIREFRAME', 'CONTOUR', 'TIFF'].includes(activeMode) || showMoreLayers }" @click="showMoreLayers = !showMoreLayers" title="Weitere Ansichtsoptionen">
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
        </div>
        <div v-if="showMoreLayers" class="layer-more-dropdown">
            <div class="layer-dropdown-item" :class="{ active: activeMode === 'WIREFRAME' }" @click="selectMode('WIREFRAME'); showMoreLayers = false;">
                Rasteransicht (Wireframe)
            </div>
            <div class="layer-dropdown-item" :class="{ active: activeMode === 'SOLID' }" @click="selectMode('SOLID'); showMoreLayers = false;">
                Solid Ansicht (Grau)
            </div>
            <div class="layer-dropdown-item" :class="{ active: activeMode === 'CONTOUR' }" @click="selectMode('CONTOUR'); showMoreLayers = false;">
                Höhenlinien (1m)
            </div>
            <div class="layer-dropdown-item disabled" title="Tiff-Hintergrund (Demnächst)">
                Tiff Ansicht
            </div>
        </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
    activeMode: {
        type: String,
        default: 'CLASSIC'
    }
});

const emit = defineEmits(['set-mode']);

const showMoreLayers = ref(false);

const selectMode = (mode) => {
    emit('set-mode', mode);
};
</script>

<style scoped>
.layer-control {
    position: absolute;
    bottom: 16px;
    right: 16px;
    background: var(--sv-surface);
    border: 1px solid var(--sv-border);
    backdrop-filter: blur(8px);
    border-radius: var(--sv-radius);
    box-shadow: var(--sv-glow-violet);
    font-family: var(--sv-font);
    display: flex;
    flex-direction: column;
    overflow: visible; /* Changed from hidden to allow dropdown */
    /* Hintergrund-Chrome: unter ALLEN Arbeits-Panels (Tool-Panels 1000, SGC-Vorschau/
       Info-Karte/Crop-UI 100) — nur über dem Header (10). Sonst verdeckt die
       Layer-Leiste die eigentlichen Inhalte. */
    z-index: 20;
}
.layer-btn {
    padding: 10px;
    color: var(--sv-text-dim);
    cursor: pointer;
    border-bottom: 1px solid var(--sv-border);
    transition: all 0.2s;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: center;
}
.layer-btn:last-child { border-bottom: none; }
.layer-btn:hover:not(.disabled) { background: rgba(139, 92, 246, 0.18); color: var(--sv-text-lime); }
.layer-btn.active {
    background: rgba(139, 92, 246, 0.22);
    color: var(--sv-lime);
    box-shadow: inset 0 0 8px rgba(163, 230, 53, 0.15);
}
.layer-btn.disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

/* Layer More Dropdown */
.layer-more-wrapper {
    position: relative;
    display: flex;
    justify-content: center;
    width: 100%;
}
.layer-more-dropdown {
    position: absolute;
    bottom: 0;
    right: 100%;
    margin-right: 10px;
    background: var(--sv-surface);
    border: 1px solid var(--sv-border);
    backdrop-filter: blur(8px);
    border-radius: var(--sv-radius);
    box-shadow: -4px 4px 15px rgba(0,0,0,0.35), var(--sv-glow-violet);
    overflow: hidden;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    z-index: 100;
}
.layer-dropdown-item {
    padding: 12px 16px;
    font-size: 0.85rem;
    font-family: var(--sv-font);
    color: var(--sv-text-dim);
    cursor: pointer;
    border-bottom: 1px solid var(--sv-border);
    transition: all 0.2s;
    white-space: nowrap;
}
.layer-dropdown-item:last-child {
    border-bottom: none;
}
.layer-dropdown-item:hover:not(.disabled) {
    background: rgba(139, 92, 246, 0.18);
    color: var(--sv-text-lime);
}
.layer-dropdown-item.active {
    background: rgba(139, 92, 246, 0.22);
    color: var(--sv-lime);
}
.layer-dropdown-item.disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
</style>
