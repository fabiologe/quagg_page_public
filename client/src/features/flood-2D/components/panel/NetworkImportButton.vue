<template>
  <div class="net-import">
    <button class="net-btn" :disabled="busy" @click="pick" title="ISYBAU-XML oder IFC importieren">
      <SvEmoji emoji="🕳️" :size="15" />
      {{ busy ? 'Importiere…' : 'Entwässerungsnetz importieren' }}
    </button>
    <input ref="fileInput" type="file" accept=".xml,.ifc,.ifcxml" class="hidden-input" @change="onFile" />

    <!-- schlichte Inline-Zeile (kein Popup): das Ergebnis steht ohnehin in der Tabelle -->
    <div v-if="status" class="net-status-inline" :class="status.type">{{ status.text }}</div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import SvEmoji from '../common/SvEmoji.vue';
import { useNetworkStore } from '@/features/flood-2D/stores/useNetworkStore.js';
import { importDrainageNetwork } from '@/features/flood-2D/services/geometry/import/index.js';

const net = useNetworkStore();
const fileInput = ref(null);
const busy = ref(false);
const status = ref(null);

function pick() { fileInput.value?.click(); }

async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';               // erlaubt erneuten Import derselben Datei
    if (!file) return;
    busy.value = true; status.value = null;
    try {
        const content = await file.text();
        const res = importDrainageNetwork({ name: file.name, content });
        if (!res.ok || !res.model) {
            status.value = { type: 'err', text: (res.warnings?.[0]) || `Import fehlgeschlagen (${res.format}).` };
            return;
        }
        net.setModel(res.model, { format: res.format, warnings: res.warnings });
        status.value = {
            type: (res.warnings?.length) ? 'warn' : 'ok',
            text: `${res.format}: ${net.nodes.length} Schächte, ${net.links.length} Haltungen.`,
        };
    } catch (err) {
        status.value = { type: 'err', text: `Fehler beim Lesen: ${err.message}` };
    } finally {
        busy.value = false;
    }
}
</script>

<style scoped>
.net-import { display: flex; flex-direction: column; gap: 5px; font-family: var(--sv-font, sans-serif); }
.hidden-input { display: none; }
.net-btn {
    display: flex; align-items: center; justify-content: center; gap: 7px;
    padding: 8px 12px; border-radius: 6px; cursor: pointer;
    background: var(--sv-surface, #253547); color: var(--sv-text, #ecf0f1);
    border: 1px solid var(--sv-violet, #8b5cf6); font-size: 0.85rem; font-weight: 600;
    transition: background .15s, border-color .15s;
}
.net-btn:hover:not(:disabled) { border-color: var(--sv-lime, #a3e635); }
.net-btn:disabled { opacity: .6; cursor: not-allowed; }
.net-status-inline { font-size: 0.74rem; padding: 0 2px; }
.net-status-inline.ok   { color: #a3e635; }
.net-status-inline.warn { color: #f39c12; }
.net-status-inline.err  { color: #e74c3c; }
</style>
