<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="assignment-modal">
      
      <!-- LEFT: Object Selection -->
      <div class="col-left">
        <div class="list-header">
            <h3>Objekt-Auswahl</h3>
            <div class="tabs">
                <button :class="{ active: filter === 'ALL' }" @click="filter = 'ALL'">Alle</button>
                <button :class="{ active: filter === 'NODE' }" @click="filter = 'NODE'">Punkte</button>
                <button :class="{ active: filter === 'BOUNDARY' }" @click="filter = 'BOUNDARY'">Linien</button>
            </div>
            <div class="search-row">
                <label class="select-all">
                    <input type="checkbox" :checked="isAllSelected" @change="toggleAll"> Alle auswählen
                </label>
                <div class="count-badge">{{ filteredItems.length }} Objekte</div>
            </div>
        </div>

        <div class="list-content">
            <div v-for="item in filteredItems" :key="item.id" class="list-item" :class="{ selected: selectedIds.has(item.id) }">
                <label class="item-label">
                    <input type="checkbox" :value="item.id" v-model="selectionArray">
                    <span class="icon">{{ getIcon(item.type) }}</span>
                    <span class="id-text">{{ item.id }}</span>
                </label>
                <div class="status-badge" v-html="getStatus(item.id)"></div>
            </div>
        </div>
      </div>

      <!-- RIGHT: Configuration -->
      <div class="col-right">
        <div class="config-header">
            <h3>Verhalten definieren</h3>
            <div class="target-info">
                Für <strong>{{ selectionArray.length }}</strong> ausgewählte Objekte
            </div>
        </div>

        <div class="config-body" v-if="selectionArray.length > 0">
            
            <!-- Behavior Type -->
            <div class="form-group">
                <label>Verhaltenstyp</label>
                <select v-model="config.type" class="main-select">
                    <option value="INFLOW_DYNAMIC">🌊 Zufluss (Ganglinie)</option>
                    <option value="WATERLEVEL_FIX">🛑 Wasserstand (Ganglinie)</option>
                    <option value="INFLOW_CONSTANT">🚰 Konstanter Zufluss</option>
                    <option value="OUTFLOW_FREE">↘️ Freier Auslauf</option>
                    <!-- <option value="SINK">🕳️ Senke / Gully</option> -->
                </select>
            </div>

            <!-- Dynamic: Profile Selection -->
            <div class="form-group" v-if="['INFLOW_DYNAMIC', 'WATERLEVEL_FIX'].includes(config.type)">
                <label>Ganglinie wählen</label>
                <select v-model="config.profileId" class="sub-select">
                    <option :value="null" disabled>-- Bitte wählen --</option>
                    <option v-for="gl in ganglinienList" :key="gl.id" :value="gl.id">
                        {{ gl.name }} ({{ gl.type }})
                    </option>
                </select>
                <div class="hint" v-if="!config.profileId">
                    Erforderlich.
                </div>
            </div>

            <!-- Constant Value -->
            <div class="form-group" v-if="config.type === 'INFLOW_CONSTANT'">
                <label>Wert (m³/s)</label>
                <input type="number" v-model.number="config.value" step="0.1" class="value-input">
            </div>

             <!-- Description / Hint -->
             <div class="info-box" v-if="config.type === 'OUTFLOW_FREE'">
                <p>Das Wasser fließt an dieser Grenze ungehindert ab (Critical Depth Condition).</p>
            </div>
            
        </div>
        <div class="empty-selection" v-else>
            <p>⬅️ Bitte wähle Objekte aus der Liste.</p>
        </div>

        <div class="modal-footer">
            <button class="btn-cancel" @click="$emit('close')">Abbrechen</button>
            <button class="btn-save" 
                    @click="applyAssignment" 
                    :disabled="selectionArray.length === 0 || !isValidConfig"
            >
                Zuweisen
            </button>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore';
import { useHydraulicStore } from '@/features/flood-2D/stores/useHydraulicStore';

const emit = defineEmits(['close']);

const geoStore = useGeoStore();
const hydStore = useHydraulicStore();

// --- LIST LOGIC ---
const filter = ref('ALL'); // ALL, NODE, BOUNDARY

// Merge all geometry items into uniform list
const allItems = computed(() => {
    const list = [];
    if (geoStore.nodes) {
        list.push(...geoStore.nodes.map(n => ({ id: n.id, type: 'NODE', _raw: n })));
    }
    if (geoStore.boundaries && geoStore.boundaries.features) {
        list.push(...geoStore.boundaries.features.map(f => ({ 
            id: f.id || (f.properties ? f.properties.id : 'unknown'), 
            type: 'BOUNDARY', 
            _raw: f 
        })));
    }
    return list;
});

const filteredItems = computed(() => {
    if (filter.value === 'ALL') return allItems.value;
    return allItems.value.filter(i => i.type === filter.value);
});

const getIcon = (type) => {
    return type === 'NODE' ? '📍' : '➖';
};

const getStatus = (id) => {
    const assign = hydStore.getAssignment(id);
    if (!assign) return '<span class="status-none">Unkonfiguriert</span>';
    
    // Icons for status
    if (assign.type === 'INFLOW_DYNAMIC') return '🟢 Zufluss (dyn)';
    if (assign.type === 'INFLOW_CONSTANT') return '🟢 Zufluss (konst)';
    if (assign.type === 'WATERLEVEL_FIX') return '🌊 Pegel';
    if (assign.type === 'OUTFLOW_FREE') return '↘️ Auslauf';
    return '⚙️ ' + assign.type;
};

// --- SELECTION LOGIC ---
// We use a Set for performance, but v-model wants array, so check v-model binding carefully
// v-model on checkboxes with array works if all checkboxes share same array.
const selectionArray = ref([]); 

const selectedIds = computed(() => new Set(selectionArray.value));

const isAllSelected = computed(() => {
    return filteredItems.value.length > 0 && 
           filteredItems.value.every(item => selectedIds.value.has(item.id));
});

const toggleAll = (e) => {
    if (e.target.checked) {
        // Add visible items not already selected
        filteredItems.value.forEach(item => {
            if (!selectedIds.value.has(item.id)) {
                selectionArray.value.push(item.id);
            }
        });
    } else {
        // Deselect visible items
        const visibleIds = new Set(filteredItems.value.map(i => i.id));
        selectionArray.value = selectionArray.value.filter(id => !visibleIds.has(id));
    }
};

// --- CONFIG LOGIC ---
const ganglinienList = computed(() => {
    return hydStore.ganglinien ? Object.values(hydStore.ganglinien) : [];
});

const config = ref({
    type: 'INFLOW_DYNAMIC',
    value: null,
    profileId: null
});

// Reset config params when type changes
watch(() => config.value.type, (newType) => {
    if (newType === 'OUTFLOW_FREE') {
        config.value.profileId = null;
        config.value.value = null;
    }
    if (newType === 'INFLOW_CONSTANT') {
        config.value.profileId = null;
        if (config.value.value === null) config.value.value = 0;
    }
    if (newType === 'INFLOW_DYNAMIC' || newType === 'WATERLEVEL_FIX') {
        config.value.value = null;
        // Keep profileId if possible, or reset
    }
});

const isValidConfig = computed(() => {
    if (config.value.type === 'INFLOW_DYNAMIC' || config.value.type === 'WATERLEVEL_FIX') {
        return !!config.value.profileId;
    }
    if (config.value.type === 'INFLOW_CONSTANT') {
        return config.value.value !== null && config.value.value !== '';
    }
    return true; // Free outflow always valid
});

const applyAssignment = () => {
    hydStore.assignBoundaryCondition(selectionArray.value, config.value);
    emit('close');
};

</script>

<style scoped>
.modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 2000;
    display: flex; align-items: center; justify-content: center;
}
.assignment-modal {
    width: 900px; height: 600px;
    background: #2c3e50; border-radius: 8px;
    display: flex; overflow: hidden;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    color: #ecf0f1;
}

/* COLUMNS */
.col-left {
    flex: 1; border-right: 1px solid #34495e;
    display: flex; flex-direction: column;
    background: #233140;
}
.col-right {
    flex: 1; display: flex; flex-direction: column;
    background: #2c3e50;
    padding: 20px;
}

/* LEFT SIDE */
.list-header {
    padding: 15px; border-bottom: 1px solid #34495e;
}
.list-header h3 { margin: 0 0 10px 0; font-size: 1.1rem; }

.tabs { display: flex; gap: 5px; margin-bottom: 10px; }
.tabs button {
    flex: 1; padding: 4px; background: #34495e; color: #bdc3c7; border: none; cursor: pointer; border-radius: 3px;
}
.tabs button.active { background: #3498db; color: white; }

.search-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem; }
.select-all { cursor: pointer; user-select: none; }
.count-badge { font-size: 0.8rem; opacity: 0.7; }

.list-content {
    flex: 1; overflow-y: auto; padding: 10px;
}
.list-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px; border-bottom: 1px solid #2f4050; border-radius: 4px;
    cursor: pointer;
}
.list-item:hover { background: #2f4050; }
.list-item.selected { background: #34495e; border-left: 3px solid #3498db; }

.item-label { display: flex; align-items: center; gap: 8px; cursor: pointer; flex: 1; }
.icon { font-size: 1.1rem; }
.id-text { font-family: monospace; font-size: 0.9rem; color: #ecf0f1; }

.status-badge { font-size: 0.75rem; color: #bdc3c7; }
.status-none { opacity: 0.5; font-style: italic; }

/* RIGHT SIDE */
.config-header { margin-bottom: 20px; border-bottom: 1px solid #34495e; padding-bottom: 10px; }
.config-header h3 { margin: 0 0 5px 0; }
.target-info { font-size: 0.9rem; color: #3498db; }

.config-body { flex: 1; }
.form-group { margin-bottom: 20px; }
.form-group label { display: block; font-size: 0.9rem; margin-bottom: 6px; color: #bdc3c7; }

.main-select, .sub-select, .value-input {
    width: 100%; padding: 10px; border-radius: 4px; border: 1px solid #34495e;
    background: #1e272e; color: white; font-size: 1rem;
}
.main-select:focus, .sub-select:focus, .value-input:focus { border-color: #3498db; outline: none; }

.info-box {
    background: rgba(52, 152, 219, 0.1); border: 1px solid #3498db; 
    padding: 10px; border-radius: 4px; font-size: 0.9rem; color: #3498db;
}

.modal-footer {
    display: flex; gap: 10px; justify-content: flex-end; padding-top: 20px; border-top: 1px solid #34495e;
}
.btn-cancel {
    padding: 10px 20px; background: transparent; color: #bdc3c7; border: 1px solid #7f8c8d; border-radius: 4px; cursor: pointer;
}
.btn-cancel:hover { color: white; border-color: white; }

.btn-save {
    padding: 10px 20px; background: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;
}
.btn-save:hover { background: #2ecc71; }
.btn-save:disabled { background: #7f8c8d; cursor: not-allowed; opacity: 0.5; }

.empty-selection { padding: 40px; text-align: center; color: #7f8c8d; font-size: 1.1rem; }
.hint { color: #e74c3c; font-size: 0.8rem; margin-top: 4px; }
</style>
