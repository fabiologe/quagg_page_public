<template>
  <div class="tree-panel" :class="{ 'tree-panel--bare': bare }">
    <div v-if="!bare" class="panel-header">
      <span class="panel-title">🌳 Gebäudestruktur</span>
      <button class="hdr-close" @click="emit('close')">&times;</button>
    </div>

    <div class="panel-body">
      <TreeNode
        v-if="tree"
        :node="tree"
        :depth="0"
        @toggle-storey="(e) => emit('toggle-storey', e)"
      />
      <div v-else class="tree-empty">Kein Modell geladen</div>
    </div>
  </div>
</template>

<script setup>
import { defineComponent, h, ref } from 'vue';

defineProps({
  tree: { type: Object, default: null },
  bare: { type: Boolean, default: false },
});
const emit = defineEmits(['toggle-storey', 'close']);

// Recursive tree node as an inline renderless component
const TreeNode = defineComponent({
  name: 'TreeNode',
  props: {
    node:  { type: Object, required: true },
    depth: { type: Number, default: 0 },
  },
  emits: ['toggle-storey'],
  setup(props, { emit }) {
    const open    = ref(props.depth < 2); // expand first 2 levels automatically
    const visible = ref(true);

    function toggleExpand() { open.value = !open.value; }

    function toggleVisibility(e) {
      e.stopPropagation();
      visible.value = !visible.value;
      if (props.node.localId != null) {
        emit('toggle-storey', { localId: props.node.localId, visible: visible.value });
      }
    }

    const STOREY_TYPES = new Set(['IFCBUILDINGSTOREY', 'IFCBUILDING', 'IFCSITE', 'IFCSPACE']);

    function icon(category) {
      const c = (category ?? '').toUpperCase();
      if (c.includes('SITE'))     return '🌍';
      if (c.includes('BUILDING')) return '🏢';
      if (c.includes('STOREY'))   return '🏠';
      if (c.includes('SPACE'))    return '🟦';
      return '📦';
    }

    function label(node) {
      const cat = (node.category ?? 'Element').replace(/^IFC/, '');
      return cat || '—';
    }

    return () => {
      const { node, depth } = props;
      const hasChildren = node.children?.length > 0;
      const isStorey    = STOREY_TYPES.has((node.category ?? '').toUpperCase());

      return h('div', { class: 'tree-node' }, [
        h('div', {
          class: ['node-row', { open: open.value, 'is-storey': isStorey }],
          style: { paddingLeft: `${0.4 + depth * 0.9}rem` },
          onClick: toggleExpand,
        }, [
          hasChildren
            ? h('span', { class: 'caret' }, open.value ? '▾' : '▸')
            : h('span', { class: 'leaf-dot' }, '·'),

          h('span', { class: 'node-icon' }, icon(node.category)),
          h('span', { class: 'node-label' }, label(node)),

          node.localId != null
            ? h('button', {
                class: ['vis-btn', { hidden: !visible.value }],
                title: visible.value ? 'Ausblenden' : 'Einblenden',
                onClick: toggleVisibility,
              }, visible.value ? '👁' : '🚫')
            : null,
        ]),

        hasChildren && open.value
          ? h('div', { class: 'children' },
              node.children.map((child, i) =>
                h(TreeNode, {
                  key: child.localId ?? i,
                  node: child,
                  depth: depth + 1,
                  onToggleStorey: (e) => emit('toggle-storey', e),
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
  background: rgba(18, 20, 30, 0.96);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  backdrop-filter: blur(10px);
  overflow: hidden;
}

/* when embedded inside a parent window – strip standalone chrome */
.tree-panel--bare {
  position: static;
  width: 100%;
  height: 100%;
  max-height: none;
  border-radius: 0;
  background: transparent;
  border: none;
  box-shadow: none;
  backdrop-filter: none;
}

.tree-empty {
  padding: 2rem;
  text-align: center;
  color: #37474f;
  font-size: 0.8rem;
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

.hdr-close {
  background: none; border: none; color: #78909c;
  font-size: 1.1rem; cursor: pointer; padding: 0 0.2rem;
  line-height: 1; border-radius: 4px; transition: color 0.15s;
}
.hdr-close:hover { color: #ef5350; }

.panel-body {
  overflow-y: auto;
  flex: 1;
  padding: 0.3rem 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.15) transparent;
}

/* Tree node styles (not scoped — rendered via renderless component) */
</style>

<style>
/* Global styles for TreeNode (renderless component can't use scoped) */
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
.node-row:hover { background: rgba(255,255,255,0.06); }
.node-row.is-storey { color: #90caf9; }

.caret {
  font-size: 0.7rem;
  color: #546e7a;
  width: 12px;
  flex-shrink: 0;
  text-align: center;
}
.leaf-dot {
  color: #37474f;
  width: 12px;
  flex-shrink: 0;
  text-align: center;
}
.node-icon {
  font-size: 0.78rem;
  flex-shrink: 0;
  width: 16px;
  text-align: center;
}
.node-label {
  font-size: 0.74rem;
  color: #b0bec5;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.node-row.is-storey .node-label { color: #90caf9; font-weight: 500; }

.vis-btn {
  background: none; border: none; cursor: pointer;
  font-size: 0.72rem; padding: 0; line-height: 1;
  opacity: 0; transition: opacity 0.15s, transform 0.12s;
  flex-shrink: 0;
}
.node-row:hover .vis-btn { opacity: 1; }
.vis-btn.hidden { opacity: 1; color: #ef5350; }
.vis-btn:hover { transform: scale(1.2); }

.children { }
</style>
