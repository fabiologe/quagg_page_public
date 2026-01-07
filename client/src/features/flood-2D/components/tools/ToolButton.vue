<template>
  <button 
    @click="$emit('click')"
    :class="['tool-btn', { active }]"
    :title="title"
  >
    <slot></slot>
  </button>
</template>

<script setup>
defineProps({
  active: Boolean,
  title: String
});

defineEmits(['click']);
</script>

<style scoped>
.tool-btn {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    border-radius: 6px;
    color: #666;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 700;
    font-size: 0.9rem;
}

.tool-btn:hover {
    background-color: #f5f5f5;
    color: #333;
}

.tool-btn.active {
    background-color: #e3f2fd; /* Light Blue */
    color: #3498db;
    border: 2px solid #3498db;
}
</style>
