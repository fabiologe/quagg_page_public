<template>
  <div class="slope-input">
    <label>{{ label }}</label>
    <div class="input-wrapper">
      <select v-model="selectedOption" @change="handleSelectChange">
        <option value="0">Senkrecht (n=0)</option>
        <option value="0.33">1 : 0.33</option>
        <option value="0.5">1 : 0.5</option>
        <option value="1.0">1 : 1</option>
        <option value="1.5">1 : 1.5</option>
        <option value="2.0">1 : 2</option>
        <option value="custom">Benutzerdefiniert</option>
      </select>
      <input 
        v-if="selectedOption === 'custom'" 
        type="number" 
        v-model.number="customValue" 
        step="0.01" 
        min="0" 
        placeholder="n-Wert"
        @input="emitValue"
      >
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'

const props = defineProps({
  label: String,
  modelValue: Number
})

const emit = defineEmits(['update:modelValue'])

const selectedOption = ref('1.0')
const customValue = ref(null)

const handleSelectChange = () => {
  if (selectedOption.value !== 'custom') {
    emit('update:modelValue', parseFloat(selectedOption.value))
  } else {
    // If switching to custom, don't emit yet or emit existing custom value
    if (customValue.value !== null) {
      emit('update:modelValue', customValue.value)
    }
  }
}

const emitValue = () => {
  emit('update:modelValue', customValue.value)
}

// Initialize based on prop
onMounted(() => {
  const val = props.modelValue
  if ([0, 0.33, 0.5, 1.0, 1.5, 2.0].includes(val)) {
    selectedOption.value = val.toString()
  } else {
    selectedOption.value = 'custom'
    customValue.value = val
  }
})

// Watch for external changes
watch(() => props.modelValue, (newVal) => {
  if (selectedOption.value !== 'custom' && newVal !== parseFloat(selectedOption.value)) {
     if ([0, 0.33, 0.5, 1.0, 1.5, 2.0].includes(newVal)) {
      selectedOption.value = newVal.toString()
    } else {
      selectedOption.value = 'custom'
      customValue.value = newVal
    }
  }
})
</script>

<style scoped>
.slope-input {
  display: flex;
  flex-direction: column;
}

label {
  font-weight: 500;
  margin-bottom: 0.5rem;
  color: #555;
}

.input-wrapper {
  display: flex;
  gap: 0.5rem;
}

select {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
  background-color: white;
  cursor: pointer;
}

input {
  width: 80px;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

select:focus, input:focus {
  border-color: var(--primary, #3498db);
  outline: none;
}
</style>
