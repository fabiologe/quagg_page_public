<template>
  <div class="pipe-profile-container relative w-full h-full flex items-center justify-center p-2 bg-gray-50 border border-gray-100 rounded">
    <!-- SVG -->
    <svg 
      v-if="isValid"
      :viewBox="viewBox" 
      class="w-full h-full max-w-[300px] max-h-[300px]" 
      preserveAspectRatio="xMidYMid meet" 
      xmlns="http://www.w3.org/2000/svg"
    >
      
      <defs>
        <clipPath :id="clipId">
             <path :d="pipePath" />
        </clipPath>
      </defs>

      <!-- Pipe Interior Background -->
      <path 
        :d="pipePath" 
        fill="#ffffff" 
        stroke="none"
      />

      <!-- Water Fill -->
      <rect 
         :x="-100" 
         :y="waterY" 
         width="200" 
         :height="waterHeight" 
         fill="#3498db" 
         fill-opacity="0.6"
         :clip-path="`url(#${clipId})`"
      />
      
      <!-- Outer Outline -->
      <path 
        :d="pipePath" 
        fill="none" 
        stroke="#2c3e50" 
        stroke-width="0.04"
      />

    </svg>

    <div v-else class="text-red-500 text-xs">
        Invalid Data
    </div>

  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  profileType: {
    type: String,
    required: true
  },
  diameter: { type: Number, default: 1.0 },
  width: { type: Number, default: 1.0 },
  height: { type: Number, default: 1.0 },
  fillingHeight: { type: Number, default: 0.5 }
})

const clipId = ref(`pipe-clip-${Math.random().toString(36).substr(2, 9)}`)

const isValid = computed(() => {
    if (props.profileType === 'circular') return props.diameter > 0
    return props.width > 0 && props.height > 0
})

const normalizedHeight = computed(() => {
    if (props.profileType === 'circular') return Number(props.diameter)
    return Number(props.height)
})

const viewBox = computed(() => {
    const H = normalizedHeight.value || 1
    const W = (props.profileType === 'circular' ? Number(props.diameter) : Number(props.width)) || 1
    
    // Explicit padding
    const padding = Math.max(H, W) * 0.15
    
    // Ensure all are numbers
    const minX = (-W/2 - padding).toFixed(3)
    const minY = (-H - padding).toFixed(3)
    const wBox = (W + 2*padding).toFixed(3)
    const hBox = (H + 2*padding).toFixed(3)
    
    return `${minX} ${minY} ${wBox} ${hBox}`
})

const pipePath = computed(() => {
    if (props.profileType === 'circular') {
        const d = Number(props.diameter)
        if (!d) return ''
        const r = d / 2
        return `M 0,0 
                A ${r} ${r} 0 1 1 0,${-d} 
                A ${r} ${r} 0 1 1 0,0 Z`
    }
    
    if (props.profileType === 'rectangular') {
        const w = Number(props.width)
        const h = Number(props.height)
        if (!w || !h) return ''
        return `M ${-w/2},0 
                L ${-w/2},${-h} 
                L ${w/2},${-h} 
                L ${w/2},0 
                Z`
    }
    
    if (props.profileType === 'egg') {
        const w = Number(props.width)
        const h = Number(props.height)
        if (!w || !h) return ''
        // Approximate egg
        return `M 0,0 
                C ${-w * 0.45},0 ${-w/2},${-h * 0.3} ${-w/2},${-h + w/2} 
                A ${w/2} ${w/2} 0 1 1 ${w/2},${-h + w/2} 
                C ${w/2},${-h * 0.3} ${w * 0.45},0 0,0 Z`
    }
    return ''
})

const waterY = computed(() => -props.fillingHeight)
const waterHeight = computed(() => props.fillingHeight + 10) // Overshoot
</script>

<style scoped>
.pipe-profile-container {
  min-height: 250px;
  width: 100%;
}
svg {
    display: block;
    margin: auto;
}
</style>
