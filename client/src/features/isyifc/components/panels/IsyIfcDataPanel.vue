<template>
  <div class="isyifc-data-panel">
    <div class="tabs">
      <button 
        :class="{ active: activeTab === 'nodes' }" 
        @click="activeTab = 'nodes'">
        Nodes ({{ nodeCount }})
      </button>
      <button 
        :class="{ active: activeTab === 'edges' }" 
        @click="activeTab = 'edges'">
        Edges ({{ edgeCount }})
      </button>
    </div>

    <div class="search-bar">
      <input v-model="searchQuery" placeholder="Filter ID/Type..." />
    </div>

    <div class="list-container">
      <!-- Nodes List -->
      <ul v-if="activeTab === 'nodes'">
        <li 
          v-for="node in filteredNodes" 
          :key="node.id"
          :class="{ selected: store.selectedObjectId === node.id }"
          @click="select(node.id)"
        >
          <div class="item-header">
            <span class="id">{{ node.id }}</span>
            <span class="type-badge" :class="node.type.toLowerCase()">{{ node.type }}</span>
          </div>
          <div class="item-meta">
            RW: {{ node.data?.rw?.toFixed(2) }} | HW: {{ node.data?.hw?.toFixed(2) }}
          </div>
          <div class="item-meta second-line">
             DH: {{ node.data?.coverZ?.toFixed(2) }} | SH: {{ node.data?.bottomZ?.toFixed(2) }} | ΔH: {{ node.geometry.height?.toFixed(2) }}
          </div>
          <div class="item-meta second-line" style="margin-top:2px; font-size:0.75rem">
             <span v-if="node.attributes?.systemType" class="meta-tag">{{ node.attributes.systemType }}</span>
             <span v-if="node.attributes?.year" class="meta-tag">Bj: {{ node.attributes.year }}</span>
             <span v-if="node.attributes?.status" class="meta-tag">Stat: {{ node.attributes.status }}</span>
          </div>
        </li>
      </ul>

      <!-- Edges List -->
      <ul v-if="activeTab === 'edges'">
        <li 
          v-for="edge in filteredEdges" 
          :key="edge.id"
          :class="{ selected: store.selectedObjectId === edge.id }"
          @click="select(edge.id)"
        >
          <div class="item-header">
            <span class="id">{{ edge.id }}</span>
            <div class="right-badges">
               <span class="type-badge edge">{{ getProfileType(edge) }}</span>
               <span v-if="edge.systemType" class="type-badge sys-type" :class="edge.systemType">{{ edge.systemType }}</span>
            </div>
          </div>
          <div class="item-meta">
            {{ edge.sourceId }} -> {{ edge.targetId }}
          </div>
          <div class="item-meta second-line">
            L: {{ (edge.length || 0).toFixed(2) }}m | Mat: {{ edge.material || '-' }}
          </div>
           <div class="item-meta second-line" style="margin-top:2px; font-size:0.75rem">
             <span v-if="edge.year" class="meta-tag">Bj: {{ edge.year }}</span>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useIsyIfcStore } from '../../store/index.js';
import { storeToRefs } from 'pinia';

const store = useIsyIfcStore();
const { graph } = storeToRefs(store); // Reactive ref to graph state

const activeTab = ref('nodes');
const searchQuery = ref('');

// Computed based on reactive graph
const allNodes = computed(() => {
    if (!graph.value.nodes) return [];
    return Array.from(graph.value.nodes.values());
});

const allEdges = computed(() => {
    if (!graph.value.edges) return [];
    return graph.value.edges;
});

const nodeCount = computed(() => graph.value.nodes ? graph.value.nodes.size : 0);
const edgeCount = computed(() => graph.value.edges ? graph.value.edges.length : 0);

const filteredNodes = computed(() => {
    const q = searchQuery.value.toLowerCase();
    const list = allNodes.value;
    if (!q) return list.slice(0, 100);
    
    return list.filter(n => 
        String(n.id).toLowerCase().includes(q) || 
        String(n.type).toLowerCase().includes(q)
    ).slice(0, 100); 
});

const filteredEdges = computed(() => {
    const q = searchQuery.value.toLowerCase();
    const list = allEdges.value;
    if (!q) return list.slice(0, 100);

    return list.filter(e => 
        String(e.id).toLowerCase().includes(q) ||
        String(e.sourceId).toLowerCase().includes(q) ||
        String(e.targetId).toLowerCase().includes(q)
    ).slice(0, 100);
});

const select = (id) => {
    store.setSelected(id);
};

const getProfileType = (edge) => {
    return edge.profile?.type || 'Unknown';
};
</script>

<style scoped>
.isyifc-data-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: #fff;
    border-top: 1px solid #eee;
}

.tabs {
    display: flex;
    border-bottom: 1px solid #eee;
}
.tabs button {
    flex: 1;
    padding: 10px;
    border: none;
    background: #f9f9f9;
    cursor: pointer;
    font-weight: 500;
}
.tabs button.active {
    background: #fff;
    border-bottom: 2px solid #3498db;
    color: #3498db;
}

.search-bar {
    padding: 10px;
    background: #fcfcfc;
    border-bottom: 1px solid #eee;
}
.search-bar input {
    width: 100%;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
}

.list-container {
    flex: 1;
    overflow-y: auto;
    padding: 0;
}
ul {
    list-style: none;
    padding: 0;
    margin: 0;
}
li {
    padding: 10px;
    border-bottom: 1px solid #f5f5f5;
    cursor: pointer;
    transition: background 0.2s;
}
li:hover {
    background: #f0f7fb;
}
li.selected {
    background: #e1f0fa;
    border-left: 4px solid #3498db;
}

.item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
}
.id {
    font-weight: 600;
    font-size: 0.9rem;
    color: #2c3e50;
}
.item-meta {
    font-size: 0.8rem;
    color: #7f8c8d;
}

.type-badge {
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: 10px;
    background: #eee;
    color: #555;
}
.type-badge.manhole { background: #ffebee; color: #c0392b; }
.type-badge.connector { background: #e8f8f5; color: #16a085; }
.type-badge.structure { background: #f4ecf7; color: #8e44ad; }
.type-badge.edge { background: #eaf2f8; color: #2980b9; }

</style>
