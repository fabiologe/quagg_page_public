<template>
    <div
      class="tool-ui-panel texture-panel"
      :class="{ collapsed: !panelVisible }"
      @mouseenter="onPanelEnter"
      @mouseleave="onPanelLeave"
    >
        <div class="panel-header">
          <SvEmoji emoji="🎨" :size="13" /> Texture Brush
          <span v-if="!panelVisible" class="collapse-toggle">···</span>
        </div>

      <div class="panel-content" v-show="panelVisible">
        <!-- MATERIAL SELECTOR + CRUD -->
        <label class="control-label">Material</label>
        <div class="material-grid">
            <div v-for="mat in surfaceStore.materials" :key="mat.id" class="material-item">
                <!-- Ansicht -->
                <template v-if="editId !== mat.id">
                    <button
                      :class="{ active: surfaceStore.activeMaterialId === mat.id }"
                      class="material-btn"
                      @click="surfaceStore.activeMaterialId = mat.id"
                      :title="`${mat.name} (n=${mat.manning})`"
                    >
                        <span class="color-swatch" :style="{ background: mat.color }"></span>
                        <span class="mat-name">{{ mat.name }}</span>
                        <span class="mat-n">{{ mat.manning }}</span>
                    </button>
                    <button class="icon-btn" title="Bearbeiten" @click.stop="startEdit(mat)"><SvEmoji emoji="✎" :size="12" /></button>
                    <button v-if="mat.id !== 1" class="icon-btn danger" title="Löschen"
                            @click.stop="surfaceStore.deleteMaterial(mat.id)">🗑</button>
                </template>
                <!-- Bearbeiten -->
                <div v-else class="material-edit">
                    <input class="edit-color" type="color" v-model="draft.color">
                    <input class="edit-name" type="text" v-model="draft.name" placeholder="Name">
                    <input class="edit-n" type="number" :step="0.005" :min="0.01" :max="0.1"
                           v-model.number="draft.manning" title="Manning-n (0.01–0.1)">
                    <button class="icon-btn ok" title="Speichern" @click="saveEdit(mat.id)">✓</button>
                    <button class="icon-btn" title="Abbrechen" @click="cancelEdit">✕</button>
                </div>
            </div>
        </div>

        <!-- NEUES MATERIAL -->
        <div v-if="addOpen" class="material-edit add">
            <input class="edit-color" type="color" v-model="newMat.color">
            <input class="edit-name" type="text" v-model="newMat.name" placeholder="Name">
            <input class="edit-n" type="number" :step="0.005" :min="0.01" :max="0.1"
                   v-model.number="newMat.manning" title="Manning-n (0.01–0.1)">
            <button class="icon-btn ok" title="Hinzufügen" @click="addMaterial">✓</button>
            <button class="icon-btn" title="Abbrechen" @click="addOpen = false">✕</button>
        </div>
        <button v-else class="add-material-btn" @click="openAdd">+ Material</button>

        <!-- BRUSH RADIUS -->
        <div class="control-row">
            <label>Radius: {{ surfaceStore.brushRadius }} Zellen</label>
            <input type="range" v-model.number="surfaceStore.brushRadius" min="1" max="20" step="1">
        </div>

        <!-- GRID STATUS -->
        <div class="grid-status">
            <span v-if="surfaceStore.isInitialized" class="status-ok">
                ✅ Grid: {{ surfaceStore.gridNCols }}×{{ surfaceStore.gridNRows }}
            </span>
            <span v-else class="status-warn">
                <SvEmoji emoji="⚠" :size="13" /> Kein Grid — Klicke auf Terrain zum Initialisieren
            </span>
        </div>

        <div class="paint-hint">Klicke und ziehe auf dem Terrain zum Malen</div>
      </div>
    </div>
</template>

<script setup>
import SvEmoji from '../common/SvEmoji.vue';
import { ref, computed } from 'vue';
import { useSurfaceStore } from '@/features/flood-2D/stores/useSurfaceStore.js';
import { useCollapsiblePanel } from '../../composables/editor/useCollapsiblePanel.js';

const surfaceStore = useSurfaceStore();

// Panel per Hover einklappbar (analog ShovelTool); offene Material-Bearbeitung
// (Umbenennen/Neu anlegen) hält das Panel aus, damit die Eingabe nicht verschwindet.
const editingMaterial = computed(() => editId.value != null || addOpen.value);
const { onPanelEnter, onPanelLeave, panelVisible } =
  useCollapsiblePanel({ forceOpen: editingMaterial });

// Manning-n auf den hydraulisch sinnvollen Bereich begrenzen.
const clampN = (v) => Math.min(0.1, Math.max(0.01, Number.isFinite(v) ? v : 0.035));
const randomColor = () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');

// --- Bestehendes Material bearbeiten ---
const editId = ref(null);
const draft = ref({ name: '', color: '#888888', manning: 0.035 });

function startEdit(mat) {
    addOpen.value = false;
    editId.value = mat.id;
    draft.value = { name: mat.name, color: mat.color, manning: mat.manning };
}
function saveEdit(id) {
    surfaceStore.updateMaterial(id, {
        name: draft.value.name?.trim() || 'Material',
        color: draft.value.color,
        manning: clampN(draft.value.manning),
    });
    editId.value = null;
}
function cancelEdit() {
    editId.value = null;
}

// --- Neues Material ---
const addOpen = ref(false);
const newMat = ref({ name: '', color: '#888888', manning: 0.035 });

function openAdd() {
    editId.value = null;
    newMat.value = { name: '', color: randomColor(), manning: 0.035 };
    addOpen.value = true;
}
function addMaterial() {
    const id = surfaceStore.addMaterial(
        newMat.value.name?.trim() || 'Material',
        newMat.value.color,
        clampN(newMat.value.manning),
    );
    surfaceStore.activeMaterialId = id;
    addOpen.value = false;
}
</script>

<style scoped>
/* Chrome kommt GLOBAL aus styles/tool-panel.css (Vorlage WeirTool) —
   hier nur die Material-Palette/Brush-Spezifika. */
.control-label { font-size: 0.8rem; margin-bottom: 4px; color: #bdc3c7; display: block; }

.material-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
}

.material-item {
    display: flex;
    align-items: center;
    gap: 4px;
}

.material-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border: 2px solid transparent;
    background: #34495e;
    color: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.82rem;
    transition: all 0.15s;
    flex: 1;
    min-width: 0;
}
.material-btn:hover { background: #3d566e; }
.material-btn.active {
    border-color: #e67e22;
    background: #2c3e50;
    font-weight: bold;
}

.color-swatch {
    width: 18px;
    height: 18px;
    border-radius: 3px;
    border: 1px solid rgba(255,255,255,0.3);
    flex-shrink: 0;
}

.mat-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mat-n { font-size: 0.75rem; color: #95a5a6; font-variant-numeric: tabular-nums; }

.icon-btn {
    background: #34495e;
    color: #ecf0f1;
    border: none;
    border-radius: 4px;
    width: 26px;
    height: 30px;
    cursor: pointer;
    font-size: 0.85rem;
    flex-shrink: 0;
    transition: background 0.15s;
}
.icon-btn:hover { background: #3d566e; }
.icon-btn.ok { background: #27ae60; }
.icon-btn.ok:hover { background: #2ecc71; }
.icon-btn.danger:hover { background: #c0392b; }

.material-edit {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    background: #2c3e50;
    padding: 4px;
    border-radius: 4px;
}
.material-edit.add { margin-bottom: 8px; }
.edit-color { width: 28px; height: 28px; padding: 0; border: none; background: none; cursor: pointer; flex-shrink: 0; }
.edit-name {
    flex: 1; min-width: 0;
    background: #34495e; color: white; border: 1px solid #7f8c8d;
    border-radius: 3px; padding: 4px 6px; font-size: 0.8rem;
}
.edit-n {
    width: 58px;
    background: #34495e; color: white; border: 1px solid #7f8c8d;
    border-radius: 3px; padding: 4px 6px; font-size: 0.8rem;
}

.add-material-btn {
    width: 100%;
    background: transparent;
    border: 1px dashed #7f8c8d;
    color: #bdc3c7;
    border-radius: 4px;
    padding: 6px;
    cursor: pointer;
    font-size: 0.82rem;
    margin-bottom: 12px;
    transition: all 0.15s;
}
.add-material-btn:hover { background: #34495e; color: #ecf0f1; }

.control-row { margin-bottom: 10px; }
.control-row label { display: block; font-size: 0.8rem; margin-bottom: 2px; color: #bdc3c7; }
.control-row input { width: 100%; cursor: pointer; }

.grid-status {
    padding: 6px 8px;
    background: rgba(0,0,0,0.2);
    border-radius: 4px;
    text-align: center;
    margin-bottom: 8px;
    font-size: 0.82rem;
}
.status-ok { color: #2ecc71; }
.status-warn { color: #f39c12; }

.paint-hint { text-align: center; font-size: 0.8rem; opacity: 0.6; margin-top: 8px; font-style: italic; }
</style>
