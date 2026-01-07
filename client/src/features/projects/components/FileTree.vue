<template>
  <div class="file-tree">
    <div class="tree-header">Projekte</div>
    <div class="tree-content">
      <div 
        v-for="item in items" 
        :key="item.id"
        class="tree-item"
        :class="{ active: selectedId === item.id }"
        @click="selectItem(item)"
      >
        <span class="icon">{{ item.type === 'project' ? '🚀' : '📁' }}</span>
        <span v-if="item.lph" class="lph-badge">LPH {{ item.lph }}</span>
        <span class="label">{{ item.name }}</span>
        
        <div v-if="item.children && item.children.length" class="children" style="margin-left: 1rem;">
          <div 
            v-for="child in item.children" 
            :key="child.id"
            class="tree-item"
            :class="{ active: selectedId === child.id }"
            @click.stop="selectItem(child)"
          >
            <span class="icon">{{ child.type === 'project' ? '🚀' : '📁' }}</span>
            <span v-if="child.lph" class="lph-badge">LPH {{ child.lph }}</span>
            <span class="label">{{ child.name }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  items: {
    type: Array,
    default: () => []
  },
  selectedId: {
    type: [String, Number],
    default: null
  }
})

const emit = defineEmits(['select'])

const selectItem = (item) => {
  emit('select', item)
}
</script>

<style scoped>
.file-tree {
  height: 100%;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e2e8f0;
  background: #f8fafc;
}

.tree-header {
  padding: 1rem;
  font-weight: bold;
  font-size: 0.85rem;
  text-transform: uppercase;
  color: #64748b;
  border-bottom: 1px solid #e2e8f0;
}

.tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0;
}

.tree-item {
  display: flex;
  align-items: center;
  padding: 0.5rem 1rem;
  cursor: pointer;
  color: #334155;
  transition: all 0.2s;
  font-size: 0.95rem;
}

.tree-item:hover {
  background: #eff6ff;
  color: #1d4ed8;
}

.tree-item.active {
  background: #dbeafe;
  color: #1e40af;
  border-right: 3px solid #3b82f6;
}

.icon {
  margin-right: 0.75rem;
  font-size: 1.1rem;
}

.lph-badge {
  font-size: 0.7rem;
  background: #e0f2fe;
  color: #0369a1;
  padding: 0.1rem 0.4rem;
  border-radius: 9999px;
  margin-right: 0.5rem;
  font-weight: 600;
  border: 1px solid #bae6fd;
}
</style>
