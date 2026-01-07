<template>
  <div class="flex flex-col items-center justify-center bg-gray-900 text-white p-8">
    <div class="mb-4">
      <div class="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
    <h2 class="text-2xl font-bold mb-2">Simulating...</h2>
    
    <div class="w-full max-w-md bg-gray-700 h-4 rounded-full overflow-hidden mb-4">
       <div 
         class="h-full bg-blue-500 transition-all duration-300" 
         :style="{ width: progress + '%' }"
       ></div>
    </div>
    
    <div class="bg-gray-800 p-4 rounded w-full max-w-2xl h-64 overflow-y-auto font-mono text-sm">
      <div v-for="(log, i) in logs" :key="i" class="mb-1">
        {{ log }}
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  progress: { type: Number, default: 0 },
  logs: { type: Array, default: () => [] }
});

defineEmits(['finished', 'error']);
</script>
