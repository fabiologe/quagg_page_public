<template>
  <div class="object-table">
    
    <!-- HEADER -->
    <div class="table-header">
      <div class="col-id">ID</div>
      <div class="col-type">Type</div>
      <div class="col-role">Info</div>
      <div class="col-actions"></div>
    </div>

    <!-- LIST -->
    <div class="table-body">
      <div 
        v-for="item in items" 
        :key="item.id" 
        class="table-row"
        :class="{ selected: isSelected(item.id) }"
        @click="selectItem(item.id)"
      >
        <!-- ID -->
        <div class="col-id" :title="item.id">
            {{ formatId(item.id) }}
        </div>

        <!-- TYPE ICON -->
        <div class="col-type">
            <span v-if="type === 'NODE'" title="Node">🟢</span>
            <span v-else-if="type === 'BUILDING'" title="Building">🏢</span>
            <span v-else-if="type === 'BOUNDARY'" title="Boundary">〰️</span>
            <span v-else>❓</span>
        </div>

        <!-- ROLE / INFO -->
        <div class="col-role">
            <!-- Node Specifics -->
            <span v-if="type === 'NODE'" class="badge" :class="getRoleClass(item)">
                {{ getNodeRole(item) }}
            </span>
            <!-- Building Height -->
            <span v-else-if="type === 'BUILDING'" class="info">
                {{ formatNumber(item.properties.height) }}m
            </span>
             <!-- Boundary Name -->
            <span v-else-if="type === 'BOUNDARY'" class="info">
                {{ item.properties.name || 'Boundary' }}
            </span>
        </div>

        <!-- ACTIONS -->
        <div class="col-actions">
            <button class="action-btn" @click.stop="$emit('zoom-to', item)" title="Zoom to Target">
                🎯
            </button>
        </div>
      </div>

       <!-- EMPTY STATE -->
      <div v-if="items.length === 0" class="empty-state">
        No items found.
      </div>

    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useSimulationStore } from '../../stores/useSimulationStore';
import { useGeoStore } from '../../stores/useGeoStore';
import { useHydraulicStore } from '../../stores/useHydraulicStore'; // IMPORT

const props = defineProps({
  type: { type: String, required: true }, // NODE, BUILDING, BOUNDARY
  items: { type: Array, required: true }
});

const emit = defineEmits(['zoom-to']);
const simStore = useSimulationStore();
const geoStore = useGeoStore();
const hydStore = useHydraulicStore(); // USE

// --- HELPERS ---

const isSelected = (id) => {
    // Handle potential array selection in simStore
    if (Array.isArray(simStore.selection)) {
        return simStore.selection.includes(id);
    }
    return simStore.selection === id;
};

const selectItem = (id) => {
    // Toggle logic for multi-select could be here, but keeping simple for now
    simStore.setSelection(id);
};

const formatId = (id) => {
    if (!id) return '-';
    return id.length > 8 ? id.substring(0, 8) + '...' : id;
};

const formatNumber = (val) => {
    return typeof val === 'number' ? val.toFixed(2) : '-';
};

// --- ROLES (Nodes) ---
const getNodeRole = (item) => {
    const assign = hydStore.getAssignment(item.id);
    if (assign) {
        if (assign.type === 'INFLOW_DYNAMIC') return '🌊 Inflow';
        if (assign.type === 'INFLOW_CONSTANT') return '🚰 Inflow (K)';
        if (assign.type === 'OUTFLOW_FREE') return '↘️ Outflow';
        if (assign.type === 'WATERLEVEL_FIX') return '🛑 Level';
    }
    return '-'; // or item.role if exists
};

const getRoleClass = (item) => {
    return 'neutral';
};

</script>

<style scoped>
.object-table {
    display: flex; flex-direction: column;
    height: 100%;
    background: #2c3e50;
    font-size: 0.9rem;
    color: #ecf0f1;
}

.table-header {
    display: flex;
    padding: 0.5rem;
    background: #34495e;
    font-weight: bold;
    border-bottom: 2px solid #233140;
    color: #bdc3c7;
    font-size: 0.8rem;
    text-transform: uppercase;
}

.table-body {
    flex: 1;
    overflow-y: auto;
}

.table-row {
    display: flex;
    align-items: center;
    padding: 0.5rem;
    border-bottom: 1px solid #34495e;
    cursor: pointer;
    transition: background 0.1s;
}

.table-row:hover {
    background: #3b536b;
}

.table-row.selected {
    background: #2980b9;
    color: #fff;
}

/* COLUMNS */
.col-id { flex: 0 0 80px; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.col-type { flex: 0 0 40px; text-align: center; }
.col-role { flex: 1; padding: 0 0.5rem; overflow: hidden; }
.col-actions { flex: 0 0 40px; display: flex; justify-content: flex-end; }

/* BADGES */
.badge {
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.75rem;
    background: #7f8c8d;
    color: #fff;
}
.info {
    font-size: 0.85rem;
    color: #bdc3c7;
}

/* BUTTONS */
.action-btn {
    background: none; border: none;
    cursor: pointer;
    font-size: 1rem;
    padding: 0;
    opacity: 0.7;
    transition: opacity 0.2s;
}
.action-btn:hover { opacity: 1; transform: scale(1.1); }

.empty-state {
    padding: 2rem;
    text-align: center;
    color: #7f8c8d;
    font-style: italic;
}

/* SCROLLBAR */
.table-body::-webkit-scrollbar { width: 6px; }
.table-body::-webkit-scrollbar-thumb { background: #7f8c8d; border-radius: 3px; }
.table-body::-webkit-scrollbar-track { background: #2c3e50; }
</style>
