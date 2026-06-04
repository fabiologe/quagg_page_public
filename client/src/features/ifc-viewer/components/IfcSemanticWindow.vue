<template>
  <DraggableModal
    :isOpen="true"
    initialWidth="320px"
    initialHeight="600px"
    initialTop="80px"
    initialLeft="calc(50% + 520px)"
    @close="emit('close')"
  >
    <div class="props-window">
      <div class="props-header viewer-header">
        <span class="props-title">📋 IFC Eigenschaften</span>
        <button class="hdr-close" @click="emit('close')">&times;</button>
      </div>

      <div class="props-body">
        <!-- Kein Element gewählt -->
        <div v-if="!ifc.selectedElement" class="empty-state">
          <div class="empty-icon">🖱️</div>
          <div class="empty-text">Element im Viewer anklicken</div>
        </div>

        <!-- Element geladen -->
        <template v-else>

          <!-- Bridge-Export-Leiste (nur für strukturrelevante Elemente) -->
          <div v-if="isBridgeLike" class="bridge-export-bar">
            <span class="bridge-hint">Hydraulisches Sonderbauwerk</span>
            <button
              class="bridge-copy-btn"
              :disabled="isCopying"
              title="Bounding-Box als Bridge-JSON in Zwischenablage kopieren"
              @click="copyAsBridge"
            >
              {{ isCopying ? '⏳' : '🌉' }} Als Brücke kopieren
            </button>
          </div>

          <IfcSidebar
            :element="ifc.selectedElement"
            :psetError="ifc.psetError"
            @close="clearSelection"
            @add-pset="onAddPset"
          />
        </template>
      </div>
    </div>
  </DraggableModal>
</template>

<script setup>
import { ref, computed } from 'vue';
import DraggableModal from '@/features/isyifc/components/common/DraggableModal.vue';
import IfcSidebar from './IfcSidebar.vue';
import { useIfcStore } from '../stores/useIfcStore.js';

const emit = defineEmits(['close']);
const ifc  = useIfcStore();
const isCopying = ref(false);

const BRIDGE_TYPES = ['IFCBEAM', 'IFCSLAB', 'IFCCOLUMN', 'IFCBRIDGE', 'IFCBUILDINGELEMENT', 'IFCMEMBER'];

const isBridgeLike = computed(() =>
  BRIDGE_TYPES.includes((ifc.selectedElement?.type ?? '').toUpperCase())
);

async function clearSelection() {
  ifc.clearElement();
}

async function onAddPset({ psetName, props }) {
  await ifc.addPset(psetName, props);
}

async function copyAsBridge() {
  const el = ifc.selectedElement;
  if (!el) return;
  isCopying.value = true;
  try {
    const result = await ifc.getElementBridgeData(el.localId, el.modelId);
    if (!result) { alert('Keine Bounding-Box verfügbar. Ist ein Viewer aktiv?'); return; }

    const { box, offset } = result;
    // Three.js (Y up) → IFC/Plan-view (Z up):  three.Y → ifc.Z,  three.Z → ifc.Y  (inverted)
    const off = offset ?? { x: 0, y: 0, z: 0 };
    const toReal = (v) => ({
      x: v.x + off.x,
      y: -(v.z) + off.y,  // Three.js -Z = North in plan view
      z: v.y + off.z,
    });

    const min = toReal(box.min);
    const max = toReal(box.max);
    const lenX = max.x - min.x;
    const lenY = max.y - min.y;
    const isNS = lenY > lenX;
    const cx   = (min.x + max.x) / 2;
    const cy   = (min.y + max.y) / 2;

    const json = {
      type:    'quagg-bridge-v1',
      source:  'IFC',
      element: { globalId: el.globalId, ifcType: el.type, name: el.name },
      axis: {
        p1: isNS ? { x: cx,     y: min.y } : { x: min.x, y: cy },
        p2: isNS ? { x: cx,     y: max.y } : { x: max.x, y: cy },
      },
      z: {
        sohle:  parseFloat(min.z.toFixed(3)),
        soffit: parseFloat((min.z + (max.z - min.z) * 0.55).toFixed(3)),
        deck:   parseFloat(max.z.toFixed(3)),
      },
      width: parseFloat(Math.min(Math.abs(lenX), Math.abs(lenY)).toFixed(2)),
      crs:   'IFC-raw — prüfe ob UTM (EPSG:25832)',
    };

    await navigator.clipboard.writeText(JSON.stringify(json, null, 2));
    alert(`🌉 Brückendaten kopiert!\nAchse: ${json.axis.p1.x.toFixed(0)} / ${json.axis.p1.y.toFixed(0)} → ${json.axis.p2.x.toFixed(0)} / ${json.axis.p2.y.toFixed(0)}\nz_sohle: ${json.z.sohle} m | deck: ${json.z.deck} m\n\nIn Flood-2D → BridgeTool → "📋 Aus IFC" einfügen.`);
  } catch (err) {
    alert(`Fehler: ${err.message}`);
  } finally {
    isCopying.value = false;
  }
}
</script>

<style scoped>
.props-window {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.props-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.7rem 1rem;
  background: #1e2530;
  color: #90caf9;
  flex-shrink: 0;
  cursor: grab;
  user-select: none;
}
.props-header:active { cursor: grabbing; }

.props-title {
  font-weight: 600;
  font-size: 0.9rem;
}

.hdr-close {
  background: none;
  border: none;
  color: #90a4ae;
  font-size: 1.3rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 0.2rem;
  border-radius: 4px;
  transition: color 0.15s;
}
.hdr-close:hover { color: #ef5350; }

.props-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.bridge-export-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  background: rgba(231, 76, 60, 0.12);
  border-bottom: 1px solid rgba(231, 76, 60, 0.25);
  flex-shrink: 0;
}
.bridge-hint {
  flex: 1;
  font-size: 0.68rem;
  color: #e57373;
}
.bridge-copy-btn {
  padding: 0.25rem 0.6rem;
  background: rgba(231, 76, 60, 0.2);
  border: 1px solid rgba(231, 76, 60, 0.4);
  border-radius: 4px;
  color: #ef9a9a;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}
.bridge-copy-btn:hover:not(:disabled) { background: rgba(231, 76, 60, 0.4); }
.bridge-copy-btn:disabled { opacity: 0.5; cursor: wait; }

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  background: rgba(20, 22, 30, 0.95);
}

.empty-icon { font-size: 2rem; opacity: 0.4; }

.empty-text {
  font-size: 0.8rem;
  color: #546e7a;
  text-align: center;
}
</style>
