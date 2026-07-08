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
    color: var(--sv-text-dim);
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 700;
    font-size: 0.9rem;
    font-family: var(--sv-font);
}

.tool-btn:hover {
    background-color: rgba(139, 92, 246, 0.18);
    color: var(--sv-text-lime);
}

.tool-btn.active {
    background-color: rgba(139, 92, 246, 0.22);
    color: var(--sv-text-lime);
    border: 2px solid var(--sv-violet);
    box-shadow: var(--sv-glow-violet);
}
</style>
