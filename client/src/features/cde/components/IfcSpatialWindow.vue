<template>
  <!-- Sprint P/AP-12: Der frühere `chrome`-Zweig ist entfallen. Er hätte die
       Komponente wahlweise in ein schwebendes DraggableModal gehüllt — ein Weg,
       den seit Sprint U kein Aufrufer mehr nahm (alle setzten `chrome=false`),
       dessen Vorgabewert aber auf `true` stand. Das Chrome liefert jetzt
       ausschließlich CdePanel in der Leiste. -->
  <div class="rail-fill">
    <div class="spatial-window">

      <!-- Search -->
      <div class="sw-search">
        <CdeIcon class="search-icon" name="search" :size="13" />
        <input
          v-model="filterText"
          class="search-input"
          placeholder="Filtern…"
          spellcheck="false"
        />
        <button v-if="filterText" class="search-clear" @click="filterText = ''" title="Filter leeren" aria-label="Filter leeren">
          <CdeIcon name="close" :size="12" />
        </button>
      </div>

      <!-- Tree content -->
      <div class="sw-body" ref="bodyRef">
        <div v-if="!ifc.spatialTree" class="empty-state">
          <CdeIcon class="empty-icon" name="bim" :size="30" />
          <div class="empty-text">IFC-Modell laden um die<br>Gebäudestruktur anzuzeigen</div>
        </div>

        <IfcSpatialTree
          v-else
          :tree="ifc.spatialTree"
          :bare="true"
          :filter="filterText"
          @toggle-storey="onToggleStorey"
          @zoom-to="onZoomTo"
        />
      </div>

      <!-- Footer stats -->
      <div v-if="ifc.spatialTree" class="sw-footer">
        <span class="footer-info">{{ ifc.modelList.length }} Modell{{ ifc.modelList.length !== 1 ? 'e' : '' }}</span>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import IfcSpatialTree from './IfcSpatialTree.vue';
import { useIfcStore } from '../stores/useIfcStore.js';
import { useViewerApi } from '../composables/viewerApi.js';

// Kein 'close'-Emit mehr: Das Schließen liegt bei CdePanel, das die
// Leiste kennt und den Panel-Store führt.
const ifc  = useIfcStore();
const api = useViewerApi();

const filterText = ref('');
const bodyRef    = ref(null);

async function onToggleStorey({ localId, visible }) {
  await api.setStoreyVisible(localId, visible);
}

async function onZoomTo({ localId }) {
  await api.zoomToLocalId(localId);
}

function expandAll()   { bodyRef.value?.querySelectorAll('.caret[data-open="false"]').forEach(el => el.click()); }
function collapseAll() { bodyRef.value?.querySelectorAll('.caret[data-open="true"]').forEach(el => el.click()); }

// Sprint P/AP-12: Die beiden Knöpfe saßen im entfallenen Modal-Kopf. Sie
// wandern in den `head-actions`-Slot von CdePanel — dessen ersten Nutzer.
defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
/* Sprint U: In der Panel-Leiste füllt die Komponente das Panel-Body */
.rail-fill { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.spatial-window {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--cde-float-deeper);
}

/* Das CSS des entfallenen Modal-Kopfes ist mit ihm weggefallen (Sprint P/AP-12). */

/* ── Search ── */
.sw-search {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.75rem;
  border-bottom: 1px solid var(--cde-tint-weak);
  background: var(--cde-float-deep);
  flex-shrink: 0;
}
.search-icon { color: var(--cde-text-mute); flex-shrink: 0; }
.search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--cde-text);
  font-size: 0.78rem;
  caret-color: var(--cde-accent);
}
.search-input::placeholder { color: var(--cde-text-dimmer); }
.search-clear {
  display: inline-flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer;
  color: var(--cde-text-dimmer); padding: 0;
  transition: color 0.12s;
}
.search-clear:hover { color: var(--cde-danger); }

/* ── Body ── */
.sw-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--cde-tint-strong) transparent;
}

/* ── Empty state ── */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  padding: 3rem 1rem;
}
.empty-icon { color: var(--cde-text-dimmer); opacity: 0.6; }
.empty-text {
  font-size: 0.78rem;
  color: var(--cde-text-dimmer);
  text-align: center;
  line-height: 1.5;
}

/* ── Footer ── */
.sw-footer {
  flex-shrink: 0;
  padding: 0.35rem 0.9rem;
  border-top: 1px solid var(--cde-tint-weak);
  background: var(--cde-float-deep);
}
.footer-info {
  font-size: 0.65rem;
  color: var(--cde-text-dimmer);
}
</style>
