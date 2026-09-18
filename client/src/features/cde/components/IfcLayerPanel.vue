<template>
  <div class="layer-panel" :class="{ eingebettet }">
    <div class="panel-header">
      <span class="panel-title"><CdeIcon name="layers" :size="14" /> Kategorien</span>
      <div class="header-right">
        <button class="hdr-btn" @click="toggleAll(true)"  title="Alle anzeigen" aria-label="Alle anzeigen">
          <CdeIcon name="visible" :size="13" />
        </button>
        <button class="hdr-btn" @click="toggleAll(false)" title="Alle ausblenden" aria-label="Alle ausblenden">
          <CdeIcon name="hidden" :size="13" />
        </button>
        <button v-if="!eingebettet" class="hdr-btn close" @click="emit('close')" title="Schließen" aria-label="Schließen">
          <CdeIcon name="close" :size="13" />
        </button>
      </div>
    </div>

    <!-- Darstellung des Modells. Sass bis Sprint I im PDF-Export-Modal, wo
         sie nur der Rastervorschau diente. Sie gehoert hierher: was am Modell
         zu sehen ist, wird in diesem Panel verwaltet. -->
    <div class="stil-zeile">
      <span class="stil-titel">Darstellung</span>
      <button
        v-for="st in LAYER_STYLES_LISTE"
        :key="st.id"
        class="stil-knopf"
        :class="{ aktiv: aktiverStil === st.id }"
        :title="st.id === 'plan' ? 'Weisser Grund, gedeckte Farben — wie auf dem Blatt' : 'Modellfarben wie geladen'"
        @click="stilWaehlen(st.id)"
      >
        <CdeIcon :name="st.icon" :size="12" /> {{ st.label }}
      </button>
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
import { LAYER_STYLES } from '../services/LayerStyleManager.js';
import { getEntityInfo } from '../data/entity-schema.js';
import { useViewerApi } from '../composables/viewerApi.js';

const props = defineProps({
  categories: { type: Array, default: () => [] },
  hasIfcGrids: { type: Boolean, default: false },
  /** H3: in der Tafel „Modelle“ statt schwebend über dem Bild. */
  eingebettet: { type: Boolean, default: false },
});
const emit = defineEmits(['toggle', 'close', 'zoom', 'toggle-ifc-grids']);

const api = useViewerApi();
const LAYER_STYLES_LISTE = Object.values(LAYER_STYLES);
const aktiverStil = ref('realistic');

/**
 * Darstellung umschalten.
 *
 * Vor dem ersten Wechsel wird der Renderzustand gesichert, damit „Realistisch"
 * wirklich zurueckfuehrt und nicht nur die Planfarben mit anderen Planfarben
 * ueberschreibt.
 */
let _gesicherterZustand = null;
async function stilWaehlen(id) {
  const stil = LAYER_STYLES[id];
  if (!stil || aktiverStil.value === id) return;
  if (!_gesicherterZustand) _gesicherterZustand = await api.saveRenderState?.();
  if (id === 'realistic' && _gesicherterZustand) {
    await api.restoreRenderState?.(_gesicherterZustand);
  } else {
    await api.applyLayerStyle?.(stil);
  }
  aktiverStil.value = id;
}

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
/**
 * Der Klassenname, wie ihn die Bauwerksstruktur schreibt („IfcEarthworksFill“).
 * Vorher trennte ein CamelCase-Schnitt vor JEDEM Grossbuchstaben — die Kategorien
 * kommen aber gross geschrieben an, und aus IFCEARTHWORKSFILL wurde „E A R T H …“.
 */
function formatName(raw) {
  return getEntityInfo(String(raw).toUpperCase())?.name ?? String(raw);
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
  IFCDUCTSEGMENT:  'cat-duct',   IFCDUCTFITTING:      'cat-duct',
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

/* H3: in der Tafel „Modelle“ — kein eigenes Fenster mehr, der Abschnittskopf trägt den Titel. */
.layer-panel.eingebettet {
  position: static; width: auto; max-height: none;
  background: transparent; border: none; border-radius: 0; box-shadow: none;
}
.layer-panel.eingebettet .panel-header { background: transparent; padding: 0.2rem 0.6rem; }
.layer-panel.eingebettet .panel-title { visibility: hidden; }

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

.stil-zeile {
  display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap;
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid var(--cde-line-soft);
}
.stil-titel {
  font-size: 0.62rem; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--cde-text-faint); margin-right: 0.15rem;
}
.stil-knopf {
  display: inline-flex; align-items: center; gap: 0.25rem;
  padding: 0.16rem 0.4rem;
  background: var(--cde-fill);
  border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius-sm);
  color: var(--cde-text-dim);
  font: inherit; font-size: 0.68rem; cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.stil-knopf:hover { background: var(--cde-fill-hover); color: var(--cde-text); }
.stil-knopf.aktiv {
  background: var(--cde-accent-fill-hi);
  border-color: var(--cde-accent-line);
  color: var(--cde-accent);
}

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
