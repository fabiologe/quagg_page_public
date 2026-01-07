<template>
  <div class="plan-viewer-wrapper">
    <div class="plan-viewer-container" ref="containerRef">
      <!-- Content Area -->
      <div 
        class="content-area" 
        ref="contentArea"
        @wheel="handleWheel"
        @mousedown="handleMouseDown"
        @mousemove="handleMouseMove"
        @mouseup="handleMouseUp"
        @mouseleave="handleMouseUp"
      >
        <div 
          class="canvas-wrapper" 
          :style="{ transform: `translate(${panX}px, ${panY}px) scale(${zoomScale})`, transformOrigin: '0 0' }"
        >
          <div class="page-wrapper" :style="{ width: pdfWidth + 'px', height: pdfHeight + 'px' }">
            <VuePdfEmbed
              ref="pdfRef"
              :source="src"
              :page="page"
              :width="pdfWidth"
              @loaded="onPdfLoaded"
              @rendered="onPdfRendered"
              class="pdf-layer"
            />
            <canvas
              ref="canvasRef"
              class="drawing-layer"
              :width="pdfWidth"
              :height="pdfHeight"
            ></canvas>
          </div>
        </div>
      </div>

      <!-- Floating Controls -->
      <div class="controls-overlay">
        <!-- Navigation -->
        <div class="control-group">
          <button @click="prevPage" :disabled="page <= 1" class="btn-icon">←</button>
          <span class="page-display">{{ page }} / {{ pageCount }}</span>
          <button @click="nextPage" :disabled="page >= pageCount" class="btn-icon">→</button>
        </div>

        <!-- Tools -->
        <div class="control-group">
          <button 
            @click="setTool('pan')" 
            :class="{ active: currentTool === 'pan' }" 
            class="btn-tool"
            title="Verschieben (Leertaste)"
          >✋</button>
          
          <div class="separator"></div>

          <button 
            @click="setTool('calibrate')" 
            :class="{ active: currentTool === 'calibrate' }" 
            class="btn-tool"
            title="Maßstab kalibrieren"
          >📏</button>
          
          <button 
            @click="setTool('distance')" 
            :class="{ active: currentTool === 'distance' }" 
            class="btn-tool"
            title="Strecke messen"
          >📏</button>
          
          <button 
            @click="setTool('area')" 
            :class="{ active: currentTool === 'area' }" 
            class="btn-tool"
            title="Fläche messen"
          >📐</button>
        </div>

        <!-- Zoom -->
        <div class="control-group">
          <button @click="zoomOut" class="btn-icon">-</button>
          <span class="zoom-display">{{ Math.round(zoomScale * 100) }}%</span>
          <button @click="zoomIn" class="btn-icon">+</button>
        </div>
      </div>

      <!-- Measurements Sidebar/Overlay -->
      <div class="measurements-panel" v-if="measurements.length > 0 || scaleFactor">
        <h3>Messungen</h3>
        
        <div class="scale-info" v-if="scaleFactor">
          Maßstab: 1 px = {{ (1/scaleFactor).toFixed(4) }} m
          <button @click="resetScale" class="btn-xs">Reset</button>
        </div>
        <div class="scale-warning" v-else>
          ⚠️ Bitte zuerst Maßstab kalibrieren
        </div>

        <div class="measurements-list">
          <div v-for="(m, idx) in measurements" :key="idx" class="measurement-item">
            <span class="m-icon">{{ getIconForType(m.type) }}</span>
            <span class="m-value">
              {{ formatValue(m) }}
            </span>
            <button @click="deleteMeasurement(idx)" class="btn-del">×</button>
          </div>
        </div>
      </div>

      <!-- Calibration Dialog -->
      <div v-if="showCalibrationDialog" class="modal-overlay">
        <div class="modal-content">
          <h3>Maßstab definieren</h3>
          <p>Gemessene Distanz in Pixel: {{ calibrationPixels.toFixed(1) }} px</p>
          <div class="input-group">
            <label>Tatsächliche Länge (m):</label>
            <input type="number" v-model.number="calibrationRealLength" step="0.01" autofocus>
          </div>
          <div class="modal-actions">
            <button @click="cancelCalibration">Abbrechen</button>
            <button @click="confirmCalibration" class="btn-primary">Kalibrieren</button>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import VuePdfEmbed from 'vue-pdf-embed'

const props = defineProps({
  src: {
    type: [String, Object],
    required: true
  }
})

// PDF State
const page = ref(1)
const pageCount = ref(1)
const pdfWidth = ref(800) // Will be updated on load
const pdfHeight = ref(1200)
const pdfRef = ref(null)

// View State
const zoomScale = ref(1.0)
const panX = ref(0)
const panY = ref(0)
const isPanning = ref(false)
const lastMouseX = ref(0)
const lastMouseY = ref(0)

// Tools State
const currentTool = ref('pan') // 'pan', 'calibrate', 'distance', 'area'
const isDrawing = ref(false)
const activePoints = ref([]) // Points for current drawing
const measurements = ref([]) // { type, points, value }
const scaleFactor = ref(null) // pixels per meter

// Calibration
const showCalibrationDialog = ref(false)
const calibrationPixels = ref(0)
const calibrationRealLength = ref(1.0)

// Refs
const canvasRef = ref(null)
const containerRef = ref(null)

// --- PDF Handlers ---
function onPdfLoaded(pdf) {
  pageCount.value = pdf.numPages
}

function onPdfRendered() {
  // Get actual dimensions from the rendered PDF (or use a fixed width approach)
  // VuePdfEmbed renders responsive by default. We want a fixed base coordinate system.
  // Let's assume we render at 100% width of container initially, then zoom transforms it.
  // Actually, for plans, it's better to render at high res or native size.
  // Let's try to get the natural size.
  const el = pdfRef.value.$el
  // This might need adjustment depending on how VuePdfEmbed exposes the canvas/img
  // For now, let's just sync canvas size to whatever is rendered
  nextTick(() => {
    const layer = el.querySelector('canvas') || el.querySelector('img')
    if (layer) {
      pdfWidth.value = layer.width
      pdfHeight.value = layer.height
      draw()
    }
  })
}

// --- Interaction Handlers ---
function handleWheel(e) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    zoom(delta, e.clientX, e.clientY)
  } else {
    // Pan?
    // panX.value -= e.deltaX
    // panY.value -= e.deltaY
  }
}

function zoom(factor, cx, cy) {
  const oldScale = zoomScale.value
  const newScale = Math.max(0.1, Math.min(oldScale * factor, 10))
  
  // Zoom towards mouse pointer
  const rect = containerRef.value.getBoundingClientRect()
  const mouseX = cx - rect.left
  const mouseY = cy - rect.top
  
  // Calculate point in world coordinates
  const worldX = (mouseX - panX.value) / oldScale
  const worldY = (mouseY - panY.value) / oldScale
  
  panX.value = mouseX - worldX * newScale
  panY.value = mouseY - worldY * newScale
  zoomScale.value = newScale
}

function handleMouseDown(e) {
  if (currentTool.value === 'pan' || e.button === 1) {
    isPanning.value = true
    lastMouseX.value = e.clientX
    lastMouseY.value = e.clientY
    return
  }
  
  // Tools
  const { x, y } = getWorldCoords(e)
  
  if (currentTool.value === 'calibrate' || currentTool.value === 'distance') {
    if (activePoints.value.length === 0) {
      activePoints.value = [{ x, y }]
      isDrawing.value = true
    } else {
      // Finish line
      activePoints.value.push({ x, y })
      finishMeasurement()
    }
  } else if (currentTool.value === 'area') {
    if (activePoints.value.length === 0) {
      isDrawing.value = true
    }
    activePoints.value.push({ x, y })
  }
  draw()
}

function handleMouseMove(e) {
  if (isPanning.value) {
    const dx = e.clientX - lastMouseX.value
    const dy = e.clientY - lastMouseY.value
    panX.value += dx
    panY.value += dy
    lastMouseX.value = e.clientX
    lastMouseY.value = e.clientY
    return
  }
  
  if (isDrawing.value) {
    const { x, y } = getWorldCoords(e)
    draw(x, y) // Draw with preview point
  }
}

function handleMouseUp(e) {
  if (isPanning.value) {
    isPanning.value = false
  }
}

function getWorldCoords(e) {
  const rect = containerRef.value.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top
  return {
    x: (mouseX - panX.value) / zoomScale.value,
    y: (mouseY - panY.value) / zoomScale.value
  }
}

// --- Tools Logic ---
function setTool(tool) {
  currentTool.value = tool
  activePoints.value = []
  isDrawing.value = false
  draw()
}

function finishMeasurement() {
  if (currentTool.value === 'calibrate') {
    const p1 = activePoints.value[0]
    const p2 = activePoints.value[1]
    const distPx = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    calibrationPixels.value = distPx
    showCalibrationDialog.value = true
    // Don't add to measurements yet
  } else if (currentTool.value === 'distance') {
    measurements.value.push({
      type: 'distance',
      points: [...activePoints.value],
      value: calculateDistance(activePoints.value)
    })
    activePoints.value = []
    isDrawing.value = false
  } else if (currentTool.value === 'area') {
    // Area needs double click or close path?
    // For now let's assume double click logic or explicit close button?
    // Let's add a "close" logic if point is near start
    // Or just right click to finish?
  }
  draw()
}

// Area finish needs a trigger, maybe double click?
// Let's add double click handler to container if needed, or just a button.
// For simplicity, let's say clicking on the first point closes the polygon.

function confirmCalibration() {
  if (calibrationRealLength.value > 0) {
    scaleFactor.value = calibrationPixels.value / calibrationRealLength.value // px / m
    showCalibrationDialog.value = false
    activePoints.value = []
    isDrawing.value = false
    draw()
  }
}

function cancelCalibration() {
  showCalibrationDialog.value = false
  activePoints.value = []
  isDrawing.value = false
  draw()
}

// --- Calculation ---
function calculateDistance(points) {
  if (!scaleFactor.value) return 0
  const p1 = points[0]
  const p2 = points[1]
  const distPx = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  return distPx / scaleFactor.value
}

function calculateArea(points) {
  // Shoelace formula
  if (!scaleFactor.value || points.length < 3) return 0
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    area += points[i].x * points[j].y
    area -= points[j].x * points[i].y
  }
  const areaPx = Math.abs(area) / 2
  return areaPx / (scaleFactor.value * scaleFactor.value)
}

// --- Drawing ---
function draw(previewX, previewY) {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  // Draw existing measurements
  measurements.value.forEach(m => {
    drawMeasurement(ctx, m)
  })
  
  // Draw active drawing
  if (activePoints.value.length > 0) {
    ctx.beginPath()
    ctx.strokeStyle = '#e74c3c'
    ctx.lineWidth = 2 / zoomScale.value
    ctx.fillStyle = 'rgba(231, 76, 60, 0.2)'
    
    const start = activePoints.value[0]
    ctx.moveTo(start.x, start.y)
    
    activePoints.value.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
    
    if (previewX !== undefined) {
      ctx.lineTo(previewX, previewY)
    }
    
    if (currentTool.value === 'area') {
      ctx.fill()
    }
    ctx.stroke()
  }
}

function drawMeasurement(ctx, m) {
  ctx.beginPath()
  ctx.strokeStyle = '#2980b9'
  ctx.lineWidth = 2
  ctx.fillStyle = 'rgba(52, 152, 219, 0.2)'
  
  const start = m.points[0]
  ctx.moveTo(start.x, start.y)
  m.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
  
  if (m.type === 'area') {
    ctx.closePath()
    ctx.fill()
  }
  ctx.stroke()
  
  // Label
  // ...
}

function getIconForType(type) {
  if (type === 'distance') return '📏'
  if (type === 'area') return '📐'
  return '❓'
}

function formatValue(m) {
  if (m.type === 'distance') return m.value.toFixed(2) + ' m'
  if (m.type === 'area') return m.value.toFixed(2) + ' m²'
  return ''
}

function deleteMeasurement(idx) {
  measurements.value.splice(idx, 1)
  draw()
}

function resetScale() {
  scaleFactor.value = null
  measurements.value = [] // Clear measurements as they are invalid without scale? Or keep them but show warning?
  draw()
}

// Navigation
function nextPage() { if (page.value < pageCount.value) page.value++ }
function prevPage() { if (page.value > 1) page.value-- }
function zoomIn() { zoom(1.2, containerRef.value.clientWidth/2, containerRef.value.clientHeight/2) } // Center zoom
function zoomOut() { zoom(0.8, containerRef.value.clientWidth/2, containerRef.value.clientHeight/2) }

</script>

<style scoped>
.plan-viewer-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  background: #333;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.plan-viewer-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.content-area {
  width: 100%;
  height: 100%;
  cursor: grab;
}

.content-area:active {
  cursor: grabbing;
}

.canvas-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
}

.page-wrapper {
  position: relative;
  background: white;
  box-shadow: 0 0 20px rgba(0,0,0,0.5);
}

.drawing-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none; /* Let clicks pass to content-area handler */
}

.controls-overlay {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 1rem;
  background: rgba(44, 62, 80, 0.9);
  padding: 0.5rem 1rem;
  border-radius: 50px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.3);
  backdrop-filter: blur(5px);
  z-index: 100;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.separator {
  width: 1px;
  height: 20px;
  background: rgba(255,255,255,0.2);
  margin: 0 0.5rem;
}

.btn-tool, .btn-icon {
  background: transparent;
  border: none;
  color: white;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 50%;
  transition: all 0.2s;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-tool:hover, .btn-icon:hover {
  background: rgba(255,255,255,0.1);
}

.btn-tool.active {
  background: #3498db;
  color: white;
}

.page-display, .zoom-display {
  color: white;
  font-variant-numeric: tabular-nums;
  font-size: 0.9rem;
  min-width: 60px;
  text-align: center;
}

.measurements-panel {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 250px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  padding: 1rem;
  box-shadow: 0 4px 15px rgba(0,0,0,0.1);
  backdrop-filter: blur(5px);
  max-height: 80vh;
  overflow-y: auto;
}

.measurements-panel h3 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  color: #2c3e50;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.5rem;
}

.scale-info {
  font-size: 0.85rem;
  color: #27ae60;
  background: #e8f8f5;
  padding: 0.5rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.scale-warning {
  font-size: 0.85rem;
  color: #e67e22;
  background: #fef5e7;
  padding: 0.5rem;
  border-radius: 6px;
  margin-bottom: 1rem;
}

.measurement-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem;
  border-bottom: 1px solid #f1f1f1;
  font-size: 0.9rem;
}

.m-icon {
  margin-right: 0.5rem;
}

.btn-del {
  background: none;
  border: none;
  color: #e74c3c;
  cursor: pointer;
  font-weight: bold;
}

.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.modal-content {
  background: white;
  padding: 1.5rem;
  border-radius: 12px;
  width: 300px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.2);
}

.input-group {
  margin: 1rem 0;
}

.input-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  color: #666;
}

.input-group input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.modal-actions button {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-primary {
  background: #3498db;
  color: white;
}
</style>
