<template>
  <button
    :type="type"
    :disabled="disabled"
    :class="['base-button', variant, { disabled: disabled }]"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>

<script setup>
defineProps({
  type: {
    type: String,
    default: 'button'
  },
  variant: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'secondary', 'danger', 'success'].includes(value)
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

defineEmits(['click'])
</script>

<style scoped>
.base-button {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.base-button.primary {
  background-color: #3498db;
  color: white;
}

.base-button.primary:hover:not(.disabled) {
  background-color: #2980b9;
}

.base-button.secondary {
  background-color: #95a5a6;
  color: white;
}

.base-button.secondary:hover:not(.disabled) {
  background-color: #7f8c8d;
}

.base-button.danger {
  background-color: #e74c3c;
  color: white;
}

.base-button.danger:hover:not(.disabled) {
  background-color: #c0392b;
}

.base-button.success {
  background-color: #27ae60;
  color: white;
}

.base-button.success:hover:not(.disabled) {
  background-color: #229954;
}

.base-button.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

