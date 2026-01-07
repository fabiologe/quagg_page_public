<template>
  <div class="flex flex-col items-center justify-center bg-gray-800 text-white h-full">
    <h2 class="text-3xl font-bold text-blue-400 mb-4">Analysis / Result Player</h2>
    <p class="text-gray-400 mb-8">Visualization Placeholder</p>
    
    <button 
      @click="$emit('back-to-editor')"
      class="px-6 py-3 bg-gray-600 hover:bg-gray-500 rounded text-white font-bold transition"
    >
      Back to Editor
    </button>
  </div>
</template>

<script setup>
defineEmits(['back-to-editor']);
</script>
