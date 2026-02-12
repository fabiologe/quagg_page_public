<template>
  <div class="custom-select" :class="{ 'open': isOpen }" ref="container">
    <div class="select-trigger" @click="toggle" :class="{ 'has-selection': selectedOption }">
      <div v-if="selectedOption" class="selected-content">
        <span class="color-dot" :style="{ backgroundColor: selectedOption.color }"></span>
        <span class="name">{{ selectedOption.name }}</span>
        <span class="cs-badge">Cs: {{ selectedOption.cs }}</span>
      </div>
      <span v-else class="placeholder">Bitte wählen...</span>
      <span class="arrow">▼</span>
    </div>

    <Transition name="dropdown">
      <div v-if="isOpen" class="options-list">
        <div 
          v-for="option in options" 
          :key="option.id" 
          class="option-item"
          :class="{ 'selected': modelValue === option.id }"
          @click="select(option)"
        >
          <span class="color-dot" :style="{ backgroundColor: option.color }"></span>
          <div class="option-info">
            <span class="name">{{ option.name }}</span>
            <span class="sub-info">Cs: {{ option.cs }} | Cm: {{ option.cm }}</span>
          </div>
          <span v-if="modelValue === option.id" class="check">✓</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: {
    type: [String, Number],
    required: true
  },
  options: {
    type: Array, // Expected: [{ id, name, cs, cm, color }, ...]
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue'])

const isOpen = ref(false)
const container = ref(null)

const selectedOption = computed(() => {
  return props.options.find(o => o.id === props.modelValue)
})

function toggle() {
  isOpen.value = !isOpen.value
}

function select(option) {
  emit('update:modelValue', option.id)
  isOpen.value = false
}

// Click outside to close
function handleClickOutside(event) {
  if (container.value && !container.value.contains(event.target)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.custom-select {
  position: relative;
  width: 100%;
  font-family: 'Inter', sans-serif; /* Modern font choice */
}

.select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f8f9fa;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 42px;
}

.select-trigger:hover {
  background: white;
  border-color: #3498db;
  box-shadow: 0 2px 8px rgba(52, 152, 219, 0.1);
}

.custom-select.open .select-trigger {
  border-color: #3498db;
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
  background: white;
}

.selected-content {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid rgba(0,0,0,0.1);
}

.name {
  font-weight: 500;
  color: #2c3e50;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cs-badge {
  background: #edf2f7;
  color: #4a5568;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  margin-left: auto;
}

.arrow {
  font-size: 0.7rem;
  color: #95a5a6;
  margin-left: 8px;
  transition: transform 0.2s;
}

.custom-select.open .arrow {
  transform: rotate(180deg);
}

.options-list {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  width: 100%;
  background: white;
  border: 1px solid #edf2f7;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
  z-index: 1000;
  max-height: 300px;
  overflow-y: auto;
  padding: 6px;
}

.option-item {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.option-item:hover {
  background: #f7fafc;
}

.option-item.selected {
  background: #ebf8ff;
}

.option-info {
  display: flex;
  flex-direction: column;
  margin-left: 10px;
  flex: 1;
}

.option-info .name {
  font-size: 0.9rem;
}

.sub-info {
  font-size: 0.75rem;
  color: #718096;
  margin-top: 2px;
}

.check {
  color: #3498db;
  font-weight: bold;
}

/* Animations */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
