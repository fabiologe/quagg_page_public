<template>
  <div class="kanban-board">
    <div class="board-header">
      <h2>Kanban Board</h2>
      <div class="actions">
        <button class="btn-new">Neue Aufgabe</button>
      </div>
    </div>
    
    <div class="filter-bar">
      <button 
        :class="{ active: activeFilter === 'all' }" 
        @click="setFilter('all')"
      >Alle Phasen</button>
      <button 
        :class="{ active: activeFilter === 'planning' }" 
        @click="setFilter('planning')"
      >Planung (1-4)</button>
      <button 
        :class="{ active: activeFilter === 'execution' }" 
        @click="setFilter('execution')"
      >Ausführung (5-9)</button>
    </div>
    
    <div class="board-columns">
      <div v-for="col in columns" :key="col.id" class="column">
        <div class="column-header">
          <span class="col-title">{{ col.title }}</span>
          <span class="col-count">{{ getTasksByColumn(col.id).length }}</span>
        </div>
        
        <div class="column-body">
          <div 
            v-for="task in getTasksByColumn(col.id)" 
            :key="task.id" 
          >
            <div class="task-header">
               <span v-if="task.lph" class="lph-badge">LPH {{ task.lph }}</span>
            </div>
            <div class="task-title">{{ task.title }}</div>
            <div class="task-meta" v-if="task.linkedFile">
               📎 {{ task.linkedFile }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const activeFilter = ref('all') // 'all', 'planning', 'execution'

const columns = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'todo', title: 'To Do' },
  { id: 'in-progress', title: 'In Arbeit' },
  { id: 'done', title: 'Fertig' }
]

// Mock Data
const tasks = ref([
  { id: 1, title: 'Rechnung #1023 prüfen', status: 'todo', linkedFile: '2023_Rechnung_A.pdf', lph: 8 },
  { id: 2, title: 'Baustellenfotos sortieren', status: 'backlog', linkedFile: null, lph: 8 },
  { id: 3, title: 'Wandstatik berechnen', status: 'in-progress', linkedFile: 'statik_v1.xls', lph: 3 },
  { id: 4, title: 'Grundlagen ermitteln', status: 'done', linkedFile: 'protokoll.txt', lph: 1 },
  { id: 5, title: 'Genehmigung einreichen', status: 'todo', linkedFile: 'antrag.pdf', lph: 4 },
  { id: 6, title: 'Abnahme Protokoll', status: 'backlog', linkedFile: null, lph: 8 }
])

const filteredTasks = computed(() => {
  if (activeFilter.value === 'planning') {
    return tasks.value.filter(t => t.lph && t.lph <= 4)
  }
  if (activeFilter.value === 'execution') {
    return tasks.value.filter(t => t.lph && t.lph >= 5)
  }
  return tasks.value
})

const getTasksByColumn = (colId) => {
  return filteredTasks.value.filter(t => t.status === colId)
}

const setFilter = (filter) => {
  activeFilter.value = filter
}
</script>

<style scoped>
.kanban-board {
  height: 100%;
  border-left: 1px solid #e2e8f0; /* Ensure grid/flex separation visual */
  display: flex;
  flex-direction: column;
  background: #f1f5f9;
}

.board-header {
  padding: 1rem 1.5rem;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.board-header h2 {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.btn-new {
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: white;
  border-radius: 6px;
  font-size: 0.9rem;
  border: none;
  cursor: pointer;
}

.board-columns {
  flex: 1;
  display: flex;
  gap: 1rem;
  padding: 1.5rem;
  overflow-x: auto;
}

.column {
  min-width: 280px;
  max-width: 280px;
  background: #f8fafc; /* Slightly darker/lighter than bg? */
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  max-height: 100%;
  background: #e2e8f0; /* Column background for contrast */
}

.column-header {
  padding: 1rem;
  font-weight: 600;
  color: #475569;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.column-body {
  flex: 1;
  padding: 0 0.75rem 0.75rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.task-card {
  background: white;
  padding: 1rem;
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  cursor: grab;
  border-left: 3px solid transparent;
}

.task-card:hover {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.task-title {
  color: #1e293b;
  font-weight: 500;
  font-size: 0.95rem;
  margin-bottom: 0.5rem;
}

.task-meta {
  font-size: 0.8rem;
  color: #64748b;
  background: #f1f5f9;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  display: inline-block;
}

.filter-bar {
  padding: 0.5rem 1.5rem;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  gap: 0.5rem;
}

.filter-bar button {
  padding: 0.25rem 0.75rem;
  border: 1px solid #e2e8f0;
  background: white;
  border-radius: 99px;
  color: #64748b;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-bar button:hover {
  border-color: #cbd5e1;
  color: #334155;
}

.filter-bar button.active {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #1d4ed8;
  font-weight: 500;
}

.lph-badge {
  font-size: 0.65rem;
  background: #dbeafe;
  color: #1e40af;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  font-weight: 600;
  display: inline-block;
  margin-bottom: 0.25rem;
}
</style>
