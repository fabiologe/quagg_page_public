import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useBridgeStore } from '../stores/useBridgeStore.js'
import { useBridgeHydraulics } from './useBridgeHydraulics.js'
import { useBridgeRenderer } from './useBridgeRenderer.js'

export const LAYERS = [
  { id: 'terrain', label: 'Gelände', color: '#374151', hint: 'Gerinnesohlprofil zeichnen' },
  { id: 'buk',     label: 'BUK',     color: '#d97706', hint: 'Brückenunterkante zeichnen' },
  { id: 'bok',     label: 'BOK',     color: '#7c3aed', hint: 'Brückenoberkante zeichnen' },
]

export function useProfileInteraction() {
  const store = useBridgeStore()
  const { interpZ } = useBridgeHydraulics()
  const { buildZ1SegmentData } = useBridgeRenderer()

  // ─── Template refs ─────────────────────────────────────────────────────────
  const svgEl          = ref(null)
  const svgContainerEl = ref(null)

  // ─── Layer selection ───────────────────────────────────────────────────────
  const activeLayer     = ref('terrain')
  const activeLayerMeta = computed(() => LAYERS.find(l => l.id === activeLayer.value))

  function getLayerPoints(layerId) {
    if (layerId === 'terrain') return store.terrainPoints
    if (layerId === 'buk')     return store.bukProfile
    return store.bokProfile
  }

  // ─── SVG dimensions ────────────────────────────────────────────────────────
  const svgW = ref(620)
  const svgH = ref(400)
  const PAD  = { left: 52, right: 78, top: 22, bottom: 46 }
  const plotW = computed(() => svgW.value - PAD.left - PAD.right)
  const plotH = computed(() => svgH.value - PAD.top  - PAD.bottom)

  // ─── World bounds ──────────────────────────────────────────────────────────
  const worldMaxH = computed(() => {
    const allZ = [
      ...store.terrainPoints.map(p => p.z),
      ...store.bukProfile.map(p => p.z),
      ...store.bokProfile.map(p => p.z),
      store.wsp,
    ]
    return Math.max(...allZ) * 1.25 + 1
  })

  const worldHalfW = computed(() => {
    const allX = [
      ...store.terrainPoints.map(p => Math.abs(p.x)),
      ...store.bukProfile.map(p => Math.abs(p.x)),
      ...store.bokProfile.map(p => Math.abs(p.x)),
    ]
    return (allX.length ? Math.max(...allX) : 20) + 3
  })

  // ─── Viewport (Pan / Zoom) ─────────────────────────────────────────────────
  const vMinX   = ref(null)
  const vWidth  = ref(null)
  const vMinZ   = ref(null)
  const vHeight = ref(null)

  const vX0 = computed(() => vMinX.value   ?? -worldHalfW.value)
  const vW  = computed(() => vWidth.value  ?? 2 * worldHalfW.value)
  const vZ0 = computed(() => vMinZ.value   ?? 0)
  const vH  = computed(() => vHeight.value ?? worldMaxH.value)

  const zoomLevel = computed(() =>
    vWidth.value == null ? 1 : (2 * worldHalfW.value) / vWidth.value
  )

  function resetView() {
    vMinX.value = vWidth.value = vMinZ.value = vHeight.value = null
  }

  // ─── Coordinate transforms ─────────────────────────────────────────────────
  function wx(worldX) { return PAD.left + (worldX - vX0.value) / vW.value * plotW.value }
  function wy(worldZ) { return PAD.top  + plotH.value - (worldZ - vZ0.value) / vH.value * plotH.value }
  function toWorldX(sx) { return vX0.value + (sx - PAD.left)              / plotW.value * vW.value }
  function toWorldZ(sy) { return vZ0.value + (PAD.top + plotH.value - sy) / plotH.value * vH.value }

  // ─── Grid lines ────────────────────────────────────────────────────────────
  const gridH = computed(() => {
    const h = vH.value, z0 = vZ0.value
    const step = h > 20 ? 5 : h > 10 ? 2 : h > 4 ? 1 : h > 1.5 ? 0.5 : 0.1
    const lines = []
    for (let z = Math.floor(z0 / step) * step; z <= z0 + h + 0.001; z = +(z + step).toFixed(6)) {
      const sy = wy(z)
      if (sy >= PAD.top - 1 && sy <= PAD.top + plotH.value + 1)
        lines.push({ z, sy, label: Number.isInteger(z) ? z.toFixed(0) : z.toFixed(1) })
    }
    return lines
  })

  const gridV = computed(() => {
    const w = vW.value, x0 = vX0.value
    const step = w > 100 ? 20 : w > 40 ? 10 : w > 20 ? 5 : w > 8 ? 2 : 1
    const lines = []
    for (let x = Math.floor(x0 / step) * step; x <= x0 + w + 0.001; x = +(x + step).toFixed(6)) {
      const sx = wx(x)
      if (sx >= PAD.left - 1 && sx <= PAD.left + plotW.value + 1)
        lines.push({ x, sx, label: x.toFixed(0) })
    }
    return lines
  })

  // ─── Visual clamped profiles ───────────────────────────────────────────────
  const bukDrawPts = computed(() => {
    const terrain = store.terrainPoints
    if (terrain.length < 2) return store.bukProfile
    return store.bukProfile.map(p => ({ x: p.x, z: Math.max(p.z, interpZ(terrain, p.x)) }))
  })

  const bokDrawPts = computed(() => {
    const buk = bukDrawPts.value
    if (buk.length < 2) return store.bokProfile
    return store.bokProfile.map(p => ({ x: p.x, z: Math.max(p.z, interpZ(buk, p.x)) }))
  })

  // ─── Zone-1 segments (needed for hover detection) ──────────────────────────
  const z1Segments = computed(() =>
    buildZ1SegmentData(
      store.terrainPoints,
      store.bukProfile.length >= 2 ? store.bukProfile : null,
      store.bokProfile.length >= 2 ? store.bokProfile : null,
      store.wsp,
    )
  )

  // ─── Drag / interaction state ──────────────────────────────────────────────
  const dragState   = ref(null)
  const hoverSegIdx = ref(null)
  const mouseSvgPos = ref(null)
  const clickedSeg  = ref(null)
  let clickWasDrag  = false

  function getSvgPos(e) {
    const svg = svgEl.value
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / rect.width  * svgW.value,
      y: (e.clientY - rect.top)  / rect.height * svgH.value,
    }
  }

  // ─── Zoom per scroll wheel ─────────────────────────────────────────────────
  function onWheel(e) {
    e.preventDefault()
    const pos = getSvgPos(e)
    if (!pos || pos.x < PAD.left || pos.x > PAD.left + plotW.value ||
                pos.y < PAD.top  || pos.y > PAD.top  + plotH.value) return

    const factor = e.deltaY > 0 ? 1.18 : 1 / 1.18
    const curX0 = vX0.value, curW = vW.value
    const curZ0 = vZ0.value, curH = vH.value

    const fixX = curX0 + (pos.x - PAD.left)              / plotW.value * curW
    const fixZ = curZ0 + (PAD.top + plotH.value - pos.y)  / plotH.value * curH

    const newW = curW * factor
    const newH = curH * factor
    vWidth.value  = newW
    vHeight.value = newH
    vMinX.value   = fixX - (pos.x - PAD.left)             / plotW.value * newW
    vMinZ.value   = fixZ - (PAD.top + plotH.value - pos.y) / plotH.value * newH
  }

  // ─── Drag initiators ───────────────────────────────────────────────────────
  function startDragWSP(e) {
    e.preventDefault()
    dragState.value = { type: 'wsp' }
    clickWasDrag = false
  }

  function startDragPoint(e, layerId, index) {
    e.preventDefault()
    dragState.value = { type: 'point', layer: layerId, index }
    clickWasDrag = false
  }

  function startDragKstBound(e, zoneId, side) {
    e.preventDefault()
    dragState.value = { type: 'kst-bound', zoneId, side }
    clickWasDrag = true
  }

  // ─── SVG mouse events ──────────────────────────────────────────────────────
  function onSvgMouseDown(e) {
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
      e.preventDefault()
      dragState.value = {
        type: 'pan',
        startClientX: e.clientX, startClientY: e.clientY,
        startX0: vX0.value,      startZ0: vZ0.value,
      }
      clickWasDrag = true
      return
    }
    clickWasDrag = false
  }

  function updateHoverSegment(pos) {
    if (pos.x < PAD.left || pos.x > PAD.left + plotW.value ||
        pos.y < PAD.top  || pos.y > PAD.top  + plotH.value) {
      hoverSegIdx.value = null; return
    }
    const wx_ = toWorldX(pos.x)
    const wz_ = toWorldZ(pos.y)
    const segs = z1Segments.value
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]
      if (wx_ < seg.xLeft - 0.02 || wx_ > seg.xRight + 0.02) continue
      const verts = seg.vertices
      for (let j = 0; j < verts.length - 1; j++) {
        const v1 = verts[j], v2 = verts[j + 1]
        if (wx_ >= v1.x && wx_ <= v2.x) {
          const t = (v2.x - v1.x) > 1e-9 ? (wx_ - v1.x) / (v2.x - v1.x) : 0
          const zBot = v1.zBot + t * (v2.zBot - v1.zBot)
          const zTop = v1.zTop + t * (v2.zTop - v1.zTop)
          if (wz_ >= zBot - 0.05 && wz_ <= zTop + 0.05) { hoverSegIdx.value = i; return }
          break
        }
      }
    }
    hoverSegIdx.value = null
  }

  function onSvgMouseMove(e) {
    const pos = getSvgPos(e)
    if (pos) mouseSvgPos.value = pos

    if (!dragState.value) {
      if (pos) updateHoverSegment(pos)
      return
    }
    clickWasDrag = true
    if (!pos) return

    const ds = dragState.value
    if (ds.type === 'pan') {
      const svg = svgEl.value
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const dSvgX = (e.clientX - ds.startClientX) / rect.width  * svgW.value
      const dSvgY = (e.clientY - ds.startClientY) / rect.height * svgH.value
      vMinX.value = ds.startX0 - dSvgX / plotW.value * vW.value
      vMinZ.value = ds.startZ0 + dSvgY / plotH.value * vH.value
    } else if (ds.type === 'wsp') {
      const z = toWorldZ(pos.y)
      store.wsp = Math.round(Math.max(0.01, Math.min(vZ0.value + vH.value * 0.97, z)) / 0.01) * 0.01
      store.save()
    } else if (ds.type === 'point') {
      const { layer, index } = ds
      const wx_ = Math.round(toWorldX(pos.x) * 100) / 100
      let wz = Math.round(Math.max(0, toWorldZ(pos.y)) * 100) / 100
      if (layer === 'buk' && store.terrainPoints.length >= 2)
        wz = Math.max(wz, Math.round(interpZ(store.terrainPoints, wx_) * 100) / 100)
      else if (layer === 'bok' && bukDrawPts.value.length >= 2)
        wz = Math.max(wz, Math.round(interpZ(bukDrawPts.value, wx_) * 100) / 100)
      store.movePoint(layer, index, { x: wx_, z: wz })
      const pts = getLayerPoints(layer)
      const newIdx = pts.findIndex(p => p.x === wx_ && p.z === wz)
      if (newIdx >= 0) ds.index = newIdx
    } else if (ds.type === 'kst-bound') {
      const { zoneId, side } = ds
      const xWorld = Math.round(toWorldX(pos.x) * 100) / 100
      const zone = store.kstZones.find(z => z.id === zoneId)
      if (!zone) return
      if (side === 'left') {
        store.updateKstZone(zoneId, { xLeft: Math.min(xWorld, zone.xRight != null ? zone.xRight - 0.1 : Infinity) })
      } else {
        store.updateKstZone(zoneId, { xRight: Math.max(xWorld, zone.xLeft  != null ? zone.xLeft  + 0.1 : -Infinity) })
      }
      store.save()
    }
  }

  function endDrag() {
    dragState.value   = null
    hoverSegIdx.value = null
    mouseSvgPos.value = null
  }

  function onSvgClick(e) {
    if (clickWasDrag) { clickWasDrag = false; return }
    if (e.target.tagName === 'circle') return

    const pos = getSvgPos(e)
    if (!pos) return
    if (pos.x < PAD.left || pos.x > PAD.left + plotW.value ||
        pos.y < PAD.top  || pos.y > PAD.top  + plotH.value) return

    if (hoverSegIdx.value !== null) {
      const seg = z1Segments.value[hoverSegIdx.value]
      if (seg) { clickedSeg.value = clickedSeg.value === seg ? null : seg; return }
    }

    clickedSeg.value = null
    const wx_ = Math.round(toWorldX(pos.x) * 100) / 100
    let wz = Math.round(Math.max(0, toWorldZ(pos.y)) * 100) / 100
    if (activeLayer.value === 'buk' && store.terrainPoints.length >= 2)
      wz = Math.max(wz, Math.round(interpZ(store.terrainPoints, wx_) * 100) / 100)
    else if (activeLayer.value === 'bok' && bukDrawPts.value.length >= 2)
      wz = Math.max(wz, Math.round(interpZ(bukDrawPts.value, wx_) * 100) / 100)
    store.addPoint(activeLayer.value, { x: wx_, z: wz })
  }

  function onSvgRightClick(e) {
    const pos = getSvgPos(e)
    if (!pos) return
    const layerPts = getLayerPoints(activeLayer.value)
    let nearestIdx = -1, minDist = 20
    layerPts.forEach((pt, i) => {
      const d = Math.hypot(wx(pt.x) - pos.x, wy(pt.z) - pos.y)
      if (d < minDist) { minDist = d; nearestIdx = i }
    })
    if (nearestIdx >= 0) store.deletePoint(activeLayer.value, nearestIdx)
  }

  // ─── Window mode ──────────────────────────────────────────────────────────
  const isExpanded = ref(false)
  const winX = ref(80),  winY = ref(80)
  const winW = ref(960), winH = ref(680)

  const windowStyle = computed(() => !isExpanded.value ? {} : ({
    left: winX.value + 'px', top:  winY.value + 'px',
    width: winW.value + 'px', height: winH.value + 'px',
  }))

  let _winDragOrigin  = null
  let _winResizeState = null
  let _resizeObserver = null

  function openWindow() {
    winX.value = Math.max(20, Math.round((window.innerWidth  - winW.value) / 2))
    winY.value = Math.max(20, Math.round((window.innerHeight - winH.value) / 2))
    isExpanded.value = true
    nextTick(() => {
      if (!svgContainerEl.value || !window.ResizeObserver) return
      _resizeObserver = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect
        if (width > 300 && height > 150) {
          svgW.value = Math.round(width)
          svgH.value = Math.round(height)
        }
      })
      _resizeObserver.observe(svgContainerEl.value)
    })
  }

  function collapseWindow() {
    isExpanded.value = false
    if (_resizeObserver) { _resizeObserver.disconnect(); _resizeObserver = null }
    svgW.value = 620
    svgH.value = 400
  }

  function toggleExpand() { isExpanded.value ? collapseWindow() : openWindow() }

  function startWinDrag(e) {
    if (e.target.closest('button')) return
    e.preventDefault()
    _winDragOrigin = { ex: e.clientX, ey: e.clientY, wx: winX.value, wy: winY.value }
    document.addEventListener('mousemove', _onWinDragMove)
    document.addEventListener('mouseup', _stopWinDrag, { once: true })
  }
  function _onWinDragMove(e) {
    if (!_winDragOrigin) return
    winX.value = Math.max(0, _winDragOrigin.wx + e.clientX - _winDragOrigin.ex)
    winY.value = Math.max(0, _winDragOrigin.wy + e.clientY - _winDragOrigin.ey)
  }
  function _stopWinDrag() {
    _winDragOrigin = null
    document.removeEventListener('mousemove', _onWinDragMove)
  }

  function startWinResize(e, dir) {
    e.preventDefault()
    _winResizeState = { dir, ex: e.clientX, ey: e.clientY,
      wx: winX.value, wy: winY.value, ww: winW.value, wh: winH.value }
    document.addEventListener('mousemove', _onWinResizeMove)
    document.addEventListener('mouseup', _stopWinResize, { once: true })
  }
  function _onWinResizeMove(e) {
    if (!_winResizeState) return
    const { dir, ex, ey, wx: ox, wy: oy, ww: ow, wh: oh } = _winResizeState
    const dx = e.clientX - ex, dy = e.clientY - ey
    const MIN_W = 520, MIN_H = 380
    let nx = ox, ny = oy, nw = ow, nh = oh
    if (dir.includes('e')) nw = Math.max(MIN_W, ow + dx)
    if (dir.includes('s')) nh = Math.max(MIN_H, oh + dy)
    if (dir.includes('w')) { nw = Math.max(MIN_W, ow - dx); nx = ox + ow - nw }
    if (dir.includes('n')) { nh = Math.max(MIN_H, oh - dy); ny = oy + oh - nh }
    winX.value = nx; winY.value = ny
    winW.value = nw; winH.value = nh
  }
  function _stopWinResize() {
    _winResizeState = null
    document.removeEventListener('mousemove', _onWinResizeMove)
  }

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────
  function onKeyDown(e) {
    if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); store.undo() }
    if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); store.redo() }
    if (e.key === 'Escape' && isExpanded.value) collapseWindow()
  }

  onMounted(()  => window.addEventListener('keydown', onKeyDown))
  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown)
    if (_resizeObserver) _resizeObserver.disconnect()
    document.removeEventListener('mousemove', _onWinDragMove)
    document.removeEventListener('mousemove', _onWinResizeMove)
  })

  return {
    // Template refs
    svgEl, svgContainerEl,
    // SVG dimensions
    svgW, svgH, PAD, plotW, plotH,
    // Viewport
    vX0, vW, vZ0, vH, zoomLevel, worldHalfW, resetView,
    // Transforms
    wx, wy, toWorldX, toWorldZ,
    // Grid
    gridH, gridV,
    // Layer
    LAYERS, activeLayer, activeLayerMeta, getLayerPoints,
    // Profile data
    bukDrawPts, bokDrawPts, z1Segments,
    // Interaction state
    dragState, hoverSegIdx, mouseSvgPos, clickedSeg,
    // SVG event handlers
    onWheel, onSvgMouseDown, onSvgMouseMove, endDrag, onSvgClick, onSvgRightClick,
    startDragWSP, startDragPoint, startDragKstBound,
    // Window mode
    isExpanded, windowStyle, toggleExpand, collapseWindow, startWinDrag, startWinResize,
  }
}
