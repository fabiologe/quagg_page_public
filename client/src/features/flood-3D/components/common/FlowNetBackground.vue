<template>
  <canvas ref="canvas" class="f3d-flownet" aria-hidden="true"></canvas>
</template>

<script setup>
// Animiertes Strömungsnetz: ein regelmäßiges Gitter wird um unsichtbare,
// langsam driftende Kreis-„Pfeiler" herumgebogen — wie ein Potenzialnetz
// um Brückenpfeiler. Linien werden heller, wo das Netz sich staucht
// (Kompression), genau wie in der Vorlage. Reines Canvas-2D, kein WebGL.
import { onBeforeUnmount, onMounted, ref } from 'vue'

const canvas = ref(null)
let ctx = null
let rafId = 0
let running = true
let obstacles = []
let W = 0
let H = 0
let dpr = 1
let resizeObs = null

const N_LINES = 40            // Gitterlinien je Richtung
const SAMPLES = 76            // Stützstellen je Linie

// Der Cursor ist ein zusätzlicher Pfeiler: Position folgt der Maus mit
// Nachlauf, der Radius wächst beim Betreten weich an und schrumpft beim
// Verlassen wieder auf null.
const cursor = { x: 0, y: 0, tx: 0, ty: 0, strength: 0, active: false }
let cursorR = 0

function makeObstacles() {
  const n = 6
  obstacles = [...Array(n)].map((_, i) => ({
    // Ankerpunkt + Lissajous-Drift, Radien relativ zur kleineren Kante
    ax: 0.1 + 0.8 * ((i * 0.61803) % 1),
    ay: 0.1 + 0.8 * ((i * 0.38196 + 0.21) % 1),
    r: 0.09 + 0.07 * ((i * 0.734) % 1),
    speed: 0.05 + 0.035 * ((i * 0.271) % 1),
    phase: i * 2.399,
  }))
}

function warp(x, y, t) {
  // sanfte Grundwelle
  let px = x + 0.012 * W * Math.sin(2.3 * (y / H) * Math.PI + t * 0.25)
  let py = y + 0.012 * H * Math.sin(2.1 * (x / W) * Math.PI + t * 0.21)
  const s = Math.min(W, H)
  for (const o of obstacles) {
    const cx = (o.ax + 0.05 * Math.sin(t * o.speed + o.phase)) * W
    const cy = (o.ay + 0.05 * Math.cos(t * o.speed * 1.3 + o.phase)) * H
    const r = o.r * s * (1 + 0.06 * Math.sin(t * 0.4 + o.phase))
    const R = r * 3.2                       // Einflussradius
    const dx = px - cx
    const dy = py - cy
    const d = Math.hypot(dx, dy)
    if (d < R && d > 1e-6) {
      // [0, R] -> [r, R]: Punkte nahe dem Zentrum auf den Kreisrand schieben
      const nd = r + (R - r) * Math.pow(d / R, 1.6)
      const f = nd / d
      px = cx + dx * f
      py = cy + dy * f
    }
  }
  if (cursorR > 0.5) {
    const dx = px - cursor.x
    const dy = py - cursor.y
    const d = Math.hypot(dx, dy)
    const R = cursorR * 3.2
    if (d < R && d > 1e-6) {
      const nd = cursorR + (R - cursorR) * Math.pow(d / R, 1.6)
      const f = nd / d
      px = cursor.x + dx * f
      py = cursor.y + dy * f
    }
  }
  return [px, py]
}

function drawLine(points, t) {
  // Helligkeit aus lokaler Stauchung: kürzere Segmente = dichteres Netz
  const base = Math.min(W, H) / SAMPLES
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    const len = Math.hypot(x1 - x0, y1 - y0)
    const squeeze = Math.min(Math.max(base / (len + 1e-3), 0.4), 3.2)
    const alpha = 0.11 + 0.17 * (squeeze - 0.4)
    ctx.strokeStyle = `rgba(212, 228, 255, ${Math.min(alpha, 0.6)})`
    ctx.lineWidth = squeeze > 1.6 ? 1.3 : 0.8
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }
}

function frame(now) {
  if (!running || !ctx) return
  const t = now / 1000
  // Cursor-Pfeiler nachführen: solange er unsichtbar ist, direkt springen
  if (cursor.strength < 0.02) {
    cursor.x = cursor.tx
    cursor.y = cursor.ty
  }
  cursor.x += (cursor.tx - cursor.x) * 0.14
  cursor.y += (cursor.ty - cursor.y) * 0.14
  cursor.strength += ((cursor.active ? 1 : 0) - cursor.strength) * 0.07
  cursorR = cursor.strength * 0.085 * Math.min(W, H)

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)

  const margin = 0.06
  for (let li = 0; li < N_LINES; li++) {
    const v = (-margin) + (li / (N_LINES - 1)) * (1 + 2 * margin)
    const horiz = []
    const vert = []
    for (let si = 0; si < SAMPLES; si++) {
      const u = (-margin) + (si / (SAMPLES - 1)) * (1 + 2 * margin)
      horiz.push(warp(u * W, v * H, t))
      vert.push(warp(v * W, u * H, t))
    }
    drawLine(horiz, t)
    drawLine(vert, t)
  }
  rafId = requestAnimationFrame(frame)
}

onMounted(() => {
  ctx = canvas.value.getContext('2d')
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = canvas.value.clientWidth
    H = canvas.value.clientHeight
    canvas.value.width = W * dpr
    canvas.value.height = H * dpr
  }
  resizeObs = new ResizeObserver(resize)
  resizeObs.observe(canvas.value)
  resize()
  makeObstacles()

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    running = false
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    frameOnce()
  } else {
    rafId = requestAnimationFrame(frame)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerout', onPointerOut)
    window.addEventListener('blur', onWindowBlur)
  }
  document.addEventListener('visibilitychange', onVisibility)
})

function onPointerMove(e) {
  const rect = canvas.value?.getBoundingClientRect()
  if (!rect) return
  cursor.tx = e.clientX - rect.left
  cursor.ty = e.clientY - rect.top
  cursor.active = cursor.tx >= 0 && cursor.ty >= 0
    && cursor.tx <= rect.width && cursor.ty <= rect.height
}

function onPointerOut(e) {
  if (!e.relatedTarget) cursor.active = false   // Fenster verlassen
}

function onWindowBlur() {
  cursor.active = false
}

function frameOnce() {
  const wasRunning = running
  running = true
  frame(performance.now())
  cancelAnimationFrame(rafId)
  running = wasRunning
}

function onVisibility() {
  if (document.hidden) {
    cancelAnimationFrame(rafId)
  } else if (running) {
    rafId = requestAnimationFrame(frame)
  }
}

onBeforeUnmount(() => {
  running = false
  cancelAnimationFrame(rafId)
  resizeObs?.disconnect()
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerout', onPointerOut)
  window.removeEventListener('blur', onWindowBlur)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<style scoped>
.f3d-flownet {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
</style>
