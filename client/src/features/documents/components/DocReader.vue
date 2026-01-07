<template>
  <div :class="['doc-reader-wrapper', { 'is-overlay': !isEmbedded }]">
    <div class="doc-reader-container" ref="containerRef">
      <!-- Content Area -->
      <div 
        class="content-area" 
        ref="contentArea"
        @touchstart="handleTouchStart"
        @touchmove="handleTouchMove"
        @touchend="handleTouchEnd"
        @click="toggleControls"
      >
        <div 
          class="canvas-wrapper" 
          :style="{ transform: `translate(${panX}px, ${panY}px) scale(${cssScale})`, transformOrigin: 'top center' }"
        >
          <div class="pages-container" :class="{ 'double-view': viewMode === 'double' }">
            <!-- Left Page (or Single Page) -->
            <div class="page-wrapper">
              <VuePdfEmbed
                ref="pdfRef"
                :source="src"
                :page="page"
                :scale="renderScale"
                @loaded="onPdfLoaded"
                @rendered="onPdfRendered"
                @loading-failed="onPdfError"
                class="pdf-layer"
              />
              <canvas
                ref="canvasRef"
                class="drawing-layer"
                :class="{ 'pointer-events-none': currentTool === 'cursor' }"
                @mousedown="(e) => startDrawing(e, page)"
                @mousemove="(e) => { draw(e, page); updatePreview(e); }"
                @mouseup="stopDrawing"
                @mouseleave="(e) => { stopDrawing(); hidePreview(); }"
                @mouseenter="updatePreview"
                @touchstart="(e) => startDrawing(e, page)"
                @touchmove="(e) => draw(e, page)"
                @touchend="stopDrawing"
                @touchmove.prevent
              ></canvas>
            </div>

            <!-- Right Page (only in double view and if not last page) -->
            <div 
              v-if="viewMode === 'double' && page + 1 <= pageCount" 
              class="page-wrapper right-page"
            >
              <VuePdfEmbed
                ref="pdfRefRight"
                :source="src"
                :page="page + 1"
                :scale="renderScale"
                @rendered="onPdfRenderedRight"
                class="pdf-layer"
              />
              <canvas
                ref="canvasRefRight"
                class="drawing-layer"
                :class="{ 'pointer-events-none': currentTool === 'cursor' }"
                @mousedown="(e) => startDrawing(e, page + 1)"
                @mousemove="(e) => { draw(e, page + 1); updatePreview(e); }"
                @mouseup="stopDrawing"
                @mouseleave="(e) => { stopDrawing(); hidePreview(); }"
                @mouseenter="updatePreview"
                @touchstart="(e) => startDrawing(e, page + 1)"
                @touchmove="(e) => draw(e, page + 1)"
                @touchend="stopDrawing"
                @touchmove.prevent
              ></canvas>
            </div>
          </div>
          
          <!-- Stamp Preview -->
          <div 
            v-if="currentTool === 'stamp' && selectedStampType && showPreview"
            class="stamp-preview"
            :style="previewStyle"
          >
             {{ previewText }}
          </div>
        </div>
      </div>

      <!-- Modern Search Bar -->
      <Transition name="slide-up-fade">
        <div v-show="showSearchBox" class="modern-search-bar">
          <div class="search-input-wrapper">
            <span class="search-icon">🔍</span>
            <input 
              ref="searchInputRef"
              v-model="searchQuery" 
              @keyup.enter="performSearch" 
              placeholder="Suchen..." 
              class="modern-input"
            />
            <span v-if="searchResults.length > 0" class="match-count">
              {{ currentMatchIndex + 1 }} / {{ searchResults.length }}
            </span>
            <button v-if="searchQuery" @click="clearSearch" class="btn-clear">✕</button>
          </div>
          <div class="search-actions">
            <button @click="prevMatch" class="btn-nav-modern" :disabled="searchResults.length === 0">↑</button>
            <button @click="nextMatch" class="btn-nav-modern" :disabled="searchResults.length === 0">↓</button>
            <button @click="closeSearch" class="btn-close-modern">Fertig</button>
          </div>
        </div>
      </Transition>

      <!-- Floating Bottom Controls -->
      <Transition name="slide-up">
        <div v-show="showControls" class="bottom-controls">
          <!-- Page Navigation -->
          <div class="control-group navigation">
            <button @click="prevPage" :disabled="page <= 1" class="btn-round">←</button>
            <span class="page-display">
              {{ viewMode === 'double' ? `${page}-${Math.min(page + 1, pageCount)}` : page }} / {{ pageCount }}
            </span>
            <button @click="nextPage" :disabled="page >= pageCount" class="btn-round">→</button>
          </div>

          <!-- Tools -->
          <div class="control-group tools">
            <button 
              @click="setTool('cursor')" 
              :class="{ active: currentTool === 'cursor' }" 
              class="btn-tool"
              title="Maus"
            >👆</button>
            <button 
              @click="setTool('pen')" 
              :class="{ active: currentTool === 'pen' }" 
              class="btn-tool"
              title="Stift"
            >✏️</button>
            <button 
              @click="setTool('highlighter')" 
              :class="{ active: currentTool === 'highlighter' }" 
              class="btn-tool"
              title="Textmarker"
            >🖍️</button>
            <div class="stamp-tool-wrapper">
              <button 
                @click="toggleStampMenu" 
                :class="{ active: currentTool === 'stamp' }" 
                class="btn-tool"
                title="Stempel"
              >🏷️</button>
              <Transition name="fade">
                <div v-if="showStampMenu" class="stamp-menu">
                  <button @click="selectStamp('vorabzug')" class="stamp-option vorabzug">Vorabzug</button>
                  <button @click="selectStamp('prototyp')" class="stamp-option prototyp">Prototyp</button>
                  <button @click="selectStamp('freigegeben')" class="stamp-option freigegeben">Freigegeben</button>
                </div>
              </Transition>
            </div>
            <button @click="clearPage" class="btn-tool" title="Seite leeren">🗑️</button>
            <button 
              @click="toggleSearch" 
              :class="{ active: showSearchBox }"
              class="btn-tool" 
              title="Suchen"
            >🔍</button>
          </div>

          <!-- View Options & Actions -->
          <div class="control-group actions">
            <button @click="toggleViewMode" class="btn-tool" title="Doppelseitig">
              {{ viewMode === 'double' ? '📄' : '📖' }}
            </button>
            <div class="separator"></div>
             <button @click="toggleFullscreen" class="btn-tool" title="Vollbild">
              {{ isFullscreen ? '⤓' : '⤢' }}
            </button>
            <button @click="saveDocument" class="btn-tool" title="Speichern">
              💾
            </button>
            <button @click="closeReader" class="btn-tool close-btn" title="Schließen">
              ✕
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick, computed } from 'vue'
import VuePdfEmbed from 'vue-pdf-embed'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import api from '@/services/api'

const props = defineProps({
  src: {
    type: [String, Object],
    required: true
  },
  title: {
    type: String,
    default: 'Dokument'
  },
  isEmbedded: {
    type: Boolean,
    default: false
  },
  docId: {
    type: [String, Number],
    default: null
  },
  saveEndpoint: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['close'])

// UI State
const showControls = ref(true)
const isFullscreen = ref(false)
const containerRef = ref(null)
const viewMode = ref('single') // 'single' | 'double'

// Search State
const showSearchBox = ref(false)
const searchQuery = ref('')
const searchResults = ref([]) // Array of { page, x, y, width, height, str }
const currentMatchIndex = ref(-1)
const searchPerformed = ref(false)
const searchInputRef = ref(null)
const pdfDoc = ref(null) // To store the PDF document proxy

// PDF State
const page = ref(1)
const pageCount = ref(1)
const scale = ref(1.0)
const cssScale = ref(1.0)
const renderScale = computed(() => scale.value)

const pdfWidth = ref(0)
const pdfHeight = ref(0)
const pdfRef = ref(null)
const pdfRefRight = ref(null) // Ref for right page

// Drawing State
const canvasRef = ref(null)
const canvasRefRight = ref(null) // Ref for right canvas
const currentTool = ref('cursor')
const isDrawing = ref(false)
const lastX = ref(0)
const lastY = ref(0)
const pageDrawings = ref({}) 
const showStampMenu = ref(false)
const selectedStampType = ref(null)
const showPreview = ref(false)
const previewX = ref(0)
const previewY = ref(0)

// Zoom & Pan State
const initialDistance = ref(0)
const initialCssScale = ref(1.0)
const isPinching = ref(false)
const panX = ref(0)
const panY = ref(0)
const isPanning = ref(false)
const lastPanX = ref(0)
const lastPanY = ref(0)
const startPanX = ref(0)
const startPanY = ref(0)

// Tools Config
const tools = {
  pen: { color: '#e74c3c', width: 2, globalCompositeOperation: 'source-over' },
  highlighter: { color: 'rgba(241, 196, 15, 0.5)', width: 20, globalCompositeOperation: 'source-over' },
  eraser: { color: '#000000', width: 20, globalCompositeOperation: 'destination-out' }
}

// Methods
const toggleControls = (e) => {
  // Don't toggle if clicking buttons, drawing, or interacting with search
  if (e.target.closest('button') || e.target.closest('.search-popup') || e.target.closest('.stamp-menu') || isDrawing.value || isPinching.value) return
  showControls.value = !showControls.value
}

const toggleSearch = () => {
  showSearchBox.value = !showSearchBox.value
  if (showSearchBox.value) {
    nextTick(() => {
      searchInputRef.value?.focus()
    })
  } else {
    // Clear search highlights when closing? Maybe optional.
    // searchResults.value = []
    // currentMatchIndex.value = -1
  }
}

const closeSearch = () => {
  showSearchBox.value = false
}

const clearSearch = () => {
  searchQuery.value = ''
  searchResults.value = []
  currentMatchIndex.value = -1
  searchPerformed.value = false
  if (pdfRef.value) onPdfRendered()
  if (pdfRefRight.value) onPdfRenderedRight()
  nextTick(() => searchInputRef.value?.focus())
}

const performSearch = async () => {
  if (!searchQuery.value || !pdfDoc.value) return
  
  searchResults.value = []
  currentMatchIndex.value = -1
  searchPerformed.value = true
  
  const query = searchQuery.value.toLowerCase()
  const numPages = pdfDoc.value.numPages
  
  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.value.getPage(i)
    const textContent = await page.getTextContent()
    const viewport = page.getViewport({ scale: 1.0 })
    
    textContent.items.forEach(item => {
      const text = item.str.toLowerCase()
      let startIndex = 0
      let index = text.indexOf(query, startIndex)
      
      while (index !== -1) {
        // Found a match in this item
        // Calculate approximate bounding box
        // item.transform: [scaleX, skewY, skewX, scaleY, x, y]
        const tx = item.transform
        const x = tx[4]
        const y = tx[5]
        const width = item.width
        const height = item.height || (Math.sqrt(tx[0]*tx[0] + tx[1]*tx[1])) // Approximate height from scale
        
        // Normalize coordinates (0-1 range relative to viewport)
        // PDF coordinates: (0,0) is bottom-left. Viewport: (0,0) is top-left.
        // We need to convert PDF coords to Viewport coords first.
        
        // Simple approximation: assume the match covers a portion of the item width
        // This is not perfect for variable width fonts but better than page highlight
        const charWidth = width / item.str.length
        const matchX = x + (index * charWidth)
        const matchWidth = query.length * charWidth
        
        // Convert to normalized coordinates (0-1)
        // Note: PDF y is from bottom, so we do (viewport.height - y) - height for top-left
        const normX = matchX / viewport.width
        const normY = (viewport.height - y - height) / viewport.height // y is baseline, so subtract height to get top
        const normW = matchWidth / viewport.width
        const normH = (height * 1.2) / viewport.height // Add a little padding
        
        searchResults.value.push({
          page: i,
          rect: { x: normX, y: normY, w: normW, h: normH }
        })
        
        startIndex = index + query.length
        index = text.indexOf(query, startIndex)
      }
    })
  }
  
  if (searchResults.value.length > 0) {
    currentMatchIndex.value = 0
    jumpToMatch(0)
  } else {
    // Force redraw to clear highlights if any
    if (pdfRef.value) onPdfRendered()
    if (pdfRefRight.value) onPdfRenderedRight()
  }
}

const nextMatch = () => {
  if (searchResults.value.length === 0) return
  currentMatchIndex.value = (currentMatchIndex.value + 1) % searchResults.value.length
  jumpToMatch(currentMatchIndex.value)
}

const prevMatch = () => {
  if (searchResults.value.length === 0) return
  currentMatchIndex.value = (currentMatchIndex.value - 1 + searchResults.value.length) % searchResults.value.length
  jumpToMatch(currentMatchIndex.value)
}

const jumpToMatch = (index) => {
  const match = searchResults.value[index]
  if (match) {
    page.value = match.page
    // If double view, ensure we see the page
    if (viewMode.value === 'double' && page.value % 2 === 0) {
      page.value = page.value - 1 // Show pair starting with odd
    }
  }
}

const toggleFullscreen = async () => {
  if (!document.fullscreenElement) {
    await containerRef.value.requestFullscreen()
    isFullscreen.value = true
  } else {
    await document.exitFullscreen()
    isFullscreen.value = false
  }
}

const closeReader = () => {
  if (props.isEmbedded) {
    window.close()
  } else {
    emit('close')
  }
}

const toggleViewMode = () => {
  viewMode.value = viewMode.value === 'single' ? 'double' : 'single'
  // Reset zoom when switching modes
  scale.value = 1.0
  cssScale.value = 1.0
  // If switching to double, ensure we are on an odd page (usually) or handle cover
  // For simplicity, we just stay on current page as start
}

const saveDocument = async () => {
  console.log('saveDocument called', { docId: props.docId, title: props.title })
  try {
    const element = document.querySelector('.pages-container')
    if (!element) {
      console.error('pages-container not found')
      return
    }

    // Temporarily remove transform to get clear capture
    const wrapper = document.querySelector('.canvas-wrapper')
    const originalTransform = wrapper.style.transform
    wrapper.style.transform = 'none'
    
    console.log('Starting html2canvas capture...')
    const canvas = await html2canvas(element, {
      scale: 2, // Higher quality
      useCORS: true,
      logging: true // Enable logging
    })
    console.log('html2canvas capture finished')
    
    // Restore transform
    wrapper.style.transform = originalTransform
    
    const imgData = canvas.toDataURL('image/jpeg', 0.9)
    const pdf = new jsPDF({
      orientation: viewMode.value === 'double' ? 'landscape' : 'portrait',
      unit: 'px',
      format: [canvas.width / 2, canvas.height / 2] // Adjust format to match capture
    })
    
    pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width / 2, canvas.height / 2)
    
    if (props.saveEndpoint || props.docId) {
      console.log('Saving to server...', props.saveEndpoint || props.docId)
      // Save to server
      const pdfBlob = pdf.output('blob')
      const formData = new FormData()
      formData.append('file', pdfBlob, `${props.title}.pdf`)
      
      const endpoint = props.saveEndpoint || `/library/save/${props.docId}`
      
      const res = await api.post(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      console.log('Server response:', res)
      alert('Dokument erfolgreich auf dem Server gespeichert!')
    } else {
       console.log('Downloading locally (no docId)...')
       // Download locally
       pdf.save(`${props.title}_signed.pdf`)
    }
    
  } catch (err) {
    console.error('Save failed', err)
    alert('Speichern fehlgeschlagen: ' + err.message)
  }
}

const onPdfLoaded = (pdf) => {
  console.log('PDF Loaded', pdf)
  pdfDoc.value = pdf
  pageCount.value = pdf.numPages
}

const onPdfError = (err) => {
  console.error('PDF Error', err)
  alert('Fehler beim Laden der PDF: ' + err)
}

const onPdfRendered = () => {
  const pdfEl = pdfRef.value.$el.querySelector('canvas') || pdfRef.value.$el.querySelector('img') || pdfRef.value.$el
  if (pdfEl) {
    pdfWidth.value = pdfEl.clientWidth
    pdfHeight.value = pdfEl.clientHeight
    
    const canvas = canvasRef.value
    if (canvas) {
      canvas.width = pdfEl.clientWidth
      canvas.height = pdfEl.clientHeight
      restoreDrawings(page.value, canvas)
    }
  }
}

const onPdfRenderedRight = () => {
  const pdfEl = pdfRefRight.value.$el.querySelector('canvas') || pdfRefRight.value.$el.querySelector('img') || pdfRefRight.value.$el
  if (pdfEl) {
    const canvas = canvasRefRight.value
    if (canvas) {
      canvas.width = pdfEl.clientWidth
      canvas.height = pdfEl.clientHeight
      restoreDrawings(page.value + 1, canvas)
    }
  }
}

const prevPage = () => {
  if (page.value > 1) {
    const step = viewMode.value === 'double' ? 2 : 1
    page.value = Math.max(1, page.value - step)
  }
}

const nextPage = () => {
  if (page.value < pageCount.value) {
    const step = viewMode.value === 'double' ? 2 : 1
    page.value = Math.min(pageCount.value, page.value + step)
  }
}

const setTool = (tool) => {
  currentTool.value = tool
  if (tool !== 'stamp') {
    showStampMenu.value = false
    selectedStampType.value = null
  }
}

const toggleStampMenu = () => {
  if (currentTool.value === 'stamp' && showStampMenu.value) {
    showStampMenu.value = false
  } else {
    currentTool.value = 'stamp'
    showStampMenu.value = true
  }
}

const selectStamp = (type) => {
  selectedStampType.value = type
  showStampMenu.value = false
  // Now the next click on canvas will place the stamp
}

// Touch Logic
const getDistance = (touches) => {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.sqrt(dx * dx + dy * dy)
}

const handleTouchStart = (e) => {
  if (e.touches.length === 2) {
    // Pinch Start
    isPinching.value = true
    isPanning.value = false
    initialDistance.value = getDistance(e.touches)
    initialCssScale.value = cssScale.value
    e.preventDefault()
  } else if (e.touches.length === 1 && currentTool.value === 'cursor') {
    // Pan Start
    isPanning.value = true
    isPinching.value = false
    startPanX.value = e.touches[0].clientX
    startPanY.value = e.touches[0].clientY
    lastPanX.value = panX.value
    lastPanY.value = panY.value
    // Don't prevent default immediately to allow potential clicks, 
    // but if we move, we will prevent default.
  }
}

const handleTouchMove = (e) => {
  if (isPinching.value && e.touches.length === 2) {
    // Pinch Move
    const currentDistance = getDistance(e.touches)
    const scaleFactor = currentDistance / initialDistance.value
    
    let newCssScale = initialCssScale.value * scaleFactor
    newCssScale = Math.max(0.5, Math.min(newCssScale, 3.0))
    
    cssScale.value = newCssScale
    e.preventDefault()
  } else if (isPanning.value && e.touches.length === 1) {
    // Pan Move
    const dx = e.touches[0].clientX - startPanX.value
    const dy = e.touches[0].clientY - startPanY.value
    
    panX.value = lastPanX.value + dx
    panY.value = lastPanY.value + dy
    e.preventDefault()
  }
}

const handleTouchEnd = (e) => {
  if (isPinching.value && e.touches.length < 2) {
    isPinching.value = false
  }
  if (isPanning.value && e.touches.length === 0) {
    isPanning.value = false
  }
}

// Drawing Logic
const getCoordinates = (e, canvas) => {
  const rect = canvas.getBoundingClientRect()
  const currentScale = cssScale.value
  
  let clientX, clientY
  if (e.touches) {
    clientX = e.touches[0].clientX
    clientY = e.touches[0].clientY
  } else {
    clientX = e.clientX
    clientY = e.clientY
  }
  
  return {
    x: (clientX - rect.left) / currentScale,
    y: (clientY - rect.top) / currentScale
  }
}

const startDrawing = (e, pageNum) => {
  if (isPinching.value) return
  if (e.type === 'touchstart') {
     if (e.touches.length > 1) return
     e.preventDefault() 
  }
  
  const canvas = pageNum === page.value ? canvasRef.value : canvasRefRight.value
  const { x, y } = getCoordinates(e, canvas)
  
  if (currentTool.value === 'stamp' && selectedStampType.value) {
    // Place Stamp
    if (!pageDrawings.value[pageNum]) {
      pageDrawings.value[pageNum] = []
    }
    
    const dateStr = new Date().toLocaleDateString('de-DE')
    let text = ''
    let color = ''
    let borderColor = ''
    
    if (selectedStampType.value === 'vorabzug') {
      text = `VORABZUG ${dateStr}`
      color = 'rgba(231, 76, 60, 0.2)'
      borderColor = '#c0392b'
    } else if (selectedStampType.value === 'prototyp') {
      text = 'PROTOTYP'
      color = 'rgba(241, 196, 15, 0.2)'
      borderColor = '#f39c12'
    } else if (selectedStampType.value === 'freigegeben') {
      text = `FREIGEGEBEN ${dateStr}`
      color = 'rgba(46, 204, 113, 0.2)'
      borderColor = '#27ae60'
    }
    
    pageDrawings.value[pageNum].push({
      tool: 'stamp',
      x: x / pdfWidth.value,
      y: y / pdfHeight.value,
      text: text,
      color: color,
      borderColor: borderColor,
      timestamp: Date.now()
    })
    
    // Redraw immediately
    restoreDrawings(pageNum, canvas)
    
    // Reset to cursor tool
    currentTool.value = 'cursor'
    showPreview.value = false
    selectedStampType.value = null
    
    return
  }
  
  if (currentTool.value === 'cursor') return

  isDrawing.value = true
  lastX.value = x
  lastY.value = y
  
  if (!pageDrawings.value[pageNum]) {
    pageDrawings.value[pageNum] = []
  }
  
  const toolConfig = tools[currentTool.value]
  pageDrawings.value[pageNum].push({
    tool: currentTool.value,
    points: [{ x: x / pdfWidth.value, y: y / pdfHeight.value }],
    color: toolConfig.color,
    width: toolConfig.width / scale.value
  })
}

const draw = (e, pageNum) => {
  if (!isDrawing.value || currentTool.value === 'cursor' || isPinching.value) return
  e.preventDefault()
  
  const canvas = pageNum === page.value ? canvasRef.value : canvasRefRight.value
  const { x, y } = getCoordinates(e, canvas)
  const ctx = canvas.getContext('2d')
  const toolConfig = tools[currentTool.value]
  
  ctx.beginPath()
  ctx.moveTo(lastX.value, lastY.value)
  ctx.lineTo(x, y)
  ctx.strokeStyle = toolConfig.color
  ctx.lineWidth = toolConfig.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalCompositeOperation = toolConfig.globalCompositeOperation
  ctx.stroke()
  
  const currentPath = pageDrawings.value[pageNum][pageDrawings.value[pageNum].length - 1]
  currentPath.points.push({ x: x / pdfWidth.value, y: y / pdfHeight.value })
  
  lastX.value = x
  lastY.value = y
}

const stopDrawing = () => {
  isDrawing.value = false
}

const clearPage = () => {
  // Clear both pages if in double view? Or just current?
  // Let's clear current visible pages
  pageDrawings.value[page.value] = []
  const canvas = canvasRef.value
  if(canvas) {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
  
  if (viewMode.value === 'double' && page.value + 1 <= pageCount.value) {
      pageDrawings.value[page.value + 1] = []
      const canvasR = canvasRefRight.value
      if(canvasR) {
          const ctxR = canvasR.getContext('2d')
          ctxR.clearRect(0, 0, canvasR.width, canvasR.height)
      }
  }
}

const saveDrawings = () => {
  // No-op
}

const drawHighlights = (pageNum, canvas) => {
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  
  // Draw all matches on this page
  searchResults.value.forEach((match, index) => {
    if (match.page === pageNum) {
      const isCurrent = index === currentMatchIndex.value
      
      const x = match.rect.x * canvas.width
      const y = match.rect.y * canvas.height
      const w = match.rect.w * canvas.width
      const h = match.rect.h * canvas.height
      
      ctx.save()
      ctx.fillStyle = isCurrent ? 'rgba(255, 165, 0, 0.5)' : 'rgba(255, 255, 0, 0.3)' // Orange for current, Yellow for others
      
      // Round rect for modern look
      ctx.beginPath()
      ctx.roundRect(x, y, w, h, 2)
      ctx.fill()
      
      if (isCurrent) {
        ctx.strokeStyle = '#e67e22'
        ctx.lineWidth = 1
        ctx.stroke()
      }
      
      ctx.restore()
    }
  })
}

const restoreDrawings = (pageNum, canvas) => {
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  // Draw Search Highlights (Background)
  drawHighlights(pageNum, canvas)
  
  const paths = pageDrawings.value[pageNum] || []
  
  paths.forEach(path => {
    if (path.tool === 'stamp') {
      // Draw Stamp
      const x = path.x * pdfWidth.value
      const y = path.y * pdfHeight.value
      
      ctx.save()
      ctx.translate(x, y)
      // ctx.rotate(-Math.PI / 6) // Rotate -30 degrees
      
      ctx.font = 'bold 24px Arial'
      const textMetrics = ctx.measureText(path.text)
      const padding = 10
      const w = textMetrics.width + padding * 2
      const h = 40
      
      // Draw Box
      ctx.fillStyle = path.color
      ctx.strokeStyle = path.borderColor
      ctx.lineWidth = 3
      
      ctx.beginPath()
      ctx.rect(-w/2, -h/2, w, h)
      ctx.fill()
      ctx.stroke()
      
      // Draw Text
      ctx.fillStyle = path.borderColor
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(path.text, 0, 0)
      
      ctx.restore()
      
    } else {
      if (path.points.length < 2) return
      
      const toolConfig = tools[path.tool]
      ctx.beginPath()
      ctx.strokeStyle = toolConfig.color
      ctx.lineWidth = toolConfig.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalCompositeOperation = toolConfig.globalCompositeOperation
      
      const startX = path.points[0].x * pdfWidth.value
      const startY = path.points[0].y * pdfHeight.value
      ctx.moveTo(startX, startY)
      
      for (let i = 1; i < path.points.length; i++) {
        const px = path.points[i].x * pdfWidth.value
        const py = path.points[i].y * pdfHeight.value
        ctx.lineTo(px, py)
      }
      ctx.stroke()
    }
  })
}

// Preview Logic
const updatePreview = (e) => {
  if (currentTool.value !== 'stamp' || !selectedStampType.value) {
    showPreview.value = false
    return
  }
  
  showPreview.value = true
  
  // We need coordinates relative to the canvas-wrapper
  // The event target might be the canvas, so we can use getCoordinates logic but adapted
  // Actually, since the preview is inside canvas-wrapper, we want coordinates relative to canvas-wrapper
  
  // e.target is likely the canvas
  const canvas = e.target
  const rect = canvas.getBoundingClientRect()
  
  // Calculate x,y relative to the canvas element (visual pixels)
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  const clientY = e.touches ? e.touches[0].clientY : e.clientY
  
  const x = clientX - rect.left
  const y = clientY - rect.top
  
  // Now we need to account for the fact that the canvas might be inside the wrapper
  // But wait, the preview is a sibling of pages-container inside canvas-wrapper.
  // The canvas-wrapper has the transform.
  // If we position absolute inside canvas-wrapper, 0,0 is top-left of wrapper.
  // The pages-container is also inside wrapper.
  
  // Let's try to get coordinates relative to the wrapper directly.
  const wrapper = document.querySelector('.canvas-wrapper')
  if (!wrapper) return
  const wrapperRect = wrapper.getBoundingClientRect()
  
  // Visual coordinates relative to wrapper
  const visualX = clientX - wrapperRect.left
  const visualY = clientY - wrapperRect.top
  
  // Unscale
  previewX.value = visualX / cssScale.value
  previewY.value = visualY / cssScale.value
}

const hidePreview = () => {
  showPreview.value = false
}

const previewText = computed(() => {
  const dateStr = new Date().toLocaleDateString('de-DE')
  if (selectedStampType.value === 'vorabzug') return `VORABZUG ${dateStr}`
  if (selectedStampType.value === 'prototyp') return 'PROTOTYP'
  if (selectedStampType.value === 'freigegeben') return `FREIGEGEBEN ${dateStr}`
  return ''
})

const previewStyle = computed(() => {
  let color = ''
  let borderColor = ''
  
  if (selectedStampType.value === 'vorabzug') {
    color = 'rgba(231, 76, 60, 0.2)'
    borderColor = '#c0392b'
  } else if (selectedStampType.value === 'prototyp') {
    color = 'rgba(241, 196, 15, 0.2)'
    borderColor = '#f39c12'
  } else if (selectedStampType.value === 'freigegeben') {
    color = 'rgba(46, 204, 113, 0.2)'
    borderColor = '#27ae60'
  }
  
  return {
    position: 'absolute',
    left: `${previewX.value}px`,
    top: `${previewY.value}px`,
    transform: 'translate(-50%, -50%)', // Center on mouse
    backgroundColor: color,
    border: `3px solid ${borderColor}`,
    color: borderColor,
    padding: '0 10px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '24px',
    fontFamily: 'Arial',
    pointerEvents: 'none', // Don't block clicks
    whiteSpace: 'nowrap',
    zIndex: 100
  }
})

watch(page, () => {
  // onPdfRendered handles it
})

// Watch for match change to redraw
watch(currentMatchIndex, () => {
  if (pdfRef.value) onPdfRendered()
  if (pdfRefRight.value) onPdfRenderedRight()
})

</script>

<style scoped>
/* Modern Search Bar */
.modern-search-bar {
  position: absolute;
  bottom: 5rem; /* Above toolbar */
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  padding: 0.5rem;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  z-index: 50;
  border: 1px solid rgba(255,255,255,0.2);
  min-width: 320px;
}

.search-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  background: #f5f5f5;
  border-radius: 10px;
  padding: 0.4rem 0.8rem;
  gap: 0.5rem;
}

.search-icon {
  font-size: 1rem;
  opacity: 0.5;
}

.modern-input {
  border: none;
  background: transparent;
  width: 100%;
  font-size: 0.95rem;
  color: #333;
}

.modern-input:focus {
  outline: none;
}

.match-count {
  font-size: 0.8rem;
  color: #888;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.btn-clear {
  background: #ddd;
  border: none;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  font-size: 0.7rem;
  color: #555;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-actions {
  display: flex;
  gap: 0.3rem;
}

.btn-nav-modern {
  background: white;
  border: 1px solid #eee;
  border-radius: 8px;
  width: 32px;
  height: 32px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
  transition: all 0.2s;
}

.btn-nav-modern:hover:not(:disabled) {
  background: #f0f0f0;
  color: #333;
}

.btn-nav-modern:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-close-modern {
  background: #333;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 0 0.8rem;
  height: 32px;
  font-size: 0.85rem;
  cursor: pointer;
  margin-left: 0.2rem;
}

.btn-close-modern:hover {
  background: #000;
}

.slide-up-fade-enter-active,
.slide-up-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-up-fade-enter-from,
.slide-up-fade-leave-to {
  transform: translate(-50%, 20px);
  opacity: 0;
}

.doc-reader-wrapper.is-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.8);
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
}

.doc-reader-wrapper:not(.is-overlay) {
  width: 100%;
  height: 100%;
}

.doc-reader-container {
  width: 95vw;
  height: 95vh;
  background: #f5f5f5;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.doc-reader-wrapper:not(.is-overlay) .doc-reader-container {
  width: 100%;
  height: 100%;
  border-radius: 0;
}

/* Minimal Top Bar */
.top-bar {
  height: 50px;
  background: white;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 1rem;
  z-index: 20;
}

.title {
  font-weight: 600;
  color: #2c3e50;
  font-size: 0.9rem;
}

.right-actions {
  display: flex;
  gap: 0.5rem;
}

/* Content Area */
.content-area {
  flex: 1;
  overflow: auto;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2rem;
  background: #525659;
  touch-action: none;
}

.canvas-wrapper {
  position: relative;
  transform-origin: center top;
  display: inline-block;
  /* Remove background and shadow from wrapper as container has it now */
  background: transparent;
  box-shadow: none;
}

.pages-container {
  display: flex;
  background: white;
  box-shadow: 0 4px 15px rgba(0,0,0,0.3);
}

.page-wrapper {
  position: relative;
}

.double-view .page-wrapper:first-child {
  border-right: 1px solid #e0e0e0;
}

.pdf-layer {
  display: block;
}

.drawing-layer {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
  cursor: crosshair;
}

.drawing-layer.pointer-events-none {
  pointer-events: none;
}

/* Floating Bottom Controls */
.bottom-controls {
  position: absolute;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  background: white;
  padding: 0.5rem 1rem;
  border-radius: 50px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  display: flex;
  gap: 1rem;
  align-items: center;
  z-index: 20;
  white-space: nowrap;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.navigation {
  border-right: 1px solid #eee;
  padding-right: 1rem;
}

.tools {
  border-right: 1px solid #eee;
  padding-right: 1rem;
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.separator {
  width: 1px;
  height: 24px;
  background: #eee;
  margin: 0 0.5rem;
}

.btn-icon {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 4px;
  color: #555;
}

.btn-icon:hover {
  background: #f0f0f0;
}

.btn-round {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid #ddd;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-round:hover:not(:disabled) {
  background: #f0f0f0;
}

.btn-round:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-display {
  font-variant-numeric: tabular-nums;
  font-size: 0.9rem;
  color: #555;
  min-width: 60px;
  text-align: center;
}

.btn-tool {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-tool:hover {
  background: #f0f0f0;
}

.btn-tool.active {
  background: #e1f5fe;
  color: #3498db;
}

.close-btn {
  color: #e74c3c;
}

.close-btn:hover {
  background: #fce4ec;
}

/* Animations */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translate(-50%, 100%);
  opacity: 0;
}

@media (max-width: 768px) {
  .bottom-controls {
    width: 90%;
    flex-wrap: wrap;
    justify-content: center;
    border-radius: 20px;
    bottom: 1rem;
    gap: 0.5rem;
  }
  
  .navigation, .tools {
    border-right: none;
    padding-right: 0;
  }
}

.stamp-tool-wrapper {
  position: relative;
}

.stamp-menu {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.2);
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  z-index: 60;
}

.stamp-option {
  border: 1px solid #eee;
  background: white;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  font-size: 0.8rem;
  white-space: nowrap;
  transition: all 0.2s;
}

.stamp-option:hover {
  transform: scale(1.05);
}

.stamp-option.vorabzug {
  color: #c0392b;
  border-color: #c0392b;
  background: rgba(231, 76, 60, 0.1);
}

.stamp-option.prototyp {
  color: #f39c12;
  border-color: #f39c12;
  background: rgba(241, 196, 15, 0.1);
}

.stamp-option.freigegeben {
  color: #27ae60;
  border-color: #27ae60;
  background: rgba(46, 204, 113, 0.1);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
