<template>
  <!-- Teleport nach <body>: entkommt dem z-index:15-Stacking-Context des rechten Panels
       (sonst liegen Canvas-Overlays ÜBER dem Modal, s. NetworkRasterCheck). -->
  <Teleport to="body">
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="assignment-modal">
      
      <!-- LEFT: Object Selection -->
      <div class="col-left">
        <div class="list-header">
            <h3>Objekt-Auswahl</h3>
            <div class="tabs">
                <button :class="{ active: filter === 'ALL' }" @click="filter = 'ALL'">Alle</button>
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
                    <optgroup label="Zulauf">
                        <option value="INFLOW_DYNAMIC">🌊 Zufluss (Ganglinie)</option>
                        <option value="INFLOW_CONSTANT">🚰 Konstanter Zufluss</option>
                    </optgroup>
                    <option value="OUTFLOW" :disabled="outflowEligibility === 'NONE'">
                        ↘️ Ablauf{{ outflowEligibility === 'NONE' ? ' (nur auf Kante/nahe Gelände)' : '' }}
                    </option>
                    <!-- <option value="SINK">🕳️ Senke / Gully</option> -->
                </select>
                <div class="hint" v-if="config.type === 'OUTFLOW' && outflowEligibility === 'NONE'">
                    Ablauf ist nur verfügbar, wenn alle ausgewählten Objekte auf einer Modellkante oder nahe der Geländegrenze liegen.
                </div>
                <div class="hint" v-else-if="config.type === 'OUTFLOW' && outflowEligibility === 'STAGE_ONLY'">
                    Mindestens ein ausgewähltes Objekt liegt nicht auf der Rasterkante, sondern nur nahe der Geländegrenze — "Frei" wird dort direkt gesetzt (Punkt-Randbedingung mit Richtung); nur reine Diagonal-Eckzellen weichen auf die nächste Rasterkante aus.
                </div>
            </div>

            <!-- Dynamic: Profile Selection (Zufluss-Ganglinie + Ablauf-Pegel-Ganglinie) -->
            <div class="form-group" v-if="config.type === 'INFLOW_DYNAMIC' || (config.type === 'OUTFLOW' && config.outflowMode === 'HVAR')">
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

            <!-- Ablauf: Verhalten-Umschalter (Frei/Fester Pegel/Pegel-Ganglinie) -->
            <div class="form-group" v-if="config.type === 'OUTFLOW'">
                <label>Verhalten</label>
                <div class="mode-row">
                    <button v-for="opt in outflowModeOptions" :key="opt.value" class="mode-btn"
                            :class="{ active: config.outflowMode === opt.value }"
                            :disabled="opt.value === 'FREE' && outflowEligibility === 'NONE'"
                            :title="opt.value === 'FREE' && outflowEligibility === 'NONE' ? freeDisabledTooltip : ''"
                            @click="setOutflowMode(opt.value)">{{ opt.icon }} {{ opt.label }}</button>
                </div>
            </div>

            <div class="info-box outflow-config" v-if="config.type === 'OUTFLOW' && config.outflowMode === 'FREE'">
                <p>Das Wasser fließt an dieser Grenze frei aus dem Modell ab.</p>
                <div class="form-group" style="margin-top:10px;">
                    <label>Sohlgefälle Sf (m/m) — optional</label>
                    <input type="number" v-model.number="config.outflowSlope" step="0.1" min="0.001"
                           placeholder="Standard: 10 (steil, verhindert Rückstau)" class="value-input">
                </div>
            </div>
            <div class="form-group" v-else-if="config.type === 'OUTFLOW' && config.outflowMode === 'HFIX'">
                <label>Bezug</label>
                <div class="mode-row">
                    <button class="mode-btn" :class="{ active: !config.stageRelative }"
                            @click="config.stageRelative = false">Absolut (m NHN)</button>
                    <button class="mode-btn" :class="{ active: config.stageRelative }"
                            @click="config.stageRelative = true">Relativ (über Gelände)</button>
                </div>
                <label style="margin-top:10px;">{{ config.stageRelative ? 'Wasserstand über Gelände (m)' : 'Fester Wasserspiegel (m NHN)' }}</label>
                <input type="number" v-model.number="config.stageValue" step="0.1" class="value-input">
                <small v-if="config.stageRelative" class="hint-info">
                    Wasserspiegel = Geländehöhe an der Randbedingung + dieser Wert.
                </small>
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
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore';
import { useHydraulicStore } from '@/features/flood-2D/stores/useHydraulicStore';

// NEW: Multi-select support
const props = defineProps({
  targetIds: { type: Array, default: () => [] }
});

const emit = defineEmits(['close']);

const geoStore = useGeoStore();
const hydStore = useHydraulicStore();

// --- LIST LOGIC ---
const filter = ref('ALL'); // ALL, BOUNDARY

// Merge all geometry items into uniform list
const allItems = computed(() => {
    const list = [];
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
    // If we have specific targets passed via Props, show ONLY those?
    // User Guide says: "Zeige im Titel: Bearbeite {{ targetIds.length }} Objekte".
    // Usually an AssignmentModal might be "Manage Selection".
    // If targetIds are passed, we likely want to scope the list to those IDs or pre-select them.
    // Given the prompt "Wenn der Parent nur eine ID übergibt...", let's assume we pre-select or limit.
    // Let's LIMIT the list to the targets if they are provided, OR pre-select them.
    // "Objekt-Auswahl" (Object Selection) implies you can change selection.
    // But "Bearbeite X Objekte" implies context.
    // Let's PRE-SELECT them.
    
    if (filter.value === 'ALL') return allItems.value;
    return allItems.value.filter(i => i.type === filter.value);
});

const getIcon = (type) => {
    return '➖';
};

const getStatus = (id) => {
    const assign = hydStore.getAssignment(id);
    if (!assign) return '<span class="status-none">Unkonfiguriert</span>';

    // Icons for status
    if (assign.type === 'INFLOW_DYNAMIC') return '🟢 Zufluss (dyn)';
    if (assign.type === 'INFLOW_CONSTANT') return '🟢 Zufluss (konst)';
    if (assign.type === 'WATERLEVEL_FIX') return assign.profileId ? '🌊 Ablauf (Pegel-Ganglinie)' : '📏 Ablauf (Fester Pegel)';
    if (assign.type === 'OUTFLOW_FREE') return '↘️ Ablauf (Frei)';
    return '⚙️ ' + assign.type;
};

// --- SELECTION LOGIC ---
const selectionArray = ref([]); 

// NEW: Initialize selection from props
watch(() => props.targetIds, (newIds) => {
    if (newIds && newIds.length > 0) {
        // Ensure we only select items that exist
        const allIds = new Set(allItems.value.map(i => i.id));
        selectionArray.value = newIds.filter(id => allIds.has(id));
    } else {
        selectionArray.value = [];
    }
}, { immediate: true });

const selectedIds = computed(() => new Set(selectionArray.value));

// Ablauf-Eignung über die gesamte Mehrfachauswahl — "schwächster gemeinsamer Nenner":
// ein einziges ungeeignetes Objekt zieht die ganze Auswahl runter.
// 'FULL' = alle auf echter Rechteck-Kante ODER mit aufgelöstem literalem Randbogen
// (properties.literalEdgeArc, terrainFront.js — useBoundaryTool.js commit()) — beide Fälle
// liefern garantiert gültige N/S/E/W-Kantenzellen, "Frei" landet EXAKT dort.
// 'STAGE_ONLY' = alle mindestens nahe der (ggf. irregulären) Geländegrenze OHNE literalen
// Randbogen (properties.nearFront) — der InputGenerator setzt hier eine DIREKTE Punkt-FREE mit
// Richtungs-Token an genau dieser Zelle (quagg-outflow-free-direction.patch), "Frei" landet
// also normalerweise auch hier EXAKT an der geklickten Stelle; nur eine reine Diagonal-
// Eckzelle fällt auf eine Projektion auf die nächste Kante zurück.
// 'NONE' = mindestens ein Objekt ist vollständig innen (kein Rand/keine Front) — dort lehnt
// der Solver FREE als reine Punktquelle ab, komplett gesperrt.
const outflowEligibility = computed(() => {
    if (selectionArray.value.length === 0) return 'NONE';
    const items = selectionArray.value.map(id => allItems.value.find(i => i.id === id)?._raw?.properties || {});
    const hasEdgeAccess = (p) => !!p.edge || !!p.literalEdgeArc?.length;
    if (items.every(hasEdgeAccess)) return 'FULL';
    if (items.every(p => hasEdgeAccess(p) || !!p.nearFront)) return 'STAGE_ONLY';
    return 'NONE';
});
const freeDisabledTooltip = 'Frei ist nur auf der Rasterkante oder nahe der Geländegrenze gültig ' +
    '(LISFLOOD lehnt sie als reine Innen-Punktquelle ab). Mindestens ein ausgewähltes Objekt liegt ' +
    'vollständig im Inneren — "Fester Pegel"/"Pegel-Ganglinie" nutzen oder näher an den Rasterrand/die ' +
    'Geländegrenze zeichnen.';

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

// "Ablauf" ist reine UI-Gruppierung (config.type='OUTFLOW', NIE persistiert) — löst sich in
// applyAssignment() auf die zwei tatsächlich gespeicherten Store-Typen auf (OUTFLOW_FREE /
// WATERLEVEL_FIX), analog zu BoundaryConfig.vue.
const outflowModeOptions = [
    { value: 'FREE', icon: '↘️', label: 'Frei' },
    { value: 'HFIX', icon: '📏', label: 'Fester Pegel' },
    { value: 'HVAR', icon: '🌊', label: 'Pegel-Ganglinie' },
];

const config = ref({
    type: 'INFLOW_DYNAMIC',
    value: null,
    profileId: null,
    outflowMode: 'FREE',
    outflowSlope: null,
    stageValue: null,
    stageRelative: false,
});

// Reset config params when type changes
watch(() => config.value.type, (newType) => {
    if (newType === 'OUTFLOW') {
        config.value.profileId = null;
        config.value.value = null;
        // outflowMode steht auf seinem Ref-Default 'FREE' (s. o.) — nie als scheinbar aktiv
        // anzeigen, wenn die aktuelle Auswahl das gar nicht hergibt (sonst "aktiv" UND gesperrt
        // gleichzeitig, s. BoundaryConfig.vue-Pendant).
        if (config.value.outflowMode === 'FREE' && outflowEligibility.value === 'NONE') {
            config.value.outflowMode = 'HFIX';
        }
    }
    if (newType === 'INFLOW_CONSTANT') {
        config.value.profileId = null;
        if (config.value.value === null) config.value.value = 0;
    }
    if (newType === 'INFLOW_DYNAMIC') {
        config.value.value = null;
        // Keep profileId if possible, or reset
    }
});

function setOutflowMode(mode) {
    // Defensiv (das :disabled am Button sollte das schon verhindern): "Frei" braucht Rand-
    // oder Geländegrenzen-Nähe über die gesamte Auswahl, nur bei reiner Innen-Lage gesperrt.
    if (mode === 'FREE' && outflowEligibility.value === 'NONE') return;
    config.value.outflowMode = mode;
}

const isValidConfig = computed(() => {
    if (config.value.type === 'INFLOW_DYNAMIC') {
        return !!config.value.profileId;
    }
    if (config.value.type === 'INFLOW_CONSTANT') {
        return config.value.value !== null && config.value.value !== '';
    }
    if (config.value.type === 'OUTFLOW') {
        if (outflowEligibility.value === 'NONE') return false;
        if (config.value.outflowMode === 'HVAR') return !!config.value.profileId;
        if (config.value.outflowMode === 'HFIX') return Number.isFinite(config.value.stageValue);
        return true; // Frei ist gültig (Eignung bereits oben abgesichert)
    }
    return true;
});

const applyAssignment = () => {
    let payload;
    if (config.value.type === 'OUTFLOW') {
        if (config.value.outflowMode === 'FREE') {
            payload = { type: 'OUTFLOW_FREE', value: null, profileId: null, outflowSlope: config.value.outflowSlope };
        } else if (config.value.outflowMode === 'HFIX') {
            payload = { type: 'WATERLEVEL_FIX', value: config.value.stageValue, profileId: null, relative: config.value.stageRelative || false };
        } else {
            payload = { type: 'WATERLEVEL_FIX', value: null, profileId: config.value.profileId };
        }
    } else {
        payload = { type: config.value.type, value: config.value.value, profileId: config.value.profileId };
    }
    hydStore.assignBoundaryCondition(selectionArray.value, payload);
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
    background: #1e1e2c; border-radius: 8px;
    display: flex; overflow: hidden;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    color: #ecf0f1;
}

/* COLUMNS */
.col-left {
    flex: 1; border-right: 1px solid #2e2740;
    display: flex; flex-direction: column;
    background: #16161f;
}
.col-right {
    flex: 1; display: flex; flex-direction: column;
    background: #1e1e2c;
    padding: 20px;
}

/* LEFT SIDE */
.list-header {
    padding: 15px; border-bottom: 1px solid #2e2740;
}
.list-header h3 { margin: 0 0 10px 0; font-size: 1.1rem; }

.tabs { display: flex; gap: 5px; margin-bottom: 10px; }
.tabs button {
    flex: 1; padding: 4px; background: #2e2740; color: #bdc3c7; border: none; cursor: pointer; border-radius: 3px;
}
.tabs button.active { background: #a3e635; color: #12121a; }

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
.list-item.selected { background: #2e2740; border-left: 3px solid #a3e635; }

.item-label { display: flex; align-items: center; gap: 8px; cursor: pointer; flex: 1; }
.icon { font-size: 1.1rem; }
.id-text { font-family: monospace; font-size: 0.9rem; color: #ecf0f1; }

.status-badge { font-size: 0.75rem; color: #bdc3c7; }
.status-none { opacity: 0.5; font-style: italic; }

/* RIGHT SIDE */
.config-header { margin-bottom: 20px; border-bottom: 1px solid #2e2740; padding-bottom: 10px; }
.config-header h3 { margin: 0 0 5px 0; }
.target-info { font-size: 0.9rem; color: #a3e635; }

.config-body { flex: 1; }
.form-group { margin-bottom: 20px; }
.form-group label { display: block; font-size: 0.9rem; margin-bottom: 6px; color: #bdc3c7; }

.main-select, .sub-select, .value-input {
    width: 100%; padding: 10px; border-radius: 4px; border: 1px solid #2e2740;
    background: #1e272e; color: white; font-size: 1rem;
}
.main-select:focus, .sub-select:focus, .value-input:focus { border-color: #a3e635; outline: none; }

.info-box {
    background: rgba(163,230,53, 0.1); border: 1px solid #a3e635; 
    padding: 10px; border-radius: 4px; font-size: 0.9rem; color: #a3e635;
}

.modal-footer {
    display: flex; gap: 10px; justify-content: flex-end; padding-top: 20px; border-top: 1px solid #2e2740;
}
.btn-cancel {
    padding: 10px 20px; background: transparent; color: #bdc3c7; border: 1px solid #7f8c8d; border-radius: 4px; cursor: pointer;
}
.btn-cancel:hover { color: white; border-color: white; }

.btn-save {
    padding: 10px 20px; background: #a3e635; color: #12121a; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;
}
.btn-save:hover { background: #b6f04d; }
.btn-save:disabled { background: #7f8c8d; cursor: not-allowed; opacity: 0.5; }

.empty-selection { padding: 40px; text-align: center; color: #7f8c8d; font-size: 1.1rem; }
.hint { color: #e74c3c; font-size: 0.8rem; margin-top: 4px; }
.hint-info { color: #7f8c8d; font-size: 0.8rem; margin-top: 3px; display: block; }

/* ── Ablauf-Verhalten-Umschalter ── */
.mode-row { display: flex; gap: 6px; }
.mode-btn {
    flex: 1; padding: 7px 4px; border: 1px solid #4a6278; border-radius: 5px;
    background: #1e3348; color: #bdc3c7; font-size: 0.75rem; font-weight: 600;
    cursor: pointer; transition: all 0.15s; text-align: center;
}
.mode-btn:hover  { background: #2471a3; border-color: #6d43d4; color: #fff; }
.mode-btn.active { background: #6d43d4; border-color: #a3e635; color: #fff; }
.mode-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.mode-btn:disabled:hover { background: #1e3348; border-color: #4a6278; color: #bdc3c7; }
</style>
