<template>
  <div class="layer-panel">
    <div class="panel-header">
      <span class="panel-title"><CdeIcon name="layers" :size="14" /> Ebenen</span>
      <div class="header-right">
        <button class="hdr-btn" @click="toggleAll(true)"  title="Alle anzeigen" aria-label="Alle anzeigen">
          <CdeIcon name="visible" :size="13" />
        </button>
        <button class="hdr-btn" @click="toggleAll(false)" title="Alle ausblenden" aria-label="Alle ausblenden">
          <CdeIcon name="hidden" :size="13" />
        </button>
        <button class="hdr-btn close" @click="emit('close')" title="Schließen" aria-label="Schließen">
          <CdeIcon name="close" :size="13" />
        </button>
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
          <CdeIcon :name="cat.visible ? 'visible' : 'hidden'" :class="{ 'eye-off': !cat.visible }" :size="13" />
        </button>

        <CdeIcon class="cat-icon" :name="categoryIcon(cat.name)" :size="13" />

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

      <!-- Auxiliary toggle: IFC structural grid -->
      <div v-if="hasIfcGrids" class="layer-row aux-row">
        <button
          class="eye-btn"
          :title="ifcGridsVisible ? 'Achsenraster ausblenden' : 'Achsenraster einblenden'"
          @click="onToggleIfcGrids"
        >
          <CdeIcon :name="ifcGridsVisible ? 'visible' : 'hidden'" :class="{ 'eye-off': !ifcGridsVisible }" :size="13" />
        </button>
        <CdeIcon class="cat-icon" name="areas" :size="13" />
        <span class="cat-name">IFC-Achsenraster</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';

const props = defineProps({
  categories: { type: Array, default: () => [] },
  hasIfcGrids: { type: Boolean, default: false },
});
const emit = defineEmits(['toggle', 'close', 'zoom', 'toggle-ifc-grids']);

const ifcGridsVisible = ref(true);
function onToggleIfcGrids() {
  ifcGridsVisible.value = !ifcGridsVisible.value;
  emit('toggle-ifc-grids', ifcGridsVisible.value);
}

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

/**
 * IFC-Kategorie → semantischer Icon-Name (siehe CdeIcon).
 *
 * Bewusst grob gehalten: erkennbare Silhouetten für die häufigen Bauteile,
 * alles andere fällt auf 'element'. Vorher standen hier Emoji — deren
 * Darstellung wechselt je Betriebssystem, und sie ließen sich nicht in der
 * Farbe der Zeile mitführen (ausgeblendete Ebenen sollen verblassen).
 */
const ICON_MAP = {
  IFCWALL:         'cat-wall',   IFCWALLSTANDARDCASE: 'cat-wall',   IFCWALLTYPE: 'cat-wall',
  IFCSLAB:         'cat-slab',   IFCSLABTYPE:         'cat-slab',
  IFCCOLUMN:       'cat-column', IFCCOLUMNTYPE:       'cat-column',
  IFCBEAM:         'cat-beam',   IFCBEAMTYPE:         'cat-beam',
  IFCWINDOW:       'cat-window', IFCWINDOWTYPE:       'cat-window',
  IFCDOOR:         'cat-door',   IFCDOORTYPE:         'cat-door',
  IFCPIPESEGMENT:  'cat-pipe',   IFCPIPEFITTING:      'cat-pipe',
  IFCDUCT:         'cat-duct',   IFCDUCTFITTING:      'cat-duct',
  IFCROOF:         'cat-roof',   IFCROOFTYPE:         'cat-roof',
  IFCSTAIR:        'cat-stair',  IFCSTAIRTYPE:        'cat-stair',
  IFCFOOTING:      'cat-footing',
  IFCSPACE:        'space',      IFCSPACETYPE:        'space',
  IFCFURNITURE:    'cat-furniture', IFCFURNITURETYPE: 'cat-furniture',
  IFCRAILING:      'cat-railing',
  IFCMEMBER:       'cat-beam',   IFCMEMBERTYPE:       'cat-beam',
  IFCPLATE:        'cat-slab',
  IFCCURTAINWALL:  'cat-curtainwall',
  IFCPUMP:         'cat-equipment', IFCVALVE:         'cat-equipment',
  IFCFLOWTERMINAL: 'cat-flow',   IFCFLOWSEGMENT:      'cat-flow', IFCFLOWFITTING: 'cat-flow',
};

function categoryIcon(name) {
  return ICON_MAP[name] ?? 'element';
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
  background: var(--cde-surface);
  border: 1px solid var(--cde-tint-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--cde-scrim);
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.55rem 0.75rem;
  background: var(--cde-float);
  border-bottom: 1px solid var(--cde-tint);
  flex-shrink: 0;
}

.panel-title {
  display: flex; align-items: center; gap: 0.35rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--cde-accent-soft);
}

.header-right { display: flex; gap: 0.2rem; align-items: center; }

.hdr-btn {
  display: inline-flex; align-items: center; justify-content: center;
  background: none; border: none; color: var(--cde-text-mute);
  cursor: pointer; padding: 0.2rem 0.3rem;
  border-radius: var(--cde-radius-sm); transition: color 0.15s;
}
.hdr-btn:hover { color: var(--cde-text); }
.hdr-btn.close:hover { color: var(--cde-danger); }

.panel-body {
  overflow-y: auto;
  flex: 1;
  padding: 0.3rem 0;
  scrollbar-width: thin;
  scrollbar-color: var(--cde-tint-max) transparent;
}

.layer-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.28rem 0.7rem;
  transition: background 0.12s;
  cursor: default;
}
.layer-row:hover { background: var(--cde-tint-weak); }
.layer-row.hidden { opacity: 0.45; }

.eye-btn {
  display: inline-flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer;
  color: var(--cde-text-soft); padding: 0;
  flex-shrink: 0; width: 20px;
  transition: transform 0.12s, color 0.12s;
}
.eye-btn:hover { transform: scale(1.15); color: var(--cde-text-bright); }
/* Ausgeblendete Ebene: das durchgestrichene Auge tritt zurück. */
.eye-off { opacity: 0.55; }

/* Das Kategoriesymbol folgt der Textfarbe der Zeile — ausgeblendete Ebenen
   verblassen dadurch mitsamt ihrem Icon (Emoji konnten das nicht). */
.cat-icon {
  flex-shrink: 0;
  width: 18px;
  color: var(--cde-text-mute);
}

.cat-name {
  flex: 1;
  font-size: 0.75rem;
  color: var(--cde-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.cat-name:hover { color: var(--cde-accent-soft); text-decoration: underline; }

.cat-count {
  font-size: 0.65rem;
  color: var(--cde-text-dimmer);
  font-family: monospace;
  flex-shrink: 0;
}

.empty {
  padding: 1.5rem;
  text-align: center;
  color: var(--cde-text-dimmer);
  font-size: 0.78rem;
}
</style>
