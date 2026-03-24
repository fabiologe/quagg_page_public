<template>
  <div class="raster-animation" ref="containerRef">
    <canvas ref="canvasRef"></canvas>
    <div v-if="loading" class="loading-overlay">Lade Simulationsdaten...</div>
    <div v-if="error" class="error-overlay">{{ error }}</div>
    <div class="controls" v-if="!loading && !error">
      <button @click="togglePlay" class="play-btn">
        {{ isPlaying ? 'Pause' : 'Play' }}
      </button>
      <input 
        type="range" 
        min="0" 
        :max="frames.length - 1" 
        v-model="currentFrameIndex"
        @input="onSliderInput"
        class="time-slider"
      />
      <span class="frame-counter">t = {{ currentFrameIndex * timeStep }} min</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, shallowRef } from 'vue'

const props = defineProps({
  ascFiles: {
    type: Array,
    required: true,
    description: 'Array of URLs to .asc format files'
  },
  timeStep: {
    type: Number,
    default: 5,
    description: 'Minutes per frame'
  },
  colorMap: {
    type: String,
    default: 'water',
    description: 'Color mapping strategy'
  }
})

const containerRef = ref(null)
const canvasRef = ref(null)
const loading = ref(true)
const error = ref(null)
const isPlaying = ref(true)
const currentFrameIndex = ref(0)
const frames = shallowRef([])

let animationId = null
let lastDrawTime = 0
const fps = 10 
const frameDuration = 1000 / fps

// Parses a single ESRI ASCII Grid (.asc) file
const parseAsc = (text) => {
  const lines = text.trim().split('\n')
  const meta = {}
  const data = []
  
  let dataStartIndex = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    
    // Check if it's a header line
    const match = line.match(/^([a-zA-Z_]+)\s+([\d.-]+)$/)
    if (match) {
      meta[match[1].toLowerCase()] = parseFloat(match[2])
    } else {
      dataStartIndex = i
      break
    }
  }

  // Parse data grid
  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line) {
      data.push(line.split(/\s+/).map(Number))
    }
  }

  return { meta, data }
}

const loadData = async () => {
  try {
    loading.value = true
    const loadedFrames = []
    
    for (const url of props.ascFiles) {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Failed to fetch ${url}`)
      const text = await response.text()
      loadedFrames.push(parseAsc(text))
    }
    
    frames.value = loadedFrames
    loading.value = false
    
    if (frames.value.length > 0) {
      resizeCanvas()
      startAnimation()
    }
  } catch (err) {
    error.value = err.message
    loading.value = false
  }
}

const resizeCanvas = () => {
  if (!canvasRef.value || !containerRef.value || frames.value.length === 0) return
  
  const canvas = canvasRef.value
  const container = containerRef.value
  const meta = frames.value[0].meta
  
  // Fit canvas to container while maintaining aspect ratio
  const containerRect = container.getBoundingClientRect()
  const aspect = meta.ncols / meta.nrows
  
  let width = containerRect.width
  let height = width / aspect
  
  if (height > containerRect.height) {
    height = containerRect.height
    width = height * aspect
  }
  
  canvas.width = meta.ncols
  canvas.height = meta.nrows
  canvas.style.width = \`\${width}px\`
  canvas.style.height = \`\${height}px\`
  
  drawFrame(currentFrameIndex.value)
}

const getColorForDepth = (val) => {
  if (val <= 0) return [0, 0, 0, 0] // Transparent for no water
  
  // Shallow to deep water color mapping (light blue to dark blue)
  // Max depth assumption for visualization: 1.0 meter
  const normalized = Math.min(Math.max(val, 0), 1.0)
  
  if (props.colorMap === 'hazard') {
      // White -> Yellow -> Red
      if (val < 0.1) return [255, 255, 255, 128]
      if (val < 0.3) return [255, 255, 0, 200]
      if (val < 0.5) return [255, 165, 0, 255]
      return [255, 0, 0, 255]
  }
  
  // Default water Map
  const r = Math.floor(173 - (173 - 0) * normalized)
  const g = Math.floor(216 - (216 - 0) * normalized)
  const b = Math.floor(230 - (230 - 139) * normalized)
  
  return [r, g, b, 255]
}

const drawFrame = (index) => {
  if (!canvasRef.value || frames.value.length === 0) return
  
  const ctx = canvasRef.value.getContext('2d')
  const frame = frames.value[index]
  const { meta, data } = frame
  
  const imgData = ctx.createImageData(meta.ncols, meta.nrows)
  
  for (let r = 0; r < meta.nrows; r++) {
    for (let c = 0; c < meta.ncols; c++) {
      const val = data[r][c]
      let rgba = [0, 0, 0, 0]
      
      if (val !== meta.nodata_value && val > 0) {
        rgba = getColorForDepth(val)
      }
      
      const pixelIdx = (r * meta.ncols + c) * 4
      imgData.data[pixelIdx] = rgba[0] // R
      imgData.data[pixelIdx + 1] = rgba[1] // G
      imgData.data[pixelIdx + 2] = rgba[2] // B
      imgData.data[pixelIdx + 3] = rgba[3] // A
    }
  }
  
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  ctx.putImageData(imgData, 0, 0)
}

const animate = (timestamp) => {
  if (!isPlaying.value) return
  
  if (timestamp - lastDrawTime > frameDuration) {
    currentFrameIndex.value = (Number(currentFrameIndex.value) + 1) % frames.value.length
    drawFrame(currentFrameIndex.value)
    lastDrawTime = timestamp
  }
  
  animationId = requestAnimationFrame(animate)
}

const startAnimation = () => {
  isPlaying.value = true
  lastDrawTime = performance.now()
  animationId = requestAnimationFrame(animate)
}

const togglePlay = () => {
  isPlaying.value = !isPlaying.value
  if (isPlaying.value) {
    startAnimation()
  } else if (animationId) {
    cancelAnimationFrame(animationId)
  }
}

const onSliderInput = () => {
  if (isPlaying.value) {
    togglePlay() // Pause when dragging
  }
  drawFrame(currentFrameIndex.value)
}

onMounted(() => {
  loadData()
  window.addEventListener('resize', resizeCanvas)
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeCanvas)
  if (animationId) cancelAnimationFrame(animationId)
})

// Watch for prop changes to reload data
watch(() => props.ascFiles, () => {
  loadData()
}, { deep: true })
</script>

<style scoped>
.raster-animation {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 300px;
  background-color: #f0f0f0;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

canvas {
  image-rendering: pixelated; /* Keeps raster sharp */
}

.controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  gap: 1rem;
  border-top: 1px solid #ddd;
}

.play-btn {
  padding: 0.5rem 1rem;
  background: var(--primary, #3498db);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

.time-slider {
  flex: 1;
}

.frame-counter {
  font-family: monospace;
  font-size: 0.9rem;
  color: #333;
  width: 80px;
  text-align: right;
}

.loading-overlay, .error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.8);
  font-weight: bold;
}

.error-overlay {
  color: red;
}
</style>
