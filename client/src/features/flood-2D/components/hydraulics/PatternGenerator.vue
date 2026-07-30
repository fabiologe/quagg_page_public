<template>
  <div class="pattern-generator">
    <div class="toolbar">
      <button class="pat-btn" @click="openModal('WAVE')" title="Flash Flood Wave"><SvEmoji emoji="🌊" :size="14" /> Welle</button>
      <button class="pat-btn" @click="openModal('BLOCK')" title="Constant Block"><SvEmoji emoji="🧱" :size="14" /> Block</button>
      <button class="pat-btn" @click="openModal('LINEAR')" title="Linear Ramp"><SvEmoji emoji="📈" :size="14" /> Linear</button>
    </div>

    <!-- Parameter Popover/Modal — Teleport: entkommt dem z-index:15-Stacking-Context
         des rechten Panels (s. NetworkRasterCheck). -->
    <Teleport to="body">
    <div v-if="isOpen" class="popover-overlay" @click.self="close">
      <div class="popover">
        <h4 class="pop-title">{{ activeType }} generieren</h4>
        
        <div class="form-row">
            <label>Dauer (h)</label>
            <input type="number" v-model.number="duration_h" min="0.1" step="0.5">
        </div>

        <div class="form-row">
            <label>Spitzenwert / Menge (m³/s)</label>
            <input type="number" v-model.number="peakValue" min="0" step="1">
        </div>

        <div class="actions">
            <button @click="close" class="btn-cancel">Abbrechen</button>
            <button @click="generate" class="btn-primary">Generieren</button>
        </div>
      </div>
    </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import SvEmoji from '../common/SvEmoji.vue';

const emit = defineEmits(['generate']);

const isOpen = ref(false);
const activeType = ref('');

// Params
const duration_h = ref(2);
const peakValue = ref(10);

const openModal = (type) => {
    activeType.value = type;
    isOpen.value = true;
};

const close = () => {
    isOpen.value = false;
};

const generate = () => {
    const points = [];
    const durSec = duration_h.value * 3600;
    const peak = peakValue.value;

    if (activeType.value === 'WAVE') {
        // Triangle Wave: 0 -> Peak -> 0
        points.push({ t: 0, v: 0 });
        points.push({ t: durSec * 0.3, v: peak }); // Peak at 30%
        points.push({ t: durSec, v: 0 });
    } 
    else if (activeType.value === 'BLOCK') {
        // Block: 0 -> Peak -> Peak -> 0
        points.push({ t: 0, v: 0 });
        points.push({ t: 60, v: peak }); // Rise fast
        points.push({ t: durSec - 60, v: peak });
        points.push({ t: durSec, v: 0 });
    }
    else if (activeType.value === 'LINEAR') {
        // Linear: 0 -> Peak
        points.push({ t: 0, v: 0 });
        points.push({ t: durSec, v: peak });
    }

    emit('generate', points);
    close();
};

</script>

<style scoped>
.pattern-generator {
    margin-bottom: 0.5rem;
}

.toolbar {
    display: flex; gap: 0.5rem;
}

.pat-btn {
    flex: 1;
    background: #1e1e2c;
    border: 1px solid #2e2740;
    color: #bdc3c7;
    padding: 0.4rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: all 0.2s;
}
.pat-btn:hover {
    background: #2e2740; color: #fff; border-color: #a3e635;
}

/* POPOVER */
.popover-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.4);
    z-index: 100;
    display: flex; justify-content: center; align-items: center;
}

.popover {
    background: #16161f;
    border: 1px solid #a3e635;
    padding: 1rem;
    border-radius: 6px;
    width: 250px;
    color: #ecf0f1;
    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
}

.pop-title { margin-top: 0; margin-bottom: 1rem; text-align: center; color: #a3e635; }

.form-row { margin-bottom: 0.8rem; }
.form-row label { display: block; font-size: 0.8rem; color: #bdc3c7; margin-bottom: 2px; }
.form-row input { width: 100%; padding: 4px; background: #1e1e2c; border: 1px solid #2e2740; color: white; border-radius: 3px; }

.actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }
.btn-cancel { background: transparent; border: 1px solid #7f8c8d; color: #bdc3c7; cursor: pointer; padding: 4px 8px; border-radius: 4px; }
.btn-primary { background: #a3e635; border: none; color: #12121a; cursor: pointer; padding: 4px 12px; border-radius: 4px; }
</style>
