<template>
  <div class="tree-panel" :class="{ 'tree-panel--bare': bare }">
    <div v-if="!bare" class="panel-header">
      <span class="panel-title"><CdeIcon name="tree" :size="14" /> Gebäudestruktur</span>
      <button class="hdr-close" @click="emit('close')" title="Schließen" aria-label="Schließen">
        <CdeIcon name="close" :size="14" />
      </button>
    </div>

    <div class="panel-body">
      <TreeNode
        v-if="tree"
        :node="tree"
        :depth="0"
        @toggle-storey="(e) => emit('toggle-storey', e)"
        @zoom-to="(e) => emit('zoom-to', e)"
      />
      <div v-else class="tree-empty">Kein Modell geladen</div>
    </div>
  </div>
</template>

<script setup>
import { defineComponent, h, ref, computed, provide, inject } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import { trifft } from '../services/Bauwerksstruktur.js';

const props = defineProps({
  tree:   { type: Object,  default: null  },
  bare:   { type: Boolean, default: false },
  filter: { type: String,  default: ''    },
});
const emit = defineEmits(['toggle-storey', 'close', 'zoom-to']);

// Provide filter string to all TreeNode descendants via inject
const treeFilter = computed(() => (props.filter ?? '').toLowerCase().trim());
provide('treeFilter', treeFilter);

// Filter: `trifft` aus Bauwerksstruktur.js — derselbe Maßstab wie im Fenster (Stufe 8).

// ── Recursive tree node (inline renderless component) ──────────────────────
const TreeNode = defineComponent({
  name: 'TreeNode',
  props: {
    node:  { type: Object, required: true },
    depth: { type: Number, default: 0 },
  },
  emits: ['toggle-storey', 'zoom-to'],
  setup(props, { emit }) {
    const open    = ref(props.depth < 2);
    const visible = ref(true);

    const filter = inject('treeFilter', computed(() => ''));
    // „Vorgang entfernen" (Abnahme 2026-09-12, A6): der Knoten eines Erdbau-
    // Vorgangs im Abschnitt „Eigenbau" bietet es an; ausführen tut das Fenster.
    const entferne = inject('vorgangEntfernen', null);
    // Das AUGE JE VORGANG (Teil XXI, E3): ein Erdkörper, den ein späterer
    // Vorgang überformt hat, steht nicht im Raum — hier kommt er zurück.
    // Anders als das Auge eines Bauteils hängt es nicht an einer localId,
    // sondern an der Ableitung; die Engine kennt ihre Teile.
    const vorgangAuge = inject('vorgangAuge', null);

    function toggleExpand(e) {
      e.stopPropagation();
      open.value = !open.value;
    }

    // Stufe 8 (Fahrplan Erdbau-Container): jedes Ereignis nennt sein MODELL — ohne
    // fiel es aufs erste zurück, auch bei localId-Kollision in einem zweiten.
    // Gruppen sind keine Geometrie: kein Zoom, kein Auge.
    const bedienbar = () => props.node.localId != null && !props.node.gruppe;

    function toggleVisibility(e) {
      e.stopPropagation();
      visible.value = !visible.value;
      if (bedienbar()) {
        emit('toggle-storey', { localId: props.node.localId, visible: visible.value, modelId: props.node.modelId ?? null });
      }
    }

    function zoomToNode(e) {
      e.stopPropagation();
      if (bedienbar()) {
        emit('zoom-to', { localId: props.node.localId, modelId: props.node.modelId ?? null });
      }
    }

    const STOREY_TYPES = new Set(['IFCBUILDINGSTOREY', 'IFCBUILDING', 'IFCSITE', 'IFCSPACE']);

    /**
     * Symbolname der Raumhierarchie-Stufe.
     *
     * Reihenfolge ist wichtig: 'IFCBUILDINGSTOREY' enthält auch 'BUILDING' —
     * die Geschoss-Prüfung muss deshalb VOR der Gebäude-Prüfung stehen.
     */
    function icon(category) {
      const c = (category ?? '').toUpperCase();
      if (c.includes('STOREY'))   return 'storey';
      if (c.includes('SITE'))     return 'site';
      if (c.includes('BUILDING')) return 'building';
      if (c.includes('SPACE'))    return 'space';
      return 'element';
    }

    // A5: show element name if available, fall back to category
    function label(node) {
      const name = (node.name ?? '').trim();
      const cat  = (node.category ?? 'Element').replace(/^IFC/, '');
      return name || cat || '—';
    }

    return () => {
      const { node, depth } = props;
      const f           = filter.value ?? '';
      const hasChildren = node.children?.length > 0;

      // A1: filter — hide nodes (and subtrees) that don't match
      if (f && !trifft(node, f)) return null;

      const isStorey  = STOREY_TYPES.has((node.category ?? '').toUpperCase());
      const forceOpen = f && hasChildren; // keep expanded when filter is active
      const isOpen    = forceOpen || open.value;

      return h('div', { class: 'tree-node' }, [
        h('div', {
          class: ['node-row', { open: isOpen, 'is-storey': isStorey, 'is-aussparung': node.aussparung,
                               'is-verweis': node.verweis, 'is-gruppe': node.gruppe }],
          style: { paddingLeft: `${0.4 + depth * 0.9}rem` },
          onClick: hasChildren ? toggleExpand : undefined,
        }, [
          hasChildren
            // A2: data-open attribute so expandAll/collapseAll can query it
            ? h('span', { class: 'caret', 'data-open': String(isOpen), onClick: toggleExpand },
                [h(CdeIcon, { name: isOpen ? 'chevron-down' : 'chevron-right', size: 12 })])
            : h('span', { class: 'leaf-dot' }, '·'),

          h('span', { class: 'node-icon' }, [h(CdeIcon, {
            name: node.gruppe ? 'layers' : node.aussparung ? 'ausheben' : icon(node.category), size: 13 })]),
          h('span', {
            class: 'node-label',
            title: bedienbar()
              ? `${label(node)}${node.aussparung ? ' — Aussparung im Gelände' : ''} — Klick zum Zoomen`
              : node.verdecktVon?.length
                ? `${label(node)} — überdeckt von ${node.verdecktVon.join(', ')}`
                : label(node),
            onClick: bedienbar() ? zoomToNode : undefined,
          }, label(node)),

          // „(verdeckt von …)" steht am Knoten, nicht nur im Titel: sonst
          // sähe man einen Vorgang ohne Körper und wüsste nicht, warum.
          node.verdecktVon?.length
            ? h('span', { class: 'node-hinweis' }, `verdeckt von ${node.verdecktVon.join(', ')}`)
            : null,

          node.vorgang && vorgangAuge
            ? h('button', {
                class: ['vis-btn', { hidden: node.sichtbar === false }],
                title: node.sichtbar === false
                  ? `„${label(node)}" wieder zeigen`
                  : `„${label(node)}" ausblenden`,
                'aria-label': 'Vorgang zeigen oder ausblenden',
                onClick: (e) => { e.stopPropagation(); vorgangAuge(node, node.sichtbar === false); },
              }, [h(CdeIcon, { name: node.sichtbar === false ? 'hidden' : 'visible', size: 12 })])
            : null,

          bedienbar()
            ? h('button', {
                class: ['vis-btn', { hidden: !visible.value }],
                title: visible.value ? 'Ausblenden' : 'Einblenden',
                onClick: toggleVisibility,
              }, [h(CdeIcon, { name: visible.value ? 'visible' : 'hidden', size: 12 })])
            : null,
          node.vorgang && entferne
            ? h('button', {
                class: 'vis-btn entfernen-btn',
                title: `„${label(node)}" entfernen — Aushub, Auftrag und die Grube im Gelände`,
                'aria-label': 'Vorgang entfernen',
                onClick: (e) => { e.stopPropagation(); entferne(node); },
              }, [h(CdeIcon, { name: 'delete', size: 12 })])
            : null,
        ]),

        hasChildren && isOpen
          ? h('div', { class: 'children' },
              node.children.map((child, i) =>
                h(TreeNode, {
                  key: child.localId != null ? `id${child.localId}` : `i${i}`,
                  node: child,
                  depth: depth + 1,
                  onToggleStorey: (e) => emit('toggle-storey', e),
                  onZoomTo:       (e) => emit('zoom-to', e),
                })
              )
            )
          : null,
      ]);
    };
  },
});
</script>

<style scoped>
.tree-panel {
  position: absolute;
  left: 70px;
  top: 5rem;
  z-index: 25;
  width: 260px;
  max-height: 480px;
  display: flex;
  flex-direction: column;
  background: var(--cde-surface);
  border: 1px solid var(--cde-tint-strong);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--cde-scrim);
  overflow: hidden;
}

.tree-panel--bare {
  position: static;
  width: 100%;
  height: 100%;
  max-height: none;
  border-radius: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

.tree-empty {
  padding: 2rem;
  text-align: center;
  color: var(--cde-text-dimmer);
  font-size: 0.8rem;
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

.hdr-close {
  display: inline-flex; align-items: center; justify-content: center;
  background: none; border: none; color: var(--cde-text-mute);
  cursor: pointer; padding: 0.15rem;
  border-radius: var(--cde-radius-sm); transition: color 0.15s;
}
.hdr-close:hover { color: var(--cde-danger); }

.panel-body {
  overflow-y: auto;
  flex: 1;
  padding: 0.3rem 0;
  scrollbar-width: thin;
  scrollbar-color: var(--cde-tint-max) transparent;
}
</style>

<style>
/* Global — TreeNode renderless components don't get scoped attribute */
.tree-node { }

.node-row {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding-top: 0.22rem;
  padding-bottom: 0.22rem;
  padding-right: 0.5rem;
  cursor: pointer;
  transition: background 0.1s;
  user-select: none;
}
.node-row:hover { background: var(--cde-tint-weak); }
.node-row.is-storey { color: var(--cde-accent-soft); }

.caret {
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--cde-text-dimmer);
  width: 12px;
  flex-shrink: 0;
  text-align: center;
}
.leaf-dot {
  color: var(--cde-text-dimmer);
  width: 12px;
  flex-shrink: 0;
  text-align: center;
}
.node-icon {
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--cde-text-mute);
  flex-shrink: 0;
  width: 16px;
}
.node-label {
  font-size: 0.74rem;
  color: var(--cde-text-soft);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.node-row.is-storey .node-label { color: var(--cde-accent-soft); font-weight: 500; }
.node-label:hover { color: var(--cde-text-bright); text-decoration: underline; }
/* Stufe 8: Aussparung unter ihrem Wirt, Verweis in einer Gruppe, Gruppe selbst */
.node-row.is-aussparung .node-label { font-style: italic; }
.node-row.is-verweis .node-label { color: var(--cde-text-dim); }
.node-row.is-gruppe .node-label { color: var(--cde-text-soft); }
/* Teil XXI (E3): „verdeckt von …" am Vorgangsknoten — leise, aber lesbar. */
.node-hinweis {
  font-size: 0.66rem;
  color: var(--cde-text-mute);
  white-space: nowrap;
  flex-shrink: 0;
  font-style: italic;
}

.vis-btn {
  display: inline-flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: pointer;
  color: var(--cde-text-mute); padding: 0;
  opacity: 0; transition: opacity 0.15s, transform 0.12s, color 0.12s;
  flex-shrink: 0;
}
.node-row:hover .vis-btn { opacity: 1; }
.vis-btn.hidden { opacity: 1; color: var(--cde-danger); }
.vis-btn:hover { transform: scale(1.15); color: var(--cde-text-bright); }

.children { }
</style>
