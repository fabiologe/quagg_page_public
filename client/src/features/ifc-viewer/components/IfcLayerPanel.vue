<template>
  <div class="layer-panel">
    <div class="panel-header">
      <span class="panel-title">🎛️ Ebenen</span>
      <div class="header-right">
        <button class="hdr-btn" @click="toggleAll(true)"  title="Alle anzeigen">👁</button>
        <button class="hdr-btn" @click="toggleAll(false)" title="Alle ausblenden">🚫</button>
        <button class="hdr-btn close" @click="emit('close')">&times;</button>
      </div>
    </div>

    <div class="panel-body">
      <div
        v-for="cat in sortedCategories"
        :key="cat.name"
        class="layer-row"
        :class="{ hidden: !cat.visible }"
      >
        <button
          class="eye-btn"
          :title="cat.visible ? 'Ausblenden' : 'Einblenden'"
          @click="toggle(cat)"
        >
          <span v-if="cat.visible">👁</span>
          <span v-else class="eye-off">🚫</span>
        </button>

        <span class="cat-icon">{{ categoryIcon(cat.name) }}</span>

        <span
          class="cat-name"
          :title="`${cat.name} — Klick zum Zoomen`"
          @click="emit('zoom', { name: cat.name })"
        >
          {{ formatName(cat.name) }}
        </span>

        <span class="cat-count">{{ cat.count }}</span>
      </div>

      <div v-if="!categories.length" class="empty">
        Kein Modell geladen
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  categories: { type: Array, default: () => [] },
});
const emit = defineEmits(['toggle', 'close', 'zoom']);

const sortedCategories = computed(() =>
  [...props.categories].sort((a, b) => b.count - a.count)
);

function toggle(cat) {
  emit('toggle', { name: cat.name, visible: !cat.visible });
}

function toggleAll(visible) {
  for (const cat of props.categories) {
    if (cat.visible !== visible) {
      emit('toggle', { name: cat.name, visible });
    }
  }
}

/** Remove IFC prefix and camelCase the rest. */
function formatName(raw) {
  return raw
    .replace(/^IFC/, '')
    .replace(/TYPE$/, ' (Typ)')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace(/\s+/g, ' ');
}

const ICON_MAP = {
  IFCWALL:        '🧱', IFCWALLSTANDARDCASE: '🧱', IFCWALLTYPE: '🧱',
  IFCSLAB:        '⬛', IFCSLABTYPE:        '⬛',
  IFCCOLUMN:      '🏛️',  IFCCOLUMNTYPE:     '🏛️',
  IFCBEAM:        '━',  IFCBEAMTYPE:        '━',
  IFCWINDOW:      '🪟',  IFCWINDOWTYPE:      '🪟',
  IFCDOOR:        '🚪',  IFCDOORTYPE:        '🚪',
  IFCPIPESEGMENT: '🔵',  IFCPIPEFITTING:     '🔵',
  IFCDUCT:        '🟡',  IFCDUCTFITTING:     '🟡',
  IFCROOF:        '🏠',  IFCROOFTYPE:        '🏠',
  IFCSTAIR:       '🪜',  IFCSTAIRTYPE:       '🪜',
  IFCFOOTING:     '⬜',
  IFCSPACE:       '🟦',  IFCSPACETYPE:       '🟦',
  IFCFURNITURE:   '🛋️',  IFCFURNITURETYPE:   '🛋️',
  IFCRAILING:     '🔳',
  IFCMEMBER:      '▬',  IFCMEMBERTYPE:      '▬',
  IFCPLATE:       '▭',
  IFCCURTAINWALL: '🔲',
  IFCPUMP:        '⚙️',  IFCVALVE:           '⚙️',
  IFCFLOWTERMINAL:'💧',  IFCFLOWSEGMENT:     '💧', IFCFLOWFITTING: '💧',
};

function categoryIcon(name) {
  return ICON_MAP[name] ?? '📦';
}
</script>

<style scoped>
.layer-panel {
  position: absolute;
  left: 70px;
  top: 5rem;
  z-index: 25;
  width: 240px;
  max-height: 420px;
  display: flex;
  flex-direction: column;
  background: rgb(18, 20, 30);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.55rem 0.75rem;
  background: rgba(30,35,50,0.95);
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}

.panel-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: #90caf9;
}

.header-right { display: flex; gap: 0.2rem; align-items: center; }

.hdr-btn {
  background: none; border: none; color: #78909c;
  font-size: 0.9rem; cursor: pointer; padding: 0.15rem 0.3rem;
  border-radius: 4px; line-height: 1; transition: color 0.15s;
}
.hdr-btn:hover { color: #cfd8dc; }
.hdr-btn.close:hover { color: #ef5350; }

.panel-body {
  overflow-y: auto;
  flex: 1;
  padding: 0.3rem 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.15) transparent;
}

.layer-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.28rem 0.7rem;
  transition: background 0.12s;
  cursor: default;
}
.layer-row:hover { background: rgba(255,255,255,0.05); }
.layer-row.hidden { opacity: 0.45; }

.eye-btn {
  background: none; border: none; cursor: pointer;
  font-size: 0.82rem; padding: 0; line-height: 1;
  flex-shrink: 0; width: 20px; text-align: center;
  transition: transform 0.12s;
}
.eye-btn:hover { transform: scale(1.2); }
.eye-off { opacity: 0.5; }

.cat-icon {
  font-size: 0.8rem;
  flex-shrink: 0;
  width: 18px;
  text-align: center;
}

.cat-name {
  flex: 1;
  font-size: 0.75rem;
  color: #cfd8dc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.cat-name:hover { color: #90caf9; text-decoration: underline; }

.cat-count {
  font-size: 0.65rem;
  color: #546e7a;
  font-family: monospace;
  flex-shrink: 0;
}

.empty {
  padding: 1.5rem;
  text-align: center;
  color: #37474f;
  font-size: 0.78rem;
}
</style>
