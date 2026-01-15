<template>
  <div class="property-panel">
    
    <!-- HEADER -->
    <div class="panel-header">
      <h2>{{ selection ? 'Properties' : 'Scenario Config' }}</h2>
      <p>
        {{ selection ? `${selection.properties.type} (${selection.id.slice(0,6)})` : 'Global settings' }}
      </p>
    </div>

    <!-- CONTENT -->
    <div class="panel-content">
      
      <!-- GLOBAL CONFIG (When nothing selected) -->
      <div v-if="!selection" class="form-group-container">
        
        <div class="form-item">
          <label>Duration (seconds)</label>
          <input 
            type="number" 
            v-model.number="store.simulationConfig.duration_s"
            class="input-std"
          />
        </div>

        <div class="form-item">
          <label>Global Rain (mm/h)</label>
          <div class="range-wrapper">
            <input 
              type="range" min="0" max="200" step="10"
              v-model.number="store.simulationConfig.globalRain_mm"
            />
            <span class="val-display">{{ store.simulationConfig.globalRain_mm }}</span>
          </div>
        </div>

      </div>

      <!-- FEATURE PROPERTIES -->
      <div v-else class="form-group-container">
        
        <!-- BUILDING -->
        <div v-if="selection.properties.type === 'BUILDING'">
          <div class="form-item">
            <label>Height (m)</label>
            <div class="range-wrapper">
              <input 
                type="range" min="1" max="50" step="1"
                :value="selection.properties.height_m"
                @input="updateProp('height_m', $event.target.value)"
              />
              <span class="val-display">{{ selection.properties.height_m }}</span>
            </div>
            <p class="help-text">Elevation offset relative to DGM</p>
          </div>

          <div class="form-item">
             <label>Volume (m³)</label>
             <input 
              type="number" min="0" step="1"
              :value="selection.properties.volume" 
              @input="updateProp('volume', $event.target.value)"
              class="input-std"
             />
          </div>

          <div class="form-item">
             <label>Inflow (l/s)</label>
             <input 
              type="number" min="0" step="0.1"
              :value="selection.properties.constantInflow" 
              @input="updateProp('constantInflow', $event.target.value)"
              class="input-std"
             />
          </div>

          <div class="form-item">
             <label>Outflow (l/s)</label>
             <input 
              type="number" min="0" step="0.1"
              :value="selection.properties.constantOutflow" 
              @input="updateProp('constantOutflow', $event.target.value)"
              class="input-std"
             />
          </div>

          <div class="checkbox-wrapper">
             <input 
              type="checkbox" 
              :checked="selection.properties.is_sink"
              @change="updateProp('is_sink', $event.target.checked)"
              id="build_sink_chk"
             />
             <label for="build_sink_chk">Is Sink (Outfall)?</label>
          </div>
        </div>

        <!-- OBSTACLE (Wall) -->
        <div v-if="selection.properties.type === 'OBSTACLE'">
          <div class="form-item">
            <label>Wall Height (m)</label>
             <div class="range-wrapper">
              <input 
                type="range" min="0.5" max="10" step="0.1"
                :value="selection.properties.height_m"
                @input="updateProp('height_m', $event.target.value)"
              />
              <span class="val-display">{{ selection.properties.height_m }}</span>
            </div>
          </div>
        </div>

        <!-- SOURCE -->
        <div v-if="selection.properties.type === 'SOURCE'">
          <div class="form-group-container">
            
            <div class="form-item">
               <label>Name</label>
               <input 
                type="text" 
                :value="selection.properties.name" 
                @input="updateProp('name', $event.target.value)"
                class="input-std"
               />
            </div>

            <div class="form-item">
               <label>Flow (l/s)</label>
               <input 
                type="number" min="0" step="1"
                :value="selection.properties.value" 
                @input="updateProp('value', $event.target.value)"
                class="input-std"
               />
            </div>

            <div class="checkbox-wrapper">
               <input 
                type="checkbox" 
                :checked="selection.properties.is_sink"
                @change="updateProp('is_sink', $event.target.checked)"
                id="is_sink_chk"
               />
               <label for="is_sink_chk">Is Sink (Outflow)?</label>
            </div>

          </div>
        </div>

        <!-- ACTIONS -->
        <div class="action-group">
           <button @click="deleteFeature" class="btn-delete">
             Delete Feature
           </button>
        </div>

      </div>

    </div>

    <!-- FOOTER: RUN SIMULATION -->
    <div class="panel-footer">
       <button 
        class="btn-primary-lg"
        @click="runSimulation"
        :disabled="store.criticalErrors.length > 0"
       >
         Start Simulation
       </button>
       <div v-if="store.criticalErrors.length > 0" class="error-msg">
         Fix errors before starting.
       </div>
    </div>

  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useScenarioStore } from '@/stores/scenarioStore';

const store = useScenarioStore();
const selection = computed(() => store.selectedFeature);
const emit = defineEmits(['start-simulation']);

const updateProp = (key, value) => {
  let val = value;
  if (['height_m', 'value', 'duration_s', 'volume', 'constantInflow', 'constantOutflow'].includes(key)) {
     val = parseFloat(value);
  }
  store.updateFeatureProperties(store.selectedFeatureId, { [key]: val });
};

const deleteFeature = () => {
   if (store.selectedFeatureId) {
     store.deleteFeature(store.selectedFeatureId);
   }
};

const runSimulation = async () => {
    try {
        console.log("Preparing Simulation Handover...");
        const payload = await store.prepareInput(null); 
        console.log("Payload Ready:", payload);
        emit('start-simulation', payload);
    } catch (e) {
        alert(e.message);
    }
};
</script>

<style scoped>
.property-panel {
    width: 320px;
    height: 100%;
    background-color: #f9f9f9;
    border-left: 1px solid #e0e0e0;
    display: flex;
    flex-direction: column;
    box-shadow: -2px 0 5px rgba(0,0,0,0.05);
    z-index: 10;
}

.panel-header {
    background-color: #f0f2f5;
    padding: 1rem;
    border-bottom: 1px solid #ddd;
}
.panel-header h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: #333;
}
.panel-header p {
    margin: 0.25rem 0 0;
    font-size: 0.8rem;
    color: #777;
}

.panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
}

.form-group-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
}

.form-item label {
    display: block;
    font-size: 0.85rem;
    font-weight: 500;
    color: #444;
    margin-bottom: 0.5rem;
}

.input-std {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.9rem;
}
.input-std:focus {
    border-color: #3498db;
    outline: none;
}

.range-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
.range-wrapper input {
    flex: 1;
}
.val-display {
    font-family: monospace;
    font-size: 0.9rem;
    width: 3rem;
    text-align: right;
    color: #555;
}

.help-text {
    font-size: 0.75rem;
    color: #888;
    margin-top: 0.25rem;
}

.checkbox-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    font-size: 0.9rem;
}

.action-group {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #eee;
}

.btn-delete {
    width: 100%;
    padding: 0.5rem;
    background-color: #fff5f5;
    color: #c0392b;
    border: 1px solid #feb2b2;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
}
.btn-delete:hover {
    background-color: #fee2e2;
}

.panel-footer {
    padding: 1rem;
    background-color: white;
    border-top: 1px solid #ddd;
}

.btn-primary-lg {
    width: 100%;
    padding: 0.75rem;
    background-color: #3498db;
    color: white;
    font-weight: bold;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    transition: transform 0.1s;
}
.btn-primary-lg:hover:not(:disabled) {
    background-color: #2980b9;
}
.btn-primary-lg:active:not(:disabled) {
    transform: scale(0.98);
}
.btn-primary-lg:disabled {
    background-color: #95a5a6;
    cursor: not-allowed;
    opacity: 0.7;
}

.error-msg {
    color: #c0392b;
    font-size: 0.8rem;
    margin-top: 0.5rem;
    text-align: center;
    font-weight: 500;
}
</style>
